'use strict';

/* ─── Physics Constants ─── */
const WHEEL_RADIUS = 0.33;
const DRIVETRAIN_EFFICIENCY = 0.90;
const AIR_DENSITY = 1.225;
const G = 9.81;
const MPS_TO_MPH = 2.23694; // Renamed from MPH_PER_MS for accuracy
const FIXED_DT = 1 / 120;
/* Substeps allowed per rendered frame. This is the anti-"spiral of death"
   ceiling: if a frame takes longer than MAX_SUBSTEPS * FIXED_DT, the sim
   cannot catch up in real time and the leftover accumulator is dropped.

   It MUST cover the worst frame time you intend to support, because ET is
   measured on the WALL clock (performance.now - raceStartTime) while the car
   is integrated on SIM time. If the ceiling is hit, the sim silently falls
   behind the clock the ET is read from — the car covers less ground than the
   timer says it did, so slow machines score systematically better times.

   12 substeps = 100 ms of sim per frame, which tolerates a sustained 10 FPS
   before any drift appears (a stall — GC, tab throttle, a level load — is
   still absorbed by the 0.1 s realDt clamp in game.loop). Raise this toward
   16-24 if you ever drop FIXED_DT. */
const MAX_SUBSTEPS = 12;
const AUTO_SHIFT_ENABLED = false;

/* ─── Engine torque model (normalized to each car's redline) ───
   [rpm/redline, torque factor 0..1]. Real engines make almost no
   torque near 0 rpm, pull hardest through the mid-range and fall off
   past the power peak. This one curve drives launch feel, the lugging/
   bogging after early (or absurd) shifts, and the top-end fade.
   Peak wheel force = peakTorque x gearRatio x finalDrive x eff / wheelR,
   where peakTorque is derived per car so that PEAK POWER still equals
   the car's rated hp (peak power lands near 0.9 x redline). */
const TORQUE_CURVE = [
    [0.00, 0.00],
    [0.09, 0.30],   // ~idle: barely any torque under load
    [0.16, 0.55],
    [0.28, 0.78],
    [0.45, 0.94],
    [0.62, 1.00],   // peak torque (~0.6-0.65 redline, like real engines)
    [0.80, 0.96],
    [0.92, 0.86],   // peak power region
    [1.00, 0.70],
];

/* ─── Shift Windows ─── */
const SHIFT_PERFECT_LOW  = 0.88;
const SHIFT_PERFECT_HIGH = 0.98;
const SHIFT_GOOD_LOW     = 0.75;

/* ─── Launch (N → 1st clutch dump at the line) ───
   The launch is NOT judged by the shift windows. The only input that
   matters is the rev the engine carried at the moment 1st went in: the
   higher the staged rpm, the harder the engine pulls AND the better the
   tires hook up (weight transfer) — exactly like a real drag-strip
   launch. See Car.judgeLaunch() in car.js. */
const LAUNCH_PERFECT_RATIO = 0.90; // rpm/redline that scores a 100% launch
const LAUNCH_FORCE_BONUS   = 0.35; // max +35% wheel force during the window
const LAUNCH_GRIP_BONUS    = 0.30; // max +30% traction during the window
const LAUNCH_TIME          = 1.5;  // seconds the launch window stays open
const LAUNCH_ENGAGE_MIN    = 0.02; // fastest engagement cut (s, high-rpm dump)
const LAUNCH_ENGAGE_MAX    = 0.15; // slowest engagement cut (s, low-rpm dump)
const LAUNCH_SPIN_KEPT     = 0.75; // traction kept while spinning at 0 quality
                                   // (rises to 1.0 — tires "hook" — at 100%)

/* ─── Shift Bonuses (perfect = small, honest advantage) ─── */
const BONUS_PERFECT = 0.10;   // +10% wheel force for a short window
const BONUS_GOOD    = 0.03;
const BONUS_EARLY   = -0.12;
const BONUS_LATE    = 0.00;
const BONUS_TIME_PERFECT = 0.6;
const BONUS_TIME_GOOD    = 0.3;
const BONUS_TIME_EARLY   = 0.7;

/* ─── Nitrous (hold-to-spray bottle) ─── */
const NOS_POWER_MULT = 1.25;  // +25% wheel force while the bottle sprays

