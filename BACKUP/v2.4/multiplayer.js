'use strict';

/*
 * ─── Pixel Drag Legends — P2P Multiplayer ───────────────────────────────
 *
 * Architecture (see chat for the full writeup):
 *  - Each side's OWN car is simulated 100% locally — zero added latency,
 *    exactly like single-player.
 *  - The OPPONENT's car is a real `Car` instance too, driven by their real
 *    gas/brake/clutch/gear inputs streamed over WebRTC, run through the
 *    same deterministic Car.update() — not a fake dot, a real replica.
 *  - Periodic authoritative snapshots correct any drift. Since the two
 *    cars never collide, a snapshot correction is invisible.
 *  - Firebase Realtime Database is used ONLY to exchange the initial
 *    WebRTC handshake (SDP + ICE candidates) via a short room code. Once
 *    the connection opens, gameplay never touches Firebase again.
 *
 * ─── Firebase setup ────────────────────────────────────────────────────
 *  The config below is already filled in (project: pixelcarracer).
 *  Access to the tiny room mailbox under pdl_mp_rooms/<code> is granted
 *  by the Realtime Database rules configured in YOUR Firebase console —
 *  the game never shows or ships rules text; multiplayer simply degrades
 *  to a clear error line if the rules deny access.
 *
 * If the config is blanked out or Firebase can't be reached, the
 * Multiplayer menu shows a friendly "OFFLINE" badge instead of breaking
 * anything — single-player is completely unaffected either way.
 * ─────────────────────────────────────────────────────────────────────── */

const FIREBASE_CONFIG = {
    apiKey: "AIzaSyDVJ5dIrdi24itz2xOOY7BttKnWWY0cgm8",
    authDomain: "pixelcarracer-ff509.firebaseapp.com",
    databaseURL: "https://pixelcarracer-ff509-default-rtdb.firebaseio.com",
    projectId: "pixelcarracer-ff509",
    storageBucket: "pixelcarracer-ff509.firebasestorage.app",
    messagingSenderId: "877495673026",
    appId: "1:877495673026:web:fb195e7674d2066f0f1b5b",
    measurementId: "G-J1TD3S2QP0"
};

// Free public TURN relay (OpenRelay). STUN alone fails on strict/symmetric
// NATs — when the direct P2P link can't punch through, relaying the traffic
// usually can. Off by default (adds a small hop of latency); toggle it in
// the Multiplayer menu if connections keep failing.
const MP_TURN_SERVERS = [
    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
];
const MP_TURN_STORAGE_KEY = 'pdl_mp_turn';

// Firebase reads queue SILENTLY while offline — the promise never settles and
// the UI would hang forever. Race every DB read against a watchdog instead.
function withTimeout(promise, ms) {
    return Promise.race([
        promise,
        new Promise((_, rej) => setTimeout(() => rej(new Error('firebase timeout')), ms)),
    ]);
}

// Generous enough for a COLD first connection (DNS + TLS + websocket upgrade
// can take several seconds on slow networks) but still bounded so the UI
// can't hang forever. A live permission_denied reply arrives in milliseconds.
const MP_FB_WATCHDOG_MS = 10000;
/* How long to wait for the data channels to actually open. Firebase reads
   are already watchdogged, but nothing guarded the ICE/DTLS phase: a peer
   that vanished mid-handshake, a rejected answer (see the reconnect proof
   mismatch), or a network that black-holes STUN left the lobby sitting on
   "WAITING FOR OPPONENT..." forever with no error and no way to tell a
   slow connect from a dead one. Cleared by _onChannelOpen(). */
const MP_CONNECT_TIMEOUT_MS = 25000;
/* Backpressure thresholds for the unreliable state channel, in bytes.
   Payloads here are ~60 bytes, so the old single 48 KB guard tolerated
   roughly 800 queued ticks — about 2.5 s of input before it engaged, which
   is exactly the latency the guard exists to prevent. The soft threshold
   sheds `input` (cheap to lose, re-sent constantly); the hard one sheds
   everything including `sync`, so a genuinely wedged buffer still drains. */
const MP_STATE_BUFFER_MAX = 16384;
const MP_STATE_BUFFER_HARD = 65536;

