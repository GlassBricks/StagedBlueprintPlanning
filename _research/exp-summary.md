---
summary: "Cross-cutting summary of E1–E17 tag-based undo experiments + E2c/E3c/E3d/E15b follow-ups. Mid-flow stack peek refuted; tag delivery via on_undo_applied confirmed; hidden disposable anchor redo fixed by adding `minable`; per-op verdicts and design implications."
date: 2026-05-02
tags: [factorio, undo, experiments, summary, design]
---

# Tag-based undo experiments — summary

17 experiments across 6 groups + 4 follow-ups, fully automated via
kwin-mcp + UDP. Per-group findings: `exp-foundations.md`,
`exp-rotation.md`, `exp-settings-upgrade.md`, `exp-wires-tiles.md`,
`exp-paste.md`, `exp-edges.md`, `exp-followup.md` (E2c/E3c/E15b),
`exp-e3d.md` (E3 fix). This file aggregates verdicts and lays out
the design impact.

## Verdict matrix

| # | Question | Verdict | Group |
|---|---|---|---|
| E1 | Tagged action visible in `undo_redo_stack` during mid-flow `script_raised_*` / `on_player_*` events? | **FAIL** — both stacks empty mid-flow (action in flight) | G1 |
| E2 | `set_redo_tag` from inside `on_undo_applied`; tag survives into `on_redo_applied`; action indices stable | **PASS** | G1 |
| E3 | Disposable hidden anchor (`simple-entity-with-owner` + `hidden:true` + empty `collision_mask`) round-trip | **PARTIAL FAIL** — undo OK, **redo broken** (no redo entry created) | G1 |
| E3b | Same flow with normal entity (iron-chest) — control | **PASS** — confirms E3 failure is prototype-specific | G1 |
| E3c | E3 with 7 prototype variants (hidden flag, collision_mask, flag subsets) | **FAIL** all 5 working variants — failure intrinsic to SEW configuration | followup |
| **E3d** | **E3 with `minable: { mining_time: 0.1 }` added** | **PASS** — all 3 variants round-trip. **Fix for `createHiddenEntity`** | e3d |
| E4 (API) | `entity.rotate{by_player}` produces tagged `rotated-entity`; tag round-trips | **PASS** | G2 |
| E4 (R key) | R keystroke equivalent | NEEDS-USER (kwin-mcp bare-letter limit) | G2 |
| E4 (mid-flow) | `on_player_rotated_entity` during undo? | **FAIL/INSIGHT** — fires during undo; action NOT visible on stack mid-flow (cross-confirms E1) | G2 |
| E5 (API UG) | `entity.rotate{by_player}` on underground belt | PASS — single `rotated-entity`, both belts rotate+swap | G2 |
| E5 (drag) | `build_from_cursor` drag-rotate | FAIL — no rotate, no entry. Real drag NEEDS-USER | G2 |
| E6A | `LuaEntity.copy_settings(src, by_player=p)` → tagged `copy-entity-settings`; round-trips | **PASS** | G3 |
| E6B | Blueprint shift+lclick paste over existing entity | NEEDS-USER (no scriptable trigger) | G3 |
| E7 | `LuaPlayer.drag_wire` registers tagged `wire-added`; tag round-trips | **PASS** | G4 |
| E7 (scripted) | `LuaWireConnector.connect_to/disconnect_from` (even with `wire_origin.player`) | does NOT push to undo stack | G4 |
| E8a | `order_upgrade{player}` → tagged `upgraded-entity`; round-trips | **PASS** | G3 |
| E8b | `cancel_upgrade(force, player)` undo behaviour | **FAIL→INSIGHT** — does not push new entry; mutates the prior `upgraded-entity` action into a no-op (`target.name == original_name`); stale tag remains | G3 |
| E9 (set_tiles) | `surface.set_tiles(..., player, undo_index=0)` registers `built-tile`, taggable | **PASS** | G4 |
| E9 (player) | `LuaPlayer.build_from_cursor` with concrete in cursor → `on_player_built_tile` + `built-tile` | **PASS** | G4 |
| E9 (mid-flow) | Mid-flow events during tile undo | INSIGHT — fires on `deconstructible-tile-proxy` / `tile-ghost`, irrelevant to project state | G4 |
| E10 | All 50 BP-paste `on_built_entity` events same tick; item fully populated before first event | **PASS** | G5 |
| E11 | Mid-paste `entity.destroy{player, undo_index:1}` appends to paste item, even cross-surface | **PASS** | G5 |
| E12 | 5 anchors across 5 surfaces collapse to 1 undo item with 5 actions; surface_index retained | **PASS** | G5 |
| E13 | `item.length` indexing stable across same-tick appends; sequential `build_from_cursor` → N items; `undo_index:0/1` → 1 item with N actions | **PASS** | G6 |
| E14 | `remove_undo_action(i,j)` compacts in-place; survivors fire `on_undo_applied` with renumbered indices, tags intact | **PASS** | G6 |
| E15 | Default cap 100 items; FIFO silent prune; tags die with action | **PASS** | G6 |
| E16 | Wire-restore best-effort: `find_entity(name, pos)` returns nil cleanly for missing endpoint | **PASS** (lookup pattern; full wire-undo NEEDS-USER per G4) | G6 |
| E17 | `bp100:` and `othermod:` tags coexist; prefix scan distinguishes; no interference | **PASS** | G6 |

