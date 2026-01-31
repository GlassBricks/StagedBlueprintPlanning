# Phase 2: Presentation Layer Foundation — Implementation Plan

## Overview

Extract world entity and highlight storage from `ProjectEntity` into a dedicated `EntityStorage` class, and create a `WorldPresentation` facade that wraps the existing `WorldUpdates` + `EntityHighlights` modules. By the end, `ProjectEntity` stores only pure data — all world object references live in `EntityStorage`, accessed through `WorldPresentation`.

Reference: [Target State](./separation-of-concerns-target-state.md) §EntityStorage, §WorldPresentation, §WorldEntityTypes

## Current State

- World entities (`LuaEntity`) stored as numeric-indexed properties directly on `ProjectEntity` instances (`this[stage]`)
- Highlight/render objects stored in `ProjectEntity.stageProperties` via `ExtraEntities` declaration merging
- `WorldUpdates` and `EntityHighlights` are closure-based factory functions taking `Project` parameter
- Both constructed via `LazyLoadClass` in `UserProject.ts`
- `hasErrorAt()` on `ProjectEntity` reads world entity state (mixing data and presentation)
- ~21 external call sites across 6 files access world entity methods on `ProjectEntity`
- All external callers have access to a `Project` reference
- `wires.ts` functions receive only `(content, entity, stage)` — no project/world reference

## Desired End State

- `EntityStorage<WorldEntityTypes>` owns all world object references (entities + highlights)
- `WorldPresentation` class wraps `WorldUpdates` + `EntityHighlights`, owns `EntityStorage`
- `WorldPresentation` exposes world entity accessors: `getWorldEntity`, `getWorldOrPreviewEntity`, `replaceWorldOrPreviewEntity`, `hasErrorAt`
- `ProjectEntity` has zero world entity methods and zero `ExtraEntities` storage
- `Project` interface exposes `worldPresentation` (replaces `worldUpdates`)
- All external callers read/write world entities through `WorldPresentation`
- `wires.ts` functions receive a world entity getter parameter instead of reading from `ProjectEntity`

### Verification

- All existing integration tests pass unchanged
- All existing unit tests pass (with updated setup where storage location changed)
- `ProjectEntity.ts` exports no world entity methods (`getWorldEntity`, `getWorldOrPreviewEntity`, `replaceWorldOrPreviewEntity`, `destroyWorldOrPreviewEntity`, `destroyAllWorldOrPreviewEntities`, `hasWorldEntityInRange`, `iterateWorldOrPreviewEntities`, `hasErrorAt`, `getExtraEntity`, `replaceExtraEntity`, `destroyExtraEntity`, `destroyAllExtraEntities`, `hasAnyExtraEntities`)
- `ProjectEntity.ts` has no `ExtraEntities` interface or `stageProperties` for extra entities (the `StageProperties` with `unstagedValue` remains)
- No numeric `LuaEntity` storage on `ProjectEntity` instances

## What We're NOT Doing

- Creating `ContentObserver` or reactive observer pattern (Phase 1/4)
- Changing `ProjectActions` / `ProjectUpdates` / `UserActions` structure (Phase 4)
- Replacing the closure-based factory pattern for `WorldUpdates`/`EntityHighlights` internals — only wrapping them
- Extracting `ProjectSettings` or `ProjectSurfaces` (Phase 3)
- Replacing event system (Phase 3)

## Implementation Approach

Incremental migration using the adapter pattern. `WorldPresentation` starts as a thin shell delegating to existing modules, then gradually takes over storage responsibilities. Each sub-phase compiles, passes tests, and can be verified independently.

---

## Phase 2a: EntityStorage

### Overview

Create the `EntityStorage<T>` generic class. Purely additive — no existing code changes.

### Changes

#### `src/project/EntityStorage.ts` (new)

