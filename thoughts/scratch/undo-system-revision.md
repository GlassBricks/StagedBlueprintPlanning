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

### Event Ordering Constraint

Factorio fires entity lifecycle events (`on_built_entity`, `script_raised_destroy`, etc.) **before** `on_undo_applied`/`on_redo_applied`. The mod's normal event handlers process these events immediately, updating project state and world presentation. By the time `on_undo_applied` fires, the normal handlers have already run.

This means the mod cannot simply tag its real entity operations and handle everything in `on_undo_applied` -- the normal handlers would process undo-triggered events as regular player actions, corrupting project state. Two strategies are needed depending on who initiated the action.

### Two Strategies

#### Strategy 1: Anchor Entities (Mod-Initiated Actions)

For actions triggered by mod tools (force delete, send/bring to stage, last stage change, etc.), do NOT register real entity operations on Factorio's undo stack. Instead, create a disposable hidden anchor entity with `player`/`undo_index` and tag it with the undo payload.

During undo, Factorio only recreates/destroys the anchor -- not the real entities. Normal event handlers ignore anchors by entity name. `on_undo_applied` reads tags and handles all project state changes + world presentation refresh.

The mod already fully reconstructs world entities via `WorldPresentation.updateWorldEntitiesInRange()` after any project state change, so not getting "free" world entity reversal from Factorio's undo is not a cost.

#### Strategy 2: Tagging Natural Actions (User-Initiated Events)

For direct player interactions (mining, rotating, pasting settings, wiring), the player's action creates a natural Factorio undo entry. The mod tags that entry with additional data during its event handler.

On undo, two things happen in order:

1. Normal event handlers fire first, partially processing the reversal (e.g., creating a bare entity for an undone mine)
2. `on_undo_applied` fires -- the undo handler fixes up project state using tag data (e.g., enriching the bare entity with stage diffs and wires)

For many action types (`copy-entity-settings`, `wire-added`, `wire-removed`, `rotated-entity`), the corresponding entity event does NOT fire during undo -- only `on_undo_applied` fires. For these, there is no interference and the undo handler has exclusive control.

### Detailed Design

#### Tagging Protocol

Use a single tag key `bp100:undo` containing both handler name and data:

```typescript
stack.set_undo_tag(1, actionIndex, "bp100:undo", {
  handler: "firstStageChange",
  data: { oldStage: 3, newStage: 5 },
})
```

The tag value is fully self-contained and serializable -- no references to runtime objects. Example payloads:

- **Stage move**: `{ handler: "firstStageChange", data: { oldStage: 3, newStage: 5 } }` - position, name, etc. can be found from the action itself.
- **Delete entity**: `{ handler: "deleteEntity", data: <EntityExport> }` - full entity data including stageDiffs, wires, unstaged values.
- **Last stage change**: `{ handler: "lastStageChange", data: { oldLastStage: 7 } }`

#### Anchor Entities for Mod-Initiated Actions

The existing `bp100_undo-reference` prototype (`simple-entity-with-owner`, no collision, hidden, empty sprite) already serves as an anchor entity. Reuse this prototype: create it with `{ player, undo_index: 0 }`, immediately destroy it with `{ player, undo_index: 1 }` (grouping both into one undo item), then tag the resulting action. Normal event handlers already filter this entity by name (routed to `onUndoReferenceBuilt` in `build-events.ts:155`).

| Mod Action                                              | Anchor Strategy                                   |
| ------------------------------------------------------- | ------------------------------------------------- |
| Force delete entity                                     | Anchor + tag with full `EntityExport`             |
| Send/bring to stage (per entity)                        | Anchor + tag with entity position, old/new stage  |
| Last stage change                                       | Anchor + tag with entity position, old last stage |
| Custom inputs (move to stage, force delete)             | Anchor + tag                                      |
| Selection tools (stage delete, exclude from blueprints) | Anchor + tag                                      |

#### Tagging User-Initiated Events

