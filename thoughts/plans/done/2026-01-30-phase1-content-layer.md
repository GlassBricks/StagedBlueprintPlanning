# Phase 1: Content Layer Foundation — Implementation Plan

## Overview

Split `ProjectEntity` into a read-only public interface and an internal mutable interface (`InternalProjectEntity`), expand `MutableProjectContent` with entity mutation methods that wrap `InternalProjectEntity` operations, and define the `ContentObserver` interface for future reactive world sync.

Reference: [Phasing Plan](./separation-of-concerns-phases.md) Phase 1, [Target State](./separation-of-concerns-target-state.md)

## Current State

- `ProjectEntity` (interface, `ProjectEntity.ts`) exposes all mutation methods directly: `adjustValueAtStage`, `setPropAtStage`, `setPositionUnchecked`, `direction` (writable), `isSettingsRemnant` (writable), wire connection methods, etc.
- `ProjectEntityImpl` (class, `ProjectEntity.ts`) implements `ProjectEntity` and is decorated with `@RegisterClass("AssemblyEntity")` for serialization
- `MutableProjectContent` (`ProjectContent.ts`) has collection-level operations (`addEntity`, `deleteEntity`, `changeEntityPosition`, stage operations, tile operations) but no entity-level mutation methods
- Callers in `project-updates.ts`, `user-actions.ts`, `world-updates.ts`, `entity-highlights.ts`, and `event-handlers.ts` directly call mutation methods on `ProjectEntity` instances
- `newProjectEntity()` returns `ProjectEntity<E>`

### Parallel Track Progress (Phase 2 and Phase 3)

Phase 2 (Presentation Layer) and Phase 3 (Project Structure) are developing in parallel. Relevant completed work:

- **Phase 2a-2b complete**: `EntityStorage` class exists, `WorldPresentation` shell wraps `WorldUpdates` + `EntityHighlights`. `WorldEntityLookup` interface defined on `WorldPresentation`.
- **Phase 2c partially complete**: `WorldUpdates` and `EntityHighlights` internals use `EntityStorage`. World entity accessor methods exist on `WorldPresentation`. External caller migration is in progress (~26 files still call `entity.getWorldEntity()` etc.).
- **Phase 3a complete**: `ProjectSettings` and `BlueprintBookTemplate` extracted from `UserProject`. `Project` interface has `settings` field.

This means:
- World entity methods (`getWorldEntity`, `getWorldOrPreviewEntity`, `hasErrorAt`, etc.) are being migrated off `ProjectEntity` by Phase 2. Phase 1's `InternalProjectEntity` should NOT include these methods — they belong to `WorldPresentation`.
- Extra entity methods (`getExtraEntity`, `replaceExtraEntity`, etc.) are already migrated internally to `EntityStorage` in Phase 2. These should also NOT appear on `InternalProjectEntity`.
- `Project` interface already has `settings: ProjectSettings` and `worldPresentation: WorldPresentation`.

## Desired End State

After this phase:
- `ProjectEntity` interface is read-only: no mutation methods, `position`/`direction`/`isSettingsRemnant` are `readonly`
- `InternalProjectEntity` extends `ProjectEntity` with all mutation methods
- `ProjectEntityImpl` implements `InternalProjectEntity` (no runtime changes)
- `newProjectEntity()` returns `InternalProjectEntity`
- `MutableProjectContent` has all entity mutation methods (per target state). Each method casts `ProjectEntity` to `InternalProjectEntity` internally and performs the mutation
- `ContentObserver` interface is defined with a `setObserver()` method on `MutableProjectContent`. Observer is nil — notifications are no-ops
- All mutation methods on `MutableProjectContent` fire observer notifications when observer is set
- All existing callers updated to either: (a) use `MutableProjectContent` mutation methods, or (b) use `entity._asMut()` / `InternalProjectEntity` directly for internal operations
- All existing tests pass unchanged. New unit tests cover each `MutableProjectContent` mutation method and observer notifications

