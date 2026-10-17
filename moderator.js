'use strict';

/* ─── Redline 2D — PFP moderation gate (Desert Ant Labs Moderator) ─────
 *
 * On-device NSFW screening for the ONE legitimate avatar route: a fresh
 * upload picked in the Driver Profile panel. Nothing here runs at launch,
 * on a timer, or against already-applied avatars — the SDK is dynamically
 * imported on the first upload that needs it, then the model instance is
 * reused for the rest of the page's life (weights stay cached by HTTP).
 *
 * Official documentation (verified 2026-10, do not guess APIs):
 *   https://desertant.com/docs/moderator/
 *   https://desertant.com/models/moderator/
 * SDK:  @desert-ant-labs/moderator (browser build: WASM + LiteRT.js)
 *       bundled once at development time into vendor/dam/moderator.bundle.js
 * API:  const moderator = await Moderator.load({ modelBaseUrl, litertWasmDir });
 *       const { score, isNSFW, regions } = await moderator.analyze(image, {
 *           threshold, policy, quality });
 *       moderator.dispose();   // we deliberately never dispose mid-session
 * Weights: moderator.tflite (9.2MB, int8) — SELF-HOSTED in vendor/dam/model/
 *       (the SDK otherwise fetches them from the Hugging Face Hub; self-host
 *       keeps the game free of third-party requests and works offline).
 * LiteRT runtime wasm: SELF-HOSTED in vendor/dam/litert/.
 * License: Desert Ant Labs Source-Available 1.0 — free up to 100k monthly
 *       active devices, unlimited inference.
 *
 * KNOWN, DOCUMENTED LIMITS (from the official model card — do not oversell):
 *   · catches 87.8% of NSFW at 6.3% false-block (threshold 0.50, standard);
 *   · covers ADULT content only; minors are out of scope by design;
 *   · does NOT detect graphic violence;
 *   · a moderation aid, not a legal determination.
 *
 * FAIL-CLOSED: if the model cannot be loaded or times out, the upload is
 * REJECTED (the previous avatar stays untouched) and the player may retry.
 * This gate is defense at the only legitimate route — a modified client can
 * still bypass it against the database, which is exactly what the server
 * gate (api/pfp-moderate, where a trusted backend exists) and the database
 * rules' structural checks are documented around. See RULES-NOTES-v7.md.
 * ─────────────────────────────────────────────────────────────────────── */

const PFP_MODERATOR = {
    _mod: null,          // loaded Moderator instance (reused, never disposed)
    _loadPromise: null,  // in-flight load (dedupes concurrent uploads)
    _state: 'idle',      // idle | loading | ready | error
    LOAD_TIMEOUT_MS: 90000,    // 18–46MB first download on slow networks
    ANALYZE_TIMEOUT_MS: 20000,

    /* Runtime asset paths, resolved against the page so the game keeps
       working from a project-subpath host (GitHub Pages style). */
    _base() {
        return new URL('vendor/dam/', document.baseURI);
    },

    status() { return this._state; },

    /* Warm the model without analyzing anything. Used to hide the first
       download behind the "CHECKING IMAGE…" toast instead of adding a
       second, silent stall after it. Never throws. */
    preload() {
        this._load().catch(() => {});
    },

    /* ── Loading ──────────────────────────────────────────────────────── */
    _load() {
        if (this._mod) { this._state = 'ready'; return Promise.resolve(this._mod); }
        if (this._loadPromise) return this._loadPromise;
        this._state = 'loading';
        this._loadPromise = (async () => {
            // Lazy, one-time SDK fetch — the ONLY moment this file ever
            // downloads code. The browser HTTP-caches everything after it.
            const bundleUrl = new URL('moderator.bundle.js', this._base()).href;
            const mod = await import(/* webpackIgnore: true */ bundleUrl);
            const Moderator = mod && mod.Moderator;
            if (!Moderator || typeof Moderator.load !== 'function') {
                throw new Error('moderator bundle: bad export shape');
            }
            const modelBaseUrl = new URL('model/', this._base()).href;
            const litertWasmDir = new URL('litert/', this._base()).href;
            const instance = await Moderator.load({ modelBaseUrl, litertWasmDir });
            this._mod = instance;
            this._state = 'ready';
            return instance;
        })();
        this._loadPromise.catch(() => {
            this._state = 'error';
            this._loadPromise = null;   // allow a later retry to reload
        });
        return this._loadPromise;
    },

    _withTimeout(promise, ms, label) {
        return new Promise((resolve, reject) => {
            const t = setTimeout(() => reject(new Error(label + ' timeout')), ms);
            promise.then(
                v => { clearTimeout(t); resolve(v); },
                e => { clearTimeout(t); reject(e); },
            );
        });
    },

    /* ── The one public verdict ─────────────────────────────────────────
       Input: the EXACT encoded avatar data URL that would be stored.
       Output (never throws): { ok, score?, reason? }
         ok:true                        → allowed  (score 0..1)
         ok:false, reason:'nsfw'        → inappropriate content
         ok:false, reason:'timeout'|'error' → gate unavailable → FAIL CLOSED */
    async moderate(dataUrl) {
        if (typeof dataUrl !== 'string' || dataUrl.indexOf('data:image/') !== 0) {
            return { ok: false, reason: 'error' };
        }
        try {
            const moderator = await this._withTimeout(this._load(), this.LOAD_TIMEOUT_MS, 'model load');
            // analyze() accepts anything createImageBitmap does — a Blob of
            // the final avatar bytes is exactly the stored artifact.
            const blob = await (await fetch(dataUrl)).blob();
            const result = await this._withTimeout(
                moderator.analyze(blob, {
                    threshold: 0.5,        // the evaluated operating point
                    policy: 'standard',    // all five detections count
                    quality: 'accurate',   // the 8-crop pass the card numbers come from
                }),
                this.ANALYZE_TIMEOUT_MS,
                'analyze',
            );
            const score = (result && typeof result.score === 'number')
                ? Math.round(result.score * 1000) / 1000 : null;
            if (result && result.isNSFW) return { ok: false, reason: 'nsfw', score };
            return { ok: true, score };
        } catch (e) {
            try { console.warn('[PFPModerator]', (e && e.message) || e); } catch (_) {}
            this._state = 'error';
            this._loadPromise = null;      // a retry may reload cleanly
            this._mod = null;
            return { ok: false, reason: (String((e && e.message) || '').indexOf('timeout') >= 0) ? 'timeout' : 'error' };
        }
    },
};

window.PFPModerator = PFP_MODERATOR;
