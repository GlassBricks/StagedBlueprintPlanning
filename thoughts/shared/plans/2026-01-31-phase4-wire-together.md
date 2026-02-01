# Phase 4: Wire Together — ProjectActions + ContentObserver

## Overview

Merge `user-actions.ts` + `project-updates.ts` into a `ProjectActions` class, wire `WorldPresentation` as the `ContentObserver` on `MutableProjectContent`, and switch `event-handlers.ts` to dispatch to `ProjectActions`. After this phase, entity mutations flow reactively through `MutableProjectContent` → `ContentObserver` → `WorldPresentation` instead of imperatively calling `WorldUpdates`.

Reference: [Phasing Plan](./separation-of-concerns-phases.md) Phase 4, [Target State](./separation-of-concerns-target-state.md) §ProjectActions

## Current State

After Phases 1-3:
- `MutableProjectContent` has all entity mutation methods with `ContentObserver` notifications (Phase 1)
- `WorldPresentation` wraps `WorldUpdates` + `EntityHighlights`, owns `EntityStorage` (Phase 2)
- `ContentObserver` interface defined but no implementor wired (Phase 1)
- `ProjectSettings`, `ProjectSurfaces`, `ProjectList` extracted (Phase 3)
- `UserProject` renamed to `Project` (Phase 3)

Still in place:
- `project-updates.ts` (846 lines): closure-based factory, directly mutates entities via `_asMut()` and imperatively calls `WorldUpdates` methods
- `user-actions.ts` (743 lines): closure-based factory, orchestrates `ProjectUpdates` + `WorldUpdates`, manages undo/notifications
- `event-handlers.ts` dispatches to `stage.actions` (typed as `UserActions`)
- `ProjectBase` interface has `actions: UserActions`, `updates: ProjectUpdates`, `worldUpdates: WorldUpdates`
- `LazyLoadClass` pattern constructs `UserActions` and `ProjectUpdates`
- Undo handlers cast `project` to `InternalProject` to access `InternalUserActions` methods

## Desired End State

- `ProjectActions` class replaces both `UserActions` and `ProjectUpdates`
- `ProjectActions` depends on `WorldPresenter` interface (not `WorldPresentation` class directly), for testability
- `ProjectActions` calls `MutableProjectContent` mutation methods (not `entity._asMut()` directly)
- `MutableProjectContent` notifies `WorldPresentation` via `ContentObserver` for most world sync
- `ProjectActions` calls `WorldPresenter` directly only for operations that bypass the observer:
  - Tile sync (`updateTiles` returns `TileCollision`)
  - Train rebuild sequences (ordered destroy-all-then-rebuild-all)
  - `rebuildEntity` (explicit world rebuild, e.g., after stage insert)
  - `refreshEntity` / `refreshAllEntities` (refresh without content change — handles both world entity and highlights internally)
  - `deleteEntityAtStage` (cleanup tool — removes world entity without deleting project entity)
  - `resetUnderground` (underground belt repair)
- `ProjectActions` has zero direct calls to `EntityHighlights` — all highlight updates go through `WorldPresenter.refreshEntity` or observer notifications
- `event-handlers.ts` dispatches to `ProjectActions` instead of `UserActions`
- `LazyLoadClass` pattern removed for actions/updates
- `ProjectBase` simplified: no `updates` or `worldUpdates` fields
- Import flows construct `MutableProjectContent` separately, populate it, then pass to `Project` constructor — no observer detach/reattach needed

### Verification
- All existing tests pass
- `project-updates.ts` deleted
- `user-actions.ts` deleted
- No references to `ProjectUpdates`, `UserActions`, or `LazyLoadClass` remain (except `LazyLoad.ts` file itself)
- `event-handlers.ts` dispatches to `ProjectActions`

## What We're NOT Doing

- Deleting `world-updates.ts` or `entity-highlights.ts` (Phase 5 — they remain as internal implementation of `WorldPresentation`)
- Reorganizing files into `content/` module (Phase 5)
- Deleting `LazyLoad.ts` file itself (Phase 5)
- Changing the undo mechanism (`undo.ts` stays as-is, just updated handler implementations)

## Implementation Approach

Three sub-phases, each compilable and tested:
1. **4a**: Create `ProjectActions` class that delegates to existing `ProjectUpdates` + `UserActions` (adapter)
2. **4b**: Wire `WorldPresentation` as `ContentObserver`, migrate `ProjectActions` internals from imperative world sync to observer-based content mutations
3. **4c**: Delete old code, remove `LazyLoadClass` wrappers

