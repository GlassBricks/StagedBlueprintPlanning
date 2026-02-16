# Phase 1: Migrate Existing Undo System to Tag-Based + Redo Support

## Overview

Replace the ghost-entity-mine undo mechanism with Factorio 2.0's native undo/redo tag system. All existing undo handlers (force delete, stage move, send/bring to stage, last stage change) are migrated to use anchor entities with tags. Redo support is added for all migrated handlers.

## Current State Analysis

The existing system uses a hack: creates ghost entities at encoded positions, mines them into the player's inventory, then intercepts `on_built_entity` when the player presses Ctrl+Z. Undo data lives in a per-player circular buffer (`undoEntries[1..100]`) in `storage.players`. Five handlers exist: `"delete entity"`, `"stage move"`, `"send to stage"`, `"bring to stage"`, `"last stage change"`, plus the meta-handler `"_undoGroup"`.

All handlers store live `ProjectEntity` references and `ProjectActions` references in undo data. This is fragile and cannot be serialized to tags.

### Key Discoveries

- `src/project/actions/undo.ts` — core undo mechanism (ghost creation, circular buffer, handler dispatch)
- `src/project/actions/undo-records.ts` — five undo handler definitions
- `src/project/event-handlers/build-events.ts:155-157` — intercepts undo reference being built
- `src/project/event-handlers/selection-tools.ts` — six call sites using `pushGroupUndoAction`
- `src/project/actions/ProjectActions.ts:852-860` — two call sites using `pushUndoAction`
- `src/project/event-handlers/build-events.ts:199` — one call site using `pushUndoActionLater`
- `src/lib/delayed-event.ts` — `DelayedEvent` used only for deferred undo registration
- `src/import-export/entity.ts` — `exportEntity`/`importEntity` for serializing entity data to tags
- Factorio 2.0 provides `on_undo_applied`, `on_redo_applied` events with `.tags` on each action
- `LuaUndoRedoStack` provides `set_undo_tag`/`set_redo_tag` for storing data
- `getProjectById(id)` already exists in `src/project/ProjectList.ts:22`

## Desired End State

- `on_undo_applied` / `on_redo_applied` handlers dispatch by reading `bp100:undo` tags
- Anchor entities created via `create_entity` + `destroy` with `player`/`undo_index` params
- All undo data is self-contained serializable data in tags (no live object references)
- Redo works for all five existing handler types
- Ghost-mine mechanism fully removed (circular buffer, `DelayedEvent`, `mine_entity` calls)
- `_simulateUndo` test helper replaced with one that fires simulated `on_undo_applied` events
- Per-player `undoEntries`/`nextUndoEntryIndex` removed from storage with migration

### Verification

- All existing undo tests pass (adapted to new simulation method)
- New redo tests pass for each handler
- `pnpm run test` passes
- `pnpm run lint` and `pnpm run format:fix` pass

## What We're NOT Doing

- Settings remnant removal (Phase 2)
- Expanding undo coverage to user-initiated events like paste/rotate/wire/mine (Phase 3)
- Tagging natural Factorio undo entries (Phase 3)
- Blueprint paste undo interaction (Phase 3)

## Implementation Approach

All existing undo handlers are mod-initiated (selection tools, custom inputs, force delete). They use **Strategy 1: Anchor Entities** — create a disposable hidden entity with `player`/`undo_index`, immediately destroy it, then tag the resulting undo action with serialized data.

The key change: instead of storing live `ProjectEntity` + `ProjectActions` references, each handler stores only serializable data (positions, stage numbers, exported entity data). On undo/redo, the handler finds the entity by position/name in the current project and performs the reversal.

For redo: when `on_undo_applied` fires and we execute the undo, we tag the corresponding redo entry with the forward action data. When `on_redo_applied` fires, we read those tags and re-apply.

---

## Phase 1a: New Undo/Redo API

### Overview

Build a clean, type-safe public API for tag-based undo/redo handlers, alongside the existing system. The API mirrors the ergonomics of the old `UndoHandler<T>` factory but uses Factorio's native tag system instead of ghost mining.

### Changes Required

#### 1. Public API