```typescript
@RegisterClass("EntityStorage")
class EntityStorage<T extends Record<string, unknown>> {
  private data = new LuaMap<ProjectEntity, LuaMap<string, LuaMap<StageNumber, unknown>>>()

  get<K extends keyof T & string>(entity: ProjectEntity, type: K, stage: StageNumber): T[K] | nil
  set<K extends keyof T & string>(entity: ProjectEntity, type: K, stage: StageNumber, value: T[K] | nil): void
  delete<K extends keyof T & string>(entity: ProjectEntity, type: K, stage: StageNumber): void
  deleteAllOfType<K extends keyof T & string>(entity: ProjectEntity, type: K): void
  deleteAllForEntity(entity: ProjectEntity): void
  iterateType<K extends keyof T & string>(entity: ProjectEntity, type: K): LuaIterable<LuaMultiReturn<[StageNumber, T[K]]>>
  hasInRange<K extends keyof T & string>(entity: ProjectEntity, type: K, start: StageNumber, end: StageNumber): boolean
  shiftStageKeysUp(entity: ProjectEntity, fromStage: StageNumber): void
  shiftStageKeysDown(entity: ProjectEntity, fromStage: StageNumber): void
}
```

Internal data structure: 3-level `LuaMap` nesting: `entity → type → stage → value`. The `get`/`set` methods validate entity references. `set` with nil value delegates to `delete`. `shiftStageKeysUp`/`Down` use the existing `shiftNumberKeysUp`/`Down` utilities from `src/lib`.

#### `src/test/project/EntityStorage.test.ts` (new)

Unit tests:
- `get()` returns nil for missing entries
- `set()` + `get()` round-trip
- `set()` with nil deletes
- `delete()` removes entry
- `deleteAllOfType()` removes all stages for one type, preserves other types
- `deleteAllForEntity()` removes all types and stages
- `iterateType()` yields all `(stage, value)` pairs for a type
- `hasInRange()` returns true/false correctly
- `shiftStageKeysUp()` shifts keys >= fromStage up by 1
- `shiftStageKeysDown()` shifts keys > fromStage down by 1
- Multiple entities are independent

### Success Criteria

#### Automated
- [x] `pnpm run test "EntityStorage"` — all new tests pass
- [x] `pnpm run test` — all existing tests still pass
- [x] `pnpm run lint && pnpm run format:fix` — clean

---

## Phase 2b: WorldPresentation Shell

### Overview

Create `WorldPresentation` class that wraps existing `WorldUpdates` + `EntityHighlights`. Replace `LazyLoadClass` construction with direct instantiation. Wire into `Project` interface.

### Changes

#### `src/project/WorldPresentation.ts` (new)

```typescript
interface WorldEntityTypes {
  worldOrPreviewEntity: LuaEntity
  errorOutline: HighlightBoxEntity
  errorElsewhereIndicator: LuaRenderObject
  settingsRemnantHighlight: HighlightBoxEntity
  configChangedHighlight: HighlightBoxEntity
  configChangedLaterHighlight: LuaRenderObject
  stageDeleteHighlight: LuaRenderObject
  itemRequestHighlight: LuaRenderObject
  itemRequestHighlightOverlay: LuaRenderObject
}

class WorldPresentation {
  readonly entityStorage: EntityStorage<WorldEntityTypes>
  private worldUpdates: WorldUpdates
  private highlights: EntityHighlights

  constructor(project: Project) {
    this.entityStorage = new EntityStorage()
    this.highlights = EntityHighlights(project)
    this.worldUpdates = WorldUpdates(project, this.highlights)
  }
}
```

Expose all `WorldUpdates` methods as delegation. This is a 1:1 adapter — same behavior, new wrapper.

Additionally expose world entity accessor methods that will initially delegate to `ProjectEntity` (migrated in Phase 2c):

```typescript
getWorldOrPreviewEntity(entity: ProjectEntity, stage: StageNumber): LuaEntity | nil
getWorldEntity(entity: ProjectEntity, stage: StageNumber): LuaEntity | nil
replaceWorldOrPreviewEntity(entity: ProjectEntity, stage: StageNumber, luaEntity: LuaEntity | nil): void
hasErrorAt(entity: ProjectEntity, stage: StageNumber): boolean
```