---

## Phase 4a: Create ProjectActions Class (Adapter)

### Overview

Create `ProjectActions` class with the target API surface and the `WorldPresenter` interface. Initially `ProjectActions` delegates to the existing `ProjectUpdates` and `UserActions` factories internally — same behavior, new interface. Update `event-handlers.ts` and all callers to use `ProjectActions`.

### Changes

#### 1. Define `WorldPresenter` interface

`src/project/WorldPresentation.ts` (alongside existing `WorldEntityLookup`):

```typescript
interface WorldPresenter extends WorldEntityLookup {
  replaceWorldOrPreviewEntity(entity: ProjectEntity, stage: StageNumber, luaEntity: LuaEntity | nil): void

  rebuildStage(stage: StageNumber): void
  rebuildAllStages(): void
  rebuildEntity(entity: ProjectEntity, stage: StageNumber): void
  refreshEntity(entity: ProjectEntity, stage: StageNumber): void
  refreshAllEntities(entity: ProjectEntity): void
  deleteEntityAtStage(entity: ProjectEntity, stage: StageNumber): void
  resetUnderground(entity: ProjectEntity, stage: StageNumber): void

  updateTiles(position: Position, fromStage: StageNumber): TileCollision | nil

  disableAllEntitiesInStage(stage: StageNumber): void
  enableAllEntitiesInStage(stage: StageNumber): void
  initSpacePlatform(): void
}
```

`WorldPresentation` implements `WorldPresenter`. The `refreshEntity` method refreshes both the world entity and all highlights at a stage (replaces separate `refreshWorldEntityAtStage` + `updateAllHighlights` calls). `refreshAllEntities` refreshes all stages (replaces `refreshAllWorldEntities`). `deleteEntityAtStage` replaces `clearWorldEntityAtStage`.

This gives `ProjectActions` a clean, mockable interface with no knowledge of `WorldUpdates`, `EntityHighlights`, or `EntityStorage` internals.

#### 2. `src/project/ProjectActions.ts` (new)

```typescript
@RegisterClass("ProjectActions")
class ProjectActions {
  private _projectUpdates: ProjectUpdates
  private _userActions: InternalUserActions

  constructor(
    private project: ProjectBase,
    readonly content: MutableProjectContent,
    readonly worldPresenter: WorldPresenter,
    readonly settings: ProjectSettings,
  ) {
    // Temporary: cast to concrete class to get old factories working.
    // This cast disappears in 4b when old factories are removed.
    const wp = worldPresenter as WorldPresentation
    const worldUpdates = wp.getWorldUpdates()
    this._projectUpdates = ProjectUpdates(project, worldUpdates)
    this._userActions = UserActions(project, this._projectUpdates, worldUpdates) as InternalUserActions
  }
}
```

Expose the full `ProjectActions` interface (per target state) by delegating each method to the appropriate internal implementation:

- Event-handling methods (`onEntityCreated`, `onEntityDeleted`, `onEntityRotated`, etc.) → delegate to `_userActions`
- Tool handler methods (`onCleanupToolUsed`, `onEntityForceDeleteUsed`, etc.) → delegate to `_userActions`
- Programmatic UI methods (`reviveSettingsRemnant`, `moveEntityToStageWithUndo`, etc.) → delegate to `_userActions`
- Surface/tile event methods (`onSurfaceCleared`, `onTileBuilt`, `onTileMined`) → delegate to `_userActions`

Internal interface methods (for undo handlers):
- `findCompatibleEntityForUndo` → `_userActions.findCompatibleEntityForUndo`
- `forceDeleteEntity` → `_projectUpdates.forceDeleteEntity`
- `readdDeletedEntity` → `_projectUpdates.readdDeletedEntity`
- `moveEntityToStage`, `setEntityLastStage`, `bringEntityToStage`, `sendEntityToStage` → delegate to `_userActions` internal methods

Note: The 4a adapter casts `worldPresenter as WorldPresentation` internally to get `WorldUpdates` for the old factories. This cast disappears in 4b when the old factories are removed.

#### 3. Update `Project.ts`

Replace `LazyLoadClass` construction:

```typescript
// Remove:
actions = UserActionsClass({ project: this })
updates = ProjectUpdatesClass({ project: this })

// Replace with:
actions: ProjectActions = new ProjectActions(this, this.content, this.worldPresentation, this.settings)
```

Remove `updates` field from `ProjectImpl`.