**File**: `src/project/actions/undo.ts` (will eventually replace current contents; for now add alongside)

The core abstraction: `UndoHandler<T>` where `T` is the serializable tag data type. Each handler defines an undo function (receives data, returns redo data) and a redo function (receives data, returns undo data). The return value enables automatic redo/undo tag chaining.

```typescript
type UndoFn<T extends AnyBasic> = (this: void, player: LuaPlayer, data: T) => T | nil
type RedoFn<T extends AnyBasic> = (this: void, player: LuaPlayer, data: T) => T | nil

/** @noSelf */
interface UndoHandler<T> {
  createAction(data: T): UndoAction<T>
}

interface UndoAction<T> {
  readonly handler: string
  readonly data: T
}

function UndoHandler<T extends AnyBasic>(
  name: string,
  undoFn: UndoFn<T>,
  redoFn: RedoFn<T>,
): UndoHandler<T>
```

`UndoFn<T>` receives the tag data and performs the undo. Returns the data to store in the redo tag, or nil for no redo. `RedoFn<T>` is the mirror: receives redo tag data, performs the redo, returns data for the next undo tag.

For symmetric handlers (undo and redo use the same logic with swapped data), pass the same function for both:

```typescript
const undoStageMove = UndoHandler<StageMoveTagData>(
  "stage move",
  moveEntityToStage,
  moveEntityToStage,
)
```

Registration functions that create anchor entities and tag them:

```typescript
function pushUndo(
  player: LuaPlayer,
  surface: LuaSurface,
  action: UndoAction<AnyBasic>,
  undoIndex?: 0 | 1,
): void

function pushGroupUndo(
  player: LuaPlayer,
  surface: LuaSurface,
  actions: UndoAction<AnyBasic>[],
): void
```

`pushUndo` creates an anchor entity at `[0, 1]` with `{ player, undo_index }`, destroys it with `{ player, undo_index: 1 }`, then tags the undo item with `{ handler: action.handler, data: action.data }`.

`pushGroupUndo` calls `pushUndo` with `undoIndex=0` for the first action, `undoIndex=1` for the rest, grouping all into one undo item.

#### 2. Internal dispatch

**File**: `src/project/actions/undo.ts`

Handler registry and event dispatch:

```typescript
const undoHandlers: Record<string, { undo: UndoFn<any>; redo: RedoFn<any> }> = {}
```

`on_undo_applied` handler: iterates `e.actions`, reads `action.tags?.["bp100:undo"]` as `{ handler, data }`, dispatches to registered `undoFn`. If `undoFn` returns non-nil redo data, calls `player.undo_redo_stack.set_redo_tag(1, actionIndex, "bp100:undo", { handler, data: redoData })`.

`on_redo_applied` handler: same pattern, dispatches to `redoFn`, sets undo tag on return.

Action index: iterate `e.actions` with 1-based index — this matches Factorio's action indexing. The most recent undo item becomes redo item 1.

#### 3. Anchor entity details

Anchor entities use the existing `bp100_undo-reference` prototype at fixed position `[0, 1]`. This distinguishes new-style anchors from old-style undo references (which encode the entry index in `position.x` with `position.y == 0`).

When Factorio undoes a create+destroy anchor item, it recreates then immediately destroys the anchor, firing `on_built_entity` and `script_raised_destroy`. The `on_built_entity` handler in `build-events.ts:155` must distinguish between old and new style:

- `position == [0, 1]`: new-style anchor — destroy entity and return (all logic handled by `on_undo_applied`)
- `position.y == 0` and `position.x` is integer 1-100: old-style — handle via existing `doUndoEntryAtIndex` (backward compat during migration)

#### 4. Test simulation helpers

```typescript
function _simulateUndo(player: LuaPlayer): void
function _simulateRedo(player: LuaPlayer): void
```

`_simulateUndo`: reads the most recent undo item (index 1) from `player.undo_redo_stack`, iterates its actions, finds those with `bp100:undo` tags, dispatches to `undoFn`. Sets redo tags on return, same as the real `on_undo_applied` handler. Then removes the undo item from the stack.

`_simulateRedo`: same but reads from the redo stack (index 1), dispatches to `redoFn`, sets undo tags. Removes the redo item.

