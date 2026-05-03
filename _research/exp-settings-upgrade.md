---
summary: "Settings paste + upgrade undo behavior (E6, E8)"
date: 2026-05-02
tags: [factorio, undo, experiments, settings, upgrade]
---

# Settings paste & mark-for-upgrade undo behavior

| Exp | Question                                                                                                            | Verdict                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| E6A | `LuaEntity.copy_settings(src, by_player)` produces tagged `copy-entity-settings` undo action; tag survives undo     | PASS                                                                 |
| E6B | Blueprint settings paste (cursor=blueprint, shift+lclick over entity) produces taggable `copy-entity-settings` item | NEEDS-USER (no scriptable trigger; needs world-coordinate mouse gesture) |
| E8a | `LuaEntity.order_upgrade{...,player=p}` produces tagged `upgraded-entity` undo action; tag survives undo            | PASS                                                                 |
| E8b | `LuaEntity.cancel_upgrade(force, player)` produces its own undo action                                              | FAIL — does not push a new entry; mutates the matching prior order_upgrade entry into a no-op (target.name == original_name), preserving any tag we set |

Findings path: `_research/exp-settings-upgrade.md`. Needs-user: E6B.

---

## E6 — settings paste

### Question

Does `LuaEntity.copy_settings(src, by_player=p)`:

1. Trigger `on_entity_settings_pasted`?
2. Add a `copy-entity-settings` action to the player's undo stack?
3. Allow the action to carry a tag that survives undo and surfaces in `on_undo_applied`?

### Verdict — Path A (`copy_settings` API)

PASS on all three.

### Setup

`expSetupE6()` (see `src/test/experiments/settings-upgrade.ts`):
- Place `assembling-machine-2` at `{0,0}` (src) with recipe `iron-gear-wheel`.
- Place `assembling-machine-2` at `{5,0}` (dst) with no recipe.
- `dst.copy_settings(src, player)`.

Then `expCheckE6Stack()` reads the top undo item and tags action 1 with
`bp100:handler="settingsPaste"`, `bp100:data={oldRecipe="automation-science-pack"}`.
Driven Ctrl+Z via kwin-mcp `keyboard_key key=ctrl+z` after focusing the
Factorio window. Then `expCheckE6PostUndo()` + `expDumpEvents()`.

### Evidence

```
[exp] E6 setup src=22 dst=23 dstRecipe=nil
[exp] E6 post-copy dstRecipe=iron-gear-wheel
[exp] E6 post-copy undoCount=1 redoCount=0
[exp] E6 post-copy undoItem(1).length=1
[exp] E6 post-copy undoItem(1).action(1) = {
  entity_with_previous_settings = {entity_number=0, name="assembling-machine-2", position={x=5.5,y=0.5}},
  surface_index = 1,
  target = {entity_number=0, name="assembling-machine-2", position={x=5.5,y=0.5}, recipe="iron-gear-wheel", recipe_quality="normal"},
  type = "copy-entity-settings"
}
[exp] E6 found copy-entity-settings at action 1; tagging
[exp] E6 post-tag action(1) = { ..., tags = {["bp100:data"] = {oldRecipe="automation-science-pack"}, ["bp100:handler"]="settingsPaste"}, ... }

# Ctrl+Z
[exp] E6 post-undo undoCount=0 redoCount=1
[exp] E6 post-undo redoItem(1).length=1
[exp] E6 post-undo redoItem(1).action(1) = {
  entity_with_previous_settings = {entity_number=0, name="assembling-machine-2", position={x=5.5,y=0.5}, recipe="iron-gear-wheel", recipe_quality="normal"},
  surface_index = 1,
  target = {entity_number=0, name="assembling-machine-2", position={x=5.5,y=0.5}},
  type = "copy-entity-settings"
}

# Inline UDP probe of dst recipe state after undo
[exp] E6 ent=23 pos=5.5,0.5 recipe=nil

# Event buffer
[exp]   tick=2658 on_entity_settings_pasted player=1 src=22 dst=23
[exp]   tick=3230 on_undo_applied player=1 actions={{
  entity_with_previous_settings = {... name="assembling-machine-2", position={x=5.5,y=0.5}},
  surface_index = 1,
  tags = {["bp100:data"] = {oldRecipe="automation-science-pack"}, ["bp100:handler"]="settingsPaste"},
  target = {... name="assembling-machine-2", position={x=5.5,y=0.5}, recipe="iron-gear-wheel", recipe_quality="normal"},
  type = "copy-entity-settings"
}}
```

### Implications

