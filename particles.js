'use strict';

/* Hoisted per-frame constants: the smoke lobes used to be two fresh
 * array literals PLUS a slice() allocation for every smoke particle
 * drawn, every frame — pure GC fodder on the hottest draw path. */
const SMOKE_LOBES = [[-0.55, 0.12, 0.55], [-0.28, -0.25, 0.65], [0.06, -0.33, 0.68], [0.38, -0.11, 0.6], [0.52, 0.22, 0.48], [0, 0.22, 0.72]];
const SMOKE_LOBES_SIMPLE = [[0, 0.22, 0.72], [0.06, -0.33, 0.68], [-0.28, -0.25, 0.65]];
const MAX_PARTICLES = 260;   // hard safety cap — spawns above it are dropped

class RaceParticles {
    constructor(ctx) {
        if (!ctx) throw new Error('RaceParticles needs a CanvasRenderingContext2D.');
        this.ctx = ctx;
        this.particles = [];
        this.gearBurst = 0;
        this.boostOrigin = null;
        this.gearOrigin = null;
        this.time = 0;
        this.fxLevel = 0;        // 0 full … 3 minimal (set by game.fxLevel)
        this.rateMult = 1;
        this.simpleSmoke = false;
        this._glowSprite = null;  // cached spray-glow sprite (kills shadowBlur)
        this._puffSprite = null;  // cached gear-smoke sprite (kills per-particle gradients)
    }

    static clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
    static random(min, max) { return min + Math.random() * (max - min); }
    static smoothstep(min, max, value) {
        const t = RaceParticles.clamp((value - min) / (max - min), 0, 1);
        return t * t * (3 - 2 * t);
    }

    /* fxLevel: 0 = High FX (everything), 1-3 = progressively lighter.
     * Only OPTIONAL intensity is reduced — no gameplay-relevant effect
     * (gear flames stay readable, tire smoke still reads as smoke). */
    setFxLevel(level) {
        this.fxLevel = level | 0;
        this.rateMult = [1, 0.6, 0.4, 0.25][this.fxLevel] || 1;
        this.simpleSmoke = this.fxLevel >= 2;
    }

    /* Soft radial sprites rendered ONCE and blitted with drawImage —
     * the same look as shadowBlur / per-particle gradients at a tiny
     * fraction of the raster cost. */
    _glow() {
        if (this._glowSprite) return this._glowSprite;
        const c = document.createElement('canvas'); c.width = 32; c.height = 32;
        const g = c.getContext('2d');
        const grad = g.createRadialGradient(16, 16, 1, 16, 16, 15);
        grad.addColorStop(0, 'rgba(223,247,255,0.95)');
        grad.addColorStop(0.45, 'rgba(125,211,252,0.5)');
        grad.addColorStop(1, 'rgba(125,211,252,0)');
        g.fillStyle = grad; g.fillRect(0, 0, 32, 32);
        this._glowSprite = c;
        return c;
    }
    _puff() {
        if (this._puffSprite) return this._puffSprite;
        const c = document.createElement('canvas'); c.width = 64; c.height = 64;
        const g = c.getContext('2d');
        const grad = g.createRadialGradient(28, 24, 2, 32, 32, 30);
        grad.addColorStop(0, 'rgba(255,220,150,.55)');
        grad.addColorStop(0.4, 'rgba(140,85,50,.30)');
        grad.addColorStop(1, 'rgba(60,40,35,0)');
        g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
        this._puffSprite = c;
        return c;
    }

    _spawn(type, x, y, options = {}) {
        if (this.particles.length >= MAX_PARTICLES) return;
        const random = RaceParticles.random;
        const defaultLife = type === 'boostFlame' ? random(.16, .28) : random(.5, .85);
        this.particles.push({
            type, x, y, vx: options.vx ?? 0, vy: options.vy ?? 0,
            life: options.life ?? defaultLife, maxLife: options.life ?? defaultLife,
            size: options.size ?? 10, seed: Math.random()
        });
    }

    emitTireSmoke(rearWheelX, rearWheelY, burnout = false) {
        const rate = burnout ? 24 : 14;
        if (Math.random() > (rate * this.rateMult) / 120) return;
        const force = burnout ? 1.05 : .72;
        const baseSize = RaceParticles.random(8, 13);
        this._spawn('smoke', rearWheelX + RaceParticles.random(-2, 4), rearWheelY + RaceParticles.random(-4, 4), {
            vx: RaceParticles.random(-160, -100) * force,
            vy: RaceParticles.random(-12, 8),
            life: RaceParticles.random(.5, .85),
            size: baseSize
        });
    }

    triggerGearFlame(exhaustX, exhaustY) {
        this.gearBurst = 0.7;
        this.gearOrigin = { x: exhaustX, y: exhaustY };
    }

    startBoost(exhaustX, exhaustY) { this.boostOrigin = { x: exhaustX, y: exhaustY }; }
    stopBoost() { this.boostOrigin = null; }

    emitWaterSpray(rearWheelX, rearWheelY) {
        for (let i = 0; i < 2; i++) {
            const angle = RaceParticles.random(-2.85, -1.1), speed = RaceParticles.random(35, 105);
            this._spawn('spray', rearWheelX + RaceParticles.random(-6, 6), rearWheelY + RaceParticles.random(-4, 4), {
                vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
                life: RaceParticles.random(.3, .6), size: RaceParticles.random(2, 4)
            });
        }
    }

