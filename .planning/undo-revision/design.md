# Design: Tag-Based Undo/Redo

## API constraints

Factorio 2.0 (`LuaPlayer.undo_redo_stack`) shapes the design:

- **Tagging only.** Tags (`Record<string, AnyBasic>`) attach to existing
  actions. The API cannot create freestanding undo entries; every mod
  entry must piggyback on a real entity/tile op.
- **Action types.** `built-entity`, `removed-entity`, `built-tile`,
  `removed-tile`, `upgraded-entity`, `upgraded-modules`, `wire-added`,
  `wire-removed`, `rotated-entity`, `copy-entity-settings`. Each carries
  a target (`BlueprintEntity` or similar) and surface index.
- **`undo_index` parameter** on `create_entity`, `destroy`,
  `order_deconstruction`, `order_upgrade`, `set_tiles`,
  `cancel_deconstruct_area`. `0` opens a new item, `1` appends to the
  most recent, `nil` is automatic. Requires `player` — without it the
  op never reaches the stack.
- **Events.** `on_undo_applied` / `on_redo_applied` fire after Factorio
  has already reverted the world op, with `actions: UndoRedoAction[]`
  carrying tags inline.
- **No `on_pre_undo_applied` event, no `from_undo` flag on built/destroy
  events.** Mid-flow events (`on_built_entity`, `script_raised_built`,
  `on_player_mined_entity`, `script_raised_destroy`) fire during undo
  with no signal that they are part of an undo. The mod must detect
  undo flow itself; see [Mid-flow detection](#mid-flow-detection).
- **No automatic redo-tag transfer.** Tags set via `set_undo_tag` do
  not appear on the redo stack. `set_redo_tag` must be called
  explicitly during `on_undo_applied` (and vice versa) to round-trip.

### Verified behaviour

Findings from prototyping, load-bearing for everything below:

- Tags round-trip for strings, nested tables, and large payloads (100
  entries with nested data). Each action in an item carries independent
  tags.
- `entity.destroy({ player, undo_index: 0 })` registers a
  `removed-entity` action; tags can be set on it after the call returns.
- `on_undo_applied` fires once Factorio has reverted **every** action
  in the item. Sequence for undoing a build:
  1. `script_raised_destroy` (entity gone, `find_entity` returns nil)
  2. `on_undo_applied`

  Redo of the same item:
  1. `on_built_entity` (entity back)
  2. `on_redo_applied`

- For a create-then-destroy item, undo replays both: create fires,
  then destroy. Net result no entity. Redo same. Handlers must tolerate
  the intermediate build/destroy events.
- `undo_index: 1` groups across surfaces and across mixed
  create/destroy operations.

## Tag protocol

Two tags per mod-owned action, namespaced under `bp100`:

```ts
stack.set_undo_tag(item, action, "bp100:handler", handlerName)
stack.set_undo_tag(item, action, "bp100:data", payload)
```

`handlerName` keys into a registry of `(player, data, action) -> void`.
`payload` is fully self-contained: plain tables, no runtime references.
Both undo and redo tags use the same shape; `on_undo_applied` rewrites
them as `set_redo_tag` and vice versa.

Per-handler payload formats are defined in
[Operation matrix](#operation-matrix).

`EntityExport` from `src/import-export/entity.ts` is reused wherever
full project-entity state must be serialized — already validated by
import/export and project save. Carries `firstValue`, `position`,
`direction`, `firstStage`, `lastStage`, `stageDiffs`
(`toExportStageDiffs` maps `NilPlaceholder` → `{ __nil: true }`),
`stageProperties`, and `wires` as `BlueprintWire[]` keyed by entity
number.

**Wire restoration is best-effort.** On undo, each wire endpoint is
looked up by position+name in `ProjectContent`; missing endpoints
(neighbour deleted or moved between delete and undo) are skipped
silently. Multi-entity items use entity-number maps for wires
internal to the group; cross-group wires fall back to position+name
lookup.

## Anchor strategy

Every mod undo entry needs a real Factorio op to tag. Two kinds:

1. **Natural anchor.** The action Factorio already creates from the
   user's input (player build, deconstruct, rotate, wire connect,
   settings paste, upgrade marker, tile place/mine). If the action
   semantically corresponds to the mod's effect, tag it directly.

2. **Disposable anchor.** A hidden mod-only entity created and
   destroyed in the same tick with `{ player, undo_index: 0 | 1 }`.
   The resulting `removed-entity` action carries the tag. The
   prototype has a unique name; mod event handlers filter by name and
   ignore it during normal create/destroy events.

   Use a disposable anchor whenever:
   - There is no natural action (custom-input tools, GUI changes).
   - The natural action is a real entity event whose normal mod
     handler would fight with the desired undo behaviour.

Disposable anchors replace the role of today's `UndoReference` ghost
entity, but as an inert tag carrier rather than the undo-trigger
mechanism.

### Mid-flow detection

When a tag sits on a real player action (`built-entity`,
`removed-entity` for a project-tracked entity), undoing it fires
`script_raised_destroy` / `script_raised_built` (or their `on_player_*`
equivalents) **before** `on_undo_applied`. The mod's normal handler
would react and mutate project state in ways that conflict with the
undo intent.

Example: preview-replaced undo. Player built at stage X; mod set
`firstStage = X`. Ctrl+Z destroys the entity. `script_raised_destroy`
fires, finds `firstStage == X == currentStage`, treats as a
first-stage delete, removes the project entity. `on_undo_applied`
runs afterwards and can no longer find the entity.

The fix: **inspect the undo stack top inside mid-flow handlers**. If
the topmost undo (or redo) item contains an action with a `bp100:`
tag whose `target.position` and surface match the current event,
skip the normal handler — the upcoming `on_undo_applied` will apply
the correct inverse.

To distinguish "tag we just set during a normal flow" from "tag from
an action being undone right now", maintain a tick-scoped
`currentlyTagging` flag. Skip the suppression check while we're
authoring tags inside our own event handler.

This is the central correctness mechanism for natural-anchor
operations. Validation needed: confirm Factorio leaves the action on
the undo stack throughout per-action mid-flow events, only popping it
when `on_undo_applied` returns. If not, fall back to disposable
anchors for these cases (with the trade-off of extra entity churn).

## Operation matrix

Each row: trigger event(s) → mod state change → anchor → tag payload
→ undo handler → redo behaviour.

Position and surface are recovered from `action.target.position` and
`action.surface_index` (or `surface_index_of_action(item, action)`),
and the project entity via
`content.findCompatibleEntityForUndo`.

### Currently undoable

| #   | Op                                   | Trigger                                                                         | Mod change                                                                            | Anchor                                                                                                                          | Tag payload                              | Undo handler                                                                                                                                                                                           | Mid-flow risk                                                                       |
| --- | ------------------------------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| 1   | Force delete                         | `CustomInputs.ForceDelete`, ForceDeleteTool, reverse CleanupTool, StagedCutTool | `content.deleteEntity(entity)` (+ WorldPresentation removes per-stage world entities) | First WorldPresentation `destroy()` (user's current stage) gets `{ player, undo_index: 0 }`. `removed-entity` action.           | `EntityExport(entity)`                   | Recreate: Factorio creates a LuaEntity at the tagged stage. Handler deserializes, calls `content.addEntity` (observers rebuild all stages). Suppress mid-flow `script_raised_built` for this position. | `script_raised_built` for recreated LuaEntity → suppress via undo-stack inspection. |
| 2   | Manual stage move (preview replaced) | `on_built_entity` over a preview at current stage X with `firstStage == Y > X`  | `content.setEntityFirstStage(entity, X)`                                              | Player's `built-entity` action.                                                                                                 | `{ oldStage: Y }`                        | Set `firstStage` back to `Y`. WorldPresentation refreshes.                                                                                                                                             | `script_raised_destroy` for player's entity → suppress.                             |
| 3   | Send to stage                        | StageMoveTool selection, FilteredStageMoveTool, MoveToThisStage CustomInput     | `content.setEntityFirstStage(entity, toStage)`                                        | Disposable anchor per entity (no real entity destroyed/created at the tool stage). First entity uses `undo_index: 0`, rest `1`. | `{ oldStage: fromStage }`                | Set `firstStage` back to `oldStage`.                                                                                                                                                                   | None (anchor filtered by name).                                                     |
| 4   | Bring to stage                       | StageMoveTool reverse selection, BringToStage tool                              | `content.setEntityFirstStage(entity, toStage)` (lower)                                | Disposable anchor per entity.                                                                                                   | `{ oldStage: fromStage }`                | Set `firstStage` back.                                                                                                                                                                                 | None.                                                                               |
| 5   | Last stage change (incl. cancel)     | StageDeconstructTool & alt/reverse, StageDeleteCancel                           | `content.setEntityLastStage(entity, newLast)`                                         | Disposable anchor per entity.                                                                                                   | `{ oldLastStage: prevLastStage \| nil }` | Set `lastStage` back.                                                                                                                                                                                  | None.                                                                               |

### Newly undoable (added in this revision)

| #   | Op                                    | Trigger                                                                                                                 | Mod change                                                                                                                | Anchor                                                                                         | Tag payload                                                                   | Undo handler                                    | Mid-flow risk                                                  |
| --- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------- |
| 6   | Entity rotation                       | `on_player_rotated_entity`                                                                                              | `content.setEntityDirection(entity, dir)` (+ inserter pickup/drop, loader type if applicable)                             | Player's `rotated-entity` action.                                                              | `{ oldDirection, oldType?, oldPickup?, oldDrop? }`                            | Re-apply old direction and ancillary fields.    | None (rotation doesn't destroy/create).                        |
| 7   | Underground belt drag rotate          | `on_pre_build` while dragging a belt over an underground                                                                | Same as #6 plus possible pair flip                                                                                        | Anchor (no native action; the belt build is fast-replace).                                     | `{ oldDirection }`                                                            | Rotate back.                                    | None.                                                          |
| 8   | Settings paste                        | `on_entity_settings_pasted`, `on_blueprint_settings_pasted`                                                             | `content.adjustEntityValue(stage, value)`, `content.setEntityUnstagedValue`                                               | Player's `copy-entity-settings` action.                                                        | `{ oldFirstValueDiff, oldStageDiffAtStage, oldUnstaged }`                     | Re-apply old diff fields.                       | None.                                                          |
| 9   | Wire add/remove                       | `on_player_setup_wire_drag` finalised → `wire-added` / `wire-removed` action; mod's `onWiresPossiblyUpdated` runs after | `content.batch` over wire connection mutations                                                                            | Player's `wire-added` / `wire-removed` action.                                                 | `{ added: BlueprintWire[], removed: BlueprintWire[] }` (mod's diff this tick) | Apply inverse: re-add removed, re-remove added. | None (tag is on a wire-\* action, no entity destroy involved). |
| 10  | Mark for upgrade                      | `on_marked_for_upgrade`                                                                                                 | `content.applyEntityUpgrade(entity, stage, target)` (creates stage diff at `stage`)                                       | Player's `upgraded-entity` action.                                                             | `{ stage, oldStageDiffAtStage }`                                              | Restore prior stage diff at `stage`.            | None.                                                          |
| 11  | Fast-replace upgrade                  | `on_built_entity` matched to a recently-mined entity                                                                    | Same as #10 (and direction change if rotated)                                                                             | Player's `built-entity` (the upgrade build).                                                   | `{ stage, oldStageDiffAtStage, oldDirection? }`                               | Restore prior diff (and direction).             | `script_raised_destroy` of replacement → suppress.             |
| 12  | New entity (player build, no preview) | `on_built_entity` with no project entity at position                                                                    | `content.addEntity(newProjectEntity(...))`                                                                                | Player's `built-entity`.                                                                       | `{ entityNumber }` (the project entity's id, used to look it up)              | `content.deleteEntity` of that project entity.  | `script_raised_destroy` of player's entity → suppress.         |
| 13  | Player mine                           | `on_player_mined_entity`                                                                                                | `content.deleteEntity(entity)` or settings remnant (going away — see [Settings remnants](#eliminating-settings-remnants)) | Player's `removed-entity`.                                                                     | `EntityExport(entity)`                                                        | Deserialize + `content.addEntity`.              | `script_raised_built` for player's mined entity → suppress.    |
| 14  | Tile build at stage                   | Tile build event in stage surface                                                                                       | `setTileAtStage(pos, stage, name)`                                                                                        | Player's `built-tile`.                                                                         | `{ stage, oldName \| nil }`                                                   | Restore old tile via `setTileAtStage`.          | `script_raised_destroy` of tile → suppress (tile-flavoured).   |
| 15  | Tile mine at stage                    | Tile mine event                                                                                                         | `setTileAtStage(pos, stage, nil)`                                                                                         | Player's `removed-tile`.                                                                       | `{ stage, oldName }`                                                          | Restore.                                        | Suppress.                                                      |
| 16  | Blueprint paste                       | `on_pre_build` (cursor blueprint) → series of `on_built_entity` (entity-ghosts)                                         | Per-entity: `addNewEntity` or `handlePasteValue` (which can update existing)                                              | Tag every paste `built-entity` action; mod overrides during paste append with `undo_index: 1`. | Per-entity, see Blueprint paste section.                                      | Per-entity inverse.                             | `script_raised_destroy` per entity ghost → suppress en masse.  |

### Deliberately not undoable

- `onSurfaceCleared` (whole-stage clear). One-shot global op, no
  practical undo.
- `onCleanupToolUsed` / `onTryFixEntity` (cleanup tool). Diagnostic
  refresh, no state change worth undoing.
- `onChunkGeneratedForEntity`. Background bookkeeping.
- `onEntityDied`. Game mechanic, not user intent.
- `onExcludeFromBlueprintsUsed`. UI flag, fine without undo.
- ResyncWithWorld background task.

## Event-flow walkthroughs

### Force delete (op #1)

Forward:

1. `CustomInputs.ForceDelete` → `onEntityForceDeleteUsed`.
2. Build `EntityExport`.
3. WorldPresentation iterates stages, calls `entity.destroy()`. The
   first call (for the player's current stage) gets
   `{ player, undo_index: 0 }`. Other calls plain.
4. `set_undo_tag` on the resulting `removed-entity` action with
   `bp100:handler = "deleteEntity"`, `bp100:data = entityExport`.
5. `content.deleteEntity` (observers fire for non-tagged stages).

Undo (Ctrl+Z):

1. Factorio replays the `removed-entity` → recreates LuaEntity at
   tagged stage's surface.
2. `script_raised_built` fires. Handler inspects undo stack top —
   sees matching tagged action → suppresses normal handling.
3. `on_undo_applied` fires. Mod handler:
   a. Destroys the just-recreated LuaEntity (let observers create
   world entities cleanly), or hands it to
   `replaceWorldOrPreviewEntity`.
   b. `deserializeEntity(payload)` → `content.addEntity`.
   c. WorldPresentation observers create world entities/previews
   across all stages.
   d. `set_redo_tag(item, action, "bp100:handler", "deleteEntity_redo")`
   with redo payload (`{ entityNumber }` to find on redo).

Redo (Ctrl+Y):

1. Factorio replays the `removed-entity` again → destroys LuaEntity.
2. `script_raised_destroy` → suppress.
3. `on_redo_applied` → handler `content.deleteEntity` of project
   entity by lookup. Writes `set_undo_tag` again.

### Preview replaced (op #2)

Forward:

1. Player builds at stage X over a project preview with
   `firstStage = Y > X`.
2. `on_built_entity` → `onEntityCreated` → `onEntityOverbuilt` →
   `onPreviewReplaced` → `trySetFirstStage(entity, X)`.
3. Tag the player's `built-entity` action: `firstStageChange`,
   `{ oldStage: Y }`. (Synchronously inside the event handler — no
   `DelayedEvent` needed.)

Undo:

1. Factorio destroys the player's entity.
2. `script_raised_destroy` → suppress (top-of-stack action has tag).
3. `on_undo_applied`:
   a. `findCompatibleEntityForUndo` by tag's position+name.
   b. `content.setEntityFirstStage(entity, oldStage)`.
   c. WorldPresentation observers: stage X becomes preview again,
   stage Y world entity intact.
   d. `set_redo_tag` with the inverse: `{ newStage: X }` keyed by a
   `firstStageRedo` handler.

Redo:

1. Factorio recreates the player's entity at stage X.
2. `on_built_entity` → suppress.
3. `on_redo_applied` → set `firstStage = X`. Tag back as undo.

### Send to stage (op #3)

Forward (per entity in selection):

1. Tool fires `onSendToStageUsed(entity, fromStage, toStage,
playerIndex)`.
2. Mod runs `userSendEntityToStage` → `trySetFirstStage`.
3. After project change: create+destroy disposable anchor with
   `{ player, undo_index: 0 if first entity else 1 }`. Tag the
   anchor's `removed-entity` with `sendToStage`,
   `{ oldStage: fromStage }`.

Undo:

1. Factorio replays anchor `removed-entity` (briefly recreates,
   then destroys the anchor entity). Mid-flow events filtered by
   anchor prototype name.
2. `on_undo_applied`: for each tagged action in the item, set
   `firstStage` back. Issue once per entity, all happen in same
   tick.

Redo: symmetric.

### Wire add/remove (op #9)

Forward:

1. Player drags a wire. Factorio fires `wire-added` action +
   wire build event.
2. Mod's `CustomInputs.Build` triggers `markPlayerAffectedWires`
   which queues an `onWiresPossiblyUpdated` to run after.
3. `onWiresPossiblyUpdated` → `saveWireConnections` mutates
   `content` wire connections.
4. Diff before/after the call. Tag the player's `wire-added`
   action with `{ added, removed }`.

Undo:

1. Factorio reverses the `wire-added` (removes the world wire).
   Mod has no normal handler for wire-\* events tied to project
   state mutation, so no suppression needed.
2. `on_undo_applied`: re-add `removed`, re-remove `added` from
   project content. WorldPresentation observers refresh wire
   visuals.

## Multi-entity grouping

Send/bring to stage and blueprint paste touch many entities at once.
Group them in one undo item:

- First entity's anchor uses `undo_index: 0`.
- Subsequent entities use `undo_index: 1`.
- One tag pair per entity, on its own action.

This replaces the current `_undoGroup` composite handler. Each
entity's tag is self-contained, so partial failures degrade
gracefully and Factorio's per-action removal
(`remove_undo_action`) works naturally.

`on_undo_applied` iterates `e.actions` regardless of grouping —
each action runs its handler independently.

`event-handlers/selection-tools.ts` already loops entities
individually; existing `accumulatedUndoActions` array becomes
unnecessary.

## Blueprint paste

Paste creates one undo item with one `built-entity` action per
entity (all `entity-ghost` — paste creates ghosts without
construction bots). All `on_built_entity` events fire on the same
tick, and the item is fully populated with every action by the
time the first event fires.

Consequence: `item.length` is constant across the tick and cannot
serve as the tagging index — it would overwrite the last action
repeatedly. Instead, build a position→action-index map once on
first paste-event of the tick:

```ts
let pasteIndex: Map<string, number> | nil
function tagPasteAction(playerStack, entity, payload) {
  const item = playerStack.get_undo_item(1)
  pasteIndex ??= buildIndex(item) // pos → action index
  const idx = pasteIndex.get(posKey(entity.position))
  if (idx) playerStack.set_undo_tag(1, idx, "bp100:handler", "...")
}
```

Clear `pasteIndex` in `on_tick` after the paste tick (or on next
`on_pre_build`).

Mod-side overrides during paste (e.g. updating an existing project
entity at the same position via `handlePasteValue`) append with
`undo_index: 1`, joining the same item. Their tags carry the
mod-specific inverse (e.g. old stage diff at `stage`).

On undo, Factorio reverses every `built-entity`; mid-flow
`script_raised_destroy` for each ghost is suppressed via undo-stack
inspection; `on_undo_applied` runs all tagged handlers together.

Per-entity payloads:

- New entity at empty position: `{ kind: "new", entityNumber }`.
- Update of existing entity: `{ kind: "update", oldFirstValueDiff?,
oldStageDiffAtStage?, oldUnstaged?, oldDirection? }`.
- Settings-remnant overwrite (if any remain during migration):
  full `EntityExport` of the prior remnant.

## Eliminating settings remnants

Settings remnants exist only because the ghost-based undo cannot
restore stage diffs or cross-stage wires after a first-stage delete.
With the full `EntityExport` stored in the deletion tag,
restoration becomes deserialize + `content.addEntity` (mirroring
`deserializeAllEntities`).

Sites to remove (~13 files;
`grep -rn "settingsRemnant\|SettingsRemnant" src/`):

- `entity/ProjectEntity.ts`, `entity/ProjectContent.ts` — flag and
  branches.
- `project/WorldPresentation.ts`, `project/EntityHighlights.ts` —
  remnant rendering, revival on rebuild.
- `project/actions/ProjectActions.ts`, `event-handlers/`,
  `ui/opened-entity.tsx` — remnant-aware paths.
- `import-export/entity.ts` — the `isSettingsRemnant` filter in
  `serializeAllEntities` becomes unnecessary.
- Tests under `entity/`, `project/`, `integration/`.

## Migration

1. Tag-based system added alongside ghost system. New undo registry
   parallel to old.
2. New ops (#6–#16) use tags from day one.
3. Existing handlers (#1–#5) migrate one at a time, each verified.
4. Ghost system removed: `Prototypes.UndoReference`, `UndoHandler`
   ghost machinery, `DelayedEvent`, per-player circular buffer
   (`playerData.undoEntries`, `nextUndoEntryIndex`),
   `_undoGroup` handler, `accumulatedUndoActions` state.
5. Settings remnants removed across all sites.

Storage migration at step 4 to drop `playerData.undoEntries` and
`nextUndoEntryIndex`. See `docs/Migrations.md`.

## Decisions

- **`EntityExport` reused for full-restore payloads.** Avoids a
  parallel serialization format; already validated by import/export
  and project save.
- **Per-entity tags for grouped actions, not one composite tag.**
  Lets Factorio's per-action operations work naturally and contains
  partial failures.
- **Disposable anchors for pure-data ops, natural anchors for
  player-driven ops where mid-flow suppression is feasible.** Anchors
  are simpler but cost an entity create+destroy per op; natural
  anchors avoid the churn but require the suppression mechanism. The
  matrix picks the cheaper option per case.
- **Undo-stack inspection for mid-flow suppression** (vs. e.g. a
  per-tick "expected positions" set populated up-front). Inspection
  is reactive and doesn't require predicting which Ctrl+Z the player
  will press.

## Open questions

- **Verify undo stack timing during applied undo.** Design assumes
  `stack.get_undo_item(1)` still contains the action with our tag
  while mid-flow `script_raised_*` events fire, and that
  `on_undo_applied` is the point at which the item becomes
  unavailable. If actions are popped or moved to redo earlier,
  mid-flow detection must read the redo stack instead.
- **Position-matching during blueprint paste tick.** A
  position→action-index map is built on first event; need to confirm
  blueprint paste events all fire on the same tick (verified) and
  that no other paste begins before the map is cleared.
- **Direction-only redo for force-delete.** Forward op tag carries
  `EntityExport`; redo tag for #1 only needs an `entityNumber` to
  re-find the project entity. If the project entity is reorganised
  between undo and redo, the entityNumber lookup may fail. Fallback
  policy: re-do via position+name match instead.
- **Wire-event tagging API.** Confirm that `wire-added`/
  `wire-removed` actions support tags and that they fire in the
  same tick as the mod's `onWiresPossiblyUpdated`.
- **Suppression false-positives.** If two sibling mods both tag
  actions on the same entity, `bp100:` namespace separates payloads,
  but the suppression check only needs to see _any_ `bp100:` tag at
  the matching position. Confirm no cross-mod interference scenario
  where a stale `bp100:` tag on a prior undo item is mistaken for
  the active one.