## What We're NOT Doing

- Implementing `ContentObserver` (no implementor yet — just the interface)
- Changing `ProjectActions` or event dispatch (Phase 4)
- Moving files to a `content/` module (Phase 5)
- Migrating world entity methods off `ProjectEntity` (Phase 2, in progress on parallel track)
- Extracting `ProjectSurfaces` or replacing event system (Phase 3, in progress on parallel track)

## Implementation Approach

Incremental changes in three sub-phases matching the phasing plan. Each sub-phase compiles and all tests pass before the next.

---

## Phase 1a: InternalProjectEntity Pattern

### Overview

Introduce `InternalProjectEntity` interface. Split current `ProjectEntity` into read-only and mutable parts. This is a type-level change — the runtime `ProjectEntityImpl` class doesn't change, but the interface hierarchy changes.

### Changes

#### 1. `src/entity/ProjectEntity.ts` — Split interface

Split current `ProjectEntity` interface into two interfaces:

```typescript
interface ProjectEntity<out T extends Entity = Entity> extends ReadonlyStagedValue<T, StageDiff<T>> {
  readonly position: Position
  readonly direction: defines.direction
  readonly isSettingsRemnant?: true
  readonly wireConnections?: WireConnections

  // Type queries
  isUndergroundBelt(): this is UndergroundBeltProjectEntity
  isInserter(): this is InserterProjectEntity
  getType(): EntityType | nil
  isMovable(): this is MovableProjectEntity
  isPersistent(): boolean
  getPreviewDirection(): defines.direction

  // Additional read-only methods
  getFirstStageDiffForProp<K extends keyof T>(prop: K): LuaMultiReturn<[] | [StageNumber | nil, T[K]]>
  getUnstagedValue(stage: StageNumber): UnstagedEntityProps | nil

  // World entity queries — transitional, Phase 2 moves these to WorldPresentation
  // (Include or omit depending on merge order; if Phase 2 merges first, these are already gone)
  getWorldEntity(stage: StageNumber): LuaEntity | nil
  getWorldOrPreviewEntity(stage: StageNumber): LuaEntity | nil
  iterateWorldOrPreviewEntities(): LuaIterable<LuaMultiReturn<[StageNumber, LuaEntity]>>
  hasWorldEntityInRange(startStage: StageNumber, endStage: StageNumber): boolean
  hasErrorAt(stage: StageNumber): boolean

  // Extra entity queries — transitional, Phase 2 moves these to EntityStorage
  getExtraEntity<T extends keyof ExtraEntities>(type: T, stage: StageNumber): ExtraEntities[T] | nil
  hasAnyExtraEntities(type: ExtraEntityType): boolean

  // Property queries
  getProperty<T extends keyof StageProperties>(key: T, stage: StageNumber): StageProperties[T] | nil
  getPropertyAllStages<T extends keyof StageProperties>(key: T): Record<StageNumber, StageProperties[T]> | nil
  propertySetInAnyStage(key: keyof StageProperties): boolean

  _asMut(): InternalProjectEntity

  // Internal linked list (Map2D)
  _next: ProjectEntity | nil
}
```

Note: World entity and extra entity query methods are marked transitional. If Phase 2 merges before Phase 1, these will already be removed from `ProjectEntity` and live on `WorldPresentation`/`EntityStorage`. Phase 1 should not re-add them. The `_asMut()` cast and `ReadonlyStagedValue` extension are the core changes.

New `InternalProjectEntity` extending `ProjectEntity`:

