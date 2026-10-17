'use strict';

/* ─── AI Customization System ─── */
const CUSTOMIZATION = {
    // Rim geometry lives in car-art.js (RIM_STYLES); these entries just pick
    // a face and hand it the car's rim radius.
    rims: [
        { id: 'stock', name: 'stock', draw: (ctx, r, car) => CarArt.drawRimFace(ctx, r, 'stock', car) },
        { id: 'five_spoke', name: '5-spoke', draw: (ctx, r, car) => CarArt.drawRimFace(ctx, r, 'five_spoke', car) },
        { id: 'mesh', name: 'mesh', draw: (ctx, r, car) => CarArt.drawRimFace(ctx, r, 'mesh', car) },
        { id: 'deep_dish', name: 'deep-dish', draw: (ctx, r, car) => CarArt.drawRimFace(ctx, r, 'deep_dish', car) },
        { id: 'blade', name: 'blade', draw: (ctx, r, car) => CarArt.drawRimFace(ctx, r, 'blade', car) },
        { id: 'star', name: 'star', draw: (ctx, r, car) => CarArt.drawRimFace(ctx, r, 'star', car) },
        { id: 'watanabe', name: 'watanabe', draw: (ctx, r, car) => CarArt.drawRimFace(ctx, r, 'watanabe', car) },
        { id: 'bbs', name: 'bbs', draw: (ctx, r, car) => CarArt.drawRimFace(ctx, r, 'bbs', car) },
    ],
    // RIM PAINT — orthogonal to the rim STYLE above. 'stock' keeps each
    // rim's own finish, 'accent' rides the ACCENT paint row live, the rest
    // are explicit finishes. Saved as an ID like every other part.
    rimPaints: [
        { id: 'stock', name: 'stock' },
        { id: 'accent', name: 'accent' },
        { id: 'black', name: 'black', color: '#171a1f' },
        { id: 'white', name: 'white', color: '#e8eaed' },
        { id: 'silver', name: 'silver', color: '#c9d1d9' },
        { id: 'gold', name: 'gold', color: '#e8c400' },
        { id: 'bronze', name: 'bronze', color: '#b08040' },
        { id: 'red', name: 'red', color: '#e0453a' },
        { id: 'green', name: 'green', color: '#43a047' },
        { id: 'violet', name: 'violet', color: '#9c5fd8' },
    ],
    // Wing shapes follow the reference set: a flat duck lip, a raised ducktail,
    // a swan-neck pedestal blade, a GT plane on two uprights with endplates,
    // and the tall race wing.
    spoilers: [
        { id: 'none', name: 'none' },
        { id: 'lip', name: 'lip', draw: (ctx, car) => CarArt.drawSpoilerPart(ctx, car, 'lip') },
        { id: 'ducktail', name: 'ducktail', draw: (ctx, car) => CarArt.drawSpoilerPart(ctx, car, 'ducktail') },
        { id: 'pedestal', name: 'pedestal', draw: (ctx, car) => CarArt.drawSpoilerPart(ctx, car, 'pedestal') },
        { id: 'gt_wing', name: 'gt-wing', draw: (ctx, car) => CarArt.drawSpoilerPart(ctx, car, 'gt') },
        { id: 'race_wing', name: 'race-wing', draw: (ctx, car) => CarArt.drawSpoilerPart(ctx, car, 'race') },
    ],
    bodyKits: [
        { id: 'stock', name: 'stock' },
        { id: 'lip_kit', name: 'lip-kit', draw: (ctx, car) => CarArt.drawBodyKitPart(ctx, car, 'lip') },
        { id: 'widebody', name: 'widebody', draw: (ctx, car) => CarArt.drawBodyKitPart(ctx, car, 'wide') },
        { id: 'track', name: 'track', draw: (ctx, car) => CarArt.drawBodyKitPart(ctx, car, 'track') },
    ],
    exhausts: [
        { id: 'stock', name: 'stock' },
        { id: 'single', name: 'single', draw: (ctx, car) => CarArt.drawExhaustPart(ctx, car, 'single') },
        { id: 'dual', name: 'dual', draw: (ctx, car) => CarArt.drawExhaustPart(ctx, car, 'dual') },
        { id: 'quad', name: 'quad', draw: (ctx, car) => CarArt.drawExhaustPart(ctx, car, 'quad') },
        { id: 'side_pipe', name: 'side-pipe', draw: (ctx, car) => CarArt.drawExhaustPart(ctx, car, 'side') },
    ],
    // scale = tire diameter as a multiple of the silhouette's own wheel
    // radius, so a big car gets big wheels and a dragster gets skinnies.
    // rimRadius = rim diameter as a fraction of the tire: a real wheel fills
    // most of the arch (17in rim on a 25in tire = 0.68), so a LOW value is a
    // stretched tire / tall sidewall and a high one is a thin-profile wheel.
    tires: [
        { id: 'street', name: 'street', scale: 1.00, rimRadius: 0.68 },
        { id: 'sport', name: 'sport', scale: 1.04, rimRadius: 0.74 },
        { id: 'low_profile', name: 'low-profile', scale: 0.95, rimRadius: 0.80 },
        { id: 'drift', name: 'drift', scale: 1.08, rimRadius: 0.70 },
        { id: 'slick', name: 'slick', scale: 1.08, rimRadius: 0.58, slick: true },
    ],
    // Raised sidewall lettering — drawn as real curved text on the garage
    // preview and as a dashed lettering band at race scale.
    tireBrands: [
        { id: 'generic', name: 'generic', brand: null },
        { id: 'goodyear', name: 'goodyear', brand: 'GOODYEAR' },
        { id: 'yokohama', name: 'yokohama', brand: 'YOKOHAMA' },
        { id: 'falken', name: 'falken', brand: 'FALKEN' },
        { id: 'bridgestone', name: 'bridgestone', brand: 'BRIDGESTONE' },
        { id: 'michelin', name: 'michelin', brand: 'MICHELIN' },
    ],
    tints: [
        { id: 'clear', name: 'clear', color: '#1a2332' },
        { id: 'tint_25', name: '25%', color: '#1a2332' },
        { id: 'tint_50', name: '50%', color: '#0f1520' },
        { id: 'tint_75', name: '75%', color: '#080c15' },
        { id: 'limo', name: 'limo', color: '#000000' },
    ],
    liveries: [
        { id: 'solid', name: 'solid' },
        { id: 'racing_stripe', name: 'racing-stripe', draw: (ctx, car) => drawLivery(ctx, car, 'stripe') },
        { id: 'dual_stripe', name: 'dual-stripe', draw: (ctx, car) => drawLivery(ctx, car, 'dual') },
        { id: 'flames', name: 'flames', draw: (ctx, car) => drawLivery(ctx, car, 'flames') },
        { id: 'camo', name: 'camo', draw: (ctx, car) => drawLivery(ctx, car, 'camo') },
        { id: 'checker', name: 'checker', draw: (ctx, car) => drawLivery(ctx, car, 'checker') },
        { id: 'gradient', name: 'gradient', draw: (ctx, car) => drawLivery(ctx, car, 'gradient') },
        { id: 'number', name: 'number', draw: (ctx, car) => drawLivery(ctx, car, 'number') },
    ],
};

// Saves contain IDs only.  Functions stay in this catalog, never in saved data.
function serializeCustomization(customization) {
    const out = {};
    for (const key of ['rim', 'rimPaint', 'spoiler', 'bodyKit', 'exhaust', 'tire', 'tireBrand', 'tint', 'livery']) out[key] = customization?.[key]?.id || customization?.[key]?.name || null;
    return out;
}
function hydrateCustomization(saved) {
    const groups = { rim: 'rims', rimPaint: 'rimPaints', spoiler: 'spoilers', bodyKit: 'bodyKits', exhaust: 'exhausts', tire: 'tires', tireBrand: 'tireBrands', tint: 'tints', livery: 'liveries' };
    const result = {};
    for (const [key, group] of Object.entries(groups)) {
        const value = saved?.[key];
        result[key] = CUSTOMIZATION[group].find(item => item.id === value || item.name === value || item.name === value?.name) || CUSTOMIZATION[group][0];
    }
    return result;
}

// Resolved rim color for the current RIM PAINT selection. 'stock' (or an
// old save without the field) keeps each rim style's own finish; 'accent'
// rides the car's secondaryColor live; anything else is an explicit hex.
// Lives on the global scope so Renderer (both wheel paths) can call it.
function rimPaintColor(car, fallback) {
    const sel = car && car.customization ? car.customization.rimPaint : null;
    if (!sel || sel.id === 'stock') return fallback;
    if (sel.id === 'accent') return car.secondaryColor || fallback;
    return sel.color || fallback;
}
window.CUSTOMIZATION = CUSTOMIZATION; // Expose for Car.js

/* ─── Save-file sanitizing ───
   Everything below runs on data that came from IndexedDB / localStorage /
   a URL param. That data is under the player's own control, so it is treated
   as UNTRUSTED INPUT, not as truth: it may be hand-edited, truncated, or
   written by an older build whose shape differs. Nothing here is a security
   boundary against a determined local editor — a player with devtools can edit
   memory directly — but it does mean a corrupt or stale save degrades to a
   playable, sane state instead of a NaN speed or an unreachable car. */

// Money: finite, non-negative, whole dollars. Never NaN, never -1, never 1e308.
function sanitizeCash(v, fallback = 2500) {
    const n = Number(v);
    if (!isFinite(n) || n < 0) return fallback;
    return Math.min(Math.floor(n), 999999999);
}

// A recorded time (best ET, ghost). Must be a plausible positive duration.
function sanitizeTime(v) {
    const n = Number(v);
    // REJECT, not clamp: the old Math.min(n, 600) turned garbage sentinels
    // (a 999 DNF that leaked into old saves) into a plausible-looking
    // "600.000s" personal best on the menu. Over ten minutes is not a
    // drag race — such a value is corruption, so it becomes "no record".
    if (!isFinite(n) || n <= 0 || n >= 600) return null;
    return n;
}

// Upgrade levels. Booleans mean "stage 1" (legacy saves); numbers are clamped
// to each part's real range so a hand-edited save cannot buy stage 99 of NOS.
function sanitizeUpgrades(saved) {
    const src = (saved && typeof saved === 'object') ? saved : {};
    const stage = (v, max) => {
        if (v === true) return 1;
        if (v === false || v == null) return 0;
        const n = Math.round(Number(v));
        return isFinite(n) ? Math.max(0, Math.min(max, n)) : 0;
    };
    return {
        engine: Math.max(1, stage(src.engine, 5)),
        injector: Math.max(1, stage(src.injector, 5)),
        chassis: Math.max(1, stage(src.chassis, 5)),
        shortGears: Math.max(1, stage(src.shortGears, 5)),
        intercooler: stage(src.intercooler, 2),
        camshaft: stage(src.camshaft, 3),
        slicks: !!src.slicks,
        aero: !!src.aero,
        parachute: !!src.parachute,
        performanceGearbox: !!src.performanceGearbox,
        swapped: !!src.swapped,
        // Racing Clutch is a real purchasable part (PERFORMANCE menu, $1600)
        // with a live effect in Car._fastShifter. It MUST be listed here or
        // the whitelist silently deletes it on load and the player is charged
        // for an upgrade that vanishes on the next page refresh.
        racingClutch: !!src.racingClutch,
        turbo: stage(src.turbo, 3),
        nos: stage(src.nos, 3),
    };
}

// Tuning sliders are deltas around stock; a legacy boolean is ambiguous, so
// anything unparseable becomes "no adjustment".
function sanitizeTune(saved) {
    const src = (saved && typeof saved === 'object') ? saved : {};
    const d = (v) => {
        const n = Math.round(Number(v));
        return isFinite(n) ? Math.max(-3, Math.min(3, n)) : 0;
    };
    return {
        finalDrive: d(src.finalDrive),
        gearSpacing: d(src.gearSpacing),
        launch: d(src.launch),
        aeroTrim: d(src.aeroTrim),
        ignitionTiming: d(src.ignitionTiming),
        tirePressure: d(src.tirePressure),
    };
}