For direct player interactions, tag the natural Factorio undo action created by the player's operation. The undo handler fixes up project state after normal handlers have run.

| User Event                      | Undo Action Type              | Handler Conflict? | Undo Strategy                                                                                                                                                                                                                                  |
| ------------------------------- | ----------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build new entity                | `built-entity`                | No                | Self-correcting: undo fires `script_raised_destroy` → `onEntityDeleted` correctly deletes. No tags needed                                                                                                                                      |
| Mine entity at non-first stage  | `removed-entity`              | No                | Self-correcting: entity stays in project, world entity rebuilt. Undo recreates world entity → `onEntityOverbuilt` → `refreshEntity`                                                                                                            |
| Mine entity at first stage      | `removed-entity`              | Yes               | Tag with `EntityExport`. On undo, `on_built_entity` → normal handler creates bare entity → undo handler enriches with stage diffs, wires, last stage. On redo, `script_raised_destroy` → normal delete handler suffices                        |
| Build over preview (stage move) | `built-entity`                | Yes               | Tag with entity data + old stage. On undo, `script_raised_destroy` → normal handler deletes entity → undo handler re-imports with old firstStage. On redo, `on_built_entity` → `onEntityOverbuilt` → `onPreviewReplaced` re-applies stage move |
| Paste settings                  | `copy-entity-settings`        | No                | `on_entity_settings_pasted` does NOT fire during undo. Undo handler re-reads entity value from world (Factorio already reverted it), or restores from tag data                                                                                 |
| Rotate entity                   | `rotated-entity`              | No                | Whether `on_player_rotated_entity` fires during undo is uncertain, but irrelevant -- rotation handler is idempotent (re-reads direction from world). Undo handler can also re-read from world. No conflict either way                          |
| Flip entity                     | `rotated-entity`?             | No                | Same approach as rotation                                                                                                                                                                                                                      |
| Wire connect/disconnect         | `wire-added` / `wire-removed` | No                | Wire detection uses custom inputs, not Factorio events -- no handler fires during undo. Undo handler re-reads wire connections from world                                                                                                      |
| Mark for upgrade                | `upgraded-entity`             | Partial           | Mod immediately applies upgrade and cancels marker. Factorio's undo only reverses the marker, not the mod's entity change. Tag with pre-upgrade name/quality; undo handler reverts upgrade in project state + rebuilds world entity            |
| Simple tile build/mine          | `built-tile` / `removed-tile` | No                | Self-correcting: build handler adds tile, mine handler removes. Symmetric                                                                                                                                                                      |
| Blueprint paste                 | Multiple `built-entity`       | Yes               | Complex -- see Blueprint Paste Interaction section                                                                                                                                                                                             |
| GUI settings edit               | None                          | N/A               | No Factorio undo entry created. Needs anchor                                                                                                                                                                                                   |
| Fast transfer                   | None                          | N/A               | No documented undo action type. Needs anchor if inventory matters to project state                                                                                                                                                             |

#### Per-Entity Undo for Multi-Entity Selection Tools

Send/bring to stage currently groups all entities into one `registerGroupUndoAction`. With the native tag system, this can be achieved by creating one anchor per entity, grouped in a single undo item.

Use `undo_index: 0` for the first entity's anchor, then `undo_index: 1` for subsequent entities. Each anchor gets its own tag with that entity's undo data. On undo, iterate through all actions in the item and reverse each tagged one.