These exercise the exact same dispatch logic as the real event handlers, just triggered programmatically.

### Tests

**File**: `src/test/project/undo.test.ts` (add new describe block alongside existing tests)

```
describe("tag-based undo/redo", () => {
  - registers handler and creates anchor with correct tags
  - _simulateUndo dispatches to undo handler with correct data
  - _simulateUndo sets redo tag; _simulateRedo dispatches to redo handler
  - round-trip: register → undo → redo → undo
  - undo handler returning nil skips redo tag
  - group undo: multiple actions undone together
  - group redo: multiple actions redone together
  - group round-trip: register group → undo → redo
})
```

### Success Criteria

#### Automated Verification
- [x] New tests pass: `pnpm exec factorio-test run "tag%-based undo"`
- [x] Existing tests still pass: `pnpm run test`
- [x] Lint passes: `pnpm run lint`

---

## Phase 1b: Migrate Existing Handlers + Add Redo

### Overview

Migrate each existing handler from live-reference + ghost-mine to serialized-data + anchor-tag using the new API. Add redo support for each. Update all call sites.

### Changes Required

#### 1. Project resolution and entity lookup helpers

**File**: `src/project/actions/undo-handlers.ts` (new, replaces `undo-records.ts`)

All tag data includes a `projectId: ProjectId` field. The undo/redo functions resolve this to a `ProjectActions` instance using the existing `getProjectById(id)` from `src/project/ProjectList.ts:22`. If the project no longer exists (deleted between action and undo), the handler silently returns.

```typescript
function getActionsForUndo(projectId: ProjectId): ProjectActions | nil {
  const project = getProjectById(projectId)
  if (!project) return nil
  return project.actions
}
```

Since handlers can no longer store `ProjectEntity` references, they find entities by position and name:

```typescript
function findEntityForUndoTag(
  content: MutableProjectContent,
  position: MapPosition,
  firstValue: Entity,
  firstStage: StageNumber,
): ProjectEntity | nil
```

Uses `content.findCompatibleWithExistingEntity()` (same approach as current `findCompatibleEntityForUndo`).

For `"delete entity"` undo, the entity doesn't exist yet (it was deleted), so we use `importEntity` from `EntityExport` data instead.

#### 2. Migrate `"delete entity"` handler

**Current**: stores `{ actions: ProjectActions, entity: ProjectEntity }`, calls `actions.readdDeletedEntity(entity)`.

**New**:
- **On delete**: `exportEntity(entity)` + export wire connections → store as tag data
- **On undo**: `importEntity(exportData)` → `content.addEntity(restoredEntity)` → restore wire connections. Returns same data for redo tag.
- **On redo**: find entity at position, call `forceDeleteEntity`. Returns same data for undo tag.

```typescript
interface WireConnectionExport {
  otherPosition: MapPosition
  otherName: string
  fromId: defines.wire_connector_id
  toId: defines.wire_connector_id
}

interface DeleteEntityTagData {
  entityExport: EntityExport
  wires: WireConnectionExport[]
  projectId: ProjectId
}
```

**Wire connection serialization**: The existing `exportAllEntities` references wires by entity number, which requires both entities to be in the export set. For single-entity delete, instead store each wire as `{ otherPosition, otherName, fromId, toId }` — referencing the other entity by its world position and name.

**On undo (restore)**: After importing and adding the entity, iterate `wires` and for each entry, find the other entity via `content.findCompatibleWithExistingEntity()` at `otherPosition`. If found, call `content.addWireConnection()`. If the other entity no longer exists (deleted or moved since the original action), skip that wire silently. This is best-effort — Phase 3's multi-entity undo will handle coordinated wire restoration for cases like multi-entity force delete.

#### 3. Migrate `"stage move"` handler

**Current**: stores `{ actions, entity, oldStage }`, calls `actions.userTryMoveEntityToStage(entity, oldStage, ...)`.

**New**: Symmetric handler — undo and redo use the same function with swapped stages.

```typescript
interface StageMoveTagData {
  projectId: ProjectId
  position: MapPosition
  name: string
  oldStage: StageNumber
  newStage: StageNumber
}
```