/* ─── Engine Thresholds ─── */
const IDLE_RPM = 1000;
/* Lugging / stalling: with the clutch engaged the crank is chained to the
   wheels. If the wheel-demand rpm drops this low the engine cannot make
   usable torque — it shudders, bogs, and eventually stalls unless the
   driver clutches or revs out of it. This is what kills the classic
   "slam it into 5th at 0 rpm" exploit: the wheels demand ~0 rpm, so the
   torque curve itself returns ~0 force. */
const STALL_RPM        = 500;   // wheel-demand rpm below this = engine bogged
const STALL_GRACE_GAS  = 1.4;   // seconds of full-throttle bog before a stall
const STALL_GRACE_NOGAS = 0.9;  // seconds of no-throttle bog before a stall
const BOG_SHUDDER_RPM  = 1400;  // top of the visible "lugging" shudder band
const ENGINE_BRAKE_MAX = 3500;

/* ─── Ghost Run (race the replay of your own best ET) ─── */
const GHOST_SAMPLE_DT  = 0.1;  // seconds between recorded position samples (10 Hz)
const GHOST_MAX_POINTS = 600;  // hard cap — 60s of run; keeps the save tiny
const GHOST_WIN_PRIZE  = 150;  // flat payout for beating your own ghost

/* ─── Multiplayer ─── */
const MP_WIN_PRIZE          = 300;  // normal multiplayer win
const MP_LOSS_PRIZE         = 50;   // normal multiplayer loss (consolation)
const MP_FALSE_START_BONUS  = 75;   // small reward when the OTHER player jumps the light
const MP_START_LEAD_MS      = 300;  // buffer between "host decides to start" and the synchronized instant
const MP_INPUT_HZ           = 20;   // how often held-input state is re-sent as a heartbeat
const MP_SYNC_MS            = 300;  // how often an authoritative position snapshot is sent
const MP_OUTCOME_TIMEOUT_MS = 1500; // how long to wait for the peer's race-result report before falling back to local data
const MP_STAGING_FALLBACK_MS = 20000; // host auto-starts the countdown if the opponent never revs at the line
const MP_DISCONNECT_GRACE_MS = 2500;  // WebRTC 'disconnected' can be transient — wait before declaring the peer lost
/* How far from the green light a rev timestamp may sit and still be believed
   as a launch decision. The host converts the guest's stamp into its own
   timeline using a clock offset measured from ping/pong; if that calibration
   is stale, or the stamp is simply crafted, the resulting value can land
   anywhere. Convicting a player on a stamp that far from the light would be
   worse than missing a genuine jump, so anything beyond this window is
   treated as "no evidence" rather than as a false start. */
const MP_REV_PLAUSIBLE_MS  = 6000;
/* Ceiling the host is willing to believe a peer's car could have travelled,
   matching the speed clamp already used for the replica in _applySync. Any
   lower bound on a peer's finish time is derived from this, so it must sit
   ABOVE the fastest car in the game or an honest racer could be slowed down. */
const MP_PEER_MAX_SPEED    = 140;
/* The peer's finish time is cross-checked against the furthest position the
   host has already ACCEPTED on the sync channel, plus however long the
   remaining distance could plausibly take. Only the shortfall is corrected —
   a peer is never handed a time FASTER than it proved, and never a slower
   one than it earned. */
const MP_FINISH_SLACK_MS   = 250;
/* ping/pong clock calibration is measured once at connect. Networks drift
   (Wi-Fi handoff, thermal throttling, a phone sleeping) over a long heat, and
   a stale offset silently moves the peer's rev stamp across the green light.
   Re-measure on this interval during a live race. */
const MP_CLOCK_RESYNC_MS   = 10000;
/* Only a correction SMALLER than this is applied live. A large jump means the
   calibration itself is suspect (a stalled tab, a suspended device), and
   yanking the timeline mid-race would be worse than the drift it fixes — the
   same fail-open rule MP_REV_PLAUSIBLE_MS already applies to rev stamps. */
const MP_CLOCK_MAX_FIX_MS  = 400;

/* ─── Multiplayer Tournament (best-of-3 series) ─── */
const MP_TOURNEY_HEAT_WIN     = 150; // per-heat payout for winning a tournament heat
const MP_TOURNEY_HEAT_LOSS    = 50;  // per-heat consolation for losing a tournament heat
const MP_TOURNEY_BONUS        = 600; // champion bonus for taking the series (first to 2 heat wins)
const MP_TOURNEY_RUNNER_BONUS = 100; // runner-up bonus for losing the series
