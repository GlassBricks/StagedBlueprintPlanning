---
summary: "Experiment plan for verifying Factorio 2.0 tag-based undo behavior"
date: 2026-05-02
tags: [factorio, undo, experiments, plan]
---

# Experiment plan for tag-based undo redesign

Each experiment verifies an open-question or load-bearing assumption in
[design.md](./design.md). Findings get aggregated into `_research/`.

## Groups (parallel agents)

- **G1 foundations** (P0): E1, E2, E3 — gate the entire design
- **G2 rotation** (P1): E4, E5
- **G3 settings/upgrade** (P1): E6, E8
- **G4 wires/tiles** (P1): E7, E9
- **G5 paste** (P2): E10, E11, E12
- **G6 edges** (P3): E13, E14, E15, E16, E17

P0 (E1–E3) gates the design. P1 (E4–E9) gates per-op anchor choice
in the operation matrix. P2 (E10–E12) gates blueprint-paste handling.
P3 (E13–E17) edge cases.

---

## P0 — load-bearing for mid-flow suppression

### E1. Undo-stack visibility during mid-flow events

Core assumption of natural-anchor strategy. Build entity → tag the
`built-entity` action. Ctrl+Z. Inside `script_raised_destroy` /
`on_player_mined_entity` handler: read
`player.undo_redo_stack.get_undo_item(1)` and `get_redo_item(1)`. Log
every action + tags. Same probe inside `on_undo_applied`. Same probe
during redo: in `on_built_entity` handler before `on_redo_applied`.

Verdict: at each mid-flow event, is the tagged action visible in
undo[0]? redo[0]? neither?

If popped before mid-flow → suppression must read redo stack, not
undo. Design's "Mid-flow detection" depends on this.

### E2. `set_redo_tag` from inside `on_undo_applied`

Inside `on_undo_applied`, call `stack.set_redo_tag(1, action_index, ...)`.
Then trigger redo. Inspect `actions[].tags` in `on_redo_applied`.

Verdict:
- redo item exists at that moment;
- action indexing matches between undo/redo (or document mapping);
- tag survives.

If indexing differs → need `surface_index_of_action` + position to
re-find action on redo side.

### E3. Disposable anchor round-trip

Define minimal hidden prototype (`simple-entity` base, empty graphics,
`collision_mask = nil`, flags `not-on-map`+`not-blueprintable`+
`not-deconstructable`+`hidden`). `surface.create_entity` then
`entity.destroy({player, undo_index=0})` same tick. Tag the resulting
`removed-entity` action.

Verify:
- `removed-entity` action created and taggable;
- Ctrl+Z fires `script_raised_built` for the disposable entity (filter
  by `entity.name`);
- `on_undo_applied` fires with tag intact;
- redo round-trip works (does Factorio repopulate redo with a
  `built-entity` for it?).

---

## P1 — per-op anchor feasibility

### E4. Rotation action

Place inserter, rotate via R. Confirm `rotated-entity` action exists in
stack. Try `set_undo_tag` post-event. Ctrl+Z → `on_undo_applied` fires
with tags? Does Factorio also fire `on_player_rotated_entity` with
reverse direction during undo? (Mid-flow risk for op #6.)

### E5. Underground belt drag-rotate (op #7)

Place underground pair. Drag a belt over one end. Inspect undo stack:
any action created? `built-entity`? `rotated-entity`? Or no action at
all (fast-replace silent)?

If no action → must use disposable anchor; design row #7 should
reflect.

### E6. Settings paste action

Shift+RClick source, Shift+LClick target. Confirm
`copy-entity-settings` action exists, taggable. Confirm tag survives
undo.

Same for `on_blueprint_settings_pasted` (fires when pasting blueprint
over existing entity).

### E7. Wire add/remove actions

Drag red/green wire between two combinators. Inspect stack: `wire-added`
action present? Tags supported? Tag persists through undo?

Same for wire removal (Shift+LClick wire).

Critical: confirm `wire-added` action and mod's `onWiresPossiblyUpdated`
run on same tick so tag site can compute diff.

### E8. Mark for upgrade action

Use upgrade planner on entity. Confirm `upgraded-entity` action created.
Tag round-trip.

Also: cancel-upgrade (RClick with planner). Action type?

### E9. Tile build/mine actions

Place concrete tile, mine concrete. Confirm `built-tile`,
`removed-tile` actions, tag support. Mid-flow `script_raised_*` analog
for tiles? (Likely `on_player_built_tile` / `on_player_mined_tile`.)

---

## P2 — blueprint paste / grouping

### E10. Blueprint paste tick semantics

Paste 50-entity blueprint. Log per `on_built_entity`:
- `event.tick`
- `playerStack.get_undo_item_count()` and `get_undo_item(1).length`

Verify:
- All events on same tick.
- Item populated with all actions before first `on_built_entity`? Or
  grows as events fire? (Determines whether position→index map can be
  built once.)

### E11. Mod-side append during paste

Inside `on_built_entity` (paste flow), call `entity.destroy({player,
undo_index: 1})` for a disposable. Does it append to the paste item?
Or open a new item? Surface-mismatch (paste on stage 2 surface, mod
runs from current stage surface) — does `undo_index: 1` group across
surfaces? Re-verify with paste case specifically.

### E12. `undo_index: 1` cross-surface grouping at scale

Multi-stage send-to-stage operation: anchor on each stage's surface for
the same project entity. All `undo_index: 1` after first. Confirm
Factorio groups them and `on_undo_applied` sees one item with N actions
across N surfaces.

---

## P3 — edge cases

### E13. Rapid same-tick player op + tag

Player builds entity. Mod tags in `on_built_entity`. Same tick another
`on_built_entity` (e.g. drag-build belt). Does first tag still attach
to the right action? Confirm action index stability when more actions
append same tick.

### E14. `remove_undo_action` behavior

Manually call `stack.remove_undo_action(item_index, action_index)`
between forward op and Ctrl+Z. Confirm:
- remaining tagged actions still fire `on_undo_applied`;
- action indices in `e.actions` reflect post-removal order.

### E15. Factorio-pruned undo entries

Fill stack to its limit (default 100 items?, configurable per-player?).
Push more, confirm oldest dropped silently. Mod-side: any payload
cleanup needed? Storage migration drops the per-player buffer anyway,
but test resilience to "tag points to handler that no longer matters."

### E16. Entity destroyed before undo applied

Force-delete entity, then in another op delete neighbour wire endpoint.
Ctrl+Z all the way back. Verify wire-restore best-effort path silently
skips missing endpoint without crash.

### E17. Cross-mod tag namespace

With another mod also using undo tags (simulate by manually setting
`othermod:foo` tag), confirm mid-flow suppression check correctly only
triggers on `bp100:` keys.