```typescript
interface InternalProjectEntity<T extends Entity = Entity> extends ProjectEntity<T>, StagedValue<T, StageDiff<T>> {
  // Mutable transform
  position: Position
  direction: defines.direction
  setPositionUnchecked(position: Position): void

  // Mutable settings remnant
  isSettingsRemnant: true | nil

  // Mutable rolling stock flag
  isNewRollingStock: true | nil

  // Value mutations (from StagedValue)
  adjustValueAtStage(stage: StageNumber, value: T): boolean
  setPropAtStage<K extends keyof T>(stage: StageNumber, prop: K, value: T[K]): boolean
  applyUpgradeAtStage(stage: StageNumber, newValue: NameAndQuality): boolean
  resetValue(stage: StageNumber): boolean
  resetProp<K extends keyof T>(stage: StageNumber, prop: K): boolean
  moveValueDown(stage: StageNumber): StageNumber | nil
  movePropDown<K extends keyof T>(stage: StageNumber, prop: K): StageNumber | nil

  // Direct value setters (from StagedValue)
  setFirstValueDirectly(value: T): void
  setStageDiffsDirectly(stageDiffs: PRRecord<StageNumber, StageDiff<T>> | nil): void
  setFirstStageUnchecked(stage: StageNumber): void
  setLastStageUnchecked(stage: StageNumber | nil): void
  clearPropertyInAllStages<T extends keyof StageProperties>(key: T): void

  // Unstaged value mutation
  setUnstagedValue(stage: StageNumber, value: UnstagedEntityProps | nil): boolean

  // Type-specific mutations
  setTypeProperty(this: UndergroundBeltProjectEntity, direction: "input" | "output"): void
  setDropPosition(this: InserterProjectEntity, position: Position | nil): void
  setPickupPosition(this: InserterProjectEntity, position: Position | nil): void

  // Wire connections
  addOneWayWireConnection(connection: ProjectWireConnection): boolean
  removeOneWayWireConnection(connection: ProjectWireConnection): void
  syncIngoingConnections(existingEntities: ReadonlyLuaSet<ProjectEntity>): void
  removeIngoingConnections(): void

  // Internal
  _applyDiffAtStage(stage: StageNumber, diff: StageDiffInternal<T>): void
}
```

Note: World entity methods (`replaceWorldEntity`, `destroyWorldOrPreviewEntity`, etc.) and extra entity methods (`replaceExtraEntity`, `destroyExtraEntity`, etc.) are NOT on `InternalProjectEntity`. Phase 2 moves these to `WorldPresentation`/`EntityStorage`. If Phase 2 has not yet merged when Phase 1 is implemented, these methods still exist on `ProjectEntityImpl` but are not part of the `InternalProjectEntity` contract — they are accessed through `WorldPresentation` instead.

**Approach for StagedValue**: Split `StagedValue` into `ReadonlyStagedValue` (query methods) and `StagedValue` (extends `ReadonlyStagedValue` with mutations). `ProjectEntity extends ReadonlyStagedValue`. `InternalProjectEntity extends ProjectEntity, StagedValue` (full). `BaseStagedValue` continues to implement `StagedValue`. `ProjectTile` is unaffected (it uses `StagedValue` directly).

```typescript
interface ReadonlyStagedValue<T, D> {
  readonly firstValue: T
  readonly firstStage: StageNumber
  readonly lastStage: StageNumber | nil

  isInStage(stage: StageNumber): boolean
  isPastLastStage(stage: StageNumber): boolean

  readonly stageDiffs?: PRRecord<StageNumber, D>
  hasStageDiff(stage?: StageNumber): boolean
  getStageDiff(stage: StageNumber): D | nil
  nextStageWithDiff(stage: StageNumber): StageNumber | nil
  prevStageWithDiff(stage: StageNumber): StageNumber | nil

  getValueAtStage(stage: StageNumber): Readonly<T> | nil
  iterateValues(
    start: StageNumber,
    end: StageNumber,
  ): LuaIterable<LuaMultiReturn<[StageNumber, Readonly<T> | nil, changed: boolean]>>
}

interface StagedValue<T, D> extends ReadonlyStagedValue<T, D> {
  setFirstValueDirectly(value: T): void
  setFirstStageUnchecked(stage: StageNumber): void
  setLastStageUnchecked(stage: StageNumber | nil): void
  setStageDiffsDirectly(stageDiffs: PRRecord<StageNumber, D> | nil): void
  adjustValueAtStage(stage: StageNumber, value: T): boolean
  insertStage(stageNumber: StageNumber): void
  resetValue(stage: StageNumber): boolean
  mergeStage(stageNumber: StageNumber): void
  discardStage(stageNumber: StageNumber): boolean
}
```

