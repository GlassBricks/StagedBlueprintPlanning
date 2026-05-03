---
summary: "Follow-up experiments E3c (anchor prototype variants), E2c (multi-action set_redo_tag), E15b (set_max_undo_items API). All variants of simple-entity-with-owner fail to redo; multi-action tag round-trip works; no max-items setter exists."
date: 2026-05-02
tags: [factorio, undo, experiments, followup, anchors, design]
---

# Follow-up experiments — E3c, E2c, E15b

Driver: `scripts/run-followup-exp.sh` on branch `undo-rev-followup`,
port 14440. Evidence: `factorio-test-data-dir/factorio-current.log`
(`[exp:followup]` lines).

## Verdict table

| Exp | Question | Verdict |
|---|---|---|
| E3c | Find a `simple-entity-with-owner` (or `simple-entity`) prototype variant that round-trips through redo | **FAIL** — no variant works |
| E2c | `set_redo_tag` works for action indices 2..N within a multi-action item | **PASS** |
| E15b | `LuaUndoRedoStack.set_max_undo_items` setter exists | **NO** (resolved statically from typed-factorio) |

## E3c — anchor prototype variant search

Seven variants tested. Each: `surface.create_entity(...)` then
`entity.destroy({raise_destroy:true, player:p, undo_index:0})`,
tag the resulting `removed-entity` action, Ctrl+Z, Ctrl+Y, observe.

| Variant | Base | hidden | collision_mask | flags | Destroy registers? | redoCount after on_undo_applied |
|---|---|---|---|---|---|---|
| V0 | simple-entity-with-owner | true | empty | player-creation, placeable-off-grid | YES | **0** |
| V1 | simple-entity-with-owner | false | empty | player-creation, placeable-off-grid | YES | **0** |
| V2 | simple-entity-with-owner | true | (default) | player-creation, placeable-off-grid | YES | **0** |
| V3 | simple-entity-with-owner | true | empty | player-creation only | YES | **0** |
| V4 | simple-entity-with-owner | true | empty | placeable-off-grid only | **NO** | n/a |
| V5 | simple-entity (not owner) | true | empty | player-creation, placeable-off-grid | **NO** | n/a |
| V6 | simple-entity-with-owner | false | (default) | player-creation only | YES | **0** |

Final summary line:
`E3c summary: {[V0]=false, [V1]=false, [V2]=false, [V3]=false, [V6]=false}`
(V4/V5 absent because no undo entry was created → no redo to test).

### Necessary conditions for `entity.destroy{player, undo_index:0}` to register a `removed-entity` action

- Base must be `simple-entity-with-owner` (V5 fails with `simple-entity`).
- Flags must include `player-creation` (V4 fails with only `placeable-off-grid`).

Neither condition is sufficient for redo.

### Hidden-flag is irrelevant

V0/V1 both fail. V2/V6 both fail. The `hidden:true` setting does not
cause the redo failure.

### Collision-mask is irrelevant

V0 (empty) and V2 (default) both fail. The empty `{layers:{}}` mask
does not cause the redo failure.

### Flags subset is irrelevant

V0 (both flags) and V3 (just `player-creation`) both fail. The
`placeable-off-grid` flag does not cause the redo failure.

### Conclusion: `simple-entity-with-owner` itself cannot redo

The redo failure is intrinsic to the **prototype type**
`simple-entity-with-owner` after `entity.destroy({player,undo_index:0})`.