Update `ProjectBase` interface:
```typescript
interface ProjectBase {
  readonly settings: ProjectSettings
  readonly surfaces: ProjectSurfaces
  lastStageFor(entity: ReadonlyStagedValue<AnyNotNil, AnyNotNil>): StageNumber
  readonly content: MutableProjectContent
  readonly valid: boolean
  actions: ProjectActions
  worldPresentation: WorldPresentation
}
```

Remove `updates: ProjectUpdates` and `worldUpdates: WorldUpdates` from `ProjectBase`. Code that previously accessed `project.updates` or `project.worldUpdates` is updated:
- `project.worldUpdates` → `project.worldPresentation.getWorldUpdates()` (temporary, until Phase 4b inlines these calls)
- `project.updates.*` → `project.actions.*` (methods now on ProjectActions)

#### 3. Update `Stage` interface and `StageImpl`

```typescript
interface Stage {
  readonly actions: ProjectActions  // was UserActions
  // ... rest unchanged
}

class StageImpl implements Stage {
  actions: ProjectActions  // was UserActions
  constructor(public project: ProjectImpl, public stageNumber: StageNumber) {
    this.actions = project.actions
  }
}
```

#### 4. Update `event-handlers.ts`

Change imports: `UserActions` → `ProjectActions`.

The dispatch pattern is unchanged — `stage.actions.onEntityCreated(...)` etc. — since `ProjectActions` has the same method signatures. Type references update from `UserActions` to `ProjectActions`.

Remove references to `project.updates`:
- Line 230: `stage.project.updates.maybeDeleteProjectEntity()` → `stage.project.actions.maybeDeleteProjectEntity()` (expose on `ProjectActions` as an internal method, or inline the logic)

#### 5. Update undo handlers in `user-actions.ts`

The undo handlers reference `(project as InternalProject).actions` and call `InternalUserActions` methods. These continue to work since `ProjectActions` exposes the same internal methods (which delegate to `_userActions`).

Update `InternalProject` type to use `ProjectActions`:
```typescript
interface InternalProject extends Project {
  actions: InternalProjectActions
}
```

#### 6. Update `doDiscard` in `Project.ts`

Currently calls `this.updates.forceDeleteEntity(entity)`. Change to `this.actions.forceDeleteEntity(entity)`.

#### 7. Remove `LazyLoadClass` usage

Delete `UserActionsClass` and `ProjectUpdatesClass` constants. Remove `LazyLoadClass` import.

#### 8. Remove exports

Remove `ProjectUpdates` re-export from `Project.ts` and any barrel exports.

### Tests

- Update test setup that constructs `ProjectUpdates` or `UserActions` directly to use `ProjectActions` instead
- All existing unit and integration tests pass
- Undo tests verify undo handlers still work through `ProjectActions`

### Success Criteria

#### Automated
- [ ] `pnpm run build:test` compiles
- [ ] `pnpm run test` passes
- [ ] `pnpm run lint` passes
- [ ] `pnpm run format:fix` clean
- [ ] No references to `UserActionsClass` or `ProjectUpdatesClass` remain
- [ ] `ProjectBase` has no `updates` or `worldUpdates` fields

---

## Phase 4b: Wire ContentObserver + Migrate to Content Mutations

### Overview

Wire `WorldPresentation` as `ContentObserver`, then migrate `ProjectActions` internals from imperative `WorldUpdates` calls to `MutableProjectContent` mutation methods (which trigger observer notifications). This is the architectural switch from imperative to reactive world sync.

### Sub-step 4b.1: Implement ContentObserver on WorldPresentation

`WorldPresentation` implements `ContentObserver` by delegating to its internal `WorldUpdates` + `EntityHighlights`. These are internal implementation details — `ProjectActions` never sees them.

