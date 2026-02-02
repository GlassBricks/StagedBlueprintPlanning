# Undo System Revision

## Current System

### Undo References (Ghost Entity Hack)

The mod implements undo by creating invisible ghost entities (`bp100_undo-reference`) that get mined into the player's inventory. When the player presses Ctrl+Z, Factorio "builds" the ghost, which triggers `on_built_entity`. The mod intercepts this, extracts an index from the entity's position (X coordinate = undo entry index), looks up the corresponding undo handler + data from a per-player circular buffer (100 entries), and executes the reversal.

Key files: `src/project/undo.ts`, `src/project/ProjectActions.ts:67-109`

### Limitations

- **Pollutes Factorio's undo stack**: Each undo reference creates an entry in Factorio's native stack. After the ghost is built (undo triggered), the native stack contains a "built entity" entry that, if undone again, would try to mine the already-destroyed ghost -- leading to undefined behavior or silently doing nothing.
- **No redo support**: Once an undo reference is consumed, there's no mechanism to re-push it for redo.
- **Limited action coverage**: Only 5 action types support undo: force delete, manual stage move (preview replaced), send to stage, bring to stage, last stage change. Many actions that modify project state (settings changes, wire edits, blueprint pastes, stage diff changes) have no undo.
- **Circular buffer can silently lose entries**: If a player performs >100 undoable actions without undoing, old entries are overwritten.
- **Delayed registration hack**: Uses `DelayedEvent` (creates a rendering object, registers for destruction, fires next tick) to defer undo registration for entity creation, because the ghost can't be created during certain event handlers.

### Settings Remnants

Settings remnants exist as a workaround for undo's inability to restore stage diffs and wire connections. When an entity with stage diffs or cross-stage wire connections is deleted at its first stage, instead of being fully removed, it becomes a "settings remnant" -- a non-interactable preview entity with a white outline. Building over a settings remnant revives it, restoring all staged data.

This is user-visible complexity that exists only because undo can't restore rich entity state. The force delete tool already proves full restoration is possible: `undoDeleteEntity` simply calls `readdDeletedEntity()` which re-adds the entire `ProjectEntity` object (with all stage diffs, wire connections, etc.) back to `ProjectContent`.

Relevant files: 13 files reference settings remnants across entity, project, UI, and test code.

## Factorio 2.0 Undo/Redo API

The 2.0 API provides:

### Stack Access & Manipulation (`LuaPlayer.undo_redo_stack`)

- `get_undo_item(index)` / `get_redo_item(index)` -- retrieve items (1-based, 1 = most recent)
- `get_undo_item_count()` / `get_redo_item_count()`
- `remove_undo_item(index)` / `remove_redo_item(index)` -- remove entire items
- `remove_undo_action(item_index, action_index)` -- remove individual actions within an item

### Tag System

Each action within an undo item can have arbitrary `Tags` (`Record<string, AnyBasic>`) attached:

- `get_undo_tags(item, action)` / `set_undo_tag(item, action, key, value)`
- `get_redo_tags(item, action)` / `set_redo_tag(item, action, key, value)`
- `remove_undo_tag(item, action, key)` / `remove_redo_tag(item, action, key)`

### Events

- `on_undo_applied` -- fires when player presses undo, provides `actions: UndoRedoAction[]` with tags
- `on_redo_applied` -- fires when player presses redo, same structure

### Action Types

Each `UndoRedoAction` has a `type` discriminator: `built-entity`, `removed-entity`, `built-tile`, `removed-tile`, `upgraded-entity`, `upgraded-modules`, `wire-added`, `wire-removed`, `rotated-entity`, `copy-entity-settings`. Each variant carries relevant data (target entity as `BlueprintEntity`, surface index, etc.).

### Entity/Surface Methods with `undo_index`

`create_entity`, `destroy`, `order_deconstruction`, `order_upgrade`, `set_tiles`, `cancel_deconstruct_area` all accept optional `player` and `undo_index` parameters. `undo_index: 0` creates a new undo item, `1` appends to the most recent item, `nil` uses automatic placement.

### What the API Cannot Do

- **Cannot create arbitrary undo entries** -- only real entity/tile operations generate entries
- **Cannot modify action data** -- only tags can be added/removed; the action itself is immutable

## Proposed Approach

### Core Idea: Store All Undo Data in Native Tags

Instead of creating fake ghost entities and maintaining a separate undo data array, store all mod undo/redo data directly in Factorio's native undo tag system. Tag the real entity operations the mod already performs (creating/destroying world entities) with serializable undo payloads. When Factorio fires `on_undo_applied` or `on_redo_applied`, read the tags to determine what mod-level reversal is needed.

Tags support `AnyBasic` (`string | boolean | number | table`) with arbitrary nesting depth and no documented size limit. The existing `EntityExport` format already produces data compatible with this (positions, names, stage diffs converted to plain tables). This means all undo data can live in the tags themselves -- no separate per-player storage array, no synchronization between mod state and Factorio's stack.

### Mechanism

