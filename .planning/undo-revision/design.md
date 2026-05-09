# Design: Tag-Based Undo/Redo

## API constraints

Factorio 2.0 (`LuaPlayer.undo_redo_stack`). Behaviours below are confirmed
empirically; see [[experiments/exp-summary.md]] for the experiment matrix
(E1-E17 + E3d).

- **Tagging only.** Tags (`Record<string, AnyBasic>`) attach to existing
  actions. The API cannot create freestanding undo entries; every mod entry
  must piggyback on a real entity/tile op.
- **Action types.** `built-entity`, `removed-entity`, `built-tile`,
  `removed-tile`, `upgraded-entity`, `upgraded-modules`, `wire-added`,
  `wire-removed`, `rotated-entity`, `copy-entity-settings`. Action types
  invert on the redo side (`built-entity` <-> `removed-entity`, etc.); a
  forward-effect handler is the right semantic for both directions.
- **`undo_index` parameter** on `create_entity`, `destroy`,
  `order_deconstruction`, `order_upgrade`, `set_tiles`,
  `cancel_deconstruct_area`. `0` opens a new item, `1` appends to the most
  recent, `nil` is automatic. Requires `player` -- without it the op never
  reaches the stack. `undo_index: 1` groups across surfaces and across
  mixed action types (E11, E12).
- **Tags reach the mod only via `e.actions[].tags` in `on_undo_applied` /
  `on_redo_applied`.** Mid-flow handlers (`script_raised_*`, `on_player_*`)
  cannot peek the stack -- when they fire during an undo or redo, the
  action is *in flight*, popped from undo and not yet pushed to redo. Both
  `get_undo_item_count()` and `get_redo_item_count()` read 0 mid-flow (E1,
  cross-confirmed by G2/G4).
- **No tag auto-transfer.** `set_undo_tag` does not seed the redo entry,
  and vice versa. The handler in `on_undo_applied` must call
  `set_redo_tag` (and `set_undo_tag` from `on_redo_applied`) to round-trip
  (E2).
- **Action indices stable** across same-tick appends, `remove_undo_action`
  compaction, and undo<->redo transitions (E2, E13, E14). For single-action
  items, `act=1` undo (e.g. `built-entity`) maps directly to `act=1` redo
  (`removed-entity`); no `surface_index_of_action`/position fallback
  needed for the simple case.
- **Bounded stack.** Default 100 items per player; FIFO silent prune. Tags
  die with their action; mod has no per-action cleanup obligation when
  Factorio prunes (E15).
- **Cross-mod tag namespace.** `bp100:` and other-mod tags coexist; prefix
  scan via `pairs(tags)` distinguishes (E17).
- **Cancel-upgrade is in-place mutation.** `cancel_upgrade(force, player)`
  does NOT push a new entry; it mutates the prior `upgraded-entity` action
  into a no-op (`target.name == original_name`) (E8b). Any tag set on that
  action persists on the now-stale entry.
- **Scripted wire APIs do not register undo entries.**
  `LuaWireConnector.connect_to/disconnect_from`, even with
  `wire_origin.player`, returns `true` but does NOT push to the stack
  (E7). Only player-driven `LuaPlayer.drag_wire` registers a `wire-added`/
  `wire-removed` action.

## Trust-and-layer

Every undo flow has two phases:

1. **World revert.** Factorio applies the inverse world op. Mid-flow
   events (`script_raised_destroy`, `on_built_entity`,
   `on_player_rotated_entity`, etc.) fire. The mod's normal handlers
   re-derive project state from world state -- they cannot detect that
   this is an undo flow, and they don't need to. Their effect is "make
   project state match the world that now exists", which is the right
   answer **given just the world**.
2. **Tag dispatch.** `on_undo_applied` fires once Factorio has reverted
   every action in the item. The mod iterates `e.actions[]`, dispatches
   each `bp100:handler` to a registry with its `bp100:data`, and applies
   any project-state corrections that the world re-derivation alone
   misses (restored stage diffs, prior `firstStage`, wires, settings).