// Attachment points published by renderer.js each frame. Shared by every
// part drawer so a part follows whatever silhouette it is fitted to.
function artAnchor(car, key) { return car._artAnchors?.[key] || { x: 3, y: 27, w: 14 }; }
function drawLivery(ctx, car, kind) {
    const a = artAnchor(car, 'livery');
    if (kind === 'stripe') { ctx.fillStyle = car.secondaryColor; ctx.fillRect(a.x, a.y + 8, a.w, 3); }
    else if (kind === 'dual') { ctx.fillStyle = car.secondaryColor; ctx.fillRect(a.x + a.w * .27, a.y + 3, 3, a.h - 3); ctx.fillRect(a.x + a.w * .56, a.y + 3, 3, a.h - 3); }
    else if (kind === 'flames') { ctx.fillStyle = '#ff6d00'; ctx.beginPath(); ctx.moveTo(a.x + 4, a.y + a.h); ctx.lineTo(a.x + 11, a.y + 4); ctx.lineTo(a.x + 16, a.y + a.h); ctx.lineTo(a.x + 23, a.y + 9); ctx.lineTo(a.x + 30, a.y + a.h); ctx.fill(); }
    else if (kind === 'camo') { ctx.fillStyle = '#2c3b2b'; for (let i = 0; i < 5; i++) ctx.fillRect(a.x + 5 + i * 15, a.y + ((i * 7) % 10), 8 + (i % 2) * 4, 5); }
    else if (kind === 'checker') { for (let x = 0; x < a.w; x += 6) for (let y = 0; y < 8; y += 4) { ctx.fillStyle = ((x / 6 + y / 4) % 2) ? '#111' : '#eee'; ctx.fillRect(a.x + x, a.y + 7 + y, 6, 4); } }
    else if (kind === 'gradient') { const g = ctx.createLinearGradient(a.x, a.y, a.x + a.w, a.y + a.h); g.addColorStop(0, 'rgba(255,255,255,.32)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(a.x, a.y, a.w, a.h); }
    else if (kind === 'number') { ctx.fillStyle = '#fff'; ctx.font = 'bold 12px monospace'; ctx.fillText('7', a.x + a.w * .48, a.y + a.h - 2); }
}

/* ─── AI Driver: "Driver Persona over Phase FSM" ────────────────────
   Research-backed opponent model (GameAIPro Ch.38 persona layer +
   Ch.3 gaussian/filtered randomness + capped physics-layer catch-up):

   • The opponent is a DRIVER, not a hp number. A per-race plan is
     drawn ONCE from gaussian noise around a difficulty scalar, so a
     given opponent races a CONSISTENT line instead of flickering
     strong/weak within a run.
   • Phase FSM: STAGING (rev to a skill-scaled target) → LAUNCH
     (human reaction delay, occasional hesitation flub) → SHIFT RUN
     (per-gear shift points, bounded flubs, occasional limiter ride)
     with NOS timing on top.
   • Rubber-band is a smoothed, HARD-CAPPED torqueMult (±4%) applied
     to the car — never to behaviour — and it is dead during the
     launch and the final 10% of the strip, so skill decides the
     finish (GameAIPro/Melder: "AI leads early, loses late").
   • difficulty d ∈ [0..1]: 0 = clumsy rookie, 1 = pro tree.        */
class AIDriver {
    constructor(car, difficulty) {
        const d = Math.max(0, Math.min(1, +difficulty || 0));
        this.d = d;
        this.seed = Math.random() * 100;
        const gauss = AIDriver.gauss;

        // LAUNCH: human reaction (real-world RT ≈ 0.1–0.5 s), tighter
        // and faster with skill. Drawn once — consistent for the run.
        this.reactDelay = Math.max(0.12, Math.min(0.75,
            gauss(0.44 - 0.28 * d, 0.05 + 0.06 * (1 - d))));
        // Hesitation flub: low-skill drivers sometimes sleep at the
        // tree and leak ~0.2–0.4 s — the classic "holeshot win".
        this.launchFlub = Math.random() < (1 - d) * 0.28;
        this.flubDelay = 0.15 + Math.random() * 0.22;

        // STAGING: target rev fraction for the hold at the line.
        // Rookies may over-rev into wheelspin; pros hold a tight hole.
        this.stageFrac = Math.max(0.3, Math.min(0.88,
            gauss(0.58 + 0.12 * d, 0.05 + 0.1 * (1 - d))));

        // SHIFT RUN: base shift point walks toward the perfect window
        // (0.88–0.98 of redline) as skill rises; noise shrinks with it.
        this.shiftFrac = 0.86 + 0.07 * d;
        this.shiftSigma = 0.012 + 0.05 * (1 - d);
        this.flubChance = 0.015 + 0.065 * (1 - d);   // per shift
        this._flubRun = 0;                            // never 3 flubs straight
        this.rideLimiter = Math.random() < d * 0.12;  // pros bounce it once, rarely

        // NOS: pro-level bottle discipline — gear-based trigger.
        this.useNos = car.nos > 0 && Math.random() < 0.4 + 0.55 * d;
        this.nosGear = Math.random() < 0.75 ? 2 : 3;
        this.nosDelay = 0.2 + Math.random() * 0.8;

        // FOCUS: slow "in the groove" drift (GameAIPro Ch.3 1-D noise
        // stand-in) — pace wanders ±1–3% over seconds, never snaps.
        this.focusAmp = 0.008 + 0.022 * (1 - d);
        this.focusPeriod = 6 + Math.random() * 8;
    }

    // Sum-of-3-uniforms gaussian — no deps, bell-shaped, bounded ±1σ·k.
    static gauss(mu, sigma) {
        return mu + ((Math.random() + Math.random() + Math.random()) / 1.5 - 1) * sigma;
    }

    /* STAGING phase (countdown): hold the revs at the planned hole.
       Same surface the human uses — gas held at the line. */
    staging(car, dt) {
        car.clutch = 1; car.gear = 1; car.brake = 0;
        const target = car.redline * this.stageFrac;
        const t = performance.now();
        const wob = Math.sin(t / 170 + this.seed) * 90 + Math.sin(t / 61 + this.seed * 2) * 45;
        car.rpm += ((target + wob) - car.rpm) * Math.min(1, 7 * dt);
        if (car.rpm > car.redline) car.rpm = car.redline;
        if (car.rpm < 1000) car.rpm = 1000;
        car.gas = car.rpm < target ? 0.9 : 0.3;
    }

    /* RUNNING phase: launch → shift run. `player` feeds the (capped)
       catch-up band only. */
    drive(car, player, dt, game) {
        if (!car.launched) {
            const delay = this.reactDelay + (this.launchFlub ? this.flubDelay : 0);
            if (game.raceTimer < delay) {
                this.staging(car, dt);   // still holding at the line
                return;
            }
            car.launched = true;
            car.clutch = 0; car.gas = 1; car.gear = 1;
            // The AI launches off its staged rev too — skill-scaled (see the
            // stageFrac plan): weak staging bogs, pro staging hooks. Silent
            // for AI cars: judgeLaunch only speaks to the player's car.
            car.judgeLaunch();
        }

        car.clutch = 0; car.gas = 1;
        this._shiftRun(car);
        this._nos(car, game);
        this._catchup(car, player, dt, game);
    }

    _shiftRun(car) {
        if (car.shiftTimer > 0) return;
        if (car.gear <= 0 || car.gear >= car.gearRatios.length - 1) return;
        const rl = car.redline;
        let shiftAt = rl * Math.max(0.7, Math.min(0.99,
            AIDriver.gauss(this.shiftFrac, this.shiftSigma)));
        // Filtered randomness (GameAIPro Ch.3): a flub is human, three
        // flubs in a row reads as broken — cap the streak at two.
        if (this._flubRun < 2 && Math.random() < this.flubChance) {
            shiftAt = rl * (0.74 + Math.random() * 0.06);
            this._flubRun++;
        } else if (this.rideLimiter && car.gear === Math.min(3, car.gearRatios.length - 2) && Math.random() < 0.25) {
            shiftAt = rl - 120;   // one deliberate limiter ride (backfire + falloff)
        } else {
            this._flubRun = 0;
        }
        if (car.rpm >= shiftAt) car.shiftUp();
    }

    _nos(car, game) {
        if (!this.useNos) return;
        if (!car.nosActive && car.nosTank > 0 && car.gear >= this.nosGear &&
            game.raceTimer >= this.nosDelay) {
            car.nosActive = true;
        }
        if (car.nosTank <= 0) car.nosActive = false;
    }

    /* Bounded catch-up on the PHYSICS layer (Forza/Melder pattern):
       gap-driven, smoothed, ±4% hard cap, dead during the launch and
       the final 10% of the strip. */
    _catchup(car, player, dt, game) {
        let target = 1 + this.focusAmp * Math.sin(game.raceTimer / this.focusPeriod + this.seed);
        if (game.raceTimer > 0.6 && car.x < game.raceDistance * 0.9 && player) {
            const gap = player.x - car.x;            // + = AI behind
            if (Math.abs(gap) > 2.5) {
                const norm = Math.max(-1, Math.min(1, gap / 22));
                target *= 1 + norm * 0.04;
            }
        }
        target = Math.max(0.955, Math.min(1.045, target));
        car.torqueMult += (target - car.torqueMult) * Math.min(1, 1.5 * dt);
    }
}

const game = {
    canvas: null, ctx: null,
    state: 'MENU', menuState: 'MAIN',
    cash: 2500, ownedCars: [], selectedCarIndex: 0,
    quickStats: { races: 0, wins: 0, recentMargin: 0, streak: 0 },
    raceDistance: 402,
    lights: 0, lightTimer: 0, raceStartTime: 0, raceTimer: 0,
    raceState: 'STAGING',
    raceMode: 'quick', tournamentRound: 1, mpFormat: 'drag',
    screenShake: 0, METERS_TO_PX: 22,
    playerCar: null, opponentCar: null,
    effects: null,
    _controlReserve: 0,   // px of screen the on-screen buttons occupy (measured)
    accumulator: 0, lastTimestamp: 0,
    paused: false,
    backgrounds: ['night_city', 'sunset_highway', 'industrial', 'mountain_dusk', 'neon_tokyo'],
    currentBackground: 0,
    _pendingRotation: false,
    _isMobile: false,
    _isFullscreen: false,
    _saveDirty: false,
    _saveTimer: null,
    SAVE_KEY: 'progress_v3',
    bestET: null,
    ghostRun: null,          // {v, et, bg, samples[], car{}} — replay of your best quick run
    _ghostSamples: null,     // live position samples while a ghost-capable run is in progress
    _ghostSampleAcc: 0,
    raceResults: null,
    previewCar: null,
    mpStats: { races: 0, wins: 0, losses: 0, bestET: null },

    carDefs: [
        { name: "Civic '99", hp: 160, weight: 1100, grip: 0.95, redline: 8200, price: 0,
          color: '#fdd835', secondaryColor: '#333', type: 'hatch', art: 'civic_ek', cyl: 4,
          gearRatios: [0, 3.8, 2.4, 1.7, 1.3, 1.0], finalDrive: 4.0, dragArea: 0.72 },
        { name: "S14 Drift", hp: 280, weight: 1250, grip: 1.0, redline: 7500, price: 8000,
          color: '#9c27b0', secondaryColor: '#4a148c', type: 'sedan', art: 's14', cyl: 4,
          gearRatios: [0, 3.5, 2.2, 1.6, 1.2, 1.0], finalDrive: 3.9, dragArea: 0.75 },
        { name: "Mustang GT", hp: 420, weight: 1650, grip: 1.0, redline: 6500, price: 15000,
          color: '#b71c1c', secondaryColor: '#fff', type: 'muscle', art: 'mustang_sn95', cyl: 8,
          gearRatios: [0, 3.3, 2.0, 1.4, 1.1, 0.9], finalDrive: 3.55, dragArea: 0.82 },
        { name: "R34 GTR", hp: 550, weight: 1500, grip: 1.35, redline: 8500, price: 35000,
          color: '#0288d1', secondaryColor: '#01579b', type: 'sedan', art: 'r34', cyl: 6,
          gearRatios: [0, 3.8, 2.5, 1.9, 1.5, 1.2, 0.9], finalDrive: 3.55, dragArea: 0.78 },
        { name: "Supra Mk4", hp: 600, weight: 1550, grip: 1.2, redline: 7800, price: 42000,
          color: '#e65100', secondaryColor: '#ff9800', type: 'super', art: 'supra_a80', cyl: 6,
          gearRatios: [0, 3.2, 2.1, 1.5, 1.1, 0.9, 0.7], finalDrive: 3.27, dragArea: 0.76 },
        { name: "Viper ACR", hp: 750, weight: 1480, grip: 1.45, redline: 6200, price: 65000,
          color: '#1b5e20', secondaryColor: '#000', type: 'super', art: 'viper_acr', cyl: 10,
          gearRatios: [0, 2.9, 1.9, 1.4, 1.1, 0.9, 0.7], finalDrive: 3.55, dragArea: 0.73 },
        { name: "Lambo Huracan", hp: 850, weight: 1400, grip: 1.55, redline: 9000, price: 120000,
          color: '#76ff03', secondaryColor: '#33691e', type: 'super', art: 'huracan', cyl: 10,
          gearRatios: [0, 3.5, 2.5, 1.9, 1.5, 1.2, 1.0, 0.8], finalDrive: 3.08, dragArea: 0.70 },
        { name: "Funny Car", hp: 2500, weight: 900, grip: 2.8, redline: 9500, price: 500000,
          color: '#311b92', secondaryColor: '#d50000', type: 'dragster', art: 'funny_car', cyl: 8,
          gearRatios: [0, 4.0, 3.0, 2.2, 1.8, 1.5], finalDrive: 4.3, dragArea: 1.10 }
    ],

    async init() {
        // BUILD-STAMP: prints the page's declared build so a stale cached
        // copy is identifiable from the console at a glance.
        try { console.info('[RLD] build ', (document.querySelector('meta[name="rl-build"]')||{}).content || 'unknown'); } catch (e) {}
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.resize();
        window.addEventListener('resize', () => this.resize());
        window.addEventListener('orientationchange', () => this.handleOrientationChange());
        // iOS Safari toolbars resize the VISUAL viewport without firing the
        // window resize event — keep the rotated stage glued to it.
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', () => this.resize());
        }

        await SaveSystem.init();
        await this.loadGame();

        // Driver profile loads after the save system (it uses the same
        // IndexedDB pipeline) and before the UI is wired.
        if (typeof Profile !== 'undefined') await Profile.init();
        // Cloud wallet (E1a) arms once the profile id exists. Fire-and-
        // forget: boot never waits on the network, and until the wallet
        // reconciles the game plays exactly as before (local-first).
        if (typeof Wallet !== 'undefined') Wallet.init();
        if (typeof Friends !== 'undefined') await Friends.init();
        // Career ledger loads its counters before the UI is wired so the
        // menu chip and race-end hooks are live from the first frame.
        if (typeof Career !== 'undefined') await Career.init();
        // Daily login bonus loads its per-account streak before the menu
        // UI wires up, so the claim strip is live from the first frame.
        if (typeof DailyBonus !== 'undefined') await DailyBonus.init();

        this.fxInit();
        this.detectMobile();
        this.setupFullscreenListeners();

        if (this.ownedCars.length === 0) {
            this.ownedCars.push(new Car(this.carDefs[0]));
            this.selectedCarIndex = 0;
            this.scheduleSave();
        }
        this.playerCar = this.ownedCars[this.selectedCarIndex];
        this.effects = new RaceParticles(this.ctx);
        this._applyFxToEffects();   // fresh particle system adopts the persisted FX level
        this.setupInput();
        // Keyboard operability for the ghost-race menu button (div-onclick
        // pattern used across the menu; Enter/Space mirrored here).
        const ghostBtn = document.getElementById('ghost-race-btn');
        if (ghostBtn) ghostBtn.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.startGhostRace(); }
        });
        // Same for the SETTINGS entry + its panel controls (role=button
        // divs never fire click from the keyboard on their own).
        document.querySelectorAll('#menu-settings-btn, #settings-menu [role="button"], #career-menu-btn, #career-menu [role="button"], #gar-prev, #gar-next').forEach(el => {
            el.addEventListener('keydown', e => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); }
            });
        });
        this.updateMenuUI();
        if (typeof MP !== 'undefined') MP.init();
        this.lastTimestamp = performance.now();
        this.loop(this.lastTimestamp);

        if (this._isMobile) {
            this.showFullscreenPrompt();
        }
    },

    scheduleSave() {
        this._saveDirty = true;
        if (this._saveTimer) clearTimeout(this._saveTimer);
        this._saveTimer = setTimeout(() => this.flushSave(), 500);
    },

    async flushSave() {
        if (!this._saveDirty) return;
        this._saveDirty = false;
        const data = {
            cash: this.cash,
            selectedCarIndex: this.selectedCarIndex,
            tournamentRound: this.tournamentRound,
            quickStats: this.quickStats,
            bestET: this.bestET || null,
            ghost: this.ghostRun || null,
            currentBackground: this.currentBackground,
            mpStats: this.mpStats,
            ownedCars: this.ownedCars.map(car => ({
                name: car.name, color: car.color, secondaryColor: car.secondaryColor,
                price: car.price, type: car.type, art: car.art,
                baseHp: car.baseHp, baseRedline: car.baseRedline,
                baseGearRatios: car.baseGearRatios, baseFinalDrive: car.baseFinalDrive,
                baseWeight: car.baseWeight, baseGrip: car.baseGrip,
                baseDragArea: car.baseDragArea,
                upgrades: car.upgrades,
                tune: car.tune,
                customization: serializeCustomization(car.customization)
            })),
            version: 3,
        };
        const ok = await SaveSystem.save(this.SAVE_KEY, data);
        if (ok) this.flashSave();
        else {
            // The write FAILED (quota exhausted, IndexedDB unavailable,
            // private browsing). Re-arm the dirty flag: clearing it up-front
            // meant every later scheduleSave() — race payouts, purchases — was
            // a silent no-op for the rest of the session, so a single failed
            // write discarded all progress on reload. Retry shortly; if it
            // keeps failing the next scheduleSave() retries anyway, so this
            // cannot spin.
            this._saveDirty = true;
            this.showNotification('SAVE FAILED - CHECK STORAGE');
            if (this._saveTimer) clearTimeout(this._saveTimer);
            this._saveTimer = setTimeout(() => this.flushSave(), 5000);
        }
    },

    async loadGame() {
        try {
            const data = await SaveSystem.load(this.SAVE_KEY);
            if (!data) return;

            this.cash = sanitizeCash(data.cash);
            this.tournamentRound = Math.max(1, Math.round(Number(data.tournamentRound) || 1));
            // Clamp exactly like mpStats below: these numbers drive the AI
            // difficulty ramp (getQuickOpponent reads races/wins), so a
            // non-numeric value from a hand-edited or older-format save would
            // otherwise flow straight through and be written back out.
            const qs = (data.quickStats && typeof data.quickStats === 'object') ? data.quickStats : {};
            this.quickStats = {
                races: Math.max(0, Math.round(Number(qs.races) || 0)),
                wins: Math.max(0, Math.round(Number(qs.wins) || 0)),
                recentMargin: Number.isFinite(Number(qs.recentMargin)) ? Number(qs.recentMargin) : 0,
                // Win/loss streak feeds the dynamic difficulty rubber-band
                // (see getQuickOpponent). Clamped like every other stat so
                // a hand-edited save can't pin the matchmaker.
                streak: Math.max(-99, Math.min(99, Math.round(Number(qs.streak) || 0))),
            };
            this.bestET = sanitizeTime(data.bestET);
            this.ghostRun = this._sanitizeGhostRun(data.ghost);
            this.currentBackground = data.currentBackground ?? 0;
            this.mpStats = { races: 0, wins: 0, losses: 0, bestET: null, ...(data.mpStats || {}) };
            this.mpStats.races = Math.max(0, Number(this.mpStats.races) || 0);
            this.mpStats.wins = Math.max(0, Number(this.mpStats.wins) || 0);
            this.mpStats.losses = Math.max(0, Number(this.mpStats.losses) || 0);
            this.mpStats.bestET = sanitizeTime(this.mpStats.bestET);
            if (!(this.currentBackground >= 0 && this.currentBackground < this.backgrounds.length)) this.currentBackground = 0;

            // OWNERSHIP IS RE-DERIVED FROM THE CATALOG. The save file may only
            // say WHICH cars this player owns — every performance number (hp,
            // weight, gearing, drag, price, colour) is read from carDefs, and a
            // saved entry naming a car the catalog does not contain is dropped.
            //
            // Before this, a saved entry carried its own hp/weight/gearing, so a
            // hand-edited IndexedDB record could hand the player a 50,000 hp
            // dragster. Upgrades and customization are still restored from the
            // save, because those ARE the player's purchases — they just pass
            // through sanitizeUpgrades() first.
            const savedCars = Array.isArray(data.ownedCars) ? data.ownedCars : [];
            const seen = new Set();
            this.ownedCars = savedCars.map(cd => {
                if (!cd || typeof cd.name !== 'string') return null;
                const def = this.carDefs.find(d => d.name === cd.name);
                if (!def) return null;              // catalog drift or an invented car
                if (seen.has(def.name)) return null; // a duplicate entry grants nothing
                seen.add(def.name);
                const car = new Car(def);
                // Restore the paint the player actually paid for in the
                // garage. `new Car(def)` always starts on the factory
                // colours, and flushSave writes color/secondaryColor on
                // every save — without this the loader drops them and every
                // repaint silently reverts on reload (as does rimPaint,
                // which resolves from secondaryColor).
                if (typeof cd.color === 'string' && /^#[0-9a-f]{3,8}$/i.test(cd.color)) {
                    car.color = cd.color;
                }
                if (typeof cd.secondaryColor === 'string' && /^#[0-9a-f]{3,8}$/i.test(cd.secondaryColor)) {
                    car.secondaryColor = cd.secondaryColor;
                }
                car.upgrades = sanitizeUpgrades(cd.upgrades);
                car.tune = sanitizeTune(cd.tune);
                // Saved customization IDs are re-hydrated into drawable catalog
                // entries. Old saves without customization fall back to stock.
                car.customization = cd.customization ? hydrateCustomization(cd.customization) : car._stockCustomization();
                car.applyUpgrades();
                return car;
            }).filter(Boolean);
            this.selectedCarIndex = Math.max(0, Math.min(
                Math.round(Number(data.selectedCarIndex) || 0),
                Math.max(0, this.ownedCars.length - 1)));
        } catch (e) {
            console.warn('Load failed, starting fresh:', e);
            this.cash = 2500;
            this.tournamentRound = 1;
            this.ownedCars = [];
        }
    },

    /* ── Money ────────────────────────────────────────────────────────────
       Every cash movement in the game goes through these two. They exist so
       a bad value can never become a broken save: NaN cash propagates into
       every comparison and renders as "NaN" on every screen, and a negative
       or negative-priced purchase is a straight exploit.

       They validate the AMOUNT, and since the cloud wallet (wallet.js, E1a)
       every ACCEPTED move is also mirrored to pdl_wallet as one atomic RTDB
       transaction whose math the security rules re-derive from the server's
       pre-write state — head+1, balance+d, bounded deltas, a rolling earn
       window and an append-only journal. A devtools poke of this.cash no
       longer survives a reload: it never produces a wallet move, so the
       boot reconcile adopts the server balance over the tampered local one.
       The mirror is fire-and-forget — offline play is unchanged. */
    awardCash(amount, reason) {
        const n = Math.round(Number(amount));
        // A prize that isn't a sane whole number of dollars is a bug upstream,
        // not something to bank. Refuse rather than corrupt the save.
        if (!isFinite(n) || n <= 0) {
            console.warn('awardCash refused', reason, amount);
            return 0;
        }
        const before = this.cash;
        this.cash = sanitizeCash(before + n);
        console.log('awardCash +' + (this.cash - before), reason || '');
        // Mirror the accepted gain to the cloud wallet (atomic, rules-
        // validated; no-ops when offline/signed-out). Queued, never awaited.
        const gained = this.cash - before;
        if (gained > 0 && typeof Wallet !== 'undefined') Wallet.move(gained, reason || 'unknown');
        // Cash just moved — the ledger's cash-peak goal is re-checked here
        // (and in spendCash) so POCKET MONEY unlocks without waiting for
        // the next race-end evaluation.
        if (typeof Career !== 'undefined' && Career.evaluate) Career.evaluate();
        return gained;
    },

    // `allowZero` exists for purchases that legitimately cost nothing (the
    // starter car). A price that is negative, NaN or non-numeric is never
    // "free" — it is inverted, which would PAY the player to buy something.
    canAfford(cost, allowZero = true) {
        const n = Number(cost);
        if (!isFinite(n)) return false;
        if (n < 0) return false;
        if (n === 0) return !!allowZero;
        return this.cash >= n;
    },

    spendCash(cost, reason) {
        const n = Number(cost);
        if (!isFinite(n) || n < 0) {
            console.warn('spendCash refused', reason, cost);
            return false;
        }
        if (this.cash < n) {
            console.warn('spendCash refused — insufficient funds', reason, cost, this.cash);
            return false;
        }
        this.cash = sanitizeCash(this.cash - n);
        // Mirror the accepted spend (atomic, rules-validated; no-ops when
        // offline/signed-out). Queued, never awaited.
        if (n > 0 && typeof Wallet !== 'undefined') Wallet.move(-n, reason || 'unknown');
        // Purchases (cars/parts) change garage size and wallet — the same
        // live re-check as awardCash so COLLECTOR / FULL GARAGE unlock
        // the moment the car lands in the garage.
        if (typeof Career !== 'undefined' && Career.evaluate) Career.evaluate();
        return true;
    },

    /* Re-asserts that the ACTIVE car is one this save legitimately owns.
       Called before any moment where the car leaves the local machine and
       becomes a promise to someone else:
         · announcing a loadout for a multiplayer heat,
         · starting (or re-starting) a heat from a saved pairing.

       Both the car name and its identity are checked against ownedCars — a
       stale object reference (one left over from a previous session, or from
       a shop screen that swapped the array underneath us) is repaired here
       rather than being announced as a car the player may not own.

       `announce` adds a player-facing note, because this path is normally
       reached through a rematch or a lobby and silently swapping the car
       would otherwise look like the game forgot what you had selected.
       Returns the car now considered valid. */
    ensureOwnedCar(announce = false) {
        const owned = this.ownedCars;
        let car = this.playerCar;
        const isOwned = c => !!c && owned.indexOf(c) !== -1;

        if (!owned.length) {
            // Nothing owned at all (corrupt save, or a race that deleted the
            // array): the starter car is free and always defensible.
            const starter = new Car(this.carDefs[0]);
            owned.push(starter);
            this.selectedCarIndex = 0;
            car = starter;
            this.scheduleSave();
        } else if (!isOwned(car)) {
            // Player's selection no longer resolves to an owned car. Fall back
            // to the first car this player genuinely owns.
            const idx = Math.max(0, Math.min(this.selectedCarIndex | 0, owned.length - 1));
            car = owned[idx];
            if (announce) {
                this.showNotification('CAR RESET — USING ' + String(car.name).toUpperCase());
            }
            console.warn('ensureOwnedCar: selection did not resolve to an owned car; fell back to', car.name);
        }

        this.playerCar = car;
        this.selectedCarIndex = owned.indexOf(car);
        return car;
    },

    flashSave() {
        const el = document.getElementById('save-indicator');
        if (el) {
            el.style.opacity = 1;
            clearTimeout(this._saveTimeout);
            this._saveTimeout = setTimeout(() => el.style.opacity = 0, 1000);
        }
    },

    detectMobile() {
        const ua = navigator.userAgent || '';
        const touch = ('ontouchstart' in window) || navigator.maxTouchPoints > 1;
        const smallScreen = window.innerWidth <= 1024;
        const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Tablet/i.test(ua);
        this._isMobile = (isMobileUA || (touch && smallScreen)) && smallScreen;

        if (this._isMobile) {
            document.body.classList.add('mobile');
        }
        this.updateOrientationClass();
        // Re-size AFTER the mobile/portrait classes are known: on rotated
        // portrait stages the canvas must be sized to the SWAPPED (landscape)
        // dimensions, and init() runs its first resize() before this point.
        this.resize();
    },

    updateOrientationClass() {
        if (!this._isMobile) return;
        const isPortrait = window.innerHeight > window.innerWidth;
        document.body.classList.toggle('portrait', isPortrait);
        this._maybeRotateHint(isPortrait);
    },

    // Portrait phones now play on a 90°-rotated stage (landscape render in
    // a portrait viewport — standard mobile-game technique). Physical
    // rotation still works exactly as before: the stage simply un-rotates
    // via the same class + resize pipeline. The old blocking "rotate your
    // device" wall becomes a small dismissible hint, because the game is
    // now fully playable either way.
    _maybeRotateHint(isPortrait) {
        const el = document.getElementById('rotate-prompt');
        if (!el) return;
        if (!isPortrait) { el.classList.remove('show'); return; }
        if (this._rotateHintDismissed) return;
        el.classList.add('show');
        clearTimeout(this._rotateHintTimer);
        this._rotateHintTimer = setTimeout(() => el.classList.remove('show'), 5000);
    },

    dismissRotateHint() {
        this._rotateHintDismissed = true;
        clearTimeout(this._rotateHintTimer);
        const el = document.getElementById('rotate-prompt');
        if (el) el.classList.remove('show');
    },

    // Logical scene dimensions. On portrait phones the stage is rotated,
    // so the landscape scene is drawn with W/H swapped from the viewport.
    viewSize() {
        const rotated = this._isMobile && window.innerHeight > window.innerWidth;
        return rotated
            ? { W: window.innerHeight, H: window.innerWidth }
            : { W: window.innerWidth, H: window.innerHeight };
    },

    handleOrientationChange() {
        setTimeout(() => {
            this.updateOrientationClass();
            this.resize();
        }, 200);
    },

    resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        // On portrait phones the canvas is sized to the SWAPPED (landscape)
        // dimensions — it fills the 90°-rotated stage.
        const rotated = this._isMobile && window.innerHeight > window.innerWidth;
        const w = rotated ? window.innerHeight : window.innerWidth;
        const h = rotated ? window.innerWidth : window.innerHeight;
        this.canvas.width = w * dpr;
        this.canvas.height = h * dpr;
        this.canvas.style.width = w + 'px';
        this.canvas.style.height = h + 'px';
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.ctx.imageSmoothingEnabled = false;
        this.updateOrientationClass();
        this._updateControlReserve();
    },

    // Measures how much vertical space the on-screen race buttons actually
    // occupy right now. The renderer lifts the road (and everything on it)
    // above this strip, so buttons can never cover the cars — responsive to
    // any viewport, safe-area inset, fullscreen state or button size.
    _updateControlReserve() {
        const c = document.getElementById('controls');
        let reserve = 0;
        if (c && this.state === 'RACE' && !c.classList.contains('hidden')) {
            reserve = c.offsetHeight + (this._isMobile ? 14 : 26);
        }
        this._controlReserve = reserve;
    },

    setupFullscreenListeners() {
        const handler = () => {
            this._isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement);
            setTimeout(() => this.resize(), 150);
        };
        document.addEventListener('fullscreenchange', handler);
        document.addEventListener('webkitfullscreenchange', handler);
    },

    isFullscreenAvailable() {
        const el = document.documentElement;
        return !!(el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen);
    },

    async enterFullscreen() {
        if (!this.isFullscreenAvailable()) return false;
        const el = document.getElementById('game-container');
        try {
            if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
            else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
            else if (el.msRequestFullscreen) await el.msRequestFullscreen();
            return true;
        } catch (e) {
            console.warn('Fullscreen request failed:', e);
            return false;
        }
    },

    async exitFullscreen() {
        try {
            if (document.exitFullscreen) await document.exitFullscreen();
            else if (document.webkitExitFullscreen) await document.webkitExitFullscreen();
            else if (document.msExitFullscreen) await document.msExitFullscreen();
        } catch (e) {}
    },

    showFullscreenPrompt() {
        if (localStorage.getItem('pdl_fs_asked') === '1') return;
        if (!this.isFullscreenAvailable()) return;
        const el = document.getElementById('fullscreen-prompt');
        el.classList.add('active');
    },

    async acceptFullscreen() {
        document.getElementById('fullscreen-prompt').classList.remove('active');
        localStorage.setItem('pdl_fs_asked', '1');
        await this.enterFullscreen();
        this.tryLockOrientation();
    },

    declineFullscreen() {
        document.getElementById('fullscreen-prompt').classList.remove('active');
        localStorage.setItem('pdl_fs_asked', '1');
    },

    async tryLockOrientation() {
        try {
            if (screen.orientation && screen.orientation.lock) {
                await screen.orientation.lock('landscape').catch(() => {});
            }
        } catch (e) {}
    },

    async toggleFullscreenFromMenu() {
        if (this._isFullscreen) {
            await this.exitFullscreen();
        } else {
            await this.enterFullscreen();
            this.tryLockOrientation();
        }
    },

    setupInput() {
        const handle = (action, val) => {
            if (this.state !== 'RACE' || this.paused) return;
            const car = this.playerCar;
            if (action === 'gas') {
                car.gas = val;
                this._toggleBtn('btn-gas', val);
                if (val && this.raceState === 'RUNNING' && !car.launched) {
                    car.launched = true;
                    if (car.reactionRecorded === 0) {
                        car.reactionTime = this.raceTimer;
                        car.reactionRecorded = 1;
                        const rd = document.getElementById('reaction-display');
                        if (rd) rd.innerText = 'RT: ' + car.reactionTime.toFixed(3) + 's';
                    }
                }
            }
            if (action === 'brake') { car.brake = val; this._toggleBtn('btn-brake', val); }
            if (action === 'clutch') { car.clutch = val; this._toggleBtn('btn-clutch', val); }
            if (action === 'nos') {
                // No bottle, no spray — the button explains instead.
                if (car.nos > 0) {
                    car.nosActive = !!val;
                    this._toggleBtn('btn-nos', !!val);
                } else if (val) {
                    this.showNotification('NO NITROUS — BUY A KIT IN PERFORMANCE');
                }
            }
        };

        window.addEventListener('keydown', e => {
            if (e.repeat) return;
            // Auth gate owns the keyboard while the sign-in overlay is up
            // (prevents Escape→pause and gas/brake hotkeys leaking in
            // from the auth email/password fields).
            if (window.RLAuth && RLAuth.isLocked()) return;
            const k = e.key.toLowerCase();
            if (k === 'escape') {
                if (this.state === 'MENU' && this.closeSettingsIfOpen()) return;
                this.togglePause();
                return;
            }
            // NOTE: no 'm' mute hotkey — M sits right beside the shift keys, so
            // a missed keypress during a race silently killed ALL audio mid-run.
            // Sound/music stay toggleable from the pause + settings panels only.
            if (this.paused) return;
            if (k === 'w' || k === 'arrowup') handle('gas', 1);
            if (k === 's' || k === 'arrowdown') handle('brake', 1);
            if (k === ' ') { e.preventDefault(); handle('clutch', 1); }
            if (k === 'x') handle('nos', 1);
            if (k === 'd' || k === 'arrowright') {
                if (this.state === 'RACE') { this.playerShiftUp(); this._pulseBtn('btn-up'); }
            }
            if (k === 'a' || k === 'arrowleft') {
                if (this.state === 'RACE') { this.playerShiftDown(); this._pulseBtn('btn-down'); }
            }
            // Garage browsing: ←/→ walk the owned cars while MY GARAGE is
            // open (menu state only — in a race the same keys shift gears).
            if (this.state === 'MENU' && this.menuState === 'GARAGE') {
                if (k === 'arrowleft') { e.preventDefault(); this.garageNavigate(-1); }
                if (k === 'arrowright') { e.preventDefault(); this.garageNavigate(1); }
            }
        });

        window.addEventListener('keyup', e => {
            if (this.paused) return;
            const k = e.key.toLowerCase();
            if (k === 'w' || k === 'arrowup') handle('gas', 0);
            if (k === 's' || k === 'arrowdown') handle('brake', 0);
            if (k === ' ') handle('clutch', 0);
            if (k === 'x') handle('nos', 0);
        });

        const bind = (id, action) => {
            const el = document.getElementById(id);
            if (!el) return;
            const down = e => { e.preventDefault(); e.stopPropagation(); handle(action, 1); };
            const up = e => { e.preventDefault(); e.stopPropagation(); handle(action, 0); };
            el.addEventListener('touchstart', down, { passive: false });
            el.addEventListener('touchend', up, { passive: false });
            el.addEventListener('touchcancel', up, { passive: false });
            el.addEventListener('mousedown', down);
            el.addEventListener('mouseup', up);
            el.addEventListener('mouseleave', up);
        };
        bind('btn-gas', 'gas');
        bind('btn-brake', 'brake');
        bind('btn-clutch', 'clutch');
        bind('btn-nos', 'nos');

        const upBtn = document.getElementById('btn-up');
        const downBtn = document.getElementById('btn-down');
        if (upBtn) {
            const shiftUpHandler = e => {
                e.preventDefault(); e.stopPropagation();
                if (!this.paused && this.state === 'RACE') this.playerShiftUp();
                this._pulseBtn('btn-up');
            };
            upBtn.addEventListener('touchstart', shiftUpHandler, { passive: false });
            upBtn.addEventListener('mousedown', shiftUpHandler);
        }
        if (downBtn) {
            const shiftDownHandler = e => {
                e.preventDefault(); e.stopPropagation();
                if (!this.paused && this.state === 'RACE') this.playerShiftDown();
                this._pulseBtn('btn-down');
            };
            downBtn.addEventListener('touchstart', shiftDownHandler, { passive: false });
            downBtn.addEventListener('mousedown', shiftDownHandler);
        }

        document.addEventListener('contextmenu', e => {
            if (e.target.classList && e.target.classList.contains('btn')) e.preventDefault();
        });

        // Bind fullscreen prompt buttons
        document.getElementById('fs-yes-btn').addEventListener('click', () => this.acceptFullscreen());
        document.getElementById('fs-no-btn').addEventListener('click', () => this.declineFullscreen());
    },

    _toggleBtn(id, on) {
        const el = document.getElementById(id);
        if (el) on ? el.classList.add('active') : el.classList.remove('active');
    },

    _pulseBtn(id) {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.add('active');
        setTimeout(() => el.classList.remove('active'), 100);
    },

    // Wrap the real shift calls so multiplayer can relay them to the peer
    // without touching Car's own shift logic at all.
    playerShiftUp() {
        this.playerCar.shiftUp();
        // Throttle slams shut mid-shift — a spooled turbo vents (blow-off).
        if (typeof SFX !== 'undefined') SFX.blowOff();
        if (this.raceMode === 'multiplayer' && typeof MP !== 'undefined') MP.sendShift('shiftUp');
    },
    playerShiftDown() {
        this.playerCar.shiftDown();
        if (typeof SFX !== 'undefined') SFX.blowOff();
        if (this.raceMode === 'multiplayer' && typeof MP !== 'undefined') MP.sendShift('shiftDown');
    },

    togglePause() {
        if (this.state !== 'RACE') return;
        this.paused = !this.paused;
        const menu = document.getElementById('pause-menu');
        if (this.paused) {
            // Stamp WHEN the pause began so the race clock can be frozen
            // across it (see _unpauseClock).
            this._pauseAt = performance.now();
            menu.classList.remove('hidden');
            this._refreshSoundLabel();
            this._refreshMusicLabel();
            this._refreshVolumeSliders();
            this.playerCar.gas = 0;
            this.playerCar.brake = 0;
            this.playerCar.clutch = 0;
            // NOS must be cleared with the rest of the inputs. The keyup /
            // touchend that would normally release it is swallowed by the
            // `if (this.paused) return` guards, so a bottle held across the
            // pause stayed latched and kept spraying after resume.
            this.playerCar.nosActive = false;
            this._toggleBtn('btn-gas', false);
            this._toggleBtn('btn-brake', false);
            this._toggleBtn('btn-clutch', false);
            this._toggleBtn('btn-nos', false);
            // Tell the peer we are not driving, so a stalled car reads as a
            // pause instead of a dropped connection. See MP.sendPause.
            if (typeof MP !== 'undefined') MP.sendPause(true);
        } else {
            this._unpauseClock();
            menu.classList.add('hidden');
            if (typeof MP !== 'undefined') MP.sendPause(false);
        }
    },
    resumeRace() {
        if (this.paused) this._unpauseClock();
        this.paused = false;
        document.getElementById('pause-menu').classList.add('hidden');
        if (typeof MP !== 'undefined') MP.sendPause(false);
    },
    // THE pause fix: the race clock (countdown light, HUD timer, ghost
    // timeline, opponent AI staging) all read wall-clock timestamps. Freezing
    // the SIM while those clocks kept running meant "PAUSED" races secretly
    // continued — resume dumped the player into a race that had aged by the
    // whole pause (ghost teleported ahead, lights skipped to green). Shifting
    // every stamped origin by the pause duration truly freezes time.
    _unpauseClock() {
        if (!this._pauseAt) return;
        const pausedFor = performance.now() - this._pauseAt;
        this._pauseAt = 0;
        if (this.raceState === 'COUNTDOWN' && this.lightTimer) this.lightTimer += pausedFor;
        if (this.raceStartTime) this.raceStartTime += pausedFor;
        if (typeof MP !== 'undefined' && MP.countdownStart) MP.countdownStart += pausedFor;
    },

    // ── Settings overlay (main menu) ────────────────────────────────
    // The same persisted audio state the pause menu edits — shown before
    // you ever launch a race. ESC/BACK close it; every toggle and slider
    // is shared code with the pause-menu copies, so the two surfaces can
    // never drift apart.
    openSettings() {
        if (this.state !== 'MENU') return;
        const menu = document.getElementById('settings-menu');
        if (!menu) return;
        menu.classList.remove('hidden');
        this._refreshSoundLabel();
        this._refreshMusicLabel();
        this._refreshFxLabel();
        this._refreshVolumeSliders();
    },

    closeSettings() {
        const menu = document.getElementById('settings-menu');
        if (menu) menu.classList.add('hidden');
    },

    // ESC hook: true when the settings panel was open and got closed.
    closeSettingsIfOpen() {
        const menu = document.getElementById('settings-menu');
        if (menu && !menu.classList.contains('hidden')) {
            menu.classList.add('hidden');
            return true;
        }
        return false;
    },

    // ── Sound + Music toggles (pause menu + M key) ────────────────
    toggleSound() {
        if (typeof SFX === 'undefined') return;
        const muted = SFX.toggleMute();
        this._refreshSoundLabel();
        this.showNotification(muted ? 'SOUND OFF' : 'SOUND ON');
    },

    toggleMusic() {
        if (typeof SFX === 'undefined') return;
        const muted = SFX.toggleMusicMuted();
        this._refreshMusicLabel();
        this.showNotification(muted ? 'MUSIC OFF' : 'MUSIC ON');
    },

    // ── FX quality system (High / Low / Auto) ───────────────────────
    // One setting, three states, stored in the existing 'rla_fx' key:
    //   '0'    High FX — every effect, zero adaptation (the default).
    //   '1'    Low FX  — deliberate medium reductions, fixed.
    //   'auto' — the monitor adapts tiers 0..3 to sustained FPS.
    // Adaptation touches OPTIONAL visuals only (particle rates, soft
    // glows); physics, input, collision and rules are never touched,
    // and manual selections are always respected.
    _fxMode: '0',
    _fxTier: 0,          // auto-mode only: 0 full … 3 minimal
    _fpsBuf: [],
    _fxEvalT: 0,
    _fxLowStreak: 0,
    _fxGoodStreak: 0,
    _fxCooldown: 0,

    fxInit() {
        let v = '0';
        try { v = localStorage.getItem('rla_fx') || '0'; } catch (e) {}
        if (v !== '0' && v !== '1' && v !== 'auto') v = '0';
        this._fxMode = v;
        this._applyFxToEffects();
    },

    /* 0 full · 1-3 adaptive tiers · manual Low FX sits at tier 2 */
    fxLevel() {
        if (this._fxMode === '1') return 2;
        if (this._fxMode === 'auto') return this._fxTier;
        return 0;
    },

    _applyFxToEffects() {
        if (this.effects && this.effects.setFxLevel) this.effects.setFxLevel(this.fxLevel());
    },

    /* Rolling frame-time monitor. Evaluates once per second over a 2 s
     * window; three consecutive slow evaluations step the tier down,
     * eight fast ones step it back up, with a 10 s cooldown after any
     * change so quality never oscillates mid-race. Auto mode only, and
     * only while actually racing (menu frames are not evidence). */
    _fxMonitor(realDt) {
        this._fpsBuf.push(realDt);
        if (this._fpsBuf.length > 120) this._fpsBuf.shift();
        this._fxEvalT += realDt;
        if (this._fxEvalT < 1) return;
        this._fxEvalT = 0;
        const buf = this._fpsBuf;
        const avg = buf.reduce((a, b) => a + b, 0) / buf.length;
        buf.length = 0;
        if (this._fxMode !== 'auto' || this.state !== 'RACE' || this.paused) return;
        if (this._fxCooldown > 0) { this._fxCooldown--; return; }
        const fps = 1 / Math.max(avg, 1e-4);
        if (fps < 27) { this._fxLowStreak++; this._fxGoodStreak = 0; }
        else if (fps > 47) { this._fxGoodStreak++; this._fxLowStreak = 0; }
        else { this._fxLowStreak = 0; this._fxGoodStreak = 0; }
        if (this._fxLowStreak >= 3 && this._fxTier < 3) {
            this._fxTier++;
            this._fxLowStreak = 0;
            this._fxCooldown = 10;
            this._applyFxToEffects();
            this.showNotification('FX AUTO: ' + ['FULL', 'LIGHT', 'MEDIUM', 'MINIMAL'][this._fxTier]);
        } else if (this._fxGoodStreak >= 8 && this._fxTier > 0) {
            this._fxTier--;
            this._fxGoodStreak = 0;
            this._fxCooldown = 10;
            this._applyFxToEffects();
        }
    },

    // ── Reduced-FX toggle (settings) ────────────────────────────────
    // Accessibility switch for drivers on low-end phones or motion-
    // sensitive eyes: kills every decorative animation/transition via the
    // html.reduce-motion class (see style.css). Persisted locally; applied
    // pre-paint by the head boot script so the very first frame already
    // respects the driver's choice.
    toggleReduceFx() {
        const order = ['0', 'auto', '1'];
        const next = order[(order.indexOf(this._fxMode) + 1) % order.length];
        this._fxMode = next;
        if (next === '1') this._fxTier = 2;   // leaving AUTO: start Low FX at its fixed tier
        try { localStorage.setItem('rla_fx', next); } catch (e) {}
        document.documentElement.classList.toggle('reduce-motion', next === '1');
        this._applyFxToEffects();
        this._refreshFxLabel();
        this.showNotification(next === '0' ? 'FULL FX ON' : (next === 'auto' ? 'FX AUTO-ADAPT ON' : 'LOW FX ON'));
    },

    _refreshFxLabel() {
        const btn = document.getElementById('set-fx-btn');
        if (btn) btn.innerText = 'REDUCE FX: ' + ({ '0': 'OFF', 'auto': 'AUTO', '1': 'ON' }[this._fxMode] || 'OFF');
    },

    _refreshSoundLabel() {
        if (typeof SFX === 'undefined') return;
        const label = 'SOUND: ' + (SFX.muted() ? 'OFF' : 'ON');
        const btn = document.getElementById('pause-sound-btn');
        if (btn) btn.innerText = label;
        const setBtn = document.getElementById('set-sound-btn');
        if (setBtn) setBtn.innerText = label;
    },

    _refreshMusicLabel() {
        if (typeof SFX === 'undefined') return;
        const label = 'MUSIC: ' + (SFX.musicMuted() ? 'OFF' : 'ON');
        const btn = document.getElementById('pause-music-btn');
        if (btn) btn.innerText = label;
        const setBtn = document.getElementById('set-music-btn');
        if (setBtn) setBtn.innerText = label;
    },

    // ── Volume sliders (pause menu) ─────────────────────────────────
    // Wired from the markup via oninput; these handlers normalize the
    // stored value back onto the slider, keep the ON/OFF labels in sync
    // (a drag above 0 un-mutes — see SFX.setSfxVolume) and paint the
    // filled side of the track in the slider's accent color.
    setSfxVolume(v) {
        if (typeof SFX === 'undefined') return;
        SFX.setSfxVolume(v);
        this._refreshVolumeSliders();
        this._refreshSoundLabel();
    },

    setMusicVolume(v) {
        if (typeof SFX === 'undefined') return;
        SFX.setMusicVolume(v);
        this._refreshVolumeSliders();
        this._refreshMusicLabel();
    },

    _refreshVolumeSliders() {
        if (typeof SFX === 'undefined') return;
        // Both surfaces (pause menu + main-menu settings) stay on the same
        // persisted values — dragging one pair repaints the other too.
        const sfxEls = [document.getElementById('pause-sfx-vol'), document.getElementById('set-sfx-vol')];
        const musEls = [document.getElementById('pause-music-vol'), document.getElementById('set-music-vol')];
        sfxEls.forEach(el => {
            if (!el) return;
            el.value = Math.round(SFX.sfxVolume() * 100);
            this._paintSlider(el, '#4caf50');
        });
        musEls.forEach(el => {
            if (!el) return;
            el.value = Math.round(SFX.musicVolume() * 100);
            this._paintSlider(el, '#ffb300');
        });
    },

    // Filled-side gradient on the range track — pure presentation, set
    // only when the value actually changes. The custom property inherits
    // into the ::-webkit-slider-runnable-track / ::-moz-range-track
    // pseudo-elements, which read it as their background.
    _paintSlider(el, color) {
        const v = Math.max(0, Math.min(100, Number(el.value) || 0));
        const grad = 'linear-gradient(to right, ' + color + ' ' + v + '%, #181c24 ' + v + '%)';
        if (el._lastFill !== grad) {
            el._lastFill = grad;
            el.style.setProperty('--pdl-fill', grad);
        }
    },

    // Live ET readout — the HUD timer used to be written only as "0.000"
    // at race start and never again. Change-detected to avoid DOM churn.
    _updateHudTimer() {
        const t = this.raceTimer.toFixed(3);
        if (t === this._lastTimerText) return;
        this._lastTimerText = t;
        const el = document.getElementById('race-timer');
        if (el) el.innerText = t;
    },

    // Nitrous HUD: the bottle button only exists when the car has a kit; the
    // gauge drains live and the button glows while actually spraying (the
    // spray guards may veto a held button — neutral, clutch, empty bottle).
    _updateNosHud() {
        const p = this.playerCar;
        if (!p) return;
        const btn = document.getElementById('btn-nos');
        if (!btn) return;
        const has = p.nos > 0;
        btn.classList.toggle('hidden', !has);
        // Body flag lets CSS compress the pedal row while the 4th button is
        // on screen (keeps 320px-wide phones from overflowing).
        document.body.classList.toggle('has-nos', has);
        if (!has) return;
        const fill = document.getElementById('nos-fill');
        if (fill) {
            const w = Math.round(Math.max(0, Math.min(1, p.nosTank)) * 100);
            if (w !== this._lastNosFill) {
                this._lastNosFill = w;
                fill.style.width = w + '%';
            }
            fill.classList.toggle('nos-empty', p.nosTank <= 0);
        }
        btn.classList.toggle('nos-spraying', p.nosSpraying);
    },
    restartRace() {
        this.paused = false;
        this._pauseAt = 0;   // discard the stale stamp — the race is being rebuilt
        document.getElementById('pause-menu').classList.add('hidden');
        if (this.raceMode === 'multiplayer') { this.quitToMenu(); return; }
        this.startRaceMode(this.raceMode);
    },
    quitToMenu() {
        this.paused = false;
        this._pauseAt = 0;   // ditto
        document.getElementById('pause-menu').classList.add('hidden');
        this.returnToMenu();
    },

    loop(timestamp) {
        // Bound once: a fresh arrow closure here was one allocation
        // per frame for the GC to collect, forever.
        requestAnimationFrame(this._boundLoop || (this._boundLoop = this.loop.bind(this)));
        const realDt = (timestamp - this.lastTimestamp) / 1000;
        this.lastTimestamp = timestamp;
        this._fxMonitor(realDt);   // rolling frame stats; adapts OPTIONAL FX only

        if (this.paused) {
            // Even while the sim is frozen the frame must not leave stale
            // presentation state behind:
            //  - shake keeps decaying, otherwise draw() re-applies a fresh
            //    random offset every frame and the canvas jitters forever
            //    until resume;
            //  - the engine is explicitly silenced (rather than skipping the
            //    update entirely, which held its last gain/frequency).
            if (this.screenShake > 0.1) this.screenShake *= 0.88;
            else this.screenShake = 0;
            // updateEngine() early-returns on a null car, which would leave
            // the drone stuck at its last gain — pass the car with
            // active=false so it ramps out to silence properly.
            if (typeof SFX !== 'undefined') SFX.updateEngine(this.playerCar, false);
            // The physics step is frozen, so MP.tick() is not running and no
            // heartbeat reaches the peer. Keep the link provably alive.
            if (typeof MP !== 'undefined') MP.pausedTick();
            this.draw();
            return;
        }

        this.accumulator += Math.min(realDt, 0.1);

        let steps = 0;
        while (this.accumulator >= FIXED_DT && steps < MAX_SUBSTEPS) {
            if (this.state === 'RACE') this.updateRace(FIXED_DT);
            this.accumulator -= FIXED_DT;
            steps++;
        }
        if (steps >= MAX_SUBSTEPS) this.accumulator = 0;

        if (this.screenShake > 0.1) this.screenShake *= 0.88;
        else this.screenShake = 0;

        // Dynamic engine audio follows the player's real RPM/throttle state.
        if (typeof SFX !== 'undefined') {
            SFX.updateEngine(this.playerCar, this.state === 'RACE' && !this.paused);
            SFX.updateMusic(this.state === 'RACE' && !this.paused, this.backgrounds[this.currentBackground], this.playerCar ? this.playerCar.name : '');
            // Music breathes with the run: a low-pass on the music bus opens
            // from muffled-idle to full-bandwidth as revs climb (menus stay
            // fully open). Cheap no-op when unchanged/muted.
            const pc = this.playerCar;
            const intensity = (this.state === 'RACE' && !this.paused && pc && pc.redline)
                ? Math.min(1, Math.max(0, pc.rpm / pc.redline)) : 0;
            SFX.updateMusicIntensity(intensity);
        }

        // Nitrous HUD (bottle gauge + button visibility).
        if (this.state === 'RACE') this._updateNosHud();
        // Refresh the guest's clock calibration during a live race. Runs off
        // the render loop (not the fixed step) so it keeps working while the
        // physics is paused, and is a no-op in every other state.
        if (typeof MP !== 'undefined') MP.maybeResyncClock();

        this.draw();
    },

    updateRace(dt) {
        if (this.raceMode === 'multiplayer') { this.updateMultiplayerRace(dt); return; }
        if (this.finished) return;

        const p = this.playerCar;
        const o = this.opponentCar;
        const frozen = this.raceState !== 'RUNNING';

        if (this.raceState === 'STAGING') {
            if (p.gas > 0.1) {
                this.raceState = 'COUNTDOWN';
                this.lights = 0;
                this.lightTimer = performance.now();
            }
        }

        if (this.raceState === 'COUNTDOWN') {
            const elapsed = (performance.now() - this.lightTimer) / 1000;
            const lit = Math.min(4, Math.floor(elapsed));
            if (lit !== this.lights && typeof SFX !== 'undefined') {
                if (lit >= 4) { SFX.go(); if (p.gas > 0.1) SFX.launch(); } else SFX.treeStep(lit);
            }
            this.lights = lit;
            o.clutch = 1; o.gear = 1;
            if (this._ai) {
                // Persona driver: revs toward a skill-scaled staging target,
                // with a live needle wobble — the same controller surface a
                // human uses (hold throttle at the line, launch off that rev).
                this._ai.staging(o, dt);
            } else {
                // Legacy scripted rev (ghost mode keeps its cinematic idle).
                o.gas = (Math.sin(performance.now() / 150) > 0) ? 1 : 0;
                o.rpm = 1000 + (o.redline - 1000) * 0.5 * (0.5 + 0.5 * Math.sin(performance.now() / 200));
            }

            // Green check FIRST: a throttled tab (mobile background GC) can
            // jump a frame straight past 4s — a car moving at that instant
            // already had its green and must launch, not eat a bogus red.
            if (elapsed >= 4) {
                this.raceState = 'RUNNING';
                this.raceStartTime = performance.now();
                this.raceTimer = 0;
                this.showNotification('GO!');
                this.lights = 4;
                // Ghost-capable runs record the player's position timeline.
                // v2: each sample carries its own raceTimer stamp — the SAME
                // clock _ghostSeek replays with — so recording and playback
                // can never drift apart.
                this._ghostSamples = (this.raceMode === 'quick' || this.raceMode === 'ghost')
                    ? [{ t: 0, x: 0 }] : null;
                this._ghostSampleAcc = 0;
                this._ghostCursor = 0;
                // Already holding throttle as the light drops is a launch —
                // record the reaction now (revving at the line never fires a
                // fresh gas event, which used to print "—" and leak the
                // 0.5s constructor default into the report).
                if (p.gas > 0.1 && !p.launched) {
                    p.launched = true;
                    p.reactionTime = 0;
                    p.reactionRecorded = 1;
                    const rd = document.getElementById('reaction-display');
                    if (rd) rd.innerText = 'RT: 0.000s';
                }
                // A driver already staged in 1st launches off whatever rev
                // the clutch-slip zone carried across the green — judged by
                // the SAME staged-rev rule as an N-dropper (judgeLaunch).
                if (p.gear === 1 && p.gas > 0.1) p.judgeLaunch();
            } else if (p.speed > 0.5) {
                // Left before the green — a red light. Drag-racing convention:
                // the reaction prints NEGATIVE (how early the leave was) and
                // the run is a disqualification, never a 999s "time".
                p.reactionTime = -Math.max(0.001, 4 - elapsed);
                p.reactionRecorded = 1;
                this.finishRace(false, 'FALSE START');
                return;
            }
        }

        if (this.raceState === 'RUNNING') {
            this.raceTimer = (performance.now() - this.raceStartTime) / 1000;
            this._updateHudTimer();

            if (AUTO_SHIFT_ENABLED) {
                if (p.gear === 0 && p.gas > 0.3 && p.clutch < 0.3) {
                    p.gear = 1;
                    // Auto N→1 at the line IS the launch — judged by the
                    // staged rev, never by a flat shift cut.
                    p.judgeLaunch();
                }
            }

            // Lazy launch judgment: staged in 1st but got on the gas after
            // the green — the first moment throttle bites at the line IS
            // the launch (rpm by then is whatever the slip zone held).
            if (!p._launchJudged && p.gear === 1 && p.gas > 0.1 && p.speed < 0.5) {
                p.judgeLaunch();
            }

            // Hard braking from speed screeches the tires (throttled in SFX).
            if (p.brake > 0 && p.speed > 8 && typeof SFX !== 'undefined') SFX.brake(p.speed);

            // Wheelspin off the line: full throttle while the car is still
            // barely moving. Capped so it only fires when it is genuinely
            // the rear stepping out, not on every stalled launch.
            if (p.gas > 0.5 && p.speed < 9 && p.gear >= 1 && typeof SFX !== 'undefined') {
                SFX.wheelspin(Math.min(1, p.gas * (1 - p.speed / 9)));
            }

            if (this._ai && this.raceMode !== 'ghost') {
                // Persona driver: reaction-gated launch, per-gear shift plan
                // with human flubs, NOS timing and a capped physics-layer
                // catch-up — see the AIDriver block near getQuickOpponent.
                this._ai.drive(o, p, dt, this);
            } else if (this.raceMode !== 'ghost') {
                // Legacy scripted driver — kept as a safety net for any code
                // path that races an AI without a persona plan attached.
                if (this.raceTimer > o.reactionTime && !o.launched) {
                    o.launched = true; o.clutch = 0; o.gas = 1; o.gear = 1;
                    o.judgeLaunch();   // same staged-rev launch rule as the player
                }
                if (o.launched) {
                    o.clutch = 0; o.gas = 1;
                    if (o.rpm > o.redline * (o.aiShiftPoint || 0.92) && o.gear < o.gearRatios.length - 1) o.shiftUp();
                    if (o.rpm > o.redline - 100) o.rpm = o.redline - 200;
                }
            }
            if (this.raceMode === 'ghost') {
                // The ghost is a REPLAY, not a simulation — its position is
                // read straight off the recorded timeline.
                this._ghostSeek(this.raceTimer);
                if (o.finished && !this.finished) {
                    // Photo finish: the ghost's crossing is detected by the
                    // seek BEFORE p.update can record my own crossing in the
                    // same frame gap (huge frames on a throttled tab), so a
                    // run that beat the ghost by less than one frame used to
                    // be stolen by check order. The lower ET owns the win.
                    const iWon = (p.finished && p.finishTime) ? p.finishTime <= o.finishTime : false;
                    this.finishRace(iWon);
                    return;
                }
            }
            if (p.finished && !this.finished) { this.finishRace(true); return; }
            if (o.finished && !this.finished) { this.finishRace(false); return; }
        }

        p.update(dt);
        if (this.raceMode !== 'ghost') o.update(dt);

        // Record the player's run for the ghost (10 Hz position samples,
        // stamped with the wall-clock race timer the replay seeks with).
        if (this._ghostSamples && !frozen) {
            this._ghostSampleAcc += dt;
            while (this._ghostSampleAcc >= GHOST_SAMPLE_DT) {
                this._ghostSampleAcc -= GHOST_SAMPLE_DT;
                if (this._ghostSamples.length < GHOST_MAX_POINTS) {
                    this._ghostSamples.push({ t: this.raceTimer, x: p.x });
                }
            }
        }

        if (frozen) {
            o.x = 0; o.speed = 0; o.squat = 0;
        }

        if (p.wheelSlip > 0.4 && p.speed < 25 && p.gas > 0.5) {
            this.createSmoke(p, p.speed < 5);
        }
        if (o.wheelSlip > 0.4 && o.speed < 25 && o.gas > 0.5) {
            this.createSmoke(o, o.speed < 5);
        }

        if (this.effects) this.effects.update(dt);
    },

    // ─── Multiplayer race loop ───────────────────────────────────────
    // Mirrors updateRace's state machine, but the opponent is a real
    // remote human (driven by network input) instead of scripted AI, and
    // the countdown is triggered by a synchronized host timestamp instead
    // of the local player's own throttle press.
    updateMultiplayerRace(dt) {
        if (this.finished) return;
        const p = this.playerCar, o = this.opponentCar;
        if (!p || !o) return;

        if (this.raceState === 'STAGING') {
            if (typeof MP !== 'undefined' && MP.countdownStart && performance.now() >= MP.countdownStart) {
                this.raceState = 'COUNTDOWN';
                this.lightTimer = MP.countdownStart;
                this.lights = 0;
            }
        }

        if (this.raceState === 'COUNTDOWN') {
            const elapsed = (performance.now() - this.lightTimer) / 1000;
            const lit = Math.min(4, Math.max(0, Math.floor(elapsed)));
            if (lit !== this.lights && typeof SFX !== 'undefined') {
                if (lit >= 4) { SFX.go(); if (p.gas > 0.1) SFX.launch(); } else SFX.treeStep(lit);
            }
            this.lights = lit;

            // Green check FIRST — same throttled-frame guard as the SP path:
            // once elapsed passes 4s the light IS green, so nobody can be
            // red-lit by a late frame any more.
            if (elapsed >= 4) {
                this.raceState = 'RUNNING';
                // The green light, on THIS side's clock. This is the single
                // reference point the host measures every rev timestamp
                // against, recorded from the real transition rather than
                // recomputed from the light duration — which would be a
                // second copy of that constant, free to drift out of step
                // with the race it is judging.
                MP.goAt = performance.now();
                this.raceStartTime = performance.now();
                this.raceTimer = 0;
                this.showNotification('GO!');
                this.lights = 4;
                // Held-throttle green-light launch (see SP path for rationale).
                if (p.gas > 0.1 && !p.launched) {
                    p.launched = true;
                    p.reactionTime = 0;
                    p.reactionRecorded = 1;
                    const rd = document.getElementById('reaction-display');
                    if (rd) rd.innerText = 'RT: 0.000s';
                }
            } else if (p.speed > 0.5 || o.speed > 0.5) {
                if (p.speed > 0.5) {
                    // Red light: print the reaction as NEGATIVE seconds.
                    p.reactionTime = -Math.max(0.001, 4 - elapsed);
                    p.reactionRecorded = 1;
                }
                this.finishMultiplayerRace({ falseStart: p.speed > 0.5 });
                return;
            }
        }

        if (this.raceState === 'RUNNING') {
            this.raceTimer = (performance.now() - this.raceStartTime) / 1000;
            this._updateHudTimer();
            if (p.finished || o.finished) {
                this.finishMultiplayerRace({ falseStart: false, localFinishTime: p.finished ? p.finishTime : 999 });
                return;
            }
        }

        p.update(dt);
        o.update(dt);

        if (p.wheelSlip > 0.4 && p.speed < 25 && p.gas > 0.5) this.createSmoke(p, p.speed < 5);
        if (o.wheelSlip > 0.4 && o.speed < 25 && o.gas > 0.5) this.createSmoke(o, o.speed < 5);
        if (this.effects) this.effects.update(dt);

        if (typeof MP !== 'undefined') MP.tick();
    },

    finishMultiplayerRace(localReport) {
        if (this.finished) return;
        this.finished = true;
        this.raceState = 'FINISHED';
        const p = this.playerCar, o = this.opponentCar;
        p.brake = 1; p.gas = 0;
        if (o) o.gas = 0;

        // Normalize the time key once: callers pass localFinishTime (the car
        // may not have finished), everything downstream — outcome exchange,
        // winner comparison, results screen — expects .finishTime.
        localReport.finishTime = localReport.finishTime ?? localReport.localFinishTime ?? 999;

        if (typeof MP === 'undefined') { this._applyMultiplayerOutcome(localReport, { falseStart: false, finishTime: 999 }); return; }

        if (localReport.forfeit || !MP._connected) {
            // Peer is gone — nothing to negotiate. Remaining player gets the win.
            this._applyMultiplayerOutcome(localReport, { falseStart: false, finishTime: 999 }, 'OPPONENT LEFT');
            return;
        }

        // Fallback used ONLY if no authoritative verdict comes back in time
        // (host vanished mid-outcome). It must NOT convict the peer: judging
        // them from a throttled, possibly stale LOCAL REPLICA of their speed
        // was exactly how the two clients ended up disagreeing — one saw
        // "false start", the other saw a legal race. With no ruling in hand,
        // "no false start" is the only claim we can actually support.
        const fallbackRemote = {
            falseStart: false,
            finishTime: o && o.finished ? o.finishTime : 999,
        };
        MP.reportOutcome(localReport, fallbackRemote, (remote) => this._applyMultiplayerOutcome(localReport, remote));
    },

    _applyMultiplayerOutcome(local, remote, titleOverride) {
        const p = this.playerCar;
        // Capture trap speed NOW — this runs synchronously at the finish, while
        // the results screen renders ~400ms later after the car has been braking.
        const trapSpeed = p.trapSpeed || p.speed;

        // The host's ruling supersedes this client's opinion of ITSELF. The
        // local claim below is only trusted while no verdict exists (offline
        // result, or the host never answered) — otherwise both sides would be
        // judging the same launch from two different local clocks, which is the
        // disagreement the host-authoritative verdict exists to prevent.
        let myFalseStart = !!local.falseStart;
        if (typeof MP !== 'undefined' && MP.localFalseStart !== null && MP.localFalseStart !== undefined) {
            myFalseStart = !!MP.localFalseStart;
        }
        remote = remote || { falseStart: false, finishTime: 999 };

        let title, prize;
        if (myFalseStart && remote.falseStart) { title = 'BOTH FALSE STARTED'; prize = 0; }
        else if (myFalseStart) { title = 'FALSE START'; prize = 0; }
        else if (remote.falseStart) { title = 'OPPONENT FALSE STARTED'; prize = MP_FALSE_START_BONUS; }
        else if ((local.finishTime ?? 999) <= (remote.finishTime ?? 999)) { title = 'VICTORY'; prize = MP_WIN_PRIZE; }
        else { title = 'DEFEAT'; prize = MP_LOSS_PRIZE; }
        // Forfeit wins recompute the prize through the normal comparison above;
        // only the headline changes so the player knows why they won.
        if (titleOverride && prize > 0) title = titleOverride;

        // ── Best-of-3 tournament (MP) ── heats pay per race; taking the
        // series (first to 2 heat wins) pays the champion bonus. A double
        // false-start VOIDs the heat — nobody's tally moves, run it back.
        let seriesInfo = null, seriesLine = '';
        const isTour = this.raceMode === 'multiplayer' && typeof MP !== 'undefined' && MP.mpFormat === 'tournament';
        if (isTour) {
            const heatResult = title === 'BOTH FALSE STARTED' ? 'void'
                : (title === 'VICTORY' || title === 'OPPONENT LEFT' || title === 'OPPONENT FALSE STARTED') ? 'won' : 'lost';
            seriesInfo = MP.noteHeatOutcome(heatResult);
            if (heatResult !== 'void') prize = heatResult === 'won' ? MP_TOURNEY_HEAT_WIN : MP_TOURNEY_HEAT_LOSS;
            if (seriesInfo) {
                if (seriesInfo.done) {
                    const iWon = seriesInfo.myWins > seriesInfo.theirWins;
                    prize += iWon ? MP_TOURNEY_BONUS : MP_TOURNEY_RUNNER_BONUS;
                    seriesLine = (iWon ? 'YOU TAKE THE SERIES ' : 'OPPONENT TAKES THE SERIES ') + seriesInfo.myWins + '\u2013' + seriesInfo.theirWins;
                } else {
                    seriesLine = 'SERIES ' + seriesInfo.myWins + '\u2013' + seriesInfo.theirWins + ' \u00B7 HEAT ' + seriesInfo.heat + ' NEXT';
                }
            }
        }

        // Persistent P2P record. False-start races count toward races played,
        // but only legitimate finishes set the best ET.
        const s = this.mpStats;
        s.races++;
        if (title === 'VICTORY' || title === 'OPPONENT LEFT' || title === 'OPPONENT FALSE STARTED') s.wins++;
        else if (title === 'DEFEAT' || title === 'FALSE START') s.losses++;
        const legitFinish = !local.falseStart && (local.finishTime ?? 999) < 999;
        const prevBest = s.bestET;
        if (legitFinish && (!s.bestET || local.finishTime < s.bestET)) s.bestET = local.finishTime;
        const isRecord = legitFinish && (!prevBest || local.finishTime < prevBest);

        // Mirror the record into the driver profile (identity layer) — the
        // profile panel, the cloud mirror and the peer-facing share all read
        // it from there.
        if (typeof Profile !== 'undefined' && Profile.recordMpResult) Profile.recordMpResult(s);

        // Career ledger — P2P finish. False-start races count as races
        // played (mirroring mpStats above); only legit finishes carry an ET.
        if (typeof Career !== 'undefined' && Career.recordMp) {
            const mpGap = (legitFinish && (remote.finishTime ?? 999) < 999)
                ? +(local.finishTime - remote.finishTime).toFixed(3) : null;
            Career.recordMp({
                won: (title === 'VICTORY' || title === 'OPPONENT LEFT' || title === 'OPPONENT FALSE STARTED'),
                et: legitFinish ? local.finishTime : 0,
                falseStart: myFalseStart,
                opp: (typeof MP !== 'undefined' && MP.remoteProfile && MP.remoteProfile.name) ? String(MP.remoteProfile.name).slice(0, 18) : null,
                gap: mpGap, cash: prize || 0
            });
        }

        // Friends presence memory — remember when you last raced this driver.
        if (typeof Friends !== 'undefined' && Friends.touchLastRaced &&
            typeof MP !== 'undefined' && MP.remoteProfile && MP.remoteProfile.id) {
            Friends.touchLastRaced(Friends.normalizeCode(MP.remoteProfile.id));
        }

        this.awardCash(prize, 'mp-result');
        this.scheduleSave();

        setTimeout(() => {
            this.state = 'RESULTS';
            document.getElementById('ui-layer').classList.add('hidden');
            document.getElementById('pause-btn').classList.add('hidden');
            document.getElementById('results-menu').classList.remove('hidden');
            const titleEl = document.getElementById('result-title');
            titleEl.innerText = title;
            // Color follows the OUTCOME, not the payout — a consolation-prize
            // DEFEAT used to glow green like a win.
            titleEl.style.color = (title === 'BOTH FALSE STARTED') ? '#ff9800'
                : (title === 'VICTORY' || title === 'OPPONENT LEFT' || title === 'OPPONENT FALSE STARTED') ? '#4caf50' : '#f44336';
            // Winner identity card — hidden only when nobody won (both DQ'd).
            this._renderWinnerCard(
                (title === 'VICTORY' || title === 'OPPONENT LEFT' || title === 'OPPONENT FALSE STARTED') ? true :
                (title === 'DEFEAT') ? false : null);
            const ft = local.finishTime;
            const localFs = !!local.falseStart;
            // A red light is a DISQUALIFICATION — the timeslip prints DQ, a
            // red NEGATIVE reaction, and no trap speed. Never a fake 999 ET.
            document.getElementById('result-time').innerText = localFs ? 'DQ'
                : ((!ft || ft >= 999) ? '\u2014' : ft.toFixed(3) + 's');
            const rEl = document.getElementById('result-reaction');
            if (localFs && p.reactionTime < 0) {
                rEl.innerText = p.reactionTime.toFixed(3) + 's';
                rEl.classList.add('results-value-red');
            } else {
                rEl.innerText = (!p.reactionRecorded || p.reactionTime > 10) ? '\u2014' : p.reactionTime.toFixed(3) + 's';
                rEl.classList.remove('results-value-red');
            }
            document.getElementById('result-trap').innerText = localFs ? '\u2014' : Math.round(trapSpeed * MPS_TO_MPH) + ' mph';
            const prizeEl = document.getElementById('result-prize');
            prizeEl.innerText = '$' + prize;
            prizeEl.style.color = prize > 0 ? '#4caf50' : '#888888';
            if (typeof SFX !== 'undefined') {
                SFX.finish(title === 'VICTORY' || title === 'OPPONENT LEFT' || title === 'OPPONENT FALSE STARTED');
                if (prize > 0) setTimeout(() => SFX.cash(), 700);
            }
            const rec = document.getElementById('result-record');
            if (rec) rec.classList.toggle('hidden', !isRecord);
            const ghostChip = document.getElementById('result-ghost-badge');
            if (ghostChip) ghostChip.classList.add('hidden');
            // MP tournament series standing (hidden everywhere else).
            const seriesEl = document.getElementById('result-series');
            if (seriesEl) {
                seriesEl.innerText = seriesLine;
                seriesEl.classList.toggle('hidden', !seriesLine);
                seriesEl.classList.toggle('result-series-win', !!(seriesInfo && seriesInfo.done && seriesInfo.myWins > seriesInfo.theirWins));
                seriesEl.classList.toggle('result-series-loss', !!(seriesInfo && seriesInfo.done && seriesInfo.theirWins > seriesInfo.myWins));
            }
            // MP extras: opponent's ET (when known) and the rematch offer.
            const oppRow = document.getElementById('result-opp-row');
            const oppLabel = document.getElementById('result-opp-label');
            const oppEl = document.getElementById('result-opp-time');
            if (oppRow && oppEl) {
                const ot = remote.finishTime;
                const show = this.raceMode === 'multiplayer' && typeof ot === 'number' && ot < 999;
                oppRow.classList.toggle('hidden', !show);
                oppRow.classList.remove('results-row-ghost');
                if (show) {
                    if (oppLabel) oppLabel.innerText = 'Opponent ET:';
                    oppEl.innerText = ot.toFixed(3) + 's';
                }
            }
            const rematchBtn = document.getElementById('result-rematch-btn');
            if (rematchBtn) {
                const live = this.raceMode === 'multiplayer' && typeof MP !== 'undefined' && MP._connected;
                rematchBtn.classList.toggle('hidden', !live);
                if (live) rematchBtn.innerText = isTour ? ((seriesInfo && seriesInfo.done) ? 'NEW SERIES' : 'NEXT HEAT') : 'REMATCH';
            }
            // The ghost-again offer never shows in multiplayer results.
            const ghostAgain = document.getElementById('result-ghost-again-btn');
            if (ghostAgain) ghostAgain.classList.add('hidden');
        }, 400);
    },

    // Offer a rematch over the still-open peer connection. Both sides land
    // back in the ready-up lobby; the normal READY UP handshake re-launches
    // the race — no re-hosting, no new code.
    rematch() {
        // Quick race: one tap back onto the line. restartRace() re-runs
        // startRaceMode('quick'), which re-rolls getQuickOpponent() — a FRESH
        // opponent from the current curve (rubber-band + persona intact),
        // not a frozen replay of the car you just raced.
        if (this.raceMode === 'quick') {
            if (typeof SFX !== 'undefined' && SFX.click) SFX.click();
            this.restartRace();
            return;
        }
        if (this.raceMode !== 'multiplayer' || typeof MP === 'undefined' || !MP._connected) {
            this.returnToMenu();
            return;
        }
        MP.beginRematch();
    },

    // Results-screen one-tap rematch against your own best run.
    raceGhostAgain() {
        if (!this.ghostRun) {
            // The ghost was rejected by the sanitizer on load — never strand
            // the player on a dead button.
            this.showNotification('NO GHOST — FINISH A QUICK RACE FIRST');
            this.returnToMenu();
            return;
        }
        this.startRaceMode('ghost');
    },

    // ── Winner card (results header) ─────────────────────────────────
    // Identity of whoever took the win: avatar (a real image for human
    // opponents, an initial tile for bots), driver name, car name and the
    // winning car's paint. Pass null to hide (double false start = nobody).
    _renderWinnerCard(playerWon) {
        const block = document.getElementById('result-winner');
        if (!block) return;
        if (playerWon !== true && playerWon !== false) {
            block.classList.add('hidden');
            return;
        }
        const car = playerWon ? this.playerCar : this.opponentCar;
        let name, av = null;
        if (playerWon) {
            if (typeof Profile !== 'undefined' && Profile.data) {
                name = Profile.name();
                av = Profile.data.av || null;
            } else {
                name = this.playerCar.name;
            }
        } else if (this.raceMode === 'multiplayer' && typeof MP !== 'undefined' && MP.remoteProfile) {
            name = MP.remoteProfile.name || car.name;
            av = MP.remoteProfile.av || null;
        } else {
            name = car.name;
        }
        const avEl = document.getElementById('result-winner-av');
        const nmEl = document.getElementById('result-winner-name');
        const carEl = document.getElementById('result-winner-carname');
        const chipEl = document.getElementById('result-winner-chip');
        const textEl = document.getElementById('result-winner-text');
        if (typeof Profile !== 'undefined' && Profile.renderAvatar && avEl) {
            Profile.renderAvatar(avEl, { name, av }, playerWon ? '#ff9800' : (car.color || '#37474f'));
        }
        if (nmEl) nmEl.textContent = String(name || '—').toUpperCase();
        if (carEl) carEl.textContent = String(car.name || '').toUpperCase();
        if (chipEl) chipEl.style.background = car.color || '#888888';
        // Hardware chips (TURBO/NOS stages) — same visual language as the
        // MP lobby badges, so the results screen also reads "what won".
        // Ghost/old saves without the fields simply show no row.
        if (textEl) {
            let row = textEl.querySelector('.mp-upg-row');
            const t = Math.max(0, Math.min(3, (car.upgrades && car.upgrades.turbo) | 0));
            const n = Math.max(0, Math.min(3, (car.upgrades && car.upgrades.nos) | 0));
            if (!t && !n) {
                if (row) row.remove();
            } else {
                if (!row) {
                    row = document.createElement('span');
                    row.className = 'mp-upg-row result-upg-row';
                    textEl.appendChild(row);
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
            }
        }
        block.classList.remove('hidden');
    },

    finishRace(won, reason) {
        if (this.finished) return;
        this.finished = true;
        this.raceState = 'FINISHED';

        const p = this.playerCar, o = this.opponentCar;
        // Capture trap speed BEFORE stopping the car — on a loss you never
        // crossed the line (so p.trapSpeed is unset), and the old code read
        // p.speed after zeroing it, which always printed "0 mph".
        const trapSpeed = p.trapSpeed || p.speed;
        p.speed = 0; p.gas = 0; p.brake = 1;
        o.speed = 0; o.gas = 0;

        let playerTime, reactionTime, prize = 0, careerChampion = false;
        if (reason === 'FALSE START') {
            playerTime = 999; reactionTime = 999; prize = 0;
        } else {
            // A valid ET exists ONLY if you actually crossed the line this
            // run. Losing races end the instant the OPPONENT crosses — the
            // old `p.finishTime || raceTimer` fallback printed the winner's
            // time as "your ET" on every loss, poisoning bestET and even
            // granting bogus "NEW RECORD" badges.
            playerTime = (p.finished && p.finishTime) ? p.finishTime : 0;
            // Only a RECORDED reaction may leave the car — the constructor's
            // 0.5s placeholder used to leak into the report as a fake RT.
            reactionTime = p.reactionRecorded ? (p.reactionTime || 0) : 0;
            if (won) {
                if (this.raceMode === 'ghost') {
                    // Beating yourself: a small flat payout, career stats untouched.
                    prize = GHOST_WIN_PRIZE;
                } else if (this.raceMode === 'quick') {
                    prize = 250 + Math.floor(Math.random() * 150);
                    this.quickStats.races++;
                    this.quickStats.wins++;
                    // Streak rubber-band memory (dynamic difficulty).
                    this.quickStats.streak = (this.quickStats.streak | 0) > 0 ? this.quickStats.streak + 1 : 1;
                } else if (this.tournamentRound >= 3) {
                    prize = this.activeTournamentTier?.prize || 5000;
                    careerChampion = true; // final heat taken — the run is complete
                    this.tournamentRound = 1;
                } else {
                    prize = 0;
                    this.tournamentRound++;
                }
            } else {
                if (this.raceMode === 'ghost') {
                    prize = 0;
                } else {
                    prize = this.raceMode === 'quick' ? 50 : 0;
                    if (this.raceMode === 'quick') {
                        this.quickStats.races++;
                        // Streak rubber-band memory (dynamic difficulty).
                        this.quickStats.streak = (this.quickStats.streak | 0) < 0 ? this.quickStats.streak - 1 : -1;
                    }
                    // A tournament loss ends the run. A new entry always starts at Heat 1.
                    if (this.raceMode === 'tournament') this.tournamentRound = 1;
                }
            }
        }

        const prevBest = this.bestET;
        // A FALSE START leaves with the 999 sentinel (the report prints it as
        // DQ). Recording must honor that too: 999 is never a real ET, so it
        // can't become the personal best, a record badge, or a ghost seed.
        const legitTime = reason !== 'FALSE START' && playerTime > 0;
        if (legitTime && (!this.bestET || playerTime < this.bestET)) this.bestET = playerTime;
        const isRecord = legitTime && (!prevBest || playerTime < prevBest);
        // A new personal best in a ghost-capable mode becomes the new ghost.
        // Seed rule: a pre-existing bestET (recorded before ghosts existed,
        // or carried from an old save) seeds the ghost on the next legit
        // finish so the feature is never stuck behind an unbeaten record.
        const seedGhost = legitTime && !this.ghostRun &&
            (this.raceMode === 'quick' || this.raceMode === 'ghost');
        if ((isRecord || seedGhost) && this._ghostSamples && this._ghostSamples.length) {
            this._commitGhostRun(playerTime);
        }
        this.awardCash(prize, 'sp-result');
        this.raceResults = {
            playerTime, playerReaction: reactionTime, won,
            opponentName: o.name, trapSpeed, reason
        };

        if (this.raceMode === 'quick') this._pendingRotation = true;
        // Career ledger — single-player finish (quick/tournament/ghost).
        // A false start never reached the line: ET 0, loss counted.
        if (typeof Career !== 'undefined' && Career.recordRace) {
            // Ledger extras for the career panel: rival name/persona, the
            // signed ET margin (only when BOTH cars crossed the line) and
            // the prize actually paid — the ledger row is a race RECEIPT.
            // Persona tier is quick-only: _oppPersona is stale in every
            // other mode and must never label a tournament or ghost run.
            // Ghost rivals carry their FULL recorded ET (it's a replay, not
            // a simulation that ends early) — so a ghost WIN gets an honest
            // margin too. Quick/tournament rivals only have a time when they
            // actually crossed (the race ends on the first crossing), and a
            // missing rival time means NO gap — never a guessed one.
            const ghostEt = (this.raceMode === 'ghost' && this.ghostRun && typeof this.ghostRun.et === 'number' && this.ghostRun.et < 999)
                ? this.ghostRun.et : null;
            const rivalEt = (o && typeof o.finishTime === 'number' && o.finishTime < 999) ? o.finishTime : ghostEt;
            const oppGap = (legitTime && rivalEt !== null)
                ? +(playerTime - rivalEt).toFixed(3) : null;
            Career.recordRace({ won, et: legitTime ? playerTime : 0, mode: this.raceMode, champion: careerChampion, falseStart: reason === 'FALSE START',
                opp: (o && o.name) || null, tier: this.raceMode === 'quick' ? (this._oppPersona || null) : null, gap: oppGap, cash: prize || 0 });
        }
        this.scheduleSave();

        setTimeout(() => {
            this.state = 'RESULTS';
            document.getElementById('ui-layer').classList.add('hidden');
            document.getElementById('pause-btn').classList.add('hidden');
            document.getElementById('results-menu').classList.remove('hidden');
            const title = document.getElementById('result-title');
            title.innerText = reason || (won ? 'VICTORY' : 'DEFEAT');
            title.style.color = won ? '#4caf50' : '#f44336';
            // Outcome aura: a soft halo under the headline so the verdict
            // reads at a glance even on small screens (CSS classes, purely
            // decorative — colors themselves stay the dev-owned constants).
            title.classList.toggle('outcome-win', !!won);
            title.classList.toggle('outcome-loss', !won);
            const falseStart = reason === 'FALSE START';
            // A false start hands the win to the opponent — the card shows
            // whoever actually took the win (you, or the other lane).
            this._renderWinnerCard(!!won);
            // Red light = DISQUALIFIED: ET prints DQ, reaction prints as a red
            // NEGATIVE (how early the leave was), trap speed is meaningless.
            // A loss where you never crossed prints NO time at all — the old
            // code printed the opponent's finish time as yours.
            document.getElementById('result-time').innerText = falseStart ? 'DQ'
                : (playerTime > 0 ? playerTime.toFixed(3) + 's' : '\u2014');
            const rEl = document.getElementById('result-reaction');
            if (falseStart && p.reactionTime < 0) {
                rEl.innerText = p.reactionTime.toFixed(3) + 's';
                rEl.classList.add('results-value-red');
            } else {
                rEl.innerText = (reactionTime > 10.0 || !p.reactionRecorded) ? '\u2014' : reactionTime.toFixed(3) + 's';
                rEl.classList.remove('results-value-red');
            }
            document.getElementById('result-trap').innerText = (falseStart || playerTime <= 0) ? '\u2014'
                : Math.round(trapSpeed * MPS_TO_MPH) + ' mph';
            // Prize ticks up instead of popping in — same arcade cadence
            // as the cash box. Reduced-motion readers get the final value
            // immediately, exactly like every other animated flourish here.
            const prizeEl = document.getElementById('result-prize');
            const reduceMotion = (typeof matchMedia === 'function') && matchMedia('(prefers-reduced-motion: reduce)').matches;
            if (prizeEl) {
                prizeEl.classList.remove('prize-paid');
                if (prize > 0 && !reduceMotion) {
                    const t0 = performance.now(), dur = 550;
                    const tick = (t) => {
                        const k = Math.min(1, (t - t0) / dur);
                        const eased = 1 - Math.pow(1 - k, 3);   // ease-out cubic
                        prizeEl.innerText = '$' + Math.round(prize * eased);
                        if (k < 1) requestAnimationFrame(tick);
                        else prizeEl.classList.add('prize-paid');
                    };
                    requestAnimationFrame(tick);
                } else {
                    prizeEl.innerText = '$' + prize;
                    if (prize > 0) prizeEl.classList.add('prize-paid');
                }
            }
            if (typeof SFX !== 'undefined') {
                SFX.finish(!!won && !falseStart);
                if (prize > 0) setTimeout(() => SFX.cash(), 700);
            }
            const rec = document.getElementById('result-record');
            if (rec) rec.classList.toggle('hidden', !isRecord);
            // Ghost verdict chip (pre-existing markup, now actually wired):
            // a real replay race is either a NEW GHOST RECORD (you beat the
            // replay — gold) or a plain GHOST RUN (the replay held you off).
            // Tournament/quick/DQ paths never show it.
            const ghostChip = document.getElementById('result-ghost-badge');
            if (ghostChip) {
                const showGhost = this.raceMode === 'ghost' && this.ghostRun && legitTime;
                ghostChip.classList.toggle('hidden', !showGhost);
                if (showGhost) {
                    const beatGhost = playerTime < this.ghostRun.et;
                    ghostChip.innerText = beatGhost ? '\u2605 NEW GHOST RECORD' : 'GHOST RUN';
                    ghostChip.classList.toggle('results-ghost-record', beatGhost);
                }
            }
            // MP tournament series standing (hidden everywhere else).
            const seriesEl = document.getElementById('result-series');
            if (seriesEl) seriesEl.classList.add('hidden');
            // Opponent-ET row doubles as the GHOST ET row in ghost races;
            // every other single-player mode keeps it hidden.
            const oppRow = document.getElementById('result-opp-row');
            const oppLabel = document.getElementById('result-opp-label');
            const oppEl = document.getElementById('result-opp-time');
            if (oppRow && oppEl) {
                // Ghost races replay the recorded run; QUICK races now show
                // the rival's real timeslip too (Car.update stamps finishTime
                // for AI opponents). Losses print the time that beat you;
                // wins keep the row hidden unless the rival also crossed —
                // a blank rival ET must never imply a margin that is guessed.
                const oppLegit = o && o.finished && o.finishTime > 0;
                const showGhost = this.raceMode === 'ghost' && this.ghostRun;
                const showQuick = this.raceMode === 'quick' && oppLegit;
                oppRow.classList.toggle('hidden', !showGhost && !showQuick);
                oppRow.classList.toggle('results-row-ghost', !!showGhost);
                if (showGhost) {
                    if (oppLabel) oppLabel.innerText = 'Ghost ET:';
                    oppEl.innerText = this.ghostRun.et.toFixed(3) + 's';
                } else if (showQuick) {
                    if (oppLabel) oppLabel.innerText = 'Opponent ET:';
                    oppEl.innerText = o.finishTime.toFixed(3) + 's';
                }
            }
            // RACE AGAIN: quick races get the one-tap loop — the button
            // re-rolls a fresh opponent from the same difficulty curve.
            // MP keeps its own REMATCH offer (game.rematch() routes by mode).
            const rematchBtn = document.getElementById('result-rematch-btn');
            if (rematchBtn) {
                const quickAgain = this.raceMode === 'quick';
                rematchBtn.classList.toggle('hidden', !quickAgain);
                rematchBtn.innerText = quickAgain ? 'RACE AGAIN' : 'REMATCH';
            }
            const ghostAgain = document.getElementById('result-ghost-again-btn');
            if (ghostAgain) ghostAgain.classList.toggle('hidden', this.raceMode !== 'ghost');
        }, 500);
    },

    draw() {
        const { W, H } = this.viewSize();
        const ctx = this.ctx;
        ctx.save();
        if (this.screenShake > 0.1) {
            ctx.translate((Math.random() - 0.5) * this.screenShake, (Math.random() - 0.5) * this.screenShake);
        }
        if (this.state !== 'RACE') {
            Renderer.drawGarageBg(ctx, W, H, this.menuState, this.previewCar, this.playerCar);
        } else {
            Renderer.drawRaceScene(ctx, W, H, this.playerCar, this.opponentCar, this.effects, this.screenShake, this.raceDistance, this.METERS_TO_PX, this.raceState, this.lights, this._isMobile);
        }
        ctx.restore();
    },

    /* ── Background layer cache ──────────────────────────────────────────
       Every sky/roof layer used to be repainted from scratch EVERY FRAME:
       hundreds of fillRects, per-window style switches and per-frame
       gradients measured at ~2000 canvas ops on a race frame — the single
       largest main-thread cost in the game. The painters are deterministic
       per (background, viewport), so each parallax layer is now painted
       ONCE into a repeating band canvas (exactly one wrap period — the
       painter's own modulo width) and stamped twice per frame. The band
       stores elements at their RAW positions (no camX, no half-pad shift);
       the runtime offset -halfPad - (camX*factor mod bandW) reproduces the
       original modulo math pixel-for-pixel. Static layers (sky, stars,
       moons) live on one full-screen canvas. Rebuilt only on resize or
       background change. Quality-neutral: identical output in High and
       Low FX, both get the win. */
    _bgKey: null,
    _bgStatic: null,
    _bgBands: null,
    _bgSun: null,

    _bgCtx(w, h) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const c = document.createElement('canvas');
        c.width = Math.ceil(w * dpr);
        c.height = Math.ceil(h * dpr);
        const bctx = c.getContext('2d');
        bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        return { c, bctx };
    },

    _bgBuild(id, W, H) {
        const bands = [];
        const band = (bandW, factor, halfPad, paint) => {
            const b = this._bgCtx(bandW, H);
            paint(b.bctx);
            bands.push({ canvas: b.c, factor, halfPad, bandW });
        };
        const S = this._bgCtx(W, H), sky = S.bctx;
        let sun = null;

        if (id === 'night_city') {
            this._fillSky(sky, W, H, '#021a35', '#0a2a50', '#0d47a1');
            sky.fillStyle = '#fff';
            for (let i = 0; i < 40; i++) {
                const sx = (i * 137.5) % W;
                const sy = (i * 67.3) % (H * 0.4);
                const size = (i % 3 === 0) ? 2 : 1;
                sky.globalAlpha = 0.3 + Math.abs(Math.sin(i)) * 0.5;
                sky.fillRect(sx, sy, size, size);
            }
            sky.globalAlpha = 1;
            band(W + 200, 0.08, 100, (g) => {
                const base = H * 0.72;
                g.fillStyle = '#050a14';
                for (let i = 0; i < Math.floor(W / 45) + 4; i++) {
                    const seed = i * 137.5;
                    const h = 60 + Math.abs(Math.sin(seed)) * 90 + Math.abs(Math.cos(seed * 0.7)) * 40;
                    const bx = i * 45;
                    g.fillRect(bx, base - h, 40, h);
                    for (let wy = 0; wy < Math.floor(h / 22); wy++) {
                        for (let wx = 0; wx < 2; wx++) {
                            g.fillStyle = Math.abs(Math.sin(seed + wy * 31 + wx * 17)) > 0.55 ? '#1a2a4a' : '#0a1525';
                            g.fillRect(bx + 8 + wx * 16, base - h + 12 + wy * 22, 8, 10);
                        }
                    }
                    g.fillStyle = '#050a14';
                }
            });
        } else if (id === 'sunset_highway') {
            this._fillSky(sky, W, H, '#2b1055', '#c96e4a', '#f7b267');
            // The moving sun glow: a radial gradient already fully
            // transparent at r=90 — cached once as a 200x200 sprite.
            const sunC = this._bgCtx(200, 200);
            const sg = sunC.bctx.createRadialGradient(100, 100, 5, 100, 100, 90);
            sg.addColorStop(0, '#fff2a8');
            sg.addColorStop(0.4, '#ffb347');
            sg.addColorStop(1, 'rgba(255,100,50,0)');
            sunC.bctx.fillStyle = sg;
            sunC.bctx.fillRect(0, 0, 200, 200);
            sun = sunC.c;
            band(W + 300, 0.05, 150, (g) => {
                g.fillStyle = '#1a0a2a';
                for (let i = 0; i < Math.floor(W / 80) + 3; i++) {
                    const seed = i * 91.3;
                    const h = 40 + Math.abs(Math.sin(seed)) * 40;
                    const bx = i * 80;
                    g.beginPath();
                    g.moveTo(bx, H * 0.72);
                    g.lineTo(bx + 40, H * 0.72 - h);
                    g.lineTo(bx + 80, H * 0.72);
                    g.closePath();
                    g.fill();
                }
            });
            band(W + 400, 0.12, 200, (g) => {
                const baseY = H * 0.72;
                g.fillStyle = '#0d0418';
                for (let i = 0; i < Math.floor(W / 180) + 2; i++) {
                    const px = i * 180 + 50;
                    g.fillRect(px, baseY - 70, 4, 70);
                    for (let a = 0; a < 5; a++) {
                        const angle = -Math.PI / 2 + (a - 2) * 0.5;
                        g.save();
                        g.translate(px + 2, baseY - 70);
                        g.rotate(angle);
                        g.fillRect(0, -18, 3, 18);
                        g.restore();
                    }
                }
            });
        } else if (id === 'industrial') {
            this._fillSky(sky, W, H, '#1a1005', '#2a1a08', '#3a2a10');
            sky.fillStyle = '#e8d8a0';
            sky.beginPath(); sky.arc(W * 0.15, H * 0.18, 22, 0, Math.PI * 2); sky.fill();
            sky.fillStyle = '#1a1005';
            sky.beginPath(); sky.arc(W * 0.17, H * 0.16, 18, 0, Math.PI * 2); sky.fill();
            band(W + 300, 0.06, 150, (g) => {
                const base = H * 0.72;
                for (let i = 0; i < Math.floor(W / 100) + 3; i++) {
                    const seed = i * 53.7;
                    const bx = i * 100;
                    const w = 60 + Math.abs(Math.sin(seed)) * 40;
                    const h = 80 + Math.abs(Math.cos(seed)) * 60;
                    g.fillStyle = '#0a0500';
                    g.fillRect(bx, base - h, w, h);
                    for (let s = 0; s < 2; s++) {
                        const sx = bx + 10 + s * (w - 30);
                        g.fillRect(sx, base - h - 40, 8, 40);
                        g.fillStyle = 'rgba(80,70,60,0.3)';
                        for (let p = 0; p < 3; p++) {
                            g.beginPath();
                            g.arc(sx + 4 + p * 5, base - h - 45 - p * 12, 8 + p * 3, 0, Math.PI * 2);
                            g.fill();
                        }
                        g.fillStyle = '#0a0500';
                    }
                    for (let wy = 0; wy < 3; wy++) {
                        for (let wx = 0; wx < Math.floor(w / 20); wx++) {
                            if (Math.abs(Math.sin(seed + wy * 13 + wx * 7)) > 0.5) {
                                g.fillStyle = '#c9a050';
                                g.fillRect(bx + 8 + wx * 20, base - h + 15 + wy * 25, 8, 12);
                                g.fillStyle = '#0a0500';
                            }
                        }
                    }
                }
            });
        } else if (id === 'mountain_dusk') {
            this._fillSky(sky, W, H, '#0a0520', '#2a1a4a', '#6a3a7a');
            sky.fillStyle = '#fff';
            for (let i = 0; i < 30; i++) {
                const sx = (i * 173.3) % W;
                const sy = (i * 47.1) % (H * 0.35);
                sky.globalAlpha = 0.4 + Math.abs(Math.sin(i * 1.3)) * 0.4;
                sky.fillRect(sx, sy, 2, 2);
            }
            sky.globalAlpha = 1;
            band(W + 400, 0.04, 200, (g) => {
                const baseY = H * 0.72;
                g.fillStyle = '#2a1a3a';
                for (let i = 0; i < Math.floor(W / 120) + 3; i++) {
                    const seed = i * 71.1;
                    const bx = i * 120;
                    g.beginPath();
                    g.moveTo(bx - 40, baseY);
                    g.lineTo(bx, baseY - 70 - Math.abs(Math.sin(seed)) * 50);
                    g.lineTo(bx + 40, baseY - 30 - Math.abs(Math.cos(seed)) * 30);
                    g.lineTo(bx + 80, baseY);
                    g.closePath();
                    g.fill();
                }
            });
            band(W + 400, 0.07, 200, (g) => {
                const baseY = H * 0.72 - 18;
                g.fillStyle = '#0f0520';
                for (let i = 0; i < Math.floor(W / 120) + 3; i++) {
                    const seed = i * 71.1 + 100;
                    const bx = i * 120;
                    g.beginPath();
                    g.moveTo(bx - 40, baseY);
                    g.lineTo(bx, baseY - 70 - Math.abs(Math.sin(seed)) * 50);
                    g.lineTo(bx + 40, baseY - 30 - Math.abs(Math.cos(seed)) * 30);
                    g.lineTo(bx + 80, baseY);
                    g.closePath();
                    g.fill();
                }
            });
        } else { /* neon_tokyo */
            this._fillSky(sky, W, H, '#05000d', '#12002a', '#1e003a');
            band(W + 300, 0.09, 150, (g) => {
                const base = H * 0.72;
                const neonColors = ['#c9407a', '#5fa8b8', '#b8923a', '#5ca87a'];
                for (let i = 0; i < Math.floor(W / 65) + 3; i++) {
                    const seed = i * 189.7;
                    const h = 55 + Math.abs(Math.sin(seed)) * 80;
                    const bx = i * 65;
                    g.fillStyle = '#08001a';
                    g.fillRect(bx, base - h, 55, h);
                    for (let ny = 0; ny < Math.floor(h / 45); ny++) {
                        const colorSeed = Math.abs(Math.sin(seed * 1.3 + ny * 5.1));
                        if (colorSeed > 0.55) {
                            const color = neonColors[Math.floor(colorSeed * 100) % neonColors.length];
                            g.fillStyle = color;
                            g.globalAlpha = 0.35;
                            g.fillRect(bx + 6, base - h + 12 + ny * 45, 18, 2);
                            g.globalAlpha = 1;
                        }
                    }
                    for (let wy = 0; wy < Math.floor(h / 20); wy++) {
                        for (let wx = 0; wx < 3; wx++) {
                            if (Math.abs(Math.sin(seed + wy * 23 + wx * 13)) > 0.7) {
                                g.fillStyle = '#1a2a4a';
                                g.fillRect(bx + 6 + wx * 16, base - h + 12 + wy * 20, 8, 6);
                            }
                        }
                    }
                }
            });
        }

        this._bgStatic = S.c;
        this._bgBands = bands;
        this._bgSun = sun;
        this._bgKey = id + '|' + W + '|' + H;
    },

    drawBackground(ctx, W, H, camX) {
        const id = this.backgrounds[this.currentBackground];
        const key = id + '|' + W + '|' + H;
        if (key !== this._bgKey) this._bgBuild(id, W, H);
        ctx.drawImage(this._bgStatic, 0, 0, W, H);
        for (let i = 0; i < this._bgBands.length; i++) {
            const b = this._bgBands[i];
            const off = (camX * b.factor) % b.bandW;
            // Two consecutive period tiles always cover [0, W] (bandW > W):
            // the k0 tile contains x=0, k0+1 closes the right edge.
            const k0 = Math.floor((b.halfPad + off) / b.bandW);
            for (let k = k0; k <= k0 + 1; k++) {
                ctx.drawImage(b.canvas, k * b.bandW - b.halfPad - off, 0, b.bandW, H);
            }
        }
        if (this._bgSun) {
            const sunX = W * 0.7 - (camX * 0.02) % (W * 1.5);
            if (sunX > -120 && sunX < W + 120) ctx.drawImage(this._bgSun, sunX - 100, H * 0.55 - 100);
        }
    },

    _fillSky(ctx, W, H, topColor, midColor, botColor) {
        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, topColor);
        grad.addColorStop(0.5, midColor);
        grad.addColorStop(1, botColor);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
    },

    _getCarCanvasMetrics(car) {
        const { W, H } = this.viewSize();
        const followOffset = Math.min(W * 0.34, 220);
        const camX = Math.max(0, this.playerCar.x * this.METERS_TO_PX - followOffset);
        const roadY = getRoadY(H, this._isMobile, this._controlReserve || 0);
        const isPlayer = (car === this.playerCar);
        const scale = isPlayer ? 1.1 : 0.95;
        const laneY = isPlayer ? roadY + 65 : roadY + 20;
        const carX = (car.x * this.METERS_TO_PX) - camX + 40;
        const art = (typeof artFor === 'function') ? artFor(car) : null;
        const rearWheel = car._artAnchors?.rearWheel || (art ? { x: art.wheels[0][0], y: art.wheels[0][1] } : { x: 22, y: 36 });
        const exhaust = car._artAnchors?.exhaust || (art ? { x: art.rear, y: 29 } : { x: 2, y: 29 });
        const rearWheelX = carX + rearWheel.x * scale;
        const rearWheelY = laneY + car.squat + rearWheel.y * scale;
        const exhaustX = carX + exhaust.x * scale;
        const exhaustY = laneY + car.squat + exhaust.y * scale;
        return { carX, laneY, scale, rearWheelX, rearWheelY, exhaustX, exhaustY };
    },

    createSmoke(car, burnout) {
        if (!this.effects) return;
        const m = this._getCarCanvasMetrics(car);
        this.effects.emitTireSmoke(m.rearWheelX, m.rearWheelY, !!burnout);
    },

    createBackfire(car) {
        if (!this.effects) return;
        const m = this._getCarCanvasMetrics(car);
        this.effects.triggerGearFlame(m.exhaustX, m.exhaustY);
    },

    updateMenuUI() {
        document.getElementById('menu-cash').innerText = this.cash;
        document.getElementById('shop-cash').innerText = this.cash;
        document.getElementById('dealer-cash').innerText = this.cash;
        const rec = document.getElementById('menu-record');
        if (rec) rec.innerText = this.bestET ? 'BEST ET: ' + this.bestET.toFixed(3) + 's' : '';
        const gb = document.getElementById('ghost-race-btn');
        if (gb) {
            if (this.ghostRun) {
                gb.textContent = 'GHOST RACE · ' + this.ghostRun.et.toFixed(3) + 'S';
                gb.classList.remove('ghost-empty');
            } else {
                gb.textContent = 'GHOST RACE';
                gb.classList.add('ghost-empty');
            }
        }
        if (typeof Profile !== 'undefined' && Profile.data) Profile._refreshChip();
        // Career chip — achievement counter next to the corner star.
        const cb = document.getElementById('career-btn-count');
        if (cb && typeof Career !== 'undefined' && Career.ready && Career.data) {
            const got = Career.ACHIEVEMENTS.filter(a => Career.data.ach[a.id]).length;
            cb.textContent = ' ' + got + '/' + Career.ACHIEVEMENTS.length;
        }
        // Daily bonus strip — visible only while today's reward is unclaimed.
        if (typeof DailyBonus !== 'undefined' && DailyBonus.data) DailyBonus.render();
    },

    showNotification(text) {
        const n = document.getElementById('notification');
        if (!n) return;
        n.innerText = text;
        // Fit-to-width: Press Start 2P is monospace at 1em advance, so a
        // string of N glyphs needs N x font-size pixels. Scale the font down
        // (never below the CSS floor) so a long message fits on ONE line on
        // a narrow screen instead of overflowing. The CSS also allows
        // wrapping as a backstop, so this is an optimisation for looks, not
        // the thing that stops the clipping — but shrinking must be derived
        // from the real measured width, never guessed from character count.
        this._fitNotification(n, text);
        n.style.opacity = 1;
        n.style.top = '18%';
        clearTimeout(this._notifTimeout);
        this._notifTimeout = setTimeout(() => { n.style.opacity = 0; n.style.top = '25%'; }, 900);
    },

    // Scales #notification down until its rendered width fits the available
    // space. Restores the CSS-driven size first so a long message never
    // leaves a shrunken size behind for the next (short) one.
    _fitNotification(el, text) {
        // Purely cosmetic — never let a measurement failure stop the
        // notification from being shown.
        try { this._fitNotificationInner(el, text); } catch (e) { el.style.fontSize = ''; }
    },

    _fitNotificationInner(el, text) {
        el.style.fontSize = '';
        const cs = getComputedStyle(el);
        const avail = el.parentElement
            ? el.parentElement.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
            : window.innerWidth * 0.9;
        if (!(avail > 0)) return;
        const w = el.getBoundingClientRect().width;
        // w is the WRAPPED width; if it already fits there is nothing to do.
        if (w <= avail) return;
        // Measure the unwrapped width by temporarily allowing one line.
        const prevWrap = el.style.whiteSpace;
        el.style.whiteSpace = 'nowrap';
        const natural = el.getBoundingClientRect().width;
        el.style.whiteSpace = prevWrap;
        if (!(natural > 0)) return;
        const cur = parseFloat(cs.fontSize) || 16;
        const next = Math.max(11, Math.floor(cur * (avail / natural) * 10) / 10);
        el.style.fontSize = next + 'px';
    },

    performanceScore(car) {
        const upgradeCount = Object.values(car.upgrades).reduce((sum, value) => sum + (value === true ? 1 : (typeof value === 'number' ? Math.max(0, value - 1) : 0)), 0);
        return car.hp / car.weight + upgradeCount * 0.025;
    },

    getTournamentTier() {
        const score = this.performanceScore(this.playerCar);
        // LIGHT CUP: stock-car territory. ai eased 0.98 → 0.94 and heat-1
        // reactions relaxed (see the reactBase map below) so a rookie's
        // first tournament run is winnable while learning the tree.
        if (score < 0.38) return { name: 'LIGHT CUP', ai: 0.94, prize: 5000, start: 0, reactBase: 0.40 };
        if (score < 0.66) return { name: 'STREET KINGS', ai: 1.03, prize: 18000, start: 2, reactBase: 0.34 };
        return { name: 'PRO LEAGUE', ai: 1.08, prize: 50000, start: 4, reactBase: 0.30 };
    },

    /* ── DYNAMIC DIFFICULTY v3 ────────────────────────────────────────
       The old model hard-flipped out of "early career" after just 4
       races, which parked every stock-car player on a permanent 0.86×
       opponent with pro reactions — unwinnable until real upgrades
       landed, and it NEVER got easier after a losing streak.

       The replacement is one continuous, streak-aware curve:
         1. EXPERIENCE — 0→20 races lift the base 0.66 → 0.86. No cliff.
         2. WIN RATE — winning players meet slightly stronger cars.
         3. STREAK RUBBER-BAND (matchmaking layer, not physics) — two
            straight losses hand you up to −0.14 skill; a win streak
            climbs back gently (+0.05 max). Losing players get easier
            fields until they breathe again; smashes get promoted.
         4. STOCK-CAR RELIEF — with zero upgrades the opponent never
            exceeds 0.80×, so a fresh driver can always race home.
       The persona driver (reaction, staging, shift flubs) follows the
       SAME scalar, so a struggling player also draws clumsier drivers.
       Opponents are picked from the THREE nearest catalog cars
       (weighted center) for variety instead of the same shell. */
    getQuickOpponent() {
        const playerScore = this.performanceScore(this.playerCar);
        const upgrades = Object.values(this.playerCar.upgrades).reduce((sum, value) => sum + (value === true ? 1 : (typeof value === 'number' ? Math.max(0, value - 1) : 0)), 0);
        const q = this.quickStats;
        const winRate = q.races ? q.wins / q.races : 0;
        const streak = Math.max(-99, Math.min(99, q.streak | 0));

        let skill = 0.66 + Math.min(1, q.races / 20) * 0.20;
        skill += winRate * 0.10;
        if (streak <= -2) skill -= Math.min(0.14, (-streak - 1) * 0.045);
        else if (streak >= 2) skill += Math.min(0.05, (streak - 1) * 0.018);
        if (upgrades === 0) skill = Math.min(skill, 0.80);
        skill = Math.max(0.60, Math.min(1.12, skill));

        const target = playerScore * skill;
        const ranked = this.carDefs
            .map(def => ({ def, gap: Math.abs(def.hp / def.weight - target) }))
            .sort((a, b) => a.gap - b.gap)
            .slice(0, 3);
        const roll = Math.random();
        const pickIdx = ranked.length > 2 ? (roll < 0.60 ? 0 : (roll < 0.88 ? 1 : 2)) : 0;
        const pick = ranked[pickIdx] || ranked[0];

        // Persona scalar: 0 = clumsy rookie, 1 = pro tree, riding the
        // same curve as the hardware. Run-to-run variance stays bounded.
        const d = Math.max(0, Math.min(1, (skill - 0.60) / 0.42));
        const dToday = Math.max(0, Math.min(1, d * (0.92 + Math.random() * 0.16)));
        const persona = dToday < 0.38 ? 'ROOKIE' : dToday < 0.66 ? 'STREET' : dToday < 0.88 ? 'SEMI-PRO' : 'PRO';
        return {
            def: pick.def,
            scale: skill * (0.985 + Math.random() * 0.03),
            d: dToday,
            persona,
            reaction: Math.max(0.30, 0.62 - skill * 0.24) + Math.random() * 0.08,
            shift: Math.max(0.83, Math.min(0.93, 0.83 + skill * 0.09)),
        };
    },

    startGhostRace() {
        if (!this.ghostRun) {
            this.showNotification('NO GHOST — FINISH A QUICK RACE FIRST');;
            return;
        }
        this.startRaceMode('ghost');
    },

    /* ─── Ghost Run helpers ──────────────────────────────────────── */
    _sanitizeGhostRun(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const et = +raw.et;
        if (!isFinite(et) || et <= 0 || et >= 999) return null;
        if (!Array.isArray(raw.samples) || raw.samples.length < 4) return null;
        // v2 timelines store {t, x} pairs stamped with the SAME clock the
        // playback seeks with (wall-clock raceTimer); v1 stores uniform
        // 10 Hz positions. Both stay loadable forever.
        if (typeof raw.samples[0] === 'object' && raw.samples[0] !== null) {
            const samples = raw.samples.slice(0, GHOST_MAX_POINTS)
                .map(s => ({ t: +s.t, x: +s.x }));
            if (samples.some(s => !isFinite(s.t) || !isFinite(s.x) || s.t < 0 || s.x < 0)) return null;
            for (let i = 1; i < samples.length; i++) {
                if (samples[i].t < samples[i - 1].t) return null; // time must flow forward
            }
            if (samples[samples.length - 1].x < this.raceDistance * 0.97) return null;
            return { v: 2, et, bg: (Number.isInteger(raw.bg) ? raw.bg : 0), samples, car: raw.car || null };
        }
        const samples = raw.samples.slice(0, GHOST_MAX_POINTS).map(Number);
        if (samples.some(n => !isFinite(n) || n < 0)) return null;
        // The timeline must actually reach the finish line. Ghosts recorded
        // by pre-fix builds (which stamped the opponent's finish time on a
        // run that ended mid-track) would otherwise "finish" while visibly
        // short of the gantry.
        if (samples[samples.length - 1] < this.raceDistance * 0.97) return null;
        return { v: 1, et, bg: (Number.isInteger(raw.bg) ? raw.bg : 0), samples, car: raw.car || null };
    },

    // Serialize the CURRENT player car (visuals + shape) for the ghost
    // replica — mirrors the ownedCars save mapping exactly.
    _serializeCarForGhost(car) {
        if (!car) return null;
        return {
            name: car.name, color: car.color, secondaryColor: car.secondaryColor,
            price: car.price, type: car.type, art: car.art,
            baseHp: car.baseHp, baseRedline: car.baseRedline,
            baseGearRatios: car.baseGearRatios, baseFinalDrive: car.baseFinalDrive,
            baseWeight: car.baseWeight, baseGrip: car.baseGrip,
            baseDragArea: car.baseDragArea,
            upgrades: JSON.parse(JSON.stringify(car.upgrades || {})),
            tune: JSON.parse(JSON.stringify(car.tune || {})),
            customization: serializeCustomization(car.customization),
        };
    },

    _commitGhostRun(et) {
        if (!this._ghostSamples || !this._ghostSamples.length) return;
        const samples = this._ghostSamples.slice(0, GHOST_MAX_POINTS);
        // Close the timeline at the finish line itself — the ghost must
        // visibly reach the gantry at exactly its recorded ET.
        const endX = Math.max(this.playerCar ? this.playerCar.x : 0, this.raceDistance);
        samples.push(typeof samples[0] === 'object' ? { t: et, x: endX } : endX);
        this.ghostRun = {
            v: typeof samples[0] === 'object' ? 2 : 1,
            et,
            bg: this.currentBackground,
            samples,
            car: this._serializeCarForGhost(this.playerCar),
        };
        this.showNotification('NEW GHOST · ' + et.toFixed(3) + 's');
    },

    _buildGhostCar() {
        const g = this.ghostRun;
        const src = (g && g.car) || null;
        let car;
        if (src && src.name) {
            car = new Car({
                name: src.name, color: src.color, secondaryColor: src.secondaryColor,
                price: src.price, type: src.type, art: src.art,
                hp: src.baseHp, redline: src.baseRedline,
                gearRatios: src.baseGearRatios, finalDrive: src.baseFinalDrive,
                weight: src.baseWeight, grip: src.baseGrip,
                dragArea: src.baseDragArea, tune: src.tune,
            });
            car.upgrades = src.upgrades ? JSON.parse(JSON.stringify(src.upgrades)) : car.upgrades;
            car.customization = src.customization ? hydrateCustomization(src.customization) : car._stockCustomization();
            car.applyUpgrades();
        } else {
            // No stored visuals (old save) — mirror the player's CURRENT car.
            const pc = this.playerCar;
            car = new Car({
                name: pc.name, color: pc.color, secondaryColor: pc.secondaryColor,
                price: pc.price, type: pc.type, art: pc.art,
                hp: pc.baseHp, redline: pc.baseRedline,
                gearRatios: pc.baseGearRatios, finalDrive: pc.baseFinalDrive,
                weight: pc.baseWeight, grip: pc.baseGrip,
                dragArea: pc.baseDragArea, randomizeCustomization: true,
            });
        }
        car.name = 'YOUR GHOST';
        car.isGhost = true;
        car.reactionTime = 0;   // a replay never reacts — it launches on the green
        car.aiShiftPoint = 1;
        return car;
    },

    _ghostSeek(t) {
        const g = this.ghostRun, o = this.opponentCar;
        if (!g || !o) return;
        const s = g.samples;
        if (!s || !s.length) return;
        // Replay rule (the anti-jitter contract): the ghost is a PURE
        // FUNCTION OF TIME. Never chase it with distance smoothing, never
        // extrapolate past the newest sample — both are what made it
        // visibly rubber-band back and forth.
        let x, speed;
        if (typeof s[0] === 'number') {
            // Legacy uniform 10 Hz timeline.
            const idx = t / GHOST_SAMPLE_DT;
            const i = Math.floor(idx);
            const frac = idx - i;
            if (i < 0) { x = 0; speed = 0; }
            else {
                if (i >= s.length - 1) x = s[s.length - 1];
                else x = s[i] + (s[i + 1] - s[i]) * frac;
                // Smooth derivative: blend the two adjacent segment speeds
                // instead of the old 10 Hz staircase (which jerked the
                // squat/wheel visuals ten times a second).
                const seg = j => (j >= 0 && j < s.length - 1) ? (s[j + 1] - s[j]) / GHOST_SAMPLE_DT : 0;
                const v0 = seg(Math.max(0, i - 1)), v1 = seg(i);
                speed = v0 + (v1 - v0) * frac;
            }
        } else {
            // v2 timestamped timeline — recorded and replayed on the SAME
            // clock (raceTimer), so no time-base drift can accumulate.
            let c = this._ghostCursor || 0;
            if (c >= s.length || s[c].t > t) c = 0; // restart / rewind
            while (c < s.length - 1 && s[c + 1].t <= t) c++;
            this._ghostCursor = c;
            const a = s[c], b = s[Math.min(c + 1, s.length - 1)];
            if (t <= a.t || c >= s.length - 1 || t >= b.t) {
                // Hold the bracketing sample — CLAMP, never extrapolate.
                // Extrapolating past the newest sample is the classic
                // overshoot-then-snap-back desync.
                x = (t <= a.t ? a : b).x;
                speed = 0;
            } else {
                const f = (t - a.t) / Math.max(1e-6, b.t - a.t);
                x = a.x + (b.x - a.x) * f;
                const prev = c > 0
                    ? (a.x - s[c - 1].x) / Math.max(1e-6, a.t - s[c - 1].t)
                    : (b.x - a.x) / Math.max(1e-6, b.t - a.t);
                const next = (b.x - a.x) / Math.max(1e-6, b.t - a.t);
                speed = prev + (next - prev) * f;
            }
        }
        o.x = Math.max(0, x);
        o.speed = Math.max(0, speed);
        if (!o.finished && t >= g.et) {
            o.finished = true;
            o.finishTime = g.et;
            o.trapSpeed = o.speed;
        }
    },

    // HUD-safe paint: darken-proof the player/opponent paint for text and
    // progress bars — very dark paints get lifted toward a readable tone.
    _hudColor(hex, fallback) {
        const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
        if (!m) return fallback || '#cccccc';
        const n = parseInt(m[1], 16);
        let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
        const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        if (lum < 0.35) {
            const mix = 0.35 + (0.35 - lum) * 1.2;
            r = Math.round(r + (255 - r) * mix);
            g = Math.round(g + (255 - g) * mix);
            b = Math.round(b + (255 - b) * mix);
        }
        return 'rgb(' + r + ',' + g + ',' + b + ')';
    },

    startRaceMode(mode) {
        // Invalidate any pending "opponent disconnected" bounce. Those timers
        // fire ~1.6s later and only check that SOME race is running, so a
        // player who quits and immediately starts a fresh race would be
        // dumped back to the menu mid-race. Bumping the token here retires
        // every one of them.
        if (typeof MP !== 'undefined' && MP && MP._lobbyResetToken !== undefined) {
            MP._lobbyResetToken++;
        }
        this.raceMode = mode;
        this.state = 'RACE';
        this.menuState = 'RACE';
        this.raceState = 'STAGING';
        this.finished = false;
        this.paused = false;
        // Persona AI driver — rebuilt per race (quick/tournament only).
        // Multiplayer and ghost opponents are driven by the network/replay,
        // never by this.
        this._ai = null;
        this.effects = new RaceParticles(this.ctx);

        document.querySelectorAll('.menu-overlay').forEach(el => el.classList.add('hidden'));
        document.getElementById('ui-layer').classList.remove('hidden');
        document.getElementById('hud').classList.remove('hidden');
        document.getElementById('controls').classList.remove('hidden');
        document.getElementById('pause-btn').classList.remove('hidden');
        this._updateControlReserve();

        // Force landscape on race start
        this.tryLockOrientation();

        if (mode === 'multiplayer') {
            const fmt = (typeof MP !== 'undefined' && MP.mpFormat === 'tournament') ? 'tournament' : 'drag';
            this.mpFormat = fmt;
            this.opponentCar = (typeof MP !== 'undefined') ? MP.buildOpponentCar() : new Car({ randomizeCustomization: true });
            // Greet the opponent by their DRIVER name when their profile has
            // arrived — the car name is the fallback.
            const oppLabel = (typeof MP !== 'undefined' && MP.remoteProfile && MP.remoteProfile.name)
                ? MP.remoteProfile.name : this.opponentCar.name;
            document.getElementById('opp-name').innerText = oppLabel + ' (LIVE)';
            const mpOppEl = document.getElementById('opp-name');
            if (mpOppEl) mpOppEl.style.color = this._hudColor(this.opponentCar.color, '#ff7043');
            document.getElementById('tournament-round').innerText = fmt === 'tournament' ? 'HEAT ' + ((typeof MP !== 'undefined') ? MP.seriesHeat() : 1) + '/3' : 'MULTIPLAYER';
            document.getElementById('reaction-display').innerText = '';
            document.getElementById('race-timer').innerText = '0.000';
            this.playerCar.reset();
            this.opponentCar.reset();
            this.lights = 0;
            this.lightTimer = 0;
            this.raceStartTime = 0;
            this.raceTimer = 0;
            this.accumulator = 0;
            if (typeof MP !== 'undefined') MP.armForRace();
            return;
        }

        if (mode === 'ghost') {
            // Race the replay of your own best ET. The "opponent" is not
            // simulated at all — its lane position is sampled from the
            // recorded timeline (see _ghostSeek), so it runs EXACTLY the
            // ET it was recorded with, every time.
            const g = this.ghostRun;
            this.opponentCar = this._buildGhostCar();
            document.getElementById('opp-name').innerText = g ? 'YOUR GHOST · ' + g.et.toFixed(3) + 's' : 'YOUR GHOST';
            const oppNameEl = document.getElementById('opp-name');
            if (oppNameEl) oppNameEl.style.color = '#4dd0e1';
            document.getElementById('tournament-round').innerText = 'GHOST RUN';
            document.getElementById('reaction-display').innerText = '';
            document.getElementById('race-timer').innerText = '0.000';
            // Revisit the background the record was set on — same scenery,
            // same reference points, a fair time trial.
            if (g && Number.isInteger(g.bg) && g.bg >= 0 && g.bg < this.backgrounds.length) {
                this.currentBackground = g.bg;
            }
            this.playerCar.reset();
            this.opponentCar.reset();
            this.lights = 0;
            this.lightTimer = performance.now();
            this.raceStartTime = 0;
            this.raceTimer = 0;
            this.accumulator = 0;
            return;
        }

        let def, scaleFactor, aiShift, aiDifficulty;
        if (mode === 'quick') {
            const match = this.getQuickOpponent();
            def = match.def; scaleFactor = match.scale; aiShift = match.shift;
            this._opponentReaction = match.reaction;
            this._oppPersona = match.persona || null;
            aiDifficulty = match.d;   // persona scalar for the AI driver
        } else {
            const tier = this.getTournamentTier();
            def = this.carDefs[Math.min(this.carDefs.length - 1, tier.start + this.tournamentRound - 1)];
            scaleFactor = tier.ai + (this.tournamentRound - 1) * .035;
            aiShift = .91 + this.tournamentRound * .01;
            // Tier-aware reactions: LIGHT heats give a human window,
            // PRO stays razor-sharp. Rounds sharpen by 30 ms each.
            this._opponentReaction = Math.max(.16, tier.reactBase - (this.tournamentRound - 1) * .03);
            this._oppPersona = null;
            this.activeTournamentTier = tier;
        }

        this.opponentCar = new Car({ ...def, randomizeCustomization: true });
        this.opponentCar.hp = Math.floor(def.hp * scaleFactor);
        this.opponentCar.reactionTime = this._opponentReaction;
        this.opponentCar.aiShiftPoint = aiShift;

        // Match-race hardware fairness (quick mode only): if the player runs
        // a bottle, the opponent's car carries the same stage so the
        // mid-track pull is an even fight. Tournament hardware stays as
        // tuned — the persona driver changes HOW it drives, not WHAT it has.
        if (mode === 'quick' && this.playerCar && this.playerCar.nos > 0) {
            this.opponentCar.upgrades.nos = Math.max(0, Math.min(3, this.playerCar.nos | 0));
            this.opponentCar.applyUpgrades();
        }
        // Persona driver: quick mode gets its scalar from getQuickOpponent,
        // tournament derives it from the tier ramp (LIGHT ≈ rookie … PRO ≈ pro).
        const aiD = (mode === 'quick' && typeof aiDifficulty === 'number')
            ? aiDifficulty
            : Math.max(0, Math.min(1, (scaleFactor - 0.96) / 0.2));
        this._ai = new AIDriver(this.opponentCar, aiD);
        this.opponentCar.reactionTime = this._ai.reactDelay;

        // HUD opponent line: quick races advertise the DRIVER persona so
        // the difficulty feels like people, not one car stat. Dev-owned
        // constant labels only — never player-controlled text.
        document.getElementById('opp-name').innerText = mode === 'tournament'
            ? this.activeTournamentTier.name + ' • ' + this.opponentCar.name
            : (this._oppPersona ? this.opponentCar.name + ' • ' + this._oppPersona : this.opponentCar.name);
        const spOppEl = document.getElementById('opp-name');
        if (spOppEl) spOppEl.style.color = this._hudColor(this.opponentCar.color, '#ff7043');
        document.getElementById('tournament-round').innerText = mode === 'tournament' ? 'HEAT ' + this.tournamentRound + '/3' : 'FREE RUN';
        document.getElementById('reaction-display').innerText = '';
        document.getElementById('race-timer').innerText = '0.000';

        this.playerCar.reset();
        this.opponentCar.reset();

        this.lights = 0;
        this.lightTimer = performance.now();
        this.raceStartTime = 0;
        this.raceTimer = 0;
        this.accumulator = 0;
    },

    returnToMenu() {
        if (this.raceMode === 'multiplayer' && typeof MP !== 'undefined') MP.disconnect();

        if (this._pendingRotation) {
            this.currentBackground = (this.currentBackground + 1) % this.backgrounds.length;
            this._pendingRotation = false;
            this.scheduleSave();
        }

        this.state = 'MENU';
        this.menuState = 'MAIN';
        this.finished = false;
        this.paused = false;
        this.effects = new RaceParticles(this.ctx);
        document.querySelectorAll('.menu-overlay').forEach(el => el.classList.add('hidden'));
        document.getElementById('ui-layer').classList.remove('hidden');
        document.getElementById('hud').classList.add('hidden');
        document.getElementById('controls').classList.add('hidden');
        document.getElementById('pause-btn').classList.add('hidden');
        document.getElementById('main-menu').classList.remove('hidden');
        this.playerCar.reset();
        this._updateControlReserve();
        this.updateMenuUI();
    },

    openGarage() {
        this.menuState = 'GARAGE';
        this._garAnimFinish();   // never carry an old slide into a fresh open
        document.getElementById('main-menu').classList.add('hidden');
        document.getElementById('garage-menu').classList.remove('hidden');
        // Defensive clamp: the save loader already bounds selectedCarIndex,
        // but a hand-edited save or an array swap mid-session must never
        // leave the stage pointing outside the owned list — or at an entry
        // that is not a fully-built car (stepped over, see _validCarIndex).
        if (!this.ownedCars.length) {
            this.selectedCarIndex = 0;
        } else {
            const cur = this.selectedCarIndex | 0;
            const curOk = !!this.ownedCars[cur] && !!this.ownedCars[cur].customization;
            const idx = curOk ? cur : this._validCarIndex(cur, 1);
            this.selectedCarIndex = idx < 0 ? 0 : Math.min(idx, this.ownedCars.length - 1);
        }
        this.playerCar = this.ownedCars[this.selectedCarIndex] || null;
        this._renderGarageCustomizer();
    },

    /* ─── Garage car navigation (arrows / keyboard) ────────────────────
       The top car-list is gone: the stage IS the selector now. Single
       source of truth stays ownedCars + selectedCarIndex — an arrow only
       moves the index, re-points playerCar and refreshes the mounted
       customization panel IN PLACE (it is never torn down while browsing).
       dir = +1 (right / next) | -1 (left / previous), wrap-around. */
    garageNavigate(dir) {
        const n = this.ownedCars.length;
        if (n < 2) return;                     // 0 or 1 car: nothing to browse
        if (this.state !== 'MENU' || this.menuState !== 'GARAGE') return;
        const menu = document.getElementById('garage-menu');
        if (!menu || menu.classList.contains('hidden')) return;
        this._garAnimFinish();   // rapid taps: snap the in-flight slide first
        // Target the next fully-built car in the pressed direction (normally
        // the immediate neighbour; a corrupt entry is stepped over instead of
        // crashing the stage — see _validCarIndex).
        const target = this._validCarIndex(this.selectedCarIndex + dir, dir);
        if (target < 0) return;
        const fromCar = this.playerCar;
        this.selectedCarIndex = target;
        this.playerCar = this.ownedCars[target];
        if (this.playerCar === fromCar) return;
        this.scheduleSave();
        this._updateGarageDisplay();           // customization stays live & mounted
        this._animateGarageSwap(dir, fromCar);
        if (typeof SFX !== 'undefined') SFX.tick();
    },

    /* Nearest fully-built car at-or-after "start", walking in "dir". Real
       code paths (loadGame's re-derivation + filter, ensureOwnedCar, the
       dealership) can only ever store complete Car objects, but one corrupt
       entry — a hand-edited save that slips past every guard, console
       tampering — used to TypeError the whole stage. Stepping over it keeps
       browsing alive; selectedCarIndex semantics (an index into ownedCars)
       are unchanged. */
    _validCarIndex(start, dir) {
        const n = this.ownedCars.length;
        for (let k = 0; k < n; k++) {
            const idx = (((start + dir * k) % n) + n) % n;
            const c = this.ownedCars[idx];
            if (c && c.customization) return idx;
        }
        return -1;
    },

    /* Directional swap on the preview canvas. Right arrow (dir +1): the
       current car drives OUT toward the right while the new one enters
       from the left — like walking down a showroom row; left mirrors it.
       ~320 ms, ease-in-out cubic, drawn through the SAME Renderer.drawCar
       path as the static frame. REDUCE FX / prefers-reduced-motion renders
       the swap instantly. Two cars share the stage mid-flight with full
       clearance (half stage + a car width + margin) so they never overlap;
       the panel below is untouched while the stage moves. */
    _animateGarageSwap(dir, fromCar) {
        const canvas = document.getElementById('garage-preview');
        if (!canvas || !fromCar || !this.playerCar) { this._drawGaragePreview(); return; }
        const reduce = document.documentElement.classList.contains('reduce-motion') ||
            (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
        if (reduce) { this._drawGaragePreview(); return; }
        const toCar = this.playerCar;
        const DUR = 320;
        const t0 = performance.now();
        const self = this;
        const anim = this._garAnim = { raf: 0 };
        const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
        const frame = now => {
            if (self._garAnim !== anim) return;    // a newer swap owns the canvas
            const menu = document.getElementById('garage-menu');
            if (!menu || menu.classList.contains('hidden')) { self._garAnimFinish(); return; }
            const t = Math.min(1, (now - t0) / DUR);
            const e = ease(t);
            self._sizeGaragePreview(canvas);
            const CW = canvas.width, CH = canvas.height;
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.clearRect(0, 0, CW, CH);
            // Showroom spotlight glow — identical to the static frame.
            const glow = ctx.createRadialGradient(CW / 2, CH * 0.62, 8, CW / 2, CH * 0.62, CH * 1.4);
            glow.addColorStop(0, 'rgba(255,255,255,0.10)');
            glow.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = glow;
            ctx.fillRect(0, 0, CW, CH);
            const scale = Math.min((CW - 16) / 104, (CH - 14) / 44);
            const xBase = (CW - 104 * scale) / 2;
            const yBase = CH - 44 * scale - 6;
            const slide = CW / 2 + 104 * scale / 2 + 30;   // full clearance
            // Outgoing: exits TOWARD the pressed direction, fading slightly.
            ctx.save();
            ctx.globalAlpha = 1 - 0.35 * e;
            ctx.translate(xBase + dir * slide * e, yBase);
            ctx.scale(scale, scale);
            Renderer.drawCar(ctx, fromCar, 0, 0);
            ctx.restore();
            // Incoming: enters from the OPPOSITE side, fading in.
            ctx.save();
            ctx.globalAlpha = 0.65 + 0.35 * e;
            ctx.translate(xBase - dir * slide * (1 - e), yBase);
            ctx.scale(scale, scale);
            Renderer.drawCar(ctx, toCar, 0, 0);
            ctx.restore();
            ctx.strokeStyle = '#2c2f38';
            ctx.lineWidth = 2;
            ctx.strokeRect(1, 1, CW - 2, CH - 2);
            if (t < 1) {
                anim.raf = requestAnimationFrame(frame);
            } else {
                self._garAnim = null;
                self._drawGaragePreview();   // settle on the exact static frame
            }
        };
        anim.raf = requestAnimationFrame(frame);
    },

    /* Hard-stop any in-flight swap. Called before every navigation so
       rapid tapping can never stack two rAF loops or corrupt the stage. */
    _garAnimFinish() {
        if (this._garAnim) {
            if (this._garAnim.raf) cancelAnimationFrame(this._garAnim.raf);
            this._garAnim = null;
        }
    },

    // ─── Garage customization picker ─────────────────────────────────
    // Rows of ‹ part › steppers with a live-drawn preview canvas. Only the
    // selected car's looks change — stats stay untouched — and every pick
    // is persisted through the existing save pipeline (IDs only).
    GAR_GROUPS: [
        { key: 'rim', label: 'RIMS', group: 'rims' },
        { key: 'rimPaint', label: 'RIM PAINT', group: 'rimPaints' },
        { key: 'spoiler', label: 'SPOILER', group: 'spoilers' },
        { key: 'bodyKit', label: 'BODY KIT', group: 'bodyKits' },
        { key: 'exhaust', label: 'EXHAUST', group: 'exhausts' },
        { key: 'tire', label: 'TIRE', group: 'tires' },
        { key: 'tireBrand', label: 'TIRE BRAND', group: 'tireBrands' },
        { key: 'tint', label: 'TINT', group: 'tints' },
        { key: 'livery', label: 'LIVERY', group: 'liveries' },
    ],

    _renderGarageCustomizer() {
        const panel = document.getElementById('garage-custom');
        const empty = document.getElementById('gar-empty');
        if (!panel) return;
        const car = this.playerCar;
        panel.innerHTML = '';
        this._garVals = null;
        if (!car || !car.customization) {
            panel.classList.add('hidden');
            if (empty) empty.classList.remove('hidden');
            this._syncGarageArrows();
            return;
        }
        if (empty) empty.classList.add('hidden');
        panel.classList.remove('hidden');

        const vals = this._garVals = { parts: {} };

        const title = document.createElement('div');
        title.className = 'gar-title';
        title.innerHTML = 'CUSTOMIZE <span class="gar-title-car"></span>';
        vals.titleCar = title.querySelector('.gar-title-car');
        panel.appendChild(title);

        /* The preview canvas is STATIC markup inside #gar-stage-frame now —
           it is never re-created while browsing (only its backing store is
           resized/redrawn), so the stage cannot flicker or drop a tap
           mid-swap. The backing store is still sized from the element's own
           laid-out box in _sizeGaragePreview(), once CSS has resolved — see
           the original "blurry car" note down at _sizeGaragePreview. */
        const preview = document.getElementById('garage-preview');
        if (preview) {
            preview.width = 680;
            preview.height = 240;
            preview.setAttribute('aria-label', 'Preview of your customized car');
        }
        vals.stageName = document.getElementById('gar-stage-name');
        vals.stageStats = document.getElementById('gar-stage-stats');
        vals.stageIdx = document.getElementById('gar-stage-idx');

        const quick = document.createElement('div');
        quick.className = 'gar-quick';
        const rnd = document.createElement('span');
        rnd.className = 'menu-btn gar-quick-btn';
        rnd.textContent = 'RANDOM';
        rnd.setAttribute('role', 'button');
        rnd.tabIndex = 0;
        rnd.onclick = () => this.randomizeCustomization();
        const stk = document.createElement('span');
        stk.className = 'menu-btn gar-quick-btn gar-quick-stock';
        stk.textContent = 'STOCK';
        stk.setAttribute('role', 'button');
        stk.tabIndex = 0;
        stk.onclick = () => this.stockCustomization();
        quick.appendChild(rnd);
        quick.appendChild(stk);
        panel.appendChild(quick);

        const rows = document.createElement('div');
        rows.className = 'gar-rows';
        // Paint rows lead the list — body color + accent are the headline
        // customization, then the rim finish and the part groups follow.
        rows.appendChild(this._makePaintRow('PAINT', 'paint', vals));
        rows.appendChild(this._makePaintRow('ACCENT', 'accent', vals));
        rows.appendChild(this._makeRimPaintRow(vals));
        this.GAR_GROUPS.forEach(({ key, label, group }) => {
            // rimPaint already rendered as its own swatch row above.
            if (key === 'rimPaint') return;
            rows.appendChild(this._makePartRow(key, label, group, vals));
        });
        panel.appendChild(rows);

        const hint = document.createElement('div');
        hint.className = 'gar-hint';
        hint.textContent = 'LOOKS ONLY — STATS NEVER CHANGE';
        panel.appendChild(hint);

        this._updateGarageDisplay();
        this._drawGaragePreview();
    },

    /* Refresh every value surface of the ALREADY-MOUNTED garage UI from
       the currently selected car. Nothing is created or destroyed: the
       customization panel keeps its DOM, scroll position and tap targets
       while the arrows walk the garage — only text and swatch colors move. */
    _updateGarageDisplay() {
        const car = this.playerCar;
        const vals = this._garVals;
        if (!car || !vals) { this._renderGarageCustomizer(); return; }
        const name = String(car.name || '').toUpperCase();
        if (vals.titleCar) vals.titleCar.textContent = name;
        if (vals.stageName) vals.stageName.textContent = name;
        if (vals.stageStats) {
            const pw = (car.hp / car.weight * 1000).toFixed(0);
            vals.stageStats.textContent = Math.round(car.hp) + ' HP \u00B7 ' + car.weight + 'kg \u00B7 ' + pw + ' HP/TON';
        }
        if (vals.stageIdx) vals.stageIdx.textContent = (this.selectedCarIndex + 1) + '/' + this.ownedCars.length;
        // Paint + accent swatches (same checker-underlay rule as build time).
        if (vals.paint) this._setSwatch(vals.paint, this.PAINTS[this._paintIdx(car.color)]);
        if (vals.accent) this._setSwatch(vals.accent, this.PAINTS[this._paintIdx(car.secondaryColor)]);
        if (vals.rimPaint) {
            const list = window.CUSTOMIZATION.rimPaints;
            const sel = car.customization.rimPaint || list[0];
            this._setSwatch(vals.rimPaint, { hex: rimPaintColor(car, '#6f7780'), name: String(sel.name || 'stock').toUpperCase() });
        }
        this.GAR_GROUPS.forEach(({ key }) => {
            if (key === 'rimPaint') return;
            const ref = vals.parts[key];
            if (!ref) return;
            const list = window.CUSTOMIZATION[ref.group];
            const current = car.customization[key] || list[0];
            ref.val.textContent = String(current.name || current.id || 'stock').toUpperCase();
        });
        this._syncGarageArrows();
    },

/* V10G1-PREVIEW-REDRAW */
    /* Part/paint changed on the CURRENT car: refresh the mounted panel in
       place (no rebuild — scroll position and tap rhythm survive) AND
       redraw the preview canvas from the live car object.
       The canvas used to be drawn only on customizer REBUILD (garage open
       / swap settle), which is why a paint or part change stayed invisible
       until the player left the garage and came back — the panel text
       moved while the stage kept showing the old build. Renderer.drawCar
       reads every customization field straight off this.playerCar, so
       this one redraw IS the live preview; it is a single 680x240 canvas
       paint, not a scene redraw. (V10G1-PREVIEW-REDRAW) */
    _garRefresh() {
        this._updateGarageDisplay();
        this._drawGaragePreview();
    },

    _setSwatch(ref, paint) {
        if (!ref || !ref.sw) return;
        ref.sw.style.backgroundColor = paint.hex;
        ref.sw.classList.toggle('gar-swatch-dark', this._paintLum(paint.hex) < 0.35);
        if (ref.name) ref.name.textContent = String(paint.name || '');
    },

    _paintLum(hex) {
        const h = parseInt(String(hex || '#000000').slice(1), 16);
        return (0.2126 * ((h >> 16) & 255) + 0.7152 * ((h >> 8) & 255) + 0.0722 * (h & 255)) / 255;
    },

    /* Arrows go dormant (dimmed, inert) with fewer than two owned cars —
       layout stays identical, so the stage never jumps. */
    _syncGarageArrows() {
        const multi = this.ownedCars.length > 1;
        ['gar-prev', 'gar-next'].forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.classList.toggle('gar-nav-disabled', !multi);
            el.setAttribute('aria-disabled', String(!multi));
        });
    },

    /* Size the garage preview's backing store to its real, laid-out CSS box at
       device resolution, so it renders 1:1 with the pixels the screen shows
       instead of being resampled. Called on every customizer rebuild and on
       resize; cheap because it no-ops when the box has not changed. */
    _sizeGaragePreview(canvas) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        // offsetWidth/offsetHeight reflect the live LAYOUT box (the
        // mobile/portrait and short-viewport media queries all resize this
        // element) and — critically — are PRE-transform, so the portrait
        // stage's rotation cannot feed a rect→attribute feedback loop back
        // into the backing store. They read 0 only while the element is
        // display:none, where the rect fallback (measured only when the
        // stage is visible) takes over.