#### 2. `ProjectEntityImpl` — Change `implements` clause

```typescript
class ProjectEntityImpl<T extends Entity = Entity>
  extends BaseStagedValue<T, StageDiff<T>>
  implements InternalProjectEntity<T>
```

The class already has all methods. Only addition: `_asMut(): InternalProjectEntity { return this }`.

#### 3. `newProjectEntity()` — Return type changes to `InternalProjectEntity`

```typescript
export function newProjectEntity<E extends Entity>(
  entity: E,
  position: Position,
  direction: defines.direction,
  stageNumber: StageNumber,
  unstagedValue?: UnstagedEntityProps,
): InternalProjectEntity<E>
```

#### 4. Update callers that need `InternalProjectEntity`

Files that mutate entities directly need to either:
- Accept `InternalProjectEntity` as parameter type (internal code)
- Or use `MutableProjectContent` methods (Phase 1b)

For Phase 1a, update mutation callers to use `InternalProjectEntity` type where they directly mutate. Callers can either change parameter types to `InternalProjectEntity`, or use `entity._asMut()` to obtain the mutable interface. Key files:
- `src/project/project-updates.ts` — functions that accept entity params and mutate them need `InternalProjectEntity` parameter types
- `src/project/event-handlers.ts` — `direction` writes, `isNewRollingStock` writes
- `src/entity/ProjectContent.ts` — `changeEntityPosition` (calls `setPositionUnchecked`), `syncIngoingConnections`
- `src/entity/wires.ts` — `addWireConnection`, `removeWireConnection`
- `src/import-export/from-blueprint-book.ts` — `applyUpgradeAtStage`
- `src/import-export/entity.ts` — `setUnstagedValue`

Note: `world-updates.ts` and `entity-highlights.ts` world entity mutation calls are being handled by Phase 2 (parallel track). `user-actions.ts` `replaceWorldEntity` calls are already migrated to `WorldPresentation` by Phase 2.

#### 5. Export both interfaces

Export `InternalProjectEntity` from `ProjectEntity.ts` for use by internal modules. The intent is that only `MutableProjectContent` and entity-internal code use it. External code (UI, future `ProjectActions`) uses `ProjectEntity`.

### Success Criteria

#### Automated Verification
- [x] `pnpm run build:test` compiles cleanly
- [x] `pnpm run test` — all existing tests pass
- [x] `pnpm run lint` passes
- [x] `pnpm run format:fix` applied

---

## Phase 1b: Expand MutableProjectContent

### Overview

Add entity mutation methods to `MutableProjectContent` that wrap `InternalProjectEntity` operations. Each method calls `entity._asMut()` to obtain the mutable interface, performs the mutation, and calls `ContentObserver` notification (added in 1c, nil for now).

### Changes

#### 1. `src/entity/ProjectContent.ts` — Expand interface and implementation

Add methods to `MutableProjectContent` interface:

