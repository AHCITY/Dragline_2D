'use strict';

/*
 * ─── Redline 2D — Driver Profile ───────────────────────────────────────
 *
 * A small, scalable player-identity layer that sits on top of the save
 * system. It answers "WHO is racing?" — separate from "WHAT do they own?"
 * (cash, cars and saves stay on the device and NEVER touch the cloud).
 *
 * Design rules (researched for this scale):
 *  1. LOCAL-FIRST — the device copy is the single source of truth at
 *     runtime. The Firebase mirror is a background debounce that must
 *     never block gameplay or menus; offline / blocked / denied all
 *     degrade to "LOCAL ONLY" with zero functional loss.
 *  2. TINY PAYLOADS — a profile is a few hundred bytes. Avatars are
 *     re-encoded through a canvas to a ≤256px square WebP/JPEG (usually
 *     5–15KB), which ALSO strips EXIF/GPS metadata (privacy).
 *  3. PEER SHARING OVER P2P — profiles travel to your opponent over the
 *     DTLS-encrypted WebRTC channel (see multiplayer.js 'profile' event).
 *  4. NO PII — display name + avatar only. No emails, no contacts, no
 *     location. The display name is charset-sanitized and length-capped.
 *  5. PROVIDER-READY — identity currently comes from the device
 *     ("local"). ProfileAuth below is the single seam where Google /
 *     Google Play Games / email sign-in plugs in later: those providers
 *     only need to resolve { ok, uid, provider } and the rest of the
 *     system already speaks "profile id". No fake auth ships here.
 * ─────────────────────────────────────────────────────────────────────── */

const PROFILE_STORAGE_KEY = 'profile_v1';
const PROFILE_NAME_MAX = 14;
const PROFILE_AVATAR_SIZE = 256;          // encoded square resolution (crisp at 2–3× DPI)
const PROFILE_AVATAR_MAX_BYTES = 22000;   // hard cap for the encoded avatar
const PROFILE_CLOUD_DEBOUNCE_MS = 2500;
const PROFILE_CLOUD_TIMEOUT_MS = 8000;
/* Cloud mirror SELF-HEALING. The cloud copy of the profile is what every
   friend's list renders, so a push that silently gives up reads as a
   permanently stale PFP on other players' devices (the reported bug: the
   avatar changed here, the friends list kept the old one forever). Any
   failure therefore retries with bounded backoff, a permission failure
   gets one WRITE-ONCE claim repair (the boot-time claim can lose the race
   against the very first profile push), and connectivity/focus changes
   trigger a throttled re-push. Capped so a hostile claim can't spin. */
const PROFILE_CLOUD_RETRY_MAX = 6;
const PROFILE_CLOUD_RETRY_BASE_MS = 5000;
const PROFILE_CLOUD_RETRY_CAP_MS = 120000;
const PROFILE_CLOUD_RECONCILE_MIN_MS = 30000;
/* Largest string _encodeSquareAvatar can emit: 22KB decoded bytes →
   ceil(22000/3)*4 = 29,336 base64 chars + "data:image/webp;base64," (23).
   The migrate cap must be a STRING cap strictly above that. */
const PROFILE_AV_MAX_CHARS = 32000;
/* Moderation audit record travels with the avatar (owner → cloud → friends'
   live mirrors can ignore it; the rules validate its shape). */
const PROFILE_SERVER_MOD_TIMEOUT_MS = 15000;
const PROFILE_MOD_SRC = /^(server|device)$/;
function migrateMod(m) {
    if (!m || typeof m !== 'object') return null;
    const v = String(m.v || '');
    const s = (+m.s);
    const t = +m.t;
    const src = String(m.src || '');
    if (v !== 'dam1' || !PROFILE_MOD_SRC.test(src) || !isFinite(t) || t <= 0) return null;
    const out = { v: v, t: Math.min(t, Date.now() + 60000), src: src };
    if (isFinite(s) && s >= 0 && s <= 1) out.s = Math.round(s * 1000) / 1000;
    return out;
}
// Identity provider registry — THE extension seam for future sign-ins.
// The UI renders every registered provider; until a real implementation
// exists a provider reports available() === false and signIn() returns
// { ok:false } — the panel shows it as coming soon. NO placeholder auth:
// a real provider must resolve { ok:true, uid, provider } from a genuine
// credential flow (Firebase Auth / Play Games / email link) or throw.
const ProfileAuth = {
    current: 'local',
    providers: {
        local:     { id: 'local',     label: 'THIS DEVICE', available: () => true },
        google:    { id: 'google',    label: 'GOOGLE',      available: () => false },
        playgames: { id: 'playgames', label: 'PLAY GAMES',  available: () => false },
        email:     { id: 'email',     label: 'EMAIL',       available: () => false },
    },
    async signIn(providerId) {
        if (!providerId || providerId === 'local') {
            return { ok: true, provider: 'local', uid: null }; // uid=null → device-generated id
        }
        const p = this.providers[providerId];
        if (!p || !p.available()) return { ok: false, reason: 'unavailable' };
        // Real implementations plug in here — nothing below ships fake auth.
        throw new Error('provider registered but not implemented: ' + providerId);
    },
};

