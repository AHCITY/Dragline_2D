'use strict';

/*
 * ─── Redline 2D — Career Ledger & Achievements ────────────────────────
 *
 * A local-first lifetime record of everything the driver has done on this
 * device, plus the achievement board that turns those numbers into goals.
 *
 * Design rules (mirrors profile.js):
 *  1. LOCAL-FIRST — the device copy is the single source of truth. Storage
 *     failures degrade silently: the worst case is that achievements don't
 *     persist, never that gameplay breaks.
 *  2. OWN NOTHING ELSE — cash, cars and identity live in game.js/profile.js.
 *     This module only READS live values (cash, garage size) at evaluation
 *     time and stores its own counters under its own save key.
 *  3. TINY PAYLOADS — a few dozen integers + an achievement map. Save is
 *     debounced (400ms) through the same SaveSystem pipeline as the rest.
 *  4. ZERO-COST HOOKS — recording is plain counter math; the expensive
 *     work (DOM render, toasts) only happens on evaluation with something
 *     new to show. Every hook is typeof-guarded so the game runs even if
 *     this file somehow fails to load.
 * ─────────────────────────────────────────────────────────────────────── */

const CAREER_STORAGE_KEY = 'career_v1';
const CAREER_HISTORY_CAP = 100;  // newest 100 races kept for the RACE LEDGER
const CAREER_SPARK_CAP = 20;     // last 20 timed runs on the ET progression chart
// The ledger renders every kept entry inside its own scroll area — no row cap.

