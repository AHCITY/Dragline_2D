'use strict';

/*
 * ─── Redline 2D — P2P Multiplayer ─────────────────────────────────────
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
    _localIceQueue: [],        // ICE candidates gathered while the seat write is still in flight
    _seatReady: false,         // true once the room's identity write (host/guest) has committed

    // ---- race/lobby state ----
    remoteLoadout: null,
    remoteProfile: null,       // peer's driver profile {id, name, av} — shared over P2P
    _remoteOutcome: null,      // peer's race report, may arrive before ours is requested

    // ---- round identity (message scoping) ----
    // Every race-scoped message carries the round it belongs to. The HOST
    // mints a fresh id at launch; the guest adopts it. A message stamped for
    // a different round belongs to a heat that is already over and is
    // dropped instead of being applied to the live race.
    //
    // Note: the 'events' channel is reliable AND ordered (created with no
    // options, so WebRTC's ordered default applies), which already makes most
    // cross-heat bleed unreachable. This is defence in depth against a peer
    // that replays a message or a link that stalls across a whole heat — not
    // a fix for an observed failure.
    roundId: null,
    _roundSeq: 0,
    // False-start evidence. The player records the instant it first applied
    // throttle during the countdown on ITS OWN clock; the HOST converts that
    // into host time and makes the call. A guest never rules on its own.
    localRevAt: null,          // our rev timestamp, in our own clock
    remoteRevAt: null,         // guest's rev timestamp, converted to host clock
    // The host publishes the format for the lobby. A guest may not ready up
    // until it has actually received that declaration.
    remoteModeKnown: false,
    // The instant the light went green, on THIS side's own clock. Each side
    // derives it from its own real COUNTDOWN→RUNNING transition rather than
    // re-deriving the light duration, so there is no second copy of the
    // timing constant that could drift out of step with the race.
    goAt: null,
    // The authoritative false-start verdict for the CURRENT round, once the
    // host has ruled. game.js reads this instead of trusting each client's own
    // opinion. null = no ruling yet (or not the host yet).
    localFalseStart: null,
    // Host-side arbitration scratch for the round in progress.
    _pendingFinish: null,      // our finish report, while awaiting the peer's
    _peerFinish: null,         // peer's raceEnd report
    _hostDecideTimer: 0,
    _hostVerdictTimer: 0,

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
    // When the clock offset was last (re)measured, so a long heat can refresh
    // a drifting calibration instead of trusting the connect-time sample for
    // the whole race.
    _clockCalibratedAt: 0,
    // Monotonic guard against reordered/replayed snapshots on the
    // UNORDERED channel.
    _lastSyncT: 0,
    // Furthest position the HOST has accepted from the peer's sync stream
    // this round, and the host-clock instant it was accepted. The peer's
    // finish time is checked against this: it can never claim to have crossed
    // the line sooner than its own accepted snapshots make physically
    // possible.
    _peerMaxX: 0, _peerMaxXAt: 0,

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

    // Signed-in Firebase uid — the identity the database rules bind the
    // multiplayer room to (host/guest seats). The login gate guarantees a
    // session; this is the defensive read for the edge cases.
    _uid() {
        try { const u = firebase.auth().currentUser; return u ? u.uid : null; } catch (e) { return null; }
    },

    // Push the ICE candidates queued while our seat write (host/guest claim)
    // was still in flight. The rules only accept candidates from the seat
    // owner, so anything gathered early waits here instead of being dropped.
    _flushLocalIce() {
        const q = this._localIceQueue;
        this._localIceQueue = [];
        if (!this.roomRef || !q.length) return;
        const list = this.isHost ? 'hostCandidates' : 'guestCandidates';
        for (const c of q) { try { this.roomRef.child(list).push(c); } catch (e) { /* room gone */ } }
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
    // The saved pair is namespaced by the signed-in account (SaveSystem
    // nsKey) — guest and real accounts never see each other's opponents.
    _pairKey() {
        const base = (typeof SaveSystem !== 'undefined' && SaveSystem.nsKey)
            ? SaveSystem.nsKey('mp_peer') : 'mp_peer';
        return 'pdl_' + base;
    },

    _savedPair() {
        try {
            const raw = localStorage.getItem(this._pairKey());
            if (!raw) return null;
            const p = JSON.parse(raw);
            return (p && p.code && p.pairId) ? p : null;
        } catch (e) { return null; }
    },

    _savePair(entry) {
        try { localStorage.setItem(this._pairKey(), JSON.stringify(entry)); } catch (e) {}
        this._refreshQuickPair();
    },

    forgetPair() {
        try { localStorage.removeItem(this._pairKey()); } catch (e) {}
        this._refreshQuickPair();
        // FORGET is the user's explicit "start clean with this driver" action,
        // so it must clear every trace of a pending invite from them too —
        // otherwise a stale invite row could still land the player in a room
        // they just asked to be rid of.
/* V10M2-FORGET-CLEARS-INVITES */
        if (typeof Friends !== 'undefined' && Friends.clearAllInvites) {
            // One API for state + timers + visible cards — poking
            // _pendingInvites directly used to strand both.
            try { Friends.clearAllInvites(); } catch (e) {}
        }
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
        const uid = this._uid();
        if (!uid) { this.status('MULTIPLAYER NEEDS A SIGN-IN — RELOAD AND LOG IN', 'err'); return; }
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
            // If both players clicked the quick button, only one full-room
            // write survives — watch for a FOREIGN offer BEFORE attempting
            // our own write, so a lost race yields to the guest seat instead
            // of stalling on our own value.
            this.roomRef.child('offer').on('value', snap => {
                const val = snap.val();
                if (!val || !val.sdp || !this.pc || this.pc.currentRemoteDescription) return;
                if (val.sdp !== this._myOfferSdp) this._yieldReconnect(saved);
            });

            // The write carries host: auth.uid — the database rules bind the
            // whole room (offer, candidates, deletion) to that identity, so
            // a stranger who knows the code still can't touch anything.
            await this.roomRef.set({
                ts: Date.now(),
                host: uid,
                offer: { sdp: offer.sdp, type: offer.type, challenge: this.challenge },
            });

            // Crash-cleanup registration happens AFTER the room write: the
            // rules only let the room's own host remove it, and before the
            // write the room doesn't exist yet.
            this.roomRef.onDisconnect().remove();
            this._seatReady = true;
            this._flushLocalIce();

            this.roomRef.child('guestCandidates').on('child_added', snap => this._addRemoteCandidate(snap.val()));

            this._show('mp-choice', false);
            this._show('mp-host-panel', true);
            const codeEl = document.getElementById('mp-room-code');
            if (codeEl) codeEl.innerText = saved.code;
            const who = String(saved.name || 'OPPONENT').toUpperCase();
            this.status('WAITING FOR ' + who + ' TO OPEN MULTIPLAYER', 'busy');

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
            if (this._isRulesError(e)) {
                // Our full-room write lost the race against the pair's other
                // session (the rules bind the host seat to one auth.uid) —
                // take the guest seat instead of erroring out.
                this._yieldReconnect(saved);
                return;
            }
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
        if (!this._uid()) { this.status('MULTIPLAYER NEEDS A SIGN-IN — RELOAD AND LOG IN', 'err'); return; }
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
            // Claim the guest seat FIRST — the rules only let the claimed
            // guest write the answer and its ICE candidates.
            await this.roomRef.child('guest').set(this._uid());
            this._seatReady = true;
            this._flushLocalIce();
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
        // Only the host picks the format. This is the LOGIC half of the rule.
        // Locking the buttons in _refreshModeUI() is only the UI half, and a
        // locked button stops nobody from calling this function directly.
        if (!this.isHost) return;
        const next = (mode === 'tournament') ? 'tournament' : 'drag';
        if (this.mpFormat === next) return;
        this.mpFormat = next;
        this.series = null; // switching format abandons any running series
        this._refreshModeUI();
        this.sendEvent({ type: 'mode', mode: next });
        game.showNotification(next === 'tournament' ? 'TOURNAMENT — FIRST TO 2 HEAT WINS' : 'SINGLE DRAG RACE');
        this._renderLobby();
    },

    _refreshModeUI() {
        const drag = document.getElementById('mp-mode-drag');
        const tour = document.getElementById('mp-mode-tour');
        if (!drag || !tour) return;
        const isTour = (this.mpFormat === 'tournament');
        drag.classList.toggle('mp-mode-on', !isTour);
        tour.classList.toggle('mp-mode-on', isTour);
        drag.setAttribute('aria-pressed', !isTour ? 'true' : 'false');
        tour.setAttribute('aria-pressed', isTour ? 'true' : 'false');
        // A guest sees the host's choice but may not change it. Marked
        // disabled rather than hidden so the lobby layout stays stable.
        const locked = !this.isHost;
        [drag, tour].forEach(el => {
            if (!el) return;
            el.classList.toggle('mp-mode-locked', locked);
            el.setAttribute('aria-disabled', locked ? 'true' : 'false');
            el.setAttribute('tabindex', locked ? '-1' : '0');
        });
        const hint = document.getElementById('mp-mode-hint');
        if (hint) hint.textContent = locked ? 'FORMAT SET BY HOST' : '';
    },

    // ── Lobby rendering ────────────────────────────────────────────────
    // The ready panel used to be shown by three unrelated events (link-up,
    // rematch, and an inline poke in setReady) and hidden by a fourth, which
    // is why it appeared before the format was settled and at no single
    // predictable place. Visibility is now DERIVED from state and rendered
    // from exactly one place; no event shows or hides it on its own.
    _lobbyPhase() {
        if (!this._connected) return 'offline';
        if (this._launched) return 'racing';
        // Never show lobby controls over a live race.
        if (typeof game !== 'undefined' && game.state === 'RACE') return 'racing';
        if (this.localReady) return 'readied';
        // A guest waits for the host to declare the format before it may even
        // ready up, so the button cannot appear "before mode selection" —
        // it does not exist yet.
        if (!this.isHost && !this.remoteModeKnown) return 'awaiting-mode';
        if (!this.remoteLoadout || !this.remoteProfile) return 'awaiting-peer';
        // The peer is present and has a car — but it is a car this build does
        // not stock, so no faithful replica can be built. Refuse to launch and
        // say so, instead of starting a race against an invented car.
        if (!this._remoteCarIsStocked()) return 'blocked-car';
        return 'ready';
    },

    _renderLobby() {
        if (typeof game === 'undefined' || typeof document === 'undefined') return;
        const phase = this._lobbyPhase();
        // The PANEL is the lobby itself (opponent card, format picker, status
        // line) and stays up for every lobby-ish phase, including while the
        // peer's car data is still arriving — otherwise the player would stare
        // at nothing during "EXCHANGING CAR DATA". The BUTTON is the part whose
        // timing was unpredictable, and it is derived strictly below.
        const inLobby = (phase === 'ready' || phase === 'readied'
            || phase === 'awaiting-mode' || phase === 'awaiting-peer'
            || phase === 'blocked-car');
        this._show('mp-choice', false);
        this._show('mp-host-panel', false);
        this._show('mp-join-panel', false);
        this._show('mp-ready-panel', inLobby);

        const btn = document.getElementById('mp-ready-btn');
        if (btn) {
            // Once you have readied up the button steps aside and the status
            // line takes over. Derived here, not toggled by setReady().
            const show = (phase === 'ready');
            btn.classList.toggle('hidden', !show);
            if (show) btn.removeAttribute('aria-hidden'); else btn.setAttribute('aria-hidden', 'true');
        }

        // The status line follows the same derived phase, so the text and the
        // button can never describe two different situations.
        const rp = document.getElementById('mp-ready-panel');
        if (rp && !rp.classList.contains('hidden')) {
            if (phase === 'awaiting-peer') {
                this.status('CONNECTED — EXCHANGING CAR DATA...', 'ok');
            } else if (phase === 'blocked-car') {
                this.status('OPPONENT SENT A CAR THIS BUILD DOES NOT STOCK — CANNOT START', 'err');
            } else if (phase === 'awaiting-mode') {
                this.status('WAITING FOR HOST TO SET THE FORMAT...', 'ok');
            } else if (phase === 'readied') {
                this.status('WAITING FOR OPPONENT TO READY UP...', 'ok');
            } else if (this.mpFormat === 'tournament') {
                this.status('HEAT ' + this.seriesHeat() + '/3 · FIRST TO 2 WINS — READY UP', 'ok');
            } else {
                this.status('REMATCH? BOTH HIT READY UP', 'ok');
            }
        }
        this._refreshModeUI();
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
        // Config is checked BEFORE reserving: _reserveRoomCode() reads this.db,
        // which only exists once ensureFirebase() has run. Reversing these
        // would throw on an unconfigured install instead of showing the
        // friendly "not configured" status line.
        if (this.pc || this.roomRef) return;
        if (!this.ensureFirebase()) { this.status('MULTIPLAYER NOT CONFIGURED — SEE multiplayer.js', 'err'); return; }
        if (!this._uid()) { this.status('MULTIPLAYER NEEDS A SIGN-IN — RELOAD AND LOG IN', 'err'); return; }
        const code = await this._reserveRoomCode();
        await this.hostGameWithCode(code);
    },

    /* Host a room on a code that is already chosen.
     *
     * hostGame() used to reserve its own code inline. Splitting it out lets
     * the friends INVITE flow reserve a code FIRST, publish it to the
     * invited player's mailbox, and only then open the room — so by the time
     * they tap ACCEPT the room genuinely exists. Same handshake either way. */
    async hostGameWithCode(code) {
        if (this.pc || this.roomRef) return; // already hosting/joining
        if (!this.ensureFirebase()) { this.status('MULTIPLAYER NOT CONFIGURED — SEE multiplayer.js', 'err'); return; }
        const uid = this._uid();
        if (!uid) { this.status('MULTIPLAYER NEEDS A SIGN-IN — RELOAD AND LOG IN', 'err'); return; }
        this._show('mp-choice', false);
        this._show('mp-host-panel', true);
        this.status('CREATING ROOM...', 'busy');
        this.isHost = true;

        try {
            this.roomCode = code;
            const codeEl = document.getElementById('mp-room-code');
            if (codeEl) codeEl.innerText = code;

            this.roomRef = this.db.ref(this.roomPath + '/' + code);

            this._createPeerConnection();
            this.eventsChannel = this.pc.createDataChannel('events');
            this.stateChannel = this.pc.createDataChannel('state', { ordered: false, maxRetransmits: 0 });
            this._wireChannel(this.eventsChannel);
            this._wireChannel(this.stateChannel);

            this.roomRef.child('guestCandidates').on('child_added', snap => this._addRemoteCandidate(snap.val()));

            const offer = await this.pc.createOffer();
            await this.pc.setLocalDescription(offer);
            // ONE atomic write claims the room and the HOST seat: the rules
            // bind offer, candidates and deletion to this auth.uid, so a
            // stranger who knows the code grants themselves nothing.
            await this.roomRef.set({ ts: Date.now(), host: uid, offer: { sdp: offer.sdp, type: offer.type } });
            // Crash-cleanup registration AFTER the write — see hostReconnect.
            this.roomRef.onDisconnect().remove();
            this._seatReady = true;
            this._flushLocalIce();
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
        const input = document.getElementById('mp-code-input');
        const code = (input ? input.value : '').trim().toUpperCase();
        if (code.length < 4) { this.status('ENTER A VALID CODE', 'err'); return; }
        await this.joinWithCode(code);
    },

    /* Programmatic join used by the friends invite flow: a friend accepts an
       invite and lands in the room without anyone reading a code aloud or
       typing one in. Identical handshake to joinGame() — kept as its own
       entry point so the invite path never has to fake keystrokes into the
       join input box (which would fight the focus/validation above it). */
    async joinWithCode(code) {
        if (this.pc || this.roomRef) return; // already joining/hosting
        if (!this.ensureFirebase()) { this.status('MULTIPLAYER NOT CONFIGURED — SEE multiplayer.js', 'err'); return; }
        if (!this._uid()) { this.status('MULTIPLAYER NEEDS A SIGN-IN — RELOAD AND LOG IN', 'err'); return; }
        code = String(code || '').trim().toUpperCase();
        if (code.length < 4) { this.status('ENTER A VALID CODE', 'err'); return; }
        this.isHost = false;
        this.roomCode = code;
        // Open the same panels the manual path opens, so the player SEES the
        // connection being made instead of the UI silently freezing wherever
        // they happened to be when they tapped ACCEPT.
        this._show('mp-choice', false);
        this._show('mp-join-panel', true);
        this._show('mp-host-panel', false);
        this.status('JOINING ' + code + '...', 'busy');
        this._armConnectWatchdog();

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
            // Claim the guest seat FIRST — the rules only let the claimed
            // guest write the answer and its ICE candidates.
            await this.roomRef.child('guest').set(this._uid());
            this._seatReady = true;
            this._flushLocalIce();
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
        this._seatReady = false;
        this._localIceQueue = [];
        // iceCandidatePoolSize: pre-allocate/resolve a candidate BEFORE the
        // offer is created, taking STUN off the critical handshake path.
        const cfg = {
            iceServers: this.turnEnabled() ? this.iceServers.concat(MP_TURN_SERVERS) : this.iceServers,
            iceCandidatePoolSize: 2,
        };
        this.pc = new RTCPeerConnection(cfg);
        this.pc.onicecandidate = e => {
            if (!e.candidate) return;
            const c = e.candidate.toJSON();
            // The rules bind ICE pushes to the seat owner, and the seat is
            // claimed by a DB write that may still be in flight while local
            // gathering already started. Queue until _seatReady, then flush
            // in order — no candidate is lost to the claim window.
            if (!this.roomRef || !this._seatReady) { this._localIceQueue.push(c); return; }
            const list = this.isHost ? 'hostCandidates' : 'guestCandidates';
            try { this.roomRef.child(list).push(c); } catch (err) { /* room gone */ }
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
            // Same token guard as the lobby branch below. Without it this
            // timer only asked "is SOME race running", so quitting and
            // starting a fresh quick race inside 1.6s would satisfy the check
            // and dump the player back to the menu mid-race.
            const token = ++this._lobbyResetToken;
            setTimeout(() => {
                if (this._lobbyResetToken !== token) return;
                if (game.state === 'RACE' && !game.finished) game.returnToMenu();
            }, 1600);
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

        // A fresh connection shares no state with the previous session. Everything
        // that could otherwise apply a previous heat's data is cleared here,
        // in one place, so there is no per-event cleanup to forget.
        this.localReady = false;
        this.remoteReady = false;
        this._launched = false;
        this.roundId = null;
        this.localRevAt = null;
        this.remoteRevAt = null;
        this.remoteModeKnown = false;
        this.remoteLoadout = null;
        this._remoteOutcome = null;
        this._outcomeResolve = null;
        this._verdictResolve = null;
        this._verdict = null;

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

        // The host declares the format up front, so the guest never guesses and
        // can never start a heat under a mode it never saw chosen.
        if (this.isHost) {
            this.remoteModeKnown = true;
            this.sendEvent({ type: 'mode', mode: this.mpFormat });
        }

        this.sendLoadout();
        // One derived render settles panel, button and status together.
        this._renderLobby();
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
        if (this._launched) return;
        // Announce a car we can actually defend. The save file is the
        // authority for what this player owns; if the selected car fails
        // validation (stale index, hand-edited save, catalog drift) fall back
        // to a car this player genuinely owns rather than announcing a car we
        // cannot then load.
        if (typeof game !== 'undefined' && typeof game.ensureOwnedCar === 'function') {
            game.ensureOwnedCar();
        }
        this.localReady = true;
        this.sendLoadout();
        this.sendEvent({ type: 'ready' });
        // Visibility and status are re-derived, never poked directly.
        this._renderLobby();
        this._maybeLaunch();
    },

    _maybeLaunch() {
        if (this._launched) return;

        // A "ready" flag is not proof of a matchable player. Before anyone is
        // dropped onto the staging line the HOST verifies the things that
        // actually matter: the peer is still connected, it is the same peer
        // (its profile and loadout have arrived), it has exchanged a usable
        // car, and both sides are ready. Starting without these is exactly how
        // one player ends up alone on the track while the other sits in a
        // lobby that never launches.
        if (!this.localReady || !this.remoteReady) return;
        if (!this._connected) return;
        if (!this.remoteProfile || !this.remoteProfile.id) return;
        if (!this.remoteLoadout || !this.remoteLoadout.name) return;
        // "Has a car" is not the same as "has a car this build stocks". A
        // loadout naming something we do not have would build an invented
        // replica on our side, so it blocks the launch instead.
        if (!this._remoteCarIsStocked()) {
            console.warn('Refusing to launch: peer announced a car we do not stock —', this.remoteLoadout && this.remoteLoadout.name);
            return;
        }
        // The format is the HOST's to declare. A guest may only launch once it
        // has actually received that declaration, so the two sides can never
        // start the same heat under different rules.
        if (!this.isHost && !this.remoteModeKnown) return;

        this._launched = true;
        // A completed series restarts clean on the next launch — both
        // sides derive the reset from identical counts, so no drift.
        if (this.mpFormat === 'tournament' && this.seriesDecided()) this._resetSeries();

        // The host owns round identity. Minting it here means the id exists
        // before the race starts, so the first input/sync of the new heat is
        // already stamped and a late packet from the previous heat is
        // recognisable the moment it lands.
        if (this.isHost) {
            this._roundSeq = (this._roundSeq + 1) % 0xFFFFFF;
            this.roundId = this._roundSeq + '-' + Date.now().toString(36);
        }
        this.sendEvent({ type: 'round', roundId: this.roundId });
        game.startRaceMode('multiplayer');
    },

    // True when the announced loadout names a car THIS build actually stocks.
    // Proves the peer can be raced against, not that they paid for it — their
    // save is client-local and there is no server that could answer that.
    _remoteCarIsStocked() {
        const name = this.remoteLoadout && this.remoteLoadout.name;
        if (!name) return false;
        const catalog = (typeof game !== 'undefined' && game.carDefs) ? game.carDefs : null;
        if (!catalog) return false;
        return catalog.some(d => d.name === name);
    },

    // True when `msg` belongs to the round currently being raced. Messages
    // that require a round but arrive before one exists are stale by
    // definition — there is no live race to apply them to.
    _msgIsCurrentRound(msg) {
        if (!msg || !msg.roundId) return false;
        return !!this.roundId && msg.roundId === this.roundId;
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
        // Round identity and false-start evidence belong to ONE heat on ONE
        // connection. Leaving them behind was how a stale `localFalseStart`
        // could reach the NEXT session's results screen — and that verdict is
        // exactly what _applyMultiplayerOutcome() now trusts over the local
        // claim, so a leftover `true` there reads as a disqualification the
        // player never earned.
        this.roundId = null;
        this.localRevAt = null;
        this.remoteRevAt = null;
        this.remoteModeKnown = false;
        this.goAt = null;
        this.localFalseStart = null;
        this._verdict = null;
        this._verdictResolve = null;
        this._peerFinish = null;
        this._pendingFinish = null;
        if (this._hostDecideTimer) { clearTimeout(this._hostDecideTimer); this._hostDecideTimer = 0; }
        if (this._hostVerdictTimer) { clearTimeout(this._hostVerdictTimer); this._hostVerdictTimer = 0; }
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
        this._seatReady = false;
        this._localIceQueue = [];
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

/* V10M1-ABORT-INVITE-WAIT */
    leaveMultiplayer() {
        this.disconnect();
        game.returnToMenu();
    },

    /* Invite-wait teardown (friends invite flow): the driver we invited
       never answered inside the window. Stop hosting cleanly and put the
       choice panel back so the INVITE button is free to use again without
       a reload. Deliberately refuses to tear down a live or forming
       handshake — callers check that too, this is the backstop. */
    abortInviteWait(msg) {
        if (this._connected) return;
        this.disconnect();
        this._show('mp-host-panel', false);
        this._show('mp-join-panel', false);
        this._show('mp-ready-panel', false);
        this.status(msg || 'INVITE EXPIRED', 'err');
        this._show('mp-choice', true);
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
        // Stamp the round on every message sent while a round is live, so no
        // individual send site can forget to. Messages that require a round
        // are checked against it on arrival.
        if (this.roundId && obj.roundId === undefined) obj.roundId = this.roundId;
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
        if (this.roundId && obj.roundId === undefined) obj.roundId = this.roundId;
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
    //
    // The base car comes from OUR catalog, looked up by name. The loadout
    // message is attacker-controlled input: before, the peer's own hp /
    // weight / gearing were carried verbatim into the replica, so a crafted
    // message could announce a 50,000 hp car and have BOTH sides render it as
    // one. Now the name selects a catalog car and only upgrades, tune and
    // cosmetics are taken from the message — each through the same sanitizer
    // the local save goes through. A name we do not stock falls back to a
    // generic rival rather than being invented on the spot.
    //
    // LIMITATION: this proves the car is one this build stocks. It does NOT
    // prove the sender actually owns it — their save is client-local and we
    // have no server to ask. See the security notes in the final report.
    buildOpponentCar() {
        const cd = this.remoteLoadout;
        const fallbackDef = {
            name: 'Opponent', hp: 200, weight: 1200, grip: 1, redline: 7000, price: 0,
            color: '#2196f3', secondaryColor: '#0d47a1', type: 'sedan', art: 'sedan',
            gearRatios: [0, 3.2, 2.2, 1.6, 1.2, 1.0], finalDrive: 3.9, dragArea: 0.75,
        };
        const catalog = (typeof game !== 'undefined' && game.carDefs) ? game.carDefs : null;
        const def = (cd && catalog)
            ? (catalog.find(d => d.name === cd.name) || fallbackDef)
            : fallbackDef;

        const car = new Car(def);
        if (cd) {
            car.upgrades = (typeof sanitizeUpgrades === 'function') ? sanitizeUpgrades(cd.upgrades) : def.upgrades;
            if (typeof sanitizeTune === 'function') car.tune = sanitizeTune(cd.tune);
            if (cd.customization && typeof hydrateCustomization === 'function') {
                try { car.customization = hydrateCustomization(cd.customization); } catch (e) {}
            }
            // PAINT CONSISTENCY: the loadout carries the sender's real body +
            // accent colors. They used to be ignored here — the replica was
            // built straight from OUR catalog def, so the opponent's car wore
            // the STOCK catalog color no matter what paint they had chosen.
            // The colors are attacker-controllable input, so only hues that
            // exist in OUR paint catalog are accepted; anything else (or a
            // legacy peer that sent no color) falls back to the stock color.
            const PAINTS = (typeof game !== 'undefined' && game.PAINTS) ? game.PAINTS : null;
            const paintOk = v => typeof v === 'string' &&
                !!PAINTS && PAINTS.some(pc => pc.hex.toLowerCase() === v.toLowerCase());
            if (paintOk(cd.color)) car.color = cd.color;
            if (paintOk(cd.secondaryColor)) car.secondaryColor = cd.secondaryColor;
            car.applyUpgrades();
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
        // False-start evidence belongs to ONE heat. Carrying it across a
        // rematch would let last heat's rev timestamp condemn this heat's
        // first throttle pull.
        this.localRevAt = null;
        this.remoteRevAt = null;
        // A verdict already issued belongs to the round it was issued for.
        this._verdictResolve = null;
        this._verdict = null;
        this.localFalseStart = null;  // no ruling yet for THIS round
        this.goAt = null;             // green light not yet reached
        this._peerFinish = null;
        this._pendingFinish = null;
        if (this._hostDecideTimer) { clearTimeout(this._hostDecideTimer); this._hostDecideTimer = 0; }
        if (this._hostVerdictTimer) { clearTimeout(this._hostVerdictTimer); this._hostVerdictTimer = 0; }
        this._syncErr = 0;            // replica corrections start clean
        this._lastSyncT = 0;
        // Position-rate budget in _applySync is measured from the previous
        // accepted sync, so both must reset here or a rematch inherits the
        // last heat's origin and rejects the opening snapshots as too fast.
        this._lastSyncX = undefined;
        this._lastSyncAt = 0;
        // Finish-time validation is measured from this round's accepted
        // progress, so a rematch must not inherit the last heat's high-water
        // mark (which would let a fresh race claim an impossibly quick time).
        this._peerMaxX = 0;
        this._peerMaxXAt = 0;
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
        this._verdictResolve = null;
        this._verdict = null;
        this.localRevved = false;
        this.remoteRevved = false;
        this.countdownStart = null;
        this._stagingFallbackAt = null;
        this._syncErr = 0;
        this._lastSyncT = 0;
        // Round identity is per-heat. The next launch mints a fresh id, and
        // until then every round-scoped message from the heat that just ended
        // is recognisably stale and dropped rather than applied to the new one.
        this.roundId = null;
        this.localRevAt = null;
        this.remoteRevAt = null;

        // ── Rematch saved-car validation (Phase 1G) ───────────────────────
        // The next heat's car comes back off persisted state. Re-validate it
        // through the SAME path a fresh race uses, so a save that drifted
        // (index pointing past the list, a car the player does not own, a
        // name no longer in the catalog) cannot announce a car this player
        // cannot actually drive. Validating here — BEFORE the loadout goes
        // out — is what stops the peer being told about a phantom car that
        // then fails to load on the next start.
        if (typeof game !== 'undefined' && typeof game.ensureOwnedCar === 'function') {
            game.ensureOwnedCar(true);
        }
        // Re-announce now so the peer's lobby card shows THIS heat's car
        // rather than the previous heat's.
        this.sendLoadout();

        game.state = 'MENU';
        game.menuState = 'MULTIPLAYER';
        game.finished = false;
        game.paused = false;
        document.querySelectorAll('.menu-overlay').forEach(el => el.classList.add('hidden'));
        const menu = document.getElementById('multiplayer-menu');
        if (menu) menu.classList.remove('hidden');
        this._renderLobbySelf();
        // Panel, button and status all come from one derived render.
        this._renderLobby();
        const btn = document.getElementById('mp-ready-btn');
        if (btn && !btn.classList.contains('hidden')) {
            btn.classList.add('mp-ready-glow');
            // Save a click: the rematch conversation is already open, so put
            // the READY UP button under the cursor / keyboard focus.
            try { btn.focus({ preventScroll: true }); } catch (e) {}
            setTimeout(() => btn.classList.remove('mp-ready-glow'), 2600);
        }
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

        // False-start EVIDENCE, not a verdict. Record the instant throttle
        // first went down while the light was still counting, on our own
        // clock, exactly once. The host converts this into its own timeline
        // and makes the call — we never rule on our own jump.
        //
        // Recording a TIMESTAMP rather than a boolean is the whole point: a
        // boolean is judged against each client's own idea of what "before
        // the light" means, which is precisely how two clients end up
        // disagreeing about the same race.
        if (this.localRevAt === null && p.gas > 0.1 && game.raceState === 'COUNTDOWN') {
            this.localRevAt = performance.now();
            this.sendEvent({ type: 'rev', roundId: this.roundId, revAt: this.localRevAt });
        }

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
        // A resync runs on top of a working offset, not instead of one. Keep
        // the current value as the fallback: if the samples come back empty or
        // the link dropped mid-measurement, the guest keeps the calibration it
        // already had rather than snapping to a default.
        const priorOffset = this.clockOffset;
        this._pongSamples = [];
        let sent = 0;
        const step = () => {
            // The link may have closed while we were measuring. Stop, and keep
            // whatever offset we already had.
            if (!this._connected) { this.clockOffset = priorOffset; return; }
            if (sent >= 5) {
                if (this._pongSamples.length) {
                    const best = this._pongSamples.reduce((a, b) => (a.rtt < b.rtt ? a : b));
                    const next = best.offset;
                    // Apply live only a SMALL correction. A large jump means
                    // the measurement itself is untrustworthy (a stalled tab,
                    // a device that slept mid-race), and moving the shared
                    // timeline that far mid-heat would be worse than the drift
                    // we are trying to remove. Large jumps are ignored, which
                    // leaves the old offset in place — the same fail-open rule
                    // the false-start check uses.
                    const delta = next - this.clockOffset;
                    if (isFinite(delta) && Math.abs(delta) <= MP_CLOCK_MAX_FIX_MS) {
                        this.clockOffset = next;
                    } else if (!isFinite(this.clockOffset)) {
                        // No usable offset at all (e.g. first calibration was
                        // interrupted) — take the measurement as-is rather
                        // than leaving the timeline undefined.
                        this.clockOffset = next;
                    }
                }
                this._clockCalibratedAt = performance.now();
                return;
            }
            sent++;
            this.sendEvent({ type: 'ping', t0: performance.now() });
            setTimeout(step, 120);
        };
        this._clockCalibratedAt = performance.now();
        step();
    },

    /* Called from the render loop. The calibration used to be taken once at
     * connect and trusted for the rest of the session; over a long heat on a
     * phone that drifts enough to move a guest's rev stamp across the green
     * light and hand them a false start they never committed.
     *
     * Cheap: a handful of small messages every MP_CLOCK_RESYNC_MS, on the
     * already-open reliable channel, only while a race is actually live. */
    maybeResyncClock() {
        if (this.isHost || !this._connected) return;
        if (typeof game === 'undefined' || game.state !== 'RACE') return;
        if (!this._lastSync) return;   // race hasn't started streaming yet
        const now = performance.now();
        if (now - (this._clockCalibratedAt || 0) < MP_CLOCK_RESYNC_MS) return;
        this.calibrateClock();
    },

    // ── Authoritative outcome ──────────────────────────────────────────
    // The old flow had BOTH clients declare their own falseStart and both
    // clients combine them locally. That is the desync: one side judged "I
    // did not jump" from its own state and real speed while the other judged
    // the same player from its own light state and a throttled, possibly
    // stale replica — so one player saw a clean race and the other saw a
    // false start, and the loser got yanked to the lobby mid-race.
    //
    // Now the HOST rules. Each side reports EVIDENCE (a timestamped rev and a
    // finish time); the host compares every timestamp against its own clock
    // and publishes ONE verdict that both sides apply verbatim. There is no
    // second client that can form its own opinion.

    // Converts a guest-clock timestamp into the host's timeline.
    _toHostClock(t) {
        if (typeof t !== 'number' || !isFinite(t)) return null;
        return t + (this.clockOffset || 0);
    },

    // The single false-start decision. `revAt` must already be in HOST time;
    // `goAt` is when the host's light went green.
    _decideFalseStart(revAt, goAt) {
        if (typeof revAt !== 'number' || !isFinite(revAt)) return false;
        if (typeof goAt !== 'number' || !isFinite(goAt)) return false;
        // Plausibility gate. A "rev" stamp implausibly far from the light is
        // not a launch decision — it is a stale clock calibration or a
        // crafted message, and convicting someone on it would be worse than
        // missing a jump. Only near-GO stamps can produce a false start.
        if (Math.abs(revAt - goAt) > MP_REV_PLAUSIBLE_MS) return false;
        return revAt < goAt;
    },

    _sanitizeFinishTime(v) {
        return (typeof v === 'number' && isFinite(v))
            ? Math.min(Math.max(v, 2), 999) : 999;
    },

    /* Host-side check on a PEER's claimed finish time.
     *
     * The finish number a guest sends is a plain claim, and clamping it into
     * [2,999] says nothing about whether it is real — a guest that wants to
     * win in 2.001s simply sends 2.001. That made the one value which decides
     * the race the only piece of it that was taken on faith, while every
     * other input (gas, position) was validated.
     *
     * The host does not need to simulate the peer to check it. It already
     * runs the peer's car from their real inputs, and it records the furthest
     * position it has ACCEPTED on the sync channel (_peerMaxX, stamped on the
     * host clock). From that we can ask a question no liar can answer
     * cheaply: even at the fastest speed the physics allows, could you have
     * reached the line by the moment you claim?
     *
     *     earliest possible = (time already elapsed) + (distance left / cap)
     *
     * Anything faster than that is not a good run, it is a fabricated one.
     *
     * Deliberately one-directional: this can only ever make a peer's time
     * SLOWER, never faster. A guest with an honest run is never slowed,
     * because their real accepted snapshots put them at/near the line at
     * close to their real time, and MP_PEER_MAX_SPEED sits far above anything
     * the cars can actually reach. Worst case the correction does nothing.
     */
    _validatePeerFinish(claimed) {
        const t = this._sanitizeFinishTime(claimed);
        // Only the host can validate — the guest has no independent record of
        // the host's progress, and must not pretend to.
        if (!this.isHost) return t;
        // No accepted progress yet, or the green light was never stamped: we
        // have no baseline to measure against, so we do not invent one.
        // Tested the same way _decideFalseStart tests its timestamps — a
        // truthiness check here would silently reject a legitimate 0.
        if (typeof this.goAt !== 'number' || !isFinite(this.goAt)) return t;
        if (!this._peerMaxX || !this._peerMaxXAt) return t;

        const raceDistance = (typeof game !== 'undefined' && game.raceDistance)
            ? game.raceDistance : 0;
        if (!raceDistance) return t;

        const remaining = Math.max(0, raceDistance - this._peerMaxX);
        // A HARD floor: the host did not accept the peer at this far until
        // _peerMaxXAt, so no claim earlier than that can be true. Nothing is
        // subtracted from it.
        const elapsed = Math.max(0, (this._peerMaxXAt - this.goAt) / 1000);
        // Time still needed for the rest of the strip at the speed cap, less a
        // small tolerance. This is the only uncertain term — the final sync
        // is up to MP_SYNC_MS stale, so a peer legitimately sitting just short
        // of the line when it finished would otherwise be "caught" by a few
        // centimetres. Capped at zero so it can never eat into `elapsed`.
        const needed = Math.max(0, (remaining / MP_PEER_MAX_SPEED) - MP_FINISH_SLACK_MS / 1000);
        const earliest = elapsed + needed;
        // Never returns a time below the 2s floor the sanitiser enforces.
        return Math.max(t, Math.max(2, earliest));
    },

    // Sends this side's EVIDENCE, then waits for the single authoritative
    // verdict. Host produces it; guest consumes it.
    reportOutcome(local, fallbackRemote, callback) {
        const roundId = this.roundId;
        // Evidence, not a claim: "I reached the line at T and I first touched
        // throttle at R". No verdict is attached.
        this.sendEvent({
            type: 'raceEnd', roundId,
            finishTime: local.finishTime ?? 999,
            revAt: this.localRevAt,
        });

        this._pendingFinish = { local, callback, roundId };

        if (this.isHost) {
            // The peer may have finished first; its report may already be
            // parked. Decide as soon as we have both sides' evidence.
            this._tryHostDecide(false);
            if (this._pendingFinish) {
                if (this._hostDecideTimer) clearTimeout(this._hostDecideTimer);
                this._hostDecideTimer = setTimeout(() => {
                    this._hostDecideTimer = 0;
                    this._tryHostDecide(true);
                }, MP_OUTCOME_TIMEOUT_MS);
            }
            return;
        }

        // Guest: wait for the host's ruling. On timeout (host vanished
        // mid-outcome) fall back to locally-observed data rather than
        // hanging on the results screen forever.
        let done = false;
        const finish = (remote) => {
            if (done) return;
            done = true;
            this._pendingFinish = null;
            callback(remote);
        };
        this._verdictResolve = finish;
        // The verdict can legitimately arrive BEFORE we report: the host may
        // have already decided from its own finish plus our sync-state, or we
        // simply crossed the line second and its report overtook ours. Consume
        // the parked verdict now instead of stalling for a second on a timer
        // that has already been answered.
        if (this._verdict) {
            const v = this._verdict;
            this._verdict = null;
            finish(v);
            return;
        }
        if (this._hostVerdictTimer) clearTimeout(this._hostVerdictTimer);
        this._hostVerdictTimer = setTimeout(() => {
            this._hostVerdictTimer = 0;
            if (done) return;
            game.showNotification('NO VERDICT FROM HOST');
            finish(fallbackRemote);
        }, MP_OUTCOME_TIMEOUT_MS * 2);
    },

    // Host only. Publishes the one verdict both sides will apply.
    _tryHostDecide(timedOut) {
        if (!this.isHost) return;
        const pf = this._pendingFinish;
        if (!pf) return;
        if (!this._peerFinish && !timedOut) return;
        this._pendingFinish = null;
        if (this._hostDecideTimer) { clearTimeout(this._hostDecideTimer); this._hostDecideTimer = 0; }

        const peer = this._peerFinish;
        this._peerFinish = null;

        // Our own rev stamp is already in host time; the guest's is not.
        const myRev = this.localRevAt;
        const theirRev = peer ? this._toHostClock(peer.revAt) : null;

        // This is the ONLY false-start decision in the system.
        const myFS = this._decideFalseStart(myRev, this.goAt);
        const theirFS = this._decideFalseStart(theirRev, this.goAt);

        // Whatever each side claimed locally is overwritten here. A guest
        // that thought it was disqualified for a jump it did not make, and a
        // host that thought it was clean after jumping, both get the host's
        // single reading.
        const verdict = {
            roundId: pf.roundId || this.roundId,
            host: { falseStart: myFS, finishTime: this._sanitizeFinishTime(pf.local.finishTime) },
            guest: {
                falseStart: theirFS,
                // Validated, not just clamped: the guest's number is checked
                // against how far the host actually accepted it travelling.
                finishTime: peer ? this._validatePeerFinish(peer.finishTime) : 999,
            },
        };

        // Publish BEFORE applying, so the peer is never left waiting on a
        // result we have already shown ourselves.
        this.sendEvent({ type: 'raceVerdict', roundId: this.roundId, verdict });

        // The host's own view of the peer.
        this.localFalseStart = verdict.host.falseStart;
        pf.callback(verdict.guest);
    },

    // Guest only: translate the host's verdict into this client's
    // perspective and apply it verbatim.
    _applyHostVerdict(v) {
        if (!v || typeof v !== 'object') return false;
        const hostSide = v.host || {};
        const guestSide = v.guest || {};
        // We are the guest, so the host's entry is OUR result.
        this.localFalseStart = !!hostSide.falseStart;
        const remote = {
            falseStart: !!guestSide.falseStart,
            finishTime: this._sanitizeFinishTime(guestSide.finishTime),
        };
        const resolve = this._verdictResolve;
        if (resolve) {
            this._verdictResolve = null;
            if (this._hostVerdictTimer) { clearTimeout(this._hostVerdictTimer); this._hostVerdictTimer = 0; }
            resolve(remote);
        } else {
            this._verdict = remote;
        }
        return true;
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
                        // Paint name reflects the peer's REAL choice (their
                        // loadout color), matching what the showroom preview
                        // and the race replica now render.
                        const PAINTS = (typeof game !== 'undefined' && game.PAINTS) ? game.PAINTS : null;
                        const peerPaint = (PAINTS && typeof msg.car.color === 'string')
                            ? PAINTS.find(pc => pc.hex.toLowerCase() === msg.car.color.toLowerCase()) : null;
                        const paintLabel = (peerPaint && typeof game.paintName === 'function')
                            ? ' \u00B7 ' + game.paintName(peerPaint.hex).toUpperCase() : '';
                        stats.textContent = String(msg.car.name || '').toUpperCase() + paintLabel + ' \u00B7 ' +
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
                // Only the host's format ever takes effect. A guest that calls
                // setMode() anyway is refused there, but the rule is enforced
                // HERE too — this is the check that matters, because it is the
                // one the host applies to an incoming message. A guest sending
                // "tournament" cannot change the race it is about to play.
                if (this.isHost) break;
                this.remoteModeKnown = true;
                this.mpFormat = (msg.mode === 'tournament') ? 'tournament' : 'drag';
                this.series = null; // format switch abandons any running series
                this._refreshModeUI();
                game.showNotification(this.mpFormat === 'tournament' ? 'TOURNAMENT — FIRST TO 2 WINS' : 'SINGLE DRAG RACE');
                this._renderLobby();
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
                // Per-tick input is round-scoped: a packet from a heat that has
                // already ended must not feed this round's replica, nor revive
                // the "opponent revved" flag that gates the countdown.
                if (!this._msgIsCurrentRound(msg)) break;
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
                // Same rule as input — a stale snapshot from a finished heat
                // is dropped rather than dragging the replica backward.
                if (!this._msgIsCurrentRound(msg)) break;
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
            case 'round': {
                // The host mints round identity; the guest adopts it. From
                // here on, anything stamped with a different round is from a
                // heat that already ended.
                if (this.isHost) break;              // host does not take orders
                this.roundId = String(msg.roundId || '').slice(0, 40);
                break;
            }
            case 'rev': {
                // Guest's throttle-down timestamp, in the GUEST's clock.
                // Convert into ours and keep it as evidence. Nothing is
                // decided here.
                if (!this._msgIsCurrentRound(msg)) break;
                if (this.isHost) this.remoteRevAt = this._toHostClock(msg.revAt);
                break;
            }
            case 'raceEnd': {
                // Evidence: peer reached the line at T and first touched
                // throttle at R. No verdict attached — the host rules.
                if (!this._msgIsCurrentRound(msg)) break;
                const report = {
                    finishTime: this._sanitizeFinishTime(msg.finishTime),
                    revAt: (typeof msg.revAt === 'number' && isFinite(msg.revAt)) ? msg.revAt : null,
                };
                if (this.isHost) {
                    this._peerFinish = report;
                    // Both sides' evidence may now be in hand.
                    this._tryHostDecide(false);
                } else {
                    this._remoteOutcome = report;
                }
                break;
            }
            case 'raceVerdict': {
                // The single authoritative result, from the host.
                if (!this._msgIsCurrentRound(msg)) break;
                if (this.isHost) break;              // only the host issues one
                this._applyHostVerdict(msg.verdict);
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
        // Record how far the HOST has accepted the peer getting, so a claimed
        // finish time can be checked against it later. `target` is already
        // rate-validated above, so this high-water mark cannot itself be
        // pushed forward faster than physics allows.
        if (this.isHost && target > this._peerMaxX) {
            this._peerMaxX = target;
            this._peerMaxXAt = now;
        }
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