const Profile = {
    data: null,
    _cloudTimer: null,
    _cloudState: '',          // '' | 'on' | 'blocked' | 'off' | 'local'
    _cloudTries: 0,           // consecutive failed pushes in this burst
    _cloudDirty: false,       // local profile newer than last confirmed push
    _cloudLastTryAt: 0,       // throttle floor for reconcile re-pushes
    _claimTried: false,       // one claim repair per failure burst
    _cloudWired: false,       // self-heal listeners installed once
    _wired: false,

    async init() {
        let raw = null;
        try { raw = await SaveSystem.load(PROFILE_STORAGE_KEY); } catch (e) {}
        this.data = this._migrate(raw);
        if (!this.data.id) {
            this.data.id = this._newId();
            this.data.createdAt = Date.now();
        }
        this.data.name = this._sanitizeName(this.data.name) || this._defaultName();
        this.data.stats = this.data.stats || { races: 0, wins: 0, losses: 0, bestET: null };
        this._persist();
        this._scheduleCloudSync();
        this._wirePanel();
        this._wireCloudSelfHeal();
        this._refreshChip();
        // Cross-device identity: when a signed-in session has a cloud-
        // registered profile id that differs from this device's, adopt it —
        // name + avatar + id follow the ACCOUNT. Background, never blocks
        // boot; signed-out players keep a purely local profile.
        this._adoptCloudIdentity();
    },

    /* WHY THIS EXISTS
       The profile id used to be device-generated, so signing in on a new
       device minted a fresh id and the cloud profile (name, avatar, the
       friend graph, the wallet) stayed orphaned under the old id — the
       "PFP doesn't sync across devices" report. pdl_uidIndex/<authUid> is
       the missing direction: AUTH UID → profile id, owner-private, written
       once per account. Adoption is deliberately conservative:
         · only while signed in (RLAuth.ready),
         · only when the indexed pid passes the pdl_idClaim ownership check
           (a hostile or stale index can never transplant someone else's
           identity onto this device),
         · cloud name/avatar only fill EMPTY local slots, so a player who
           customized before signing in never gets overwritten,
         · dependents (Friends store, Wallet node) are re-pointed atomically
           after the id flip. */
    async _adoptCloudIdentity() {
        try {
            if (!window.RLAuth || typeof RLAuth.ready !== 'function') return;
            for (let i = 0; i < 60 && !RLAuth.ready(); i++) {
                await new Promise(r => setTimeout(r, 100));
            }
            const u = (typeof RLAuth.user === 'function') ? RLAuth.user() : null;
            if (!u || !u.uid) return;
            const db = this._db();
            if (!db) return;
            const idxRef = db.ref('pdl_uidIndex/' + u.uid);
            let cloudPid = null;
            try { cloudPid = await idxRef.once('value').then(s => s.val()); } catch (e) { cloudPid = null; }
            const valid = (typeof cloudPid === 'string' && /^[0-9a-f]{16}$/.test(cloudPid)) ? cloudPid : null;

            if (valid && valid !== this.data.id) {
                // Ownership proof: the index may only transplant an identity
                // THIS account genuinely owns in pdl_idClaim.
                let claim = null;
                try { claim = await db.ref('pdl_idClaim/' + valid).once('value').then(s => s.val()); } catch (e) {}
                if (claim === u.uid) {
                    let cloudProf = null;
                    try { cloudProf = await db.ref('pdl_profiles/' + valid).once('value').then(s => s.val()); } catch (e) {}
                    const localDefault = /^DRIVER( [0-9A-Fa-f]{4})?$/.test(String(this.data.name || ''));
                    let restored = false;
                    if (cloudProf && typeof cloudProf === 'object') {
                        if (localDefault && typeof cloudProf.name === 'string') {
                            const nm = this._sanitizeName(cloudProf.name);
                            if (nm && nm !== this.data.name) { this.data.name = nm; restored = true; }
                        }
                        if (!this.data.av && typeof cloudProf.av === 'string' &&
                            cloudProf.av.length <= PROFILE_AV_MAX_CHARS && cloudProf.av.indexOf('data:image/') === 0) {
                            this.data.av = cloudProf.av; restored = true;
                        }
                        if (!this.data.mod) this.data.mod = migrateMod(cloudProf.mod);
                    }
                    this.data.id = valid;
                    this.data.updatedAt = Date.now();
                    this._persist();
                    this._scheduleCloudSync();
                    this._refreshAll();
                    if (restored) game.showNotification('PROFILE RESTORED FROM CLOUD');
                    // Re-point the social graph + the wallet mirror.
                    if (typeof Friends !== 'undefined' && Friends._loaded &&
                        typeof Friends.setProfile === 'function') {
                        Friends.setProfile(valid);
                    }
                    if (typeof Wallet !== 'undefined' && typeof Wallet.rebind === 'function') {
                        Wallet.rebind();
                    }
                }
            }
            // Register/refresh this account → profile binding (owner-only
            // write; same pair is idempotent).
            try { await idxRef.set(this.data.id); } catch (e) { /* offline stays local */ }
        } catch (e) {
            try { console.warn('[Profile] identity adoption skipped:', e && e.message); } catch (_) {}
        }
    },

    // ── Public getters used across the game ─────────────────────────
    name() { return this.data ? this.data.name : 'DRIVER'; },
    avatar() { return this.data ? this.data.av : null; },

    // The small object shared with the peer over the encrypted P2P channel.
    share() {
        return { id: this.data.id, name: this.data.name, av: this.data.av };
    },

    // Career stats mirror — fed from the same code path that updates the
    // P2P record, so there is exactly one source of truth for numbers.
    recordMpResult(mpStats) {
        if (!this.data || !mpStats) return;
        this.data.stats = {
            races: mpStats.races || 0,
            wins: mpStats.wins || 0,
            losses: mpStats.losses || 0,
            bestET: mpStats.bestET || null,
        };
        this.data.updatedAt = Date.now();
        this._persist();
        this._scheduleCloudSync();
        if (this._panelOpen()) this.renderPanel();
    },

    setName(input) {
        const name = this._sanitizeName(input);
        if (!name) { game.showNotification('NAME: 2-14 LETTERS/DIGITS'); return false; }
        this.data.name = name;
        this.data.updatedAt = Date.now();
        this._persist();
        this._scheduleCloudSync();
        this._refreshAll();
        game.showNotification('NAME SAVED');
        return true;
    },

    saveName() {
        const input = document.getElementById('profile-name-input');
        if (input && this.setName(input.value)) this.renderPanel();
    },

    pickAvatar() {
        const file = document.getElementById('profile-avatar-file');
        if (file) { file.value = ''; file.click(); }
    },

    async onAvatarPicked(file) {
        if (!file) return;
        if (this._modBusy) { game.showNotification('ALREADY CHECKING AN IMAGE'); return; }
        if (!/^image\//.test(file.type || '')) { game.showNotification('NOT AN IMAGE FILE'); return; }
        if (file.size > 8 * 1024 * 1024) { game.showNotification('IMAGE TOO LARGE — MAX 8MB'); return; }
        this._modBusy = true;   // released in the finally below
        try {
            const src = await this._decodeImage(file);
            const dataUrl = this._encodeSquareAvatar(src);
            if (!dataUrl) { game.showNotification('AVATAR ENCODE FAILED'); return; }
            // MODERATION GATE (Desert Ant Labs Moderator — PFP uploads only).
            // Runs exactly here, only for a NEWLY picked image: never at
            // launch, never on already-applied avatars. Trusted-server
            // verdict first where a backend exists; on-device verdict as
            // the fallback gate. Fail-closed either way.
            game.showNotification('CHECKING IMAGE…');
            if (window.PFPModerator && PFPModerator.preload) PFPModerator.preload();
            const verdict = await this._moderate(dataUrl);
            if (!verdict.ok) {
                if (typeof SFX !== 'undefined') SFX.error();
                game.showNotification(verdict.reason === 'nsfw'
                    ? 'IMAGE REJECTED — INAPPROPRIATE CONTENT'
                    : 'MODERATION UNAVAILABLE — TRY AGAIN');
                return;   // previous avatar stays untouched; player can retry
            }
            this.data.av = dataUrl;
            // Audit trail: WHY this image was admitted (model + score).
            this.data.mod = (verdict.score === null || verdict.score === undefined) ? {
                v: 'dam1', t: Date.now(), src: verdict.src,
            } : {
                v: 'dam1', s: Math.max(0, Math.min(1, verdict.score)), t: Date.now(), src: verdict.src,
            };
            this.data.updatedAt = Date.now();
            this._persist();
            this._scheduleCloudSync();
            this._refreshAll();
            game.showNotification('AVATAR UPDATED');
        } catch (e) {
            game.showNotification('COULD NOT READ THAT IMAGE');
        } finally {
            this._modBusy = false;
        }
    },

    /* One image, one verdict. The server (where this deployment has one)
       runs the SAME model with the native core and decides; on a purely
       static host the on-device gate is the only enforcement point and the
       rules' structural checks are documented around it (RULES-NOTES-v7). */
    async _moderate(dataUrl) {
        const server = await this._serverModerate(dataUrl).catch(() => null);
        if (server) return server;
        if (window.PFPModerator && typeof PFPModerator.moderate === 'function') {
            const r = await PFPModerator.moderate(dataUrl);
            return { ok: !!r.ok, reason: r.reason, score: r.score, src: 'device' };
        }
        return { ok: false, reason: 'error' };   // no gate available → reject
    },

    /* null/undefined ⇒ "no trusted backend here" (static hosting) and the
       caller falls through to the on-device gate. A reachable server that
       answers garbage is treated the same way — still gated, never open. */
    async _serverModerate(dataUrl) {
        const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        const timer = setTimeout(() => { try { if (ctrl) ctrl.abort(); } catch (e) {} }, PROFILE_SERVER_MOD_TIMEOUT_MS);
        try {
            // Root-relative: the route lives at the server root (/api),
            // not under the page's own directory (/game/...). Static hosts
            // simply 404 this and the caller falls back to the device gate.
            const res = await fetch('/api/pfp-moderate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: dataUrl }),
                signal: ctrl ? ctrl.signal : undefined,
            });
            if (!res || !res.ok) return null;      // 404 on static hosts
            const j = await res.json().catch(() => null);
            if (!j || typeof j !== 'object' || typeof j.ok !== 'boolean') return null;
            return { ok: j.ok, reason: j.ok ? undefined : 'nsfw', score: j.score, src: 'server' };
        } finally {
            clearTimeout(timer);
        }
    },

    removeAvatar() {
        if (!this.data.av) { game.showNotification('NO AVATAR TO REMOVE'); return; }
        this.data.av = null;
        this.data.mod = null;   // the audit record belongs to the avatar
        this.data.updatedAt = Date.now();
        this._persist();
        this._scheduleCloudSync();
        this._refreshAll();
        game.showNotification('AVATAR REMOVED');
    },

    // Copies the Profile ID to the clipboard; the small copy icon flashes.
    copyId() {
        const text = this.formatId(this.data.id);
        const flash = () => {
            const el = document.getElementById('profile-id-copy');
            if (!el) return;
            el.classList.add('pf-copied');
            setTimeout(() => el.classList.remove('pf-copied'), 1200);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(flash).catch(() => {});
        } else {
            try {
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                flash();
            } catch (e) {}
        }
    },

    // ── Account linking (structure only — no fake auth) ─────────────
    async linkAccount(providerId) {
        let res;
        try {
            res = await ProfileAuth.signIn(providerId);
        } catch (e) {
            res = { ok: false, reason: 'error' };
        }
        if (!res || !res.ok) {
            const p = ProfileAuth.providers[providerId];
            game.showNotification(((p && p.label) || String(providerId).toUpperCase()) + ' LINKING — COMING SOON');
            return false;
        }
        // A real provider resolves { ok:true, uid, provider } from a genuine
        // credential flow. The account then attaches to THIS profile id and
        // cloud sync upgrades to authenticated writes — wired up later.
        this.data.provider = res.provider;
        this.data.linkedUid = res.uid || null;
        this.data.updatedAt = Date.now();
        this._persist();
        this._scheduleCloudSync();
        this._refreshAll();
        return true;
    },

    // ── Panel (menu overlay) ────────────────────────────────────────
    openPanel() {
        game.menuState = 'PROFILE';
        document.getElementById('main-menu').classList.add('hidden');
        document.getElementById('profile-menu').classList.remove('hidden');
        this.renderPanel();
    },

    closePanel() {
        game.returnToMenu();
    },

    _panelOpen() {
        const el = document.getElementById('profile-menu');
        return !!(el && !el.classList.contains('hidden'));
    },

    renderPanel() {
        if (!this.data) return;
        const av = document.getElementById('profile-avatar');
        if (av) this.renderAvatar(av, { name: this.data.name, av: this.data.av }, '#37474f');
        const nameInput = document.getElementById('profile-name-input');
        if (nameInput && document.activeElement !== nameInput) nameInput.value = this.data.name;
        // (The per-profile W/L/races line was removed by design — career
        // statistics live in the CAREER screen, not on the identity card.)
        const idEl = document.getElementById('profile-id');
        if (idEl) idEl.textContent = this.formatId(this.data.id);
        this._renderCloudStatus();
        this._renderAccounts();
        if (typeof Friends !== 'undefined') Friends.renderList();
    },

    // ── Account linking row (provider buttons) ──────────────────────
    _renderAccounts() {
        const row = document.getElementById('pf-link-row');
        if (!row) return;
        // RLAuth (auth.js) owns live provider state — real connected
        // accounts, verification status and guest-upgrade actions.
        // Delegate the whole row to it whenever the auth layer is loaded.
        if (window.RLAuth && typeof RLAuth.renderLinkRow === 'function') {
            RLAuth.renderLinkRow(row);
            return;
        }
        if (row.dataset.built === '1') return;
        row.innerHTML = '';
        for (const id of ['google', 'playgames', 'email']) {
            const p = ProfileAuth.providers[id];
            if (!p) continue;
            const b = document.createElement('span');
            b.className = 'menu-btn pf-btn pf-link-btn';
            b.textContent = p.label;
            b.setAttribute('role', 'button');
            b.tabIndex = 0;
            const soon = document.createElement('span');
            soon.className = 'pf-link-soon';
            soon.textContent = 'SOON';
            b.appendChild(soon);
            b.onclick = () => this.linkAccount(id);
            b.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.linkAccount(id); } };
            row.appendChild(b);
        }
        row.dataset.built = '1';
    },

    // ── Shared avatar renderer (used by the chip, panel and MP lobby) ──
    // Avatars are ALWAYS drawn from a square, pre-cropped source into a
    // fixed box with object-fit: cover — geometrically impossible to show
    // a stretched or distorted image. No avatar → colored initial tile.
    renderAvatar(el, profile, fallbackColor) {
        if (!el) return;
        const av = profile && profile.av;
        el.innerHTML = '';
        if (av) {
            el.classList.add('mp-avatar-img');
            const img = document.createElement('img');
            img.src = av;
            img.alt = '';
            el.appendChild(img);
            return;
        }
        el.classList.remove('mp-avatar-img');
        el.style.background = fallbackColor || (profile && profile.color) || '#37474f';
        el.textContent = String((profile && profile.name) || '?').trim().charAt(0).toUpperCase() || '?';
    },

    // ── Internals ───────────────────────────────────────────────────
    _migrate(raw) {
        const d = (raw && typeof raw === 'object') ? raw : {};
        return {
            v: 1,
            id: typeof d.id === 'string' ? d.id.replace(/[^0-9a-fA-F]/g, '').toLowerCase().slice(0, 16) : '',
            name: typeof d.name === 'string' ? d.name : '',
            // Cap is on the ENCODED STRING (base64 ≈ 4/3 × bytes + prefix),
            // not on decoded bytes: a 22KB avatar is a ~29.4k-char URL and
            // the old 26k string cap was silently wiping it on every reload
            // (the reported "PFP doesn't persist" bug).
            av: (typeof d.av === 'string' && d.av.length <= PROFILE_AV_MAX_CHARS) ? d.av : null,
            mod: migrateMod(d.mod),
            provider: (d.provider && typeof d.provider === 'string') ? d.provider : 'local',
            linkedUid: (d.linkedUid && typeof d.linkedUid === 'string') ? d.linkedUid.slice(0, 128) : null,
            createdAt: +d.createdAt || 0,
            updatedAt: +d.updatedAt || 0,
            stats: d.stats && typeof d.stats === 'object' ? {
                races: +d.stats.races || 0,
                wins: +d.stats.wins || 0,
                losses: +d.stats.losses || 0,
                bestET: (typeof d.stats.bestET === 'number' && isFinite(d.stats.bestET)) ? d.stats.bestET : null,
            } : { races: 0, wins: 0, losses: 0, bestET: null },
        };
    },

    _sanitizeName(s) {
        const clean = String(s || '')
            .replace(/[^A-Za-z0-9 _.\-]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, PROFILE_NAME_MAX);
        return clean.length >= 2 ? clean : '';
    },

    _newId() {
        const arr = new Uint8Array(8);
        if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(arr);
        else for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
        return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
    },

    formatId(id) {
        return String(id || '').replace(/[^0-9a-fA-F]/g, '').toUpperCase().padEnd(16, '0').match(/.{1,4}/g).join('-');
    },

    _defaultName() {
        return 'DRIVER ' + String(this.data.id || '0000').slice(-4).toUpperCase();
    },

    // Loads any image the device can decode. createImageBitmap with
    // 'from-image' also bakes EXIF orientation in, so phone photos taken
    // sideways come out upright; falls back to an <img> decode.
    async _decodeImage(file) {
        if (window.createImageBitmap) {
            try {
                return await createImageBitmap(file, { imageOrientation: 'from-image' });
            } catch (e) { /* older engines: fall through to <img> */ }
        }
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
            img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image decode failed')); };
            img.src = url;
        });
    },

    // Perfect-square avatar pipeline: CENTER square crop (cover) →
    // high-quality multi-step downscale → 256px encode, WebP first with a
    // JPEG fallback, quality stepped down until under the size cap. The
    // output is always square and sharply downscaled, and displaying it
    // with object-fit: cover makes stretching/distortion impossible.
    // Canvas re-encoding also strips EXIF/GPS metadata (privacy).
    _encodeSquareAvatar(src) {
        const sw = src.width || src.naturalWidth;
        const sh = src.height || src.naturalHeight;
        if (!sw || !sh) return null;
        const side = Math.min(sw, sh);
        const sx = (sw - side) / 2, sy = (sh - side) / 2;

        // Step 1: crop to the center square at source resolution.
        let cur = document.createElement('canvas');
        cur.width = side; cur.height = side;
        let cctx = cur.getContext('2d');
        cctx.imageSmoothingEnabled = true;
        cctx.imageSmoothingQuality = 'high';
        cctx.drawImage(src, sx, sy, side, side, 0, 0, side, side);

        // Step 2: halve repeatedly — avoiding one giant downscale jump
        // prevents aliasing and keeps small text/faces readable.
        while (cur.width > PROFILE_AVATAR_SIZE * 2) {
            const half = document.createElement('canvas');
            half.width = Math.max(PROFILE_AVATAR_SIZE, Math.floor(cur.width / 2));
            half.height = half.width;
            const hctx = half.getContext('2d');
            hctx.imageSmoothingEnabled = true;
            hctx.imageSmoothingQuality = 'high';
            hctx.drawImage(cur, 0, 0, half.width, half.height);
            cur = half;
        }

        // Step 3: final 256px canvas.
        const out = document.createElement('canvas');
        out.width = PROFILE_AVATAR_SIZE;
        out.height = PROFILE_AVATAR_SIZE;
        const octx = out.getContext('2d');
        octx.imageSmoothingEnabled = true;
        octx.imageSmoothingQuality = 'high';
        octx.drawImage(cur, 0, 0, PROFILE_AVATAR_SIZE, PROFILE_AVATAR_SIZE);

        // Step 4: encode — smallest first, quality stepped down under the cap.
        const encodes = [
            ['image/webp', [0.9, 0.82, 0.72]],
            ['image/jpeg', [0.88, 0.8, 0.7]],
        ];
        for (const [type, qualities] of encodes) {
            for (const q of qualities) {
                try {
                    const url = out.toDataURL(type, q);
                    const bytes = Math.ceil((url.length - url.indexOf(',') - 1) * 3 / 4);
                    if (bytes <= PROFILE_AVATAR_MAX_BYTES) return url;
                } catch (e) { /* unsupported type on this engine: try next */ }
            }
        }
        return null;
    },

    _persist() {
        // Silent background persistence — the profile must never nag or
        // block; failures leave the in-memory copy authoritative.
        SaveSystem.save(PROFILE_STORAGE_KEY, this.data).catch(() => {});
    },

    _refreshAll() {
        this._refreshChip();
        if (this._panelOpen()) this.renderPanel();
        if (typeof MP !== 'undefined' && MP._connected && MP._renderLobbySelf) MP._renderLobbySelf();
    },

    _refreshChip() {
        const chip = document.getElementById('menu-profile');
        if (!chip || !this.data) return;
        const av = chip.querySelector('.mp-avatar');
        if (av) this.renderAvatar(av, { name: this.data.name, av: this.data.av }, '#ff9800');
        const nm = document.getElementById('menu-profile-name');
        if (nm) nm.textContent = this.data.name.toUpperCase();
    },

    // ── Firebase mirror (background, never blocking) ────────────────
    _db() {
        if (typeof MP === 'undefined' || !MP.firebaseConfigured || !MP.firebaseConfigured()) return null;
        try { if (!MP.ensureFirebase()) return null; } catch (e) { return null; }
        return MP.db || null;
    },

    _scheduleCloudSync() {
        this._cloudDirty = true;
        if (this._cloudTimer) clearTimeout(this._cloudTimer);
        this._cloudTimer = setTimeout(() => { this._cloudSync(); }, PROFILE_CLOUD_DEBOUNCE_MS);
    },

    /* Self-heal triggers: connection restored, tab focused again. Only
       acts when the mirror is not confirmed healthy (or local data is
       newer than the last confirmed push), and at most once per
       PROFILE_CLOUD_RECONCILE_MIN_MS — a background nicety, never a
       write storm. This is what lets a PFP change that failed under an
       old ruleset / while offline reach the cloud WITHOUT the player
       having to touch their profile again. */
    _wireCloudSelfHeal() {
        if (this._cloudWired) return;
        this._cloudWired = true;
        window.addEventListener('online', () => this._reconcileCloud());
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') this._reconcileCloud();
        });
    },

    _reconcileCloud() {
        if (this._cloudState === 'on' && !this._cloudDirty) return;   // healthy, nothing owed
        const now = Date.now();
        if (this._cloudLastTryAt && now - this._cloudLastTryAt < PROFILE_CLOUD_RECONCILE_MIN_MS) return;
        this._cloudLastTryAt = now;
        this._scheduleCloudSync();
    },

    async _cloudSync() {
        // rules-v4-anonauth grants every cloud path to AUTHENTICATED
        // RTDB connections only. If the auth layer is still resolving
        // (slow network), re-debounce instead of writing into a
        // not-yet-authenticated connection. The auth watchdog bounds
        // this loop (ready=true after 6 s worst case).
        if (window.RLAuth && typeof RLAuth.ready === 'function' && !RLAuth.ready()) {
            this._scheduleCloudSync();
            return;
        }
        // Signed out: there is nothing to authenticate the write with.
        // Settle honestly into LOCAL ONLY instead of attempting writes the
        // rules will deny and then retrying them forever.
        if (window.RLAuth && typeof RLAuth.ready === 'function' && RLAuth.ready() &&
            typeof RLAuth.user === 'function' && !RLAuth.user()) {
            this._cloudTries = 0;
            this._setCloudState('local');
            return;
        }
        const db = this._db();
        if (!db || !this.data.id) { this._setCloudState('local'); return; }
        const d = this.data;
        const payload = { name: d.name, av: d.av, mod: d.mod || null, stats: d.stats, provider: d.provider, updatedAt: Date.now() };
        this._cloudLastTryAt = Date.now();
        try {
            await this._watchdog(db.ref('pdl_profiles/' + d.id).update(payload), PROFILE_CLOUD_TIMEOUT_MS);
            this._cloudTries = 0;
            this._cloudDirty = false;
            this._claimTried = false;
            this._setCloudState('on');
        } catch (e) {
            this._setCloudState(this._isRulesError(e) ? 'blocked' : 'off');
            this._cloudRecover(e);   // never a silent dead end
        }
    },

    /* A failed push must self-heal on its own — friends' lists read the
       CLOUD copy, so giving up here is exactly how a PFP change never
       reached them. permission_denied first gets ONE write-once claim
       repair (idempotent when our uid already owns it; legally refused
       when another account does), then bounded exponential retries cover
       offline / timeout / rules races. After PROFILE_CLOUD_RETRY_MAX the
       loop stands down honestly: the panel keeps showing BLOCKED and the
       next boot, 'online' or focus re-trigger takes another shot. */
    _cloudRecover(err) {
        this._cloudTries = (this._cloudTries || 0) + 1;
        if (this._isRulesError(err) && !this._claimTried) {
            this._claimTried = true;
            const u = (window.RLAuth && typeof RLAuth.user === 'function') ? RLAuth.user() : null;
            const db = this._db();
            if (u && u.uid && db && this.data && this.data.id) {
                try { db.ref('pdl_idClaim/' + this.data.id).set(u.uid).catch(() => {}); } catch (e) {}
            }
        }
        if (this._cloudTries > PROFILE_CLOUD_RETRY_MAX) return;
        const delay = Math.min(
            PROFILE_CLOUD_RETRY_BASE_MS * Math.pow(2, this._cloudTries - 1),
            PROFILE_CLOUD_RETRY_CAP_MS);
        if (this._cloudTimer) clearTimeout(this._cloudTimer);
        this._cloudTimer = setTimeout(() => { this._cloudSync(); }, delay);
    },

    _setCloudState(s) {
        if (this._cloudState === s) return;
        this._cloudState = s;
        this._renderCloudStatus();
    },

    _renderCloudStatus() {
        const el = document.getElementById('profile-cloud-status');
        if (!el) return;
        const map = {
            'on':      ['CLOUD SYNC: ON', 'pf-cloud-on'],
            'blocked': ['CLOUD SYNC: UNAVAILABLE — SAVING LOCALLY', 'pf-cloud-dim'],
            'off':     ['CLOUD SYNC: OFFLINE — SAVING LOCALLY', 'pf-cloud-dim'],
            'local':   ['CLOUD SYNC: LOCAL ONLY', 'pf-cloud-dim'],
        };
        const entry = map[this._cloudState] || map['local'];
        el.textContent = entry[0];
        el.className = 'pf-cloud ' + entry[1];
    },

    _isRulesError(e) {
        const code = String((e && e.code) || '').toUpperCase();
        const text = String((e && (e.message || e)) || '').toLowerCase();
        return code.includes('PERMISSION') || text.includes('permission_denied');
    },

    _watchdog(promise, ms) {
        return Promise.race([
            promise,
            new Promise((_, rej) => setTimeout(() => rej(new Error('profile sync timeout')), ms)),
        ]);
    },

    // ── One-time panel wiring ───────────────────────────────────────
    _wirePanel() {
        if (this._wired) return;
        this._wired = true;
        const file = document.getElementById('profile-avatar-file');
        if (file) file.addEventListener('change', () => { this.onAvatarPicked(file.files && file.files[0]); });
        const nameInput = document.getElementById('profile-name-input');
        if (nameInput) {
            nameInput.addEventListener('keydown', e => {
                if (e.key === 'Enter') { e.preventDefault(); this.saveName(); }
            });
        }
        const friendInput = document.getElementById('friend-add-input');
        if (friendInput) {
            friendInput.addEventListener('keydown', e => {
                if (e.key === 'Enter') { e.preventDefault(); if (typeof Friends !== 'undefined') Friends.addByInput(); }
            });
        }
        // Keyboard operability for chip, avatar tile and the copy icon.
        const chip = document.getElementById('menu-profile');
        if (chip) chip.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.openPanel(); }
        });
        const avTile = document.getElementById('profile-avatar');
        if (avTile) avTile.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.pickAvatar(); }
        });
        const copyIcon = document.getElementById('profile-id-copy');
        if (copyIcon) copyIcon.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.copyId(); }
        });
    },
};

window.Profile = Profile;