Compare to E3b (G1's control): `iron-chest` (a `container`) under the
exact same flow round-trips cleanly. Same API call, same player, same
`undo_index:0`. Difference: prototype type.

Hypothesis (untested): Factorio's redo-of-removed-entity path checks
that the prototype is "naturally placeable" (real built entities,
e.g. `container`, `transport-belt`). `simple-entity-with-owner` is
designed for script-spawned markers and Factorio refuses to recreate
it through redo even when invoked with `raise_destroy:true,player`.

### Implication for design.md

The current `Prototypes.UndoReference` (= `createHiddenEntity`
helper, baseline V0) **cannot** be used as a disposable anchor under
the proposed strategy. It registers a `removed-entity` action, the
tag is delivered correctly via `on_undo_applied`, but no redo entry
is ever created → Ctrl+Y becomes a no-op for these ops.

Options:
1. **Switch the anchor base** to a real-buildable entity type (e.g.
   `container`, `assembling-machine`, or any `entity` that's placeable
   from cursor like the existing `Prototypes.PastePole` electric-pole
   anchor). Will likely round-trip but is much heavier (collision,
   tile-buildability, force ownership, etc.). Needs separate
   experiment.
2. **Accept undo-only** for disposable-anchor ops. Forward + undo
   work. Redo silently fails. Worse UX than the current ghost-based
   system. Send-to-stage / Bring-to-stage / Last-stage-change /
   Underground drag-rotate would all become non-redoable.
3. **Switch to natural-anchor everywhere**, with mod-side handlers
   tolerating "ghost" undo-flow events. (See exp-summary.md option
   B.)

Recommendation pending an option-1 follow-up: try `container` /
`assembling-machine` / `electric-pole` (Prototypes.PastePole already
exists and IS an electric-pole — it's the obvious test target).

## E2c — multi-action `set_redo_tag` round-trip

Setup:
1. Spawn 3 iron-chests at (22.5, 2.5), (24.5, 2.5), (26.5, 2.5).
2. Destroy first with `undo_index:0`, rest with `undo_index:1` →
   single undo item with 3 `removed-entity` actions.
3. Tag each action via `set_undo_tag(1, k, "bp100:data", {act=k})`
   for k=1..3.
4. Ctrl+Z. In `on_undo_applied`, call
   `set_redo_tag(1, k, "bp100:data", {act=k, kind="E2c-redo"})`
   for each `e.actions[k]`.
5. Verify redo[1] tags. Ctrl+Y. Verify `on_redo_applied` carries the
   redo tags.

Evidence (compressed):

```
[exp:followup] E2c destroy: undoCount before=1 after=2
[exp:followup] E2c item has 3 actions
[exp:followup] E2c set_undo_tag(1,1) ok=true
[exp:followup] E2c set_undo_tag(1,2) ok=true
[exp:followup] E2c set_undo_tag(1,3) ok=true
[exp:followup] E2c post-setup:stack UNDO[1] act=1 type=removed-entity
   target=iron-chest@(22.5,2.5) tags={["bp100:data"]={act=1, kind="E2c"}, ...}
[exp:followup] E2c post-setup:stack UNDO[1] act=2 type=removed-entity
   target=iron-chest@(24.5,2.5) tags={["bp100:data"]={act=2, kind="E2c"}, ...}
[exp:followup] E2c post-setup:stack UNDO[1] act=3 type=removed-entity
   target=iron-chest@(26.5,2.5) tags={["bp100:data"]={act=3, kind="E2c"}, ...}

[exp:followup] on_undo_applied tick=5144 actions=3
[exp:followup] on_undo_applied act=1 type=removed-entity tags={act=1, kind=E2c}
[exp:followup] E2c set_redo_tag(1,1) actIdx=1 ok=true
[exp:followup] on_undo_applied act=2 type=removed-entity tags={act=2, kind=E2c}
[exp:followup] E2c set_redo_tag(1,2) actIdx=2 ok=true
[exp:followup] on_undo_applied act=3 type=removed-entity tags={act=3, kind=E2c}
[exp:followup] E2c set_redo_tag(1,3) actIdx=3 ok=true

[exp:followup] on_undo_applied:stack-end REDO[1] act=1 type=built-entity
   target=iron-chest@(26.5,2.5) tags={act=1, kind=E2c-redo}
[exp:followup] on_undo_applied:stack-end REDO[1] act=2 type=built-entity
   target=iron-chest@(24.5,2.5) tags={act=2, kind=E2c-redo}
[exp:followup] on_undo_applied:stack-end REDO[1] act=3 type=built-entity
   target=iron-chest@(22.5,2.5) tags={act=3, kind=E2c-redo}

[exp:followup] on_redo_applied tick=5253 actions=3
[exp:followup] on_redo_applied act=1 type=built-entity tags={act=1, kind=E2c-redo}
[exp:followup] on_redo_applied act=2 type=built-entity tags={act=2, kind=E2c-redo}
[exp:followup] on_redo_applied act=3 type=built-entity tags={act=3, kind=E2c-redo}
[exp:followup] E2c finish: tagged on redo = {true, true, true}
```

### Conclusions

- `set_redo_tag(1, k, ...)` works for k=1..N inside `on_undo_applied`.
  No special privilege for `act=1`.
- All three tags survive into `on_redo_applied.actions` correctly,
  matched by action index.
- **Caveat: action ordering reverses between undo and redo.**
  - Original undo[1]: act=1 → pos (22.5,_), act=2 → (24.5,_), act=3 → (26.5,_).
  - Resulting redo[1]: act=1 → pos (26.5,_), act=2 → (24.5,_), act=3 → (22.5,_).
  - `on_undo_applied.e.actions` reports the **original undo** ordering
    (matching what was just popped). Inside that handler,
    `set_redo_tag(1, k, ...)` tags `redo[1].action[k]`, which
    corresponds to a **different world entity** than `undo[1].action[k]`.
  - Tags applied by **action index** still round-trip correctly
    (E2c verified). But tags must carry their own logical key (e.g.
    a position) if downstream redo handler needs to map back to the
    original undo target.

### Implication for design.md

- Multi-action tag round-trip is fully supported. Paste / multi-anchor
  flows (E10–E12 already verified the build side; E2c verifies the
  destroy/tag side) can attach per-action tags safely.
- Add a note: Factorio reverses action ordering between undo and redo
  entries. Handlers that index action_id → world_entity must rely on
  data inside the tag (or `target.position`), not on the action index
  alone.

## E15b — `set_max_undo_items` API

Resolved statically from `node_modules/typed-factorio/runtime/generated/classes.d.ts`,
`LuaUndoRedoStack` interface (lines 33420–33550):

Methods exposed:
- `get_undo_item`, `get_undo_item_count`, `remove_undo_item`,
  `remove_undo_action`
- `get_redo_item`, `get_redo_item_count`, `remove_redo_item`,
  `remove_redo_action`
- `get_undo_tags`, `get_undo_tag`, `set_undo_tag`, `remove_undo_tag`
- `get_redo_tags`, `get_redo_tag`, `set_redo_tag`, `remove_redo_tag`
- `player_index`, `valid`, `object_name`

**No `set_max_undo_items` method exists.** The 100-item cap (E15) is
fixed in the engine. Mods cannot extend it via this API. (A
per-player utility setting may exist — out of scope for this
follow-up.)

### Implication for design.md

- Don't plan around mod-controlled cap extension.
- The `Pro_per` payload-storage budget (E15: tags die with action,
  no per-action cleanup obligation) is bounded at 100 items × N
  actions per item × tag size. Acceptable for typical play.

## Cross-cutting note: action ordering reversal

Combining E2c with prior E2 (single-action) and E10–E12 (paste,
G5):

- Single-action items: undo↔redo action index mapping is `1↔1`. No
  ordering issue.
- Multi-action items: action index `k` in `on_undo_applied.e.actions`
  matches `redo[1].action[k]` for the purpose of `set_redo_tag(1,k,...)`,
  but the **underlying world-target ordering is reversed** between
  undo[1] and redo[1].

This is a previously-unobserved subtlety. Update design.md to:
1. Tag delivery and handler chaining via action index k works
   correctly.
2. To map across undo↔redo boundaries, use the tag payload's own
   logical key — never assume action index k of undo refers to the
   same world entity as action index k of redo.

## Cleanup

- Driver script removed.
- `src/test/experiments/followup.ts` removed.
- `src/test/test-init.ts` import line reverted.
- `src/prototypes/entity-marker.ts` E3c variant additions reverted.
- `factorio-test-data-dir/config.ini` restored from `.user-backup`.
- No factorio / kwin-mcp / tmux processes left running.

## Status

DONE. Branch `undo-rev-followup` carries the findings commit. Worktree
not merged.