    update(dt) {
        dt = Math.min(.033, Math.max(0, dt));
        this.time += dt;

        if (this.boostOrigin && Math.random() < dt * 42 * this.rateMult) {
            this._spawn('boostFlame', this.boostOrigin.x, this.boostOrigin.y, {
                vx: RaceParticles.random(-28, -10), vy: RaceParticles.random(-7, 7), size: RaceParticles.random(12, 18)
            });
        }
        if (this.gearBurst > 0 && this.gearOrigin) {
            if (Math.random() < dt * (20 + 18 * this.gearBurst) * this.rateMult) {
                this._spawn('gearFlame', this.gearOrigin.x + RaceParticles.random(-2, 3), this.gearOrigin.y + RaceParticles.random(-4, 4), {
                    vx: RaceParticles.random(-110, -65), vy: RaceParticles.random(-15, 15),
                    life: RaceParticles.random(.22, .38), size: RaceParticles.random(7, 11)
                });
                if (Math.random() < .48) this._spawn('gearSmoke', this.gearOrigin.x - 7, this.gearOrigin.y + RaceParticles.random(-3, 4), {
                    vx: RaceParticles.random(-85, -50), vy: RaceParticles.random(-10, 7),
                    life: RaceParticles.random(.3, .55), size: RaceParticles.random(4, 8)
                });
            }
            this.gearBurst = Math.max(0, this.gearBurst - dt);
        }

        // O(1) Swap-and-Pop for performance [[14]]
        for (let index = this.particles.length - 1; index >= 0; index--) {
            const p = this.particles[index];
            p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt;
            if (p.type === 'smoke') { p.vx *= 1 - .12 * dt; p.vy += (p.seed - .5) * 8 * dt; p.size += 8 * dt; }
            if (p.type === 'spray') { p.vy += 180 * dt; p.vx -= 17 * dt; p.size *= .992; }
            if (p.type === 'boostFlame') { p.size *= .965; p.vy += (p.seed - .5) * 28 * dt; }
            if (p.type === 'gearFlame') { p.vx *= 1 - .35 * dt; p.vy += (p.seed - .5) * 24 * dt; p.size *= .978; }
            if (p.type === 'gearSmoke') { p.vx *= 1 - .16 * dt; p.vy -= 5 * dt; p.size += 7 * dt; }
            
            if (p.life <= 0) {
                this.particles[index] = this.particles[this.particles.length - 1];
                this.particles.pop();
                continue;
            }
        }
    }

    draw() { this.particles.forEach(p => this._drawParticle(p)); }

    _drawParticle(p) {
        const ctx = this.ctx, age = 1 - p.life / p.maxLife;
        const alpha = RaceParticles.smoothstep(0, .1, age) * (1 - RaceParticles.smoothstep(.5, 1, age));
        const s = p.size;
        ctx.save();

        if (p.type === 'smoke') {
            const lobes = this.simpleSmoke ? SMOKE_LOBES_SIMPLE : SMOKE_LOBES;
            ctx.fillStyle = '#d0d8e0';
            ctx.globalAlpha = .38 * alpha;
            for (let i = 0; i < lobes.length; i++) { const L = lobes[i]; ctx.beginPath(); ctx.arc(p.x + L[0] * s, p.y + L[1] * s, s * L[2], 0, Math.PI * 2); ctx.fill(); }
            if (!this.simpleSmoke) {   // highlight pass — same shape, no slice() copy
                ctx.globalAlpha = .44 * alpha; ctx.fillStyle = '#f0f4f8';
                for (let i = 1; i < SMOKE_LOBES.length; i++) { const L = SMOKE_LOBES[i]; ctx.beginPath(); ctx.arc(p.x + L[0] * s * .9, p.y + L[1] * s * .9 - 2, s * L[2] * .78, 0, Math.PI * 2); ctx.fill(); }
            }
            ctx.globalAlpha = .08 * alpha; ctx.fillStyle = '#8a9aaa'; ctx.beginPath(); ctx.ellipse(p.x, p.y + s * .38, s * .68, s * .16, 0, 0, Math.PI * 2); ctx.fill();
        } else if (p.type === 'spray') {
            if (this.fxLevel === 0) {   // soft glow sprite instead of shadowBlur
                ctx.globalAlpha = alpha;
                ctx.drawImage(this._glow(), p.x - s, p.y - s * 1.2, s * 2, s * 2.4);
            } else {
                ctx.globalAlpha = alpha; ctx.fillStyle = '#dff7ff';
                ctx.beginPath(); ctx.ellipse(p.x, p.y, s * .2, s * .48, 0, 0, Math.PI * 2); ctx.fill();
            }
        } else if (p.type === 'gearSmoke') {
            ctx.globalAlpha = .6 * alpha;
            ctx.drawImage(this._puff(), p.x - s * 1.2, p.y - s * .9, s * 2.4, s * 1.8);
        } else { this._drawFlame(p, alpha); }
        ctx.restore();
    }

    _drawFlame(p, alpha) {
        const ctx = this.ctx, gear = p.type === 'gearFlame';
        const length = p.size * (gear ? 1.3 + p.seed * .35 : 1.7 + p.seed * .65), height = p.size * (gear ? .25 + p.seed * .09 : .30 + p.seed * .11);
        ctx.translate(p.x, p.y);
        const tongue = (color, scale) => { ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(4, 0); ctx.quadraticCurveTo(-length * .30, -height * scale, -length, 0); ctx.quadraticCurveTo(-length * .28, height * scale, 4, 0); ctx.fill(); };
        ctx.globalAlpha = .72 * alpha; tongue(gear ? '#9f1239' : '#ef4444', 1);
        ctx.globalAlpha = .85 * alpha; tongue('#fb923c', .65);
        ctx.globalAlpha = alpha; tongue('#fde047', .35);
        ctx.globalAlpha = .78 * alpha; tongue('#e0f2fe', .15);
    }
}