Initially these just delegate to the corresponding `ProjectEntity` methods. They'll be switched to use `EntityStorage` in Phase 2c.

#### `src/project/ProjectDef.d.ts`

Add `worldPresentation: WorldPresentation` to the `Project` interface. Keep `worldUpdates` as a deprecated alias temporarily (it will still be used by code that hasn't migrated yet).

#### `src/project/UserProject.ts`

Replace the `LazyLoadClass` construction for WorldUpdates:

```typescript
// Remove:
worldUpdates = WorldUpdatesClass({ project: this })

// Replace with:
private _worldPresentation = new WorldPresentation(this)
get worldPresentation(): WorldPresentation { return this._worldPresentation }
get worldUpdates(): WorldUpdates { return this._worldPresentation }
```

Since `WorldPresentation` delegates all `WorldUpdates` methods, the `worldUpdates` getter returning the `WorldPresentation` instance works as long as `WorldPresentation` implements the `WorldUpdates` interface shape.

Remove `WorldUpdatesClass` LazyLoad. Keep `UserActionsClass` and `ProjectUpdatesClass` unchanged.

#### `src/test/project/WorldPresentation.test.ts` (new)

Test that WorldPresentation properly delegates to WorldUpdates methods. Test accessor methods delegate to ProjectEntity (temporary behavior).

### Success Criteria

#### Automated
- [x] `pnpm run test` — all existing tests pass (WorldPresentation is transparent adapter)
- [x] `pnpm run lint && pnpm run format:fix` — clean

---

## Phase 2c: Migrate World Entity Storage

### Overview

Move world entity (`LuaEntity`) storage from `ProjectEntity` numeric indices to `EntityStorage`. Update all callers. This is the highest-risk sub-phase.

### Sub-step 2c.1: WorldUpdates writes to EntityStorage

Modify `WorldUpdates` factory to accept `EntityStorage` parameter. All internal `replaceWorldOrPreviewEntity`, `destroyWorldOrPreviewEntity`, `destroyAllWorldOrPreviewEntities` calls write to `EntityStorage` instead of `ProjectEntity`.

#### `src/project/world-updates.ts`

Add `entityStorage: EntityStorage<WorldEntityTypes>` parameter to the factory function:

```typescript
export function WorldUpdates(
  project: Project,
  highlights: EntityHighlights,
  entityStorage: EntityStorage<WorldEntityTypes>,
): WorldUpdates
```

Replace internal calls:
- `entity.replaceWorldOrPreviewEntity(stage, luaEntity)` → `entityStorage.set(entity, "worldOrPreviewEntity", stage, luaEntity)` (with destroy logic for existing entity)
- `entity.destroyWorldOrPreviewEntity(stage)` → destroy entity at `entityStorage.get(...)`, then `entityStorage.delete(...)`
- `entity.destroyAllWorldOrPreviewEntities()` → iterate `entityStorage.iterateType(entity, "worldOrPreviewEntity")`, destroy each, then `entityStorage.deleteAllOfType(...)`
- `entity.getWorldOrPreviewEntity(stage)` → `entityStorage.get(entity, "worldOrPreviewEntity", stage)` with validity check
- `entity.getWorldEntity(stage)` → get from entityStorage, filter preview entities
- `entity.hasWorldEntityInRange(start, end)` → `entityStorage.hasInRange(entity, "worldOrPreviewEntity", start, end)` (with preview filter)

Extract the destroy-and-replace logic into helper functions on `WorldPresentation` or as local helpers, since the destroy-existing-before-set pattern (with `raise_script_destroy`) needs to be shared.

#### `src/project/WorldPresentation.ts`

Pass `this.entityStorage` to the `WorldUpdates` factory:

```typescript
this.worldUpdates = WorldUpdates(project, this.highlights, this.entityStorage)
```

Switch accessor methods from delegating to `ProjectEntity` to reading from `EntityStorage`:

```typescript
getWorldOrPreviewEntity(entity: ProjectEntity, stage: StageNumber): LuaEntity | nil {
  const luaEntity = this.entityStorage.get(entity, "worldOrPreviewEntity", stage)
  if (luaEntity && luaEntity.valid) return luaEntity
  if (luaEntity) this.entityStorage.delete(entity, "worldOrPreviewEntity", stage)
  return nil
}

getWorldEntity(entity: ProjectEntity, stage: StageNumber): LuaEntity | nil {
  const entity = this.getWorldOrPreviewEntity(entity, stage)
  if (entity && !isPreviewEntity(entity)) return entity
  return nil
}

hasErrorAt(entity: ProjectEntity, stage: StageNumber): boolean {
  if (!entity.isInStage(stage)) return false
  const worldEntity = this.getWorldEntity(entity, stage)
  return worldEntity == nil ||
    (worldEntity.type == "underground-belt" &&
      worldEntity.belt_to_ground_type != (entity.firstValue as unknown as UndergroundBeltEntity).type)
}
```

Add stage-shifting methods:

```typescript
onStageInserted(stageNumber: StageNumber): void {
  for (const entity of this.content.allEntities()) {
    this.entityStorage.shiftStageKeysUp(entity, stageNumber)
  }
}

onStageDeleted(stageNumber: StageNumber): void {
  for (const entity of this.content.allEntities()) {
    this.entityStorage.shiftStageKeysDown(entity, stageNumber)
  }
}
```

#### `src/project/entity-highlights.ts`

EntityHighlights already has a `project: Project` parameter. After Phase 2c wires `worldPresentation` onto `Project`, EntityHighlights reads world entities through `project.worldPresentation.getWorldOrPreviewEntity(entity, stage)` and `project.worldPresentation.getWorldEntity(entity, stage)`. No additional getter parameters needed.

Additionally, pass `EntityStorage` for highlight read/write (merging what was previously planned for Phase 2d):

```typescript
export function EntityHighlights(
  project: Project,
  entityStorage: EntityStorage<WorldEntityTypes>,
): EntityHighlights
```

Replace internal calls:
- `entity.getWorldOrPreviewEntity(stage)` → `project.worldPresentation.getWorldOrPreviewEntity(entity, stage)`
- `entity.getWorldEntity(stage)` → `project.worldPresentation.getWorldEntity(entity, stage)`
- `entity.getExtraEntity(type, stage)` → `entityStorage.get(entity, type, stage)` with validity check
- `entity.replaceExtraEntity(type, stage, value)` → destroy existing if different, then `entityStorage.set(...)`
- `entity.destroyExtraEntity(type, stage)` → destroy entity at `entityStorage.get(...)`, then `entityStorage.delete(...)`
- `entity.destroyAllExtraEntities(type)` → iterate `entityStorage.iterateType(entity, type)`, destroy each, then `entityStorage.deleteAllOfType(...)`

#### `src/project/WorldPresentation.ts` — constructor

```typescript
constructor(project: Project) {
  this.entityStorage = new EntityStorage()
  this.highlights = EntityHighlights(project, this.entityStorage)
  this.worldUpdates = WorldUpdates(project, this.highlights, this.entityStorage)
}
```

### Sub-step 2c.2: Migrate external callers

All external callers have access to `Project`. Replace `entity.getWorldEntity(stage)` with `project.worldPresentation.getWorldOrPreviewEntity(entity, stage)` (or the appropriate method).

#### `src/project/project-updates.ts`

10 call sites. The factory function receives `project: Project`. Replace:
- `entity.getWorldEntity(stage)` → `project.worldPresentation.getWorldEntity(entity, stage)` (7 sites)
- `projectEntity.replaceWorldEntity(stage, entity)` → `project.worldPresentation.replaceWorldOrPreviewEntity(projectEntity, stage, entity)` (1 site)
- `entity.destroyAllWorldOrPreviewEntities()` → `project.worldPresentation.deleteAllWorldEntities(entity)` (1 site)

#### `src/project/user-actions.ts`

5 call sites. Factory receives `project: Project`. Replace:
- `compatible.replaceWorldEntity(stage, worldEntity)` → `project.worldPresentation.replaceWorldOrPreviewEntity(...)` (4 sites)
- `existing.hasErrorAt(stage)` → `project.worldPresentation.hasErrorAt(existing, stage)` (1 site)

#### `src/project/event-handlers.ts`

2 call sites. Has access to `stage.project`. Replace:
- `projectEntity.getWorldEntity(stage.stageNumber)` → `stage.project.worldPresentation.getWorldEntity(projectEntity, stage.stageNumber)` (2 sites)

#### `src/entity/wires.ts`

4 call sites. Functions receive `(content, entity, stage)` — no project reference. Add a `getWorldEntity` parameter:

```typescript
export function updateWireConnectionsAtStage(
  content: MutableProjectContent,
  entity: ProjectEntity,
  stage: StageNumber,
  getWorldEntity: (entity: ProjectEntity, stage: StageNumber) => LuaEntity | nil,
): void

export function saveWireConnections(
  content: MutableProjectContent,
  entity: ProjectEntity,
  stage: StageNumber,
  getWorldEntity: (entity: ProjectEntity, stage: StageNumber) => LuaEntity | nil,
  higherStageForMerging?: StageNumber,
): void
```

Update call sites in `world-updates.ts` and `project-updates.ts` to pass the getter.

#### `src/ui/opened-entity.tsx`

3 call sites. Has `stage.project`. Replace:
- `entity.getWorldEntity(currentStageNum)` → `project.worldPresentation.getWorldEntity(entity, currentStageNum)` (1 site)
- `projectEntity.getWorldOrPreviewEntity(stage.stageNumber)` → `project.worldPresentation.getWorldOrPreviewEntity(...)` (2 sites)

#### `src/ui/commands.ts`

1 call site. Has `project`. Replace:
- `entity.getWorldEntity(entity.firstStage)` → `project.worldPresentation.getWorldEntity(entity, entity.firstStage)`

#### `src/blueprints/blueprint-creation.ts`

3 call sites. Has `stage.project`. Replace:
- `entity.getWorldOrPreviewEntity(stageNumber)` → `project.worldPresentation.getWorldOrPreviewEntity(entity, stageNumber)`

### Sub-step 2c.3: Handle stage insert/delete

#### `src/project/UserProject.ts`

In `insertStage`, after `content.insertStage(stage)`:
```typescript
this.worldPresentation.onStageInserted(stage)
```

In `deleteStage`, after content merge/discard:
```typescript
this.worldPresentation.onStageDeleted(index)
```

#### `src/entity/ProjectEntity.ts`

`insertStage()` and `shiftKeysDown()` currently shift world entity numeric keys — but actually they don't! They only shift `stageProperties`. The numeric keys are never shifted because `rebuildStage` destroys and recreates everything. With `EntityStorage`, the keys need to be shifted explicitly (handled by `WorldPresentation.onStageInserted`/`onStageDeleted`).

### Sub-step 2c.4: Remove world entity methods from ProjectEntity

#### `src/entity/ProjectEntity.ts`

Remove from `ProjectEntityImpl`:
- `[stage: StageNumber]: LuaEntity | nil` — numeric index signature
- `getWorldOrPreviewEntity(stage)`
- `getWorldEntity(stage)`
- `replaceWorldEntity(stage, entity)`
- `replaceWorldOrPreviewEntity(stage, entity)`
- `destroyWorldOrPreviewEntity(stage)`
- `destroyAllWorldOrPreviewEntities()`
- `hasWorldEntityInRange(start, end)`
- `iterateWorldOrPreviewEntities()`
- `hasErrorAt(stage)`

After Phase 1 merge, the interfaces are split: remove read-only world entity methods (`getWorldEntity`, `getWorldOrPreviewEntity`, `hasErrorAt`, `hasWorldEntityInRange`, `iterateWorldOrPreviewEntities`) from the `ProjectEntity` interface, and remove mutation methods (`replaceWorldEntity`, `replaceWorldOrPreviewEntity`, `destroyWorldOrPreviewEntity`, `destroyAllWorldOrPreviewEntities`) from the `InternalProjectEntity` interface.

Remove the `registerEntity` call from `replaceWorldOrPreviewEntity` — move entity registration to the equivalent code in `WorldPresentation` or `WorldUpdates`.

Remove the `raise_script_destroy` calls — move them to the destroy helpers in `WorldPresentation`/`WorldUpdates`.

#### `src/entity/ProjectContent.ts`

If `ProjectContent` calls any world entity methods internally (e.g., in `findCompatibleWithLuaEntity`), update those.

### Test Updates

#### Unit tests

- `src/test/entity/ProjectEntity.test.ts` — Remove tests for world entity methods. These tests move to `EntityStorage.test.ts` and `WorldPresentation.test.ts`.
- `src/test/project/world-updates.test.ts` — Update setup to provide `EntityStorage` to factory. Verify world entities stored in `EntityStorage`.
- `src/test/project/entity-highlights.test.ts` — Update setup to provide `EntityStorage` to factory. Verify highlights stored in `EntityStorage`.
- `src/test/project/project-updates.test.ts` — Update calls that previously read from `ProjectEntity` to read from `WorldPresentation`.
- `src/test/entity/wires.test.ts` — Pass `getWorldEntity` parameter to functions.
- `src/test/project/entity-highlight-test-util.ts` — Update to read from `EntityStorage`.

#### Integration tests

The pre-refactor phase already migrated all integration tests to use `ctx.worldQueries.*` adapters instead of calling `entity.getWorldEntity(stage)` etc. directly. Update the `worldQueries` adapter implementation in `setupEntityIntegrationTest` to delegate to `project.worldPresentation.*`:

```typescript
worldQueries: {
  getWorldEntity: (entity, stage) => ctx.project.worldPresentation.getWorldEntity(entity, stage),
  getWorldOrPreviewEntity: (entity, stage) => ctx.project.worldPresentation.getWorldOrPreviewEntity(entity, stage),
  hasErrorAt: (entity, stage) => ctx.project.worldPresentation.hasErrorAt(entity, stage),
  getExtraEntity: (entity, type, stage) => ctx.project.worldPresentation.entityStorage.get(entity, type, stage),
  hasAnyExtraEntities: (entity, type) => /* iterate entityStorage */,
},
```

No individual test files change.

### Success Criteria

#### Automated
- [ ] `pnpm run test` — all tests pass
- [ ] `pnpm run lint && pnpm run format:fix` — clean
- [ ] Grep for `\.getWorldEntity\(` on `ProjectEntity` references returns zero results outside of `WorldPresentation`
- [ ] Grep for `\.getWorldOrPreviewEntity\(` on `ProjectEntity` references returns zero results
- [ ] Grep for `\.replaceWorldEntity\(` returns zero results
- [ ] Grep for `\.hasErrorAt\(` on `ProjectEntity` references returns zero results
- [ ] Grep for `\.destroyWorldOrPreviewEntity\(` on `ProjectEntity` references returns zero results
- [ ] Grep for `\.destroyAllWorldOrPreviewEntities\(` returns zero results

---

## Phase 2d: Remove Extra Entity Methods from ProjectEntity

### Overview

Clean up `ProjectEntity` by removing the extra entity (highlight) methods and `ExtraEntities` declaration merging. The actual highlight storage migration to `EntityStorage` was done in Phase 2c.

### Changes

#### `src/project/entity-highlights.ts` — Remove declaration merging

Remove:
```typescript
declare module "../entity/ProjectEntity" {
  export interface ExtraEntities extends HighlightEntities {}
}
```

The `HighlightEntities` type definitions are already in `WorldEntityTypes` (defined in Phase 2b).

#### `src/entity/ProjectEntity.ts` — Remove extra entity methods

Remove from `ProjectEntityImpl`:
- `stageProperties` field (only the `ExtraEntities` portion — `unstagedValue` remains via `StageProperties`)
- `getExtraEntity(type, stage)`
- `replaceExtraEntity(type, stage, entity)`
- `destroyExtraEntity(type, stage)`
- `destroyAllExtraEntities(type)`
- `hasAnyExtraEntities(type)`

Remove `ExtraEntities` interface export and `ExtraEntityType`.

**Important**: The `stageProperties` field also stores `StageProperties` (which includes `unstagedValue`). We must separate these concerns:
- `unstagedValue` storage remains on `ProjectEntity` (it's pure data, not presentation)
- `ExtraEntities` storage moves to `EntityStorage`

Currently `stageProperties` is typed as `{ [P in keyof StageData]?: PRecord<StageNumber, StageData[P]> }` where `StageData = ExtraEntities & StageProperties`. After removing `ExtraEntities`, it becomes just `StageProperties`:

```typescript
stageProperties?: {
  [P in keyof StageProperties]?: PRecord<StageNumber, StageProperties[P]>
}
```

The `insertStage`/`shiftKeysDown` methods on `ProjectEntity` that shift `stageProperties` keys continue to work — they'll just shift the `unstagedValue` keys (which is correct behavior that must be preserved).

### Test Updates

- `src/test/entity/ProjectEntity.test.ts` — Remove tests for extra entity methods.
- `src/test/project/entity-highlight-test-util.ts` — Update to read from `EntityStorage` (if not already done in 2c).

### Success Criteria

#### Automated
- [ ] `pnpm run test` — all tests pass
- [ ] `pnpm run lint && pnpm run format:fix` — clean
- [ ] Grep for `getExtraEntity` returns zero results outside of test utilities
- [ ] Grep for `replaceExtraEntity` returns zero results
- [ ] Grep for `destroyExtraEntity` returns zero results
- [ ] Grep for `destroyAllExtraEntities` returns zero results
- [ ] Grep for `hasAnyExtraEntities` returns zero results
- [ ] `ExtraEntities` interface no longer exists on `ProjectEntity`
- [ ] `ProjectEntity` has no highlight/render object storage

---

## Testing Strategy

### Unit Tests
- `EntityStorage` — Full coverage of all methods (Phase 2a)
- `WorldPresentation` accessor methods — get/set/delete world entities via EntityStorage (Phase 2c)
- `WorldUpdates` — Updated setup passing EntityStorage, same behavioral tests (Phase 2c)
- `EntityHighlights` — Updated setup passing EntityStorage, same behavioral tests (Phase 2c)

### Integration Tests
- All existing integration tests updated to access world entities through `WorldPresentation`
- Behavioral verification unchanged — tests still check the same world state outcomes
- Consider adding a test helper: `getWorldEntity(project, entity, stage)` to reduce migration churn

### Regression Risk
- Phase 2c is highest risk due to ~50+ call sites changing
- Mitigated by: every call site has a mechanical transformation (same logic, different accessor)
- `wires.ts` change is slightly more complex (new parameter) but functions are pure and well-tested

## Migration Notes

`EntityStorage` will be stored in Factorio's `storage` global (via `@RegisterClass`). Since this is a new class with no prior data, no data migration is needed — `rebuildAllStages` on load will populate EntityStorage from scratch.

However, `ProjectEntity` instances in existing saves will still have numeric `LuaEntity` keys from before migration. These keys become orphaned after removing the index signature. Adding a migration to clean them up is advisable:

```typescript
Migrations.to($CURRENT_VERSION)(() => {
  for (const project of getAllProjects()) {
    for (const entity of project.content.allEntities()) {
      // Clean up orphaned numeric keys from old world entity storage
      for (const [k] of pairs(entity)) {
        if (typeof k == "number") delete (entity as any)[k]
      }
    }
    // rebuildAllStages will populate EntityStorage fresh
    project.worldPresentation.rebuildAllStages()
  }
})
```