The handler function: find entity at `newStage`, call `userTryMoveEntityToStage(entity, oldStage, ...)`, return `{ ..., oldStage: newStage, newStage: oldStage }`.

#### 4. Migrate `"send to stage"` handler

**Current**: stores `{ actions, entity, oldStage }`, calls `actions.userBringEntityToStage(entity, oldStage, ...)` (inverse operation).

**New**: Same `StageMoveTagData`. Undo calls `userBringEntityToStage`, redo calls `userSendEntityToStage`. Returns swapped stages.

#### 5. Migrate `"bring to stage"` handler

**Current**: stores `{ actions, entity, oldStage }`, calls `actions.userSendEntityToStage(entity, entity.firstStage, oldStage, ...)`.

**New**: Same `StageMoveTagData`. Undo calls `userSendEntityToStage`, redo calls `userBringEntityToStage`. Returns swapped stages.

#### 6. Migrate `"last stage change"` handler

**Current**: stores `{ actions, entity, oldLastStage }`, calls `actions.userTrySetLastStage(entity, oldLastStage, ...)`.

**New**: Symmetric handler.

```typescript
interface LastStageChangeTagData {
  projectId: ProjectId
  position: MapPosition
  name: string
  firstStage: StageNumber
  oldLastStage: StageNumber | nil
  newLastStage: StageNumber | nil
}
```

The handler function: find entity, call `userTrySetLastStage(entity, oldLastStage, ...)`, return `{ ..., oldLastStage: newLastStage, newLastStage: oldLastStage }`.

#### 7. Update call sites

All call sites currently create `UndoAction` objects and call `pushUndoAction`/`pushGroupUndoAction`/`pushUndoActionLater`.

**`ProjectActions.ts`**:
- `onPreviewReplaced` (line 96-109): return new `UndoAction` via `handler.createAction(data)`
- `onEntityForceDeleteUsed` (line 497-504): export entity, return new `UndoAction`
- `handleStageDelete` (line 728-751): return new `UndoAction`
- `onStageDeleteCancelUsed` (line 753-757): return new `UndoAction`
- `onBringToStageUsed` (line 759-766): return new `UndoAction`
- `onSendToStageUsed` (line 778-801): return new `UndoAction`
- `onMoveEntityToStageCustomInput` (line 803-807): return new `UndoAction`
- `userMoveEntityToStageWithUndo` (line 852-855): call `pushUndo` directly
- `userSetLastStageWithUndo` (line 857-860): call `pushUndo` directly

**`selection-tools.ts`**: Replace `pushGroupUndoAction(undoActions)` with `pushGroupUndo(player, surface, actions)` at 6 call sites.

**`build-events.ts:199`**: Replace `pushUndoActionLater` with direct `pushUndo`. The old system needed `DelayedEvent` because `mine_entity()` during `on_built_entity` would pollute the player's current undo entry. The new system uses explicit `undo_index: 0` which creates a separate undo item regardless of timing, so no deferral is needed.

#### 8. Update `build-events.ts` undo reference handling

At line 155-157, change `onUndoReferenceBuilt` behavior:
- If position is `[0, 1]`: destroy entity, return (new-style anchor, handled by `on_undo_applied`)
- If position.y == 0 and position.x is integer 1-100: handle via old `doUndoEntryAtIndex` (backward compat for saves with old undo entries)

### Tests

Update `src/test/integration/undo-redo.test.ts`:
- Replace `_simulateUndo(player)` with new `_simulateUndo(player)`
- Add redo test for each handler: perform action → undo → verify reversed → redo → verify re-applied
- Add round-trip test: action → undo → redo → undo → verify

New tests for entity export/import in undo context:
- Delete entity with stage diffs → undo → verify diffs restored → redo → verify deleted again
- Delete entity with wire connections → undo → verify wires restored (to existing entities) → redo

### Success Criteria

#### Automated Verification
- [x] All tests pass: `pnpm run test`
- [x] Lint passes: `pnpm run lint`
- [x] Format passes: `pnpm run format:fix`

---

## Phase 1c: Remove Old Undo System + Migration

### Overview