/* SCALE-1-SIZE */
        /* SCALE-1: the fallback chain used to end in "|| canvas.width" —
           the canvas's OWN attribute. While the garage was hidden both
           layout reads are 0, so the store fed itself (attribute ×dpr per
           call) and the car GREW on the next open — the "preview gets
           bigger every time I change paint" bug. The store may only ever
           be derived from the LAYOUT, never from itself: with no
           measurement there is nothing to fit, so the last good store is
           kept and the next open re-measures normally. */
/* SCALE-2-CONTENT-BOX */
        /* SCALE-2: measure the border-free CONTENT box (clientWidth/
           clientHeight) — exactly the pixel area the backing store is
           meant to match. offsetWidth/Height include the 2px border,
           which used to inject an extra +4px into every re-measure.
           Layout height itself is now attribute-independent (the CSS
           aspect-ratio on #garage-preview), so this measurement cannot
           be influenced by what we last drew. */
        const r = canvas.getBoundingClientRect();
        const w = canvas.clientWidth || Math.round(r.width);
        const h = canvas.clientHeight || Math.round(w * 240 / 680);
        if (!w || !h) return;
        const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
        if (canvas.width !== bw || canvas.height !== bh) {
            canvas.width = bw;
            canvas.height = bh;
        }
    },

/* SCALE-1-HIDDEN-GUARD */
    _drawGaragePreview() {
        const canvas = document.getElementById('garage-preview');
        if (!canvas || !this.playerCar) return;
        /* SCALE-1 companion: never size/draw while the garage is hidden —
           there is nothing visible to fit, and painting into a hidden
           canvas is exactly where unmeasurable sizing used to run. */
        const garMenu = document.getElementById('garage-menu');
        if (garMenu && garMenu.classList.contains('hidden')) return;
        this._sizeGaragePreview(canvas);
        const ctx = canvas.getContext('2d');
        // Smoothing stays ON: the artwork is vector, and this store now matches
        // the device pixel grid, so smoothing only helps the rare sub-pixel case.
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        const CW = canvas.width, CH = canvas.height;
        ctx.clearRect(0, 0, CW, CH);
        // Showroom spotlight glow
        const glow = ctx.createRadialGradient(CW / 2, CH * 0.62, 8, CW / 2, CH * 0.62, CH * 1.4);
        glow.addColorStop(0, 'rgba(255,255,255,0.10)');
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, CW, CH);
        ctx.save();
        /* Fit the car to the box rather than assuming one: the art is ~104x44
           units, so the scale is derived from the real available width. That
           keeps the car sharp AND correctly framed on a 200px phone preview
           and a 420px desktop one alike. */
        const scale = Math.min((CW - 16) / 104, (CH - 14) / 44);
        ctx.translate((CW - 104 * scale) / 2, CH - 44 * scale - 6);
        ctx.scale(scale, scale);
        Renderer.drawCar(ctx, this.playerCar, 0, 0);
        ctx.restore();
        // Frame line
        ctx.strokeStyle = '#2c2f38';
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, CW - 2, CH - 2);
    },

    cycleCustomization(key, dir) {
        const car = this.playerCar;
        if (!car || !car.customization) return;
        const meta = this.GAR_GROUPS.find(g => g.key === key);
        if (!meta) return;
        const list = window.CUSTOMIZATION[meta.group];
        if (!list || !list.length) return;
        const idx = Math.max(0, list.findIndex(item => item === car.customization[key] || (item.id && item.id === car.customization[key]?.id)));
        const next = list[(idx + dir + list.length) % list.length];
        car.customization[key] = next;
        this.showNotification(meta.label + ': ' + String(next.name || next.id).toUpperCase());
        this.scheduleSave();
        this._garRefresh();
    },

    // Curated pixel-friendly palette for the PAINT / ACCENT steppers.
    // Colors ride the car's existing color fields, so they are saved with
    // the garage AND carried to your opponent inside the MP loadout.
    PAINTS: [
        { hex: '#e53935', name: 'RACING RED' },
        { hex: '#ff7043', name: 'BURNT ORANGE' },
        { hex: '#ffb300', name: 'AMBER' },
        { hex: '#fdd835', name: 'TAXI YELLOW' },
        { hex: '#9ccc65', name: 'LIME' },
        { hex: '#43a047', name: 'BRITISH GREEN' },
        { hex: '#26c6da', name: 'TEAL' },
        { hex: '#42a5f5', name: 'SKY' },
        { hex: '#5e35b1', name: 'VIOLET' },
        { hex: '#d81b60', name: 'MAGENTA' },
        { hex: '#8d6e63', name: 'COPPER' },
        { hex: '#eceff1', name: 'ARCTIC WHITE' },
        { hex: '#37474f', name: 'GRAPHITE' },
        { hex: '#111111', name: 'MIDNIGHT' },
    ],

    _paintIdx(hex) {
        const i = this.PAINTS.findIndex(p => p.hex.toLowerCase() === String(hex || '').toLowerCase());
        return i < 0 ? 0 : i;
    },

    paintName(hex) {
        return this.PAINTS[this._paintIdx(hex)].name;
    },

    _makePaintRow(label, kind, vals) {
        const row = document.createElement('div');
        row.className = 'gar-row';

        const prev = document.createElement('span');
        prev.className = 'gar-arrow';
        prev.textContent = '\u25C0';
        prev.setAttribute('role', 'button');
        prev.setAttribute('aria-label', 'Previous ' + label.toLowerCase());
        prev.tabIndex = 0;
        prev.onclick = () => this.cyclePaint(kind, -1);

        const next = document.createElement('span');
        next.className = 'gar-arrow';
        next.textContent = '\u25B6';
        next.setAttribute('role', 'button');
        next.setAttribute('aria-label', 'Next ' + label.toLowerCase());
        next.tabIndex = 0;
        next.onclick = () => this.cyclePaint(kind, 1);

        const lab = document.createElement('span');
        lab.className = 'gar-label';
        lab.textContent = label;

        const val = document.createElement('span');
        val.className = 'gar-value gar-value-paint';
        const sw = document.createElement('span');
        sw.className = 'gar-swatch';
        val.appendChild(sw);
        const name = document.createTextNode('');
        val.appendChild(name);
        // The chip fill + checker underlay are applied by _updateGarageDisplay
        // (backgroundColor, NOT the shorthand — the shorthand would wipe the
        // checkerboard underlay that makes dark paints readable as chips).
        if (vals) vals[kind] = { sw, name };

        row.appendChild(prev);
        row.appendChild(lab);
        row.appendChild(val);
        row.appendChild(next);
        return row;
    },

    // RIM PAINT row — same stepper shape as the paint rows but backed by
    // the rimPaints catalog. The swatch previews the RESOLVED rim color:
    // 'stock' shows the neutral steel finish, 'accent' mirrors the current
    // ACCENT chip (and follows it live once redrawn), the rest show their
    // own finish. cycling uses the generic part pipeline (IDs + save).
    _makeRimPaintRow(vals) {
        const row = document.createElement('div');
        row.className = 'gar-row';

        const prev = document.createElement('span');
        prev.className = 'gar-arrow';
        prev.textContent = '\u25C0';
        prev.setAttribute('role', 'button');
        prev.setAttribute('aria-label', 'Previous rim paint');
        prev.tabIndex = 0;
        prev.onclick = () => this.cycleCustomization('rimPaint', -1);

        const next = document.createElement('span');
        next.className = 'gar-arrow';
        next.textContent = '\u25B6';
        next.setAttribute('role', 'button');
        next.setAttribute('aria-label', 'Next rim paint');
        next.tabIndex = 0;
        next.onclick = () => this.cycleCustomization('rimPaint', 1);

        const lab = document.createElement('span');
        lab.className = 'gar-label';
        lab.textContent = 'RIM PAINT';

        const val = document.createElement('span');
        val.className = 'gar-value gar-value-paint';
        const sw = document.createElement('span');
        sw.className = 'gar-swatch';
        val.appendChild(sw);
        const name = document.createTextNode('');
        val.appendChild(name);
        // Chip fill + label come from _updateGarageDisplay so the row follows
        // ACCENT live when the rim paint is set to 'accent'.
        if (vals) vals.rimPaint = { sw, name };

        row.appendChild(prev);
        row.appendChild(lab);
        row.appendChild(val);
        row.appendChild(next);
        return row;
    },

    /* Generic part stepper row (‹ LABEL value ›). The value span registers
       in vals.parts[key] so car swaps refresh it without a rebuild. */
    _makePartRow(key, label, group, vals) {
        const row = document.createElement('div');
        row.className = 'gar-row';

        const prev = document.createElement('span');
        prev.className = 'gar-arrow';
        prev.textContent = '\u25C0';
        prev.setAttribute('role', 'button');
        prev.setAttribute('aria-label', 'Previous ' + label.toLowerCase());
        prev.tabIndex = 0;
        prev.onclick = () => this.cycleCustomization(key, -1);

        const next = document.createElement('span');
        next.className = 'gar-arrow';
        next.textContent = '\u25B6';
        next.setAttribute('role', 'button');
        next.setAttribute('aria-label', 'Next ' + label.toLowerCase());
        next.tabIndex = 0;
        next.onclick = () => this.cycleCustomization(key, 1);

        const lab = document.createElement('span');
        lab.className = 'gar-label';
        lab.textContent = label;

        const val = document.createElement('span');
        val.className = 'gar-value';
        if (vals) vals.parts[key] = { val, group };

        row.appendChild(prev);
        row.appendChild(lab);
        row.appendChild(val);
        row.appendChild(next);
        return row;
    },

    cyclePaint(kind, dir) {
        const car = this.playerCar;
        if (!car) return;
        const hex = kind === 'accent' ? car.secondaryColor : car.color;
        const paint = this.PAINTS[(this._paintIdx(hex) + dir + this.PAINTS.length) % this.PAINTS.length];
        if (kind === 'accent') car.secondaryColor = paint.hex; else car.color = paint.hex;
        this.showNotification((kind === 'accent' ? 'ACCENT: ' : 'PAINT: ') + paint.name);
        this.scheduleSave();
        this._garRefresh();
    },

    randomizeCustomization() {
        const car = this.playerCar;
        if (!car) return;
        car.customization = car._randomCustomization();
        // RANDOM rolls the paint too — the full "surprise me" build.
        car.color = this.PAINTS[Math.floor(Math.random() * this.PAINTS.length)].hex;
        car.secondaryColor = this.PAINTS[Math.floor(Math.random() * this.PAINTS.length)].hex;
        this.showNotification('RANDOM BUILD');
        this.scheduleSave();
        this._garRefresh();
    },

    stockCustomization() {
        const car = this.playerCar;
        if (!car) return;
        car.customization = car._stockCustomization();
        // STOCK also restores the factory paint from the car definition.
        const def = this.carDefs.find(d => d.name === car.name);
        if (def) { car.color = def.color; car.secondaryColor = def.secondaryColor; }
        this.showNotification('STOCK PARTS');
        this.scheduleSave();
        this._garRefresh();
    },

