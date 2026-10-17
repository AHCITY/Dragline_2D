'use strict';

/* ─── Redline 2D — Friends ──────────────────────────────────────────
 *
 * The social graph around the Profile ID (the canonical player key, kept
 * stable on purpose so future Google / Play Games / email linking never
 * orphans a friend list).
 *
 * The local store mirrors the Firebase Realtime Database layout 1:1, so the
 * rules you write for the cloud are also what governs the local mirror:
 *
 *     pdl_friendRequests/<toId>/<fromId> = { from, fromName, ts }
 *         - keyed BY SENDER: one outstanding request per pair by design,
 *           duplicates overwrite instead of piling up.
 *     pdl_requestOutcomes/<senderId>/<declinerId> = { status, at }
 *         - short-lived RECEIPT the decliner drops into the sender's own
 *           subtree: the pending request clears from the sender's list with
 *           an honest "DECLINED" instead of hanging as a ghost forever.
 *           The sender deletes the receipt after reading it (one-shot).
 *     pdl_friends/<uid>/<friendUid>      = { name, ts }
 *         - written to BOTH sides on accept; ALSO the reconciliation
 *           channel — each client listens to its OWN subtree, so an accept
 *           that lands while the sender is offline syncs on their next
 *           launch instead of leaving a one-sided friendship.
 *     pdl_presence/<uid>                 = { online, lastSeen, name }
 *         - .info/connected + onDisconnect() pattern.
 *     pdl_profiles/<uid>                 = { name, av, stats, ... }
 *         - CANONICAL identity (owned by profile.js). Friend rows mirror
 *           it via live per-friend listeners, so a rename or avatar change
 *           propagates to every friend's list automatically — no
 *           denormalized fan-out writes needed.
 *     pdl_invites/<toId>/<fromId>        = { from, fromName, code, ts }
 *         - a friend who is ONLINE taps INVITE; the room code they need is
 *           written here so accepting needs no code typing at all.
 *
 * WHY THE CLOUD MAILBOX (the previous version of this file)
 * --------------------------------------------------------
 * Friend requests used to ride the DTLS P2P channel only. That channel
 * exists ONLY while two players are already connected in a lobby — so a
 * request could never reach anyone you weren't already racing. It was
 * written into the local `outgoing` map and then never transmitted, which
 * is why requests appeared to vanish in both directions. A social graph
 * needs a transport that survives "not currently in the same room", so
 * requests/presence/invites now go through the same Firebase project the
 * multiplayer lobby already uses. The P2P path is KEPT and still runs —
 * it delivers instantly when you happen to already be connected — but it
 * is no longer the only way a request travels.
 *
 * PER-PROFILE OWNERSHIP (no leaking between players)
 * --------------------------------------------------
 * The store key is namespaced by Profile ID (`friends_v2_<profileId>`), so
 * each driver on a shared machine has their OWN list, requests and blocks.
 * The previous single global `friends_v1` key meant every profile on the
 * browser saw the same friends — that was a real leak and is fixed here.
 * The cloud side is likewise per-uid: you only ever read your own
 * requests/presence node, and your friend list is mirrored under your uid.
 * ─────────────────────────────────────────────────────────────────────── */

const FRIENDS_STORAGE_PREFIX = 'friends_v2_';
const LEGACY_FRIENDS_STORAGE_KEY = 'friends_v1'; // read once, then left on disk
/* Records WHICH profile adopted the old global friends_v1 list. Without it
   every profile lacking its own key would re-adopt the same list, so a second
   driver on the same browser would inherit the first driver's friends. The
   legacy save itself is never deleted — only this marker stops it being read. */
const LEGACY_CLAIM_KEY = 'friends_v2_legacy_claimed';
const FRIEND_NAME_MAX = 20;
/* Per-target resend cooldown: a decline (or a lost request) should hurt a
   little before retrying, and a stuck UI must never rapid-fire a mailbox. */
const FRIEND_REQ_COOLDOWN_MS = 60000;
/* Ghost horizon: an outgoing request the receiver never answered
   self-expires after this many days so it can't block a future re-request
   forever. Each client janitors its OWN rows — no server needed. */
const FRIEND_GHOST_DAYS = 7;
/* V10F1-INVITE-TTL */
/* Cached avatars ride the local friend row only (the canonical copy stays
   in pdl_profiles, matching the cloud rules cap). */
const FRIEND_AV_MAX_BYTES = 40000;
/* PRESENCE-V2: a presence node whose lastSeen heartbeat is colder than this
   is a GHOST (its writer died without the onDisconnect running — hard kill,
   power loss) and is shown offline even though the node still says
   online:true. Generous by design: 3 missed 60 s heartbeats + slack for
   mobile radio churn. */
const FRIEND_PRESENCE_STALE_MS = 180000;

/* ── Race-invite window ─────────────────────────────────────────────
   INVITE_TTL_MS is THE single knob: set it to 30000 and every surface
   (receiver card + countdown bar, receiver timer, sender wait) follows.
   INVITE_EXPIRY_GRACE_MS absorbs network/queue delay when judging the
   timestamp of a node that just arrived; INVITE_SENDER_GRACE_MS keeps the
   host alive a moment LONGER than the receiver's card so an accept that
   lands in the last instants still finds a room. */
const INVITE_TTL_MS = 15000;
const INVITE_EXPIRY_GRACE_MS = 5000;
const INVITE_SENDER_GRACE_MS = 3000;

