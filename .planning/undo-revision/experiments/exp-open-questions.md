---
summary: "Open-question verification: E4 R-key rotation, E5 belt drag-rotate over underground end, E6B blueprint shift+LClick paste"
date: 2026-05-08
tags: [factorio, undo, experiments, follow-up]
---

# Open-question verification (E4-key, E5-realdrag, E6B)

User-in-loop run, Factorio 2.0.72. Closes the three NEEDS-USER items
flagged in earlier experiments.

| Exp           | Question                                                                              | Verdict                                                                                                |
| ------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| E4-key        | `R` keystroke from real player produces same `rotated-entity` shape as API path        | PASS                                                                                                   |
| E5-realdrag   | Real mouse-drag belt over underground end -> what action(s)?                          | DEFER (vanilla bug; underground rotation from drag is not undone by base-game Ctrl+Z either; fixed in Factorio 2.1) |
| E6B           | Blueprint Shift+LClick over existing entity emits `copy-entity-settings`?              | PASS (action emitted + taggable; tag round-trips through `on_undo_applied`)                            |

Run logs: `/tmp/exp-run1.log` (E4 + E5), `/tmp/exp-run2.log` (E6B).
Experiment harness: `src/test/experiments/open-questions.ts` (deleted
after run).

---

## E4 -- R-key rotation

Setup: place inserter at `(0.5, 0.5)` dir=east(4). Player hovers, presses R.

Stack inspection after R:

```
undo[1].action[1] = {
  original_direction = 4, original_mirroring = false, surface_index = 1,
  target = { entity_number = 0, name = "inserter", position = {x=0.5, y=0.5} },
  type = "rotated-entity"
}
```

Identical shape to `entity.rotate({by_player=p})` from `exp-rotation.md`
E4. Tag round-trips through `on_undo_applied` (`tags = {["bp100:data"] =
{idx=1, label="e4-pre"}, ["bp100:handler"] = "exp-e4-pre"}`).

Confirms: the API rotation path and the real-keyboard rotation path
share a single internal codepath. Design row #6 may treat them
identically.

---

## E5 -- mouse-drag belt over underground end

Setup: underground pair `in@(4.5,0.5)` -> `out@(7.5,0.5)`, both
dir=east(4). Player held transport-belt, dragged.

Observed stack: 12 `built-entity` actions for `transport-belt` at
positions `{-3.5, -2.5, -1.5, -0.5, 0.5, 1.5, 2.5, 3.5}` and
`{8.5, 9.5, 10.5, 11.5}` — gap at the underground tiles `(4.5, 0.5)`
and `(7.5, 0.5)`. No `rotated-entity` action created. 30 events traced
during drag (`on_pre_build` + `on_built_entity` per belt + a couple
incidentals); zero `on_player_rotated_entity`.

The drag visibly rotated the underground end in-game (per user), but
the rotation was not pushed to the undo stack — and Ctrl+Z did not
undo it. **This is a base-game bug**: vanilla Factorio's undo also
does not revert the underground rotation triggered by belt drag. Bug
fixed in 2.1 (some months out).

Design implication for row #7:

- For 2.0, mod doesn't need to handle drag-induced underground rotation
  specially. Vanilla Ctrl+Z leaves the rotation in place; mod follows
  suit. Project state mutates via the drag's `built-entity` chain
  (which mostly produces normal fast-replaces and ghost places); any
  underground rotation that did happen stays in-place after undo, and
  the project entity reflects whatever the world ends up with.
- Row #7 collapses into "no special handling required"; the disposable
  anchor strategy is unnecessary.
- Revisit when Factorio 2.1 ships and emits a `rotated-entity` for the
  drag-rotate case; at that point row #7 collapses into row #6.

---

## E6B -- shift+LClick blueprint paste over existing entity

Setup: place `assembling-machine-2` at `(12.5, 0.5)` with recipe
`iron-gear-wheel`. Build a blueprint in cursor with a single
`assembling-machine-2` at `(0,0)` carrying recipe `copper-cable`.
Player shift+LClicks over the existing assembler.

Stack inspection after paste:

```
undo[1].action[1] = {
  type = "copy-entity-settings",
  surface_index = 1,
  target = {
    entity_number = 0, name = "assembling-machine-2",
    position = {x=12.5, y=0.5},
    recipe = "copper-cable", recipe_quality = "normal"
  },
  entity_with_previous_settings = {
    entity_number = 0, name = "assembling-machine-2",
    position = {x=12.5, y=0.5},
    recipe = "iron-gear-wheel", recipe_quality = "normal"
  }
}
```

Action shape **identical** to E6A (entity-to-entity `copy_settings`
via API). Tag round-trips through `on_undo_applied`. Redo action
inverts payload (target<->entity_with_previous_settings) as expected.

### Event surprise

Only one event fires during the actual paste: `on_pre_build`. **None**
of the following fire:

- `on_entity_settings_pasted`
- `on_blueprint_settings_pasted`
- `on_built_entity`
- `script_raised_built` / `script_raised_destroy`

Trace counter: 2 events at `e6b-pre` time (1 = setup's
`script_raised_built`, 1 = `on_pre_build` from the paste).

This means: the `copy-entity-settings` undo entry exists, but the mod
cannot tag it from `on_entity_settings_pasted` for blueprint-paste
flows -- that event simply doesn't fire. Tag must be set from the
`on_pre_build` cursor-blueprint-detection path (which the mod already
uses, see `src/project/event-handlers/build-events.ts:46` ->
`onPreBlueprintPasted`).

### Design implication for row #8b

- Natural anchor on `copy-entity-settings` confirmed.
- Tag site for blueprint paste differs from entity-paste (E6A):
  - E6A (`on_entity_settings_pasted`): tag from that handler.
  - E6B (no event fires): tag from the `on_pre_build` cursor-blueprint
    branch, after `onPreBlueprintPasted` resolves which entities are
    being overlaid. The action is on the stack at that point (verified
    by the fact that the undo[1] dump several seconds later shows it).
- Open follow-up (low priority): confirm that the action lands on the
  stack within `on_pre_build`'s synchronous tick, so tagging from
  inside the `on_pre_build` handler can read it. Worst case: defer
  tag-set to next tick via a queued callback.

---

## Cross-cutting notes

- `on_pre_build` fires for cursor-blueprint paste regardless of whether
  the paste is settings-paste-over-entity or new-entity-build. The mod's
  existing `is_cursor_blueprint()` branch handles both.
- The "trust-and-layer" model still holds for E6B: `on_pre_build`
  detects the paste and runs phase-1 project-state mutation; the tag's
  phase-2 handler in `on_undo_applied` undoes whatever phase-1 did.
- `bp100:` tag namespace verified to round-trip cleanly across all three
  cases.