## Cross-cutting findings (load-bearing)

### Mid-flow stack inspection is dead

E1 + cross-confirmed by G2 (rotation) + G4 (wires/tiles): when
mid-flow events (`script_raised_*`, `on_player_*`) fire during an
undo or redo, the action is **in flight** — popped from undo, not
yet pushed to redo. Both `get_undo_item_count()` and
`get_redo_item_count()` are 0 at that moment. Stack-peek detection
of "is this event part of an undo flow" is **impossible**.

The action becomes visible (with tags) **only** in `on_undo_applied`
/ `on_redo_applied` via `e.actions[].tags`.

### Tag delivery channel: `e.actions[].tags` in `on_*_applied`

E2: tag set via `set_undo_tag` survives into `on_undo_applied`'s
`e.actions`. `set_redo_tag` from within `on_undo_applied` succeeds
(redoCount=1 at that moment); tag carried into `on_redo_applied`.

E14: even after `remove_undo_action`, surviving tagged actions fire
`on_undo_applied` with renumbered indices and tags intact.

E17: `bp100:` and `othermod:` tags coexist on the same action; mod
must scan by prefix.

This is the **only** reliable mechanism for receiving tags during
undo/redo flows.

### No tag auto-transfer across undo↔redo

E2: `set_undo_tag` does NOT cause the redo entry to inherit the
tag. After Factorio creates the redo entry on undo, its tags are
nil. Handler must call `set_redo_tag` (and `set_undo_tag` on the
redo→undo direction) explicitly.

### Hidden disposable anchor prototype was broken on redo — fixed by `minable`

E3 vs E3b: `simple-entity-with-owner` + `hidden:true` +
`flags:["player-creation","placeable-off-grid"]` +
`collision_mask:{layers:{}}` undoes (entity recreated, tag visible
in `on_undo_applied`) but **no redo entry is created**. Factorio
silently refuses to make the redo entry for this prototype.

E3c (followup) refuted hidden, collision_mask, and flag-subset
hypotheses across 7 variants — all 5 working SEW configs failed redo.

**E3d (followup) resolved it**: adding `minable: { mining_time: 0.1 }`
to the SEW prototype makes destroy/undo/redo round-trip cleanly. All
3 minable variants (with and without `selectable_in_game`,
`placeable-off-grid`) round-tripped. The current `createHiddenEntity`
helper just needs `minable` added — no need to switch base type.

E3b confirms with iron-chest: real entities round-trip because they
default to mineable. Engine appears to require a non-nil `minable`
spec to allow redo of a `script_raised_destroy{player}`.

### Mid-flow event flavour reflects the world op being applied, NOT the original op