1. **When the mod performs an undoable action** that involves a world entity operation (e.g., `create_entity`, `destroy`), pass `player` and `undo_index` parameters to register it on Factorio's undo stack, then tag the resulting action with the full serialized undo payload.

2. **When there's no associated world entity operation** (e.g., a pure project-data change like last stage change), create a minimal "anchor" entity operation -- destroy and immediately recreate a small hidden entity, or pass `player`/`undo_index` to one of the WorldPresentation create/destroy calls that the mod already performs as a side effect. Tag this anchor.

3. **On `on_undo_applied`**: Scan the `actions` array for any with mod tags. The tags contain the complete undo payload (handler name + serialized data). Execute the reversal directly from tag data. Tag the corresponding redo entry with the forward action.

4. **On `on_redo_applied`**: Same pattern -- scan for mod tags, execute redo logic from tag data.

### Detailed Design

#### Tagging Protocol

Use the existing mod ID `bp100` as namespace:

```typescript
// Tags stored directly on the undo action
stack.set_undo_tag(1, actionIndex, "bp100:handler", handlerName)
stack.set_undo_tag(1, actionIndex, "bp100:data", serializedData)
```

The `data` field contains a fully self-contained, serializable payload -- no references to runtime objects. Example payloads:

- **Stage move**: `{ position: [x, y], name: "assembling-machine-2", oldStage: 3, newStage: 5 }`
- **Delete entity**: Full `EntityExport` (position, firstValue, stageDiffs, wires as entity-number references, unstaged values)
- **Last stage change**: `{ position: [x, y], name: "...", oldLastStage: 7 }`

#### Making World Operations Undoable

Currently all `destroy()` and `create_entity()` calls omit `player`/`undo_index`. To register on the native undo stack, pass these parameters:

```typescript
// Current: entity.destroy()
// New: entity.destroy({ player: playerIndex, undo_index: 0 })

// Current: surface.create_entity({ name, position, ... })
// New: surface.create_entity({ name, position, ..., player: playerIndex, undo_index: 0 })
```

`undo_index: 0` creates a new undo item; `undo_index: 1` appends to the most recent item.

Passing `player` is required -- without it, destroy/create operations don't appear on the undo stack at all.

#### Anchor Operations per Action Type

| Mod Action                           | World Operation                                           | Anchor Strategy                                                                       |
| ------------------------------------ | --------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Force delete entity                  | `destroy()` in `forceDeleteEntity`                        | Pass `{ player, undo_index: 0 }` to the destroy call, tag the `removed-entity` action |
| Manual stage move (preview replaced) | Player-created entity (`on_built_entity`)                 | Tag the `built-entity` action in the existing undo item                               |
| Send/bring to stage (per entity)     | WorldPresentation creates/destroys entities across stages | Pass `player`/`undo_index` to one of the WorldPresentation operations, tag it         |
| Last stage change                    | WorldPresentation may destroy or create entities          | Pass `player`/`undo_index` to that destroy, or use anchor if no entity ops occur      |

For actions with no natural world entity operation:

- **Preferred: Piggyback on WorldPresentation operations.** Stage moves trigger `updateWorldEntitiesInRange()` which creates/destroys real entities. Pass `player`/`undo_index` to one of these calls.
- **Fallback: Disposable anchor entity.** Create a tiny hidden entity with `{ player, undo_index: 0 }`, immediately destroy it, tag the resulting action.

#### Per-Entity Undo for Multi-Entity Selection Tools

Send/bring to stage currently groups all entities into one `registerGroupUndoAction`. With the native tag system, this can be achieved by creating one tag per entity, grouped in a single undo item.

Use `undo_index: 0` for the first entity's world operation, then `undo_index: 1` for subsequent entities. Each entity's world operation gets its own tag with that entity's undo data. On undo, iterate through all actions in the item and reverse each tagged one.

This approach preserves the current behavior (one undo = one selection) while being simpler than the current `_undoGroup` mechanism. Each entity's tag is self-contained, so partial failures are handled naturally.

Since each entity in send/bring operations is already processed independently (`event-handlers.ts:1081-1084` loops through `e.entities` individually), and each entity's world updates are independent (no shared state during `setEntityFirstStage` → `notifyEntityChanged` → `updateWorldEntitiesInRange`), per-entity tags are a natural fit.

#### Serialized Entity Data in Tags (Replacing Object References)

The current undo system stores direct `ProjectEntity` references (e.g., `undoDeleteEntity` stores `{ actions, entity }`). This has fragility issues: the reference could become stale if the project is restructured, and it can't survive tag serialization.

Instead, use the existing `EntityExport` format from `src/import-export/entity.ts` to serialize entity data into tags:

```typescript
// Export: ProjectEntity → serializable data for tag storage
const exportData = exportEntity(entity, entityNumber)
// Also export wire connections if needed (requires entity number mapping)

// On undo: deserialize and re-add
const restoredEntity = importEntity(exportData)
content.addEntity(restoredEntity)
// Restore wire connections in a second pass
```