const MP = {
    roomPath: 'pdl_mp_rooms',
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
    ],

    // ---- connection state ----
    isHost: false,
    pc: null,
    eventsChannel: null,   // reliable / ordered — discrete events
    stateChannel: null,    // unreliable / unordered — frequent ticks
    roomCode: null,
    roomRef: null,
    db: null,
    _connected: false,
    _pendingCandidates: null,
    _uiWired: false,
    _peerLostHandled: false,
    _discGraceTimer: null,
    _lobbyResetToken: 0,
    challenge: null,           // reconnect challenge we expect the peer to answer
    _expectedProof: null,      // hash(pairId, challenge) the guest's answer must carry
    _myOfferSdp: null,         // our own SDP while hosting a reconnect (yield detection)
    _reconnectListener: null,  // room ref watched while idle in the MP menu

    // ---- race/lobby state ----
    remoteLoadout: null,
    remoteProfile: null,       // peer's driver profile {id, name, av} — shared over P2P
    _remoteOutcome: null,      // peer's race report, may arrive before ours is requested

    // ---- lobby format + tournament series ----
    mpFormat: 'drag',          // 'drag' | 'tournament' — picked in the ready lobby
    series: null,              // { myWins, theirWins } while a best-of-3 series is live
    clockOffset: 0,
    countdownStart: null,
    _stagingFallbackAt: null,
    localRevved: false,
    remoteRevved: false,
    localReady: false,
    remoteReady: false,
    _launched: false,
    _outcomeResolve: null,
    _pongSamples: [],
    _lastGas: null, _lastBrake: null, _lastClutch: null,
    _lastInputSend: 0, _lastSync: 0,
    // Replica position-rate budget (see _applySync): _lastSyncX is the
    // position at the previous ACCEPTED sync and _lastSyncAt its timestamp,
    // so progress is validated per unit of REAL elapsed time. undefined =
    // "no previous sync", which seeds the budget from the live position.
    _lastSyncX: undefined, _lastSyncAt: 0,
    // Peer pause state (see pausedTick / sendPause). We do not freeze our
    // own sim when the peer pauses — they only stop driving.
    remotePaused: false, _pausedSince: 0, _lastPausedBeat: 0,
    _pausedSent: null,
    // Replica correction drained in tick(). Declared here (it used to be
    // created lazily on first assignment).
    _syncErr: 0,
    // Monotonic guard against reordered/replayed snapshots on the
    // UNORDERED channel.
    _lastSyncT: 0,

    init() {
        this._wireUI();
        // Nothing else to do yet — Firebase connects lazily when the player
        // actually opens the Multiplayer menu, so a blank/broken config
        // never touches single-player at all.
    },

    firebaseConfigured() {
        return !!(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.databaseURL);
    },

    // Turns a Firebase failure into a user-actionable hint. "permission_denied"
    // means we REACHED Firebase but the Realtime Database rules said no — very
    // different from being offline, so it gets its own message.
    _fbErrorMessage(e) {
        if (this._isRulesError(e)) return 'FIREBASE RULES BLOCK ACCESS — UPDATE YOUR DATABASE RULES';
        return 'COULD NOT REACH FIREBASE — CHECK CONNECTION';
    },

    // True when Firebase ANSWERED but the Realtime Database rules denied the
    // read/write. That is a console-side fix, not a network problem — the
    // player just gets a clear status line (no rules text is ever shown in-game).
    _isRulesError(e) {
        const code = String((e && e.code) || '').toUpperCase();
        const text = String((e && (e.message || e)) || '').toLowerCase();
        return code.includes('PERMISSION') || text.includes('permission_denied');
    },

    // Shared funnel for HOST/JOIN setup failures: tear down and surface a
    // clear status line, keeping the choice panel usable for a retry.
    _handleSetupError(e) {
        this.disconnect();
        this._show('mp-host-panel', false);
        this._show('mp-join-panel', false);
        this.status(this._fbErrorMessage(e), 'err');
        this._show('mp-choice', true);
    },

    ensureFirebase() {
        if (!this.firebaseConfigured()) return false;
        if (typeof firebase === 'undefined') return false;
        try {
            if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
            this.db = firebase.database();
            return true;
        } catch (e) {
            console.warn('Firebase init failed:', e);
            return false;
        }
    },

    // ─── One-time pairing + quick reconnect ──────────────────────
    // After the first successful handshake both sides remember the room
    // code and a shared pairId (exchanged over the DTLS-encrypted data
    // channel, NEVER through Firebase). Next session, either player hits
    // "RACE <NAME> AGAIN": they re-host the SAME code with a fresh random
    // challenge, and the peer — idling anywhere in the Multiplayer menu —
    // spots it and joins automatically, answering with hash(pairId,
    // challenge). A stranger who somehow guesses the 5-character room code
    // still can't answer that challenge, all race traffic stays direct
    // DTLS-encrypted P2P, and FORGET wipes the pairing at any time.
    _savedPair() {
        try {
            const raw = localStorage.getItem('pdl_mp_peer');
            if (!raw) return null;
            const p = JSON.parse(raw);
            return (p && p.code && p.pairId) ? p : null;
        } catch (e) { return null; }
    },

    _savePair(entry) {
        try { localStorage.setItem('pdl_mp_peer', JSON.stringify(entry)); } catch (e) {}
        this._refreshQuickPair();
    },

    forgetPair() {
        try { localStorage.removeItem('pdl_mp_peer'); } catch (e) {}
        this._refreshQuickPair();
        this.status('SAVED OPPONENT FORGOTTEN', '');
        game.showNotification('SAVED OPPONENT FORGOTTEN');
    },

    _currentPairId() {
        const saved = this._savedPair();
        if (saved && saved.code === this.roomCode) return saved.pairId;
        const fresh = this._randomHex(16);
        this._savePair({ code: this.roomCode, pairId: fresh, name: (saved && saved.name) || 'LAST OPPONENT', ts: Date.now() });
        return fresh;
    },

    _randomHex(bytes) {
        const arr = new Uint8Array(bytes);
        if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(arr);
        else for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
        return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
    },

    // Deterministic proof that we still hold the secret pairId — the
    // pairId itself never touches Firebase. Plain JS (not WebCrypto) so
    // every browser computes the exact same value.
    _pairProof(pairId, challenge) {
        let h1 = 0x811c9dc5, h2 = 0x1000193;
        const s = String(pairId) + ':' + String(challenge);
        for (let i = 0; i < s.length; i++) {
            h1 = ((h1 ^ s.charCodeAt(i)) * 16777619) >>> 0;
            h2 = ((h2 + s.charCodeAt(i) * (i + 7)) * 2654435761) >>> 0;
        }
        return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
    },

    _refreshQuickPair() {
        const btn = document.getElementById('mp-quick-btn');
        if (!btn) return;
        const saved = this._savedPair();
        const forget = document.getElementById('mp-quick-forget');
        if (saved) {
            const name = String(saved.name || 'LAST OPPONENT').toUpperCase().slice(0, 16);
            btn.innerText = 'RACE ' + name + ' AGAIN';
            btn.classList.remove('hidden');
            if (forget) forget.classList.remove('hidden');
        } else {
            btn.classList.add('hidden');
            if (forget) forget.classList.add('hidden');
        }
    },

    quickRaceAgain() {
        const saved = this._savedPair();
        if (saved) this.hostReconnect(saved);
    },

    // Re-host the SAVED room code with a fresh challenge and wait for the
    // saved peer to auto-join. Falls back to the guided error paths.
    async hostReconnect(saved) {
        if (this.pc || this.roomRef) return;
        if (!this.ensureFirebase()) { this.status('MULTIPLAYER NOT CONFIGURED — SEE multiplayer.js', 'err'); return; }
        this.isHost = true;
        this.roomCode = saved.code;
        this.status('RECONNECTING TO ' + String(saved.name || 'OPPONENT').toUpperCase() + '...', 'busy');

        try {
            // roomRef MUST exist before the PeerConnection is constructed.
            // iceCandidatePoolSize starts gathering immediately, and
            // onicecandidate drops candidates when roomRef is null — so
            // building the PC first silently threw away exactly the
            // prefetched pool candidates the pool exists to provide, and the
            // reconnect handshake fell back to a full STUN round-trip.
            this.roomRef = this.db.ref(this.roomPath + '/' + saved.code);
            this.roomRef.onDisconnect().remove();

            this._createPeerConnection();
            this.eventsChannel = this.pc.createDataChannel('events');
            this.stateChannel = this.pc.createDataChannel('state', { ordered: false, maxRetransmits: 0 });
            this._wireChannel(this.eventsChannel);
            this._wireChannel(this.stateChannel);

            this.challenge = this._randomHex(8);
            this._expectedProof = this._pairProof(saved.pairId, this.challenge);

            const offer = await this.pc.createOffer();
            await this.pc.setLocalDescription(offer);
            this._myOfferSdp = offer.sdp;
            // The challenge travels INSIDE the offer object, not as a
            // sibling key. When both players hit "race again", each host
            // writes the whole room node, and Firebase applies those writes
            // field-by-field with no ordering guarantee — so a top-level
            // `challenge` could come from the host whose `offer` was LOST.
            // The guest then proved itself against one host's challenge
            // while the surviving host verified against its own, the answer
            // was dropped as a proof mismatch, and the reconnect hung
            // forever with no timeout and no error. Nesting it makes offer
            // and challenge a single atomic value that always agree.
            await this.roomRef.set({
                ts: Date.now(),
                offer: { sdp: offer.sdp, type: offer.type, challenge: this.challenge },
            });

            this.roomRef.child('guestCandidates').on('child_added', snap => this._addRemoteCandidate(snap.val()));

            this._show('mp-choice', false);
            this._show('mp-host-panel', true);
            const codeEl = document.getElementById('mp-room-code');
            if (codeEl) codeEl.innerText = saved.code;
            const who = String(saved.name || 'OPPONENT').toUpperCase();
            this.status('WAITING FOR ' + who + ' TO OPEN MULTIPLAYER', 'busy');

            // If both players clicked the quick button, only one offer
            // survives the write race — detect the takeover and switch to
            // the guest seat instead of stalling.
            this.roomRef.child('offer').on('value', snap => {
                const val = snap.val();
                if (!val || !val.sdp || !this.pc || this.pc.currentRemoteDescription) return;
                if (val.sdp !== this._myOfferSdp) this._yieldReconnect(saved);
            });

            this.roomRef.child('answer').on('value', async snap => {
                const answer = snap.val();
                if (!answer || !answer.sdp || !this.pc || this.pc.currentRemoteDescription) return;
                // Challenge-response: refuse answers that don't prove the
                // shared pairId (wrong proof = someone guessed the code).
                if (answer.proof !== this._expectedProof) {
                    console.warn('Reconnect answer failed the pair check — ignored.');
                    return;
                }
                try {
                    await this.pc.setRemoteDescription(new RTCSessionDescription({ sdp: answer.sdp, type: answer.type }));
                    this._flushPendingCandidates();
                    this.status('CONNECTING...', 'busy');
                } catch (e) { console.warn('Bad reconnect answer:', e); }
            });
        } catch (e) {
            console.warn('Reconnect host failed:', e);
            this._handleSetupError(e);
        }
    },

    // Both of us hosted the same code and theirs won the write race —
    // tear our host setup down and take the guest seat instead.
    async _yieldReconnect(saved) {
        try { if (this.roomRef) { this.roomRef.off(); this.roomRef.onDisconnect().cancel(); } } catch (e) {}
        this.roomRef = null;
        if (this.pc) { try { this.pc.close(); } catch (e) {} }
        this.pc = null;
        this.eventsChannel = null;
        this.stateChannel = null;
        this.challenge = null;
        this._expectedProof = null;
        this._myOfferSdp = null;
        await this.joinReconnect(saved);
    },

    // Guest seat of a quick reconnect: read the room, prove the pairId,
    // answer. Same handshake as joinGame plus the proof field.
    async joinReconnect(saved) {
        if (this.pc || this.roomRef) return;
        if (!this.ensureFirebase()) { this.status('MULTIPLAYER NOT CONFIGURED — SEE multiplayer.js', 'err'); return; }
        this.isHost = false;
        this.roomCode = saved.code;
        this.status('OPPONENT IS STARTING A RACE — CONNECTING...', 'busy');
        this._armConnectWatchdog();

        const ref = this.db.ref(this.roomPath + '/' + saved.code);
        let room = null;
        try {
            const snap = await withTimeout(ref.once('value'), MP_FB_WATCHDOG_MS);
            room = snap.val();
        } catch (e) {
            console.warn('Reconnect join failed:', e);
            this._handleSetupError(e);
            return;
        }
        if (!room || !room.offer) { this.status('RECONNECT FAILED — HOST NOT IN A LOBBY YET', 'err'); return; }

        this.roomRef = ref;
        this._createPeerConnection();
        this.pc.ondatachannel = e => {
            if (e.channel.label === 'events') this.eventsChannel = e.channel;
            else if (e.channel.label === 'state') this.stateChannel = e.channel;
            this._wireChannel(e.channel);
        };
        this.roomRef.child('hostCandidates').on('child_added', snap => this._addRemoteCandidate(snap.val()));

        try {
            await this.pc.setRemoteDescription(new RTCSessionDescription(room.offer));
            this._flushPendingCandidates();
            const answer = await this.pc.createAnswer();
            await this.pc.setLocalDescription(answer);
            // Read the challenge from the OFFER, not a sibling key — see the note at
            // the host write. They are written as one atomic value.
            const proof = this._pairProof(saved.pairId, (room.offer && room.offer.challenge) || '');
            await this.roomRef.child('answer').set({ sdp: answer.sdp, type: answer.type, proof });
        } catch (e) {
            console.warn('Reconnect join failed:', e);
            this._handleSetupError(e);
            return;
        }
        this.status('CONNECTING...', 'busy');
    },

    // While the player idles in the Multiplayer menu, watch the saved room
    // code so a quick-reconnect host is joined AUTOMATICALLY — no typing,
    // no clicking: they open the menu and the lobby appears.
    _startReconnectListener() {
        if (!this.ensureFirebase()) return;
        const saved = this._savedPair();
        if (!saved || this.pc || this.roomRef || this._reconnectListener) return;
        const ref = this.db.ref(this.roomPath + '/' + saved.code);
        this._reconnectListener = ref;
        ref.on('value', snap => {
            const room = snap.val();
            if (!room || !room.offer || !room.ts) return;
            // Only react to FRESH quick-reconnect rooms (ts is written by
            // the quick host only) — stale leftovers are ignored.
            if (Date.now() - room.ts > 300000) return;
            // Never yank someone mid-typing a manual code.
            const jp = document.getElementById('mp-join-panel');
            if (jp && !jp.classList.contains('hidden')) return;
            if (this.pc || this.roomRef) return;
            this._stopReconnectListener();
            this.joinReconnect(saved);
        });
    },

    _stopReconnectListener() {
        if (this._reconnectListener) {
            try { this._reconnectListener.off(); } catch (e) {}
            this._reconnectListener = null;
        }
    },

    // ─── Lobby race format + best-of-3 tournament series ─────────
    setMode(mode) {
        if (this.mpFormat === mode) return;
        this.mpFormat = mode;
        this.series = null; // switching format abandons any running series
        this._refreshModeUI();
        this.sendEvent({ type: 'mode', mode });
        game.showNotification(mode === 'tournament' ? 'TOURNAMENT — FIRST TO 2 HEAT WINS' : 'SINGLE DRAG RACE');
        // Keep the lobby status line in sync with the picked format.
        const rp = document.getElementById('mp-ready-panel');
        if (rp && !rp.classList.contains('hidden')) {
            this.status(this.mpFormat === 'tournament' ? 'HEAT 1/3 · FIRST TO 2 WINS — READY UP' : 'REMATCH? BOTH HIT READY UP', 'ok');
        }
    },

    _refreshModeUI() {
        const drag = document.getElementById('mp-mode-drag');
        const tour = document.getElementById('mp-mode-tour');
        if (!drag || !tour) return;
        drag.classList.toggle('mp-mode-on', this.mpFormat !== 'tournament');
        tour.classList.toggle('mp-mode-on', this.mpFormat === 'tournament');
        drag.setAttribute('aria-pressed', this.mpFormat !== 'tournament' ? 'true' : 'false');
        tour.setAttribute('aria-pressed', this.mpFormat === 'tournament' ? 'true' : 'false');
    },

    seriesHeat() {
        if (this.mpFormat !== 'tournament') return 1;
        if (!this.series) this.series = { myWins: 0, theirWins: 0 };
        return this.series.myWins + this.series.theirWins + 1;
    },

    seriesDecided() {
        return !!(this.series && (this.series.myWins >= 2 || this.series.theirWins >= 2));
    },

    // Called from game._applyMultiplayerOutcome after every heat. Result is
    // 'won' | 'lost' | 'void' (double false-start = heat replayed). Returns
    // the standing so the results screen can show the series line.
    noteHeatOutcome(result) {
        if (this.mpFormat !== 'tournament') return null;
        if (!this.series) this.series = { myWins: 0, theirWins: 0 };
        const s = this.series;
        // Once the series is decided, stop counting — no phantom 0–3 lines.
        if (s.myWins < 2 && s.theirWins < 2) {
            if (result === 'won') s.myWins++;
            else if (result === 'lost') s.theirWins++;
        }
        return { myWins: s.myWins, theirWins: s.theirWins, done: s.myWins >= 2 || s.theirWins >= 2, heat: s.myWins + s.theirWins + 1 };
    },

    // ───────────────────────────────────────────── Menu / lobby ──────
    resetMenu() {
        this.disconnect();
        this._show('mp-choice', true);
        this._show('mp-host-panel', false);
        this._show('mp-join-panel', false);
        this._show('mp-ready-panel', false);
        const card = document.getElementById('mp-opp-card');
        if (card) card.classList.add('hidden');
        this._refreshStatsLine();
        const badge = document.getElementById('mp-net-badge');
        if (badge) {
            const ok = this.firebaseConfigured();
            badge.textContent = ok ? '\u25CF READY TO CONNECT' : '\u25CF OFFLINE \u2014 SETUP NEEDED';
            badge.classList.toggle('mp-badge-on', ok);
            badge.classList.toggle('mp-badge-off', !ok);
        }
        this.status('');
        this._refreshQuickPair();
        this._refreshModeUI();
        this._startReconnectListener();
    },

    // Persistent P2P record line on the MP console.
    _refreshStatsLine() {
        const statsLine = document.getElementById('mp-stats-line');
        if (!statsLine) return;
        const s = game.mpStats;
        let text;
        if (s && s.races > 0) {
            const et = s.bestET ? ' \u00B7 BEST ' + s.bestET.toFixed(3) + 's' : '';
            text = 'P2P RECORD ' + s.wins + 'W \u2013 ' + s.losses + 'L (' + s.races + ' RACES)' + et;
        } else {
            text = 'NO P2P RACES YET \u2014 HOST OR JOIN TO START A RECORD';
        }
        // Live best-of-3 standing while a series is in progress.
        if (this._connected && this.mpFormat === 'tournament' && this.series) {
            text += ' \u00B7 SERIES ' + this.series.myWins + '\u2013' + this.series.theirWins;
        }
        statsLine.textContent = text;
    },

    _show(id, visible) {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('hidden', !visible);
    },

    // kind: '' = info (cyan) | 'ok' = success (green) | 'busy' = waiting (pulse) | 'err' = error (red)
    status(text, kind) {
        const el = document.getElementById('mp-status');
        if (!el) return;
        el.innerText = text;
        el.classList.toggle('mp-status-ok', kind === 'ok');
        el.classList.toggle('mp-status-err', kind === 'err');
        el.classList.toggle('mp-status-busy', kind === 'busy');
    },

    // One-time wiring of the Multiplayer menu's input behaviours.
    _wireUI() {
        if (this._uiWired) return;
        this._uiWired = true;
        const input = document.getElementById('mp-code-input');
        if (input) {
            // Keep the code box clean: uppercase alphanumerics only, 5 chars.
            input.addEventListener('input', () => {
                const clean = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
                if (input.value !== clean) input.value = clean;
            });
            input.addEventListener('keydown', e => {
                if (e.key === 'Enter') { e.preventDefault(); this.joinGame(); }
            });
        }
        const copyBtn = document.getElementById('mp-copy-btn');
        if (copyBtn) copyBtn.addEventListener('click', () => this.copyRoomCode());
        // Quick-reconnect + FORGET: click lives in the markup; keyboard here.
        const quickBtn = document.getElementById('mp-quick-btn');
        if (quickBtn) quickBtn.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.quickRaceAgain(); }
        });
        const forgetBtn = document.getElementById('mp-quick-forget');
        if (forgetBtn) forgetBtn.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.forgetPair(); }
        });
        ['mp-mode-drag', 'mp-mode-tour'].forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            const pick = () => this.setMode(id === 'mp-mode-tour' ? 'tournament' : 'drag');
            el.addEventListener('click', pick);
            el.addEventListener('keydown', e => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); }
            });
        });
        const turnRow = document.getElementById('mp-turn-row');
        if (turnRow) {
            const toggle = () => this.setTurnEnabled(!this.turnEnabled());
            turnRow.addEventListener('click', toggle);
            turnRow.addEventListener('keydown', e => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
            });
        }
        this._refreshTurnUI();
    },

    // ─── TURN relay toggle (strict-NAT fallback) ───
    turnEnabled() {
        try { return localStorage.getItem(MP_TURN_STORAGE_KEY) === '1'; } catch (e) { return false; }
    },

    setTurnEnabled(on) {
        try { localStorage.setItem(MP_TURN_STORAGE_KEY, on ? '1' : '0'); } catch (e) {}
        this._refreshTurnUI();
        game.showNotification(on ? 'RELAY ON — USES A TURN SERVER' : 'RELAY OFF — DIRECT P2P ONLY');
        // Applies to the NEXT connection; a live one keeps its current ICE setup.
        this.status(on ? 'TURN RELAY WILL BE USED ON THE NEXT CONNECTION' : 'DIRECT P2P WILL BE USED ON THE NEXT CONNECTION');
    },

    _refreshTurnUI() {
        const row = document.getElementById('mp-turn-row');
        const state = document.getElementById('mp-turn-state');
        if (!row || !state) return;
        const on = this.turnEnabled();
        state.textContent = on ? 'ON' : 'OFF';
        row.classList.toggle('mp-turn-on', on);
        row.setAttribute('aria-checked', on ? 'true' : 'false');
    },

    copyRoomCode() {
        const el = document.getElementById('mp-room-code');
        const code = this.roomCode || (el ? el.innerText : '').trim();
        if (!code || code === '-----') return;
        const flash = () => {
            const btn = document.getElementById('mp-copy-btn');
            if (!btn) return;
            btn.textContent = 'COPIED!';
            setTimeout(() => { btn.textContent = 'COPY CODE'; }, 1200);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(code).then(flash).catch(() => {});
        } else {
            try {
                const ta = document.createElement('textarea');
                ta.value = code;
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

    showJoinPanel() {
        this._show('mp-choice', false);
        this._show('mp-join-panel', true);
        const input = document.getElementById('mp-code-input');
        if (input) { input.value = ''; setTimeout(() => input.focus(), 50); }
    },

    async hostGame() {
        if (this.pc || this.roomRef) return; // already hosting/joining
        if (!this.ensureFirebase()) { this.status('MULTIPLAYER NOT CONFIGURED — SEE multiplayer.js', 'err'); return; }
        this._show('mp-choice', false);
        this._show('mp-host-panel', true);
        this.status('CREATING ROOM...', 'busy');
        this.isHost = true;

        try {
            const code = await this._reserveRoomCode();
            this.roomCode = code;
            const codeEl = document.getElementById('mp-room-code');
            if (codeEl) codeEl.innerText = code;

            this.roomRef = this.db.ref(this.roomPath + '/' + code);
            this.roomRef.onDisconnect().remove();

            this._createPeerConnection();
            this.eventsChannel = this.pc.createDataChannel('events');
            this.stateChannel = this.pc.createDataChannel('state', { ordered: false, maxRetransmits: 0 });
            this._wireChannel(this.eventsChannel);
            this._wireChannel(this.stateChannel);

            this.roomRef.child('guestCandidates').on('child_added', snap => this._addRemoteCandidate(snap.val()));

            const offer = await this.pc.createOffer();
            await this.pc.setLocalDescription(offer);
            await this.roomRef.child('offer').set({ sdp: offer.sdp, type: offer.type });
        } catch (e) {
            console.warn('Host failed:', e);
            this._handleSetupError(e);
            return;
        }

        this.status('WAITING FOR OPPONENT...', 'busy');
        this._armConnectWatchdog();

        this.roomRef.child('answer').on('value', async snap => {
            const answer = snap.val();
            if (!answer || this.pc.currentRemoteDescription) return;
            await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
            this._flushPendingCandidates();
            this.status('CONNECTING...', 'busy');
        });
    },

    async joinGame() {
        if (this.pc || this.roomRef) return; // already joining/hosting
        if (!this.ensureFirebase()) { this.status('MULTIPLAYER NOT CONFIGURED — SEE multiplayer.js', 'err'); return; }
        const input = document.getElementById('mp-code-input');
        const code = (input ? input.value : '').trim().toUpperCase();
        if (code.length < 4) { this.status('ENTER A VALID CODE', 'err'); return; }
        this.isHost = false;
        this.roomCode = code;
        this.status('LOOKING FOR ROOM...', 'busy');

        const ref = this.db.ref(this.roomPath + '/' + code);
        let room = null;
        try {
            const snap = await withTimeout(ref.once('value'), MP_FB_WATCHDOG_MS);
            room = snap.val();
        } catch (e) {
            console.warn('Join failed:', e);
            this._handleSetupError(e);
            return;
        }
        if (!room || !room.offer) { this.status('ROOM NOT FOUND', 'err'); return; }

        this.roomRef = ref;
        this._createPeerConnection();
        this.pc.ondatachannel = e => {
            if (e.channel.label === 'events') this.eventsChannel = e.channel;
            else if (e.channel.label === 'state') this.stateChannel = e.channel;
            this._wireChannel(e.channel);
        };

        this.roomRef.child('hostCandidates').on('child_added', snap => this._addRemoteCandidate(snap.val()));

        try {
            await this.pc.setRemoteDescription(new RTCSessionDescription(room.offer));
            this._flushPendingCandidates();
            const answer = await this.pc.createAnswer();
            await this.pc.setLocalDescription(answer);
            await this.roomRef.child('answer').set({ sdp: answer.sdp, type: answer.type });
        } catch (e) {
            console.warn('Join failed:', e);
            if (this._isRulesError(e)) { this._handleSetupError(e); return; }
            this.status('JOIN FAILED — CHECK CODE AND RETRY', 'err');
            this.disconnect();
            this._show('mp-choice', true);
            this._show('mp-join-panel', true);
            return;
        }

        this.status('CONNECTING...', 'busy');
    },

    _createPeerConnection() {
        this._peerLostHandled = false;
        // iceCandidatePoolSize: pre-allocate/resolve a candidate BEFORE the
        // offer is created, taking STUN off the critical handshake path.
        const cfg = {
            iceServers: this.turnEnabled() ? this.iceServers.concat(MP_TURN_SERVERS) : this.iceServers,
            iceCandidatePoolSize: 2,
        };
        this.pc = new RTCPeerConnection(cfg);
        this.pc.onicecandidate = e => {
            if (!e.candidate || !this.roomRef) return;
            const list = this.isHost ? 'hostCandidates' : 'guestCandidates';
            this.roomRef.child(list).push(e.candidate.toJSON());
        };
        this.pc.onconnectionstatechange = () => {
            const s = this.pc && this.pc.connectionState;
            if (s === 'failed' || s === 'closed') { this._handlePeerLost(); return; }
            if (s === 'disconnected') {
                // 'disconnected' is NOT terminal — brief network blips recover
                // on their own. Only give up if it stays broken.
                if (this._discGraceTimer) clearTimeout(this._discGraceTimer);
                this._discGraceTimer = setTimeout(() => {
                    this._discGraceTimer = null;
                    const now = this.pc && this.pc.connectionState;
                    if (!this.pc || now === 'disconnected' || now === 'failed' || now === 'closed') {
                        this._handlePeerLost();
                    }
                }, MP_DISCONNECT_GRACE_MS);
            }
        };
    },

    // Single funnel for "the peer is gone" — resolves races fairly instead
    // of yanking players around, and keeps the lobby usable afterwards.
    _handlePeerLost() {
        if (this._peerLostHandled) return;
        this._peerLostHandled = true;

        const inRace = game.state === 'RACE' && game.raceMode === 'multiplayer' && !game.finished;
        if (inRace && game.raceState === 'RUNNING') {
            // Mid-run: resolve as a forfeit through the normal outcome path so
            // the remaining player keeps a result (and the win) — no yank.
            game.showNotification('OPPONENT LEFT \u2014 FORFEIT');
            game.finishMultiplayerRace({ falseStart: false, localFinishTime: 999, forfeit: true });
            return;
        }
        if (inRace) {
            // Pre-start (staging/countdown): nothing to resolve — clean exit.
            game.showNotification('OPPONENT DISCONNECTED');
            setTimeout(() => { if (game.state === 'RACE' && !game.finished) game.returnToMenu(); }, 1600);
            return;
        }
        // Lobby / ready screen: surface it in the MP status line, then reset.
        this.status('OPPONENT DISCONNECTED', 'err');
        const token = ++this._lobbyResetToken;
        setTimeout(() => {
            if (this._lobbyResetToken !== token) return;
            if (game.state !== 'RACE') this.resetMenu();
        }, 2500);
    },

    _addRemoteCandidate(data) {
        if (!data || !this.pc) return;
        if (!this.pc.remoteDescription) {
            this._pendingCandidates = this._pendingCandidates || [];
            this._pendingCandidates.push(data);
            return;
        }
        try { this.pc.addIceCandidate(new RTCIceCandidate(data)); } catch (e) {}
    },

    _flushPendingCandidates() {
        if (!this._pendingCandidates) return;
        const list = this._pendingCandidates;
        this._pendingCandidates = null;
        list.forEach(data => { try { this.pc.addIceCandidate(new RTCIceCandidate(data)); } catch (e) {} });
    },

    _wireChannel(channel) {
        channel.onopen = () => this._onChannelOpen();
        channel.onmessage = e => {
            let msg;
            try { msg = JSON.parse(e.data); } catch (err) { return; }
            // Dispatch is guarded too. A malformed peer message that throws
            // inside _handleMessage would otherwise propagate out of this
            // handler and take the whole connection's message pump with it —
            // every LATER message silently ignored for the rest of the race.
            // Dropping one bad message is always better than dropping all.
            try { this._handleMessage(msg); }
            catch (err) { console.warn('[MP] dropped a bad message:', msg && msg.type, err); }
        };
    },

    // Fails a handshake that never completes, so the player gets an actionable
    // message instead of an indefinite wait. Deliberately does NOT tear the
    // PeerConnection down on its own — the host may still be mid-gather on a
    // slow link, so this only surfaces the failure and leaves recovery to
    // the player (BACK, then retry).
    _armConnectWatchdog() {
        if (this._connectWatchdog) clearTimeout(this._connectWatchdog);
        this._connectWatchdog = setTimeout(() => {
            this._connectWatchdog = 0;
            if (this._connected) return;
            this.status('COULD NOT CONNECT — CHECK NETWORK, OR TURN RELAY', 'err');
            game.showNotification('CONNECTION TIMED OUT');
        }, MP_CONNECT_TIMEOUT_MS);
    },

    _onChannelOpen() {
        if (!this.eventsChannel || this.eventsChannel.readyState !== 'open') return;
        if (!this.stateChannel || this.stateChannel.readyState !== 'open') return;
        if (this._connected) return;
        this._connected = true;
        this._stopReconnectListener();
        if (this._connectWatchdog) { clearTimeout(this._connectWatchdog); this._connectWatchdog = 0; }

        // The direct P2P link is up — the Firebase "mailbox" is no longer
        // needed, so tidy it up after a short grace period.
        if (this.roomRef) {
            const ref = this.roomRef;
            const wasHost = this.isHost;
            setTimeout(() => { ref.off(); if (wasHost) ref.remove().catch(() => {}); }, 4000);
        }

        this._show('mp-choice', false);
        this._show('mp-host-panel', false);
        this._show('mp-join-panel', false);
        this._show('mp-ready-panel', true);
        this.status('CONNECTED! EXCHANGING CAR DATA...', 'ok');

        // BUGFIX: the READY UP button is hidden in setReady() once pressed and
        // only re-shown in the rematch lobby. A player who raced, left, and
        // then rejoined the same code used to land in a lobby with NO button.
        // A fresh connection always starts with the button visible.
        const readyBtn = document.getElementById('mp-ready-btn');
        if (readyBtn) {
            readyBtn.classList.remove('hidden');
            readyBtn.classList.remove('mp-ready-glow');
            readyBtn.removeAttribute('aria-hidden');
        }
        this.localReady = false;
        this.remoteReady = false;

        // Fresh connection → clear last session's opponent card + profile.
        this.remoteProfile = null;
        const oppCard = document.getElementById('mp-opp-card');
        if (oppCard) oppCard.classList.add('hidden');

        // One-time pairing: both sides remember {code, pairId} so future
        // sessions can reconnect WITHOUT typing the code again. The pairId
        // travels over the DTLS-encrypted data channel — never Firebase.
        if (this.isHost) this.sendEvent({ type: 'pair', pairId: this._currentPairId(), code: this.roomCode });
        this._refreshQuickPair();

        // Introduce the drivers, then the cars — the profile arrives as its
        // own event so a peer can greet you by name even before loadouts land.
        if (typeof Profile !== 'undefined') this.sendEvent({ type: 'profile', p: Profile.share() });
        this._renderLobbySelf();

        this.sendLoadout();
        this.calibrateClock();
    },

    // Fills the "YOU" lobby card: avatar, driver name and a live showroom
    // preview of the car you are bringing (customization included).
    _renderLobbySelf() {
        const card = document.getElementById('mp-me-card');
        if (!card) return;
        if (typeof Profile !== 'undefined') {
            const av = document.getElementById('mp-me-avatar');
            if (av) Profile.renderAvatar(av, { name: Profile.name(), av: Profile.avatar() }, '#2e7d32');
            const nameEl = document.getElementById('mp-me-name');
            if (nameEl) nameEl.textContent = Profile.name().toUpperCase();
        }
        if (game.playerCar) {
            const carEl = document.getElementById('mp-me-car');
            if (carEl) {
                const paint = (typeof game.paintName === 'function') ? game.paintName(game.playerCar.color) : '';
                carEl.textContent = String(game.playerCar.name).toUpperCase() + (paint ? ' \u00B7 ' + paint : '');
            }
            this._renderUpgradeBadges('mp-me-card', game.playerCar.upgrades);
            if (typeof game.renderLobbyCar === 'function') game.renderLobbyCar('mp-me-preview', game.playerCar);
        }
    },

    // Small TURBO/NOS stage chips under a lobby card's car line. The loadout
    // payload already carries `upgrades`, so both drivers' hardware shows in
    // the lobby with ZERO protocol changes. Row removed when nothing to show.
    _renderUpgradeBadges(cardId, upgrades) {
        const textCol = document.querySelector('#' + cardId + ' .mp-lobby-text');
        if (!textCol) return;
        let row = textCol.querySelector('.mp-upg-row');
        const t = (upgrades && typeof upgrades.turbo === 'number') ? Math.max(0, Math.min(3, upgrades.turbo | 0)) : 0;
        const n = (upgrades && typeof upgrades.nos === 'number') ? Math.max(0, Math.min(3, upgrades.nos | 0)) : 0;
        if (!t && !n) { if (row) row.remove(); return; }
        if (!row) {
            row = document.createElement('span');
            row.className = 'mp-upg-row';
            textCol.appendChild(row);
        }
        const ROMAN = ['', 'I', 'II', 'III'];
        row.innerHTML = '';
        if (t) {
            const b = document.createElement('span');
            b.className = 'mp-upg-badge mp-upg-turbo';
            b.textContent = 'TURBO ' + ROMAN[t];
            row.appendChild(b);
        }
        if (n) {
            const b = document.createElement('span');
            b.className = 'mp-upg-badge mp-upg-nos';
            b.textContent = 'NOS ' + ROMAN[n];
            row.appendChild(b);
        }
    },

    setReady() {
        this.localReady = true;
        this.sendLoadout();
        this.sendEvent({ type: 'ready' });
        const btn = document.getElementById('mp-ready-btn');
        if (btn) { btn.classList.add('hidden'); btn.setAttribute('aria-hidden', 'true'); }
        this.status(this.remoteReady ? 'BOTH READY \u2014 STARTING...' : 'WAITING FOR OPPONENT TO READY UP...', 'ok');
        this._maybeLaunch();
    },

    _maybeLaunch() {
        if (this.localReady && this.remoteReady && !this._launched) {
            this._launched = true;
            // A completed series restarts clean on the next launch — both
            // sides derive the reset from identical counts, so no drift.
            if (this.mpFormat === 'tournament' && this.seriesDecided()) this._resetSeries();
            game.startRaceMode('multiplayer');
        }
    },

    _resetSeries() { this.series = { myWins: 0, theirWins: 0 }; },

    disconnect() {
        this._connected = false;
        this._launched = false;
        this.remoteProfile = null;
        this.localReady = false;
        this.remoteReady = false;
        this.localRevved = false;
        this.remoteRevved = false;
        this.countdownStart = null;
        this._stagingFallbackAt = null;
        this._remoteOutcome = null;
        this._outcomeResolve = null;
        this._pendingCandidates = null;
        this._peerLostHandled = true; // we're tearing down on purpose
        if (this._discGraceTimer) { clearTimeout(this._discGraceTimer); this._discGraceTimer = null; }
        if (this._connectWatchdog) { clearTimeout(this._connectWatchdog); this._connectWatchdog = 0; }
        this.remotePaused = false;
        this._pausedSince = 0;
        this._pausedSent = null;
        this._lastPausedBeat = 0;
        if (this.eventsChannel) { try { this.eventsChannel.close(); } catch (e) {} this.eventsChannel = null; }
        if (this.stateChannel) { try { this.stateChannel.close(); } catch (e) {} this.stateChannel = null; }
        if (this.pc) { try { this.pc.close(); } catch (e) {} this.pc = null; }
        if (this.roomRef) {
            try { this.roomRef.off(); if (this.isHost) this.roomRef.remove().catch(() => {}); } catch (e) {}
            this.roomRef = null;
        }
        this.roomCode = null;
        this.remoteLoadout = null;
        this._pongSamples = [];
        this.challenge = null;
        this._expectedProof = null;
        this._myOfferSdp = null;
        this._stopReconnectListener();
        this.series = null;
        this.mpFormat = 'drag';
        this._refreshModeUI();
        this._refreshQuickPair();
    },

    leaveMultiplayer() {
        this.disconnect();
        game.returnToMenu();
    },

    async _reserveRoomCode() {
        const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I — easy to read aloud
        // RTDB requests queue silently while offline — don't hang the UI on
        // that forever; race each read against a watchdog.
        const withWatchdog = (p, ms) => Promise.race([
            p,
            new Promise((_, rej) => setTimeout(() => rej(new Error('firebase timeout')), ms)),
        ]);
        for (let attempt = 0; attempt < 6; attempt++) {
            let code = '';
            for (let i = 0; i < 5; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
            const snap = await withWatchdog(this.db.ref(this.roomPath + '/' + code).once('value'), MP_FB_WATCHDOG_MS);
            if (!snap.exists()) return code;
        }
        return 'R' + Math.floor(1000 + Math.random() * 9000);
    },

    // ───────────────────────────────────────────── Messaging ─────────
    sendEvent(obj) {
        const dc = this.eventsChannel;
        if (!dc || dc.readyState !== 'open') return;
        // Reliable/ordered SCTP buffers without bound, so a send on a channel
        // that closed between the readyState check and the call throws. That
        // exception would unwind through the caller (usually a UI handler),
        // and these messages are all load-bearing (loadout, ready, outcome).
        // Never let a closed channel take the game down.
        try { dc.send(JSON.stringify(obj)); } catch (e) { /* channel closed mid-send */ }
    },
    sendState(obj) {
        const dc = this.stateChannel;
        if (!dc || dc.readyState !== 'open') return;
        // Backpressure guard: a network hiccup can make the send buffer grow
        // faster than SCTP drains it. Queuing more stale input/sync ticks
        // behind it only adds latency — the freshest packet is the ONLY one
        // worth sending on an unreliable channel, so drop and let the next
        // tick (≤50ms away) carry newer data instead.
        //
        // `sync` is the load-bearing message: it is what keeps the remote
        // replica's position honest, and losing it desyncs the opponent's
        // view of us. Input is a held state that is re-sent on every change
        // and on a 20 Hz heartbeat, so it is the safe thing to sacrifice. A
        // single shared drop previously discarded both together, which meant
        // a congested pipe silently degraded positions to nothing.
        const congested = dc.bufferedAmount > MP_STATE_BUFFER_MAX;
        if (congested && obj.type !== 'sync') return;
        // Even a sync is pointless if the buffer is far past recovery.
        if (dc.bufferedAmount > MP_STATE_BUFFER_HARD) return;
        try { dc.send(JSON.stringify(obj)); } catch (e) { /* channel closed mid-send */ }
    },

    sendLoadout() {
        const c = game.playerCar;
        if (!c) return;
        this.sendEvent({ type: 'loadout', car: {
            name: c.name, color: c.color, secondaryColor: c.secondaryColor, price: c.price,
            type: c.type, art: c.art, baseHp: c.baseHp, baseRedline: c.baseRedline,
            baseGearRatios: c.baseGearRatios, baseFinalDrive: c.baseFinalDrive,
            baseWeight: c.baseWeight, baseGrip: c.baseGrip, baseDragArea: c.baseDragArea,
            upgrades: c.upgrades, tune: c.tune,
            // IDs only — the peer re-hydrates them into drawable entries, so
            // their replica of YOUR car wears YOUR rims/livery/spoiler too.
            customization: (typeof serializeCustomization === 'function') ? serializeCustomization(c.customization) : null,
        }});
    },

    // Builds a REAL Car instance matching the opponent's actual stats, so
    // replaying their real inputs through it produces a faithful replica —
    // not a placeholder dot.
    buildOpponentCar() {
        const cd = this.remoteLoadout;
        const def = cd ? {
            name: cd.name, hp: cd.baseHp, weight: cd.baseWeight, grip: cd.baseGrip,
            redline: cd.baseRedline, price: cd.price || 0, color: cd.color,
            secondaryColor: cd.secondaryColor, type: cd.type, art: cd.art || cd.type,
            gearRatios: cd.baseGearRatios, finalDrive: cd.baseFinalDrive, dragArea: cd.baseDragArea,
            upgrades: cd.upgrades, tune: cd.tune,
        } : {
            name: 'Opponent', hp: 200, weight: 1200, grip: 1, redline: 7000, price: 0,
            color: '#2196f3', secondaryColor: '#0d47a1', type: 'sedan', art: 'sedan',
            gearRatios: [0, 3.2, 2.2, 1.6, 1.2, 1.0], finalDrive: 3.9, dragArea: 0.75,
        };
        const car = new Car(def);
        if (cd && cd.customization && typeof hydrateCustomization === 'function') {
            try { car.customization = hydrateCustomization(cd.customization); } catch (e) {}
        }
        return car;
    },

    sendShift(type) { this.sendEvent({ type }); },

    armForRace() {
        this.localRevved = false;
        this.remoteRevved = false;
        this.countdownStart = null;
        this._stagingFallbackAt = null;
        this._remoteOutcome = null;   // never leak the previous race's report
        this._syncErr = 0;            // replica corrections start clean
        this._lastSyncT = 0;
        // Position-rate budget in _applySync is measured from the previous
        // accepted sync, so both must reset here or a rematch inherits the
        // last heat's origin and rejects the opening snapshots as too fast.
        this._lastSyncX = undefined;
        this._lastSyncAt = 0;
        this.remotePaused = false;
        this._pausedSince = 0;
        this._pausedSent = null;
        this._lastPausedBeat = 0;
        // Input-send bookkeeping belongs to the previous heat too — without
        // this the first heartbeat after a rematch can be skipped.
        this._lastGas = null;
        this._lastBrake = null;
        this._lastClutch = null;
        this._lastInputSend = 0;
        this._lastSync = 0;
    },

    // ─────────────────────────────────────── Rematch ────────────────
    // Offers a rematch over the still-open peer connection. Both sides are
    // brought back to the ready-up lobby; the normal READY UP handshake
    // then re-launches the race — no re-hosting, no new room code.
    beginRematch() {
        if (!this._connected) { game.returnToMenu(); return; }
        this.sendEvent({ type: 'rematch' });
        this._enterRematchLobby();
    },

    _enterRematchLobby() {
        // Reset per-race state WITHOUT tearing down the connection.
        this.localReady = false;
        this.remoteReady = false;
        this._launched = false;
        this._remoteOutcome = null;
        this._outcomeResolve = null;
        this.localRevved = false;
        this.remoteRevved = false;
        this.countdownStart = null;
        this._stagingFallbackAt = null;
        this._syncErr = 0;
        this._lastSyncT = 0;

        game.state = 'MENU';
        game.menuState = 'MULTIPLAYER';
        game.finished = false;
        game.paused = false;
        document.querySelectorAll('.menu-overlay').forEach(el => el.classList.add('hidden'));
        const menu = document.getElementById('multiplayer-menu');
        if (menu) menu.classList.remove('hidden');
        this._show('mp-choice', false);
        this._show('mp-host-panel', false);
        this._show('mp-join-panel', false);
        this._show('mp-ready-panel', true);
        const btn = document.getElementById('mp-ready-btn');
        if (btn) {
            btn.classList.remove('hidden');
            btn.removeAttribute('aria-hidden');
            btn.classList.add('mp-ready-glow');
            // Save a click: the rematch conversation is already open, so put
            // the READY UP button under the cursor / keyboard focus.
            try { btn.focus({ preventScroll: true }); } catch (e) {}
            setTimeout(() => btn.classList.remove('mp-ready-glow'), 2600);
        }
        this._renderLobbySelf();
        // Opponent card: re-render from the still-known loadout + profile so
        // the lobby previews never go stale between heats.
        if (this.remoteLoadout) {
            const card = document.getElementById('mp-opp-card');
            if (card) {
                card.classList.remove('hidden');
                if (this.remoteProfile && typeof Profile !== 'undefined') {
                    const av = document.getElementById('mp-opp-avatar');
                    if (av) Profile.renderAvatar(av, this.remoteProfile, (this.remoteLoadout.color) || '#546e7a');
                }
                if (typeof game.renderLobbyCar === 'function') {
                    try { game.renderLobbyCar('mp-opp-preview', this.buildOpponentCar()); } catch (e) {}
                }
                this._renderUpgradeBadges('mp-opp-card', this.remoteLoadout.upgrades);
            }
        }
        this._refreshStatsLine();
        this.status(this.mpFormat === 'tournament' && this.series
            ? 'HEAT ' + this.seriesHeat() + '/3 \u00B7 FIRST TO 2 WINS \u2014 READY UP'
            : 'REMATCH? BOTH HIT READY UP', 'ok');
    },

    // Called every multiplayer physics tick from game.updateMultiplayerRace().
    tick() {
        this._updateStageHint();
        if (!this._connected) return;
        const p = game.playerCar;
        if (!p) return;
        const now = performance.now();

        // Ease out any pending replica position correction (set by _applySync)
        // — spreading it over ~1/3s reads as smooth catch-up instead of the
        // old instant 30% snap every 300ms (a visible rubber-band on the
        // opponent preview).
        if (this._syncErr && game.opponentCar) {
            const o = game.opponentCar;
            // Self-heal: a non-finite correction or replica position means
            // something upstream produced NaN. `if (this._syncErr)` is FALSE
            // for NaN, so without this the drain silently never runs and the
            // replica stays broken for the rest of the race with no way back.
            if (!Number.isFinite(this._syncErr) || !Number.isFinite(o.x)) {
                this._syncErr = 0;
                o.x = Number.isFinite(o.x) ? o.x : 0;
            } else {
                const step = this._syncErr * 0.08;
                o.x += step;
                this._syncErr -= step;
                if (Math.abs(this._syncErr) < 0.01) this._syncErr = 0;
            }
        }

        if (p.gas > 0.1) this.localRevved = true;

        const changed = p.gas !== this._lastGas || p.brake !== this._lastBrake || p.clutch !== this._lastClutch;
        if (changed || now - this._lastInputSend > 1000 / MP_INPUT_HZ) {
            this.sendState({ type: 'input', gas: p.gas, brake: p.brake, clutch: p.clutch });
            this._lastGas = p.gas; this._lastBrake = p.brake; this._lastClutch = p.clutch;
            this._lastInputSend = now;
        }

        if (now - this._lastSync > MP_SYNC_MS) {
            this.sendState({ type: 'sync', t: now, x: p.x, speed: p.speed, rpm: p.rpm, gear: p.gear });
            this._lastSync = now;
        }

        if (this.isHost && this.localRevved && !this.countdownStart && game.raceState === 'STAGING') {
            if (this.remoteRevved) {
                this.beginSynchronizedCountdown();
            } else if (!this._stagingFallbackAt) {
                // Arm silently: if the opponent never revs, don't stall forever.
                this._stagingFallbackAt = now + MP_STAGING_FALLBACK_MS;
            } else if (now >= this._stagingFallbackAt) {
                game.showNotification('STARTING WITHOUT OPPONENT');
                this.beginSynchronizedCountdown();
            }
        }
    },

    // Keep the link alive while THIS player is paused.
    //
    // MP.tick() only runs inside the fixed physics step, so pausing stopped
    // every heartbeat and sync. The peer had no way to tell "paused" from
    // "hung": it kept integrating a replica that stopped receiving input, and
    // nothing told it the race clock had been frozen. Two problems follow —
    // a genuine freeze-frame looks identical to a dropped peer, and because
    // game._unpauseClock() shifts raceStartTime locally, pausing was a FREE
    // TIME OUT: you sat still, the clock you are judged by did not advance,
    // and you resumed on track with the ground you did not cover.
    //
    // Called from the render loop (which keeps running while paused). It does
    // not touch the simulation — it only proves liveness and tells the peer
    // the race is intentionally halted.
    pausedTick() {
        if (!this._connected || !game.paused) return;
        const now = performance.now();
        if (now - (this._lastPausedBeat || 0) < 1000 / MP_INPUT_HZ) return;
        this._lastPausedBeat = now;
        this.sendState({ type: 'paused', t: now });
    },

    // Announce a pause/resume to the peer. Reliable channel: the peer must
    // not learn about this from a dropped unreliable packet.
    sendPause(paused) {
        if (!this._connected || this._pausedSent === paused) return;
        this._pausedSent = paused;
        this._lastPausedBeat = 0;
        this.sendEvent({ type: 'pause', paused: !!paused });
    },

    // HUD staging hint (MP only): tells each player what the light sequence
    // is waiting for, then counts the synchronized countdown down so both
    // sides can time their clutch dump. Change-detected so we only touch the
    // DOM when the text actually differs.
    _updateStageHint() {
        const el = document.getElementById('mp-stage-hint');
        if (!el) return;
        let text = '';
        const now = performance.now();
        if (game.state === 'RACE' && !game.finished && this._connected) {
            if (game.raceState === 'STAGING') {
                if (this.isHost) {
                    text = this.remoteRevved ? 'OPPONENT READY \u2014 REV (W) TO START!' : 'REV (W) \u2014 WAITING FOR OPPONENT';
                } else {
                    text = 'REV (W) \u2014 HOST WILL START THE LIGHTS';
                }
            } else if (game.raceState === 'COUNTDOWN' && this.countdownStart) {
                // Numeric countdown to the synchronized green light.
                const remain = 4 - (now - this.lightTimerBase()) / 1000;
                if (remain > 0) text = 'LAUNCH IN ' + remain.toFixed(1) + 's';
            }
        }
        if (text !== this._stageHintText) {
            this._stageHintText = text;
            el.innerText = text;
            el.classList.toggle('hidden', !text);
        }
    },

    // When the countdown is armed, game.lightTimer equals the shared start
    // instant (set by updateMultiplayerRace). Fall back to our own countdown
    // start timestamp if that hasn't happened yet.
    lightTimerBase() {
        return game.lightTimer || this.countdownStart || performance.now();
    },

    // Host-only: picks a near-future instant and broadcasts it so both
    // sides start the light sequence at (as close as possible to) the
    // same real-world moment.
    beginSynchronizedCountdown() {
        const startAt = performance.now() + MP_START_LEAD_MS;
        this.countdownStart = startAt;
        this.sendEvent({ type: 'countdown', hostStart: startAt });
    },

    // Guest-only: estimates (host clock − our clock) via a few ping/pong
    // round trips, so a host timestamp can be converted into our own
    // performance.now() timeline.
    calibrateClock() {
        if (this.isHost) return;
        this._pongSamples = [];
        let sent = 0;
        const step = () => {
            if (sent >= 5) {
                if (this._pongSamples.length) {
                    const best = this._pongSamples.reduce((a, b) => (a.rtt < b.rtt ? a : b));
                    this.clockOffset = best.offset;
                }
                return;
            }
            sent++;
            this.sendEvent({ type: 'ping', t0: performance.now() });
            setTimeout(step, 120);
        };
        step();
    },

    // Sends this side's race result and waits (briefly) for the peer's
    // matching report so both sides agree on the outcome before either
    // applies a reward. Falls back to locally-observed data on timeout
    // (e.g. the peer disconnected right at the line).
    reportOutcome(local, fallbackRemote, callback) {
        this.sendEvent({ type: 'raceOutcome', falseStart: !!local.falseStart, finishTime: local.finishTime ?? 999 });

        // The peer may have finished BEFORE us — their report arrives while
        // nobody is listening yet. It's stored, not dropped, so use it now.
        if (this._remoteOutcome) {
            const remote = this._remoteOutcome;
            this._remoteOutcome = null;
            callback(remote);
            return;
        }

        let done = false;
        this._outcomeResolve = (remote) => {
            if (done) return;
            done = true;
            this._outcomeResolve = null;
            callback(remote);
        };
        setTimeout(() => {
            if (done) return;
            done = true;
            this._outcomeResolve = null;
            callback(fallbackRemote);
        }, MP_OUTCOME_TIMEOUT_MS);
    },

    _handleMessage(msg) {
        switch (msg.type) {
            case 'loadout': {
                this.remoteLoadout = msg.car;
                // Remember the opponent on our saved pairing so the
                // quick-reconnect button can greet them by name. Their driver
                // profile name wins when it has already arrived; the car name
                // is only the fallback.
                const savedPair = this._savedPair();
                if (savedPair && msg.car && msg.car.name && !this.remoteProfile) {
                    savedPair.name = String(msg.car.name).slice(0, 24);
                    savedPair.ts = Date.now();
                    this._savePair(savedPair);
                }
                // Update the ready-panel opponent card (visible whenever the
                // panel is open, regardless of whether the loadout or the
                // panel got here first).
                const card = document.getElementById('mp-opp-card');
                if (card && msg.car) {
                    card.classList.remove('hidden');
                    const name = document.getElementById('mp-opp-name');
                    const stats = document.getElementById('mp-opp-stats');
                    if (name && !this.remoteProfile) name.textContent = String(msg.car.name || 'UNKNOWN CAR').toUpperCase();
                    if (stats) {
                        stats.textContent = String(msg.car.name || '').toUpperCase() + ' \u00B7 ' +
                            (typeof msg.car.baseHp === 'number' ? Math.round(msg.car.baseHp) + ' HP' : '---') + ' \u00B7 ' +
                            (typeof msg.car.baseWeight === 'number' ? Math.round(msg.car.baseWeight) + ' KG' : '---');
                    }
                    // Live showroom preview: the peer's real customization
                    // re-hydrated into a display car, so their rims/spoiler/
                    // livery choices are visible BEFORE the race starts.
                    if (typeof game.renderLobbyCar === 'function') {
                        try { game.renderLobbyCar('mp-opp-preview', this.buildOpponentCar()); } catch (e) {}
                    }
                    this._renderUpgradeBadges('mp-opp-card', msg.car.upgrades);
                }
                const rp = document.getElementById('mp-ready-panel');
                // `msg.car` is guaranteed by the guard above, but this line
                // sat OUTSIDE it and threw a TypeError inside the data
                // channel onmessage handler on a malformed loadout — which
                // killed the message pump for every later message too.
                if (rp && msg.car && !rp.classList.contains('hidden')) {
                    this.status('OPPONENT IS DRIVING A ' + String(msg.car.name || 'CAR').toUpperCase(), 'ok');
                }
                break;
            }
            case 'profile': {
                const p = msg.p;
                if (p && p.id) {
                    this.remoteProfile = {
                        id: String(p.id).slice(0, 40),
                        name: String(p.name || '').slice(0, 20),
                        av: (typeof p.av === 'string' && p.av.length <= 60000) ? p.av : null,
                    };
                    // Greet the opponent by their DRIVER name on the saved
                    // pairing (overrides the earlier car-name fallback).
                    if (this.remoteProfile.name) {
                        const savedPair = this._savedPair();
                        if (savedPair) {
                            savedPair.name = this.remoteProfile.name;
                            savedPair.ts = Date.now();
                            this._savePair(savedPair);
                            this._refreshQuickPair();
                        }
                    }
                    const card = document.getElementById('mp-opp-card');
                    if (card) {
                        card.classList.remove('hidden');
                        if (typeof Profile !== 'undefined') {
                            const av = document.getElementById('mp-opp-avatar');
                            if (av) Profile.renderAvatar(av, this.remoteProfile,
                                (this.remoteLoadout && this.remoteLoadout.color) || '#546e7a');
                        }
                        const name = document.getElementById('mp-opp-name');
                        if (name && this.remoteProfile.name) name.textContent = this.remoteProfile.name.toUpperCase();
                    }
                    // Friends: the moment we know who we're connected to, a
                    // queued friend request addressed to THEM can be delivered.
                    if (typeof Friends !== 'undefined') Friends.onPeerProfile(this.remoteProfile);
                }
                break;
            }
            case 'friendReq': {
                if (typeof Friends !== 'undefined') Friends._handlePeerRequest(msg.p);
                break;
            }
            case 'friendAcc': {
                if (typeof Friends !== 'undefined') Friends._handlePeerAccept(msg);
                break;
            }
            case 'friendRemove': {
                if (typeof Friends !== 'undefined') Friends._handlePeerRemove(msg);
                break;
            }
            case 'pair': {
                // Host shares the pairing secret over the encrypted channel.
                if (msg.pairId && msg.code) {
                    this._savePair({ code: String(msg.code), pairId: String(msg.pairId), name: (this.remoteLoadout && this.remoteLoadout.name) || 'LAST OPPONENT', ts: Date.now() });
                }
                break;
            }
            case 'mode':
                this.mpFormat = msg.mode === 'tournament' ? 'tournament' : 'drag';
                this.series = null; // format switch abandons any running series
                this._refreshModeUI();
                game.showNotification(this.mpFormat === 'tournament' ? 'TOURNAMENT — FIRST TO 2 WINS' : 'SINGLE DRAG RACE');
                {
                    const rp = document.getElementById('mp-ready-panel');
                    if (rp && !rp.classList.contains('hidden')) {
                        this.status(this.mpFormat === 'tournament' ? 'HEAT 1/3 · FIRST TO 2 WINS — READY UP' : 'REMATCH? BOTH HIT READY UP', 'ok');
                    }
                }
                break;
            case 'ready':
                this.remoteReady = true;
                this.status(this.localReady ? 'BOTH READY \u2014 STARTING...' : 'OPPONENT IS READY \u2014 PRESS READY UP', 'ok');
                this._maybeLaunch();
                break;
            case 'pause':
                // The peer paused. We deliberately do NOT freeze our own
                // simulation for them \u2014 that would let one player decide the
                // race is stopped for both. They simply tell us they are not
                // driving, so we can say so instead of watching a stalled
                // opponent and assuming a disconnect.
                if (msg.paused) {
                    this.remotePaused = true;
                    this._pausedSince = performance.now();
                    if (game.state === 'RACE') game.showNotification('OPPONENT PAUSED');
                } else {
                    this.remotePaused = false;
                    this._pausedSince = 0;
                }
                break;
            case 'rematch':
                // Peer wants another race — accept by returning to the lobby.
                // (If we already left, the channel is closed and this never
                // arrives; if they left, our own peer-lost handler cleans up.)
                if (game.raceMode === 'multiplayer' && (game.state === 'RESULTS' || game.state === 'MENU')) {
                    game.showNotification('REMATCH ACCEPTED \u2014 READY UP!');
                    this._enterRematchLobby();
                }
                break;
            case 'input':
                this.remoteRevved = this.remoteRevved || msg.gas > 0.1;
                if (game.opponentCar) {
                    // Clamp remote inputs into their real range — a tampered
                    // peer sending gas=999 would multiply its wheel force
                    // a thousandfold. Everything outside [0,1] is noise.
                    game.opponentCar.gas = Math.min(1, Math.max(0, +msg.gas || 0));
                    game.opponentCar.brake = Math.min(1, Math.max(0, +msg.brake || 0));
                    game.opponentCar.clutch = Math.min(1, Math.max(0, +msg.clutch || 0));
                }
                break;
            case 'sync':
                this._applySync(msg);
                break;
            case 'shiftUp':
                if (game.opponentCar) game.opponentCar.shiftUp();
                break;
            case 'shiftDown':
                if (game.opponentCar) game.opponentCar.shiftDown();
                break;
            case 'countdown': {
                // Convert the host's timestamp into OUR performance.now()
                // timeline. Never let it land in the past — a start already
                // due just begins on the next frame instead of skipping lights
                // — and never absurdly far in the future either.
                const localStart = Math.max(msg.hostStart - this.clockOffset, performance.now() + 50);
                this.countdownStart = Math.min(localStart, performance.now() + 12000);
                break;
            }
            case 'ping':
                this.sendEvent({ type: 'pong', t0: msg.t0, t1: performance.now() });
                break;
            case 'pong': {
                const now = performance.now();
                this._pongSamples.push({ rtt: now - msg.t0, offset: msg.t1 - (msg.t0 + now) / 2 });
                // Keep the sample window bounded — a long session ping-pongs
                // forever and the array used to grow without limit.
                if (this._pongSamples.length > 12) this._pongSamples.shift();
                break;
            }
            case 'raceOutcome': {
                const report = {
                    falseStart: !!msg.falseStart,
                    // Sanity floor: no build in this game runs 402m in under
                    // 2s — a faster "finish" is manipulated or corrupted, so
                    // clamp rather than hand out a bogus loss.
                    finishTime: (typeof msg.finishTime === 'number' && isFinite(msg.finishTime))
                        ? Math.min(Math.max(msg.finishTime, 2), 999) : 999,
                };
                if (this._outcomeResolve) {
                    const resolve = this._outcomeResolve;
                    this._outcomeResolve = null;
                    resolve(report);
                } else {
                    // We haven't finished yet — keep it for reportOutcome().
                    this._remoteOutcome = report;
                }
                break;
            }
        }
    },

    // Corrects drift on the replicated opponent car. Large jumps snap
    // instantly (e.g. after a dropped run of packets); small ones ease out
    // over ~1/3s via _syncErr (drained in tick) so nothing visibly pops or
    // rubber-bands. Unordered channel: an OLD snapshot landing after a newer
    // one is ignored — replaying stale syncs used to drag the replica BACKWARD
    // (the visible back-and-forth in the opponent preview).
    _applySync(msg) {
        const o = game.opponentCar;
        if (!o) return;
        const st = typeof msg.t === 'number' ? msg.t : 0;
        if (st) {
            if (this._lastSyncT && st <= this._lastSyncT) return;
            this._lastSyncT = st;
        }
        // Plausibility clamp: a sync is at most ~MP_SYNC_MS old and these are
        // street drag cars — anything wildly past physics is manipulated or
        // corrupted. Clamp forward progress instead of trusting it.
        const speed = Math.min(140, Math.max(0, +msg.speed || 0));
        let target = +msg.x;
        if (!isFinite(target)) return;
        // Position is validated as a RATE, not just a ceiling. The old bound
        // (`o.x + speed*dt*2.5 + 15`) re-based on the position it had already
        // accepted, so it compounded: at 3.33 Hz a peer could advance ~200 m/s
        // apparent and, because Car sets `finished` on crossing raceDistance,
        // inflated x syncs were a direct win button.
        //
        // Now progress is measured against the position at the PREVIOUS
        // accepted sync, over the time that actually elapsed, and scaled by
        // the reported speed. Anything beyond that is not physics, so it is
        // discarded outright rather than snapped to (a snap is exactly the
        // rubber-band this guard exists to prevent).
        const now = performance.now();
        const prevX = (this._lastSyncX !== undefined) ? this._lastSyncX : o.x;
        const prevAt = this._lastSyncAt || now;
        const elapsed = Math.min(1.0, Math.max(MP_SYNC_MS / 1000, (now - prevAt) / 1000));
        this._lastSyncX = o.x;
        this._lastSyncAt = now;
        // 1.35x headroom over the reported speed covers a legitimate corner
        // exit, and the 0.5 m floor absorbs packet jitter at low speed.
        const budget = speed * elapsed * 1.35 + 0.5;
        if (target > prevX + budget) target = prevX + budget;
        // Backward bound: a peer may not drag the replica backwards. Replay
        // and reordering are already handled by the `t` guard above; this
        // closes the remaining hole where target=0 yanked the car to the line.
        if (target < prevX - budget) target = prevX - budget;
        if (target < 0) target = 0;
        const dx = target - o.x;
        if (Math.abs(dx) > 3) {
            o.x = target;
            this._syncErr = 0;
        } else {
            this._syncErr = dx;
        }
        o.speed += (speed - o.speed) * 0.3;
        o.rpm += (Math.min(o.redline * 1.25, Math.max(0, +msg.rpm || 0)) - o.rpm) * 0.3;
        // Gear MUST be range-checked. An out-of-range index makes
        // gearRatios[this.gear] undefined, so the wheel-force ratio becomes
        // NaN, o.x goes NaN permanently, and the ease-out drain below is
        // gated on `if (this._syncErr)` — which is false for NaN — so the
        // replica never recovers. One hostile packet bricked the race.
        if (typeof msg.gear === 'number') {
            const g = Math.round(msg.gear);
            if (Number.isFinite(g) && g >= 0 && g < o.gearRatios.length) {
                if (g !== o.gear) o.gear = g;
            }
        }
    },
};

window.MP = MP;