```typescript
class WorldPresentation implements ContentObserver, WorldPresenter {
  onEntityAdded(entity: ProjectEntity): void {
    this.getWorldUpdates().updateNewWorldEntitiesWithoutWires(entity)
    this.getWorldUpdates().updateWireConnections(entity)
    this.getHighlights().updateAllHighlights(entity)
  }

  onEntityDeleted(entity: ProjectEntity): void {
    this.getWorldUpdates().deleteWorldEntities(entity)
  }

  onEntityChanged(entity: ProjectEntity, fromStage: StageNumber): void {
    this.getWorldUpdates().updateWorldEntities(entity, fromStage)
  }

  onEntityLastStageChanged(entity: ProjectEntity, oldLastStage: StageNumber | nil): void {
    this.getWorldUpdates().updateWorldEntitiesOnLastStageChanged(entity, oldLastStage)
  }

  onEntityBecameSettingsRemnant(entity: ProjectEntity): void {
    this.getWorldUpdates().makeSettingsRemnant(entity)
  }

  onEntityRevived(entity: ProjectEntity): void {
    this.getWorldUpdates().reviveSettingsRemnant(entity)
  }

  onWiresChanged(entity: ProjectEntity): void {
    this.getWorldUpdates().updateWireConnections(entity)
    this.getHighlights().updateAllHighlights(entity)
  }

  onStageDiscarded(
    stageNumber: StageNumber,
    deleted: ProjectEntity[],
    updated: ProjectEntity[],
    updatedTiles: MapPosition[],
  ): void {
    for (const entity of deleted) {
      this.getWorldUpdates().deleteWorldEntities(entity)
    }
    for (const entity of updated) {
      this.getWorldUpdates().updateWorldEntities(entity, stageNumber)
    }
    for (const tilePosition of updatedTiles) {
      this.getWorldUpdates().updateTilesInRange(tilePosition, stageNumber, nil)
    }
  }

  onStageMerged(stageNumber: StageNumber): void {
    // merge already shifted content keys; rebuild handled by Project calling rebuildStage
  }

  // WorldPresenter command implementations
  refreshEntity(entity: ProjectEntity, stage: StageNumber): void {
    this.getWorldUpdates().refreshWorldEntityAtStage(entity, stage)
    this.getHighlights().updateAllHighlights(entity)
  }

  refreshAllEntities(entity: ProjectEntity): void {
    this.getWorldUpdates().refreshAllWorldEntities(entity)
    // refreshAllWorldEntities already handles highlights internally
  }

  deleteEntityAtStage(entity: ProjectEntity, stage: StageNumber): void {
    this.getWorldUpdates().clearWorldEntityAtStage(entity, stage)
  }

  // rebuildEntity, rebuildStage, rebuildAllStages, resetUnderground, updateTiles,
  // replaceWorldOrPreviewEntity, etc. delegate to WorldUpdates as before
}
```

Note: `refreshEntity` combines `refreshWorldEntityAtStage` + `updateAllHighlights` into one call, so `ProjectActions` never needs to think about highlights. Every place in `user-actions.ts` that previously called `updateAllHighlights` (e.g., for underground belt pair error state refresh at line 428) now calls `worldPresenter.refreshEntity` instead.

#### Wire observer in Project constructor

```typescript
constructor(id, name, numStages, surfaceSettings, content = newProjectContent()) {
  this.content = content
  // ... existing setup ...
  this.content.setObserver(this.worldPresentation)
}
```

The `content` parameter defaults to a fresh `MutableProjectContent` for normal project creation. Import flows pass pre-populated content (see §Import Flow below). Observer is always wired in the constructor — no detach/reattach dance needed.

At this point, observer notifications fire but are redundant with the existing imperative calls in `ProjectUpdates`. Both paths produce the same world state — the imperative calls happen first, then the observer fires and produces no-ops (world entities already correct). This is safe but redundant.

### Sub-step 4b.2: Migrate ProjectActions to use MutableProjectContent mutations

Replace direct `entity._asMut()` calls and imperative `WorldUpdates` calls with `MutableProjectContent` mutation methods. The observer handles world sync automatically.

This is the bulk of the work. For each operation in `project-updates.ts`:

**Pattern: Before (imperative)**
```typescript
const internal = entity._asMut()
internal.adjustValueAtStage(stage, value)
worldUpdates.updateWorldEntities(entity, stage)
```

**Pattern: After (reactive)**
```typescript
content.adjustEntityValue(entity, stage, value)
// observer fires onEntityChanged → WorldPresentation updates world
```

#### Migration by operation category:

**Entity value mutations** — straightforward replacement:
- `entity._asMut().adjustValueAtStage(stage, value)` + `updateWorldEntities` → `content.adjustEntityValue(entity, stage, value)`
- `entity._asMut().setPropAtStage(stage, prop, value)` + `updateWorldEntities` → `content.setEntityProp(entity, stage, prop, value)`
- `entity._asMut().applyUpgradeAtStage(stage, upgrade)` + `updateWorldEntities` → `content.applyEntityUpgrade(entity, stage, upgrade)`
- `entity._asMut().resetValue(stage)` + `updateWorldEntities` → `content.resetEntityValue(entity, stage)`
- `entity._asMut().resetProp(stage, prop)` + `updateWorldEntities` → `content.resetEntityProp(entity, stage, prop)`
- `entity._asMut().moveValueDown(stage)` + `updateWorldEntities` → `content.moveEntityValueDown(entity, stage)`
- `entity._asMut().movePropDown(stage, prop)` + `updateWorldEntities` → `content.moveEntityPropDown(entity, stage, prop)`