This approach preserves the current behavior (one undo = one selection) while being simpler than the current `_undoGroup` mechanism. Each entity's tag is self-contained, so partial failures are handled naturally.

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
    const tag = action.tags?.["bp100:undo"] as { handler: string; data: unknown } | nil
    if (!tag) continue
    executeUndoHandler(e.player_index, tag.handler, tag.data)
  }
})
```

The undo handler behavior depends on the strategy:

**Anchor-based actions** (mod-initiated): Normal handlers ignored the anchor entity, so the undo handler has full responsibility. It deserializes tag data, performs the project-level reversal, and refreshes world presentation.

**Tagged natural actions** (user-initiated): Normal handlers already partially processed the undo (e.g., created a bare entity or deleted one). The undo handler fixes up the result -- enriching a bare entity with stage diffs/wires, or re-importing a deleted entity with its full data. For action types where no entity event fires during undo (`copy-entity-settings`, `wire-*`, `rotated-entity`), the undo handler can re-read state directly from the world entity (Factorio has already reverted it).

#### Redo Support

When handling `on_undo_applied`, tag the corresponding redo entry with the forward action data:

```typescript
// After executing undo, tag the redo entry
const redoStack = player.undo_redo_stack
redoStack.set_redo_tag(1, actionIndex, "bp100:undo", { handler: redoHandlerName, data: redoData })
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

### Expanded Undo Coverage

The two-strategy approach covers all project-modifying events:

**Self-correcting** (no tags needed): New entity build, mine at non-first stage, simple tile build/mine. Normal handlers handle both forward and reverse directions correctly.

**Tag natural action**: Mine at first stage, build over preview, paste settings, rotation, flip, wire changes, upgrade. Tag the Factorio undo entry with mod data; undo handler fixes up or re-reads from world.

**Anchor required**: Force delete, send/bring to stage, last stage change, GUI settings edits, selection tool operations. No natural Factorio undo entry, or mod action is decoupled from the player's world interaction.

**Blueprint paste**: Combination -- tag individual `built-entity` actions within the paste's undo item, and use anchors for any mod-initiated side effects during paste processing.

### Migration Path

**Reusable from existing system:**
- `bp100_undo-reference` prototype -- reuse as anchor entity (already hidden, no collision, filtered by name in event handlers)
- Handler registry pattern (`UndoHandler` factory with named handlers) -- adapt to tag-based dispatch. Handler names become tag `handler` values
- `onUndoReferenceBuilt` detection in `build-events.ts:155` -- update to ignore anchor undo/redo events (Factorio handleexperimentss these natively now)

**Existing undo handlers to migrate:**

| Handler | Current Data | New Approach |
| --- | --- | --- |
| `"delete entity"` | `{ actions, entity }` (live ProjectEntity reference) | Anchor + `EntityExport` in tag. Calls `importEntity` + `content.addEntity` on undo |
| `"stage move"` | `{ actions, entity, oldStage }` (live reference) | Tag natural `built-entity` action with old stage + entity data |
| `"send to stage"` | `{ actions, entity, oldStage }` (live reference) | Anchor + serialized position/name/oldStage |
| `"bring to stage"` | `{ actions, entity, oldStage }` (live reference) | Anchor + serialized position/name/oldStage |
| `"last stage change"` | `{ actions, entity, oldLastStage }` (live reference) | Anchor + serialized position/name/oldLastStage |
| `"_undoGroup"` | `UndoAction[]` | Replaced by `undo_index: 1` grouping -- multiple anchors in one undo item |

**Migration steps:**

Phase 1: Replace existing undo system with tag-based system + redo support
1. Add `on_undo_applied`/`on_redo_applied` handlers with tag-based dispatch
2. Implement anchor entity registration (create+destroy `bp100_undo-reference` with `player`/`undo_index`, tag with `bp100:undo`)
3. Migrate existing handlers one at a time: replace live `ProjectEntity` references with serialized data, switch from ghost-mine registration to anchor+tag registration. For each handler, also implement the corresponding redo handler
4. Remove ghost-mine mechanism: circular buffer (`undoEntries`, `nextUndoEntryIndex`), `DelayedEvent` usage, `mine_entity` calls, `_undoGroup`

Phase 2: Remove settings remnants (cleanup across 13 files)

Phase 3: Expand undo coverage to user-initiated events (settings paste, rotation, wires, upgrade, mine at first stage, build over preview)

## Open Questions

### Resolved