/* V10G3-SHOP-ICONS */
    /* ─── Performance shop part icons (V10G3-SHOP-ICONS) ──────────────────────────────────
       Inline SVG (no image requests, no broken-asset state, scales with
       the card through .shop-icon CSS). 48x48 grid, one flat steel
       palette + one accent per part, consistent top-left light. Keyed by
       the upgrade key used in openShop(); missing keys simply render
       iconless rows. */
    SHOP_ICONS: {
        engine: '<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><g fill="#c9a227"><rect x="13" y="4" width="3" height="6" rx="1"/><rect x="20" y="4" width="3" height="6" rx="1"/><rect x="27" y="4" width="3" height="6" rx="1"/><rect x="34" y="4" width="3" height="6" rx="1"/><rect x="13" y="38" width="3" height="6" rx="1"/><rect x="20" y="38" width="3" height="6" rx="1"/><rect x="27" y="38" width="3" height="6" rx="1"/><rect x="34" y="38" width="3" height="6" rx="1"/><rect x="4" y="13" width="6" height="3" rx="1"/><rect x="4" y="20" width="6" height="3" rx="1"/><rect x="4" y="27" width="6" height="3" rx="1"/><rect x="4" y="34" width="6" height="3" rx="1"/><rect x="38" y="13" width="6" height="3" rx="1"/><rect x="38" y="20" width="6" height="3" rx="1"/><rect x="38" y="27" width="6" height="3" rx="1"/><rect x="38" y="34" width="6" height="3" rx="1"/></g><rect x="10" y="10" width="28" height="28" rx="3" fill="#3a4048"/><rect x="10" y="10" width="28" height="6" rx="3" fill="#4a525c"/><rect x="15" y="15" width="18" height="18" rx="2" fill="#22262b"/><path d="M20 19h4v4h4M28 19v4h-3M19 29v-3h3" stroke="#4fc3f7" stroke-width="1.6" fill="none" stroke-linecap="round"/><circle cx="29" cy="28" r="1.4" fill="#4fc3f7"/><circle cx="19" cy="19" r="1.4" fill="#4fc3f7"/></svg>',
        injector: '<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="11" width="40" height="7" rx="3.5" fill="#8a93a3"/><rect x="4" y="11" width="40" height="2.6" rx="1.3" fill="#aeb6c0"/><rect x="8" y="6" width="9" height="5" rx="1" fill="#5c6672"/><rect x="31" y="6" width="9" height="5" rx="1" fill="#5c6672"/><path d="M11 18h6l1.6 9H9.4z" fill="#5c6672"/><rect x="10" y="27" width="8" height="6.6" rx="2" fill="#3a4048"/><path d="M13.2 33.6h1.6l.7 4.4h-3z" fill="#cfd6dd"/><path d="M31 18h6l1.6 9h-9.2z" fill="#5c6672"/><rect x="30" y="27" width="8" height="6.6" rx="2" fill="#3a4048"/><path d="M33.2 33.6h1.6l.7 4.4h-3z" fill="#cfd6dd"/><g fill="#4fc3f7"><circle cx="14" cy="42" r="1.1"/><circle cx="34" cy="42" r="1.1"/><circle cx="16.4" cy="44.4" r=".8"/><circle cx="36.4" cy="44.4" r=".8"/></g></svg>',
        turbo: '<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><path d="M22 9a15 15 0 0 1 15 15h-5a10 10 0 0 0-10-10z" fill="#6f7780"/><circle cx="22" cy="24" r="15" fill="#5c6672"/><circle cx="22" cy="24" r="11" fill="#2a2e35"/><g fill="#cfd6dd"><path d="M22 24l-2.2-7.8a8.2 8.2 0 0 1 4.4 0z"/><path d="M22 24l-2.2-7.8a8.2 8.2 0 0 1 4.4 0z" transform="rotate(60 22 24)"/><path d="M22 24l-2.2-7.8a8.2 8.2 0 0 1 4.4 0z" transform="rotate(120 22 24)"/><path d="M22 24l-2.2-7.8a8.2 8.2 0 0 1 4.4 0z" transform="rotate(180 22 24)"/><path d="M22 24l-2.2-7.8a8.2 8.2 0 0 1 4.4 0z" transform="rotate(240 22 24)"/><path d="M22 24l-2.2-7.8a8.2 8.2 0 0 1 4.4 0z" transform="rotate(300 22 24)"/></g><circle cx="22" cy="24" r="3.4" fill="#8a93a3"/><rect x="35" y="18.6" width="9" height="8.8" rx="2" fill="#5c6672"/><rect x="42.6" y="16.6" width="2.6" height="12.8" rx="1" fill="#aeb6c0"/><path d="M33 33a12 12 0 0 1-4 4.4" stroke="#ff9800" stroke-width="2.2" fill="none" stroke-linecap="round"/></svg>',
        intercooler: '<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><path d="M8 19v-7h8" stroke="#8a93a3" stroke-width="3.4" fill="none" stroke-linecap="round"/><path d="M40 19v-7h-8" stroke="#8a93a3" stroke-width="3.4" fill="none" stroke-linecap="round"/><rect x="10" y="17" width="28" height="17" fill="#3a4048"/><g fill="#5c6672"><rect x="12" y="17" width="2" height="17"/><rect x="16" y="17" width="2" height="17"/><rect x="20" y="17" width="2" height="17"/><rect x="24" y="17" width="2" height="17"/><rect x="28" y="17" width="2" height="17"/><rect x="32" y="17" width="2" height="17"/><rect x="36" y="17" width="2" height="17"/></g><rect x="3" y="19" width="8" height="13" rx="2" fill="#8a93a3"/><rect x="37" y="19" width="8" height="13" rx="2" fill="#8a93a3"/><rect x="3" y="19" width="8" height="3" rx="1.5" fill="#aeb6c0"/><rect x="37" y="19" width="8" height="3" rx="1.5" fill="#aeb6c0"/><g stroke="#4fc3f7" stroke-width="1.6" stroke-linecap="round"><path d="M14 5.5v3"/><path d="M18.5 4v4.5"/><path d="M23 5.5v3"/></g></svg>',
        camshaft: '<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><g fill="#5c6672"><path d="M13 13c3.9 0 6.6 4.9 6.6 10.4S16.9 33.8 13 33.8 6.4 28.9 6.4 23.4 9.1 13 13 13z" transform="rotate(28 13 24)"/><path d="M24 13c3.9 0 6.6 4.9 6.6 10.4S27.9 33.8 24 33.8 17.4 28.9 17.4 23.4 20.1 13 24 13z" transform="rotate(200 24 24)"/><path d="M35 13c3.9 0 6.6 4.9 6.6 10.4S38.9 33.8 35 33.8 28.4 28.9 28.4 23.4 31.1 13 35 13z" transform="rotate(95 35 24)"/></g><rect x="2" y="21.2" width="44" height="5.6" rx="2.8" fill="#9aa3ad"/><rect x="2" y="21.2" width="44" height="2.2" rx="1.1" fill="#cfd6dd"/><g fill="#7d8794"><rect x="17.5" y="20.8" width="3.4" height="6.4" rx="1.4"/><rect x="28.5" y="20.8" width="3.4" height="6.4" rx="1.4"/><rect x="42.6" y="20.4" width="3.4" height="7.2" rx="1.6"/></g></svg>',
        nos: '<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><path d="M27 8.6c8 .8 12.4 5.6 12.4 12.4" stroke="#3a4048" stroke-width="2.6" fill="none" stroke-linecap="round"/><circle cx="39.4" cy="22.6" r="2.8" fill="#5c6672"/><rect x="21" y="6" width="6" height="7" rx="1" fill="#8a93a3"/><rect x="17.6" y="3.6" width="12.8" height="3.4" rx="1.4" fill="#cfd6dd"/><rect x="14.6" y="12" width="18.8" height="31" rx="8.6" fill="#29b6f6"/><rect x="17.6" y="16" width="4" height="21" rx="2" fill="#7fd8ff"/><rect x="16" y="25.4" width="16" height="4.6" fill="#e8edf2"/><rect x="16" y="25.4" width="16" height="1.4" fill="#b7bfc7"/></svg>',
        racingClutch: '<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><circle cx="24" cy="24" r="16" fill="#8a93a3"/><circle cx="24" cy="24" r="16" fill="none" stroke="#6f7780" stroke-width="1.6" stroke-dasharray="3 3"/><circle cx="24" cy="24" r="10.6" fill="#5c6672"/><g fill="#2a2e35"><circle cx="24" cy="17" r="2.6"/><circle cx="24" cy="17" r="2.6" transform="rotate(60 24 24)"/><circle cx="24" cy="17" r="2.6" transform="rotate(120 24 24)"/><circle cx="24" cy="17" r="2.6" transform="rotate(180 24 24)"/><circle cx="24" cy="17" r="2.6" transform="rotate(240 24 24)"/><circle cx="24" cy="17" r="2.6" transform="rotate(300 24 24)"/></g><circle cx="24" cy="24" r="4.6" fill="#cfd6dd"/><g stroke="#5c6672" stroke-width="1.4"><path d="M24 19.6v2.2"/><path d="M24 26.2v2.2"/><path d="M19.6 24h2.2"/><path d="M26.2 24h2.2"/></g><circle cx="24" cy="24" r="1.7" fill="#17191d"/></svg>',
        chassis: '<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><rect x="5" y="11" width="38" height="7" rx="2" fill="#8a93a3"/><rect x="5" y="30" width="38" height="7" rx="2" fill="#8a93a3"/><rect x="10" y="18" width="6" height="12" fill="#6f7780"/><rect x="32" y="18" width="6" height="12" fill="#6f7780"/><g fill="#17191d"><circle cx="11.5" cy="14.5" r="2"/><circle cx="20.5" cy="14.5" r="2"/><circle cx="29.5" cy="14.5" r="2"/><circle cx="38" cy="14.5" r="2"/><circle cx="11.5" cy="33.5" r="2"/><circle cx="20.5" cy="33.5" r="2"/><circle cx="29.5" cy="33.5" r="2"/><circle cx="38" cy="33.5" r="2"/></g></svg>',
        shortGears: '<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><g fill="#8a93a3"><circle cx="19" cy="30" r="9.5"/><rect x="16.5" y="16.6" width="5" height="6" rx="1.2"/><rect x="16.5" y="16.6" width="5" height="6" rx="1.2" transform="rotate(45 19 30)"/><rect x="16.5" y="16.6" width="5" height="6" rx="1.2" transform="rotate(90 19 30)"/><rect x="16.5" y="16.6" width="5" height="6" rx="1.2" transform="rotate(135 19 30)"/><rect x="16.5" y="16.6" width="5" height="6" rx="1.2" transform="rotate(180 19 30)"/><rect x="16.5" y="16.6" width="5" height="6" rx="1.2" transform="rotate(225 19 30)"/><rect x="16.5" y="16.6" width="5" height="6" rx="1.2" transform="rotate(270 19 30)"/><rect x="16.5" y="16.6" width="5" height="6" rx="1.2" transform="rotate(315 19 30)"/></g><circle cx="19" cy="30" r="3.4" fill="#17191d"/><g fill="#5c6672"><circle cx="34" cy="14" r="6.6"/><rect x="32.2" y="4.8" width="3.6" height="4.6" rx="1"/><rect x="32.2" y="4.8" width="3.6" height="4.6" rx="1" transform="rotate(60 34 14)"/><rect x="32.2" y="4.8" width="3.6" height="4.6" rx="1" transform="rotate(120 34 14)"/><rect x="32.2" y="4.8" width="3.6" height="4.6" rx="1" transform="rotate(180 34 14)"/><rect x="32.2" y="4.8" width="3.6" height="4.6" rx="1" transform="rotate(240 34 14)"/><rect x="32.2" y="4.8" width="3.6" height="4.6" rx="1" transform="rotate(300 34 14)"/></g><circle cx="34" cy="14" r="2.2" fill="#17191d"/></svg>',
        slicks: '<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><circle cx="24" cy="24" r="17" fill="#23262b"/><circle cx="24" cy="24" r="13.4" fill="none" stroke="#2e3238" stroke-width="1.6"/><circle cx="24" cy="24" r="9.4" fill="#8a93a3"/><g fill="#5c6672"><circle cx="24" cy="18.2" r="1.9"/><circle cx="24" cy="18.2" r="1.9" transform="rotate(72 24 24)"/><circle cx="24" cy="18.2" r="1.9" transform="rotate(144 24 24)"/><circle cx="24" cy="18.2" r="1.9" transform="rotate(216 24 24)"/><circle cx="24" cy="18.2" r="1.9" transform="rotate(288 24 24)"/></g><circle cx="24" cy="24" r="3.8" fill="#cfd6dd"/><circle cx="24" cy="24" r="1.6" fill="#17191d"/></svg>',
        aero: '<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="10" width="3.6" height="20" rx="1.2" fill="#3a4048"/><path d="M7 17c8-4.6 24-5.6 36-2.8-2 4.2-6.2 6.2-12.4 7.2l-20 2.2c-2.8.2-3.8-3-3.6-6.6z" fill="#5c6672"/><path d="M9.4 16.4c8-3.8 21.6-4.8 31.2-2.6" stroke="#aeb6c0" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M15 23.4l-2.4 13" stroke="#8a93a3" stroke-width="3.4" stroke-linecap="round"/><path d="M31 21.8l-2.2 14.6" stroke="#8a93a3" stroke-width="3.4" stroke-linecap="round"/><rect x="7" y="37.6" width="34" height="3.6" rx="1.6" fill="#3a4048"/></svg>',
        performanceGearbox: '<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><rect x="1.5" y="22.4" width="7" height="3.8" rx="1.6" fill="#aeb6c0"/><rect x="7" y="13" width="35" height="24" rx="3" fill="#3a4048"/><rect x="7" y="13" width="35" height="4" rx="2" fill="#4a525c"/><rect x="10" y="19.6" width="29" height="2.4" fill="#5c6672"/><rect x="10" y="28.4" width="29" height="2.4" fill="#5c6672"/><g fill="#cfd6dd"><circle cx="15" cy="20.8" r="3.7"/><circle cx="26" cy="20.8" r="3.7"/><circle cx="37" cy="20.8" r="3.7"/></g><g fill="#9aa3ad"><circle cx="20.5" cy="29.6" r="4.9"/><circle cx="31.5" cy="29.6" r="4.9"/></g><path d="M12 15.5v13" stroke="#4fc3f7" stroke-width="1.8" stroke-linecap="round"/></svg>',
        parachute: '<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><path d="M4 22a20 20 0 0 1 40 0z" fill="#e53935"/><g stroke="#eceff1" stroke-width="3.2" fill="none"><path d="M24 21.6V3.4"/><path d="M16.4 21.6a15.6 15.6 0 0 1 3.4-15"/><path d="M31.6 21.6a15.6 15.6 0 0 0-3.4-15"/></g><rect x="4" y="21" width="40" height="2.4" fill="#b71c1c"/><g stroke="#cfd6dd" stroke-width="1.2" fill="none"><path d="M6.5 23.2L22.4 39"/><path d="M18 24L23.2 39"/><path d="M30 24L24.8 39"/><path d="M41.5 23.2L25.6 39"/></g><rect x="19.6" y="38.6" width="8.8" height="5.4" rx="1.4" fill="#5c6672"/><rect x="19.6" y="38.6" width="8.8" height="1.8" rx=".9" fill="#7d8794"/></svg>',
    },
    openShop() {
        this.menuState = 'SHOP';
        document.getElementById('main-menu').classList.add('hidden');
        document.getElementById('shop-menu').classList.remove('hidden');
        this.updateMenuUI();

        const upgrades = [
            { key: 'engine', name: 'ECU Remap', stages: 5, cost: 500, desc: '+12% HP and +300 rpm per stage' },
            { key: 'injector', name: 'Fuel System', stages: 5, cost: 800, desc: '+6% HP per stage — feeds bigger tunes safely' },
            { key: 'turbo', name: 'Turbocharger', stages: 3, cost: 2200, desc: '+7% HP per stage · CON: softer low-end punch off the line (boost needs revs)' },
            { key: 'intercooler', name: 'Intercooler', stages: 2, cost: 1800, desc: '+5% HP per stage (cooler, denser charge) · CON: +12 kg per stage' },
            { key: 'camshaft', name: 'Camshaft', stages: 3, cost: 1900, desc: '+6% HP and +150 rpm per stage · CON: duller idle-to-mid torque — harder launches' },
            { key: 'nos', name: 'Nitrous Kit', stages: 3, cost: 2600, desc: 'Hold NOS: +25% power while spraying, +1.2s bottle per stage · CON: bottle empties fast in a low gear' },
            { key: 'racingClutch', name: 'Racing Clutch', stages: 1, cost: 1600, desc: 'Shifts land ~40% faster (0.15s → 0.09s) · CON: grabby, unforgiving engagement' },
            { key: 'chassis', name: 'Weight Reduction', stages: 3, cost: 1200, desc: '-35 kg per stage (min 600 kg) · CON: less mass over the tires can unstick a hard launch' },
            { key: 'shortGears', name: 'Short Gears', stages: 3, cost: 1500, desc: '+0.25 final drive per stage · CON: lower top speed, one more shift to nail' },
            { key: 'slicks', name: 'Drag Slicks', stages: 1, cost: 2500, desc: '+0.55 grip — essential for 400+ HP' },
            { key: 'aero', name: 'Aero Package', stages: 1, cost: 3500, desc: '-15% drag · CON: zero help below triple digits' },
            { key: 'performanceGearbox', name: 'Pro Transmission', stages: 1, cost: 8000, desc: '7-speed close ratio box · CON: more shifts to get right' },
            { key: 'parachute', name: 'Parachute', stages: 1, cost: 4000, desc: 'Extra braking force above 5 m/s' },
        ];

        const container = document.getElementById('shop-items');
        container.innerHTML = '';
        const car = this.playerCar;

        upgrades.forEach(item => {
            const lvl = car.upgrades[item.key] || 0;
            const isBool = item.stages === 1;
            const isMax = isBool ? !!lvl : lvl >= item.stages;
            // Base-0 upgrades (turbo starts at Lvl 0) still pay full price for
            // their FIRST stage — max(1, lvl) keeps every base-1 item's math
            // byte-for-byte identical to before.
            const cost = isMax ? 0 : item.cost * (isBool ? 1 : Math.max(1, lvl));

/* V10G4-SHOP-ITEM-MAIN */
            const div = document.createElement('div');
            div.className = 'shop-item';
            // Icon column + content column. The icon is INLINE SVG (no
            // image requests, nothing to 404, no layout shift) and scales
            // with the card through the .shop-icon clamp rules; the body
            // keeps min-width:0 so the header can never push the icon out.
            const iconSvg = this.SHOP_ICONS ? (this.SHOP_ICONS[item.key] || '') : '';
            div.innerHTML =
                '<div class="shop-item-main">' +
                    (iconSvg ? '<span class="shop-icon" aria-hidden="true">' + iconSvg + '</span>' : '') +
                    '<div class="shop-item-body">' +
                        '<div class="shop-item-header">' +
                            '<span style="color:#fff">' + item.name +
                                ' <span style="color:#666">' + (isBool ? (isMax ? '✓' : '') : 'Lvl ' + lvl) + '</span>' +
                            '</span>' +
                            '<span style="color:' + (isMax ? '#4caf50' : (this.cash >= cost ? '#4caf50' : '#f44336')) + '">' +
                                (isMax ? 'MAX' : '$' + cost.toLocaleString()) +
                            '</span>' +
                        '</div>' +
                        '<div class="shop-item-detail">' + item.desc + '</div>' +
                    '</div>' +
                '</div>';

            div.onclick = () => {
                // Same stale-render hazard as the dealership: re-read the live
                // level instead of trusting the one this row was built from.
                if (isBool ? !!car.upgrades[item.key] : this._upgradeLevelAtMax(car, item)) return;
                if (this.canAfford(cost)) {
                    if (!this.spendCash(cost, 'upgrade:' + item.key)) return;
                    if (isBool) car.upgrades[item.key] = true;
                    // (n || 0) + 1 — guards base-0 keys missing from older saves.
                    else car.upgrades[item.key] = (car.upgrades[item.key] || 0) + 1;
                    car.applyUpgrades();
                    this.scheduleSave();
                    this.updateMenuUI();
                    this.openShop();
                    this.showNotification('INSTALLED');
                    if (typeof SFX !== 'undefined') SFX.purchase();
                } else {
                    this.showNotification('INSUFFICIENT FUNDS');
                    if (typeof SFX !== 'undefined') SFX.error();
                }
            };
            container.appendChild(div);
        });

        const heading = document.createElement('div');
        heading.className = 'shop-item';
        heading.style.cssText = 'border-color:#4fc3f7; color:#4fc3f7; cursor:default;';
        heading.innerHTML = '<div class="shop-item-header"><span>TUNE SETUP</span><span style="color:#888">-3 to +3</span></div><div class="shop-item-detail">Free. Every setting trades one thing for another — tune around your build.</div>';
        container.appendChild(heading);
        const tunes = [
            { key: 'finalDrive', name: 'Final Drive', low: 'Taller: higher top speed, softer launch', high: 'Shorter: stronger acceleration, lower top speed' },
            { key: 'gearSpacing', name: 'Gear Spacing', low: 'Wider: fewer shifts, larger RPM drops', high: 'Closer: stronger pull, more shifts' },
            { key: 'launch', name: 'Launch Bias', low: 'Gentler launch, less wheelspin control', high: 'Harder launch, more low-speed torque and grip' },
            { key: 'tirePressure', name: 'Tire Pressure', low: 'Soft: hooks the launch, drags up top', high: 'Hard: rolls free up top, slips off the line' },
            { key: 'ignitionTiming', name: 'Ignition Timing', low: 'Retarded: safe and gutless', high: 'Advanced: more power, knock costs rev range' },
            { key: 'aeroTrim', name: 'Aero Trim', low: 'Less drag, less high-speed stability', high: 'More stability and grip, more drag' },
        ];
        tunes.forEach(item => {
            const value = Math.max(-3, Math.min(3, car.tune[item.key] || 0));
            const div = document.createElement('div');
            div.className = 'shop-item';
            div.innerHTML =
                '<div class="shop-item-header">' +
                    '<span style="color:#fff">' + item.name + '</span>' +
                    '<span class="shop-tune-ctl">' +
                        '<span class="shop-tune-btn' + (value <= -3 ? ' shop-tune-off' : '') + '" data-tune="' + item.key + '" data-dir="-1" role="button" tabindex="0" aria-label="' + item.name + ' decrease">\u2212</span>' +
                        '<span style="color:#4fc3f7; min-width:34px; text-align:center">' + (value > 0 ? '+' : '') + value + '</span>' +
                        '<span class="shop-tune-btn' + (value >= 3 ? ' shop-tune-off' : '') + '" data-tune="' + item.key + '" data-dir="1" role="button" tabindex="0" aria-label="' + item.name + ' increase">+</span>' +
                    '</span>' +
                '</div>' +
                '<div class="shop-item-detail">' + (value < 0 ? item.low : value > 0 ? item.high : 'Balanced — drag the \u2212 / + ends') + '</div>';
            div.querySelectorAll('.shop-tune-btn').forEach(btn => {
                const apply = () => {
                    const dir = +btn.dataset.dir;
                    car.tune[item.key] = Math.max(-3, Math.min(3, (car.tune[item.key] || 0) + dir));
                    car.applyUpgrades(); this.scheduleSave(); this.openShop(); this.showNotification('TUNE APPLIED');
                };
                btn.onclick = apply;
                btn.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); apply(); } };
            });
            container.appendChild(div);
        });
    },

    // Draws a small showroom-style preview of a car into a lobby card
    // canvas — used by the Multiplayer ready panel so BOTH drivers see each
    // other's customized car (rims, spoiler, livery...) before racing.
    renderLobbyCar(canvasId, car) {
        const canvas = document.getElementById(canvasId);
        if (!canvas || !car) return;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        // Subtle floor glow, same family as the garage preview.
        const glow = ctx.createRadialGradient(canvas.width / 2, canvas.height * 0.7, 4, canvas.width / 2, canvas.height * 0.7, canvas.width * 0.55);
        glow.addColorStop(0, 'rgba(255,255,255,0.07)');
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        const scale = Math.min((canvas.width - 14) / 104, (canvas.height - 10) / 44);
        ctx.translate((canvas.width - 104 * scale) / 2, canvas.height - 44 * scale - 2);
        ctx.scale(scale, scale);
        Renderer.drawCar(ctx, car, 0, 0);
        ctx.restore();
    },