```typescript
interface MutableProjectContent extends ProjectContent {
  // Existing methods stay...

  // Entity direction
  setEntityDirection(entity: ProjectEntity, direction: defines.direction): void

  // Entity stage bounds
  setEntityFirstStage(entity: ProjectEntity, stage: StageNumber): void
  setEntityLastStage(entity: ProjectEntity, stage: StageNumber | nil): void

  // Entity value mutations
  adjustEntityValue(entity: ProjectEntity, stage: StageNumber, value: Entity): boolean
  setEntityProp<T extends Entity, K extends keyof T>(
    entity: ProjectEntity<T>, stage: StageNumber, prop: K, value: T[K]
  ): boolean
  applyEntityUpgrade(entity: ProjectEntity, stage: StageNumber, upgrade: NameAndQuality): boolean
  resetEntityValue(entity: ProjectEntity, stage: StageNumber): boolean
  resetEntityProp<T extends Entity, K extends keyof T>(
    entity: ProjectEntity<T>, stage: StageNumber, prop: K
  ): boolean
  moveEntityValueDown(entity: ProjectEntity, stage: StageNumber): StageNumber | nil
  moveEntityPropDown<T extends Entity, K extends keyof T>(
    entity: ProjectEntity<T>, stage: StageNumber, prop: K
  ): StageNumber | nil

  // Direct value setters (for import)
  setEntityValue(entity: ProjectEntity, firstValue: Entity, stageDiffs: StageDiffs | nil): void

  // Entity unstaged value
  setEntityUnstagedValue(entity: ProjectEntity, stage: StageNumber, value: UnstagedEntityProps | nil): boolean
  clearEntityUnstagedValues(entity: ProjectEntity): void

  // Settings remnant
  makeEntitySettingsRemnant(entity: ProjectEntity): void
  reviveEntity(entity: ProjectEntity, stage: StageNumber): void

  // Wire connections
  addWireConnection(connection: ProjectWireConnection): void
  removeWireConnection(connection: ProjectWireConnection): void

  // Type-specific mutations
  setUndergroundBeltType(entity: UndergroundBeltProjectEntity, type: "input" | "output"): void
  setInserterPositions(entity: InserterProjectEntity, pickup: Position | nil, drop: Position | nil): void
}
```

Implementation in `ProjectContentImpl` — each method follows the pattern:

```typescript
setEntityDirection(entity: ProjectEntity, direction: defines.direction): void {
  const internal = entity._asMut()
  internal.direction = direction
  // observer notification added in 1c
}

adjustEntityValue(entity: ProjectEntity, stage: StageNumber, value: Entity): boolean {
  const internal = entity._asMut()
  const changed = internal.adjustValueAtStage(stage, value)
  // observer notification added in 1c
  return changed
}

makeEntitySettingsRemnant(entity: ProjectEntity): void {
  const internal = entity._asMut()
  internal.isSettingsRemnant = true
  // observer notification added in 1c
}

reviveEntity(entity: ProjectEntity, stage: StageNumber): void {
  const internal = entity._asMut()
  internal.isSettingsRemnant = nil
  internal.setFirstStageUnchecked(stage)
  // observer notification added in 1c
}

addWireConnection(connection: ProjectWireConnection): void {
  const from = connection.fromEntity._asMut()
  const to = connection.toEntity._asMut()
  from.addOneWayWireConnection(connection)
  to.addOneWayWireConnection(connection)
  // observer notification added in 1c
}

removeWireConnection(connection: ProjectWireConnection): void {
  const from = connection.fromEntity._asMut()
  const to = connection.toEntity._asMut()
  from.removeOneWayWireConnection(connection)
  to.removeOneWayWireConnection(connection)
  // observer notification added in 1c
}

setEntityValue(entity: ProjectEntity, firstValue: Entity, stageDiffs: StageDiffs | nil): void {
  const internal = entity._asMut()
  internal.setFirstValueDirectly(firstValue)
  internal.setStageDiffsDirectly(stageDiffs)
  // observer notification added in 1c
}
```

#### 2. Move standalone wire functions into MutableProjectContent

Currently `addWireConnection` and `removeWireConnection` are standalone exported functions in `ProjectEntity.ts`. These become methods on `MutableProjectContent`:
- `MutableProjectContent.addWireConnection` is the new API (with observer notification)
- Update callers (`wires.ts`, `project-updates.ts`) to use `content.addWireConnection()` instead
- Remove standalone functions from `ProjectEntity.ts`