Undoing a build fires `script_raised_destroy` (Factorio is destroying
the entity). Redoing fires `on_built_entity`. The `on_player_*` vs
`script_raised_*` distinction is **not** a reliable "is this an undo
flow" signal.

### Action types invert on redo

`built-entity` ↔ `removed-entity`, `wire-added` ↔ `wire-removed`,
`built-tile` ↔ `removed-tile`. Forward-effect handler still has the
right semantic on the redo side (re-applying the original op).

### Action indices stable for round-trip

For single-action items, `act=1` undo (`built-entity`) maps directly
to `act=1` redo (`removed-entity`). No `surface_index_of_action` /
position lookup needed for the simple case. Multi-action item
ordering also stable (E13, E14).

### Scripted wire APIs do not register undo actions

E7: `LuaWireConnector.connect_to/disconnect_from`, even with
`wire_origin.player`, returns `true` but does NOT push to the undo
stack. Only **player-driven `LuaPlayer.drag_wire`** registers a
tagged `wire-added` action.

Implication: any mod-side wire mutation (e.g. circuit copy, project
sync) cannot leverage the natural-anchor pattern. Must use disposable
anchors.

### Scripted tile APIs split

E9: `surface.set_tiles(..., player, undo_index=0)` registers a
`built-tile` action AND it's taggable, but bypasses
`on_player_built_tile`/`on_player_mined_tile`. `LuaPlayer.build_from_cursor`
fires the player tile events AND registers the action.

### Same-tick paste semantics

E10: All `on_built_entity` events from a 50-entity blueprint paste
fire **same tick**. Undo item is fully populated (`length=50`)
**before the first event fires**. Position→action-index map can be
built lazily on first event (not from `item.length`); design's
approach correct.

E11: From inside a paste `on_built_entity` handler, calling
`entity.destroy{player, undo_index:1}` appends a new action to the
**same** paste item, even cross-surface.

E12: Multi-surface pattern (first `undo_index:0`, rest `undo_index:1`)
collapses to one undo item with N actions; each retains its
`surface_index`. Send-to-stage / bring-to-stage cross-surface
grouping at scale verified.

### Cancel-upgrade is in-place mutation, not a new entry

E8b: `cancel_upgrade(force, player)` does NOT push a new entry on
the undo stack. Instead, it mutates the prior `upgraded-entity`
action into a no-op (`target.name == original_name`). Any tag we
set previously remains on the now-no-op action.

Implication: `on_cancelled_upgrade` handler must scan the player's
undo stack for the matching tagged `upgraded-entity` and either
clear our tag or call `remove_undo_action`. E14 confirms
`remove_undo_action` is safe — sibling actions in the same item
still undo cleanly.

### Bounded stack with silent FIFO prune

E15: Default cap = 100 items per player. Push N+1 → oldest dropped
silently. Tags die with their action. Mod has **no per-action
cleanup obligation** when Factorio prunes. Storage migration drops
the per-player payload buffer anyway.

### Cross-mod tag namespace

E17: `bp100:` and `othermod:` tags coexist on the same action.
Prefix scan via `pairs(tags)` distinguishes namespaces. No
interference. Mid-flow / on-applied handler must filter on
`bp100:` prefix only.

## Implications for design.md

### `Mid-flow detection` section — REPLACE

The current "peek `get_undo_item(1)` inside mid-flow handler" cannot
work. Action is in flight. Choose ONE of:

- **(A) Disposable-anchor-only.** Mid-flow filter by prototype name
  (`bp100_undo-anchor-*`). Mod's normal handlers ignore events for
  these prototypes. Undo-flow events for non-anchor prototypes are
  treated as genuine player ops (which they essentially are: the
  *world* is changing, even if it was triggered by Ctrl+Z, and the
  state-tracking can re-derive correctly from the resulting world
  state). **Requires E3 anchor prototype to be fixed for redo.**
- **(B) Mod-side normal handlers tolerate "ghost" undo-flow events.**
  Restructure so undo-driven `script_raised_destroy` etc. don't
  mutate project state in a way that double-counts. Likely
  feasible — most current handlers already idempotently re-derive
  from world state. Cost: per-handler audit.