The `EntityExport` format handles:

- `firstValue` (name, quality, items)
- `position`, `direction`
- `firstStage`, `lastStage`
- `stageDiffs` (converted via `toExportStageDiffs()` -- replaces `NilPlaceholder` sentinels with `{ __nil: true }`)
- `unstagedValue` per stage

Wire connections require entity-number references to other entities. For single-entity undo (force delete), wires to other existing entities can be stored as position+name references and resolved on restore. For multi-entity undo, assign temporary entity numbers within the tag data.

#### Handling `on_undo_applied` / `on_redo_applied`

```typescript
Events.on_undo_applied((e) => {
  for (const action of e.actions) {
    const handler = action.tags?.["bp100:handler"] as string | nil
    if (!handler) continue
    const data = action.tags?.["bp100:data"]
    executeUndoHandler(e.player_index, handler, data)
  }
})
```

The undo handler:

1. Deserializes the tag data
2. Performs the project-level reversal (re-add entity, move stage back, etc.)
3. Refreshes world presentation to match new project state

**Important subtlety**: Factorio's undo will have already reversed the world entity operation. The mod's handler must account for this -- it shouldn't re-create an entity Factorio already re-created. It should only update project state and refresh world presentation.

#### Redo Support

When handling `on_undo_applied`, tag the corresponding redo entry with the forward action data:

```typescript
// After executing undo, tag the redo entry
const redoStack = player.undo_redo_stack
redoStack.set_redo_tag(1, actionIndex, "bp100:handler", redoHandlerName)
redoStack.set_redo_tag(1, actionIndex, "bp100:data", redoData)
```

When `on_redo_applied` fires, read those tags and re-apply. This gives full undo/redo for free.

#### Blueprint Paste Interaction

When a player pastes a blueprint, Factorio creates all entities and groups them in one undo item. The mod then processes each entity. During this processing, the mod may override what the blueprint placed (e.g., entity already exists at that position with different stage diffs, or the entity gets updated/replaced).

These mod overrides involve world entity operations (via WorldPresentation). To keep everything in one undo item:

1. Track that we're inside a blueprint paste context
2. Pass `undo_index: 1` (append to most recent) for any world operations the mod performs during paste processing -- this groups them with Factorio's blueprint undo item
3. Tag the mod's operations within that item

On undo, Factorio reverses the blueprint paste (removes all placed entities). The mod's tagged actions within the same item are also undone, restoring any project state the mod changed.

### Eliminating Settings Remnants

With undo data stored as serialized `EntityExport` in tags, full entity state restoration is possible for any deletion:

- **Current flow**: Delete entity with stage diffs → create settings remnant → user builds over it to restore
- **New flow**: Delete entity → entity fully deleted, full `EntityExport` stored in undo tag → Ctrl+Z fires `on_undo_applied` → mod deserializes export, calls `importEntity()` + `content.addEntity()`

### Expanding Undo Coverage

- **Entity settings changes** (copy-paste, GUI edits): Store old values in tag. `copy-entity-settings` action type provides a natural anchor.
- **Wire connection changes**: `wire-added`/`wire-removed` action types are direct anchors.
- **Blueprint paste operations**: Tag individual `built-entity` actions within the paste's undo item (per-action tags supported).
- **Stage diff changes**: Piggyback on the entity refresh operation.
- **Tile operations**: `built-tile`/`removed-tile` actions provide anchors.

### Migration Path

1. Implement tag-based undo alongside the existing ghost system
2. For new actions, use the tag-based approach exclusively
3. Migrate existing undo handlers one at a time, verifying each
4. Remove the ghost entity system, `UndoReference` prototype, `DelayedEvent` usage, and circular buffer storage
5. Remove settings remnants (cleanup across 13 files)

## Open Questions

- **Timing of `on_undo_applied`**: Does the event fire before or after Factorio has completed the undo? If after, world entities are already in their restored state when our handler runs. If before, we need to defer. Needs testing.

- **Wire connection restoration for single-entity undo**: When restoring a deleted entity, its wire connections reference other entities by position+name. If those other entities were also deleted (or moved), the wires can't be restored. Multi-entity undo (e.g., blueprint paste undo) handles this via entity numbers within the tag data, but single-entity force-delete undo may lose cross-entity wires. We need to implement a mechanism to track and restore these connections.

- **Blueprint paste override tracking**: The mod processes blueprint entities and may override what the blueprint placed. Need to verify that passing `undo_index: 1` to the mod's world operations correctly appends them to the blueprint's undo item (which was created by Factorio before the mod's processing runs). Also need to handle the case where the mod destroys an entity the blueprint just created -- Factorio's undo item contains a `built-entity` action for it, but the mod destroyed it. On undo, Factorio would try to remove an entity that no longer exists.

- **`undo_index` grouping reliability**: When the mod performs multiple world operations across different surfaces (stages) as part of one logical action, `undo_index: 1` should group them. Need to verify this works across surfaces. Or, design a system that only tags undo items within the same surface, even for multi-surface operations.