- Design row #8 (settings paste): natural anchor on `copy-entity-settings` action confirmed feasible. Tag set inside `on_entity_settings_pasted` works.
- `on_undo_applied`'s `actions[].tags` carries the original tag inline, no separate lookup needed — design's tag-protocol section already assumes this.
- Note the swap on undo: redo action's `target` becomes the previous (empty) state and `entity_with_previous_settings` carries the new (recipe-bearing) state. Factorio inverts the action to model what redo would re-apply. Useful detail when constructing `set_redo_tag` — payload's "old/new" semantics apply to the forward direction; redo handler should still reapply the new state.
- `set_redo_tag` was NOT auto-populated by Factorio after undo; the redo action's `tags` field is absent. Design's plan to call `set_redo_tag` explicitly inside `on_undo_applied` is required.
- `on_entity_settings_pasted` did fire when `copy_settings` was invoked with `by_player`. Existing mod handler at `src/project/event-handlers/entity-events.ts:53` (`luaEntityPossiblyUpdated(e.destination, e.player_index)`) will run. Mid-flow risk: low — settings paste does not destroy/create entities, so `script_raised_*` does not fire. Design row #8 already noted "None" for mid-flow risk; confirmed.

### Verdict — Path B (blueprint settings paste over existing entity)

NEEDS-USER. No scriptable trigger; requires shift+left-click with a
blueprint cursor on a specific world-tile of an existing entity. Within
this experiment's automation budget, screen↔world coordinate translation
in editor view was not stable enough to attempt reliably.

Recommendation: drive in a follow-up user-in-loop run, or skip — mod's
existing `on_blueprint_settings_pasted` listener at
`src/project/event-handlers/build-events.ts:33` shows it is already a
known event, and the action type Factorio creates for both paste flavors
is `copy-entity-settings` per the API docs. Design row #8 should treat
both as the same anchor.

### Caveats

- `copy_settings` was driven from script with `by_player=p`, which is
  exactly the mod's expected real-player path; on
  `on_entity_settings_pasted`, Factorio's normal native paste flow uses
  the same internal codepath. No reason to expect the action shape to
  differ for player-driven paste.
- Tested only the `target` form where source and destination are the
  same prototype. Cross-prototype paste (e.g. assembler→requester chest)
  was not exercised.

---

## E8 — mark for upgrade

### Question

Does `LuaEntity.order_upgrade{force, target, player}`:

1. Add an `upgraded-entity` action to the player's undo stack?
2. Allow the action to carry a tag that survives undo and surfaces in `on_undo_applied`?

And does `LuaEntity.cancel_upgrade(force, player)` add its own action?
What action type?

### Verdict

`order_upgrade`: PASS. `cancel_upgrade`: does NOT add a new undo entry;
instead, mutates the most-recent matching `upgraded-entity` action in
the player's undo stack into a no-op (`target.name == original_name`).
Tags placed on the original `upgraded-entity` action survive the
mutation.

### Setup

`expSetupE8()` places a vanilla `inserter` and clears the stack. Inline
UDP then runs the order/cancel/inspect sequence per sub-experiment
(E8d–E8h variants probed editor's instant-build, cancel-without-prior,
and tag survival).

### Evidence

#### E8a — `order_upgrade` produces tagged `upgraded-entity`

```
[exp] E8 found ent=25 name=inserter
[exp] E8 order_upgrade ok=true
[exp] E8 found upgraded-entity at action 1; tagging
[exp] E8 post-tag action(1) = {
  original_name = "inserter",
  original_quality_name = "normal",
  surface_index = 1,
  tags = {["bp100:data"] = {oldDiff="nil", stage=2}, ["bp100:handler"]="upgradeMark"},
  target = {entity_number=0, name="fast-inserter", position={x=10.5,y=0.5}},
  type = "upgraded-entity"
}

# Ctrl+Z
[exp] E8 post-undo undoCount=0 redoCount=1
[exp] E8 post-undo redoItem(1).action(1) = {
  original_name = "fast-inserter",
  original_quality_name = "normal",
  surface_index = 1,
  target = {entity_number=0, name="inserter", position={x=10.5,y=0.5}},
  type = "upgraded-entity"
}

# on_undo_applied event
[exp]   tick=9414 on_undo_applied player=1 actions={{
  original_name = "inserter", original_quality_name = "normal", surface_index = 1,
  tags = {["bp100:data"] = {oldDiff="nil", stage=2}, ["bp100:handler"]="upgradeMark"},
  target = {entity_number=0, name="fast-inserter", position={x=10.5,y=0.5}},
  type = "upgraded-entity"
}}
```

Tag round-trips. Redo action mirrors the inverse (target becomes the
original prototype, original_name becomes the upgrade target).

#### E8b — `cancel_upgrade` mutates rather than appends

In editor with EditorExtensions, construction completes instantly, so
the inserter was upgraded and the script-side `LuaEntity` invalidated
between order and cancel. Tested in god controller (instant
construction off) instead:

