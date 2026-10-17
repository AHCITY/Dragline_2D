# RULES v7 — PFP moderation + cross-device identity (v6 → v7 delta)

Date: 2026-10-09 · Scope: `pdl_profiles` (av + mod) and the NEW `pdl_uidIndex` node.
Everything else (v5 host-bound multiplayer, v6 wallet ledger) is **byte-identical**
(programmatically verified by `tools/patch_rules_v7.mjs`).

## Owner action (one-time, unchanged flow)

Firebase console → Realtime Database → Rules → paste `firebase/database.rules.json`
(v7 = v5 + v6 + this delta) → **PUBLISH**. Then run the existing probes
(`scripts/probe_v6_wallet.js` → `V6 VERIFIED`). v7 adds no probe requirements.

---

## 1. Why a rules change was needed (owner question, answered again)

The Desert Ant Moderator model runs **on-device** (browser WASM / server native
core). Database rules cannot execute the model — no RTDB rule can judge image
content. What rules CAN do, and v7 does, is enforce the structure around the
avatar so that:

- only the claimed owner can write a profile at all (unchanged: `pdl_idClaim`),
- the avatar payload is a bounded, self-produced shape (webp/jpeg data URL,
  ≤ 40,000 chars — matches the client encoder's maximum output),
- the moderation verdict travels WITH the avatar as a validated audit record
  (`mod`), so an owner can always answer "why was this image admitted?",
- nothing else can be smuggled into the profile (`$other: false` unchanged).

**Honest enforcement boundary (do not skip this):** on a static host
(GitHub Pages) there is no trusted backend, so a modified client can still write
an unmoderated `av` directly into RTDB (the owner-write permission is the same
one that makes saves work). The content gate there is the on-device model at
the single legitimate upload route. Where a backend exists (this project's
Next.js server), `POST /api/pfp-moderate` re-runs the model with the native
core and its verdict wins. Full cryptographic enforcement would require an
Admin-SDK writer (service account) — the same conclusion as the E1(a) wallet
review, unchanged here.

## 2. `pdl_profiles/$pid` changes

| field | rule change |
|---|---|
| `av` | tightened: `data:image/webp` or `data:image/jpeg` only (the encoder never emitted png/gif; gif-class payloads have no place in an `<img>` slot), length ≤ 40000 unchanged |
| `mod` | NEW, optional: `v === 'dam1'`, `t ≤ now+60s`, `src ∈ {server, device}`, optional `s ∈ [0..1]`; `$other: false` |

`mod` is written in the same `update()` as the avatar (profile.js `_cloudSync`),
so an avatar without its verdict can never exist under normal flow, and an old
profile (pre-v7) stays valid because `mod` is optional.

## 3. NEW node: `pdl_uidIndex/$uid = <16-hex pid>`

The missing half of cross-device identity. `pdl_idClaim` maps pid → uid
(write-once); nothing mapped uid → pid, which is why signing in on a new device
minted a fresh profile id and orphaned the cloud profile (name, avatar, friend
graph, wallet) under the old one.

- `.read` / `.write`: **owner-only** (`auth.uid === $uid`) — no enumeration
  possible, no data leaks, no cross-account writes.
- `.validate`: a 16-hex profile id string, nothing else.
- Written by profile.js `_adoptCloudIdentity()` on every signed-in boot
  (idempotent for the same pair).

### Adoption protocol (client, background at boot — never blocks play)

1. Signed-in client reads `pdl_uidIndex/<uid>`.
2. If it holds a pid that differs from the local one: verify
   `pdl_idClaim/<pid> === auth.uid` (a hostile/stale index can never transplant
   someone else's identity), then pull `pdl_profiles/<pid>` and fill **empty
   local slots only** (default name, no avatar) — a player who customized
   before signing in is never overwritten.
3. Flip the local id, persist, re-point Friends (`setProfile`) and Wallet
   (`rebind`), toast `PROFILE RESTORED FROM CLOUD`.
4. Register/refresh `pdl_uidIndex/<uid> = <current pid>`.

## 4. Verification performed

- Structural diff: all v5/v6 nodes byte-identical (tool exit-checked).
- Rules JSON parses; validate expressions reviewed against the RTDB rules
  language (string methods only: `matches`, `beginsWith`, `isString`,
  `isNumber`, `hasChildren`, `child().val()`, `now`).
- Client↔rules contract re-checked: profile payload now sends `mod`;
  `migrateMod()` on read keeps malformed rows from poisoning local state.