/* V10G2-MP-NAV-FROM-ANYWHERE */
    openMultiplayerMenu() {
        this.menuState = 'MULTIPLAYER';
        // Hide EVERY overlay, not just the main menu: invite acceptance can
        // land here from the garage, shop, dealership or driver-profile
        // panel — any of them left visible would sit on top of the
        // multiplayer UI (Profile._panelOpen reads the DOM, so hiding is
        // enough for it to resync too). (V10G2-MP-NAV-FROM-ANYWHERE)
        document.querySelectorAll('.menu-overlay').forEach(el => el.classList.add('hidden'));
        document.getElementById('multiplayer-menu').classList.remove('hidden');
        if (typeof MP !== 'undefined') MP.resetMenu();
    },

    /* Live "is this upgrade already maxed?" read, used by the shop's click
       handler so a second click inside the same render pass cannot push a
       staged upgrade past its real last stage. Mirrors the render-time
       isMax rule exactly: booleans are maxed once owned, staged parts once
       the level reaches the item's stage count. */
    _upgradeLevelAtMax(car, item) {
        const lvl = (car && car.upgrades) ? (car.upgrades[item.key] || 0) : 0;
        return item.stages === 1 ? !!lvl : lvl >= item.stages;
    },

    openDealership() {
        this.menuState = 'DEALER';
        document.getElementById('main-menu').classList.add('hidden');
        document.getElementById('dealership-menu').classList.remove('hidden');
        this.updateMenuUI();

        const container = document.getElementById('dealer-items');
        container.innerHTML = '';
        if (!this.previewCar) this.previewCar = new Car(this.carDefs[1]);

        this.carDefs.forEach(def => {
            const isOwned = this.ownedCars.some(c => c.name === def.name);
            const div = document.createElement('div');
            div.className = 'car-item ' + (isOwned ? 'owned' : '');
            const pw = (def.hp / def.weight * 1000).toFixed(0);
            div.innerHTML =
                '<div>' +
                    '<span style="font-size:13px">' + def.name + '</span>' +
                    '<span style="font-size:9px; color:#888; margin-left:6px;">' + def.hp + ' HP &middot; ' + def.weight + 'kg &middot; ' + pw + ' hp/ton</span>' +
                '</div>' +
                '<div style="color:' + (isOwned ? '#4caf50' : (this.cash >= def.price ? '#4caf50' : '#f44336')) + '; font-size:11px;">' +
                    (isOwned ? 'OWNED' : '$' + def.price.toLocaleString()) +
                '</div>';

            div.onclick = () => {
                this.previewCar = new Car({ ...def, customization: null });
                // `isOwned` was captured when the list was RENDERED. Two clicks
                // inside one render pass would both see the stale false and buy
                // the same car twice, so ownership is re-read from the live array
                // at the moment of the click.
                if (this.ownedCars.some(c => c.name === def.name)) {
                    const idx = this.ownedCars.findIndex(c => c.name === def.name);
                    if (idx >= 0) {
                        this.selectedCarIndex = idx;
                        this.playerCar = this.ownedCars[idx];
                        this.scheduleSave();
                        this.showNotification('SELECTED');
                    }
                    return;
                }
                if (this.canAfford(def.price)) {
                    if (!this.spendCash(def.price, 'buy:' + def.name)) return;
                    const newCar = new Car(JSON.parse(JSON.stringify(def)));
                    this.ownedCars.push(newCar);
                    this.selectedCarIndex = this.ownedCars.length - 1;
                    this.playerCar = newCar;
                    this.scheduleSave();
                    this.updateMenuUI();
                    this.openDealership();
                    this.showNotification('PURCHASED!');
                    if (typeof SFX !== 'undefined') SFX.purchase();
                } else {
                    this.showNotification('INSUFFICIENT FUNDS');
                    if (typeof SFX !== 'undefined') SFX.error();
                }
            };
            container.appendChild(div);
        });
    }
};

window.addEventListener('load', () => game.init());