```
[exp] E8e ctrl=1   # god
[exp] E8e order ok=true valid=true toBeUpgraded=true
[exp] E8e cancel ok=true valid=true toBeUpgraded=false
[exp] E8e undoCount=1 redoCount=0
[exp] E8e UNDO item=1 action=1 = {
  original_name = "inserter", original_quality_name = "normal", surface_index = 1,
  target = {entity_number=0, name="inserter", position={x=16.5,y=0.5}},
  type = "upgraded-entity"
}
```

Single undo item, single action, no-op (`target.name == original_name`).

Cancel without a prior `order_upgrade(player)` produces nothing:

```
[exp] E8f order(no player) ok=true undoCount=0
[exp] E8f cancel(player) ok=true undoCount=0 toBeUpgraded=false
```

With unrelated undo entries between order and cancel, cancel still
mutates the matching `upgraded-entity` item in place — does not append a
new item:

```
[exp] E8g after order undoCount=1
[exp] E8g after-disposable undoCount=2
[exp] E8g cancel ok=true undoCount=2
[exp] E8g UNDO item=1 action=1 = removed-entity (the disposable, untouched)
[exp] E8g UNDO item=2 action=1 = {
  original_name = "inserter", target = {name="inserter", ...},
  type = "upgraded-entity"
}
```

Tag survives the mutation:

```
[exp] E8h tag set, undoCount=1
[exp] E8h after cancel undoCount=1
[exp] E8h UNDO item=1 action=1 = {
  original_name = "inserter", original_quality_name = "normal", surface_index = 1,
  tags = {["bp100:handler"] = "upgradeMark"},
  target = {name="inserter", ...},
  type = "upgraded-entity"
}
```

### Implications

For the design's operation matrix:

- **Row #10 (Mark for upgrade)** — natural anchor on the
  `upgraded-entity` action is feasible. Tag in `on_marked_for_upgrade`.
  Mid-flow risk is "None" per the matrix (upgrade marker doesn't
  destroy/create), confirmed by absence of any `script_raised_*` in the
  event buffer.
- **Cancel-upgrade interaction** — a new operation not currently in the
  matrix. `on_cancelled_upgrade` is the corresponding event. Cancel
  collapses the prior order's undo entry into a no-op while leaving
  our tag in place. On Ctrl+Z, the no-op action would still fire
  `on_undo_applied` with our tag, and our handler would erroneously
  revert the project's stage diff even though the user's net effect
  was zero.

  Mitigation options:

  1. In `on_cancelled_upgrade`, scan the player's undo stack for a
     matching tagged `upgraded-entity` action and either remove the
     tag or `remove_undo_action` it.
  2. In the undo handler, detect no-op (`target.name == original_name`
     and `target.quality == original_quality_name`) and skip.

  Option 1 is preferred: cleaner, no zombie tags; mirrors how the
  forward op already had to track state. Add an `on_cancelled_upgrade`
  handler in this revision.

- **Redo tag transfer** — redo action's `tags` field absent post-undo,
  same as E6. Explicit `set_redo_tag` inside `on_undo_applied` required.

- **Editor instant-build interaction** — in editor with EditorExtensions,
  `order_upgrade` triggers immediate replacement of the world entity. The
  `script_raised_built` for the replacement fires the mod's
  `built-events` flow. Design row #11 (fast-replace upgrade) covers this:
  the `built-entity` action is what gets tagged, not the
  `upgraded-entity` action. In normal play (with construction time),
  only `upgraded-entity` fires; row #10's tag handles it. Both rows
  remain valid as separate cases.

### Caveats

- `cancel_upgrade` mutation behavior was inferred from before/after
  inspection; not directly observed in API docs. Re-verify if Factorio
  patches this.
- Quality dimension not exercised; only base quality tested.
- `on_cancelled_upgrade` event firing was not directly logged in this
  run (event listener registered only `on_entity_settings_pasted`,
  `on_undo_applied`, `on_redo_applied`). Confirmed elsewhere by the API
  docs (`cancel_upgrade` raises `on_cancelled_upgrade` instantly when
  return=true). Worth a quick follow-up probe to confirm event payload
  before relying on it for the `on_cancelled_upgrade` handler.
- Did not exercise redo (Ctrl+Y) within this run. Round-trip was
  validated via the redo-stack contents only.

---

## Open questions for design follow-up

1. **`on_cancelled_upgrade` handler** — add to design as a peer to row
   #10. Behavior: locate matching tagged action and call
   `remove_undo_action` (or clear the tag).
2. **Blueprint settings paste (E6B)** — confirm in a follow-up
   user-in-loop or with kwin-mcp once world-coord screen translation is
   reliable.
3. **Cross-prototype settings paste** — does a paste between two
   different prototypes (assembler → requester chest) produce the same
   `copy-entity-settings` action? The API docs don't distinguish; assume
   yes, but flag for confirmation.