Remove the ghost-mine mechanism entirely and add a migration to clean up old storage.

### Changes Required

#### 1. Remove old undo infrastructure from `undo.ts`

Delete:
- `UndoEntry` interface
- `PlayerData.undoEntries` and `PlayerData.nextUndoEntryIndex` declarations
- `onPlayerInitSince` for undo entries
- `pushUndo()` (old ghost creation + mine version)
- `pushUndoLater()` + `FutureUndoEvent` (DelayedEvent)
- Old `pushUndoAction()`, `pushUndoActionLater()`, `pushGroupUndoAction()`
- `doUndoEntry()`, `doUndoEntryAtIndex()`
- `_undoGroup` handler
- Old `_simulateUndo()`, `performUndoAction()`
- `_lastUndoIndex`
- Old `UndoAction`, `UndoFn`, `UndoHandler` types/factory
- Migration to "2.10.6" for `futureUndoData` (already applied, can keep or remove)

Keep:
- `bp100_undo-reference` prototype (reused as anchor)
- `onUndoReferenceBuilt` simplified to just destroy entity (for backward compat with any remaining old-style undo items in the stack, and for anchor entities during undo/redo)

#### 2. Remove old undo records

Delete `undo-records.ts` (handlers now in `undo-handlers.ts`).

#### 3. Update exports from `actions/index.ts`

Remove old exports, add new ones.

#### 4. Remove `DelayedEvent` usage from undo

Remove the `FutureUndoEvent` and `pushUndoLater` from `undo.ts`. `DelayedEvent` itself is still used by `blueprint-paste.ts` (`BplibPasteEvent`), so the module stays.

#### 5. Clean up `Constants.MAX_UNDO_ENTRIES`

Remove if no longer referenced.

#### 6. Migration

**File**: `src/project/index.ts`

```typescript
declare const storage: unknown
Migrations.to($CURRENT_VERSION, () => {
  interface OldStorage {
    players?: Record<number, { undoEntries?: unknown; nextUndoEntryIndex?: unknown }>
  }
  const players = (storage as OldStorage).players
  if (players) {
    for (const [, playerData] of pairs(players)) {
      delete playerData.undoEntries
      delete playerData.nextUndoEntryIndex
    }
  }
})
```

Any existing undo references on Factorio's native undo stack become no-ops: when the player presses Ctrl+Z, Factorio builds the old ghost, `on_built_entity` fires, the simplified handler destroys it and returns silently.

### Tests

- Remove old unit tests for ghost-mine system from `src/test/project/undo.test.ts`
- Verify all integration tests pass with new system

### Success Criteria

#### Automated Verification
- [x] All tests pass: `pnpm run test`
- [x] Lint passes: `pnpm run lint`
- [x] Format passes: `pnpm run format:fix`
- [x] No references to removed functions: grep for old `pushUndoAction`, `pushGroupUndoAction`, `pushUndoActionLater`, `_lastUndoIndex` in non-test code returns nothing

#### Manual Verification
- [x] Load a save from the previous version — old undo entries silently become no-ops
- [ ] Perform force delete → Ctrl+Z undoes it → Ctrl+Y redoes it
- [ ] Multi-entity selection tool → Ctrl+Z undoes all at once → Ctrl+Y redoes
- [ ] Stage move operations all undo/redo correctly

---

## Open Questions

### Action index for tagging

After creating and destroying the anchor, we need to know which action index within the undo item corresponds to our anchor. The destroy action should be the last one. We can count actions before and after, or iterate the undo item to find our tagged action. Need to verify the exact behavior.

## References

- Design doc: `thoughts/scratch/undo-system-revision.md`
- Current undo system: `src/project/actions/undo.ts`, `src/project/actions/undo-records.ts`
- Entity export/import: `src/import-export/entity.ts`
- Event handler routing: `src/project/event-handlers/build-events.ts:150-157`
- Selection tools (6 group undo sites): `src/project/event-handlers/selection-tools.ts`
- Project lookup: `src/project/ProjectList.ts:22` (`getProjectById`)
- Factorio 2.0 undo API types: `node_modules/typed-factorio/runtime/generated/classes.d.ts:33420-33468`