#### 3. `changeEntityPosition` already exists — add observer hook point

The existing `changeEntityPosition` already handles the spatial index update. It will gain observer notification in 1c.

### Success Criteria

#### Automated Verification
- [x] `pnpm run build:test` compiles cleanly
- [x] `pnpm run test` — all existing tests pass
- [x] `pnpm run lint` passes

---

## Phase 1c: ContentObserver Interface + Notifications

### Overview

Define `ContentObserver`, add `setObserver()` to `MutableProjectContent`, and wire observer notifications into all mutation methods. Observer starts as nil — notifications are no-ops until Phase 4 connects `WorldPresentation`.

### Changes

#### 1. Define ContentObserver

New file `src/entity/ContentObserver.ts` (or inline in `ProjectContent.ts`):

```typescript
interface ContentObserver {
  onEntityAdded(entity: ProjectEntity): void
  onEntityDeleted(entity: ProjectEntity): void
  onEntityChanged(entity: ProjectEntity, fromStage: StageNumber): void
  onEntityLastStageChanged(entity: ProjectEntity, oldLastStage: StageNumber | nil): void
  onEntityBecameSettingsRemnant(entity: ProjectEntity): void
  onEntityRevived(entity: ProjectEntity): void
  onWiresChanged(entity: ProjectEntity): void

  onStageDiscarded(
    stageNumber: StageNumber,
    deleted: ProjectEntity[],
    updated: ProjectEntity[],
    updatedTiles: MapPosition[],
  ): void
  onStageMerged(stageNumber: StageNumber): void
}
```

#### 2. Add `setObserver` to MutableProjectContent

```typescript
interface MutableProjectContent extends ProjectContent {
  setObserver(observer: ContentObserver | nil): void
  // ... existing methods
}
```

Implementation stores observer as private field, defaults to nil.

#### 3. Add observer calls to all mutation methods

Each mutation method fires the appropriate notification after performing the mutation. Pattern:

```typescript
adjustEntityValue(entity: ProjectEntity, stage: StageNumber, value: Entity): boolean {
  const internal = entity._asMut()
  const changed = internal.adjustValueAtStage(stage, value)
  if (changed) this.observer?.onEntityChanged(entity, stage)
  return changed
}

setEntityFirstStage(entity: ProjectEntity, stage: StageNumber): void {
  const internal = entity._asMut()
  internal.setFirstStageUnchecked(stage)
  this.observer?.onEntityChanged(entity, math.min(stage, internal.firstStage))
}

setEntityLastStage(entity: ProjectEntity, stage: StageNumber | nil): void {
  const internal = entity._asMut()
  const oldLastStage = internal.lastStage
  internal.setLastStageUnchecked(stage)
  this.observer?.onEntityLastStageChanged(entity, oldLastStage)
}

changeEntityPosition(entity: ProjectEntity, position: Position): boolean {
  // ... existing spatial index logic ...
  if (changed) this.observer?.onEntityChanged(entity, internal.firstStage)
  return changed
}

addEntity(entity: ProjectEntity): void {
  // ... existing logic ...
  this.observer?.onEntityAdded(entity)
}

deleteEntity(entity: ProjectEntity): void {
  // ... existing logic ...
  this.observer?.onEntityDeleted(entity)
}

makeEntitySettingsRemnant(entity: ProjectEntity): void {
  const internal = entity._asMut()
  internal.isSettingsRemnant = true
  this.observer?.onEntityBecameSettingsRemnant(entity)
}

reviveEntity(entity: ProjectEntity, stage: StageNumber): void {
  const internal = entity._asMut()
  internal.isSettingsRemnant = nil
  internal.setFirstStageUnchecked(stage)
  this.observer?.onEntityRevived(entity)
}

addWireConnection(connection: ProjectWireConnection): void {
  // ... mutation logic ...
  this.observer?.onWiresChanged(connection.fromEntity)
  this.observer?.onWiresChanged(connection.toEntity)
}

discardStage(stageNumber: StageNumber): ... {
  // ... existing logic that builds deleted/updated/updatedTiles arrays ...
  this.observer?.onStageDiscarded(stageNumber, deleted, updated, updatedTiles)
  return $multi(deleted, updated, updatedTiles)
}

mergeStage(stageNumber: StageNumber): void {
  // ... existing logic ...
  this.observer?.onStageMerged(stageNumber)
}
```

