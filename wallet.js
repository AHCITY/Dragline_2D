'use strict';

/*
 * ─── Redline 2D — Cloud Wallet (E1a: server-validated cash mirror) ─────
 *
 * WHY THIS EXISTS
 *  The E1 exploit (PT-R1): a devtools poke of `game.cash` + a save round-
 *  trip is indistinguishable from honest money — cash lived ONLY on the
 *  device. E1(a) fixes it by mirroring every cash movement to Firebase
 *  RTDB under a wallet node that is validated SERVER-SIDE. In a static
 *  deployment the "server" is the RTDB security rules (they run on
 *  Google's servers for every write, no backend needed), so the rules in
 *  firebase/database.rules.json (v6) are half of this feature — this
 *  module is the other half.
 *
 * THE MODEL (must stay in lockstep with rules v6 — see RULES-NOTES-v6.md)
 *  pdl_wallet/<pid> = {
 *      balance:  int 0..999999999,            // authoritative cloud cash
 *      head:     int,                         // last journal sequence
 *      move:     { seq, d, r, ts, b },        // last move slot (cross-check)
 *      ewStart:  int ms,                      // earn-window start
 *      ewSum:    int ≤ 60000,                 // earn-window positive sum
 *      journal:  { <key>: { seq, d, r, ts, b } }  // append-only audit log
 *  }
 *  Every money move = ONE atomic ref.transaction() that rewrites the whole
 *  wallet node with head+1 / balance+d / a new journal entry. The rules
 *  re-derive the same math from the PRE-WRITE node — a forged client can
 *  only ever land moves the rules' arithmetic and caps allow.
 *
 *  · ATOMICITY — RTDB transactions: concurrent tabs/devices retry on the
 *    server's copy of the node, never blind-overwrite (no lost updates).
 *  · SERVER VALIDATION — head must be old+1 (no replay/skip), balance must
 *    equal oldBalance + d, journal entry must mirror the move slot, d is a
 *    bounded integer, spends are always 'buy:*'/'upgrade:*' shaped, and
 *    positive deltas share a rolling earn window (60k per 10 min).
 *  · SAFE SAVING — the local game NEVER waits on this module. Moves queue
 *    and retry with backoff; on failure the local save keeps playing. The
 *    cloud copy is only adopted over the local one at boot, and only ever
 *    toward the HIGHER honest value (capped), so a network hiccup can
 *    never wipe progress (the exact data-loss failure mode E1(a) bans).
 *  · RECOVERY / AUDIT — the journal is append-only on the server (the
 *    rules only permit pruning entries older than 60 moves) with reason
 *    strings and balance-after for every move.
 *  · SANITY LIMITS — single-move caps, balance cap and the earn window
 *    are enforced by the RULES, not by trust in this client.
 *
 * OFFLINE / SIGNED-OUT — availability requires: Firebase configured,
 * RTDB auth ready, and the 16-char profile id. Without any of those the
 * wallet simply stays 'off' and the game behaves exactly like before.
 *
 * PATH NOTE — GPT's write-up said "mirror cash to pdl_profiles". The
 * mirror deliberately lives at pdl_wallet/<pid> instead: RTDB rules can
 * only GRANT privileges down the tree (never revoke), and pdl_profiles is
 * readable by every signed-in player for friends lookup — cash under it
 * would be world-readable. pdl_wallet keeps balances owner-private.
 * ─────────────────────────────────────────────────────────────────────── */