**Stage bounds** — straightforward replacement:
- `entity._asMut().setFirstStageUnchecked(stage)` + `updateWorldEntities` → `content.setEntityFirstStage(entity, stage)`
- `entity._asMut().setLastStageUnchecked(stage)` + world update → `content.setEntityLastStage(entity, stage)`

**Direction** — straightforward replacement:
- `entity._asMut().direction = dir` + world update → `content.setEntityDirection(entity, dir)`

**Settings remnant**:
- `entity._asMut().isSettingsRemnant = true` + `makeSettingsRemnant` → `content.makeEntitySettingsRemnant(entity)`
- `entity._asMut().isSettingsRemnant = nil; entity._asMut().setFirstStageUnchecked(stage)` + `reviveSettingsRemnant` → `content.reviveEntity(entity, stage)`

**Wire connections**:
- `addWireConnection(connection)` + wire update → `content.addWireConnection(connection)` (observer fires `onWiresChanged`)
- `removeWireConnection(connection)` + wire update → `content.removeWireConnection(connection)`

**Entity lifecycle**:
- `content.addEntity(entity)` already fires observer `onEntityAdded`
- `content.deleteEntity(entity)` already fires observer `onEntityDeleted`

**Direct value setters (import)**:
- `entity._asMut().setFirstValueDirectly(value); entity._asMut().setStageDiffsDirectly(diffs)` → `content.setEntityValue(entity, value, diffs)`

**Underground belt type**:
- `entity._asMut().setTypeProperty(type)` + world update → `content.setUndergroundBeltType(entity, type)`

**Inserter positions**:
- `entity._asMut().setPickupPosition(pos); entity._asMut().setDropPosition(pos)` + world update → `content.setInserterPositions(entity, pickup, drop)`

#### Operations that still call WorldPresenter directly:

These bypass the observer because they involve presentation-only operations where content was not mutated:

1. **Tile sync**: `worldPresenter.updateTiles(pos, fromStage)` — tile placement can fail with collisions, requiring readback
2. **Train rebuild**: Destroys all carriages then rebuilds — needs ordered sequencing, not per-entity observer notifications
3. **`rebuildEntity(entity, stage)`**: Explicit world rebuild (e.g., hub entity after stage insert, or re-sync world entity after fast-replace)
4. **`refreshEntity(entity, stage)` / `refreshAllEntities(entity)`**: Refresh world entity + highlights without content change (e.g., chunk generation, entity death, error recovery, underground belt pair error state)
5. **`deleteEntityAtStage(entity, stage)`**: Removes world entity at a stage without deleting project entity (entity died, surface cleared)
6. **`resetUnderground(entity, stage)`**: Repairs underground belt world entity
7. **`replaceWorldOrPreviewEntity(entity, stage, luaEntity)`**: Swap the LuaEntity reference (fast replace, overbuilt entity)

#### Migration approach for `addNewEntity`:

`addNewEntity` (project-updates.ts:176) creates a new `ProjectEntity` from a `LuaEntity`, sets values, and adds to content. After migration:

```typescript
onEntityCreated(luaEntity: LuaEntity, stage: StageNumber, ...): ProjectEntity | nil {
  // ... validation, compatibility checks ...
  const projectEntity = newProjectEntity(entityValue, position, direction, stage)
  // Set special properties before adding (no observer yet)
  if (isUndergroundBelt) content.setUndergroundBeltType(projectEntity, type)
  if (inserter) content.setInserterPositions(projectEntity, pickup, drop)
  // Add triggers onEntityAdded → WorldPresentation creates world entities
  content.addEntity(projectEntity)
  // Wire connections need world entities to exist, so done after add
  content.addWireConnection(...)  // triggers onWiresChanged
  return projectEntity
}
```

Note: `newProjectEntity` returns `InternalProjectEntity`, but before adding to content, we can set properties directly since the observer hasn't seen it yet. After `addEntity`, all mutations go through `MutableProjectContent`.

#### Migration approach for underground belt pairing:

Underground belt operations often update two entities (the belt and its pair). Each `content.adjustEntityValue` / `content.setUndergroundBeltType` call fires its own observer notification, which is correct — both entities get world updates. The redundant highlight update on the pair (mentioned in target state) is acceptable.