Note: `insertStage` does NOT fire observer (per target state spec — Project coordinates via `WorldPresentation.onStageInserted` directly).

### Testing

New unit tests in `src/test/entity/MutableProjectContent-mutations.test.ts`:

- For each new mutation method:
  - Call method, verify entity state changed correctly
  - Set mock observer via `setObserver()`, call method, verify correct observer notification fired with correct arguments
  - Verify notification not fired when mutation is a no-op (e.g., `adjustEntityValue` returns false)

Test structure:

```typescript
describe("MutableProjectContent mutations", () => {
  let content: MutableProjectContent
  let observer: MockContentObserver

  before_each(() => {
    content = newProjectContent()
    observer = createMockObserver()
    content.setObserver(observer)
  })

  describe("adjustEntityValue()", () => {
    test("delegates to entity and returns result", () => {
      const entity = newProjectEntity(...)
      content.addEntity(entity)
      const changed = content.adjustEntityValue(entity, 1, newValue)
      expect(changed).toBe(true)
      expect(entity.getValueAtStage(1)).toEqual(newValue)
    })

    test("fires onEntityChanged when value changes", () => {
      // ... setup ...
      content.adjustEntityValue(entity, 2, newValue)
      expect(observer.onEntityChanged).toHaveBeenCalledWith(entity, 2)
    })

    test("does not fire observer when value unchanged", () => {
      // ... setup with same value ...
      content.adjustEntityValue(entity, 1, sameValue)
      expect(observer.onEntityChanged).not.toHaveBeenCalled()
    })
  })

  // Similar pattern for each method...
})
```

### Success Criteria

#### Automated Verification
- [x] `pnpm run build:test` compiles cleanly
- [x] `pnpm run test` — all existing tests pass
- [x] `pnpm run test "MutableProjectContent%-mutations"` — new tests pass
- [x] `pnpm run lint` passes
- [x] `pnpm run format:fix` applied

---

## Design Decisions

### StagedValue mutation exposure

Split `StagedValue` into `ReadonlyStagedValue` (query-only interface) and `StagedValue extends ReadonlyStagedValue` (adds mutations). `ProjectEntity extends ReadonlyStagedValue`. `InternalProjectEntity extends ProjectEntity, StagedValue`. `BaseStagedValue` continues to implement `StagedValue`. `ProjectTile` is unaffected (uses `StagedValue` directly).

### Wire connection standalone functions

Migrate callers in `wires.ts` to use `content.addWireConnection()`/`content.removeWireConnection()`. Remove standalone `addWireConnection`/`removeWireConnection` from `ProjectEntity.ts`.

### Observer notification granularity

Follow target state spec. Most mutations fire `onEntityChanged(entity, fromStage)`. Only settings remnant, last-stage, wire, add, delete have distinct notifications. Mutation methods that return false (no change) do not fire notifications.

### Where to put ContentObserver

Define in `ProjectContent.ts` alongside `MutableProjectContent`.

### Merge order with parallel tracks

Per phasing plan, recommended merge order is Phase 3 → Phase 1 → Phase 2. Phase 1 is orthogonal to Phase 3 (different files). Phase 1's `InternalProjectEntity` excludes world entity methods — those are handled by Phase 2. If Phase 2 merges before Phase 1, the world entity methods will already be gone from `ProjectEntity`, simplifying Phase 1's interface split. If Phase 1 merges first, the world entity methods remain on `ProjectEntityImpl` but are not part of `InternalProjectEntity`.