- **(C) Defer mid-flow handler work to next-tick.** Queue the action
  in `on_tick`-deferred storage; drop if `on_undo_applied` fired in
  the interval (signals it was undo-driven and the on-applied handler
  has already done the work). Cost: introduces tick latency for
  state visibility; complicates state model.

Recommendation: **(A) + fix E3 prototype** if a working configuration
is found; fall back to **(B)** otherwise.

### `Anchor strategy` section — NEEDS REVISION

Current `Prototypes.UndoReference` (= `createHiddenEntity` helper)
required `minable` to be added per E3d. With that fix the existing
helper is usable; details below describe pre-E3d worst-case options.

inherits the broken-redo issue from E3. Either:

1. Find a prototype variant that round-trips. Suspects: drop
   `hidden:true`, drop empty `collision_mask`, switch base.
   Follow-up experiment scriptable.
2. Accept undo-only for disposable-anchor ops (no redo). Worse UX
   than current ghost system.
3. Switch to natural anchors universally (option B above).

### Operation matrix — per-row updates

| Row | Op | Update |
|---|---|---|
| #1 Build | mid-flow risk note "None" → restate per universal mid-flow finding |
| #2 Mine | same |
| #6 Rotate | mid-flow risk "None" is **wrong** — `on_player_rotated_entity` fires during undo. Update. |
| #7 Underground drag-rotate | E5 confirmed `build_from_cursor` doesn't trigger drag-rotate. Real drag NEEDS-USER. If real drag emits `rotated-entity`, this row collapses into #6. |
| #8 Settings paste | natural anchor PASS (E6A). E6B (BP shift+lclick) NEEDS-USER. |
| #9 Order upgrade | natural anchor PASS (E8a). |
| **NEW Cancel upgrade** | E8b. New row: `on_cancelled_upgrade` handler scans stack, removes-or-clears matching tagged `upgraded-entity` action via `remove_undo_action`. |
| #11/#12 Wires | only `LuaPlayer.drag_wire` registers actions. Scripted wire ops require disposable anchors. |
| #13/#14 Tiles | both `set_tiles` and `build_from_cursor` register `built-tile`. Mid-flow fires on `tile-ghost`/`deconstructible-tile-proxy`, irrelevant. |

### `Tag protocol` section — minor additions

- Add: tags do NOT auto-transfer; explicit `set_redo_tag` /
  `set_undo_tag` required in handlers.
- Add: action types invert on the redo side; forward-effect handler
  is the right semantic for both directions.
- Add: cross-mod prefix safety verified via `bp100:` namespace
  isolation.

### `Storage` / `Stack-bound payload` — no change needed

E15 confirms tags die with their action; no mod cleanup obligation.

## Open follow-up experiments (all scriptable, none user-blocked except as noted)

1. **E3c**: vary `hidden:true`, `collision_mask`, base prototype.
   Find configuration that round-trips through redo.
2. **E5 real drag**: scripted equivalent of mouse-drag belt over
   underground end. NEEDS-USER unless a `LuaPlayer` API found.
3. **E6B blueprint shift+lclick paste**: NEEDS-USER (world-coord
   mouse gesture).
4. **R-key rotation from real keyboard**: confirm same shape as API
   path (low risk). NEEDS-USER (kwin-mcp limitation, not API).
5. **E15 max_undo_items API**: confirm
   `LuaPlayer.undo_redo_stack.set_max_undo_items()` (or
   per-player config).
6. **Tile mining via real player action**: confirm `removed-tile`
   action type (only `built-tile` observed via `set_tiles`).

## NEEDS-USER summary

Only items that *cannot* be automated:

- E4 (R key, low-risk confirmation)
- E5 (real underground drag)
- E6B (BP shift+lclick paste)
- All four are confirmation-of-already-strong-evidence; design can
  proceed with the API-derived verdicts and revisit if the
  user-driven verification contradicts.