### Sub-step 4b.3: Move ProjectUpdates logic into ProjectActions

After converting all mutations to use `MutableProjectContent`, the remaining logic from `project-updates.ts` (validation, underground belt pairing, train handling, entity creation, etc.) moves directly into `ProjectActions` methods or private helper functions.

Similarly, `user-actions.ts` logic (notification display, undo creation, stage movement coordination) moves into `ProjectActions`.

The internal helper functions from `project-updates.ts` become private methods or standalone helper functions used by `ProjectActions`:
- `fixNewUndergroundBelt` → private helper
- `createNewProjectEntity` → private helper
- `shouldMakeSettingsRemnant` → private helper
- `applyValueFromWorld` → private helper
- `handleUpdate` / `doUndergroundBeltUpdate` → private helpers
- `handleUndergroundBeltValueSet` → private helper
- `checkCanSetFirstStage` / `checkCanSetLastStage` → private helpers
- `firstStageChangeWillIntersect` / `lastStageChangeWillIntersect` → private helpers

The notification helpers from `user-actions.ts` become private methods:
- `createNotification` → private method
- `createIndicator` → private method
- `notifyIfUpdateError` / `notifyIfMoveError` → private helpers

### Sub-step 4b.4: Update import flows

Migrate `from-blueprint-book.ts` and `project.ts` to construct content before the project:

**`src/import-export/from-blueprint-book.ts`:**
```typescript
function convertBookToProjectDataOnly(stack: LuaItemStack): Project {
  const content = newProjectContent()
  // ... existing entity/wire population logic, unchanged ...
  // Uses content.addEntity(), content.addWireConnection(), entity._asMut() for setup
  // No observer fires because content has no observer yet
  return createProjectWithContent(name, numStages, surfaceSettings, content)
}
```

**`src/import-export/project.ts`:**
```typescript
function importProjectDataOnly(data: ProjectExport): Project {
  const content = newProjectContent()
  importAllEntities(content, data.entities)
  return createProjectWithContent(name, numStages, surfaceSettings, content)
}
```

**`src/import-export/index.ts`:**
```typescript
// After project construction, rebuildAllStages is called
result.worldPresentation.rebuildAllStages()
```

**`src/project/Project.ts`:**

Add `createProjectWithContent` factory:
```typescript
function createProjectWithContent(
  name: string,
  numStages: number,
  surfaceSettings: SurfaceSettings,
  content: MutableProjectContent,
): Project {
  return ProjectImpl.create(name, numStages, surfaceSettings, content)
}
```

`ProjectImpl` constructor accepts optional content:
```typescript
constructor(id, name, numStages, surfaceSettings, content = newProjectContent()) {
  this.content = content
  // ... settings, surfaces, worldPresentation setup ...
  this.content.setObserver(this.worldPresentation)
}
```

### Sub-step 4b.5: Update Project.doDiscard

Currently `doDiscard` imperatively handles discarded entities/tiles. After wiring `ContentObserver`, `discardStage` fires `onStageDiscarded` which `WorldPresentation` handles. Remove `doDiscard` entirely:

```typescript
// Before:
private doDiscard(stage: StageNumber): void {
  const [deletedEntities, updatedEntities, updatedTiles] = this.content.discardStage(stage)
  for (const entity of deletedEntities) this.updates.forceDeleteEntity(entity)
  // ...
}

// After:
// content.discardStage fires observer.onStageDiscarded
// WorldPresentation.onStageDiscarded handles world cleanup
// No doDiscard needed
```

Update `deleteStage`:
```typescript
if (isMerge) {
  this.content.mergeStage(index)
} else {
  this.content.discardStage(index)
}
```

### Tests

#### Unit tests for ContentObserver on WorldPresentation
`src/test/project/WorldPresentation-observer.test.ts`:
- Set mock content, wire observer, verify each `ContentObserver` method delegates to correct `WorldUpdates`/`EntityHighlights` calls
- Verify `onStageDiscarded` handles deleted entities, updated entities, and updated tiles