const Wallet = {
    // ── Tunables — MUST match firebase/database.rules.json (v6) ────────
    NODE: 'pdl_wallet',
    INIT_GRANT: 2500,            // starting cash (matches game.js fresh save)
    MAX_SINGLE_POS: 50000,       // PRO LEAGUE finals purse
    MAX_SINGLE_NEG: 500000,      // Funny Car price
    MAX_BALANCE: 999999999,      // sanitizeCash ceiling
    EARN_WINDOW_MS: 600000,      // 10-minute rolling window
    EARN_WINDOW_CAP: 60000,      // max positive $ per window
    OFFLINE_SYNC_CAP: 25000,     // max boot-replay of offline earnings
    JOURNAL_KEEP: 60,            // rules prune floor: seq ≤ head-60
    MAX_QUEUE: 200,
    BOOT_WAIT_MS: 15000,         // bounded wait for auth+claim at boot
    RETRY_MS: 3000,              // backoff between queue pumps on failure

    state: 'off',                // off | boot | on | degraded | local
    /* DEV TOOLS SEAM — flipped to true ONLY by dev files
       (game-dev-bridge.dev.js) for a local-authoritative playtest session.
       While held: no moves queue or commit, retry timers stop, and boot
       reconciliation never adopts the cloud balance over the local one —
       so dev money edits simply stick for the session and a rules denial
       can never silently revert them. The cloud node itself is never
       touched by the hold, and production code never sets this flag.
       Released by the dev menu's "Resume cloud sync" (wallet.resume). */
    devHold: false,
    pid: null,
    ref: null,
    cached: null,                // last server-known wallet node (or null)
    queue: [],                   // pending { d, r, ts }
    _pumping: false,
    _retryTimer: null,
    _bootTimer: null,
    _booted: false,
    _attempts: 0,

    /* Availability: Firebase configured + a real signed-in session + the
       profile id. Reuses MP's database handle and RLAuth's readiness —
       the same seams profile.js uses for its cloud mirror. */
    available() {
        if (typeof MP === 'undefined' || !MP.firebaseConfigured || !MP.firebaseConfigured()) return false;
        try { if (!MP.ensureFirebase()) return false; } catch (e) { return false; }
        if (!window.RLAuth || typeof RLAuth.ready !== 'function' || !RLAuth.ready()) return false;
        if (typeof Profile === 'undefined' || !Profile.data || !Profile.data.id) return false;
        return true;
    },

    /* Called from game.init() AFTER loadGame() (local cash known) and
       Profile.init() (profile id known). Never awaited — boot continues
       whether or not the cloud answers. Availability is RETRIED on a 1 s
       poll for up to BOOT_WAIT_MS: at this point in boot the Firebase auth
       SDK is usually still resolving its session, and a one-shot check
       would leave the wallet dark for the whole session. */
    init() {
        if (this._booted) return;
        if (this.available()) { this._arm(); return; }
        if (this._bootTimer) return;
        const deadline = Date.now() + this.BOOT_WAIT_MS;
        this._bootTimer = setInterval(() => {
            if (this._booted) { clearInterval(this._bootTimer); this._bootTimer = null; return; }
            if (this.available()) {
                clearInterval(this._bootTimer); this._bootTimer = null;
                this._arm();
            } else if (Date.now() > deadline) {
                clearInterval(this._bootTimer); this._bootTimer = null;
                this.state = 'off';
            }
        }, 1000);
    },

    /* Identity adoption (profile.js) may flip Profile.data.id moments after
       this wallet armed against the old one. Re-point to the new node and
       re-run boot reconciliation; queued moves replay through the same
       validated pipe against the new node (the rules re-derive every
       balance/seq invariant there). */
    rebind() {
        if (this.devHold) return;    // dev session: local is the truth, skip re-pointing
        if (!this._booted) return;   // still polling: _arm() reads the new pid
        if (typeof Profile === 'undefined' || !Profile.data || !Profile.data.id) return;
        if (this.pid === Profile.data.id) return;
        try {
            this.pid = Profile.data.id;
            this.ref = MP.db.ref(this.NODE + '/' + this.pid);
        } catch (e) { return; }
        this.cached = null;
        this.state = 'boot';
        this._reconcile().then(() => this._pump()).catch(() => {});
    },

    _arm() {
        if (this._booted) return;
        this._booted = true;
        this.state = 'boot';
        this.pid = Profile.data.id;
        this.ref = MP.db.ref(this.NODE + '/' + this.pid);
        // RLAuth.ready() means the auth SDK has a session; give the write-
        // once pdl_idClaim/<pid> a moment to have landed, then reconcile.
        setTimeout(() => { this._reconcile(); }, 1500);
    },

    /* ── Boot reconciliation (the data-loss safeguard) ──────────────────
       cloud missing → init grant, then replay honest offline earnings up
       to OFFLINE_SYNC_CAP. cloud ahead of local → adopt cloud (never lose
       cloud money). local ahead of cloud → replay the DIFF once (capped);
       a diff beyond the cap is tamper-shaped and the cloud value wins. */
    async _reconcile() {
        if (this.devHold) { this.state = 'local'; return; }   // dev session: never adopt cloud over local
        try {
            const snap = await this.ref.once('value');
            this.cached = snap.val();
            if (!this.cached || typeof this.cached.balance !== 'number') {
                // Fresh wallet — one strict boot-grant transaction.
                const ok = await this._ensureInit();
                if (!ok || !this.cached) { this.state = 'degraded'; return this._armRetry(); }
            }
            const cloudBal = Math.round(Number(this.cached.balance) || 0);
            const local = Math.round(Number(game && game.cash) || 0);
            if (typeof game === 'undefined') { this.state = 'on'; return; }
            if (local !== cloudBal) {
                const diff = local - cloudBal;
                // BOTH directions replay through the validated pipe when the
                // gap is small: local > cloud replays honest offline
                // EARNINGS, local < cloud replays honest offline PURCHASES
                // (adopting the cloud there would silently undo a part the
                // player already paid for). Beyond the cap the gap is
                // tamper-shaped and the cloud value wins — never the other
                // way round, so a network failure can never mint or wipe.
                if (Math.abs(diff) <= this.OFFLINE_SYNC_CAP) {
                    this.queue.unshift({ d: diff, r: 'offline-sync', ts: Date.now() });
                    this.state = 'on';
                } else {
                    this._adopt(cloudBal, 'CLOUD BALANCE RESTORED');
                }
            } else {
                this.state = 'on';
            }
            this._pump();
        } catch (e) {
            this.state = this._isRulesError(e) ? 'degraded' : 'local';
            this._armRetry();
        }
    },

    _adopt(cloudBal, msg) {
        if (this.devHold) return;    // dev session: a late reconcile must not revert local dev money
        if (typeof game === 'undefined') return;
        game.cash = Math.min(this.MAX_BALANCE, Math.max(0, Math.round(cloudBal)));
        if (game.scheduleSave) game.scheduleSave();
        if (game.updateMenuUI) game.updateMenuUI();
        this.state = 'on';
        this._notifyOnce(msg + ' — SYNCED');
    },

    _initNode(ts) {
        const entry = { seq: 1, d: this.INIT_GRANT, r: 'boot-grant', ts: ts, b: this.INIT_GRANT };
        return {
            balance: this.INIT_GRANT,
            head: 1,
            move: entry,
            ewStart: ts,
            ewSum: 0,
            journal: { g1: entry },
        };
    },

    /* ── The one public API — cash moves funnel in from game.js ─────────
       awardCash() and spendCash() call this AFTER their local application.
       It never throws, never blocks gameplay, and keeps the cloud chasing
       the local truth through validated atomic transactions. */
    move(delta, reason) {
        if (this.devHold) return;    // dev session: local edits never reach the cloud pipe
        if (!this.ref || !this._booted) return;
        const d = Math.round(Number(delta));
        if (!isFinite(d) || d === 0) return;
        // Reason charset mirrors the rules' regex; ledger-friendly.
        const r = String(reason || 'unknown').replace(/[^A-Za-z0-9:_-]/g, '') || 'unknown';
        this.queue.push({ d: Math.max(-this.MAX_SINGLE_NEG, Math.min(this.MAX_SINGLE_POS, d)), r: r.slice(0, 24), ts: Date.now() });
        if (this.queue.length > this.MAX_QUEUE) this.queue.splice(0, this.queue.length - this.MAX_QUEUE);
        this._pump();
    },

    async _pump() {
        if (this.devHold) return;    // dev session: nothing commits while held
        if (this._pumping) return;
        if (!this.queue.length || !this.ref) return;
        if (this.state === 'off' || this.state === 'local') return;
        this._pumping = true;
        try {
            while (this.queue.length && this.state !== 'off' && this.state !== 'local') {
                const mv = this.queue[0];
                const verdict = await this._commit(mv);
                if (verdict === 'ok') { this.queue.shift(); this._attempts = 0; this._retryDelay = 0; continue; }
                if (verdict === 'init-needed') {
                    // Wallet node missing but readable — run the strict boot
                    // grant, then re-commit the same move.
                    const ok = await this._ensureInit();
                    if (ok) continue;
                    this.state = 'local';
                    this._armRetry();
                    return;
                }
                if (verdict === 'denied') {
                    // The server refused a move the local game accepted —
                    // that is the anti-cheat bite: drop it and adopt the
                    // cloud balance. The boot replay is exempt: it IS the
                    // player's honest progress, so a window denial means
                    // retry (the 10-minute window rolls), not wipe.
                    if (mv.r === 'offline-sync') {
                        this._syncRetries = (this._syncRetries || 0) + 1;
                        if (this._syncRetries <= 20) { this.state = 'local'; this._armRetry(); return; }
                        this.queue.shift(); // give up eventually; local truth stands
                    } else {
                        this.queue.shift();
                        if (this.state === 'on') {
                            // Sudden refusal while synced = tamper-shaped.
                            this._notifyOnce('WALLET SYNC REJECTED — RESTORING CLOUD BALANCE');
                            this._resync();
                        }
                    }
                    this.state = 'degraded';
                    return;
                }
                // 'retry' — offline / raced / transient. Keep the move
                // queued (progress is safe locally) and back off.
                this.state = 'local';
                this._notifyOnce('CLOUD WALLET OFFLINE — SAVING LOCALLY');
                this._armRetry();
                return;
            }
        } finally {
            this._pumping = false;
        }
    },

    /* Returns 'ok' | 'retry' | 'denied' | 'init-needed'.

       Transaction outcome shapes (compat SDK):
         · committed:true                    → move landed
         · committed:false + snapshot.exists → raced/aborted, server state
           in hand → refresh cache and retry
         · committed:false + null node       → transform saw cur=null: either
           the wallet genuinely doesn't exist (init race → 'init-needed') or
           the READ itself was denied (probe with a bare read → 'denied')
         · throw permission_denied           → a write with a proposed value
           was refused outright → 'denied' */
    async _commit(mv) {
        // Client-side mirror of the rules' sanity limits — fail fast on
        // tamper-shaped moves instead of burning a round-trip.
        if (mv.d > this.MAX_SINGLE_POS || mv.d < -this.MAX_SINGLE_NEG) return 'denied';
        try {
            const res = await this.ref.transaction(cur => this._applyMove(cur, mv));
            if (res && res.committed) {
                this.cached = (res.snapshot && res.snapshot.val()) || this.cached;
                if (this.state !== 'on') this.state = 'on';
                return 'ok';
            }
            if (res && res.snapshot) {
                if (res.snapshot.exists()) {
                    this.cached = res.snapshot.val(); // raced — freshest truth
                    return 'retry';
                }
                // cur was null: missing wallet vs denied read.
                try { await this.ref.once('value'); return 'init-needed'; }
                catch (e) { return this._isRulesError(e) ? 'denied' : 'retry'; }
            }
            return 'retry';
        } catch (e) {
            if (this._isRulesError(e)) return 'denied';
            return 'retry';
        }
    },

    /* One strict boot-grant transaction (no-op when the wallet exists). */
    async _ensureInit() {
        try {
            const res = await this.ref.transaction(cur => {
                if (cur && typeof cur.balance === 'number') return undefined; // raced: exists now
                return this._initNode(Date.now());
            });
            if (res && res.committed) {
                this.cached = (res.snapshot && res.snapshot.val()) || this._initNode(Date.now());
                this.state = 'on';
                return true;
            }
            if (res && res.snapshot && res.snapshot.exists()) {
                this.cached = res.snapshot.val(); // someone else initialized it
                this.state = 'on';
                return true;
            }
            return false;
        } catch (e) {
            return false;
        }
    },

    /* PURE transaction transform — mirrors rules v6 math exactly. */
    _applyMove(cur, mv) {
        if (!cur || typeof cur.balance !== 'number' || typeof cur.head !== 'number') return undefined;
        const balance = Math.round(cur.balance);
        const head = Math.round(cur.head);
        const d = mv.d, r = mv.r, ts = mv.ts;
        const newBalance = balance + d;
        if (newBalance < 0 || newBalance > this.MAX_BALANCE) return undefined;
        // Earn window (positive deltas only) — matches the rules branch.
        let ewStart = Math.round(cur.ewStart || 0);
        let ewSum = Math.round(cur.ewSum || 0);
        if (d > 0) {
            if (ts - ewStart > this.EARN_WINDOW_MS) { ewStart = ts; ewSum = d; }
            else { ewSum += d; }
            if (ewSum > this.EARN_WINDOW_CAP) return undefined;
        }
        // Build the new node: head+1, new move slot, journal append + prune.
        const seq = head + 1;
        const entry = { seq: seq, d: d, r: r, ts: ts, b: newBalance };
        const journal = {};
        const src = cur.journal || {};
        for (const k in src) {
            const e = src[k];
            if (e && typeof e.seq === 'number' && e.seq <= seq - this.JOURNAL_KEEP) continue; // prune old
            journal[k] = e;
        }
        journal['j' + seq] = entry;
        return {
            balance: newBalance,
            head: seq,
            move: entry,
            ewStart: ewStart,
            ewSum: ewSum,
            journal: journal,
        };
    },

    /* Re-read cloud truth and adopt it (used after a rejected move). */
    async _resync() {
        if (!this.ref) return;
        try {
            const snap = await this.ref.once('value');
            const node = snap.val();
            if (node && typeof node.balance === 'number') {
                this.cached = node;
                if (typeof game !== 'undefined') {
                    const cloudBal = Math.round(node.balance);
                    if (game.cash !== cloudBal) this._adopt(cloudBal, 'CLOUD BALANCE RESTORED');
                }
            }
        } catch (e) { /* stays degraded; next move retries */ }
    },

    _armRetry() {
        if (this.devHold) {          // dev session: no auto-resume, kill any pending retry
            if (this._retryTimer) { clearTimeout(this._retryTimer); this._retryTimer = null; }
            return;
        }
        if (this._retryTimer) clearTimeout(this._retryTimer);
        // Backoff grows on consecutive failures (3s → 30s) so a long outage
        // (rules not published yet, network down) can't chatter the DB.
        this._retryDelay = Math.min(this._retryDelay ? this._retryDelay * 2 : this.RETRY_MS, 30000);
        const delay = this._retryDelay;
        this._retryTimer = setTimeout(() => {
            this._retryTimer = null;
            if (this.devHold) return;   // hold engaged between arm and fire
            if (this.state === 'local' || this.state === 'degraded') {
                // Come back online and drain whatever queued meanwhile.
                this.state = this.cached ? 'on' : 'boot';
                this._pump();
                if (!this.cached) this._reconcile();
            }
        }, delay);
    },

    _notifyOnce(msg) {
        if (typeof game === 'undefined' || !game.showNotification) return;
        if (this._lastNotify === msg) return; // dedupe: outages retry silently
        this._lastNotify = msg;
        game.showNotification(msg);
    },

    _isRulesError(e) {
        const code = String((e && e.code) || '').toUpperCase();
        const text = String((e && (e.message || e)) || '').toLowerCase();
        return code.includes('PERMISSION') || text.includes('permission_denied');
    },
};

window.Wallet = Wallet;
