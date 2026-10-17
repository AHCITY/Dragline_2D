'use strict';

/* ═══════════════════════════════════════════════════════════════════════
   Redline 2D — Firebase Auth gate & account layer (auth.js)
   ----------------------------------------------------------------------------
   WHAT THIS IS
     A self-contained identity layer that plugs into the seam profile.js
     was designed for (ProfileAuth / #pf-link-row). It adds:
       · A LAUNCH GATE — shown ONLY at startup when Firebase reports no
         persisted session (or after an explicit sign-out). Signed-in
         players never see it; the game behind it stays untouched.
       · THREE sign-in providers: Google (popup), Email/Password and
         Anonymous ("CONTINUE AS GUEST").
       · Working FORGOT PASSWORD (reset email) and EMAIL VERIFICATION
         (auto-send on signup, resend from the menu pill / profile panel,
         live flip to "verified" on window focus via user.reload()).
       · GUEST UPGRADE — an anonymous account can add email+password or
         connect Google WITHOUT losing its uid (linkWithCredential /
         linkWithPopup), so progress never resets.
   SAFETY
     · The gate can NEVER soft-lock the game: if the auth SDK is missing,
       the config is blank, or Firebase never answers, the gate silently
       stands down and the game stays fully playable (local-first).
     · INJECTION-PROOF: every dynamic string (emails, names, provider
       labels, error text) is rendered through textContent. The only
       innerHTML calls use CONSTANT, developer-owned SVG markup — player
       input can never become markup, a URL handler or a script.
     · While the gate is up the game container is made `inert` and a
       focus trap keeps Tab/Enter inside the card; game.js also skips
       its hotkeys while RLAuth.isLocked() is true.
   RULES INTERACTION
     Adding auth is purely additive: rules-v4.0.1 ignores auth (still
     works), rules-v4-anonauth *requires* it (now satisfied). No RTDB
     writes are introduced by this file — the profile mirror keeps using
     the existing Profile cloud-sync path with provider/linkedUid set.
   ─────────────────────────────────────────────────────────────────────── */