#### Unit tests for ProjectActions
`src/test/project/ProjectActions.test.ts`:
- Test each public method with mocked `MutableProjectContent` and mock `WorldPresenter`
- Verify content mutation methods called (not `_asMut()`)
- Verify observer-bypass calls go to `WorldPresenter` (easy to verify with mock since it's an interface)
- Zero calls to `EntityHighlights` or `WorldUpdates` — only `WorldPresenter` and `MutableProjectContent`
- Test undo action creation and registration

#### Integration tests
- All existing integration tests pass unchanged (they test behavior, not internal wiring)
- Run tests with observer wired to verify reactive pipeline produces identical outcomes

### Success Criteria

#### Automated
- [ ] `pnpm run build:test` compiles
- [ ] `pnpm run test` passes
- [ ] `pnpm run lint` passes
- [ ] `pnpm run format:fix` clean
- [ ] `WorldPresentation` implements `ContentObserver`
- [ ] `content.setObserver(worldPresentation)` called in Project constructor
- [ ] No `entity._asMut()` calls outside of `MutableProjectContent` implementation and entity-internal code
- [ ] `ProjectActions` has zero imports of `WorldUpdates`, `EntityHighlights`, or `EntityStorage`
- [ ] `ProjectActions` depends only on `WorldPresenter` interface (not `WorldPresentation` class)
- [ ] Import flows (`from-blueprint-book.ts`, `project.ts`) construct content before project, no observer detach

---

## Phase 4c: Delete Old Code + Cleanup

### Overview

Delete `project-updates.ts` and `user-actions.ts`. Clean up `ProjectBase`, remove `LazyLoadClass` usage, remove dual-pipeline test scaffold.

### Changes

#### 1. Delete files
- `src/project/project-updates.ts`
- `src/project/user-actions.ts`

#### 2. Delete test files
- `src/test/project/project-updates.test.ts`
- `src/test/project/user-actions.test.ts`

(Replaced by `ProjectActions.test.ts` and `WorldPresentation-observer.test.ts`)

#### 3. Clean up `ProjectBase` interface

Final `ProjectBase`:
```typescript
interface ProjectBase {
  readonly settings: ProjectSettings
  readonly surfaces: ProjectSurfaces
  lastStageFor(entity: ReadonlyStagedValue<AnyNotNil, AnyNotNil>): StageNumber
  readonly content: MutableProjectContent
  readonly valid: boolean
  actions: ProjectActions
  worldPresentation: WorldPresentation
}
```

#### 4. Clean up imports
Remove all imports of `ProjectUpdates`, `UserActions`, `LazyLoadClass` across the codebase.

#### 5. Remove `worldUpdates` getter from `ProjectImpl`
The `get worldUpdates()` accessor is no longer needed since nothing accesses `project.worldUpdates` externally.

#### 6. Remove dual-pipeline test scaffold

The integration tests have a partially-built dual-pipeline scaffold that was intended for running tests against both old and new architectures. Since Phase 4b migrates everything in-place (no feature flag), this scaffold is dead code.

Remove from `src/test/integration/integration-test-util.ts`:
- `Pipeline` type
- `describeDualPipeline` function
- `createOldPipelineProjectOps` function
- `TestProjectOps` interface

Update test files that use `describeDualPipeline`:
- `src/test/integration/undo-redo.test.ts`: Replace `describeDualPipeline("undo-redo", () => {` with a plain `describe("undo-redo", () => {`
- `src/test/integration/selection-tools.test.ts`: Replace `describeDualPipeline("selection-tools", () => {` with a plain `describe("selection-tools", () => {`

Where tests use `ctx.projectOps.*` (the `TestProjectOps` abstraction), replace with direct calls to `project.actions.*` since `ProjectActions` now has all these methods.

### Success Criteria

#### Automated
- [ ] `pnpm run build:test` compiles
- [ ] `pnpm run test` passes
- [ ] `pnpm run lint` passes
- [ ] `pnpm run format:fix` clean
- [ ] `project-updates.ts` deleted
- [ ] `user-actions.ts` deleted
- [ ] No imports of `ProjectUpdates` or `UserActions` remain
- [ ] No `LazyLoadClass` usage remains in `Project.ts`
- [ ] No references to `describeDualPipeline`, `TestProjectOps`, `createOldPipelineProjectOps`, or `Pipeline` type remain

#### Manual
- [ ] Mod loads correctly in Factorio
- [ ] Entity CRUD operations work (create, delete, rotate, upgrade)
- [ ] Stage operations work (insert, merge, discard)
- [ ] Undo/redo works for all operations
- [ ] Blueprint paste works
- [ ] Selection tools work (cleanup, force delete, stage move, stage delete)
- [ ] Wire connections update correctly
- [ ] Underground belt pairing works
- [ ] Settings remnants create and revive correctly
- [ ] Trains/vehicles work
- [ ] Tile operations work

---

## Design Decisions

### No feature flag / dual pipeline

The original phasing plan proposed a `useNewArchitecture` feature flag running both pipelines in parallel. This is unnecessary because:

1. Phase 4a creates an adapter that preserves identical behavior — no risk of divergence
2. Phase 4b is an incremental migration, not a big-bang switch — each method can be migrated and tested individually
3. The observer notifications in Phase 1 are already tested to fire correctly
4. Integration tests already cover all user-visible behavior from the pre-refactor phase

A partial scaffold for dual-pipeline testing exists (`describeDualPipeline`, `TestProjectOps`, `createOldPipelineProjectOps` in `integration-test-util.ts`, used by `undo-redo.test.ts` and `selection-tools.test.ts`). The `pipeline` parameter is never actually consumed — both runs execute identical code. This scaffold is removed in Phase 4c.

### Class vs closure pattern

`ProjectActions` is a `@RegisterClass` class instead of a closure-based factory. This is required for Factorio storage compatibility (metatables survive save/load) and eliminates `LazyLoadClass`.

### Undo handler updates

Undo handlers in `user-actions.ts` reference `InternalUserActions` methods via `(project as InternalProject).actions`. After migration, these handlers move to `ProjectActions.ts` (or a companion `undo-handlers.ts`) and reference `InternalProjectActions` instead. The `UndoHandler` / `UndoAction` / `registerUndoAction` system in `undo.ts` is unchanged.

### Import flow: construct content before project

Instead of an observer detach/reattach dance, import flows construct `MutableProjectContent` independently, populate it with entities and wires, then pass the pre-populated content to the `Project` constructor. The constructor wires the observer, and the import caller calls `rebuildAllStages()` after construction.

Current import flows (`from-blueprint-book.ts`, `project.ts`) call `createProject()` first, then add entities to `project.content`. After this change:

```typescript
// Blueprint book import
function convertBookToProjectDataOnly(stack: LuaItemStack): Project {
  const content = newProjectContent()
  // ... populate content with entities and wires ...
  const project = createProjectWithContent(name, numStages, surfaceSettings, content)
  // observer is already wired by constructor
  project.worldPresentation.rebuildAllStages()
  return project
}
```

`Project` constructor accepts optional `content` parameter (defaults to `newProjectContent()`):

```typescript
constructor(id, name, numStages, surfaceSettings, content = newProjectContent()) {
  this.content = content
  // ... create settings, surfaces, worldPresentation ...
  this.content.setObserver(this.worldPresentation)
}
```

The observer never fires during entity population because it's wired after content is fully built. No special detach logic needed. `rebuildAllStages()` called by the import code after construction handles all world entity creation in one pass.

For the space platform hub deletion during import: this happens after project construction (observer is wired), but that's fine — deleting a single entity via observer is acceptable, it's only the bulk-add that must avoid per-entity observer notifications.

### What stays on WorldPresentation vs ProjectActions

**WorldPresenter interface** (presentation commands, called by ProjectActions or Project):
- Queries: `getWorldEntity`, `getWorldOrPreviewEntity`, `hasErrorAt`
- Entity reference swap: `replaceWorldOrPreviewEntity`
- Rebuild: `rebuildStage`, `rebuildAllStages`, `rebuildEntity`
- Refresh (world entity + highlights, no content change): `refreshEntity`, `refreshAllEntities`
- Remove: `deleteEntityAtStage` (clear world entity without deleting project entity)
- Special: `resetUnderground`, `updateTiles` (returns TileCollision)
- Stage-wide: `disableAllEntitiesInStage`, `enableAllEntitiesInStage`
- Init: `initSpacePlatform`

**ProjectActions** (business logic, called by event-handlers):
- All event handlers (entity created/deleted/rotated/updated/etc.)
- All tool handlers (cleanup, force delete, stage move, etc.)
- All programmatic UI actions (revive, move with undo, etc.)
- Tile event handlers
- Internal: validation, coordination, notification, undo
- Zero direct calls to `WorldUpdates`, `EntityHighlights`, or `EntityStorage` — only `WorldPresenter` and `MutableProjectContent`

## References

- Target state: `./separation-of-concerns-target-state.md`
- Phasing plan: `./separation-of-concerns-phases.md`
- Phase 1 plan: `./2026-01-30-phase1-content-layer.md`
- Phase 2 plan: `./2026-01-30-phase2-presentation-layer.md`
- Phase 3 plan: `./2026-01-30-phase3-project-structure.md`
