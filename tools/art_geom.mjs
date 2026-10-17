/* ============================================================================
   art_geom.mjs  -  print the real geometry of every car silhouette
   ----------------------------------------------------------------------------
   Loads car-art.js exactly the way the browser does (one global lexical scope,
   IIFE attaching to window) and reports what the art actually measures AFTER
   normalizeArt() has run. Used to prove the 8 cars are distinguishable instead
   of taking a screenshot's word for it.

     node tools/art_geom.mjs
   ============================================================================ */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const src = readFileSync(join(root, 'car-art.js'), 'utf8');
const win = {};
try {
    new Function('window', src)(win);
} catch (e) {
    console.error('car-art.js failed to evaluate: ' + e.message);
    process.exit(1);
}

const CAR_ART = win.CarArt && win.CarArt.CAR_ART;
if (!CAR_ART) {
    console.error('car-art.js did not expose window.CarArt.CAR_ART');
    process.exit(1);
}

const round = (n, d = 2) => Number(n.toFixed(d));
const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);

console.log('\nCAR              len   height  h/l     tireR  arch   gap%   belt   roofY  topX0');
console.log('--------------------------------------------------------------------------------------');

const rows = [];
for (const id of Object.keys(CAR_ART)) {
    const a = CAR_ART[id];
    const len = a.front - a.rear;
    const gap = a.arch - a.tireR;
    rows.push({
        id, len: round(len), height: round(a.height),
        hl: round(a.height / len, 3),
        tireR: round(a.tireR), arch: round(a.arch),
        gapPct: round((gap / a.tireR) * 100, 1),
        belt: round(a.belt), roofY: round(a.topY), rear: round(a.rear), front: round(a.front),
        wheelbase: round(a.wheels[1][0] - a.wheels[0][0]),
        rearOverhang: round(a.wheels[0][0] - a.rear),
        frontOverhang: round(a.front - a.wheels[1][0]),
        cabin: round(a.wheels[0][0] - a.rear, 1),
    });
    const r = rows[rows.length - 1];
    console.log(
        pad(id, 16) + padL(r.len, 5) + padL(r.height, 7) + padL(r.hl, 8) +
        padL(r.tireR, 7) + padL(r.arch, 7) + padL(r.gapPct, 7) +
        padL(r.belt, 7) + padL(r.roofY, 7) + padL(r.rear, 7)
    );
}

console.log('\npositioning (how each car is laid out along its length)');
console.log('--------------------------------------------------------------------------------------');
console.log(pad('CAR', 16) + padL('rear', 6) + padL('front', 7) + padL('len', 6) +
            padL('wb', 7) + padL('rearOH', 9) + padL('frontOH', 10) + padL('cowlX', 8));
console.log('--------------------------------------------------------------------------------------');
for (const r of rows) {
    const a = CAR_ART[r.id];
    console.log(
        pad(r.id, 16) + padL(r.rear, 6) + padL(r.front, 7) + padL(r.len, 6) +
        padL(r.wheelbase, 7) + padL(r.rearOverhang, 9) + padL(r.frontOverhang, 10) +
        padL(round(a.windscreen ? a.windscreen[a.windscreen.length - 1][2] : NaN), 8)
    );
}

/* Distinctness check: how much of the car sits in the cabin, which is the
   single biggest silhouette tell (cab-rearward wedge vs cab-forward hatch). */
console.log('\ncabin position as a fraction of the wheelbase (0 = cab on the rear axle, 1 = cab on the front)');
console.log('--------------------------------------------------------------------------------------');
const cabs = rows.map(r => {
    const a = CAR_ART[r.id];
    const cowl = a.wheels[0][0] + (a.wheels[1][0] - a.wheels[0][0]) * 0;
    return { id: r.id, wb: r.wheelbase, rearAxle: a.wheels[0][0] - a.rear, cowlX: cowl };
});
for (const c of cabs) console.log(pad(c.id, 16) + padL(round(c.rearAxle), 8) + '  (rear axle from tail)');