The tag handler is responsible for the **final** project state after the
undo, regardless of intermediate state during phase 1. Where world
re-derivation already produces the right answer (e.g. plain rotation,
new-entity build), no tag is needed at all. Where it doesn't (force
delete, settings paste, stage moves, anything that touches stage diffs
or cross-stage wires), the tag carries either a delta or, for fully
destructive flows, a complete `EntityExport`.

Disposable-anchor mid-flow events are filtered by prototype name
(`Prototypes.UndoAnchor`) -- the mod's normal handlers short-circuit on
these so they never reach project state.

## Anchor strategy

Every mod undo entry needs a real Factorio op to tag. Two kinds:

1. **Natural anchor.** The Factorio action created by the player's input
   (build, mine, rotate, wire connect, settings paste, upgrade marker,
   tile place/mine). Tag it directly. Phase 1's normal handler runs;
   phase 2's tag handler layers any correction.
2. **Disposable anchor.** A hidden mod-only entity created and destroyed
   in the same tick with `{ player, undo_index: 0 | 1 }`. The resulting
   `removed-entity` action carries the tag. Used when:
   - There is no natural action (mod-driven force delete, send/bring to
     stage, last-stage change, scripted wire/tile mutations).
   - The natural action exists but for a different surface/player than
     the desired tag context.

   `Prototypes.UndoAnchor` shape:
   - Base: `simple-entity-with-owner`.
   - `flags`: `["player-creation", "placeable-off-grid", "not-on-map",
     "not-blueprintable", "not-deconstructable", "hidden"]`.
   - `collision_mask`: `{ layers: {} }`.
   - **`minable: { mining_time: 0.1 }`** -- without this, Factorio
     refuses to create a redo entry for the destroy (E3 vs E3d). The
     engine appears to require non-nil `minable` to permit redo of a
     `script_raised_destroy{player}`; iron-chest control (E3b)
     round-tripped because real entities default to mineable.

   Anchor mid-flow filter: any handler subscribed to
   `script_raised_built`/`script_raised_destroy`/`on_built_entity`/
   `on_player_mined_entity` returns immediately on
   `entity.name == Prototypes.UndoAnchor`.

   Anchor lifecycle on undo: `removed-entity` undo recreates the anchor
   briefly (mid-flow event filtered); `on_undo_applied` runs; handler
   destroys the recreated anchor without `player` so it doesn't pollute
   the stack. Symmetric on redo.

## Tag protocol

Two tags per mod-owned action, namespaced under `bp100`:

```ts
stack.set_undo_tag(item, action, "bp100:handler", handlerName)
stack.set_undo_tag(item, action, "bp100:data", payload)
```

`handlerName` keys into a registry of `(player, data, action) -> void`.
`payload` is fully self-contained: plain tables, no runtime references.
Both directions use the same shape; `on_undo_applied` rewrites them as
`set_redo_tag` (with the inverse-direction handler name and payload) and
vice versa.

`EntityExport` from `src/import-export/entity.ts` is reused wherever full
project-entity state must be serialized -- already validated by
import/export and project save. Carries `firstValue`, `position`,
`direction`, `firstStage`, `lastStage`, `stageDiffs` (`toExportStageDiffs`
maps `NilPlaceholder` -> `{ __nil: true }`), `stageProperties`, and
`wires` as `BlueprintWire[]` keyed by entity number.

**Wire restoration is best-effort.** On undo, each wire endpoint is
looked up by position+name in `ProjectContent`; missing endpoints
(neighbour deleted or moved between delete and undo) are skipped
silently (E16 confirms `find_entity` returns nil cleanly). Multi-entity
items use entity-number maps for wires internal to the group;
cross-group wires fall back to position+name lookup.

Project entity identity in payloads: position + name + direction. There
is no stable per-entity id; lookup uses
`content.findCompatibleEntityForUndo`.

## Operation matrix

Per row: trigger event(s) -> mod state change -> anchor -> tag payload
-> undo handler. Position and surface recovered from
`action.target.position` and `action.surface_index` (or
`surface_index_of_action`).

"Tag needed?" column captures whether phase-1 world re-derivation
already produces the right project state; "no" rows skip tagging
entirely.

### Currently undoable