(function () {

    // ── Tiny DOM helpers (createElement + textContent ONLY) ────────────
    function el(tag, cls, text) {
        const n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text != null) n.textContent = text;
        return n;
    }
    // Constant, developer-owned SVG fragments — never interpolated.
    const SVG = {
        google: '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"/></svg>',
        eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>',
        eyeOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M17.94 17.94A10.9 10.9 0 0 1 12 19c-7 0-11-7-11-7a19.8 19.8 0 0 1 5.06-5.94M9.9 4.24A9.1 9.1 0 0 1 12 4c7 0 11 7 11 7a19.8 19.8 0 0 1-3.22 4.31M1 1l22 22"/></svg>',
        lock: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5zm-3 8V7a3 3 0 1 1 6 0v3H9z"/></svg>',
    };
    function svgEl(markup) {
        const t = document.createElement('template');
        t.innerHTML = markup;          // CONSTANT markup — no interpolation ever
        return t.content.firstChild;
    }

    // ── State ───────────────────────────────────────────────────────────
    let inited = false;
    let auth = null;                    // firebase.auth() or null
    let user = null;                    // current Firebase user or null
    let ready = false;                  // first onAuthStateChanged observed
    let locked = false;                 // gate is up → game input suspended
    let mode = 'signin';                // signin | register | forgot | manage
    let busy = false;                   // an auth operation is in flight
    let everSignedIn = false;           // a session existed this page-load
    let welcomed = false;               // welcome-back toast already shown
    let verifyTimer = null;             // resend throttle countdown
    let reloadAt = 0;                   // emailVerified refresh throttle
    const els = {};                     // cached overlay elements
    const STORE_LAST = 'rla_last';      // last successful email (prefill only)
    const STORE_VSENT = 'rla_vsent';    // verification resend throttle
    const STORE_VDIS = 'rla_vdis';      // session-only pill dismissal
    const STORE_MODE = 'rla_mode';      // last used gate tab (signin/register)
    const STORE_UID = 'rla_uid';        // uid this device last had a session for (boot + save-namespace marker)
    const STORE_SW = 'rla_sw';          // session-only: an account-switch reload was armed
    const STORE_PNAME = 'rla_pname';    // driver name chosen at register, applied after the switch reload

    // ── Firebase bootstrap (defensive — never throws, never soft-locks) ─
    function getConfig() {
        let cfg = null;
        try { cfg = (typeof FIREBASE_CONFIG !== 'undefined') ? FIREBASE_CONFIG : null; } catch (e) { cfg = null; }
        return (cfg && cfg.apiKey && cfg.authDomain) ? cfg : null;
    }
    function providerIdOf(u) {
        if (!u) return null;
        if (u.isAnonymous) return 'guest';
        const pd = (u.providerData && u.providerData[0]) || null;
        if (pd && pd.providerId === 'google.com') return 'google';
        return 'email';
    }
    function friendly(err) {
        const code = String((err && err.code) || '').replace('auth/', '');
        const M = {
            'invalid-email': ['THAT EMAIL ADDRESS LOOKS MALFORMED', 'err'],
            'missing-email': ['ENTER YOUR EMAIL ADDRESS', 'err'],
            'missing-password': ['ENTER YOUR PASSWORD', 'err'],
            'weak-password': ['PASSWORD TOO SHORT — 6 CHARACTERS MINIMUM', 'err'],
            'email-already-in-use': ['EMAIL ALREADY REGISTERED — SIGN IN INSTEAD', 'err'],
            'invalid-credential': ['WRONG EMAIL OR PASSWORD', 'err'],
            'wrong-password': ['WRONG EMAIL OR PASSWORD', 'err'],
            'user-not-found': ['WRONG EMAIL OR PASSWORD', 'err'],
            'user-disabled': ['THIS ACCOUNT HAS BEEN DISABLED', 'err'],
            'too-many-requests': ['TOO MANY ATTEMPTS — TRY AGAIN IN A MINUTE', 'err'],
            'network-request-failed': ['NETWORK ERROR — CHECK YOUR CONNECTION', 'err'],
            'operation-not-allowed': ['THAT SIGN-IN METHOD IS OFF — ENABLE IT IN THE FIREBASE CONSOLE', 'err'],
            'admin-restricted-operation': ['GUEST SIGN-IN IS OFF — ENABLE ANONYMOUS AUTH IN THE FIREBASE CONSOLE', 'err'],
            'unauthorized-domain': ["THIS DOMAIN ISN'T ALLOWED FOR GOOGLE SIGN-IN — ADD IT UNDER FIREBASE CONSOLE → AUTHENTICATION → SETTINGS → AUTHORIZED DOMAINS", 'err'],
            'popup-blocked': ['POPUP BLOCKED — ALLOW POPUPS FOR THIS PAGE AND TRY AGAIN', 'err'],
            'popup-closed-by-user': ['GOOGLE SIGN-IN CANCELLED', 'warn'],
            'cancelled-popup-request': ['', 'silent'],
            'credential-already-in-use': ['THAT EMAIL ALREADY HAS AN ACCOUNT — SIGN OUT AND SIGN IN WITH IT INSTEAD', 'err'],
            'email-already-exists': ['EMAIL ALREADY REGISTERED — SIGN IN INSTEAD', 'err'],
            'requires-recent-login': ['SESSION TOO OLD — SIGN IN AGAIN FIRST', 'err'],
            'invalid-api-key': ['FIREBASE CONFIG ERROR — CHECK THE API KEY', 'err'],
            'app-not-authorized': ['THIS DOMAIN IS NOT ALLOWED — ADD IT TO AUTHORIZED DOMAINS IN THE FIREBASE CONSOLE', 'err'],
            'internal-error': ['AUTH SERVICE HICCUP — TRY AGAIN', 'err'],
        };
        const hit = M[code];
        if (hit) return { text: hit[0], kind: hit[1] };
        console.warn('[RLAuth] unmapped auth error:', code, err && err.message);
        return { text: 'AUTH ERROR (' + (code || 'UNKNOWN') + ') — TRY AGAIN', kind: 'err' };
    }

    // ── Profile seam (the extension point profile.js was built around) ──
    function syncProfile(u) {
        if (typeof Profile === 'undefined' || !Profile || !Profile.data) return;
        const pid = providerIdOf(u);
        const d = Profile.data;
        try {
            if (d.provider !== pid || d.linkedUid !== u.uid) {
                d.provider = pid;
                d.linkedUid = u.uid;
                d.updatedAt = Date.now();
                Profile._persist();
                Profile._scheduleCloudSync();
                if (typeof ProfileAuth !== 'undefined') ProfileAuth.current = pid;
            }
            // Adopt the Google display name once, only if the driver never
            // picked a name (profile still carries its default).
            if (pid === 'google' && u.displayName) {
                const cur = String(d.name || '');
                const isDefault = /^DRIVER( [0-9A-Fa-f]{4})?$/.test(cur);
                const gn = Profile._sanitizeName(u.displayName);
                if (isDefault && gn && gn.toLowerCase() !== cur.toLowerCase()) Profile.setName(gn);
            }
        } catch (e) { console.warn('[RLAuth] profile sync skipped:', e && e.message); }
    }
    function clearProfileLink() {
        if (typeof Profile === 'undefined' || !Profile || !Profile.data) return;
        const d = Profile.data;
        try {
            if (d.provider !== 'local' || d.linkedUid) {
                d.provider = 'local';
                d.linkedUid = null;
                d.updatedAt = Date.now();
                Profile._persist();
                Profile._scheduleCloudSync();
            }
        } catch (e) { /* local-first: never block sign-out on this */ }
    }

    // ── Auth state ──────────────────────────────────────────────────────
    function bootUid() {
        try { return localStorage.getItem(STORE_UID) || null; } catch (e) { return null; }
    }
    // Account switch (guest ↔ real account, or the first sign-in after a
    // signed-out boot): the entire save layer is namespaced by uid and was
    // resolved synchronously at boot, so a different uid MUST re-boot into
    // its own namespace. One clean reload does it — the session is already
    // persisted, so the next boot restores silently. The sessionStorage
    // guard makes a reload loop impossible (browsers with blocked storage
    // simply skip the reload and keep a same-page session instead).
    function reloadForAccountSwitch() {
        try {
            if (sessionStorage.getItem(STORE_SW) === '1') return;
            sessionStorage.setItem(STORE_SW, '1');
        } catch (e) { return; }   // no sessionStorage → never reload → never loop
        setTimeout(() => { try { location.reload(); } catch (e) {} }, 350);
    }
    // rules-v4-anonauth: every cloud path is keyed by the 16-hex driver id
    // and granted through a WRITE-ONCE pdl_idClaim/<id> = auth.uid map.
    // Written on every sign-in; idempotent for the same (id, uid) pair.
    function claimProfileId() {
        if (!user || typeof firebase === 'undefined' || !firebase.app) return;
        const pid = (typeof Profile !== 'undefined' && Profile.data && Profile.data.id) ? Profile.data.id : null;
        if (!pid || !/^[0-9a-f]{16}$/.test(pid)) return;
        try {
            firebase.app().database().ref('pdl_idClaim/' + pid).set(user.uid).catch(() => {});
        } catch (e) { /* cloud optional — local-first */ }
    }
    // Verification nudge: sent shortly after the account actually lands in
    // the game (post-reload), so a slow verification call can never be cut
    // off by the account-switch reload. Throttled via the shared marker.
    async function autoVerify() {
        if (!user || user.isAnonymous || !user.email || user.emailVerified) return;
        if (vsentAgo() < 60000) return;
        try { await user.sendEmailVerification(); markVSent(); renderVerifyPill(); } catch (e) {}
    }
    function onUser(u) {
        user = u || null;
        ready = true;
        refreshChipBadge();
        renderVerifyPill();
        if (user) {
            const prev = bootUid();
            try { localStorage.setItem(STORE_UID, user.uid); } catch (e) {}
            if (user.uid !== prev) {
                // Different account than the one this page-load booted with.
                reloadForAccountSwitch();
                return;
            }
            try { if (sessionStorage.getItem(STORE_SW) === '1') sessionStorage.removeItem(STORE_SW); } catch (e) {}
            everSignedIn = true;
            syncProfile(user);
            claimProfileId();
            autoVerify();
            // A name picked during register rides the account-switch reload:
            // apply it once, to the freshly adopted/created profile, then forget it.
            try {
                const pn = localStorage.getItem(STORE_PNAME);
                if (pn && typeof Profile !== 'undefined' && Profile.data &&
                    /^DRIVER( [0-9A-Fa-f]{4})?$/.test(String(Profile.data.name || '')) &&
                    typeof Profile._sanitizeName === 'function' && Profile._sanitizeName(pn)) {
                    Profile.setName(Profile._sanitizeName(pn));
                }
                localStorage.removeItem(STORE_PNAME);
            } catch (e) {}
            // Auto-dismiss ONLY the launch gate — the manage card (opened
            // from the profile panel) stays up so the player sees the
            // result of a successful account link.
            if (locked && mode !== 'manage') {
                unlock();
                notify('SIGNED IN');
            } else if (!locked && !welcomed) {
                // Silent session restore (returning player) — one friendly
                // toast per page load, then never again.
                welcomed = true;
                notify('WELCOME BACK' + ((typeof Profile !== 'undefined' && Profile.data && Profile.data.name) ? ', ' + Profile.data.name : ''));
            }
            renderVerifyPill();
        } else {
            try { localStorage.removeItem(STORE_UID); } catch (e) {}
            clearProfileLink();
            closeManage();
            if (everSignedIn) {
                // Explicit sign-out (or a revoked session) → gate returns.
                showGate('signin', 'SIGNED OUT — SEE YOU ON THE TRACK', 'info');
            } else {
                // First launch with no persisted session → the gate is the
                // only entry point (sign in / register / guest).
                showGate('signin', null);
            }
        }
        if (isPfPanelOpen()) rerenderPfLinkRow();
    }

    // ── Lock / unlock the stage ─────────────────────────────────────────
    // While locked, the game stage is display:none (html.rla-locked) —
    // the sign-in screen is its own page, not an overlay above the menu.
    function lock() {
        locked = true;
        document.documentElement.classList.add('rla-locked');
        document.documentElement.classList.remove('rla-bootlock');
        els.overlay.classList.remove('rla-hidden');
        const gc = document.getElementById('game-container');
        const rp = document.getElementById('rotate-prompt');
        try { if (gc) gc.inert = true; } catch (e) {}
        try { if (rp) rp.inert = true; } catch (e) {}
        setTimeout(() => { focusFirst(); }, 260);
    }
    function unlock() {
        // Classes are cleared even when the live lock wasn't ours (the
        // boot-lock path) — the game must never stay hidden by accident.
        document.documentElement.classList.remove('rla-locked');
        document.documentElement.classList.remove('rla-bootlock');
        if (!locked) return;
        locked = false;
        els.overlay.classList.add('rla-hidden');
        const gc = document.getElementById('game-container');
        const rp = document.getElementById('rotate-prompt');
        try { if (gc) gc.inert = false; } catch (e) {}
        try { if (rp) rp.inert = false; } catch (e) {}
        banner(null);
        setBusy(false);
    }
    function isLocked() { return locked; }

    function focusFirst() {
        if (!locked && mode !== 'manage') return;
        const card = (mode === 'manage') ? els.manageCard : els.card;
        if (!card || card.classList.contains('rla-hidden')) return;
        const target = card.querySelector('input:not([type="hidden"]):not(.rla-hidden)') ||
                       card.querySelector('.rla-btn:not([disabled]), .rla-mini:not([disabled])');
        if (target) { try { target.focus({ preventScroll: true }); } catch (e) { target.focus(); } }
    }

    // Focus trap: while the gate is up, Tab cycles inside the active card.
    function trap(e) {
        if (!locked || e.key !== 'Tab') return;
        const card = (mode === 'manage') ? els.manageCard : els.card;
        if (!card) return;
        const items = Array.prototype.filter.call(
            card.querySelectorAll('button, input, [role="button"], [tabindex="0"]'),
            n => !n.disabled && !n.classList.contains('rla-hidden') && n.offsetParent !== null
        );
        if (!items.length) return;
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }

    // ── Banner / busy helpers ───────────────────────────────────────────
    function banner(data, shake) {
        const b = els.banner;
        if (!b) return;
        if (!data || !data.text || data.kind === 'silent') { b.className = 'rla-banner'; b.textContent = ''; return; }
        b.textContent = data.text;
        b.className = 'rla-banner rla-show rla-' + (data.kind || 'info');
        if (data.kind === 'err') {
            b.setAttribute('role', 'alert');
            if (shake !== false) {
                b.classList.remove('rla-shake');
                void b.offsetWidth;            // restart animation
                b.classList.add('rla-shake');
            }
        } else {
            b.removeAttribute('role');
        }
    }
    function setBusy(on, label) {
        busy = on;
        const btns = els.overlay.querySelectorAll('.rla-btn, .rla-mini, .rla-tab');
        Array.prototype.forEach.call(btns, b => {
            if (on) { if (b.dataset.rlaMain !== undefined) { b.textContent = label || 'PLEASE WAIT'; } b.disabled = true; }
            else { if (b.dataset.rlaMain !== undefined) b.textContent = b.dataset.rlaMain; b.disabled = false; }
        });
        if (!on) refreshVerifyButtons();
    }
    function fieldError(input, lineEl, msg) {
        if (!input) return;
        if (msg) {
            input.classList.add('rla-bad');
            input.setAttribute('aria-invalid', 'true');
            if (lineEl) lineEl.textContent = msg;
        } else {
            input.classList.remove('rla-bad');
            input.removeAttribute('aria-invalid');
            if (lineEl) lineEl.textContent = '';
        }
    }
    function clearFieldErrors() {
        fieldError(els.siEmail, els.siEmailErr, null);
        fieldError(els.siPass, els.siPassErr, null);
        fieldError(els.rgName, els.rgNameErr, null);
        fieldError(els.rgEmail, els.rgEmailErr, null);
        fieldError(els.rgPass, els.rgPassErr, null);
        fieldError(els.fgEmail, els.fgEmailErr, null);
        fieldError(els.lkEmail, els.lkEmailErr, null);
        fieldError(els.lkPass, els.lkPassErr, null);
    }
    const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

    function notify(text) {
        // `game` is a top-level CONST in game.js — a global lexical
        // binding that never appears on window. typeof is the only safe
        // probe; a window.game check would silently disable every toast.
        try {
            const g = (typeof game !== 'undefined') ? game : (window.game || null);
            if (g && typeof g.showNotification === 'function') g.showNotification(String(text || '').slice(0, 40));
        } catch (e) {}
    }

    // ── Provider flows ──────────────────────────────────────────────────
    async function signInGoogle() {
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        try {
            await auth.signInWithPopup(provider);
            return { ok: true };
        } catch (e) {
            const code = String(e && e.code || '');
            if (code === 'auth/popup-blocked') {
                try { await auth.signInWithRedirect(provider); return { ok: true, redirected: true }; }
                catch (e2) { return { ok: false, err: e2 }; }
            }
            return { ok: false, err: e };
        }
    }
    async function linkGoogle() {
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        try {
            await user.linkWithPopup(provider);
            return { ok: true };
        } catch (e) {
            return { ok: false, err: e };
        }
    }
    async function signInEmail(email, pass) {
        try { await auth.signInWithEmailAndPassword(email, pass); return { ok: true }; }
        catch (e) { return { ok: false, err: e }; }
    }
    async function registerEmail(email, pass) {
        try {
            // Verification is sent by autoVerify() once the signed-in
            // session has landed in the game (post account-switch reload)
            // — sending here raced the reload and could be cut off.
            await auth.createUserWithEmailAndPassword(email, pass);
            return { ok: true };
        } catch (e) { return { ok: false, err: e }; }
    }
    async function guestSignIn() {
        try { await auth.signInAnonymously(); return { ok: true }; }
        catch (e) { return { ok: false, err: e }; }
    }
    async function sendReset(email) {
        try { await auth.sendPasswordResetEmail(email); return { ok: true }; }
        catch (e) { return { ok: false, err: e }; }
    }
    async function linkEmailPass(email, pass) {
        try {
            const cred = firebase.auth.EmailAuthProvider.credential(email, pass);
            await user.linkWithCredential(cred);
            try { await user.sendEmailVerification(); markVSent(); } catch (e) {}
            return { ok: true };
        } catch (e) { return { ok: false, err: e }; }
    }
    async function signOut() {
        try { await auth.signOut(); return { ok: true }; }
        catch (e) { return { ok: false, err: e }; }
    }
    async function resendVerification() {
        if (!user || user.isAnonymous || user.emailVerified) return;
        try { await user.sendEmailVerification(); markVSent(); return { ok: true }; }
        catch (e) { return { ok: false, err: e }; }
    }

    // ── Email verification pill + throttles ─────────────────────────────
    function markVSent() {
        try { localStorage.setItem(STORE_VSENT, String(Date.now())); } catch (e) {}
    }
    function vsentAgo() {
        try { return Date.now() - (parseInt(localStorage.getItem(STORE_VSENT) || '0', 10) || 0); }
        catch (e) { return Infinity; }
    }
    function refreshVerifyButtons() {
        if (els.pillResend) {
            const wait = 60000 - vsentAgo();
            if (wait > 0) {
                els.pillResend.disabled = true;
                els.pillResend.textContent = 'WAIT ' + Math.ceil(wait / 1000) + 's';
                if (!verifyTimer) {
                    verifyTimer = setTimeout(() => { verifyTimer = null; refreshVerifyButtons(); }, Math.min(wait, 1000) + 30);
                }
            } else {
                els.pillResend.disabled = false;
                els.pillResend.textContent = 'RESEND';
                if (verifyTimer) { clearTimeout(verifyTimer); verifyTimer = null; }
            }
        }
        if (els.mgResend) {
            const wait = 60000 - vsentAgo();
            els.mgResend.disabled = wait > 0 || busy;
            els.mgResend.textContent = wait > 0 ? 'WAIT ' + Math.ceil(wait / 1000) + 's' : 'RESEND VERIFICATION EMAIL';
        }
    }
    function pillDismissed() {
        try { return sessionStorage.getItem(STORE_VDIS) === '1'; } catch (e) { return false; }
    }
    function renderVerifyPill() {
        if (!els.pill) return;
        const show = !!(user && providerIdOf(user) === 'email' && user.email && !user.emailVerified) && !pillDismissed();
        els.pill.classList.toggle('rla-hidden', !show);
        if (show) {
            els.pillText.textContent = 'VERIFY YOUR EMAIL — CHECK YOUR INBOX';
            refreshVerifyButtons();
        }
    }
    async function refreshVerifiedState() {
        if (!user || user.isAnonymous || !user.email || user.emailVerified) return;
        const now = Date.now();
        if (now - reloadAt < 20000) return;
        reloadAt = now;
        try { await user.reload(); } catch (e) { return; }
        if (user.emailVerified) {
            notify('EMAIL VERIFIED');
            renderVerifyPill();
            renderManage();
            if (isPfPanelOpen()) rerenderPfLinkRow();
        }
    }

    // ── Driver chip badge ───────────────────────────────────────────────
    // The chip answers exactly ONE question: which provider owns this
    // session. Verification state lives in the verify pill + account
    // center — the old yellow "EMAIL !" beside the driver name read like
    // a broken link and confused players whose email WAS connected.
    function refreshChipBadge() {
        const chip = document.getElementById('menu-profile');
        if (!chip) return;
        let b = chip.querySelector('.rla-chip-badge');
        if (!user) { if (b) b.remove(); return; }
        const pid = providerIdOf(user);
        const conf = {
            google: ['GOOGLE', 'rla-b-g'],
            guest:  ['GUEST', 'rla-b-guest'],
            email:  ['EMAIL', user.emailVerified ? 'rla-b-ok' : ''],
        }[pid] || [pid.toUpperCase(), ''];
        if (!b) {
            b = el('span', 'rla-chip-badge');
            chip.appendChild(b);
        }
        b.textContent = conf[0];
        b.className = 'rla-chip-badge ' + conf[1];
        b.title = pid === 'email' ? ('Signed in with ' + (user.email || 'email') + (user.emailVerified ? ' · verified' : ' · verification pending')) :
                  pid === 'google' ? 'Signed in with Google' : 'Guest session (this device)';
    }

    // ── Profile-panel link row (delegated from Profile._renderAccounts) ─
    function rerenderPfLinkRow() {
        const row = document.getElementById('pf-link-row');
        if (row) renderLinkRow(row);
    }
    function renderLinkRow(row) {
        if (!row) return;
        row.textContent = '';
        row.classList.add('rla-linkrow');
        if (!auth || !ready) {
            const n = el('div', 'rla-note');
            n.textContent = auth
                ? 'SIGN-IN STATUS STARTING…'
                : 'CLOUD AUTH UNAVAILABLE — PROFILE STAYS LOCAL (GAME FULLY PLAYABLE)';
            row.appendChild(n);
            return;
        }
        if (!user) {
            const n = el('div', 'rla-note', 'NOT SIGNED IN — THIS PROFILE LIVES ON THIS DEVICE.');
            row.appendChild(n);
            return;
        }
        const pid = providerIdOf(user);
        const top = el('div', 'rla-acct-row');
        const k = el('span', 'rla-acct-k', 'ACCOUNT');
        const v = el('span', 'rla-acct-v');
        if (pid === 'guest') {
            v.textContent = 'GUEST SESSION';
            const b = el('span', 'rla-badge rla-b-guest', 'ON THIS DEVICE');
            v.appendChild(b);
        } else {
            v.textContent = user.email || '(email hidden)';
            const b = pid === 'google'
                ? el('span', 'rla-badge rla-b-g', 'GOOGLE')
                : (user.emailVerified ? el('span', 'rla-badge rla-b-ok', 'VERIFIED') : el('span', 'rla-badge rla-b-warn', 'UNVERIFIED'));
            v.appendChild(b);
        }
        top.appendChild(k); top.appendChild(v);
        row.appendChild(top);

        // ONE big entry button — everything account-related (add email &
        // password, connect Google, resend verification, sign out) lives
        // inside the account center it opens, so this panel stays clean.
        const open = el('button', 'rla-manage-big', 'MANAGE ACCOUNT');
        open.type = 'button';
        open.addEventListener('click', () => openManage());
        row.appendChild(open);
        // (The "add a sign-in method to keep your progress…" note was
        // removed by design — the ACCOUNT row already says what is active.)
    }

    // ── Profile panel visibility helpers ────────────────────────────────
    function cachePfPanel() { els.pfPanelOpen = !!document.getElementById('profile-menu'); }
    function isPfPanelOpen() {
        const p = document.getElementById('profile-menu');
        return !!(p && !p.classList.contains('hidden'));
    }
    function rerenderPfPanelIfOpen() {
        if (typeof Profile !== 'undefined' && Profile._panelOpen && Profile._panelOpen()) Profile.renderPanel();
    }

    // ═══════════════════════════ UI CONSTRUCTION ═══════════════════════
    // The whole gate is built once from constant structure. Dynamic values
    // (emails, names, errors) are ONLY ever assigned via .textContent.
    function buildUI() {
        const ov = el('div');
        ov.id = 'rla-overlay';
        ov.className = 'rla-hidden';
        ov.setAttribute('role', 'dialog');
        ov.setAttribute('aria-modal', 'true');
        ov.setAttribute('aria-label', 'Sign in to Redline 2D');

        // ── Gate card ──
        const card = el('div', 'rla-card');
        card.id = 'rla-card';

        const brand = el('h2', 'rla-brand');
        brand.id = 'rla-brand';
        const b1 = el('span', null, 'REDLINE ');
        const b2 = el('span', 'rla-2d', '2D');
        brand.appendChild(b1); brand.appendChild(b2);

        const bannerEl = el('div', 'rla-banner');
        bannerEl.setAttribute('aria-live', 'assertive');

        // Tabs
        const tabs = el('div', 'rla-tabs');
        const tabSi = el('button', 'rla-tab rla-on', 'SIGN IN');
        const tabRg = el('button', 'rla-tab', 'CREATE ACCOUNT');
        tabSi.type = 'button'; tabRg.type = 'button';
        tabSi.addEventListener('click', () => setMode('signin'));
        tabRg.addEventListener('click', () => setMode('register'));
        tabs.appendChild(tabSi); tabs.appendChild(tabRg);

        // Google
        const gBtn = el('button', 'rla-btn rla-google', 'CONTINUE WITH GOOGLE');
        gBtn.type = 'button';
        gBtn.insertBefore(svgEl(SVG.google), gBtn.firstChild);
        gBtn.addEventListener('click', async () => {
            if (busy) return;
            clearFieldErrors();
            setBusy(true, 'OPENING GOOGLE…');
            const r = await signInGoogle();
            setBusy(false);
            if (!r.ok) {
                const f = friendly(r.err);
                if (f.kind !== 'silent') banner(f);
            }
        });

        const div1 = el('div', 'rla-div', 'OR');

        // ── Sign-in form ──
        const fSi = el('form', 'rla-form');
        fSi.setAttribute('aria-hidden', 'false');
        fSi.noValidate = true;
        const siEmailF = field('EMAIL', 'si-email', 'email', 'email', 'email', 'YOU@TRACK.COM');
        const siPassF = pwField('PASSWORD', 'si-pass', 'current-password');
        const siLinks = el('div', 'rla-links');
        const forgot = el('button', 'rla-linkbtn', 'FORGOT PASSWORD?');
        forgot.type = 'button';
        forgot.addEventListener('click', () => setMode('forgot'));
        siLinks.appendChild(forgot);
        const siErrWrap = el('div');
        const siBtn = el('button', 'rla-btn', 'SIGN IN');
        siBtn.type = 'submit';
        siBtn.dataset.rlaMain = 'SIGN IN';
        fSi.append(siEmailF.wrap, siPassF.wrap, siLinks, siErrWrap, siBtn);
        fSi.addEventListener('submit', async ev => {
            ev.preventDefault();
            if (busy) return;
            clearFieldErrors();
            const email = siEmailF.input.value.trim().toLowerCase();
            const pass = siPassF.input.value;
            let bad = false;
            if (!email) { fieldError(siEmailF.input, siEmailF.err, 'ENTER YOUR EMAIL'); bad = true; }
            else if (!EMAIL_RE.test(email)) { fieldError(siEmailF.input, siEmailF.err, 'THAT EMAIL LOOKS MALFORMED'); bad = true; }
            if (!pass) { fieldError(siPassF.input, siPassF.err, 'ENTER YOUR PASSWORD'); bad = true; }
            if (bad) { banner({ text: 'CHECK THE HIGHLIGHTED FIELDS', kind: 'err' }); return; }
            setBusy(true, 'SIGNING IN…');
            const r = await signInEmail(email, pass);
            setBusy(false);
            if (!r.ok) {
                const f = friendly(r.err);
                if (f.kind === 'silent') return;
                banner(f);
                if (f.text.indexOf('WRONG') === 0) fieldError(siPassF.input, siPassF.err, '×');
            } else {
                try { localStorage.setItem(STORE_LAST, email); } catch (e) {}
            }
        });

        // ── Register form ──
        const fRg = el('form', 'rla-form');
        fRg.setAttribute('aria-hidden', 'true');
        fRg.noValidate = true;
        const rgNameF = field('DRIVER NAME', 'rg-name', 'text', 'nickname', false, 'RED RACER', 14);
        const rgEmailF = field('EMAIL', 'rg-email', 'email', 'email', 'email', 'YOU@TRACK.COM');
        const rgPassF = pwField('PASSWORD (6+)', 'rg-pass', 'new-password', true);
        const rgErrWrap = el('div');
        const rgBtn = el('button', 'rla-btn rla-green', 'CREATE ACCOUNT');
        rgBtn.type = 'submit';
        rgBtn.dataset.rlaMain = 'CREATE ACCOUNT';
        fRg.append(rgNameF.wrap, rgEmailF.wrap, rgPassF.wrap, rgErrWrap, rgBtn);
        fRg.addEventListener('submit', async ev => {
            ev.preventDefault();
            if (busy) return;
            clearFieldErrors();
            const name = rgNameF.input.value.trim();
            const email = rgEmailF.input.value.trim().toLowerCase();
            const pass = rgPassF.input.value;
            let bad = false;
            let saneName = null;
            if (typeof Profile !== 'undefined' && Profile._sanitizeName) {
                saneName = Profile._sanitizeName(name);
                if (!saneName) { fieldError(rgNameF.input, rgNameF.err, '2-14 LETTERS / DIGITS / _ . -'); bad = true; }
            }
            if (!email) { fieldError(rgEmailF.input, rgEmailF.err, 'ENTER YOUR EMAIL'); bad = true; }
            else if (!EMAIL_RE.test(email)) { fieldError(rgEmailF.input, rgEmailF.err, 'THAT EMAIL LOOKS MALFORMED'); bad = true; }
            if (!pass || pass.length < 6) { fieldError(rgPassF.input, rgPassF.err, '6 CHARACTERS MINIMUM'); bad = true; }
            if (bad) { banner({ text: 'CHECK THE HIGHLIGHTED FIELDS', kind: 'err' }); return; }
            setBusy(true, 'CREATING…');
            const r = await registerEmail(email, pass);
            setBusy(false);
            if (!r.ok) {
                const f = friendly(r.err);
                if (f.kind !== 'silent') banner(f);
                return;
            }
            try { localStorage.setItem(STORE_LAST, email); } catch (e) {}
            // The account-switch reload (different uid than boot) races this
            // handler — hand the chosen name across the reload so the
            // driver never silently loses it.
            if (saneName) {
                try { localStorage.setItem(STORE_PNAME, saneName); } catch (e) {}
                if (typeof Profile !== 'undefined' && Profile.data &&
                    saneName.toLowerCase() !== String(Profile.data.name || '').toLowerCase()) {
                    Profile.setName(saneName);
                }
            }
        });

        // ── Forgot form ──
        const fFg = el('form', 'rla-form');
        fFg.setAttribute('aria-hidden', 'true');
        fFg.noValidate = true;
        const fgBack = el('button', 'rla-linkbtn', '← BACK TO SIGN IN');
        fgBack.type = 'button';
        fgBack.addEventListener('click', () => setMode('signin'));
        const fgEmailF = field('ACCOUNT EMAIL', 'fg-email', 'email', 'email', 'email', 'YOU@TRACK.COM');
        const fgErrWrap = el('div');
        const fgBtn = el('button', 'rla-btn', 'SEND RESET LINK');
        fgBtn.type = 'submit';
        fgBtn.dataset.rlaMain = 'SEND RESET LINK';
        fFg.append(fgBack, fgEmailF.wrap, fgErrWrap, fgBtn);
        fFg.addEventListener('submit', async ev => {
            ev.preventDefault();
            if (busy) return;
            clearFieldErrors();
            const email = fgEmailF.input.value.trim().toLowerCase();
            if (!email) { fieldError(fgEmailF.input, fgEmailF.err, 'ENTER YOUR EMAIL'); return; }
            if (!EMAIL_RE.test(email)) { fieldError(fgEmailF.input, fgEmailF.err, 'THAT EMAIL LOOKS MALFORMED'); return; }
            setBusy(true, 'SENDING…');
            const r = await sendReset(email);
            setBusy(false);
            if (!r.ok) {
                const f = friendly(r.err);
                if (f.kind !== 'silent') banner(f);
                return;
            }
            // Email-enumeration protection: Firebase answers OK whether or
            // not the address exists — mirror that in the copy.
            banner({ text: 'RESET LINK SENT — CHECK YOUR INBOX (AND SPAM)', kind: 'ok' });
            fgEmailF.input.value = '';
        });

        // ── Guest strip ──
        const div2 = el('div', 'rla-div', 'OR');
        const gBtn2 = el('button', 'rla-btn rla-guest', 'CONTINUE AS GUEST');
        gBtn2.type = 'button';
        gBtn2.dataset.rlaMain = 'CONTINUE AS GUEST';
        gBtn2.addEventListener('click', async () => {
            if (busy) return;
            clearFieldErrors();
            setBusy(true, 'STARTING…');
            const r = await guestSignIn();
            setBusy(false);
            if (!r.ok) banner(friendly(r.err));
        });

        card.append(brand, bannerEl, tabs, gBtn, div1, fSi, fRg, fFg, div2, gBtn2);

        // ── Manage card (account center) ──
        const mCard = el('div', 'rla-card rla-hidden');
        mCard.id = 'rla-manage';
        const mBrand = el('h2', 'rla-brand');
        const m1 = el('span', null, 'ACCOUNT ');
        const m2 = el('span', 'rla-2d', 'CENTER');
        mBrand.append(m1, m2);
        const mBanner = el('div', 'rla-banner');
        mBanner.setAttribute('aria-live', 'assertive');
        const mBody = el('div', 'rla-manage-body');
        mCard.append(mBrand, mBanner, mBody);

        ov.append(card, mCard);
        document.body.appendChild(ov);

        // Cache elements
        els.overlay = ov; els.card = card; els.manageCard = mCard;
        els.banner = bannerEl; els.mBanner = mBanner; els.mBody = mBody;
        els.tabSi = tabSi; els.tabRg = tabRg;
        els.fSi = fSi; els.fRg = fRg; els.fFg = fFg;
        els.siEmail = siEmailF.input; els.siEmailErr = siEmailF.err;
        els.siPass = siPassF.input; els.siPassErr = siPassF.err;
        els.rgName = rgNameF.input; els.rgNameErr = rgNameF.err;
        els.rgEmail = rgEmailF.input; els.rgEmailErr = rgEmailF.err;
        els.rgPass = rgPassF.input; els.rgPassErr = rgPassF.err;
        els.fgEmail = fgEmailF.input; els.fgEmailErr = fgEmailF.err;
        els.gBtn = gBtn; els.gBtn2 = gBtn2;

        // BOOT-LOCK: the inline <head> script already hid the game (no
        // persisted session marker) — raise the gate THIS instant, before
        // Firebase's first onAuthStateChanged round-trip, so a signed-out
        // visitor never sees the main menu flash for 1–3 s. If Firebase
        // then reports a real session, onUser() unlocks immediately.
        if (document.documentElement.classList.contains('rla-bootlock')) {
            showGate('signin', null);
        }

        // Verify pill (lives inside the main menu, above the record line)
        const menu = document.getElementById('main-menu');
        if (menu) {
            const pill = el('div', 'rla-pill rla-hidden');
            const pt = el('span', 'rla-pill-text');
            const pr = el('button', 'rla-pillbtn', 'RESEND');
            pr.type = 'button';
            const px = el('button', 'rla-pillbtn rla-x', '×');
            px.type = 'button';
            px.setAttribute('aria-label', 'Dismiss verification reminder');
            pr.addEventListener('click', async () => {
                pr.disabled = true;
                const r = await resendVerification();
                if (r && r.ok) { notify('VERIFICATION EMAIL SENT'); renderVerifyPill(); }
                else { const f = friendly(r && r.err); notify((f.text || 'COULD NOT SEND').slice(0, 34)); refreshVerifyButtons(); }
            });
            px.addEventListener('click', () => {
                try { sessionStorage.setItem(STORE_VDIS, '1'); } catch (e) {}
                renderVerifyPill();
            });
            pill.append(pt, pr, px);
            menu.appendChild(pill);
            els.pill = pill; els.pillText = pt; els.pillResend = pr;
        }

        // Focus trap + Escape handling
        ov.addEventListener('keydown', trap);
        ov.addEventListener('keydown', e => {
            if (e.key === 'Escape') {
                if (mode === 'manage') { e.preventDefault(); closeManage(); }
                // In gate mode Escape intentionally does nothing — the
                // player must either sign in or continue as a guest.
            }
        });
    }

    // field(): label + input + error line, all inert until wired
    function field(label, id, type, autocomplete, inputmode, placeholder, maxlength) {
        const wrap = el('div', 'rla-field');
        const lab = el('label', 'rla-label', label);
        const input = el('input', 'rla-input');
        input.type = type;
        input.id = 'rla-' + id;
        input.autocomplete = autocomplete || 'off';
        input.spellcheck = false;
        input.maxLength = maxlength || 254;
        input.placeholder = placeholder || '';
        if (inputmode) input.inputMode = inputmode;
        input.autocapitalize = 'none';
        lab.htmlFor = input.id;
        const err = el('div', 'rla-errline');
        err.id = 'rla-' + id + '-err';
        input.setAttribute('aria-describedby', err.id);
        wrap.append(lab, input, err);
        input.addEventListener('input', () => fieldError(input, err, null));
        return { wrap, input, err };
    }
    function pwField(label, id, autocomplete, withMeter) {
        const f = field(label, id, 'password', autocomplete, false, '••••••••', 128);
        const wrapInner = el('div', 'rla-pw-wrap');
        f.input.parentNode.insertBefore(wrapInner, f.input);
        wrapInner.appendChild(f.input);
        const eye = el('button', 'rla-eye');
        eye.type = 'button';
        eye.setAttribute('aria-label', 'Show password');
        eye.appendChild(svgEl(SVG.eye));
        eye.addEventListener('click', () => {
            const show = f.input.type === 'password';
            f.input.type = show ? 'text' : 'password';
            eye.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
            eye.textContent = '';
            eye.appendChild(svgEl(show ? SVG.eyeOff : SVG.eye));
            f.input.focus();
        });
        wrapInner.appendChild(eye);
        // Caps-lock watchdog — classic sign-in pain: warn inline while
        // typing when CapsLock is engaged (passwords are case-sensitive).
        const caps = el('div', 'rla-caps', 'CAPS LOCK IS ON');
        caps.setAttribute('aria-live', 'polite');
        f.wrap.insertBefore(caps, f.err);
        const capsSync = e => {
            const on = !!(e && e.getModifierState && e.getModifierState('CapsLock'));
            caps.classList.toggle('rla-show', on);
        };
        f.input.addEventListener('keydown', capsSync);
        f.input.addEventListener('keyup', capsSync);
        f.input.addEventListener('focus', capsSync);
        f.input.addEventListener('blur', () => caps.classList.remove('rla-show'));
        if (withMeter) {
            const meter = el('div', 'rla-meter');
            meter.setAttribute('aria-hidden', 'true');
            const segs = [];
            for (let i = 0; i < 4; i++) { const s = el('i'); meter.appendChild(s); segs.push(s); }
            const ml = el('span', 'rla-meter-label', '');
            meter.appendChild(ml);
            f.wrap.appendChild(meter);
            f.input.addEventListener('input', () => {
                const v = f.input.value;
                let score = 0;
                if (v.length >= 6) score++;
                if (v.length >= 10) score++;
                if (/[A-Za-z]/.test(v) && /\d/.test(v)) score++;
                if (/[^A-Za-z0-9]/.test(v) && v.length >= 8) score++;
                segs.forEach((s, i) => { s.className = i < score ? 'rla-s' + score : ''; });
                ml.textContent = v ? (['TOO SHORT', 'WEAK', 'OKAY', 'GOOD', 'STRONG'][score]) : '';
            });
        }
        return f;
    }

    // ── Mode switching (gate) ───────────────────────────────────────────
    function setMode(m) {
        mode = m;
        if (m === 'signin' || m === 'register') {
            try { localStorage.setItem(STORE_MODE, m); } catch (e) {}
        }
        const isSi = m === 'signin', isRg = m === 'register', isFg = m === 'forgot';
        els.tabSi.parentElement.classList.toggle('rla-hidden', isFg);
        els.tabSi.classList.toggle('rla-on', isSi);
        els.tabRg.classList.toggle('rla-on', isRg);
        els.fSi.setAttribute('aria-hidden', String(!isSi));
        els.fSi.classList.toggle('rla-hidden', !isSi);
        els.fRg.setAttribute('aria-hidden', String(!isRg));
        els.fRg.classList.toggle('rla-hidden', !isRg);
        els.fFg.setAttribute('aria-hidden', String(!isFg));
        els.fFg.classList.toggle('rla-hidden', !isFg);
        els.gBtn.classList.toggle('rla-hidden', isFg);
        const divs = els.card.querySelectorAll('.rla-div');
        divs.forEach(d => d.classList.toggle('rla-hidden', isFg));
        els.gBtn2.classList.toggle('rla-hidden', isFg);
        banner(null);
        clearFieldErrors();
        setTimeout(focusFirst, 60);
    }

    function showGate(m, msg, kind) {
        mode = m || 'signin';
        // Returning visitors land on the tab they used last time (launch
        // gate only — explicit sign-outs always come back to SIGN IN).
        if (mode === 'signin' && !msg) {
            try { if (localStorage.getItem(STORE_MODE) === 'register') mode = 'register'; } catch (e) {}
        }
        els.card.classList.remove('rla-hidden');
        els.manageCard.classList.add('rla-hidden');
        try {
            if (mode === 'signin' && els.siEmail && !els.siEmail.value) {
                const last = localStorage.getItem(STORE_LAST);
                if (last && EMAIL_RE.test(last)) els.siEmail.value = last;
            }
        } catch (e) {}
        lock();
        setMode(mode);
        if (msg) banner({ text: msg, kind: kind || 'info' });
        refreshChipBadge();
        renderVerifyPill();
    }

    // ── Manage (account center) ─────────────────────────────────────────
    function openManage(sub) {
        mode = 'manage';
        els.card.classList.add('rla-hidden');
        els.manageCard.classList.remove('rla-hidden');
        els.mgSub = sub || null;
        lock();
        renderManage();
        els.mBanner.className = 'rla-banner';
        els.mBanner.textContent = '';
        setTimeout(focusFirst, 260);
    }
    function closeManage() {
        if (mode !== 'manage') return;
        mode = 'signin';
        els.manageCard.classList.add('rla-hidden');
        unlock();
        rerenderPfPanelIfOpen();
    }
    function mBannerSet(data) {
        if (!data || !data.text) { els.mBanner.className = 'rla-banner'; els.mBanner.textContent = ''; return; }
        els.mBanner.textContent = data.text;
        els.mBanner.className = 'rla-banner rla-show rla-' + (data.kind || 'info');
    }

    function renderManage() {
        const body = els.mBody;
        if (!body) return;
        body.textContent = '';
        if (!user) { closeManage(); return; }
        const pid = providerIdOf(user);

        const rows = el('div', 'rla-acct-rows');
        const mkRow = (k, vNode) => {
            const r = el('div', 'rla-acct-row');
            r.appendChild(el('span', 'rla-acct-k', k));
            r.appendChild(vNode);
            return r;
        };
        const vWho = el('span', 'rla-acct-v');
        if (pid === 'guest') {
            vWho.textContent = 'GUEST SESSION';
            vWho.appendChild(el('span', 'rla-badge rla-b-guest', 'THIS DEVICE ONLY'));
        } else {
            vWho.textContent = user.email || '(email hidden)';
            vWho.appendChild(pid === 'google'
                ? el('span', 'rla-badge rla-b-g', 'GOOGLE')
                : (user.emailVerified ? el('span', 'rla-badge rla-b-ok', 'VERIFIED') : el('span', 'rla-badge rla-b-warn', 'UNVERIFIED')));
        }
        rows.appendChild(mkRow('SIGNED IN AS', vWho));

        const vUid = el('span', 'rla-acct-v', String(user.uid).slice(0, 18) + (user.uid.length > 18 ? '…' : ''));
        rows.appendChild(mkRow('USER ID', vUid));

        const vDriver = el('span', 'rla-acct-v', (typeof Profile !== 'undefined' && Profile.data) ? Profile.data.name : '—');
        rows.appendChild(mkRow('DRIVER', vDriver));
        // Account metadata — human-format dates, rendered via textContent.
        const fmtWhen = t => {
            try { const d = new Date(t); return isNaN(d) ? '—' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); }
            catch (e) { return '—'; }
        };
        rows.appendChild(mkRow('MEMBER SINCE', el('span', 'rla-acct-v', fmtWhen(user.metadata && user.metadata.creationTime))));
        rows.appendChild(mkRow('LAST SIGN-IN', el('span', 'rla-acct-v', fmtWhen(user.metadata && user.metadata.lastSignInTime))));
        body.appendChild(rows);

        const actions = el('div', 'rla-actions');

        // Unverified email → resend
        if (pid === 'email' && !user.emailVerified) {
            const note = el('p', 'rla-note', 'YOUR EMAIL ISN\'T VERIFIED YET — CHECK YOUR INBOX.');
            body.appendChild(note);
            const rv = el('button', 'rla-mini rla-mini-warn', 'RESEND VERIFICATION EMAIL');
            rv.type = 'button';
            els.mgResend = rv;
            rv.addEventListener('click', async () => {
                rv.disabled = true;
                const r = await resendVerification();
                if (r && r.ok) { mBannerSet({ text: 'VERIFICATION EMAIL SENT — CHECK YOUR INBOX', kind: 'ok' }); markVSent(); refreshVerifyButtons(); }
                else { const f = friendly(r && r.err); if (f.kind !== 'silent') mBannerSet(f); refreshVerifyButtons(); }
            });
            actions.appendChild(rv);
        } else {
            els.mgResend = null;
        }

        // Guest upgrade — add email & password (keeps the SAME uid)
        if (pid === 'guest') {
            const note = el('p', 'rla-note', 'ADD A SIGN-IN METHOD TO KEEP YOUR PROGRESS ON ANY DEVICE.');
            body.appendChild(note);
            if (els.mgSub === 'link' || els.mgSub === null) {
                const lkEmailF = field('EMAIL', 'lk-email', 'email', 'email', 'email', 'YOU@TRACK.COM');
                const lkPassF = pwField('NEW PASSWORD (6+)', 'lk-pass', 'new-password', false);
                els.lkEmail = lkEmailF.input; els.lkEmailErr = lkEmailF.err;
                els.lkPass = lkPassF.input; els.lkPassErr = lkPassF.err;
                const lkBtn = el('button', 'rla-btn rla-green', 'SAVE EMAIL & PASSWORD');
                lkBtn.type = 'submit';
                lkBtn.dataset.rlaMain = 'SAVE EMAIL & PASSWORD';
                const lkForm = el('form', 'rla-form');
                lkForm.noValidate = true;
                lkForm.append(lkEmailF.wrap, lkPassF.wrap, lkBtn);
                lkForm.setAttribute('aria-hidden', 'false');
                lkForm.addEventListener('submit', async ev => {
                    ev.preventDefault();
                    if (busy) return;
                    clearFieldErrors();
                    const email = lkEmailF.input.value.trim().toLowerCase();
                    const pass = lkPassF.input.value;
                    let bad = false;
                    if (!email) { fieldError(lkEmailF.input, lkEmailF.err, 'ENTER YOUR EMAIL'); bad = true; }
                    else if (!EMAIL_RE.test(email)) { fieldError(lkEmailF.input, lkEmailF.err, 'THAT EMAIL LOOKS MALFORMED'); bad = true; }
                    if (!pass || pass.length < 6) { fieldError(lkPassF.input, lkPassF.err, '6 CHARACTERS MINIMUM'); bad = true; }
                    if (bad) { mBannerSet({ text: 'CHECK THE HIGHLIGHTED FIELDS', kind: 'err' }); return; }
                    setBusy(true, 'LINKING…');
                    const r = await linkEmailPass(email, pass);
                    setBusy(false);
                    if (!r.ok) { const f = friendly(r.err); if (f.kind !== 'silent') mBannerSet(f); return; }
                    els.mgSub = null;
                    mBannerSet({ text: 'ACCOUNT SAVED — SAME DRIVER, NOW PERMANENT', kind: 'ok' });
                    renderManage();
                    postLinkRefresh();
                });
                body.appendChild(lkForm);
                const dvg = el('div', 'rla-div', 'OR CONNECT GOOGLE');
                body.appendChild(dvg);
            }
            const gl = el('button', 'rla-btn rla-google', 'CONNECT GOOGLE');
            gl.type = 'button';
            gl.insertBefore(svgEl(SVG.google), gl.firstChild);
            gl.addEventListener('click', async () => {
                if (busy) return;
                setBusy(true, 'OPENING GOOGLE…');
                const r = await linkGoogle();
                setBusy(false);
                if (!r.ok) {
                    const f = friendly(r.err);
                    if (f.kind !== 'silent') mBannerSet(f);
                    return;
                }
                els.mgSub = null;
                mBannerSet({ text: 'GOOGLE CONNECTED — SAME DRIVER, NOW PERMANENT', kind: 'ok' });
                renderManage();
                postLinkRefresh();
            });
            actions.appendChild(gl);
        }

        // Email user without Google → offer to connect Google too
        if (pid === 'email' && !(user.providerData && Array.prototype.some.call(user.providerData || [], p => p && p.providerId === 'google.com'))) {
            const gl = el('button', 'rla-btn rla-google', 'ALSO CONNECT GOOGLE');
            gl.type = 'button';
            gl.insertBefore(svgEl(SVG.google), gl.firstChild);
            gl.addEventListener('click', async () => {
                if (busy) return;
                setBusy(true, 'OPENING GOOGLE…');
                const r = await linkGoogle();
                setBusy(false);
                if (!r.ok) { const f = friendly(r.err); if (f.kind !== 'silent') mBannerSet(f); return; }
                mBannerSet({ text: 'GOOGLE CONNECTED', kind: 'ok' });
                renderManage();
                postLinkRefresh();
            });
            actions.appendChild(gl);
        }

        // Sign out
        const so = el('button', 'rla-btn rla-danger', 'SIGN OUT');
        so.type = 'button';
        so.dataset.rlaMain = 'SIGN OUT';
        so.addEventListener('click', async () => {
            if (busy) return;
            setBusy(true, 'SIGNING OUT…');
            const r = await signOut();
            setBusy(false);
            if (!r.ok) mBannerSet(friendly(r.err));
        });
        actions.appendChild(so);

        // Back (manage is opened from inside the game, never forced)
        const back = el('button', 'rla-btn rla-ghosty', 'BACK');
        back.type = 'button';
        back.addEventListener('click', () => closeManage());
        actions.appendChild(back);

        body.appendChild(actions);
    }

    // ── Boot ────────────────────────────────────────────────────────────
    function init() {
        if (inited) return;
        inited = true;
        if (typeof firebase === 'undefined' || !firebase.auth) {
            console.warn('[RLAuth] firebase-auth-compat missing — auth gate disabled, game stays local-first');
            return;
        }
        const cfg = getConfig();
        if (!cfg) {
            console.warn('[RLAuth] FIREBASE_CONFIG missing — auth gate disabled, game stays local-first');
            return;
        }
        try {
            const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(cfg);
            auth = app.auth();
        } catch (e) {
            console.warn('[RLAuth] firebase init failed — auth gate disabled:', e && e.message);
            auth = null;
            return;
        }
        buildUI();
        try { auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL); } catch (e) { /* private mode: SDK falls back */ }
        auth.onAuthStateChanged(onUser);
        // Watchdog: if Firebase never answers (hard-offline edge), stand
        // the gate down rather than holding the game hostage. ready=true
        // also releases the cloud gates in profile.js / friends.js.
        setTimeout(() => {
            if (!ready) {
                console.warn('[RLAuth] no auth state — standing down');
                ready = true;
                unlock();
            }
        }, 6000);
        window.addEventListener('focus', refreshVerifiedState);
        document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshVerifiedState(); });
        // Profile panel link row re-renders through our delegation each
        // time the panel opens (Profile._renderAccounts → renderLinkRow).
    }

    // Post-link refresh: linkWithCredential()/linkWithPopup() do NOT
    // re-fire onAuthStateChanged (same uid, new provider list), so the
    // profile mirror + chip + pill are refreshed explicitly instead.
    function postLinkRefresh() {
        syncProfile(user);
        refreshChipBadge();
        renderVerifyPill();
        if (isPfPanelOpen()) rerenderPfLinkRow();
    }
    // ── Public surface ──────────────────────────────────────────────────
    window.RLAuth = {
        isLocked: isLocked,
        user: () => user,
        providerId: () => providerIdOf(user),
        ready: () => ready,
        openManage: openManage,
        renderLinkRow: renderLinkRow,
    };

    // Wire the ProfileAuth seam: google/email become REAL providers.
    // (Profile.linkAccount uses this when the delegated link row is not
    // rendered — kept functional for API completeness.)
    if (typeof ProfileAuth !== 'undefined' && ProfileAuth && ProfileAuth.providers) {
        ProfileAuth.providers.google.available = () => !!auth;
        ProfileAuth.providers.email.available = () => !!auth;
        ProfileAuth.signIn = async function (providerId) {
            if (providerId === 'google' && auth) {
                const r = await signInGoogle();
                if (r.ok) return { ok: true, uid: (user && user.uid) || null, provider: 'google' };
                return { ok: false, reason: 'error' };
            }
            return { ok: false, reason: 'unavailable' };
        };
    }

    init();
})();