const Career = {
    data: null,
    ready: false,
    _saveTimer: null,
    _toastQueue: [],
    _toastBusy: false,

    // The board. `stat` names a field of the live-values snapshot taken at
    // evaluation time (see _liveValues); lowerBetter flips the comparison
    // for ET-style goals where SMALLER is better.
    ACHIEVEMENTS: [
        { id: 'first_win',   name: 'FIRST WIN',       desc: 'Win your first race',                 goal: 1,     stat: 'wins' },
        { id: 'races_10',    name: 'REGULAR',         desc: 'Finish 10 races',                     goal: 10,    stat: 'races' },
        { id: 'races_50',    name: 'VETERAN',         desc: 'Finish 50 races',                     goal: 50,    stat: 'races' },
        { id: 'races_200',   name: 'NIGHT SHIFT',     desc: 'Finish 200 races',                    goal: 200,   stat: 'races' },
        { id: 'streak_3',    name: 'HEATING UP',      desc: 'Win 3 races in a row',                goal: 3,     stat: 'bestStreak' },
        { id: 'streak_5',    name: 'ON FIRE',         desc: 'Win 5 races in a row',                goal: 5,     stat: 'bestStreak' },
        { id: 'et_15',       name: 'QUARTZ LINE',     desc: 'Run a 15.0s quarter or faster',       goal: 15,    stat: 'bestET', lowerBetter: true },
        { id: 'et_12',       name: 'GOLD RUN',        desc: 'Run a 12.0s quarter or faster',       goal: 12,    stat: 'bestET', lowerBetter: true },
        { id: 'et_10',       name: 'REDLINE ROYALTY', desc: 'Run a 10.0s quarter or faster',       goal: 10,    stat: 'bestET', lowerBetter: true },
        { id: 'perfect_25',  name: 'SHIFT ARTIST',    desc: 'Land 25 perfect shifts',              goal: 25,    stat: 'perfectShifts' },
        { id: 'perfect_100', name: 'METRONOME',       desc: 'Land 100 perfect shifts',             goal: 100,   stat: 'perfectShifts' },
        { id: 'garage_3',    name: 'COLLECTOR',       desc: 'Own 3 cars at once',                  goal: 3,     stat: 'cars' },
        { id: 'garage_6',    name: 'FULL GARAGE',     desc: 'Own 6 cars at once',                  goal: 6,     stat: 'cars' },
        { id: 'cash_50k',    name: 'POCKET MONEY',    desc: 'Hold $50,000 at once',                goal: 50000, stat: 'cashPeak' },
        { id: 'champ_1',     name: 'CIRCUIT CHAMP',   desc: 'Win a full tournament',               goal: 1,     stat: 'tournamentsWon' },
        { id: 'mp_win_1',    name: 'HUMAN SCALP',     desc: 'Beat a real opponent online',         goal: 1,     stat: 'mpWins' },
        { id: 'ghost_1',     name: 'PAST MASTER',     desc: 'Beat your own ghost',                 goal: 1,     stat: 'ghostWins' },
        // XP & daily-board extensions (Task 18). `level` and `xp` come from
        // the live-values snapshot (levelInfo / d.xp); the daily stats are
        // fed by DailyBonus.claim() through countDaily().
        { id: 'daily_1',     name: 'CREW HABIT',      desc: 'Claim your first daily bonus',        goal: 1,     stat: 'dailyClaims' },
        { id: 'daily_7',     name: 'WEEKLONG WARM-UP',desc: 'Claim the daily bonus 7 days in a row', goal: 7,   stat: 'dailyStreakBest' },
        { id: 'lvl_5',       name: 'SEASONED DRIVER', desc: 'Reach driver level 5',                goal: 5,     stat: 'level' },
        { id: 'lvl_10',      name: 'STREET LEGEND',   desc: 'Reach driver level 10',               goal: 10,    stat: 'level' },
        { id: 'xp_5k',       name: 'NIGHT GRINDER',   desc: 'Earn 5,000 career XP',                goal: 5000,  stat: 'xp' },
    ],

    // ── Driver XP / level curve ─────────────────────────────────────────
    // Advancing from level n costs round(80 × n^1.22) XP — a gentle early
    // ramp (80 XP to level 2) that stretches as levels climb. XP comes from
    // racing: wins 80–110 by mode, losses 30–40, tournament titles +150.
    // Derived on the fly from the stored xp total (never stored as a level
    // field), so the curve can be tuned without a migration.
    XP_BASE: 80,
    XP_GROWTH: 1.22,
    XP_LEVEL_CAP: 60,
    XP_TABLE: { quickWin: 80, tournamentWin: 90, ghostWin: 100, loss: 30, championBonus: 150, mpWin: 110, mpLoss: 40 },

    // XP needed to advance FROM level n (1-based). Monotonic, integer.
    xpForLevel(n) {
        const k = Math.max(1, Math.min(this.XP_LEVEL_CAP - 1, n | 0));
        return Math.round(this.XP_BASE * Math.pow(k, this.XP_GROWTH));
    },

    // Walk the cumulative curve — O(level) with a hard cap, fine for UI rates.
    levelFromXp(xp) {
        let level = 1, left = Math.max(0, Math.floor(+xp || 0));
        while (level < this.XP_LEVEL_CAP) {
            const cost = this.xpForLevel(level);
            if (left < cost) break;
            left -= cost;
            level++;
        }
        return level;
    },

    // Snapshot for UI (header chip + career bar). `into` = XP spent inside
    // the current level, `need` = cost of the NEXT step (null at the cap).
    levelInfo() {
        if (!this.ready || !this.data) return { level: 1, into: 0, need: this.xpForLevel(1), pct: 0 };
        const total = Math.max(0, Math.floor(+this.data.xp || 0));
        let level = 1, left = total;
        while (level < this.XP_LEVEL_CAP) {
            const cost = this.xpForLevel(level);
            if (left < cost) break;
            left -= cost;
            level++;
        }
        const atCap = level >= this.XP_LEVEL_CAP;
        const need = atCap ? null : this.xpForLevel(level);
        return {
            level,
            xp: total,
            into: atCap ? 0 : left,
            need,
            pct: atCap ? 100 : Math.max(2, Math.min(100, Math.round(100 * left / need))),
        };
    },

    // Single choke point for XP changes. Returns the XP actually banked.
    // Level-ups pay a small cash purse through the audited awardCash path
    // (which re-runs evaluate() — safe: evaluate never calls addXp).
    addXp(amount, why) {
        if (!this.ready || !this.data) return 0;
        const amt = Math.max(0, Math.min(10000, Math.round(+amount || 0)));
        if (!amt) return 0;
        const d = this.data;
        const before = this.levelFromXp(d.xp);
        d.xp = Math.min(1e9, (Math.floor(+d.xp || 0)) + amt);
        const after = this.levelFromXp(d.xp);
        if (after > before) {
            this._toast('LEVEL UP - DRIVER LVL ' + after);
            if (typeof game !== 'undefined' && game.awardCash) {
                game.awardCash(after * 50, 'level-' + after);
                if (game.scheduleSave) game.scheduleSave();
            }
            if (typeof game !== 'undefined' && game.updateMenuUI) game.updateMenuUI();
        }
        return amt;
    },

    // Daily-board feed from DailyBonus.claim() — total claims + best ever
    // return streak, so daily achievements unlock the moment the bonus is
    // claimed instead of waiting for some future race.
    countDaily(streak) {
        if (!this.ready || !this.data) return;
        const s = Math.max(1, Math.min(9999, Math.round(+streak || 1)));
        this.data.dailyClaims++;
        if (s > this.data.dailyStreakBest) this.data.dailyStreakBest = s;
        this._persist();
        this.evaluate();
    },

    async init() {
        let raw = null;
        try { raw = await SaveSystem.load(CAREER_STORAGE_KEY); } catch (e) {}
        this.data = this._migrate(raw);
        this.ready = true;
        this._persist();
    },

    // ── Recording hooks (called from game.js / car.js, typeof-guarded) ──
    // Single-player finish: { won, et, mode: 'quick'|'tournament'|'ghost', champion }
    recordRace(res) {
        if (!this.ready || !res) return;
        const d = this.data;
        d.races++;
        if (res.won) {
            d.wins++;
            d.streak++;
            if (d.streak > d.bestStreak) d.bestStreak = d.streak;
        } else {
            d.losses++;
            d.streak = 0;
        }
        if (res.mode === 'ghost' && res.won) d.ghostWins++;
        if (res.mode === 'tournament' && res.won && res.champion) d.tournamentsWon++;
        // PB flag must be judged BEFORE bestET moves — it marks the run that
        // SET the record, not the runs that merely matched the old one.
        const pb = res.et > 0 && (!d.bestET || res.et < d.bestET);
        if (res.et > 0 && (!d.bestET || res.et < d.bestET)) d.bestET = res.et;
        // XP by mode — ghost replays pay best (you race a perfect you),
        // tournament heats sit between quick races, and a circuit title
        // pays a purse bonus on top of the heat win.
        const X = this.XP_TABLE;
        let xp = res.won ? X.quickWin : X.loss;
        if (res.mode === 'tournament') xp = res.won ? X.tournamentWin : X.loss;
        if (res.mode === 'ghost') xp = res.won ? X.ghostWin : X.loss;
        if (res.champion) xp += X.championBonus;
        const gained = this.addXp(xp, 'sp-' + (res.mode || 'quick'));
        this._pushHistory({ t: Date.now(), m: res.mode || 'quick', w: res.won ? 1 : 0,
            et: res.et > 0 ? res.et : null, fs: res.falseStart ? 1 : 0, pb: pb ? 1 : 0,
            opp: res.opp || null, tier: res.tier || null,
            gap: Number.isFinite(res.gap) ? res.gap : null,
            cash: Number.isFinite(res.cash) ? Math.max(0, Math.round(res.cash)) : null,
            xp: gained || null });
        d.lastRaceTs = Date.now();
        this._persist();
        this.evaluate();
        return gained;
    },

    // Multiplayer finish: { won, et, falseStart }
    recordMp(res) {
        if (!this.ready || !res) return;
        const d = this.data;
        d.races++;
        if (res.won) {
            d.wins++;
            d.mpWins++;
            d.streak++;
            if (d.streak > d.bestStreak) d.bestStreak = d.streak;
        } else {
            d.losses++;
            d.streak = 0;
        }
        const pb = res.et > 0 && (!d.bestET || res.et < d.bestET);
        if (res.et > 0 && (!d.bestET || res.et < d.bestET)) d.bestET = res.et;
        // Human scalps pay the best XP in the game — beating a real driver
        // is the premium activity (see XP_TABLE).
        const gained = this.addXp(res.won ? this.XP_TABLE.mpWin : this.XP_TABLE.mpLoss, 'mp');
        this._pushHistory({ t: Date.now(), m: 'mp', w: res.won ? 1 : 0,
            et: res.et > 0 ? res.et : null, fs: res.falseStart ? 1 : 0, pb: pb ? 1 : 0,
            opp: res.opp || null, tier: null,
            gap: Number.isFinite(res.gap) ? res.gap : null,
            cash: Number.isFinite(res.cash) ? Math.max(0, Math.round(res.cash)) : null,
            xp: gained || null });
        d.lastRaceTs = Date.now();
        this._persist();
        this.evaluate();
        return gained;
    },

    // Perfect-shift tick from car.js — counter only; persistence happens
    // with the race-end save so a session of shifts costs zero extra writes.
    countPerfect() {
        if (this.ready) this.data.perfectShifts++;
    },

    // Re-check the whole board. Called after races, cash gains and spends.
    // Live-derived stats (garage size, cash peak) are read fresh here so
    // purchases between races count without extra plumbing.
    evaluate() {
        if (!this.ready) return;
        const d = this.data;
        const live = this._liveValues();
        // The snapshot exposes the wallet as cashPeak (already max-ed with
        // the stored peak — it has no bare `cash` key), so compare against
        // that: reading live.cash here silently left the stored peak at $0
        // while the board still unlocked from the snapshot.
        if (live.cashPeak > d.cashPeak) d.cashPeak = live.cashPeak;

        const newly = [];
        for (const a of this.ACHIEVEMENTS) {
            if (d.ach[a.id]) continue;
            const cur = live[a.stat];
            if (cur === undefined || cur === null) continue;
            const hit = a.lowerBetter ? (cur > 0 && cur <= a.goal) : (cur >= a.goal);
            if (hit) { d.ach[a.id] = Date.now(); newly.push(a); }
        }
        const corner = newly.length ? document.getElementById('career-menu-btn') : null;
        for (const a of newly) {
            this._toast('ACHIEVEMENT: ' + a.name);
            // Corner chip celebrates with the toast — a short gold flash.
            if (corner) {
                corner.classList.remove('unlock-pulse');
                void corner.offsetWidth; // restart the CSS animation
                corner.classList.add('unlock-pulse');
                setTimeout(() => corner.classList.remove('unlock-pulse'), 1800);
            }
        }
        this._persist();
    },

    // ── Panel (mirrors the profile panel's menu transitions) ───────────
    openPanel() {
        if (!this.ready) return;
        game.menuState = 'CAREER';
        document.querySelectorAll('.menu-overlay').forEach(el => el.classList.add('hidden'));
        document.getElementById('career-menu').classList.remove('hidden');
        this.renderPanel();
    },

    closePanel() {
        game.returnToMenu();
    },

    renderPanel() {
        if (!this.data) return;
        const d = this.data;
        const live = this._liveValues();

        // Driver level bar — the panel's opener block. Level is DERIVED from
        // the xp total (never stored), so a curve tune re-grades everyone
        // fairly instead of freezing stale levels into saves.
        const xpBox = document.getElementById('career-xp');
        if (xpBox) {
            const li = this.levelInfo();
            const needTxt = li.need ? (li.into + ' / ' + li.need + ' XP') : (li.xp + ' XP TOTAL');
            const nextTxt = li.need ? 'TO LVL ' + (li.level + 1) : 'MAX LEVEL';
            xpBox.innerHTML =
                '<div class="career-xp-head">' +
                    '<span class="career-xp-lvl">LVL ' + li.level + '</span>' +
                    '<span class="career-xp-note">' + needTxt + ' &middot; ' + nextTxt + '</span>' +
                '</div>' +
                '<div class="career-xp-track" role="progressbar" aria-label="Driver level progress"' +
                    ' aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + li.pct + '">' +
                    '<i style="width:' + li.pct + '%"></i>' +
                '</div>';
        }

        const stats = document.getElementById('career-stats');
        if (stats) {
            const winRate = d.races ? Math.round(100 * d.wins / d.races) : 0;
            const rows = [
                ['RACES', d.races],
                ['WINS', d.wins],
                ['LOSSES', d.losses],
                ['WIN RATE', winRate + '%'],
                ['BEST ET', d.bestET ? d.bestET.toFixed(3) + 's' : '\u2014'],
                ['BEST STREAK', d.bestStreak],
                ['PERFECT SHIFTS', d.perfectShifts],
                ['TOURNAMENTS WON', d.tournamentsWon],
                ['P2P WINS', d.mpWins],
                ['GHOSTS BEATEN', d.ghostWins],
                ['CARS OWNED', live.cars],
                ['PEAK CASH', '$' + d.cashPeak.toLocaleString('en-US')],
            ];
            stats.innerHTML = rows.map(r =>
                '<div class="career-stat"><span>' + r[0] + '</span><b>' + r[1] + '</b></div>'
            ).join('');
        }

        this._renderToday();
        this._drawSpark();
        this._renderHistory();

        const count = document.getElementById('career-ach-count');
        if (count) {
            const got = this.ACHIEVEMENTS.filter(a => d.ach[a.id]).length;
            count.textContent = got + '/' + this.ACHIEVEMENTS.length;
        }

        const list = document.getElementById('career-achievements');
        if (list) {
            list.innerHTML = this.ACHIEVEMENTS.map(a => {
                const got = !!d.ach[a.id];
                let head = '<div class="career-ach-head"><span class="career-ach-name">' + a.name +
                    '</span><span class="career-ach-state">' + (got ? 'UNLOCKED' : '') + '</span></div>' +
                    '<div class="career-ach-desc">' + a.desc + '</div>';
                let bar = '';
                if (!got) {
                    const cur = live[a.stat];
                    let pct = null, label = '';
                    if (a.lowerBetter) {
                        if (cur > 0) { pct = Math.max(4, Math.min(96, 100 * a.goal / cur)); label = 'BEST ' + cur.toFixed(2) + 's'; }
                    } else if (a.stat === 'cashPeak') {
                        pct = Math.max(2, Math.min(96, 100 * d.cashPeak / a.goal));
                        label = '$' + d.cashPeak.toLocaleString('en-US') + ' / $' + (a.goal / 1000) + 'K';
                    } else if (cur !== undefined && cur !== null) {
                        pct = Math.max(2, Math.min(96, 100 * cur / a.goal));
                        label = Math.min(cur, a.goal) + '/' + a.goal;
                    }
                    if (pct !== null) {
                        bar = '<div class="career-ach-bar"><i style="width:' + pct.toFixed(0) + '%"></i></div>' +
                              '<div class="career-ach-prog">' + label + '</div>';
                    }
                }
                return '<div class="career-ach' + (got ? ' got' : '') + '">' + head + bar + '</div>';
            }).join('');
        }
    },

    // ── Race history / ET chart / today strip ──────────────────────────
    // Appends a finished race to the rolling history feed and refreshes the
    // local-day counters (races/wins/best for the TODAY strip). Day keys are
    // LOCAL dates — “today” means what the driver's clock says.
    _pushHistory(entry) {
        const d = this.data;
        const now = new Date();
        const key = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
        if (d.day !== key) { d.day = key; d.dayR = 0; d.dayW = 0; d.dayBest = 0; }
        d.dayR++;
        if (entry.w) d.dayW++;
        if (entry.et > 0 && (!d.dayBest || entry.et < d.dayBest)) d.dayBest = entry.et;
        d.history.push(entry);
        if (d.history.length > CAREER_HISTORY_CAP) d.history.splice(0, d.history.length - CAREER_HISTORY_CAP);
    },

    _todayKey() {
        const now = new Date();
        return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    },

    _renderToday() {
        const el = document.getElementById('career-today');
        if (!el) return;
        const d = this.data;
        if (d.day === this._todayKey() && d.dayR > 0) {
            el.hidden = false;
            el.innerHTML = '<span class="career-today-label">TODAY</span>' +
                '<b>' + d.dayR + ' RACE' + (d.dayR === 1 ? '' : 'S') + '</b>' +
                '<b class="' + (d.dayW ? 'good' : '') + '">' + d.dayW + ' WIN' + (d.dayW === 1 ? '' : 'S') + '</b>' +
                '<b>' + (d.dayBest ? d.dayBest.toFixed(3) + 's' : '\u2014') + ' BEST</b>';
        } else {
            el.hidden = true;
            el.innerHTML = '';
        }
    },

    // Ledger text guard — P2P opponent handles come from ANOTHER device's
    // profile, so every string field passes through here before it touches
    // innerHTML. Numbers and dev-owned strings never need it, but the chip
    // row is shared markup, so it escapes defensively too.
    _esc(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    },

    // Ledger filter — 'all' | 'win' | 'loss' | 'pb'. Kept as object state
    // (not DOM state) so the panel re-renders (open after a race) restore
    // the chip the driver last used within this session.
    setLedgerFilter(f) {
        if (['all', 'win', 'loss', 'pb'].indexOf(f) < 0) return;
        this._ledgerFilter = f;
        this._renderLedgerTop();
        this._renderHistory();
    },

    // Filter chips + last-5 form dots. Rendered once above the scroll list;
    // chips are real <button>s (keyboard reachable, aria-pressed state) and
    // the form strip reads oldest→newest, left→right, like a timeslip log.
    _renderLedgerTop() {
        const top = document.getElementById('career-ledger-top');
        if (!top) return;
        const hist = this.data.history;
        // A brand-new driver gets the plain empty state — zero-count chips
        // would just be noise above "NO RACES YET".
        if (!hist.length) { top.innerHTML = ''; return; }
        const filters = [['all', 'ALL'], ['win', 'WINS'], ['loss', 'LOSSES'], ['pb', 'PB RUNS']];
        const cur = this._ledgerFilter || 'all';
        const counts = { all: hist.length, win: 0, loss: 0, pb: 0 };
        for (const h of hist) {
            if (h.w) counts.win++; else counts.loss++;
            if (h.pb) counts.pb++;
        }
        const chips = filters.map(fl =>
            '<button type="button" class="career-ledger-chip' + (cur === fl[0] ? ' on' : '') + '"' +
            ' aria-pressed="' + (cur === fl[0]) + '" onclick="Career.setLedgerFilter(\'' + fl[0] + '\')">' +
            fl[1] + ' <i>' + counts[fl[0]] + '</i></button>'
        ).join('');
        const form = hist.slice(-5).map(h =>
            '<i class="career-form-dot ' + (h.fs ? 'dq' : (h.w ? 'w' : 'l')) + '"></i>'
        ).join('');
        top.innerHTML =
            '<div class="career-ledger-chips" role="group" aria-label="Filter race history">' + chips + '</div>' +
            (form ? '<div class="career-ledger-form" aria-label="Last 5 races"><span>FORM</span>' + form + '</div>' : '');
    },

    _renderHistory() {
        const list = document.getElementById('career-history');
        const count = document.getElementById('career-hist-count');
        if (count) count.textContent = this.data.races ? (this.data.history.length + '/' + this.data.races) : '\u2014';
        this._renderLedgerTop();
        if (!list) return;
        const hist = this.data.history;
        if (!hist.length) {
            list.innerHTML = '<div class="career-h-empty">NO RACES YET \u2014 HIT THE TRACK</div>';
            return;
        }
        const modeName = { quick: 'QUICK', tournament: 'TOURNEY', ghost: 'GHOST', mp: 'P2P' };
        const tierOK = { ROOKIE: 1, STREET: 1, 'SEMI-PRO': 1, PRO: 1 };
        const f = this._ledgerFilter || 'all';
        const rows = hist.slice().reverse().filter(h => {
            if (f === 'win') return !!h.w;
            if (f === 'loss') return !h.w;
            if (f === 'pb') return !!h.pb;
            return true;
        });
        if (!rows.length) {
            list.innerHTML = '<div class="career-h-empty">NOTHING IN THIS FILTER YET</div>';
            return;
        }
        list.innerHTML = rows.map((h, i) => {
            // DQ only when the finish path explicitly said so — a plain loss
            // (opponent crossed first) shows “—”, not a disqualification.
            const dq = h.fs === 1;
            const etTxt = dq ? 'DQ' : (h.et ? h.et.toFixed(3) + 's' : '\u2014');
            // Margin vs the rival's ET — negative (green) means you got there
            // first. Only races where BOTH cars crossed carry a gap, so most
            // DNF/DQ rows just leave the slot empty instead of guessing.
            const gapTxt = (typeof h.gap === 'number')
                ? (h.gap <= 0 ? '\u2212' : '+') + Math.abs(h.gap).toFixed(3) + 's'
                : '';
            // Opponent line: P2P prints the other driver's handle (ESCAPED —
            // it comes from a remote profile), quick prints the catalog name
            // plus its persona tier, ghost races print themselves.
            const oppName = h.opp ? this._esc(h.opp)
                : (h.m === 'ghost' ? 'YOUR GHOST' : (h.m === 'mp' ? 'P2P RIVAL' : 'AI RIVAL'));
            const tier = (h.tier && tierOK[h.tier])
                ? '<span class="career-h-tier t-' + h.tier.toLowerCase().replace(/[^a-z]/g, '') + '">' + h.tier + '</span>'
                : '';
            const cash = (typeof h.cash === 'number' && h.cash > 0)
                ? '<span class="career-h-cash">+$' + h.cash.toLocaleString('en-US') + '</span>'
                : '<span class="career-h-cash none" aria-hidden="true"></span>';
            return '<div class="career-hrow ' + (h.w ? 'win' : 'loss') + (dq ? ' dq' : '') + (h.pb ? ' is-pb' : '') + '"' +
                ' style="animation-delay:' + Math.min(i * 28, 420) + 'ms" role="listitem">' +
                '<span class="career-h-res">' + (h.w ? 'W' : 'L') + '</span>' +
                '<span class="career-h-mode m-' + h.m + '">' + (modeName[h.m] || 'RACE') + '</span>' +
                '<span class="career-h-opp">' + oppName + tier + '</span>' +
                '<span class="career-h-et' + (h.pb ? ' pb' : '') + (dq ? ' dq' : '') + '">' + etTxt + '</span>' +
                (h.pb ? '<span class="career-h-pb">PB</span>' : '') +
                (gapTxt ? '<span class="career-h-gap ' + (h.gap <= 0 ? 'up' : 'dn') + '">' + gapTxt + '</span>'
                        : '<span class="career-h-gap none" aria-hidden="true"></span>') +
                cash +
                '<span class="career-h-ago">' + this._fmtAgo(h.t) + '</span>' +
                '</div>';
        }).join('');
    },

    _fmtAgo(ts) {
        const s = Math.max(0, (Date.now() - ts) / 1000);
        if (s < 60) return 'JUST NOW';
        if (s < 3600) return Math.floor(s / 60) + 'M AGO';
        if (s < 86400) return Math.floor(s / 3600) + 'H AGO';
        const days = Math.floor(s / 86400);
        if (days < 7) return days + 'D AGO';
        const d = new Date(ts);
        const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
        return MON[d.getMonth()] + ' ' + d.getDate();
    },

    // ET progression — a dependency-free canvas sparkline of the last 20
    // timed runs (oldest left, newest right). Gold line + fade fill, dotted
    // rail on the personal best, PB runs highlighted yellow. Fewer than two
    // timed runs has nothing to say yet — the block stays hidden.
    _drawSpark() {
        const wrap = document.getElementById('career-spark-wrap');
        const cv = document.getElementById('career-spark');
        if (!wrap || !cv) return;
        const pts = this.data.history.filter(h => h.et > 0).slice(-CAREER_SPARK_CAP);
        if (pts.length < 2) { wrap.hidden = true; return; }
        wrap.hidden = false;
        try {
            const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
            const W = cv.clientWidth || 420, H = 64;
            cv.width = Math.round(W * dpr);
            cv.height = Math.round(H * dpr);
            const ctx = cv.getContext('2d');
            if (!ctx) return;
            ctx.scale(dpr, dpr);
            ctx.clearRect(0, 0, W, H);
            const ets = pts.map(p => p.et);
            const min = Math.min.apply(null, ets), max = Math.max.apply(null, ets);
            const pad = 7, span = (max - min) || 1;
            const X = i => pad + i * (W - pad * 2) / (pts.length - 1);
            const Y = v => H - pad - ((v - min) / span) * (H - pad * 2);
            // Dotted reference rail at the personal best (the min line).
            ctx.strokeStyle = 'rgba(255, 213, 79, 0.3)';
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 4]);
            ctx.beginPath(); ctx.moveTo(pad, Y(min)); ctx.lineTo(W - pad, Y(min)); ctx.stroke();
            ctx.setLineDash([]);
            // Fade fill under the curve.
            const grad = ctx.createLinearGradient(0, 0, 0, H);
            grad.addColorStop(0, 'rgba(255, 213, 79, 0.28)');
            grad.addColorStop(1, 'rgba(255, 213, 79, 0.02)');
            ctx.beginPath();
            ctx.moveTo(X(0), Y(ets[0]));
            for (let i = 1; i < pts.length; i++) ctx.lineTo(X(i), Y(ets[i]));
            ctx.lineTo(X(pts.length - 1), H - 1); ctx.lineTo(X(0), H - 1);
            ctx.closePath();
            ctx.fillStyle = grad; ctx.fill();
            // The curve itself.
            ctx.beginPath();
            ctx.moveTo(X(0), Y(ets[0]));
            for (let i = 1; i < pts.length; i++) ctx.lineTo(X(i), Y(ets[i]));
            ctx.strokeStyle = '#ffd54f'; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();
            // Points — PB runs yellow, the newest run bright white-gold.
            for (let i = 0; i < pts.length; i++) {
                const last = i === pts.length - 1;
                ctx.beginPath();
                ctx.arc(X(i), Y(ets[i]), last ? 3.2 : 2, 0, Math.PI * 2);
                ctx.fillStyle = pts[i].pb ? '#ffeb3b' : (last ? '#fff8e1' : '#8d6e1f');
                ctx.fill();
            }
        } catch (e) { wrap.hidden = true; }
    },

    // ── Internals ──────────────────────────────────────────────────────
    _liveValues() {
        const d = this.data;
        let cars = 0, cash = 0;
        try {
            if (typeof game !== 'undefined') {
                if (game.ownedCars) cars = game.ownedCars.length;
                if (isFinite(game.cash)) cash = game.cash;
            }
        } catch (e) { /* menu contexts without a live game — use zeros */ }
        return {
            wins: d.wins,
            races: d.races,
            bestStreak: Math.max(d.bestStreak, d.streak),
            bestET: d.bestET || 0,
            perfectShifts: d.perfectShifts,
            cars,
            cashPeak: Math.max(d.cashPeak, cash),
            tournamentsWon: d.tournamentsWon,
            mpWins: d.mpWins,
            ghostWins: d.ghostWins,
            xp: d.xp,
            level: this.levelInfo().level,
            dailyClaims: d.dailyClaims,
            dailyStreakBest: d.dailyStreakBest,
        };
    },

    _migrate(raw) {
        const d = (raw && typeof raw === 'object') ? raw : {};
        const num = v => (isFinite(+v) && +v > 0) ? Math.floor(+v) : 0;
        const out = {
            v: 1,
            races: num(d.races),
            wins: num(d.wins),
            losses: num(d.losses),
            mpWins: num(d.mpWins),
            ghostWins: num(d.ghostWins),
            tournamentsWon: num(d.tournamentsWon),
            perfectShifts: num(d.perfectShifts),
            streak: num(d.streak),
            bestStreak: num(d.bestStreak),
            bestET: (typeof d.bestET === 'number' && isFinite(d.bestET) && d.bestET > 0 && d.bestET < 600) ? d.bestET : null,
            cashPeak: num(d.cashPeak),
            xp: num(d.xp),
            dailyClaims: num(d.dailyClaims),
            dailyStreakBest: num(d.dailyStreakBest),
            lastRaceTs: num(d.lastRaceTs),
            day: (typeof d.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.day)) ? d.day : '',
            dayR: num(d.dayR),
            dayW: num(d.dayW),
            dayBest: (typeof d.dayBest === 'number' && isFinite(d.dayBest) && d.dayBest > 0 && d.dayBest < 600) ? d.dayBest : null,
            ach: {},
        };
        // 999 is the engine's "did not finish" sentinel and anything past the
        // 600s ceiling is corruption (game.sanitizeTime rejects the same way) —
        // older saves caught a false start in the best-ET slot before the
        // recording path learned to gate on it. Treat it all as "no record".
        // Rolling race history — defensively rebuilt: only well-formed
        // entries with known modes survive, capped to the newest 100.
        // Ledger extras (opp/tier/gap/cash) are sanitized separately so a
        // tampered save can at worst show junk TEXT (escaped at render),
        // never inject markup.
        out.history = [];
        if (Array.isArray(d.history)) {
            const modes = { quick: 1, tournament: 1, ghost: 1, mp: 1 };
            const tierOK = { ROOKIE: 1, STREET: 1, 'SEMI-PRO': 1, PRO: 1 };
            for (const h of d.history) {
                if (!h || typeof h !== 'object' || !modes[h.m]) continue;
                if (!isFinite(+h.t) || +h.t <= 0) continue;
                out.history.push({
                    t: Math.floor(+h.t),
                    m: h.m,
                    w: h.w ? 1 : 0,
                    et: (typeof h.et === 'number' && isFinite(h.et) && h.et > 0) ? +h.et : null,
                    pb: h.pb ? 1 : 0,
                    fs: h.fs ? 1 : 0,
                    opp: (typeof h.opp === 'string' && h.opp.trim()) ? h.opp.trim().slice(0, 18) : null,
                    tier: (typeof h.tier === 'string' && tierOK[h.tier]) ? h.tier : null,
                    gap: (typeof h.gap === 'number' && isFinite(h.gap) && Math.abs(h.gap) < 600)
                        ? Math.round(h.gap * 1000) / 1000 : null,
                    cash: (typeof h.cash === 'number' && isFinite(h.cash) && h.cash > 0)
                        ? Math.min(1e7, Math.round(h.cash)) : null,
                    xp: (typeof h.xp === 'number' && isFinite(h.xp) && h.xp > 0)
                        ? Math.min(10000, Math.round(h.xp)) : null,
                });
            }
            if (out.history.length > CAREER_HISTORY_CAP) out.history = out.history.slice(-CAREER_HISTORY_CAP);
        }
        const clean = {};
        if (d.ach && typeof d.ach === 'object') {
            for (const k in d.ach) {
                if (this._def(k) && isFinite(+d.ach[k]) && +d.ach[k] > 0) clean[k] = +d.ach[k];
            }
        }
        out.ach = clean;
        // Never trust a streak that contradicts the ledger (manual edits,
        // partial writes): a streak can't exceed total wins.
        if (out.streak > out.wins) out.streak = out.wins;
        if (out.bestStreak > out.wins) out.bestStreak = out.wins;
        // Day counters can't contradict the ledger either (a save from a
        // previous day must not show as “today”).
        if (out.day && out.day !== '') {
            const now = new Date();
            const key = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
            if (out.day !== key) { out.dayR = 0; out.dayW = 0; out.dayBest = null; }
            if (out.dayR > out.races) out.dayR = out.races;
            if (out.dayW > out.dayR) out.dayW = out.dayR;
            if (out.dayW > out.wins) out.dayW = out.wins;
        }
        return out;
    },

    _def(id) {
        for (const a of this.ACHIEVEMENTS) if (a.id === id) return a;
        return null;
    },

    // Toasts queue through the single #notification element (900ms each)
    // with spacing so consecutive unlocks never overwrite each other.
    _toast(text) {
        this._toastQueue.push(text);
        this._drainToasts();
    },

    _drainToasts() {
        if (this._toastBusy) return;
        const t = this._toastQueue.shift();
        if (!t) return;
        this._toastBusy = true;
        try {
            if (typeof game !== 'undefined' && game.showNotification) game.showNotification(t);
        } catch (e) {}
        setTimeout(() => { this._toastBusy = false; this._drainToasts(); }, 1400);
    },

    _persist() {
        if (!this.ready) return;
        clearTimeout(this._saveTimer);
        this._saveTimer = setTimeout(() => {
            try { SaveSystem.save(CAREER_STORAGE_KEY, this.data); } catch (e) {}
        }, 400);
    },
};