| #   | Op                                | Mod change                                                                              | Anchor                                                                                                                  | Tag? | Tag payload                              | Undo handler                                                                                          |
| --- | --------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 1   | Force delete                      | `content.deleteEntity` (+ WorldPresentation removes per-stage world entities, no `player` parameter on those destroys) | Disposable, `{ player, undo_index: 0 }`                                                                                 | yes  | `EntityExport(entity)`                   | Deserialize -> `content.addEntity`. Observers create world entities/previews across all stages.       |
| 2   | Manual stage move (preview replaced) | `content.setEntityFirstStage(entity, X)` after build over preview at X with `firstStage = Y > X`                       | Player's `built-entity`. Phase 1 destroys the player's entity on undo; mid-flow handler removes the project entity.     | yes  | `EntityExport` (post-mutation snapshot, with `firstStage = Y`) | Deserialize -> `content.addEntity`. Observers restore preview at X..Y-1, world entity at Y.          |
| 3   | Send to stage                     | `content.setEntityFirstStage(entity, toStage)`                                          | Disposable per entity. First entity `undo_index: 0`, rest `1`. (No natural action.)                                     | yes  | `{ pos, name, oldStage }`                | Lookup -> `content.setEntityFirstStage(entity, oldStage)`.                                            |
| 4   | Bring to stage                    | `content.setEntityFirstStage(entity, toStage)` (lower)                                  | Disposable per entity.                                                                                                  | yes  | `{ pos, name, oldStage }`                | As #3.                                                                                                |
| 5   | Last stage change (incl. cancel)  | `content.setEntityLastStage(entity, newLast)`                                           | Disposable per entity.                                                                                                  | yes  | `{ pos, name, oldLastStage \| nil }`     | Lookup -> `content.setEntityLastStage`.                                                               |

### Newly undoable (added in this revision)

