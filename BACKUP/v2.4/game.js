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

const game = {
    canvas: null, ctx: null,
    state: 'MENU', menuState: 'MAIN',
    cash: 2500, ownedCars: [], selectedCarIndex: 0,
    quickStats: { races: 0, wins: 0, recentMargin: 0 },
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
        if (typeof Friends !== 'undefined') await Friends.init();

        this.detectMobile();
        this.setupFullscreenListeners();

        if (this.ownedCars.length === 0) {
            this.ownedCars.push(new Car(this.carDefs[0]));
            this.selectedCarIndex = 0;
            this.scheduleSave();
        }
        this.playerCar = this.ownedCars[this.selectedCarIndex];
        this.effects = new RaceParticles(this.ctx);
        this.setupInput();
        // Keyboard operability for the ghost-race menu button (div-onclick
        // pattern used across the menu; Enter/Space mirrored here).
        const ghostBtn = document.getElementById('ghost-race-btn');
        if (ghostBtn) ghostBtn.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.startGhostRace(); }
        });
        // Same for the SETTINGS entry + its panel controls (role=button
        // divs never fire click from the keyboard on their own).
        document.querySelectorAll('#menu-settings-btn, #settings-menu [role="button"]').forEach(el => {
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
    },

    async loadGame() {
        try {
            const data = await SaveSystem.load(this.SAVE_KEY);
            if (!data) return;

            this.cash = data.cash ?? 2500;
            this.tournamentRound = data.tournamentRound ?? 1;
            this.quickStats = { races: 0, wins: 0, recentMargin: 0, ...(data.quickStats || {}) };
            this.bestET = data.bestET ?? null;
            this.ghostRun = this._sanitizeGhostRun(data.ghost);
            this.currentBackground = data.currentBackground ?? 0;
            this.mpStats = { races: 0, wins: 0, losses: 0, bestET: null, ...(data.mpStats || {}) };
            if (this.currentBackground >= this.backgrounds.length) this.currentBackground = 0;

            this.ownedCars = (data.ownedCars || []).map(cd => {
                const def = {
                    name: cd.name, hp: cd.baseHp, weight: cd.baseWeight,
                    grip: cd.baseGrip, redline: cd.baseRedline, price: cd.price,
                    color: cd.color, secondaryColor: cd.secondaryColor, type: cd.type,
                    art: cd.art || this.carDefs.find(def => def.name === cd.name)?.art || cd.type,
                    gearRatios: cd.baseGearRatios, finalDrive: cd.baseFinalDrive,
                    dragArea: cd.baseDragArea, tune: cd.tune,
                };
                const car = new Car(def);
                car.upgrades = cd.upgrades || car.upgrades;
                // Saved customization IDs are re-hydrated into drawable catalog
                // entries. Old saves without customization fall back to stock.
                car.customization = cd.customization ? hydrateCustomization(cd.customization) : car._stockCustomization();
                car.applyUpgrades();
                return car;
            });
            this.selectedCarIndex = Math.min(data.selectedCarIndex ?? 0, Math.max(0, this.ownedCars.length - 1));
        } catch (e) {
            console.warn('Load failed, starting fresh:', e);
            this.cash = 2500;
            this.tournamentRound = 1;
            this.ownedCars = [];
        }
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
            const k = e.key.toLowerCase();
            if (k === 'escape') {
                if (this.state === 'MENU' && this.closeSettingsIfOpen()) return;
                this.togglePause();
                return;
            }
            if (k === 'm') { this.toggleSound(); return; }
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
        requestAnimationFrame(t => this.loop(t));
        const realDt = (timestamp - this.lastTimestamp) / 1000;
        this.lastTimestamp = timestamp;

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
                if (lit >= 4) { SFX.go(); if (p.gas > 0.1) SFX.launch(); } else SFX.beep();
            }
            this.lights = lit;
            o.clutch = 1; o.gear = 1;
            o.gas = (Math.sin(performance.now() / 150) > 0) ? 1 : 0;
            o.rpm = 1000 + (o.redline - 1000) * 0.5 * (0.5 + 0.5 * Math.sin(performance.now() / 200));

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
                    p.shiftTimer = 0.1;
                }
            }

            // Hard braking from speed screeches the tires (throttled in SFX).
            if (p.brake > 0 && p.speed > 8 && typeof SFX !== 'undefined') SFX.brake(p.speed);

            if (this.raceTimer > o.reactionTime && !o.launched && this.raceMode !== 'ghost') {
                o.launched = true; o.clutch = 0; o.gas = 1; o.gear = 1;
            }
            if (o.launched && this.raceMode !== 'ghost') {
                o.clutch = 0; o.gas = 1;
                if (o.rpm > o.redline * (o.aiShiftPoint || 0.92) && o.gear < o.gearRatios.length - 1) o.shiftUp();
                if (o.rpm > o.redline - 100) o.rpm = o.redline - 200;
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
                if (lit >= 4) { SFX.go(); if (p.gas > 0.1) SFX.launch(); } else SFX.beep();
            }
            this.lights = lit;

            // Green check FIRST — same throttled-frame guard as the SP path:
            // once elapsed passes 4s the light IS green, so nobody can be
            // red-lit by a late frame any more.
            if (elapsed >= 4) {
                this.raceState = 'RUNNING';
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
        // Capture WHY we're finishing before overwriting the state — a fast
        // opponent only means "false start" while the light is still counting.
        const stateAtFinish = this.raceState;
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

        // A pre-start finish is the ONLY case where speed > 0.5 means the peer
        // jumped the gun. Once RUNNING, a fast replica is just... racing —
        // never misfire the false-start bonus when their report times out.
        const fallbackRemote = {
            falseStart: stateAtFinish === 'COUNTDOWN' && !!(o && o.speed > 0.5),
            finishTime: o && o.finished ? o.finishTime : 999,
        };
        MP.reportOutcome(localReport, fallbackRemote, (remote) => this._applyMultiplayerOutcome(localReport, remote));
    },

    _applyMultiplayerOutcome(local, remote, titleOverride) {
        const p = this.playerCar;
        // Capture trap speed NOW — this runs synchronously at the finish, while
        // the results screen renders ~400ms later after the car has been braking.
        const trapSpeed = p.trapSpeed || p.speed;
        let title, prize;
        if (local.falseStart && remote.falseStart) { title = 'BOTH FALSE STARTED'; prize = 0; }
        else if (local.falseStart) { title = 'FALSE START'; prize = 0; }
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

        // Friends presence memory — remember when you last raced this driver.
        if (typeof Friends !== 'undefined' && Friends.touchLastRaced &&
            typeof MP !== 'undefined' && MP.remoteProfile && MP.remoteProfile.id) {
            Friends.touchLastRaced(Friends.normalizeCode(MP.remoteProfile.id));
        }

        this.cash += prize;
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

        let playerTime, reactionTime, prize = 0;
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
                } else if (this.tournamentRound >= 3) {
                    prize = this.activeTournamentTier?.prize || 5000;
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
                    if (this.raceMode === 'quick') this.quickStats.races++;
                    // A tournament loss ends the run. A new entry always starts at Heat 1.
                    if (this.raceMode === 'tournament') this.tournamentRound = 1;
                }
            }
        }

        const prevBest = this.bestET;
        if (playerTime > 0 && (!this.bestET || playerTime < this.bestET)) this.bestET = playerTime;
        const isRecord = playerTime > 0 && (!prevBest || playerTime < prevBest);
        // A new personal best in a ghost-capable mode becomes the new ghost.
        // Seed rule: a pre-existing bestET (recorded before ghosts existed,
        // or carried from an old save) seeds the ghost on the next legit
        // finish so the feature is never stuck behind an unbeaten record.
        const seedGhost = playerTime > 0 && !this.ghostRun &&
            (this.raceMode === 'quick' || this.raceMode === 'ghost');
        if ((isRecord || seedGhost) && this._ghostSamples && this._ghostSamples.length) {
            this._commitGhostRun(playerTime);
        }
        this.cash += prize;
        this.raceResults = {
            playerTime, playerReaction: reactionTime, won,
            opponentName: o.name, trapSpeed, reason
        };

        if (this.raceMode === 'quick') this._pendingRotation = true;
        this.scheduleSave();

        setTimeout(() => {
            this.state = 'RESULTS';
            document.getElementById('ui-layer').classList.add('hidden');
            document.getElementById('pause-btn').classList.add('hidden');
            document.getElementById('results-menu').classList.remove('hidden');
            const title = document.getElementById('result-title');
            title.innerText = reason || (won ? 'VICTORY' : 'DEFEAT');
            title.style.color = won ? '#4caf50' : '#f44336';
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
            document.getElementById('result-prize').innerText = '$' + prize;
            if (typeof SFX !== 'undefined') {
                SFX.finish(!!won && !falseStart);
                if (prize > 0) setTimeout(() => SFX.cash(), 700);
            }
            const rec = document.getElementById('result-record');
            if (rec) rec.classList.toggle('hidden', !isRecord);
            // MP tournament series standing (hidden everywhere else).
            const seriesEl = document.getElementById('result-series');
            if (seriesEl) seriesEl.classList.add('hidden');
            // Opponent-ET row doubles as the GHOST ET row in ghost races;
            // every other single-player mode keeps it hidden.
            const oppRow = document.getElementById('result-opp-row');
            const oppLabel = document.getElementById('result-opp-label');
            const oppEl = document.getElementById('result-opp-time');
            if (oppRow && oppEl) {
                const showGhost = this.raceMode === 'ghost' && this.ghostRun;
                oppRow.classList.toggle('hidden', !showGhost);
                oppRow.classList.toggle('results-row-ghost', !!showGhost);
                if (showGhost) {
                    if (oppLabel) oppLabel.innerText = 'Ghost ET:';
                    oppEl.innerText = this.ghostRun.et.toFixed(3) + 's';
                }
            }
            const rematchBtn = document.getElementById('result-rematch-btn');
            if (rematchBtn) { rematchBtn.classList.add('hidden'); rematchBtn.innerText = 'REMATCH'; }
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

    drawBackground(ctx, W, H, camX) {
        const bg = this.backgrounds[this.currentBackground];
        if (bg === 'sunset_highway') return this.bgSunsetHighway(ctx, W, H, camX);
        if (bg === 'industrial') return this.bgIndustrial(ctx, W, H, camX);
        if (bg === 'mountain_dusk') return this.bgMountainDusk(ctx, W, H, camX);
        if (bg === 'neon_tokyo') return this.bgNeonTokyo(ctx, W, H, camX);
        return this.bgNightCity(ctx, W, H, camX);
    },

    _fillSky(ctx, W, H, topColor, midColor, botColor) {
        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, topColor);
        grad.addColorStop(0.5, midColor);
        grad.addColorStop(1, botColor);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
    },

    bgNightCity(ctx, W, H, camX) {
        this._fillSky(ctx, W, H, '#021a35', '#0a2a50', '#0d47a1');
        ctx.fillStyle = '#fff';
        for (let i = 0; i < 40; i++) {
            const sx = (i * 137.5) % W;
            const sy = (i * 67.3) % (H * 0.4);
            const size = (i % 3 === 0) ? 2 : 1;
            ctx.globalAlpha = 0.3 + Math.abs(Math.sin(i)) * 0.5;
            ctx.fillRect(sx, sy, size, size);
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#050a14';
        const base = H * 0.72;
        for (let i = 0; i < Math.floor(W / 45) + 4; i++) {
            const seed = i * 137.5;
            const h = 60 + Math.abs(Math.sin(seed)) * 90 + Math.abs(Math.cos(seed * 0.7)) * 40;
            let bx = (i * 45) - (camX * 0.08);
            bx = ((bx % (W + 200)) + W + 200) % (W + 200) - 100;
            ctx.fillRect(bx, base - h, 40, h);
            for (let wy = 0; wy < Math.floor(h / 22); wy++) {
                for (let wx = 0; wx < 2; wx++) {
                    ctx.fillStyle = Math.abs(Math.sin(seed + wy * 31 + wx * 17)) > 0.55 ? '#1a2a4a' : '#0a1525';
                    ctx.fillRect(bx + 8 + wx * 16, base - h + 12 + wy * 22, 8, 10);
                }
            }
            ctx.fillStyle = '#050a14';
        }
    },

    bgSunsetHighway(ctx, W, H, camX) {
        this._fillSky(ctx, W, H, '#2b1055', '#c96e4a', '#f7b267');
        const sunY = H * 0.55;
        const sunX = W * 0.7 - (camX * 0.02) % (W * 1.5);
        const sunGrad = ctx.createRadialGradient(sunX, sunY, 5, sunX, sunY, 90);
        sunGrad.addColorStop(0, '#fff2a8');
        sunGrad.addColorStop(0.4, '#ffb347');
        sunGrad.addColorStop(1, 'rgba(255,100,50,0)');
        ctx.fillStyle = sunGrad;
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#1a0a2a';
        for (let i = 0; i < Math.floor(W / 80) + 3; i++) {
            const seed = i * 91.3;
            const h = 40 + Math.abs(Math.sin(seed)) * 40;
            let bx = (i * 80) - (camX * 0.05);
            bx = ((bx % (W + 300)) + W + 300) % (W + 300) - 150;
            ctx.beginPath();
            ctx.moveTo(bx, H * 0.72);
            ctx.lineTo(bx + 40, H * 0.72 - h);
            ctx.lineTo(bx + 80, H * 0.72);
            ctx.closePath();
            ctx.fill();
        }
        ctx.fillStyle = '#0d0418';
        for (let i = 0; i < Math.floor(W / 180) + 2; i++) {
            let px = (i * 180 + 50) - (camX * 0.12);
            px = ((px % (W + 400)) + W + 400) % (W + 400) - 200;
            const baseY = H * 0.72;
            ctx.fillRect(px, baseY - 70, 4, 70);
            for (let a = 0; a < 5; a++) {
                const angle = -Math.PI / 2 + (a - 2) * 0.5;
                ctx.save();
                ctx.translate(px + 2, baseY - 70);
                ctx.rotate(angle);
                ctx.fillRect(0, -18, 3, 18);
                ctx.restore();
            }
        }
    },

    bgIndustrial(ctx, W, H, camX) {
        this._fillSky(ctx, W, H, '#1a1005', '#2a1a08', '#3a2a10');
        ctx.fillStyle = '#e8d8a0';
        ctx.beginPath();
        ctx.arc(W * 0.15, H * 0.18, 22, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1a1005';
        ctx.beginPath();
        ctx.arc(W * 0.17, H * 0.16, 18, 0, Math.PI * 2);
        ctx.fill();
        const base = H * 0.72;
        ctx.fillStyle = '#0a0500';
        for (let i = 0; i < Math.floor(W / 100) + 3; i++) {
            const seed = i * 53.7;
            let bx = (i * 100) - (camX * 0.06);
            bx = ((bx % (W + 300)) + W + 300) % (W + 300) - 150;
            const w = 60 + Math.abs(Math.sin(seed)) * 40;
            const h = 80 + Math.abs(Math.cos(seed)) * 60;
            ctx.fillRect(bx, base - h, w, h);
            for (let s = 0; s < 2; s++) {
                const sx = bx + 10 + s * (w - 30);
                ctx.fillRect(sx, base - h - 40, 8, 40);
                ctx.fillStyle = 'rgba(80,70,60,0.3)';
                for (let p = 0; p < 3; p++) {
                    ctx.beginPath();
                    ctx.arc(sx + 4 + p * 5, base - h - 45 - p * 12, 8 + p * 3, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.fillStyle = '#0a0500';
            }
            for (let wy = 0; wy < 3; wy++) {
                for (let wx = 0; wx < Math.floor(w / 20); wx++) {
                    if (Math.abs(Math.sin(seed + wy * 13 + wx * 7)) > 0.5) {
                        ctx.fillStyle = '#c9a050';
                        ctx.fillRect(bx + 8 + wx * 20, base - h + 15 + wy * 25, 8, 12);
                        ctx.fillStyle = '#0a0500';
                    }
                }
            }
        }
    },

    bgMountainDusk(ctx, W, H, camX) {
        this._fillSky(ctx, W, H, '#0a0520', '#2a1a4a', '#6a3a7a');
        ctx.fillStyle = '#fff';
        for (let i = 0; i < 30; i++) {
            const sx = (i * 173.3) % W;
            const sy = (i * 47.1) % (H * 0.35);
            ctx.globalAlpha = 0.4 + Math.abs(Math.sin(i * 1.3)) * 0.4;
            ctx.fillRect(sx, sy, 2, 2);
        }
        ctx.globalAlpha = 1;
        for (let layer = 0; layer < 2; layer++) {
            const offset = layer * 60;
            const speed = 0.04 + layer * 0.03;
            const baseY = H * 0.72 - offset * 0.3;
            ctx.fillStyle = layer === 0 ? '#2a1a3a' : '#0f0520';
            for (let i = 0; i < Math.floor(W / 120) + 3; i++) {
                const seed = i * 71.1 + layer * 100;
                let bx = (i * 120) - (camX * speed);
                bx = ((bx % (W + 400)) + W + 400) % (W + 400) - 200;
                ctx.beginPath();
                ctx.moveTo(bx - 40, baseY);
                ctx.lineTo(bx, baseY - 70 - Math.abs(Math.sin(seed)) * 50);
                ctx.lineTo(bx + 40, baseY - 30 - Math.abs(Math.cos(seed)) * 30);
                ctx.lineTo(bx + 80, baseY);
                ctx.closePath();
                ctx.fill();
            }
        }
    },

    bgNeonTokyo(ctx, W, H, camX) {
        this._fillSky(ctx, W, H, '#05000d', '#12002a', '#1e003a');
        const base = H * 0.72;
        for (let i = 0; i < Math.floor(W / 65) + 3; i++) {
            const seed = i * 189.7;
            const h = 55 + Math.abs(Math.sin(seed)) * 80;
            let bx = (i * 65) - (camX * 0.09);
            bx = ((bx % (W + 300)) + W + 300) % (W + 300) - 150;
            ctx.fillStyle = '#08001a';
            ctx.fillRect(bx, base - h, 55, h);
            const neonColors = ['#c9407a', '#5fa8b8', '#b8923a', '#5ca87a'];
            for (let ny = 0; ny < Math.floor(h / 45); ny++) {
                const colorSeed = Math.abs(Math.sin(seed * 1.3 + ny * 5.1));
                if (colorSeed > 0.55) {
                    const color = neonColors[Math.floor(colorSeed * 100) % neonColors.length];
                    ctx.fillStyle = color;
                    ctx.globalAlpha = 0.35;
                    ctx.fillRect(bx + 6, base - h + 12 + ny * 45, 18, 2);
                    ctx.globalAlpha = 1;
                }
            }
            for (let wy = 0; wy < Math.floor(h / 20); wy++) {
                for (let wx = 0; wx < 3; wx++) {
                    if (Math.abs(Math.sin(seed + wy * 23 + wx * 13)) > 0.7) {
                        ctx.fillStyle = '#1a2a4a';
                        ctx.fillRect(bx + 6 + wx * 16, base - h + 12 + wy * 20, 8, 6);
                    }
                }
            }
        }
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
        if (score < 0.38) return { name: 'LIGHT CUP', ai: 0.98, prize: 5000, start: 0 };
        if (score < 0.66) return { name: 'STREET KINGS', ai: 1.03, prize: 18000, start: 2 };
        return { name: 'PRO LEAGUE', ai: 1.08, prize: 50000, start: 4 };
    },

    getQuickOpponent() {
        const playerScore = this.performanceScore(this.playerCar);
        const upgrades = Object.values(this.playerCar.upgrades).reduce((sum, value) => sum + (value === true ? 1 : (typeof value === 'number' ? Math.max(0, value - 1) : 0)), 0);
        const earlyCareer = this.quickStats.races < 4 && upgrades === 0;
        const skill = earlyCareer ? 0.67 + this.quickStats.races * 0.035 : Math.min(1.12, 0.86 + upgrades * 0.025 + this.quickStats.wins / Math.max(1, this.quickStats.races) * 0.08);
        const target = playerScore * skill;
        let best = this.carDefs[0], bestGap = Infinity;
        for (const def of this.carDefs) {
            const gap = Math.abs(def.hp / def.weight - target);
            if (gap < bestGap) { best = def; bestGap = gap; }
        }
        return { def: best, scale: skill * (0.96 + Math.random() * 0.08), reaction: earlyCareer ? 0.46 + Math.random() * .14 : Math.max(.15, .34 - upgrades * .01 + Math.random() * .08), shift: earlyCareer ? .84 : .89 + Math.min(.05, upgrades * .006) };
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
        this.raceMode = mode;
        this.state = 'RACE';
        this.menuState = 'RACE';
        this.raceState = 'STAGING';
        this.finished = false;
        this.paused = false;
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

        let def, scaleFactor, aiShift;
        if (mode === 'quick') {
            const match = this.getQuickOpponent();
            def = match.def; scaleFactor = match.scale; aiShift = match.shift;
            this._opponentReaction = match.reaction;
        } else {
            const tier = this.getTournamentTier();
            def = this.carDefs[Math.min(this.carDefs.length - 1, tier.start + this.tournamentRound - 1)];
            scaleFactor = tier.ai + (this.tournamentRound - 1) * .035;
            aiShift = .91 + this.tournamentRound * .01;
            this._opponentReaction = Math.max(.12, .32 - this.tournamentRound * .025);
            this.activeTournamentTier = tier;
        }

        this.opponentCar = new Car({ ...def, randomizeCustomization: true });
        this.opponentCar.hp = Math.floor(def.hp * scaleFactor);
        this.opponentCar.reactionTime = this._opponentReaction;
        this.opponentCar.aiShiftPoint = aiShift;

        document.getElementById('opp-name').innerText = mode === 'tournament' ? this.activeTournamentTier.name + ' • ' + this.opponentCar.name : this.opponentCar.name;
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
        document.getElementById('main-menu').classList.add('hidden');
        document.getElementById('garage-menu').classList.remove('hidden');
        const container = document.getElementById('car-stats-display');
        container.innerHTML = '';
        this.ownedCars.forEach((car, index) => {
            const div = document.createElement('div');
            div.className = 'car-item ' + (index === this.selectedCarIndex ? 'selected' : '');
            const hp = Math.round(car.hp);
            const pw = (car.hp / car.weight * 1000).toFixed(0);
            div.innerHTML =
                '<div>' +
                    '<div style="color:' + car.color + '; font-size:14px;">' + car.name + '</div>' +
                    '<div style="font-size:9px; color:#aaa; margin-top:5px;">' +
                        hp + ' HP &middot; ' + car.weight + 'kg &middot; ' + pw + ' hp/ton' +
                    '</div>' +
                    '<div style="font-size:8px; color:#555; margin-top:3px;">' +
                        'Redline: ' + car.redline + ' &middot; Grip: ' + car.grip.toFixed(2) +
                    '</div>' +
                '</div>' +
                (index === this.selectedCarIndex
                    ? '<div style="color:#ffeb3b; font-size:10px;">DRIVING</div>'
                    : '<div style="color:#4caf50; font-size:9px;">SELECT</div>');
            div.onclick = () => {
                this.selectedCarIndex = index;
                this.playerCar = this.ownedCars[index];
                this.scheduleSave();
                this.openGarage();
            };
            container.appendChild(div);
        });
        this._renderGarageCustomizer();
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
        if (!panel) return;
        const car = this.playerCar;
        panel.innerHTML = '';
        if (!car) { panel.classList.add('hidden'); return; }
        panel.classList.remove('hidden');

        const title = document.createElement('div');
        title.className = 'gar-title';
        title.innerHTML = 'CUSTOMIZE <span class="gar-title-car">' + car.name.toUpperCase() + '</span>';
        panel.appendChild(title);

        const preview = document.createElement('canvas');
        preview.id = 'garage-preview';
        preview.width = 340;
        preview.height = 120;
        preview.setAttribute('aria-label', 'Preview of your customized car');
        panel.appendChild(preview);

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
        rows.appendChild(this._makePaintRow('PAINT', 'paint'));
        rows.appendChild(this._makePaintRow('ACCENT', 'accent'));
        rows.appendChild(this._makeRimPaintRow());
        this.GAR_GROUPS.forEach(({ key, label, group }) => {
            // rimPaint already rendered as its own swatch row above.
            if (key === 'rimPaint') return;
            const list = window.CUSTOMIZATION[group];
            const current = car.customization[key] || list[0];
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
            val.textContent = String(current.name || current.id || 'stock').toUpperCase();

            row.appendChild(prev);
            row.appendChild(lab);
            row.appendChild(val);
            row.appendChild(next);
            rows.appendChild(row);
        });
        panel.appendChild(rows);

        const hint = document.createElement('div');
        hint.className = 'gar-hint';
        hint.textContent = 'LOOKS ONLY — STATS NEVER CHANGE';
        panel.appendChild(hint);

        this._drawGaragePreview();
    },

    _drawGaragePreview() {
        const canvas = document.getElementById('garage-preview');
        if (!canvas || !this.playerCar) return;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        // Showroom spotlight glow
        const glow = ctx.createRadialGradient(canvas.width / 2, canvas.height * 0.62, 8, canvas.width / 2, canvas.height * 0.62, 170);
        glow.addColorStop(0, 'rgba(255,255,255,0.10)');
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        const scale = 2.9;
        ctx.translate((canvas.width - 104 * scale) / 2, canvas.height - 44 * scale - 6);
        ctx.scale(scale, scale);
        Renderer.drawCar(ctx, this.playerCar, 0, 0);
        ctx.restore();
        // Frame line
        ctx.strokeStyle = '#2c2f38';
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);
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
        this._renderGarageCustomizer();
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

    _makePaintRow(label, kind) {
        const car = this.playerCar;
        const paint = this.PAINTS[this._paintIdx(kind === 'accent' ? car.secondaryColor : car.color)];

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
        // backgroundColor (NOT the shorthand) — the shorthand would wipe the
        // checkerboard underlay that makes dark paints readable as chips.
        sw.style.backgroundColor = paint.hex;
        // The checker underlay only earns its keep on dark paints; on bright
        // ones it just reads as noise.
        const _hex = parseInt(paint.hex.slice(1), 16);
        const _lum = (0.2126 * ((_hex >> 16) & 255) + 0.7152 * ((_hex >> 8) & 255) + 0.0722 * (_hex & 255)) / 255;
        if (_lum < 0.35) sw.classList.add('gar-swatch-dark');
        val.appendChild(sw);
        val.appendChild(document.createTextNode(paint.name));

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
    _makeRimPaintRow() {
        const car = this.playerCar;
        const list = CUSTOMIZATION.rimPaints;
        const sel = car.customization.rimPaint || list[0];
        const resolved = rimPaintColor(car, '#6f7780');

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
        sw.style.backgroundColor = resolved;
        const _hex = parseInt((resolved || '#6f7780').slice(1), 16);
        const _lum = (0.2126 * ((_hex >> 16) & 255) + 0.7152 * ((_hex >> 8) & 255) + 0.0722 * (_hex & 255)) / 255;
        if (_lum < 0.35) sw.classList.add('gar-swatch-dark');
        val.appendChild(sw);
        val.appendChild(document.createTextNode(String(sel.name || 'stock').toUpperCase()));

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
        this._renderGarageCustomizer();
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
        this._renderGarageCustomizer();
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
        this._renderGarageCustomizer();
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

            const div = document.createElement('div');
            div.className = 'shop-item';
            div.innerHTML =
                '<div class="shop-item-header">' +
                    '<span style="color:#fff">' + item.name +
                        ' <span style="color:#666">' + (isBool ? (isMax ? '✓' : '') : 'Lvl ' + lvl) + '</span>' +
                    '</span>' +
                    '<span style="color:' + (isMax ? '#4caf50' : (this.cash >= cost ? '#4caf50' : '#f44336')) + '">' +
                        (isMax ? 'MAX' : '$' + cost.toLocaleString()) +
                    '</span>' +
                '</div>' +
                '<div class="shop-item-detail">' + item.desc + '</div>';

            div.onclick = () => {
                if (isMax) return;
                if (this.cash >= cost) {
                    this.cash -= cost;
                    if (isBool) car.upgrades[item.key] = true;
                    // (n || 0) + 1 — guards base-0 keys missing from older saves.
                    else car.upgrades[item.key] = (car.upgrades[item.key] || 0) + 1;
                    car.applyUpgrades();
                    this.scheduleSave();
                    this.updateMenuUI();
                    this.openShop();
                    this.showNotification('INSTALLED');
                    if (typeof SFX !== 'undefined') SFX.cash();
                } else {
                    this.showNotification('INSUFFICIENT FUNDS');
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

    openMultiplayerMenu() {
        this.menuState = 'MULTIPLAYER';
        document.getElementById('main-menu').classList.add('hidden');
        document.getElementById('multiplayer-menu').classList.remove('hidden');
        if (typeof MP !== 'undefined') MP.resetMenu();
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
                if (isOwned) {
                    const idx = this.ownedCars.findIndex(c => c.name === def.name);
                    if (idx >= 0) {
                        this.selectedCarIndex = idx;
                        this.playerCar = this.ownedCars[idx];
                        this.scheduleSave();
                        this.showNotification('SELECTED');
                    }
                    return;
                }
                if (this.cash >= def.price) {
                    this.cash -= def.price;
                    const newCar = new Car(JSON.parse(JSON.stringify(def)));
                    this.ownedCars.push(newCar);
                    this.selectedCarIndex = this.ownedCars.length - 1;
                    this.playerCar = newCar;
                    this.scheduleSave();
                    this.updateMenuUI();
                    this.openDealership();
                    this.showNotification('PURCHASED!');
                    if (typeof SFX !== 'undefined') SFX.cash();
                } else {
                    this.showNotification('INSUFFICIENT FUNDS');
                }
            };
            container.appendChild(div);
        });
    }
};

window.addEventListener('load', () => game.init());
