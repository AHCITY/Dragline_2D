'use strict';

/*
 * ─── Redline 2D — Daily Login Bonus ───────────────────────────────────
 *
 * A small local-first retention loop: once per LOCAL day the main menu
 * shows a slim claim strip; the reward grows with the RETURN STREAK
 * (consecutive days claimed). Everything rides the standard save pipeline,
 * so the streak is namespaced PER ACCOUNT by the save system — a guest's
 * streak and the email driver's streak can never contaminate each other.
 *
 * Design rules:
 *  · LOCAL-FIRST — the day key is what the driver's clock says (same
 *    convention as the career ledger's TODAY strip). No cloud, no clock
 *    server, no PII; offline players get the same bonus.
 *  · HONEST STREAKS — the streak is derived from `last` vs today/yesterday
 *    at render AND claim time, never stored precomputed, so clock changes
 *    and skipped days resolve correctly on their own.
 *  · SINGLE CHOKE POINT — the payout goes through game.awardCash(), the
 *    same audited path as race prizes (sanitize cap, career hooks, save
 *    schedule). The toast reports the amount awardCash ACTUALLY banked.
 *  · INJECTION-PROOF — every dynamic value is a number rendered via
 *    textContent; the strip is static dev-owned markup.
 *  · CLAIM-ONCE — `last` is stamped BEFORE the award, and claim()
 *    re-checks it, so a double-click or a second tab cannot double-pay.
 * ─────────────────────────────────────────────────────────────────────── */

const DAILY_STORAGE_KEY = 'daily_v1';
const DAILY_BASE_BONUS = 250;     // day-1 reward
const DAILY_STREAK_CAP = 5;       // day-5 and beyond pay 250 × 5

const DailyBonus = {
    data: null,
    _wired: false,

    async init() {
        let raw = null;
        try { raw = await SaveSystem.load(DAILY_STORAGE_KEY); } catch (e) {}
        this.data = this._migrate(raw);
        this._wire();
        this.render();
    },

    // ── Public surface used by game.js ──────────────────────────────
    render() {
        const wrap = document.getElementById('daily-bonus');
        if (!wrap || !this.data) return;
        const d = this.data;
        const today = this._dayKey();
        if (d.last === today) { wrap.hidden = true; return; }
        const streak = this._nextStreak();
        const bonus = this._amount(streak);
        wrap.hidden = false;
        const label = document.getElementById('daily-streak');
        if (label) label.textContent = streak > 1 ? 'DAY ' + streak + ' STREAK' : 'DAILY BONUS';
        const amount = document.getElementById('daily-amount');
        if (amount) amount.textContent = '+$' + bonus;
        // Return-run pips: yesterday's chain, lit left to right (max 4).
        const pips = document.getElementById('daily-pips');
        if (pips) {
            pips.textContent = '';
            const lit = Math.min(streak - 1, 4);
            for (let i = 0; i < 4; i++) {
                const s = document.createElement('i');
                if (i < lit) s.className = 'on';
                pips.appendChild(s);
            }
        }
    },

    claim() {
        if (!this.data) return false;
        const today = this._dayKey();
        if (this.data.last === today) return false;   // already claimed today (multi-tab safe)
        const streak = this._nextStreak();
        const bonus = this._amount(streak);
        // Stamp FIRST — the guard above re-reads this on every call.
        this.data.last = today;
        this.data.streak = streak;
        this.data.total = (this.data.total | 0) + bonus;
        this.data.claimed = (this.data.claimed | 0) + 1;
        this._persist();
        const got = game.awardCash(bonus, 'daily-bonus');
        // awardCash does NOT schedule a save itself (race prizes call
        // scheduleSave from finishRace) — without this the bonus banked in
        // memory and evaporated on the next reload.
        game.scheduleSave();
        // Career board feed — daily-claim achievements (CREW HABIT,
        // WEEKLONG WARM-UP) unlock right here, not at the next race.
        if (typeof Career !== 'undefined' && Career.countDaily) Career.countDaily(streak);
        this.render();
        if (got > 0) {
            game.showNotification('DAILY BONUS +$' + got + (streak > 1 ? ' - DAY ' + streak + ' STREAK' : ''));
        } else {
            game.showNotification('STREAK DAY ' + streak + ' SAVED - WALLET FULL');
        }
        game.updateMenuUI();
        return true;
    },

    // ── Internals ───────────────────────────────────────────────────
    _migrate(raw) {
        const d = (raw && typeof raw === 'object') ? raw : {};
        return {
            v: 1,
            last: (typeof d.last === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.last)) ? d.last : null,
            streak: Math.max(0, Math.min(9999, Math.round(Number(d.streak) || 0))),
            total: Math.max(0, Math.round(Number(d.total) || 0)),
            claimed: Math.max(0, Math.round(Number(d.claimed) || 0)),
        };
    },

    _dayKey() {
        const now = new Date();
        return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    },

    _yesterdayKey() {
        const d = new Date();
        d.setDate(d.getDate() - 1);   // handles month/year/DST rollovers
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    },

    _nextStreak() {
        const d = this.data;
        if (d.last === this._yesterdayKey()) return Math.min(9999, (d.streak | 0) + 1);
        return 1;
    },

    _amount(streak) {
        return DAILY_BASE_BONUS * Math.max(1, Math.min(DAILY_STREAK_CAP, streak | 0));
    },

    _persist() {
        SaveSystem.save(DAILY_STORAGE_KEY, this.data).catch(() => {});
    },

    _wire() {
        if (this._wired) return;
        this._wired = true;
        const btn = document.getElementById('daily-claim');
        if (btn) btn.addEventListener('click', () => this.claim());
    },
};

window.DailyBonus = DailyBonus;