| #   | Op                                          | Mod change                                                                            | Anchor                                                                              | Tag?    | Tag payload                                                                  | Undo handler                                                                                          |
| --- | ------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 6   | Entity rotation                             | `content.setEntityDirection` (+ inserter pickup/drop, loader type)                   | Player's `rotated-entity`. Phase 1's `on_player_rotated_entity` fires with reverse direction during undo and re-derives correctly. | usually no | n/a (or `{ pos, name, oldType?, oldPickup?, oldDrop? }` if ancillary state diverges from rotation re-derivation) | Re-apply ancillary fields if payload present.                                                         |
| 7   | Underground belt drag-rotate                | None (vanilla bug; rotation does not push to undo stack in 2.0)                       | n/a                                                                                 | no      | n/a                                                                          | n/a (vanilla Ctrl+Z also leaves the rotation in place; mod follows suit until Factorio 2.1).         |
| 8a  | Settings paste                              | `content.adjustEntityValue(stage, value)`, `content.setEntityUnstagedValue`           | Player's `copy-entity-settings`. Phase-1 settings-paste event does not naturally invert. | yes  | `{ pos, name, stage, oldFirstValueDiff, oldStageDiffAtStage, oldUnstaged }` | Re-apply old diff fields.                                                                             |
| 8b  | Blueprint settings paste                    | As 8a                                                                                 | Player's `copy-entity-settings` (action emitted to stack but no per-paste event fires; tag site is the `on_pre_build` cursor-blueprint branch in `event-handlers/build-events.ts`). | yes  | As 8a                                                                        | As 8a.                                                                                                |
| 9a  | Player wire add/remove                      | `content.batch` over wire connection mutations                                        | Player's `wire-added` / `wire-removed`.                                              | yes     | `{ added: BlueprintWire[], removed: BlueprintWire[] }` (mod's diff this tick) | Apply inverse: re-add `removed`, re-remove `added`.                                                  |
| 9b  | Scripted wire mutation                      | `content.batch` wire updates                                                          | Disposable (scripted wire APIs do not register actions, E7).                        | yes     | As 9a                                                                        | As 9a.                                                                                                |
| 10  | Mark for upgrade                            | `content.applyEntityUpgrade(entity, stage, target)` (creates stage diff at `stage`)  | Player's `upgraded-entity`.                                                          | yes     | `{ pos, name, stage, oldStageDiffAtStage }`                                  | Restore prior stage diff at `stage`.                                                                  |
| 11  | Cancel upgrade                              | Reverts upgrade stage diff                                                            | n/a -- in-place mutation of the prior `upgraded-entity` action (E8b)                | n/a     | n/a                                                                          | `on_cancelled_upgrade` handler scans the player's undo stack for the matching tagged `upgraded-entity` and calls `remove_undo_action`. The cancel itself is not separately undoable. |
| 12  | Fast-replace upgrade                        | As #10 plus possible direction change                                                 | Player's `built-entity` (the upgrade build).                                        | yes     | `{ pos, name, stage, oldStageDiffAtStage, oldDirection? }`                   | Restore prior diff (and direction).                                                                   |
| 13  | New entity (player build, no preview)       | `content.addEntity(newProjectEntity(...))`                                            | Player's `built-entity`. Phase 1's `script_raised_destroy` removes the project entity on undo. | no  | n/a                                                                          | n/a.                                                                                                  |
| 14  | Player mine                                 | `content.deleteEntity(entity)`                                                        | Player's `removed-entity`. Phase 1's `script_raised_built` on undo creates a vanilla project entity. | yes  | `EntityExport(entity)`                                                       | Lookup vanilla project entity at position; replace via deserialize -> `content.addEntity`.            |
| 15  | Tile build at stage                         | `setTileAtStage(pos, stage, name)`                                                    | Player's `built-tile`.                                                              | yes     | `{ stage, pos, oldName \| nil }`                                             | Restore old tile via `setTileAtStage`.                                                                |
| 16  | Tile mine at stage                          | `setTileAtStage(pos, stage, nil)`                                                     | Player's `removed-tile`.                                                            | yes     | `{ stage, pos, oldName }`                                                    | Restore.                                                                                              |
| 17  | Blueprint paste                             | Per-entity: `addNewEntity` or `handlePasteValue`                                       | Tag every paste `built-entity`; mod-side overrides append with `undo_index: 1`.     | per-entity | See [Blueprint paste](#blueprint-paste).                                  | Per-entity inverse.                                                                                   |

### Deliberately not undoable

- `onSurfaceCleared` (whole-stage clear). One-shot global op.
- `onCleanupToolUsed` / `onTryFixEntity`. Diagnostic refresh.
- `onChunkGeneratedForEntity`. Background bookkeeping.
- `onEntityDied`. Game mechanic.
- `onExcludeFromBlueprintsUsed`. UI flag.
- `ResyncWithWorld` background task.

## Multi-entity grouping

Send/bring to stage and blueprint paste touch many entities at once.
Group in one undo item: first entity's anchor uses `undo_index: 0`,
rest use `1`. One tag pair per entity, on its own action.
`on_undo_applied` iterates `e.actions` regardless of grouping; each
action runs its handler independently.

This replaces the current `_undoGroup` composite handler. Each entity's
tag is self-contained, so partial failures degrade gracefully and
`remove_undo_action` works naturally (E14).

`event-handlers/selection-tools.ts` already loops entities individually;
existing `accumulatedUndoActions` array becomes unnecessary.

## Blueprint paste

Paste creates one undo item with one `built-entity` action per entity
(all `entity-ghost`, since paste creates ghosts without bots). All
`on_built_entity` events fire on the same tick; the item is fully
populated with every action **before the first event fires** (E10).

Because `item.length` is constant across the tick, build a position ->
action-index map lazily on the first paste event of the tick:

```ts
let pasteIndex: Map<string, number> | nil
function tagPasteAction(playerStack, entity, payload) {
  const item = playerStack.get_undo_item(1)
  pasteIndex ??= buildIndex(item) // pos -> action index
  const idx = pasteIndex.get(posKey(entity.position))
  if (idx) playerStack.set_undo_tag(1, idx, "bp100:handler", "...")
}
```

Clear `pasteIndex` in the next-tick callback or on next `on_pre_build`.

Mod-side overrides during paste (e.g. updating an existing project
entity at the same position via `handlePasteValue`) append with
`undo_index: 1` and join the same item, even cross-surface (E11, E12).

Per-entity payloads:

- New entity at empty position: no tag (covered by phase-1
  re-derivation, as op #13).
- Update of existing entity: `{ kind: "update", pos, name,
  oldFirstValueDiff?, oldStageDiffAtStage?, oldUnstaged?, oldDirection? }`.

## Eliminating settings remnants

Settings remnants exist only because the ghost-based undo cannot
restore stage diffs or cross-stage wires after a first-stage delete.
With the full `EntityExport` stored in deletion tags (#1, #14),
restoration becomes deserialize + `content.addEntity` (mirroring
`deserializeAllEntities`).

Sites to remove (~13 files; `grep -rn "settingsRemnant\|SettingsRemnant" src/`):

- `entity/ProjectEntity.ts`, `entity/ProjectContent.ts` -- flag and
  branches.
- `project/WorldPresentation.ts`, `project/EntityHighlights.ts` --
  remnant rendering, revival on rebuild.
- `project/actions/ProjectActions.ts`, `event-handlers/`,
  `ui/opened-entity.tsx` -- remnant-aware paths.
- `import-export/entity.ts` -- `isSettingsRemnant` filter in
  `serializeAllEntities` becomes unnecessary.
- Tests under `entity/`, `project/`, `integration/`.

## Migration

1. Tag-based system added alongside ghost system. New undo registry
   parallel to old.
2. New ops (#6-#17) use tags from day one.
3. Existing handlers (#1-#5) migrate one at a time, each verified.
4. Ghost system removed: `Prototypes.UndoReference`, `UndoHandler`
   ghost machinery, `DelayedEvent`, per-player circular buffer
   (`playerData.undoEntries`, `nextUndoEntryIndex`), `_undoGroup`
   handler, `accumulatedUndoActions` state.
5. Settings remnants removed across all sites.

Storage migration at step 4 drops `playerData.undoEntries` and
`nextUndoEntryIndex`. See `docs/Migrations.md`.

## Decisions

- **Trust-and-layer over mid-flow suppression.** Mid-flow stack-peek is
  impossible (action is in flight, both stacks empty -- E1). Letting
  normal handlers re-derive from world state during phase 1 and then
  layering corrections in `on_undo_applied` is simpler, works
  symmetrically for redo, and matches Factorio's own model.
- **Disposable anchor prototype includes `minable`.** Required by the
  engine to permit redo of `script_raised_destroy{player}` (E3d). All
  other prototype variants tested (no-`minable`, hidden+empty
  collision_mask, flag subsets) failed redo across 7 configurations
  (E3c).
- **`EntityExport` reused for full-restore payloads.** Already validated
  by import/export and project save; avoids a parallel format.
- **Per-entity tags for grouped actions, not one composite tag.** Lets
  Factorio's per-action operations (`remove_undo_action`, partial
  failures) work naturally and contains failure blast radius.
- **Cancel-upgrade is a stack-cleanup op, not separately undoable.**
  `cancel_upgrade` mutates the prior `upgraded-entity` into a no-op in
  place rather than pushing a new entry (E8b). Cleanest path: scan the
  stack from `on_cancelled_upgrade` and `remove_undo_action` the stale
  entry. Re-introducing undo for the cancel would require a disposable
  anchor and yields little user value.
- **Project entity identity is position + name + direction.** No stable
  per-entity id; lookup via `content.findCompatibleEntityForUndo`.
- **Underground belt drag-rotate not handled in 2.0.** Belt-over-underground
  drag visibly rotates the underground end in-game but does not push a
  `rotated-entity` (or any rotation-side action) to the undo stack;
  vanilla Ctrl+Z also fails to revert the rotation. Base-game bug,
  fixed in Factorio 2.1. Mod matches vanilla behaviour. Revisit when
  2.1 ships -- at that point row #7 collapses into row #6.
- **Blueprint settings paste tags from `on_pre_build`, not from a
  paste event.** Shift+LClick blueprint over an existing entity
  emits a `copy-entity-settings` action (E6B) but fires neither
  `on_entity_settings_pasted` nor `on_blueprint_settings_pasted`.
  Only `on_pre_build` fires. Tag-set for row #8b lives in the
  cursor-blueprint branch of the `on_pre_build` handler
  (`event-handlers/build-events.ts`), distinct from row #8a's
  `on_entity_settings_pasted` site.