- **`undo_index` grouping reliability**: Confirmed. `undo_index: 0` creates a new item, `undo_index: 1` appends. Grouping works across different surfaces. Mixed create+destroy operations group correctly into a single item.

- **Tag system fundamentals**: Tags round-trip correctly for strings, nested tables, and large payloads (100 entries with nested data). Each action within an undo item can have independent tags. Tags work on both `built-entity` and `removed-entity` actions.

- **`destroy()` with undo_index**: `entity.destroy({ player, undo_index: 0 })` registers a `removed-entity` action on the undo stack. Tags can be set on it afterward.

- **Timing of `on_undo_applied`**: The event fires **after** Factorio has completed the undo for _all_ entities. The full sequence for undoing a build is:
  1. `script_raised_destroy` (entity removed from world)
  2. `on_undo_applied` (entity already gone; `find_entity` returns nil)

  For redo, the sequence is:
  1. `on_built_entity` (entity re-placed on world)
  2. `on_redo_applied` (entity exists; `find_entity` returns it)

  This means the mod's `on_undo_applied` handler can safely assume the world is already in the post-undo state. No deferral needed.

- **Tags available directly on actions in `on_undo_applied`**: The `UndoRedoAction` objects in `e.actions` carry a `.tags` property directly (a `Tags` table). No need to read from the redo stack — tags set via `set_undo_tag()` appear on the action in the event. However, tags do **not** automatically transfer to the redo stack — `get_redo_tags()` returns nil after undo. The mod must explicitly `set_redo_tag()` during `on_undo_applied` if redo support is needed.

- **Create-then-destroy undo behavior**: When undoing an item with both `built-entity` and `removed-entity` for the same position, Factorio processes both actions: it first recreates the entity (`on_built_entity` fires), then immediately destroys it (`script_raised_destroy` fires). The net result is no entity on the surface. Redo does the same — creates then destroys, net result is no entity. This is important: it means the mod sees build/destroy events during undo/redo of create-then-destroy items. The mod's undo handler must be aware of this.

- **Grouped undo works end-to-end**: `undo_index: 1` correctly groups multiple entities into one undo item. Ctrl+Z removes all at once (both `script_raised_destroy` fire on same tick), and Ctrl+Y restores all at once (`on_built_entity` fires for each on same tick). Tags on each action are preserved independently.

- **Blueprint paste undo interaction**: Fully confirmed:
  - Pasting a blueprint creates one undo item with one `built-entity` action per entity (all as `entity-ghost` type since the paste creates ghosts without construction bots).
  - `on_undo_applied` fires with all `built-entity` actions. Entities already removed from surface by the time the event fires.
  - **Tagging during `on_built_entity`**: Works, but with a caveat — all 3 `on_built_entity` events fire on the same tick, and the undo item already has all 3 actions pre-created by the time the first `on_built_entity` fires. The tagging code used `item.length` (always 3) as the action index, so all 3 tags overwrote the same action (action 3). **Fix needed**: match the built entity to the correct action index by position, or tag actions by iterating the undo item to find the matching one.
  - **Appending via `undo_index: 1`**: Works. The mod-created stone-furnace was added as action 4 in the same undo item. On Ctrl+Z, all 4 actions undone together. Tags on the appended action preserved. The real entity was handled via deconstruction (not outright deletion) since the test was in normal mode, not editor mode — so `find_entity` returned true because the entity was marked for deconstruction rather than destroyed. Redo cancelled the deconstruction.

### Unresolved

- **Wire connection restoration for single-entity undo**: When restoring a deleted entity, its wire connections reference other entities by position+name. If those other entities were also deleted (or moved), the wires can't be restored. Multi-entity undo (e.g., blueprint paste undo) handles this via entity numbers within the tag data, but single-entity force-delete undo may lose cross-entity wires. Design decision needed.

- **Matching undo actions to entities during blueprint paste**: The undo item is pre-populated with all actions before the first `on_built_entity` fires. Need to match built entities to their corresponding undo action index (e.g., by comparing `action.target.position` to the built entity's position).