const Friends = {
    data: null,
    _loaded: false,
    _profileId: null,        // the profile this data belongs to
    _unsubs: [],             // live Firebase listeners, torn down on profile change
/* V10F2-INVITE-STATE */
    _pendingInvites: {},     // invites that arrived while we weren't listening
    // Race-invite machinery (see the expiry block near the actions):
    _inviteTimers: {},       // per-sender expiry timers for RECEIVED invites
    _inviteCardEls: {},      // invite id -> visible card element
    _serverSkew: 0,          // Firebase .info/serverTimeOffset (ms)
    _acceptingId: null,      // in-flight accept (double-tap guard)
    _sentInvite: null,       // {id, code} of the invite WE are waiting on
    _sentInviteTimer: 0,     // sender-side expiry timer

    async init() {
        if (this._loaded) return;
        this._loaded = true;
        const pid = (typeof Profile !== 'undefined' && Profile.data) ? Profile.data.id : null;
        if (!pid) { this.data = this._migrate(null); return; }
        await this._loadFor(pid);
        this.startCloud();
    },

    // The store is keyed by profile id, so switching drivers on the same
    // browser swaps to a completely separate social graph.
    _storageKey(pid) { return FRIENDS_STORAGE_PREFIX + pid; },

    // Has any profile already adopted the pre-namespaced friends_v1 list?
    async _legacyClaimed() {
        try { return !!(await SaveSystem.load(LEGACY_CLAIM_KEY)); } catch (e) { return false; }
    },

    async _loadFor(pid) {
        let raw = null;
        try { raw = await SaveSystem.load(this._storageKey(pid)); } catch (e) {}
        // One-time migration from the old global key. It is only adopted when
        // it is non-empty and no profile has claimed it yet, and it is COPIED
        // into this profile's own key — the legacy save is left untouched on
        // disk, a tombstone just stops anyone re-reading it. Existing players
        // keep their friends; a second profile on the same browser starts
        // clean instead of inheriting them.
        if (!raw && !(await this._legacyClaimed())) {
            let legacy = null;
            try { legacy = await SaveSystem.load(LEGACY_FRIENDS_STORAGE_KEY); } catch (e) {}
            if (legacy && typeof legacy === 'object' && legacy.friends &&
                Object.keys(legacy.friends).length) {
                raw = legacy;
                // Tombstone AFTER the profile's own copy is durable, so an
                // interrupted migration can never lose the list.
                this.data = this._migrate(raw);
                await this._persistAsync();
                try { await SaveSystem.save(LEGACY_CLAIM_KEY, pid); } catch (e) {}
            }
        }
        this._profileId = pid;
        this.data = this._migrate(raw);
        this._expireStale();
        this._persist();
    },

    /* Client-side janitor (the no-server cleanup pattern): outgoing
       requests nobody answered expire after FRIEND_GHOST_DAYS, cooldown
       residues age out after a day. Stops a ghosted request from blocking
       a pair forever without touching anyone else's data. */
    _expireStale() {
        if (!this.data) return;
        const now = Date.now();
        let dirty = false;
        for (const [id, r] of Object.entries(this.data.outgoing || {})) {
            if (r.ts && now - r.ts > FRIEND_GHOST_DAYS * 86400000) {
                delete this.data.outgoing[id];
                dirty = true;
            }
        }
        for (const [id, t] of Object.entries(this.data.lastReqAt || {})) {
            if (now - t > 86400000) { delete this.data.lastReqAt[id]; dirty = true; }
        }
        if (dirty) this._persist();
    },

    // Called if the profile id changes underneath us (profile reset). Drops
    // every listener so the old profile's requests can never write into the
    // new one's list.
    async setProfile(pid) {
        const norm = String(pid || '').replace(/[^0-9a-f]/gi, '').toLowerCase().slice(0, 16);
        if (!norm || norm === this._profileId) return;
        this.stopCloud();
        await this._loadFor(norm);
        this.startCloud();
        this._render();
    },

    _migrate(raw) {
        const d = (raw && typeof raw === 'object') ? raw : {};
        const pickMap = src => {
            const out = {};
            if (src && typeof src === 'object') {
                for (const [k, v] of Object.entries(src)) {
                    const id = String(k).toLowerCase().replace(/[^0-9a-f]/g, '').slice(0, 16);
                    if (id.length === 16 && v && typeof v === 'object') {
                        out[id] = {
                            name: String(v.name || v.fromName || '').slice(0, FRIEND_NAME_MAX),
                            fromName: String(v.fromName || v.name || '').slice(0, FRIEND_NAME_MAX),
                            ts: +v.ts || 0,
                            lastRaced: +v.lastRaced || 0,
                            av: (typeof v.av === 'string' && v.av.length <= FRIEND_AV_MAX_BYTES) ? v.av : null,
                        };
                    }
                }
            }
            return out;
        };
        return {
            v: 2,
            owner: this._profileId || null,   // stamped so a store can't be read as someone else's
            friends: pickMap(d.friends),
            incoming: pickMap(d.incoming),
            outgoing: pickMap(d.outgoing),
            blocked: pickMap(d.blocked),
            lastReqAt: (d.lastReqAt && typeof d.lastReqAt === 'object') ? d.lastReqAt : {},
        };
    },

    _persist() {
        this._persistAsync().catch(() => {});
    },

    // Awaitable twin of _persist(), used where a later write must not be able
    // to land first (the legacy-migration tombstone).
    async _persistAsync() {
        if (!this.data || !this._profileId) return;   // never write an unowned store
        this.data.owner = this._profileId;
        try { await SaveSystem.save(this._storageKey(this._profileId), this.data); } catch (e) {}
    },

    /* ── Helpers ───────────────────────────────────────────────────── */
    normalizeCode(input) {
        return String(input || '').toLowerCase().replace(/[^0-9a-f]/g, '').slice(0, 16);
    },

    isSelf(id) {
        return !!(typeof Profile !== 'undefined' && Profile.data && Profile.data.id === id);
    },

    isFriend(id) { return !!(this.data && this.data.friends[id]); },
    hasOutgoing(id) { return !!(this.data && this.data.outgoing[id]); },
    hasIncoming(id) { return !!(this.data && this.data.incoming[id]); },
    isBlocked(id) { return !!(this.data && this.data.blocked[id]); },

    /* ── Last-raced memory ──
       Local stand-in for the future pdl_presence/lastRace node: whenever a
       real race against this friend completes, multiplayer.js touches this
       timestamp and the friends list shows a friendly "LAST RACE 2H AGO". */
    touchLastRaced(id) {
        if (!this.data || !id) return;
        const f = this.data.friends[id];
        if (!f) return;
        f.lastRaced = Date.now();
        this._persist();
    },

    _relTime(ts) {
        const s = Math.max(0, (Date.now() - ts) / 1000);
        if (s < 90) return 'JUST NOW';
        if (s < 3600) return Math.floor(s / 60) + 'M AGO';
        if (s < 86400) return Math.floor(s / 3600) + 'H AGO';
        return Math.floor(s / 86400) + 'D AGO';
    },

    _fmt(id) {
        return (typeof Profile !== 'undefined') ? Profile.formatId(id) : id.toUpperCase();
    },

    /* A friend is ONLINE when their presence node says so. Being P2P-connected
       to them also counts — that is strictly stronger evidence than presence,
       and it keeps the dot lit during a race even if presence is briefly
       stale. Falls back to false (never throws) when there is no cloud, so the
       list still renders offline. */
    isOnline(id) {
        if (this._isPeerConnected(id)) return true;
        if (this._presenceCache && this._presenceCache[id]) return true;
        return false;
    },

    /* ── Cloud transport ───────────────────────────────────────────────
       Everything social now rides the same Firebase project the lobby uses.
       Each listener is registered under OUR uid only, so a profile can never
       observe another driver's requests, invites or presence. Every listener
       is pushed onto _unsubs and torn down on profile change — a listener
       left bound to the previous profile is exactly how one player's inbox
       would end up feeding another's list. */
    _db() {
        if (typeof MP === 'undefined' || !MP.ensureFirebase) return null;
        try { if (!MP.ensureFirebase()) return null; } catch (e) { return null; }
        return MP.db || null;
    },

    _myId() {
        if (typeof Profile === 'undefined' || !Profile.data) return null;
        return this.normalizeCode(Profile.data.id);
    },

    async startCloud() {
        // rules-v4-anonauth requires an AUTHENTICATED RTDB connection for
        // every social path (presence, requests, invites, friends). Hold
        // the listeners until Firebase Auth resolves — listeners attached
        // before that would be denied and sit dead until a reload. Bounded
        // at 5 s; the auth watchdog stands the layer down before that.
        if (window.RLAuth && typeof RLAuth.ready === 'function') {
            for (let i = 0; i < 50 && !RLAuth.ready(); i++) {
                await new Promise(r => setTimeout(r, 100));
            }
            if (!RLAuth.ready()) {
                /* PRESENCE-V2: slow network — the 5 s wait lost the race.
                   startCloud used to attach listeners anyway and they sat
                   DENIED until reload: no presence, no invites, no requests
                   for the whole session (the "every friend shows offline"
                   flavor of the status bug). Bail out and re-try — startCloud
                   is idempotent (stopCloud runs first) and the auth watchdog
                   force-resolves ready() within ~6 s, so the retry normally
                   lands on its first hop. */
                this._cloudStartTries = (this._cloudStartTries || 0) + 1;
                if (this._cloudStartTries <= 12) {
                    setTimeout(() => { this.startCloud(); }, 5000);
                }
                return;
            }
        }
        this._cloudStartTries = 0;
        const db = this._db();
        const me = this._myId();
        if (!db || !me) return;   // offline / not configured: P2P path still works
        this.stopCloud();
        try {
            // Presence (PRESENCE-V2): the FULL .info/connected pattern —
            // re-advertise on every (re)connect, heartbeat, crash-cleanup,
            // bounded retries. See _startPresence for the two failure modes
            // (idClaim race + reconnect never re-advertising) this replaces;
            // the old write-once block was the root cause of "A is online
            // but B sees A offline" while invites kept working.
            this._startPresence(me);

            // Incoming friend requests addressed to us.
            const reqs = db.ref('pdl_friendRequests/' + me);
            const onReq = reqs.on('child_added', snap => this._onCloudRequest(me, snap.key, snap.val()));
            this._unsubs.push(() => { try { onReq(); } catch (e) {} });
            const onReqGone = reqs.on('child_removed', snap => {
                // Sender withdrew it (or we accepted and cleaned it up).
                const id = this.normalizeCode(snap.key);
                if (id && this.data && this.data.incoming[id]) {
                    delete this.data.incoming[id];
                    this._persist();
                    this._render();
                }
            });
            this._unsubs.push(() => { try { onReqGone(); } catch (e) {} });

/* V10F3-CLOUD-INVITE-LISTENERS */
            // Server clock: invite expiry is judged against FIREBASE's
            // clock (via .info/serverTimeOffset), never the device clock —
            // a phone with a skewed clock can neither revive a dead invite
            // nor kill a live one.
            const skewRef = db.ref('.info/serverTimeOffset');
            const onSkew = skewRef.on('value', snap => {
                this._serverSkew = (typeof snap.val() === 'number') ? snap.val() : 0;
            });
            this._unsubs.push(() => { try { skewRef.off('value', onSkew); } catch (e) {} });

            // Invites to race. Surfaced as the dedicated right-edge card
            // (see _onCloudInvite) — never as a friends-list row.
            const invites = db.ref('pdl_invites/' + me);
            const onInvite = invites.on('child_added', snap => this._onCloudInvite(me, snap.key, snap.val()));
            this._unsubs.push(() => { try { onInvite(); } catch (e) {} });
            const onInviteGone = invites.on('child_removed', snap => this._onCloudInviteGone(snap.key));
            this._unsubs.push(() => { try { onInviteGone(); } catch (e) {} });

            // FRIEND-EDGE RECONCILIATION: our own pdl_friends subtree is the
            // source of truth for "who accepted me". Without this listener,
            // an accept that landed while we were offline (or mid-race)
            // never reached the local store — the friendship existed in the
            // cloud only, and our side sat on a "PENDING" row forever.
            // child_added replays existing children on attach, so a fresh
            // install also rebuilds its whole list from the cloud here.
            const mine = db.ref('pdl_friends/' + me);
            const onFriend = mine.on('child_added', snap => this._onCloudFriend(me, snap.key, snap.val()));
            this._unsubs.push(() => { try { onFriend(); } catch (e) {} });
            const onFriendGone = mine.on('child_removed', snap => {
                // The edge died in the cloud (we removed/blocked them, or a
                // peer-side sever we initiated) — mirror it locally.
                const id = this.normalizeCode(snap.key);
                if (id && this.data && this.data.friends[id]) {
                    delete this.data.friends[id];
                    delete this._pendingInvites[id];
                    this._persist();
                    this._render();
                    this._watchFriends(me);
                }
            });
            this._unsubs.push(() => { try { onFriendGone(); } catch (e) {} });

            // DECLINE RECEIPTS: the receiver of one of OUR requests drops a
            // short-lived receipt into this node when they decline. The
            // pending row then clears from OUR list with an honest
            // "DECLINED" instead of hanging there forever.
            const outcomes = db.ref('pdl_requestOutcomes/' + me);
            const onOutcome = outcomes.on('child_added', snap => this._onCloudOutcome(me, snap.key, snap.val()));
            this._unsubs.push(() => { try { onOutcome(); } catch (e) {} });

            // Presence + live profile of the friends we care about.
            this._watchFriends(me);
        } catch (e) {
            console.warn('Friends cloud listeners failed:', e);
        }
    },

/* V10F4-STOPCLOUD-INVITES */
    stopCloud() {
        // Timers + cards must die with their listeners: a card left on
        // screen after a profile switch would accept into the WRONG
        // identity's mailbox.
        this.clearAllInvites();
        for (const off of this._unsubs) { try { off(); } catch (e) {} }
        this._unsubs = [];
    },

    /* ── PRESENCE-V2 ───────────────────────────────────────────────────
       Cloud stamps ride firebase.database.ServerValue.TIMESTAMP: the
       SERVER's clock, resolved at write time. Every social validate rule
       bounds its timestamps with `now + 60000`, so a device clock running
       even ~60 s fast used to get its presence/invite/friend writes
       DENIED outright — one half of the "they can invite me but I can't
       invite them" report. Server stamps are always legal and always
       comparable (invite expiry already judges against this same clock).
       LOCAL timestamps stay Date.now(): the local store must stay
       consistent with the local clock it is compared against. */
    _serverTs() {
        try {
            if (typeof firebase !== 'undefined' && firebase.database && firebase.database.ServerValue) {
                return firebase.database.ServerValue.TIMESTAMP;
            }
        } catch (e) {}
        return Date.now();
    },

    /* The writer half of the canonical Firebase presence pattern. The old
       code wrote {online:true} exactly ONCE at boot and relied on a single
       armed onDisconnect. Two real failure modes fell out of that:
         1. The boot write raced the write-once pdl_idClaim on a brand-new
            account (both fire at first sign-in). The denial was swallowed
            and NEVER retried — the driver looked OFFLINE to every friend
            for the whole session while invites (which never read presence)
            kept working: the exact reported asymmetry.
         2. Any socket drop (wifi↔LTE, mobile backgrounding, laptop sleep)
            fired the server-side onDisconnect → online:false — and nothing
            ever re-advertised online after the SDK silently reconnected.
       What this installs instead:
         · .info/connected re-arms the crash write AND re-advertises online
           on EVERY (re)connect,
         · a 60 s heartbeat keeps lastSeen fresh (readers use it to retire
           ghost-online nodes — see _presenceSaysOnline),
         · visibilitychange/focus re-assert after mobile backgrounding,
         · pagehide/beforeunload flip offline immediately on a clean exit
           (no waiting for the socket teardown to time out),
         · denied writes retry with backoff + one idClaim repair. */
    _startPresence(me) {
        const db = this._db();
        if (!db) return;
        const presence = db.ref('pdl_presence/' + me);
        this._presenceGone = false;
        this._presenceTries = 0;
        const signedOut = () => !!(window.RLAuth && typeof RLAuth.user === 'function' && !RLAuth.user());

        const advertise = () => {
            if (this._presenceGone || this._myId() !== me || signedOut()) return;
            try { presence.onDisconnect().set({ online: false, lastSeen: this._serverTs() }); } catch (e) {}
            presence.set({
                online: true,
                name: (typeof Profile !== 'undefined') ? Profile.name() : 'DRIVER',
                lastSeen: this._serverTs(),
            }).catch(() => this._retryPresence(me));
        };

        const conRef = db.ref('.info/connected');
        const onCon = snap => {
            if (snap.val() !== true) return;   // socket down — the armed onDisconnect flips us offline server-side
            this._presenceTries = 0;
            advertise();
        };
        conRef.on('value', onCon);
        this._presenceBeat = setInterval(advertise, 60000);

        // Mobile: the OS may kill and restore the socket while hidden; on
        // return, re-assert immediately instead of waiting for the next
        // heartbeat (the .info/connected handler usually races us to it).
        const vis = () => { if (!document.hidden) { this._presenceTries = 0; advertise(); } };
        document.addEventListener('visibilitychange', vis);
        window.addEventListener('focus', vis);

        // Clean exits go offline NOW — the socket teardown behind a dying
        // page can lag for many seconds.
        const bye = () => { try { presence.set({ online: false, lastSeen: this._serverTs() }); } catch (e) {} };
        window.addEventListener('pagehide', bye);
        window.addEventListener('beforeunload', bye);

        this._unsubs.push(() => {
            this._presenceGone = true;
            try { clearInterval(this._presenceBeat); } catch (e) {}
            try { conRef.off('value', onCon); } catch (e) {}
            document.removeEventListener('visibilitychange', vis);
            window.removeEventListener('focus', vis);
            window.removeEventListener('pagehide', bye);
            window.removeEventListener('beforeunload', bye);
            try { presence.onDisconnect().cancel(); } catch (e) {}
            try { presence.set({ online: false, lastSeen: this._serverTs() }).catch(() => {}); } catch (e) {}
        });
    },

    /* Denied presence usually means the write raced the write-once
       pdl_idClaim at first sign-in (same repair profile.js pioneered for
       the profile mirror). One claim write, then bounded backoff retries —
       once the claim lands, the SAME write succeeds. Hard stop after 6
       tries; the next .info/connected or heartbeat takes a clean shot. */
    _retryPresence(me) {
        this._presenceTries = (this._presenceTries || 0) + 1;
        if (this._presenceGone || this._myId() !== me) return;
        if (this._presenceTries === 1) {
            const u = (window.RLAuth && typeof RLAuth.user === 'function') ? RLAuth.user() : null;
            const db = this._db();
            if (u && u.uid && db) {
                try { db.ref('pdl_idClaim/' + me).set(u.uid).catch(() => {}); } catch (e) {}
            }
        }
        if (this._presenceTries > 6) return;
        const tries = this._presenceTries;
        setTimeout(() => {
            if (this._presenceGone || this._myId() !== me) return;
            const db = this._db();
            if (!db) return;
            db.ref('pdl_presence/' + me).set({
                online: true,
                name: (typeof Profile !== 'undefined') ? Profile.name() : 'DRIVER',
                lastSeen: this._serverTs(),
            }).catch(() => this._retryPresence(me));
        }, 1500 * tries);
    },

    /* Reader side: online === the node says so AND its lastSeen heartbeat
       is fresh. A tab that died without its onDisconnect running used to
       sit online:true forever — a ghost ONLINE with a dead INVITE button.
       lastSeen is a SERVER stamp refreshed every 60 s by the writer, so
       anything colder than FRIEND_PRESENCE_STALE_MS is a dead node. Nodes
       without a readable stamp (older writers) keep the plain flag. */
    _presenceSaysOnline(v) {
        if (!v || v.online !== true) return false;
        const ls = +v.lastSeen || 0;
        if (ls && this._serverNow() - ls > FRIEND_PRESENCE_STALE_MS) return false;
        return true;
    },

    /* Ghost sweeper: 'value' events alone can never retire a STALE node —
       a dead writer's node simply stops changing. 30 s cadence over the
       watched ids only; one cheap object scan, zero network. */
    _sweepPresence() {
        if (!this._presenceRaw || !this._presenceCache) return;
        for (const [id, v] of Object.entries(this._presenceRaw)) {
            if (!this._presenceCache[id]) continue;   // already shown offline
            if (this._isPeerConnected(id)) continue;  // stronger evidence than presence
            if (this._presenceSaysOnline(v)) continue;
            this._presenceCache[id] = false;
            this._queueRender();
        }
    },

    /* Subscribes to presence for the CURRENT friend list only — one listener
       per friend id, never a subscription on the pdl_presence root.

       That distinction is a privacy boundary, not a style choice: reading the
       root would hand every client the id + display name + online state of
       EVERY driver on the service, including people they have never met. A
       per-friend read only ever touches the ids already in your own list, so
       your database rules can grant exactly that and nothing more.

       Re-subscribes whenever the friend list changes, always tearing the
       previous batch down first so a removed friend stops being observed. */
    _watchFriends(me) {
        const db = this._db();
        if (!db || !me || !this.data) return;
        if (this._friendWatch) {
            try { this._friendWatch(); } catch (e) {}
            // The old closure also sits in _unsubs — pull it back out so the
            // teardown list can't grow unbounded across re-subscriptions.
            this._unsubs = this._unsubs.filter(fn => fn !== this._friendWatch);
            this._friendWatch = null;
        }
        /* LIVE PROFILE coverage now includes PENDING rows (incoming
           requests, outgoing pends), not just accepted friends — a row the
           watcher does not cover falls back to one-shot data that can go
           stale mid-session (the reported "old pfp in the list" class).
           Presence stays friends-only by design. Bound: 60 listeners. */
        const HEX16 = /^[0-9a-f]{16}$/;
        const ids = [];
        const push = id => { if (HEX16.test(id) && !ids.includes(id)) ids.push(id); };
        Object.keys(this.data.friends).forEach(push);
        Object.keys(this.data.incoming).forEach(push);
        Object.keys(this.data.outgoing).forEach(push);
        const watch = ids.slice(0, 60);          // bound the listener count
        if (!watch.length) {
            if (this._presenceSweep) { try { clearInterval(this._presenceSweep); } catch (e) {} this._presenceSweep = null; }
            return;
        }
        const offs = [];
        this._presenceCache = this._presenceCache || {};
        this._presenceRaw = this._presenceRaw || {};
        this._profileCache = this._profileCache || {};
        try {
            for (const id of watch) {
                if (this.data.friends[id]) {
                    const ref = db.ref('pdl_presence/' + id);   // scoped to one friend
                    const h = ref.on('value', snap => {
                        const v = snap.val();
                        this._presenceRaw[id] = v;              // raw copy for the ghost sweeper
                        const online = this._presenceSaysOnline(v);
                        if (!!this._presenceCache[id] === online) return;  // no change, no repaint
                        this._presenceCache[id] = online;
                        this._queueRender();
                    });
                    offs.push(() => { try { h(); } catch (e) {} });
                }

                // LIVE PROFILE watcher: pdl_profiles is the CANONICAL name +
                // avatar (owned by profile.js's cloud mirror). Watching it
                // per friend means a rename or pfp change appears in every
                // friend's list within ~one cloud sync — no re-adding, no
                // refresh, and zero denormalized fan-out writes on change.
                const pref = db.ref('pdl_profiles/' + id);
                const ph = pref.on('value', snap => this._onFriendProfile(id, snap.val()));
                offs.push(() => { try { ph(); } catch (e) {} });
            }
            this._friendWatch = () => {
                for (const off of offs) { try { off(); } catch (e) {} }
                if (this._presenceSweep) { try { clearInterval(this._presenceSweep); } catch (e) {} this._presenceSweep = null; }
            };
            this._unsubs.push(this._friendWatch);
            // PRESENCE-V2 ghost sweeper: a dead writer's node stops emitting
            // value events, so only a timer can retire it. Started with the
            // watches, cleared by the _friendWatch teardown above.
            if (this._presenceSweep) { try { clearInterval(this._presenceSweep); } catch (e) {} }
            this._presenceSweep = setInterval(() => this._sweepPresence(), 30000);
        } catch (e) { /* presence is a nicety; never block the list on it */ }
    },

    // A row's canonical profile changed in the cloud — mirror it into the
    // local row(s) (name AND avatar) if anything actually differs. Covers
    // accepted friends (cloud name wins; a removed avatar clears too) and
    // pending rows (gentler: fill-in only, matching _fetchProfileOnce).
    _onFriendProfile(id, val) {
        if (!this.data || !val) return;
        const cname = String(val.name || '').slice(0, FRIEND_NAME_MAX);
        const av = (typeof val.av === 'string' && val.av.length <= FRIEND_AV_MAX_BYTES) ? val.av : null;
        let dirty = false;
        const f = this.data.friends[id];
        if (f) {
            const nm = String(val.name || f.name || this._fmt(id)).slice(0, FRIEND_NAME_MAX);
            if (f.name !== nm || f.av !== av) { f.name = nm; f.av = av; dirty = true; }
        }
        const patchPending = row => {
            if (!row) return;
            if (av && row.av !== av) { row.av = av; dirty = true; }
            if (cname && row.fromName && row.fromName !== cname) { row.fromName = cname; dirty = true; }
            if (cname && !row.lockName && row.name !== cname) { row.name = cname; dirty = true; }
        };
        patchPending(this.data.incoming[id]);
        patchPending(this.data.outgoing[id]);
        if (!dirty) return;   // no change, no write, no repaint
        this._persist();
        this._queueRender();
    },

    // Coalesced repaint — bursts of presence/profile updates cost ONE
    // render per tick instead of one per packet, keeping the list jank-free.
    _queueRender() {
        if (this._renderTimer) return;
        this._renderTimer = setTimeout(() => {
            this._renderTimer = null;
            this._render();
        }, 200);
    },

    /* A request addressed to us arrived in the cloud mailbox. Routed through
       the SAME handler the P2P path uses, so a request that shows up either
       way produces identical state and identical UI. */
    _onCloudRequest(me, key, val) {
        if (!val || !this.data) return;
        const from = this.normalizeCode(val.from || key);
        // Hard ownership checks. A malformed or hostile row must not be able
        // to write into our graph.
        if (!from || from === me) return;
        if (this.isSelf(from) || this.isBlocked(from)) return;
        this._handlePeerRequest({ id: from, name: val.fromName });
    },

    /* A friend edge appeared in OUR cloud subtree. Typical causes:
       — the receiver of our request ACCEPTED while we were offline (the
         pending row clears with a "FRIEND ADDED" toast),
       — a fresh install / wiped store rebuilding its list from the cloud
         (silent — toasting every row would be spam). */
    _onCloudFriend(me, key, val) {
        if (!this.data || !val) return;
        const id = this.normalizeCode(key || val.id);
        if (!id || id === me || this.isSelf(id) || this.isBlocked(id)) return;
        if (this.data.friends[id]) return;   // already known locally — replayed attach, no-op
        const hadPending = !!this.data.outgoing[id];
        delete this.data.outgoing[id];
        delete this.data.incoming[id];
        this.data.friends[id] = {
            name: String(val.name || this._fmt(id)).slice(0, FRIEND_NAME_MAX),
            ts: +val.ts || Date.now(),
        };
        this._persist();
        this._watchFriends(me);              // start presence + profile watches
        this._render();
        if (hadPending) {
            game.showNotification('FRIEND ADDED');
            if (typeof SFX !== 'undefined') SFX.notify();
        }
    },

    /* A receipt landed in OUR outcome node: the receiver of one of our
       requests answered. Only "declined" needs action — an accept arrives
       as a friend edge instead. The receipt is one-shot: read once, then
       deleted by its owner. */
    _onCloudOutcome(me, key, val) {
        if (!this.data || !val) return;
        const id = this.normalizeCode(key);
        if (!id) return;
        const db = this._db();
        if (db) { try { db.ref('pdl_requestOutcomes/' + me + '/' + id).remove(); } catch (e) {} }
        const status = String(val.status || '');
        if (status !== 'declined') return;
        if (!this.data.outgoing[id]) return;   // already resolved locally
        const name = String(this.data.outgoing[id].name || this._fmt(id)).slice(0, FRIEND_NAME_MAX);
        delete this.data.outgoing[id];
        delete this.data.incoming[id];
        this._persist();
        this._render();
        game.showNotification(name.toUpperCase() + ' DECLINED YOUR REQUEST');
        if (typeof SFX !== 'undefined') SFX.error();
    },

/* V10F5-ONCLOUD-INVITE */
    _onCloudInvite(me, key, val) {
        if (!val || !this.data) return;
        const from = this.normalizeCode(val.from || key);
        if (!from || from === me || this.isBlocked(from)) return;
        const code = String(val.code || '').trim().toUpperCase();
        if (code.length < 4) return;
        // Stale-mailbox guard: a node that outlived its window (receiver
        // was offline, sender crashed before cleanup) is dead on arrival.
        // Judged against the SERVER clock so a skewed device clock cannot
        // revive it; we also clean the node so it never nags again.
        if (this._serverNow() - (+val.ts || 0) > INVITE_TTL_MS + INVITE_EXPIRY_GRACE_MS) {
            const db = this._db();
            if (db) { try { db.ref('pdl_invites/' + me + '/' + from).remove().catch(() => {}); } catch (e) {} }
            return;
        }
        // Never consume the invite node here — the sender is still waiting to
        // host a room. We only acknowledge once the player accepts, which is
        // what removes it (see acceptInvite).
        this._pendingInvites[from] = {
            code,
            fromName: String(val.fromName || 'DRIVER').slice(0, FRIEND_NAME_MAX),
            ts: +val.ts || Date.now(),
        };
        // The dedicated right-edge card replaces the old friends-list row
        // and the one-line toast: actionable from any screen, stacked when
        // several friends invite at once, self-expiring on its own timer.
        this._inviteCardShow(from, this._pendingInvites[from].fromName);
        this._armInviteTimer(from);
        if (typeof SFX !== 'undefined') SFX.alert();
        this._render();
    },

    /* ── Actions ───────────────────────────────────────────────────── */
    async addByInput() {
        const input = document.getElementById('friend-add-input');
        if (!input) return;
        const res = await this.sendRequest(input.value);
        if (res.ok) input.value = '';
        else game.showNotification(res.msg);
    },

    // A refusal still needs to FEEDBACK — the caller only shows a toast, so
    // without this a rejected friend code is a silent non-event.
    _refuse(msg) {
        if (typeof SFX !== 'undefined') SFX.error();
        return { ok: false, msg };
    },

    async sendRequest(raw) {
        if (!this.data) return this._refuse('NOT READY YET');
        const id = this.normalizeCode(raw);
        if (id.length < 8) return this._refuse('ENTER A VALID FRIEND CODE');
        const me = this._myId();
        if (id === me) return this._refuse("THAT'S YOUR OWN CODE");
        if (this.isBlocked(id)) return this._refuse('DRIVER IS BLOCKED');
        if (this.data.friends[id]) return this._refuse('ALREADY FRIENDS');
        if (this.data.outgoing[id] || this.data.incoming[id]) return this._refuse('REQUEST ALREADY PENDING');
        // Per-target cooldown: a decline (or a just-expired ghost) should
        // hurt a little before retrying — and a stuck client must never be
        // able to rapid-fire someone's mailbox.
        const lastTry = this.data.lastReqAt ? this.data.lastReqAt[id] : 0;
        if (lastTry && Date.now() - lastTry < FRIEND_REQ_COOLDOWN_MS) {
            return this._refuse('EASY — TRY AGAIN IN A MINUTE');
        }

        const myName = (typeof Profile !== 'undefined') ? Profile.name() : 'DRIVER';
        this.data.outgoing[id] = { name: myName, ts: Date.now() };
        this._fetchProfileOnce(id);   // show their real name + pfp while pending
        if (!this.data.lastReqAt) this.data.lastReqAt = {};
        this.data.lastReqAt[id] = Date.now();
        this._persist();
        this._render();

        // TRANSMIT. This is the line the old version never reached past the
        // local write: the request now goes to the recipient's mailbox, so it
        // arrives whether or not we are currently connected to them.
        const db = this._db();
        let delivered = false;
        if (db && me) {
            try {
                // SERVER stamp — a fast device clock used to fail the rules'
                // `ts <= now + 60000` validation and the request never left.
                await db.ref('pdl_friendRequests/' + id + '/' + me)
                    .set({ from: me, fromName: String(myName).slice(0, FRIEND_NAME_MAX), ts: this._serverTs() });
                delivered = true;
            } catch (e) {
                console.warn('Friend request cloud send failed:', e);
            }
        }

        // If that exact driver is already connected to us, also deliver over
        // the live P2P channel so it lands instantly instead of waiting on a
        // round trip through the mailbox.
        if (this._isPeerConnected(id)) this._deliverRequest(id);

        game.showNotification(delivered ? 'FRIEND REQUEST SENT' : 'FRIEND REQUEST QUEUED');
        return { ok: true };
    },

    // True only when the P2P link is open AND the peer is the given driver.
    _isPeerConnected(id) {
        return typeof MP !== 'undefined' && !!MP._connected && !!MP.remoteProfile &&
            this.normalizeCode(MP.remoteProfile.id) === id;
    },

    _deliverRequest(id) {
        if (typeof MP === 'undefined' || !MP._connected || !MP.remoteProfile) return;
        if (this.normalizeCode(MP.remoteProfile.id) !== id) return;
        if (typeof Profile === 'undefined' || !Profile.data) return;
        MP.sendEvent({ type: 'friendReq', p: { id: Profile.data.id, name: Profile.name() } });
    },

    // Called by multiplayer.js when the peer's profile arrives — this is the
    // moment a queued request can be delivered to the exact driver.
    onPeerProfile(remote) {
        if (!remote || !this.data) return;
        const id = this.normalizeCode(remote.id);
        if (!id) return;
        if (this.data.outgoing[id] && this.data.outgoing[id].ts) {
            // Keep the real driver name once we've met them.
            this.data.outgoing[id].name = String(remote.name || this.data.outgoing[id].name).slice(0, FRIEND_NAME_MAX);
            this._persist();
            this._deliverRequest(id);
        }
        this._render();
    },

    /* One-shot canonical-profile lookup for rows the live friend watcher
       does not cover (incoming requests, outgoing pends). Friends' rows get
       their name+avatar from the per-friend pdl_profiles listener; a
       requester is not yet a friend, so without this their row renders as
       a raw code with a blank tile — the reported "friends' pfp missing".
       Single single-shot read per id, result cached in the row itself. */
    _fetchProfileOnce(id) {
        const db = this._db();
        if (!db || !id) return;
        if (this._profFetches && this._profFetches[id]) return;
        if (!this._profFetches) this._profFetches = {};
        this._profFetches[id] = true;
        db.ref('pdl_profiles/' + id).once('value').then(snap => {
            const v = snap && snap.val();
            if (!v || !this.data) return;
            const patchRow = row => {
                if (!row) return;
                const nm = String(v.name || '').slice(0, FRIEND_NAME_MAX);
                const av = (typeof v.av === 'string' && v.av.length <= FRIEND_AV_MAX_BYTES) ? v.av : null;
                let dirty = false;
                if (nm && row.name !== nm && !row.lockName) { row.name = nm; dirty = true; }
                if (row.fromName && nm && row.fromName !== nm) { row.fromName = nm; dirty = true; }
                if (av && row.av !== av) { row.av = av; dirty = true; }
                if (dirty) { this._persist(); this._queueRender(); }
            };
            patchRow(this.data.incoming[id]);
            patchRow(this.data.outgoing[id]);
        }).catch(() => {});
    },

    _handlePeerRequest(p) {
        if (!this.data || !p) return;
        const id = this.normalizeCode(p.id);
        if (!id || this.isSelf(id) || this.data.friends[id] || (this.data.blocked && this.data.blocked[id])) return;
        const name = String(p.name || 'DRIVER').slice(0, FRIEND_NAME_MAX);
        this._fetchProfileOnce(id);
        if (this.data.incoming[id]) {
            this.data.incoming[id].fromName = name;
        } else {
            this.data.incoming[id] = { fromName: name, ts: Date.now() };
            // MUTUAL REQUEST: both drivers tapped "add" at nearly the same
            // moment (and our outgoing row is still fresh). Skip the
            // ping-pong — one accept covers both sides, exactly like the
            // handle pattern on Steam/PSN.
            const myReq = this.data.outgoing[id];
            if (myReq && myReq.ts && Date.now() - myReq.ts <= FRIEND_GHOST_DAYS * 86400000) {
                this.acceptRequest(id);   // async — fire & forget
                return;
            }
            game.showNotification('FRIEND REQUEST FROM ' + name.toUpperCase());
            if (typeof SFX !== 'undefined') SFX.alert();
        }
        this._persist();
        this._render();
    },

    async acceptRequest(id) {
        if (!this.data || !this.data.incoming[id]) return;
        const req = this.data.incoming[id];
        delete this.data.incoming[id];
        delete this.data.outgoing[id];
        const name = req.fromName || this._fmt(id);
        this.data.friends[id] = { name, ts: Date.now() };
        this._persist();
        this._render();

        const me = this._myId();
        const myName = (typeof Profile !== 'undefined') ? Profile.name() : 'DRIVER';

        // Mutual write. Both sides are updated, so the friendship exists on the
        // OTHER player's device too. Previously the sender only became friends
        // if they happened to be connected at that exact moment — the single
        // biggest reason a friendship looked one-sided.
        const db = this._db();
        if (db && me) {
            try {
                const ts = this._serverTs();
                const updates = {};
                updates['pdl_friends/' + me + '/' + id] = { name: String(name).slice(0, FRIEND_NAME_MAX), ts: ts };
                updates['pdl_friends/' + id + '/' + me] = { name: String(myName).slice(0, FRIEND_NAME_MAX), ts: ts };
                // Clear the request row so it doesn't linger in the mailbox.
                updates['pdl_friendRequests/' + me + '/' + id] = null;
                await db.ref().update(updates);
            } catch (e) {
                console.warn('Friend accept cloud write failed:', e);
                game.showNotification('FRIEND SAVED LOCALLY \u2014 CLOUD SYNC FAILED');
                if (typeof SFX !== 'undefined') SFX.error();
            }
        }

        // Live confirmation if they're on the other end right now.
        if (this._isPeerConnected(id) && typeof Profile !== 'undefined' && Profile.data) {
            MP.sendEvent({ type: 'friendAcc', id: Profile.data.id, name: Profile.name() });
        }
        // A new friend may be online — start watching their presence.
        this._watchFriends(me);
        game.showNotification('FRIEND ADDED');
        if (typeof SFX !== 'undefined') SFX.notify();
    },

    _handlePeerAccept(msg) {
        if (!this.data || !msg) return;
        const id = this.normalizeCode(msg.id);
        // Blocked drivers can never slip a friendship in — even if a stale
        // outgoing request somehow survived on their side.
        if (!id || this.isBlocked(id) || !this.data.outgoing[id]) return;
        const name = String(msg.name || this.data.outgoing[id].name || this._fmt(id)).slice(0, FRIEND_NAME_MAX);
        delete this.data.outgoing[id];
        delete this.data.incoming[id];
        this.data.friends[id] = { name, ts: Date.now() };
        this._persist();
        this._render();
        this._watchFriends(this._myId());
        game.showNotification('FRIEND ADDED');
        if (typeof SFX !== 'undefined') SFX.notify();
    },

    async declineRequest(id) {
        if (!this.data || !this.data.incoming[id]) return;
        delete this.data.incoming[id];
        this._persist();
        this._render();
        // ONE atomic update: clear the request from our mailbox AND drop a
        // short-lived receipt into the sender's outcome node. The sender's
        // pending row then clears with an honest "DECLINED" toast — the
        // old silent delete left their request hanging as a ghost forever.
        const db = this._db();
        const me = this._myId();
        if (db && me) {
            try {
                const updates = {};
                updates['pdl_friendRequests/' + me + '/' + id] = null;
                updates['pdl_requestOutcomes/' + id + '/' + me] = { status: 'declined', at: this._serverTs() };
                await db.ref().update(updates);
            } catch (e) {}
        }
    },

    async cancelRequest(id) {
        if (!this.data || !this.data.outgoing[id]) return;
        delete this.data.outgoing[id];
        this._persist();
        this._render();
        // Withdraw it from their inbox so it stops showing as incoming.
        const db = this._db();
        const me = this._myId();
        if (db && me) {
            try { await db.ref('pdl_friendRequests/' + id + '/' + me).remove(); } catch (e) {}
        }
    },

    // Drops every edge between us and `id` (friend + both request rows).
    // Returns true when a live friendship existed — peers are then told.
    _sever(id) {
        if (!this.data) return false;
        const wasFriend = !!this.data.friends[id];
        delete this.data.friends[id];
        delete this.data.incoming[id];
        delete this.data.outgoing[id];
        if (wasFriend) {
            // Mutual removal: tell them to drop us from their list too.
            if (typeof MP !== 'undefined' && MP._connected && MP.remoteProfile &&
                this.normalizeCode(MP.remoteProfile.id) === id &&
                typeof Profile !== 'undefined' && Profile.data) {
                MP.sendEvent({ type: 'friendRemove', id: Profile.data.id });
            }
        }
        return wasFriend;
    },

    // Cloud-side mutual cleanup: drop BOTH friendship edges plus any
    // request/receipt rows in either mailbox. Without the peer-side delete,
    // the next reconciliation on a returning player would resurrect the
    // friendship out of their own cloud subtree — a local removal must win
    // everywhere, immediately.
    _cloudSever(id) {
        const db = this._db();
        const me = this._myId();
        if (!db || !me || !id) return;
        const updates = {};
        updates['pdl_friends/' + me + '/' + id] = null;
        updates['pdl_friends/' + id + '/' + me] = null;
        updates['pdl_friendRequests/' + me + '/' + id] = null;
        updates['pdl_friendRequests/' + id + '/' + me] = null;
        updates['pdl_requestOutcomes/' + me + '/' + id] = null;
        try { db.ref().update(updates).catch(() => {}); } catch (e) {}
    },

    removeFriend(id) {
        if (!this.data || !this.data.friends[id]) return;
        this._sever(id);
        this._cloudSever(id);
        this._persist();
        this._render();
        game.showNotification('FRIEND REMOVED');
    },

    /* ── Blocks (future pdl_blocks/<uid>/<blockedId>) ────────────────
       Blocking is one-sided and silent: the other driver is never told,
       their requests/accepts are simply swallowed by the guards above,
       and any existing friendship/requests die immediately. Unblock is
       local too — nothing is sent, the graph is just writable again. */
    blockFriend(id) {
        if (!this.data || !id || this.isSelf(id) || this.isBlocked(id)) return;
        this._sever(id);
        this._cloudSever(id);
        this.data.blocked[id] = { name: this._fmt(id), ts: Date.now() };
        this._persist();
        this._render();
        game.showNotification('DRIVER BLOCKED');
    },

    // Used by peer-facing flows that know the driver's real name (e.g. a
    // request row's BLOCK action) so the list never shows a raw code.
    blockKnown(id, name) {
        if (!this.data || !id || this.isSelf(id)) return;
        const norm = this.normalizeCode(id);
        if (!norm) return;
        this._sever(norm);
        this._cloudSever(norm);
        this.data.blocked[norm] = { name: String(name || this._fmt(norm)).slice(0, FRIEND_NAME_MAX), ts: Date.now() };
        this._persist();
        this._render();
        game.showNotification('DRIVER BLOCKED');
    },

    unblock(id) {
        if (!this.data || !this.data.blocked[id]) return;
        delete this.data.blocked[id];
        this._persist();
        this._render();
        game.showNotification('DRIVER UNBLOCKED');
    },

    _handlePeerRemove(msg) {
        if (!this.data || !msg) return;
        const id = this.normalizeCode(msg.id);
        if (!id || !this.data.friends[id]) return;
        delete this.data.friends[id];
        delete this._pendingInvites[id];
        this._persist();
        this._render();
        this._watchFriends(this._myId());
    },

    /* ── Invites: race a friend without sharing a code ────────────────
       Flow: A taps INVITE on an ONLINE friend B. A reserves a room code,
       writes it to B's invite mailbox, and A's lobby starts waiting for B.
       B gets a notification; tapping ACCEPT reads the code straight out of
       the mailbox and joins that exact room — no code is ever spoken, typed
       or copied, and no re-match is needed afterwards. */
    async inviteFriend(id) {
        if (!this.data || !id || !this.data.friends[id]) return;
        if (typeof MP === 'undefined') return;
        if (!MP.ensureFirebase || !MP.ensureFirebase()) { game.showNotification('MULTIPLAYER UNAVAILABLE'); return; }
        if (MP.pc || MP.roomRef) { game.showNotification('ALREADY IN A LOBBY'); return; }
        const me = this._myId();
        const db = this._db();
        if (!me || !db) return;
        // Same guard the receiver's accept runs: never yank a driver out of
        // an active race or the results flow.
        if (game && game.state && game.state !== 'MENU') {
            game.showNotification('FINISH THE RACE FIRST');
            if (typeof SFX !== 'undefined') SFX.error();
            return;
        }
        let code = null;
        try {
            // Reserve the room code FIRST, so the code published to B is
            // guaranteed to be free by the time the room claims it.
            code = await MP._reserveRoomCode();
            if (!code) { game.showNotification('COULD NOT CREATE ROOM'); return; }
            /* INVITE-ROUND FIX — SENDER NAVIGATION: the receiver's accept
               path calls game.openMultiplayerMenu() before joinWithCode();
               the sender must land in the SAME room view the moment hosting
               starts. hostGameWithCode() only toggles sub-panels INSIDE the
               multiplayer screen — without this call the inviter used to
               stay put on the friends list while the room ran "invisibly"
               behind the UI (the reported "only player B is navigated"). */
            if (game && typeof game.openMultiplayerMenu === 'function') {
                try { game.openMultiplayerMenu(); } catch (e) {}
            }
            await MP.hostGameWithCode(code);   // the room EXISTS from here on
            // hostGameWithCode() reports its own failures via the status
            // line instead of throwing — never publish an invite to a room
            // that failed to open.
            if (!MP.roomRef || MP.roomCode !== code) return;
            await db.ref('pdl_invites/' + id + '/' + me).set({
                from: me,
                fromName: String((typeof Profile !== 'undefined') ? Profile.name() : 'DRIVER').slice(0, FRIEND_NAME_MAX),
                code,
                /* SERVER stamp: the receiver judges expiry against
                   Firebase's clock, so a sender clock even ~20 s slow used
                   to have the invite "expire" before it ever arrived. */
                ts: this._serverTs(),
            });
/* V10F9-ARM-SENT-INVITE */
            // Sender-side expiry: if nothing answers inside the window,
            // stop hosting and free both players.
            this._armSentInvite(id, code);
            game.showNotification('INVITE SENT — WAITING FOR ' + this._fmt(id));
        } catch (e) {
            console.warn('Invite failed:', e);
            // A room this invite created must not dangle when the mailbox
            // publish failed — nobody was ever told how to join it.
            if (code && typeof MP.abortInviteWait === 'function' &&
                MP.roomCode === code && !MP._connected) {
                try { MP.abortInviteWait('INVITE FAILED — CHECK CONNECTION'); } catch (e2) {}
            }
            game.showNotification('INVITE FAILED — CHECK CONNECTION');
        }
    },

    // Accepting consumes the invite and hands the code to the normal join
    // path. The invite node is removed so it can never be replayed.
/* V10F6-ACCEPT-INVITE */
    async acceptInvite(id) {
        const inv = this._pendingInvites && this._pendingInvites[id];
        if (!inv || !inv.code) return;          // unknown / already handled
        if (this._acceptingId === id) return;   // rapid double-tap guard
        if (typeof MP === 'undefined') return;
        this._acceptingId = id;
        try {
            // Expiry re-check against the SERVER clock at the moment of the
            // tap: a client timer that never fired (background tab, dead
            // listener) can never push a dead invite through. The sender's
            // room outlives our card by INVITE_SENDER_GRACE_MS, so this is
            // the only gate that matters.
            if (this._serverNow() - inv.ts > INVITE_TTL_MS + INVITE_EXPIRY_GRACE_MS) {
                this._teardownInvite(id, { removeCloud: true, fade: true });
                game.showNotification('INVITE EXPIRED');
                if (typeof SFX !== 'undefined') SFX.error();
                return;
            }
            // Never yank the player out of an active race or the results
            // flow — the invite simply lives out its remaining seconds.
            if (game && game.state && game.state !== 'MENU') {
                game.showNotification('FINISH THE RACE FIRST');
                if (typeof SFX !== 'undefined') SFX.error();
                return;
            }
            // Consume EXACTLY once: drop pending state + card before any
            // async work, so a second click can never re-enter this path.
            delete this._pendingInvites[id];
            this._disarmInviteTimer(id);
            this._inviteCardDismiss(id, false);
            const db = this._db();
            const me = this._myId();
            if (db && me) {
                try { await db.ref('pdl_invites/' + me + '/' + id).remove(); } catch (e) {}
            }
            // Navigate to the multiplayer menu from wherever we are — the
            // join panels flip to "JOINING" inside it right after, so the
            // player watches the handshake instead of a frozen screen. The
            // menu is only a menu: the race has NOT started, the session is
            // not connected until joinWithCode completes.
            if (game && typeof game.openMultiplayerMenu === 'function') {
                try { game.openMultiplayerMenu(); } catch (e) {}
            }
            game.showNotification('JOINING ' + this._fmt(id));
            await MP.joinWithCode(inv.code);
        } finally {
            this._acceptingId = null;
        }
    },

/* V10F7-DECLINE-INVITE */
    declineInvite(id) {
        if (!this._pendingInvites || !this._pendingInvites[id]) return;
        // One teardown removes the pending record, the timer, the card AND
        // the mailbox node — the sender stops waiting on their own clock.
        this._teardownInvite(id, { removeCloud: true, fade: true });
        this._render();
    },

/* V10F8-INVITE-MACHINERY */
    hasInvite(id) { return !!(this._pendingInvites && this._pendingInvites[id]); },
    inviteFor(id) { return (this._pendingInvites && this._pendingInvites[id]) || null; },

    /* ── Invitation expiry + the right-edge invite card ────────────────
       Window: INVITE_TTL_MS (15 s by default — bump the constant to
       30000 and every surface follows: card, countdown bar, receiver
       timer, sender wait). The card replaced the old friends-list invite
       row: a race invite is an actionable notification, not a roster
       entry, and it must be reachable from ANY screen. */

    _serverNow() { return Date.now() + (this._serverSkew || 0); },

    _armInviteTimer(id) {
        this._disarmInviteTimer(id);
        const inv = this._pendingInvites[id];
        if (!inv) return;
        // Remaining window runs from the invite's OWN timestamp, not from
        // "when we happened to see it" — a replayed listener attach or a
        // cached node never buys a second full window.
        const left = Math.max(0, INVITE_TTL_MS - (this._serverNow() - inv.ts));
        this._inviteTimers[id] = setTimeout(() => this._expireInvite(id), left);
    },

    _disarmInviteTimer(id) {
        if (this._inviteTimers && this._inviteTimers[id]) {
            try { clearTimeout(this._inviteTimers[id]); } catch (e) {}
            delete this._inviteTimers[id];
        }
    },

    _clearInviteTimers() {
        if (!this._inviteTimers) return;
        for (const t of Object.values(this._inviteTimers)) { try { clearTimeout(t); } catch (e) {} }
        this._inviteTimers = {};
    },

    /* Natural expiry (timer fired): neutral, no error sound — nobody did
       anything wrong. The mailbox node is cleaned so the sender's own
       expiry path stays the only one writing state after this. */
    _expireInvite(id) {
        delete this._inviteTimers[id];
        if (!this._pendingInvites || !this._pendingInvites[id]) return;
        this._teardownInvite(id, { removeCloud: true, fade: true });
    },

    /* The cloud node vanished: accepted (by us — pending already cleared,
       so this no-ops), declined elsewhere, or sender cleanup. Whatever the
       cause, the card must not linger. */
    _onCloudInviteGone(key) {
        const id = this.normalizeCode(key);
        if (!id) return;
        if (this._pendingInvites && this._pendingInvites[id]) {
            this._teardownInvite(id, { fade: true });
        }
    },

    /* Single teardown for one invite: state + timer + card (+ cloud node). */
    _teardownInvite(id, opts) {
        const o = opts || {};
        delete this._pendingInvites[id];
        this._disarmInviteTimer(id);
        this._inviteCardDismiss(id, !!o.fade);
        if (o.removeCloud) {
            const db = this._db();
            const me = this._myId();
            if (db && me) {
                try { db.ref('pdl_invites/' + me + '/' + id).remove().catch(() => {}); } catch (e) {}
            }
        }
    },

    /* Full invite teardown — profile switch, sign-out, FORGET SAVED
       OPPONENT. Timers first, then state, then any visible cards. */
    clearAllInvites() {
        this._clearInviteTimers();
        this._disarmSentInvite();
        this._pendingInvites = {};
        this._inviteCardEls = {};
        const root = document.getElementById('race-invite-stack');
        if (root) root.innerHTML = '';
    },

    /* ── The invite card (fixed, right edge, slightly above center) ── */
    _inviteCardRoot() {
        let root = document.getElementById('race-invite-stack');
        if (!root) {
            // Static markup lives in index.html; building on demand keeps
            // this module self-sufficient (tests, older pages).
            root = document.createElement('div');
            root.id = 'race-invite-stack';
            root.setAttribute('aria-live', 'polite');
            document.body.appendChild(root);
        }
        return root;
    },

    _inviteCardShow(id, name) {
        const root = this._inviteCardRoot();
        if (!root) return;
        // One card per sender — a re-invite refreshes the existing card
        // instead of stacking a duplicate.
        let card = root.querySelector('.ri-card[data-invite-id="' + id + '"]');
        if (!card) {
            card = document.createElement('div');
            card.className = 'ri-card ri-in';
            card.dataset.inviteId = id;
            const title = document.createElement('div');
            title.className = 'ri-title';
            title.textContent = String(name || 'DRIVER').toUpperCase() + ' INVITED YOU TO RACE';
            const timer = document.createElement('span');
            timer.className = 'ri-timer';
            timer.setAttribute('aria-hidden', 'true');
            const actions = document.createElement('div');
            actions.className = 'ri-actions';
            const mk = (cls, label, fn) => {
                const b = document.createElement('span');
                b.className = 'ri-btn ' + cls;
                b.setAttribute('role', 'button');
                b.tabIndex = 0;
                b.textContent = label;
                b.onclick = fn;
                b.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } };
                actions.appendChild(b);
                return b;
            };
            mk('ri-accept', 'ACCEPT', () => this.acceptInvite(id));
            mk('ri-decline', 'DECLINE', () => this.declineInvite(id));
            card.appendChild(title);
            card.appendChild(timer);
            card.appendChild(actions);
            root.appendChild(card);
            // Slide-in: drop .ri-in a frame after attach so the transform
            // transition actually plays.
            requestAnimationFrame(() => requestAnimationFrame(() => card.classList.remove('ri-in')));
        }
        this._inviteCardEls[id] = card;
        // (Re)arm the countdown bar for the REMAINING window.
        const inv = this._pendingInvites[id];
        const left = Math.max(0, INVITE_TTL_MS - (this._serverNow() - (inv ? inv.ts : Date.now())));
        const bar = card.querySelector('.ri-timer');
        if (bar) {
            bar.style.transition = 'none';
            bar.style.width = '100%';
            requestAnimationFrame(() => {
                bar.style.transition = 'width ' + left + 'ms linear';
                bar.style.width = '0%';
            });
        }
    },

    _inviteCardDismiss(id, fade) {
        const card = (this._inviteCardEls && this._inviteCardEls[id]) ||
            document.querySelector('#race-invite-stack .ri-card[data-invite-id="' + id + '"]');
        delete this._inviteCardEls[id];
        if (!card) return;
        if (!fade) { card.remove(); return; }
        if (card.classList.contains('ri-out')) return;   // already leaving
        card.classList.add('ri-out');
        // Remove after the fade no matter what (transitionend + fallback),
        // so an invite invalidated mid-animation can never leave a zombie
        // card behind.
        let gone = false;
        const drop = () => { if (!gone) { gone = true; card.remove(); } };
        card.addEventListener('transitionend', drop, { once: true });
        setTimeout(drop, 420);
    },

    /* ── Sender-side invite expiry ──────────────────────────────────────
       The host that published an invite stops waiting after the window:
       the room is torn down, the mailbox node cleaned, and the INVITE
       button is free again without a reload. If the receiver accepted,
       the live handshake (open datachannel OR a remote answer already
       applied to the peer connection) protects the room from the timer. */
    _armSentInvite(id, code) {
        this._disarmSentInvite();
        this._sentInvite = { id, code };
        this._sentInviteTimer = setTimeout(() => {
            this._sentInviteTimer = 0;
            const rec = this._sentInvite;
            this._sentInvite = null;
            if (!rec || rec.id !== id || rec.code !== code) return;
            // Clean the mailbox no matter what happened on the other side.
            const db = this._db();
            const me = this._myId();
            if (db && me && id) {
                try { db.ref('pdl_invites/' + id + '/' + me).remove().catch(() => {}); } catch (e) {}
            }
            if (typeof MP === 'undefined') return;
            const handshakeLive = !!MP._connected || !!(MP.pc && MP.pc.currentRemoteDescription);
            if (handshakeLive) return;   // accepted — the race is (about to be) live
            // Only abort a room THIS invite created: the player may have
            // already moved on to a manual host/join.
            if (MP.roomCode !== code) return;
            if (typeof MP.abortInviteWait === 'function') {
                MP.abortInviteWait('INVITE EXPIRED — NO RESPONSE');
                game.showNotification('INVITE EXPIRED — NO RESPONSE');
                if (typeof SFX !== 'undefined') SFX.error();
            }
        }, INVITE_TTL_MS + INVITE_SENDER_GRACE_MS);
    },

    _disarmSentInvite() {
        if (this._sentInviteTimer) {
            try { clearTimeout(this._sentInviteTimer); } catch (e) {}
            this._sentInviteTimer = 0;
        }
        this._sentInvite = null;
    },

    /* ── UI ────────────────────────────────────────────────────────── */
    _render() {
        if (typeof Profile !== 'undefined' && Profile._panelOpen && Profile._panelOpen()) {
            this.renderList();
        }
    },

    /* Every actual look at the list re-arms the live watchers. on('value')
       replays the CURRENT cloud value on attach, so this doubles as a
       fresh server pull — a listener that died (auth race, transient
       denial, long-lived tab) can never leave a stale PFP on screen.
       Throttled to one re-arm per 10 s; teardown happens inside
       _watchFriends, so no listener leaks. */
    _maybeRearm() {
        const me = this._myId();
        const db = this._db();
        if (!me || !db) return;
        if (!(window.RLAuth && RLAuth.ready && RLAuth.ready())) return;
        const now = Date.now();
        if (this._lastRearm && now - this._lastRearm < 10000) return;
        this._lastRearm = now;
        this._watchFriends(me);
    },

    renderList() {
        const box = document.getElementById('friends-list');
        if (!box || !this.data) return;
        this._maybeRearm();
        box.innerHTML = '';

/* V10F10-LIST-NO-INVITE-ROWS */
        const items = [];
        // Incoming race invites are NOT list rows anymore — they surface
        // as the dedicated right-edge invitation card (see _onCloudInvite),
        // so this list stays a list: friends and friend requests only.
        for (const [id, f] of Object.entries(this.data.friends)) {
            items.push({ id, state: 'friend', name: f.name || this._fmt(id), av: f.av || null, online: this.isOnline(id), lastRaced: f.lastRaced || 0 });
        }
        for (const [id, r] of Object.entries(this.data.incoming)) {
            items.push({ id, state: 'incoming', name: r.fromName || this._fmt(id), av: r.av || null });
        }
        for (const [id, r] of Object.entries(this.data.outgoing)) {
            items.push({ id, state: 'outgoing', name: r.name || this._fmt(id), av: r.av || null });
        }

        if (!items.length) {
            const empty = document.createElement('div');
            empty.className = 'fr-row fr-empty';
            empty.textContent = 'NO FRIENDS YET';
            box.appendChild(empty);
        }

/* V10F11-LIST-RANK */
        const rank = { friend: 1, incoming: 2, outgoing: 3 };
        items.sort((a, b) =>
            (rank[a.state] - rank[b.state]) ||
            ((b.online ? 1 : 0) - (a.online ? 1 : 0)) ||
            ((b.lastRaced || 0) - (a.lastRaced || 0)) ||
            a.name.localeCompare(b.name));

        const btn = (row, cls, label, fn) => {
            const b = document.createElement('span');
            b.className = 'fr-btn ' + cls;
            b.setAttribute('role', 'button');
            b.tabIndex = 0;
            b.textContent = label;
            b.onclick = fn;
            b.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } };
            row.appendChild(b);
            return b;
        };

        // Shared avatar slot — the driver's pfp when the live profile mirror
        // has one, a colored initial tile otherwise. Same renderer the menu
        // chip and the MP lobby use, so every surface stays consistent.
        const avEl = (row, name, av) => {
            const el = document.createElement('span');
            el.className = 'fr-av';
            if (typeof Profile !== 'undefined') {
                Profile.renderAvatar(el, { name: name, av: av || null }, '#37474f');
            } else {
                el.textContent = String(name || '?').charAt(0).toUpperCase();
            }
            row.appendChild(el);
        };

        for (const it of items) {
            const row = document.createElement('div');
            row.className = 'fr-row';

/* V10F12-LIST-NO-INVITE-BRANCH */
            if (it.state === 'friend') {
                const dot = document.createElement('span');
                dot.className = 'fr-dot' + (it.online ? ' on' : '');
                dot.setAttribute('aria-hidden', 'true');
                row.appendChild(dot);
                avEl(row, it.name, it.av);
                const name = document.createElement('span');
                name.className = 'fr-name';
                name.textContent = it.name.toUpperCase();
                const sub = document.createElement('span');
                sub.className = 'fr-sub' + (it.online ? ' fr-sub-on' : '');
                sub.textContent = it.online ? 'ONLINE'
                    : (it.lastRaced ? 'RACED ' + this._relTime(it.lastRaced) : 'OFFLINE');
                row.appendChild(name);
                row.appendChild(sub);
                // INVITE only appears while they are actually online — an
                // invite to an absent driver would sit in a mailbox forever
                // and read as a broken button.
                if (it.online) btn(row, 'green', 'INVITE', () => this.inviteFriend(it.id));
                btn(row, 'red', 'REMOVE', () => this.removeFriend(it.id));
            } else if (it.state === 'incoming') {
                avEl(row, it.name, it.av);
                const name = document.createElement('span');
                name.className = 'fr-name';
                name.textContent = it.name.toUpperCase();
                const sub = document.createElement('span');
                sub.className = 'fr-sub';
                sub.textContent = 'WANTS TO ADD YOU';
                row.appendChild(name);
                row.appendChild(sub);
                btn(row, 'green', 'ACCEPT', () => this.acceptRequest(it.id));
                btn(row, 'red', 'DECLINE', () => this.declineRequest(it.id));
            } else {
                avEl(row, it.name, it.av);
                const name = document.createElement('span');
                name.className = 'fr-name';
                name.textContent = it.name.toUpperCase();
                const sub = document.createElement('span');
                sub.className = 'fr-sub';
                sub.textContent = 'PENDING';
                row.appendChild(name);
                row.appendChild(sub);
                btn(row, '', 'CANCEL', () => this.cancelRequest(it.id));
            }
            box.appendChild(row);
        }

        // BLOCKED — always last, only rendered when non-empty. A blocked
        // driver can't send requests that reach you and can never become a
        // friend again until you unblock them.
        const blockedIds = Object.keys(this.data.blocked);
        if (!blockedIds.length) return;
        const divider = document.createElement('div');
        divider.className = 'fr-divider';
        divider.textContent = 'BLOCKED (' + blockedIds.length + ')';
        box.appendChild(divider);
        blockedIds.sort((a, b) =>
            ((this.data.blocked[a].name || a).localeCompare(this.data.blocked[b].name || b)));
        for (const id of blockedIds) {
            const b = this.data.blocked[id];
            const row = document.createElement('div');
            row.className = 'fr-row fr-row-blocked';
            const name = document.createElement('span');
            name.className = 'fr-name fr-name-blocked';
            name.textContent = String(b.name || this._fmt(id)).toUpperCase();
            const sub = document.createElement('span');
            sub.className = 'fr-sub';
            sub.textContent = 'BLOCKED';
            row.appendChild(name);
            row.appendChild(sub);
            btn(row, '', 'UNBLOCK', () => this.unblock(id));
            box.appendChild(row);
        }
    },
};

window.Friends = Friends;
