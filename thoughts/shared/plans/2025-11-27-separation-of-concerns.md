# Separation of Concerns Refactor Implementation Plan

## Overview

Refactor the codebase to cleanly separate concerns into distinct components. The primary issues are:

1. **ProjectEntity as god object** - stores LuaEntity references, presentation entities, and pure data in one class
2. **Closure-based modules** - UserActions, ProjectUpdates, WorldUpdates use factory functions incompatible with clean Factorio storage
3. **Tight coupling** - ProjectUpdates directly calls WorldUpdates; no abstraction layer
4. **UserProject as god object** - stores surfaces, settings, content, and module refs in one class
5. **Project interface conflation** - mixes settings queries, surface access, content, and module refs

## Current State Analysis

### ProjectEntity (`src/entity/ProjectEntity.ts`, 826 lines)

Conflates three concerns:

- **Pure Data**: position, direction, firstValue, stageDiffs, wireConnections
- **World References**: `this[stage] = LuaEntity` via numeric index keys (lines 590-650)
- **Presentation**: `stageProperties` for extra entities like highlights (lines 653-703)

### UserProject (`src/project/UserProject.ts`)

Conflates multiple concerns:

- **Settings**: name, landfillTile, stagedTilesEnabled, defaultBlueprintSettings, surfaceSettings
- **Content**: owns MutableProjectContent
- **Surfaces**: `stages: Record<number, StageImpl>`, surface creation/deletion
- **Module refs**: actions, updates, worldUpdates
- **Stage count**: implicit via `luaLength(stages)`

### Action Handler Layer

All implemented as closure-based factory functions:

- `UserActions` (src/project/user-actions.ts:163) - routes user events
- `ProjectUpdates` (src/project/project-updates.ts:104) - validates and modifies ProjectContent
- `WorldUpdates` (src/project/world-updates.ts:97) - syncs world entities
- `EntityHighlights` (src/project/entity-highlights.ts:217) - manages visual highlights

These use `LazyLoadClass` (src/lib/LazyLoad.ts:26-33) for Factorio storage compatibility.

### Key Discoveries

- `ProjectContent` already has clean read/write separation (ProjectContent vs MutableProjectContent)
- The only "unchecked" method (`setPositionUnchecked`) is called internally via `changeEntityPosition()`
- World entity methods are called from: world-updates.ts, user-actions.ts, entity-highlights.ts, UI components
- Extra entity methods are called almost exclusively from entity-highlights.ts
- Surfaces are stored in StageImpl objects, with global reverse mapping via `storage.surfaceIndexToStage`

## Desired End State

```
                         ┌─────────────────────────────────┐
                         │          UserProject            │
                         │  (wires components together,    │
                         │   manages stage lifecycle)      │
                         └─────────────────────────────────┘
                                        │ owns
        ┌───────────────┬───────────────┼───────────────┬───────────────┐
        ▼               ▼               ▼               ▼               ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│ProjectSettings│ │ProjectSurfaces│ │ProjectContent │ │WorldPresentat.│ │  UserActions  │
│               │ │               │ │               │ │               │ │               │
│implements:    │ │implements:    │ │pure data      │ │implements:    │ │uses:          │
│StageCount     │ │SurfaceProvider│ │+ observer     │ │ContentObserver│ │StageCount     │
│StagePresent.  │ │               │ │notifications  │ │               │ │StagePresentat.│
│EntityBehavior │ │uses:          │ │               │ │uses:          │ │SurfaceProvider│
│SettingsReader │ │StageCount     │ │               │ │StageCount     │ │ProjectContent │
│SettingsWriter │ │               │ │               │ │SurfaceProvider│ │WorldPresentat.│
│               │ │               │ │               │ │EntityBehavior │ │               │
└───────────────┘ └───────────────┘ └───────────────┘ └───────────────┘ └───────────────┘

                    ┌─────────────────────────────────┐
                    │             Stage               │
                    │  (facade for event handlers,    │
                    │   stored, not on-demand)        │
                    └─────────────────────────────────┘
                                   │ holds reference to
                                   ▼
                             UserProject
                                   │
                    ┌──────────────┼──────────────┐
                    ▼              ▼              ▼
              stageNumber     surface      actions (delegated)
              (stored)     (from surfaces)  (from project)

Global Registration (storage.surfaceIndexToStage):
  - Maps SurfaceIndex → Stage
  - Event handlers call getStageAtSurface(surfaceIndex) to get Stage

Dependency Flow:

  UserActions ──────► WorldPresentation
                           │
                           ├── stagePresentation
                           ├── surfaces
                           ├── content
                           └── (commands like rebuildStage)

  WorldPresentation ──► StagePresentation
       │
       ├───────────────► SurfaceProvider
       │
       ├───────────────► EntityBehaviorSettings
       │
       └───────────────► ProjectContent

  MutableProjectContent ─────────► ContentObserver (interface)
       │                                  ▲
       │ notifies                         │ implements
       └──────────────────────────────────┘
                                    WorldPresentation

Testing: Components constructed with mocks, no full UserProject needed
  stagePresentation = createMockStagePresentation(4)
  surfaces = createMockSurfaceProvider(testSurfaces)
  entityBehavior = createMockEntityBehavior({ isSpacePlatform: false })
  content = newProjectContent()
  worldPresentation = new WorldPresentation(stagePresentation, surfaces, entityBehavior, content)
```

### Verification of End State

- [ ] No `Project` interface exists
- [ ] No `ProjectUpdates` module exists
- [ ] `LazyLoadClass` is deleted
- [ ] No delegate methods on UserProject (`getSurface`, `getStageName`, `isSpacePlatform`, `numStages`, `lastStageFor`, `worldUpdates`, `updates`)
- [ ] `project-event-listener.ts` is deleted
- [ ] No `GlobalProjectEvents` singleton - replaced by `ProjectList` with `SimpleEvent` members
- [ ] No `localEvents` field on UserProject
- [ ] Import/export uses `ProjectSettings.exportData()` and `content.exportEntities()`

## Implementation Approach

Gradually refactor `UserProject` in-place throughout the phases.

**What Remains on UserProject (not extracted)**:

- Project identity and lifecycle (`id`, `valid`, `delete()`)
- Stage lifecycle (`insertStage()`, `mergeStage()`, `discardStage()`, `getStage()`, `getAllStages()`)
- Display helper (`displayName()`)
- Stage registration (`registerStage()`, `unregisterStage()`)

---

## Phase 1: Convert Closure-Based Modules to @RegisterClass Classes

### Overview

Convert WorldUpdates, EntityHighlights, UserActions, and ProjectUpdates from closure-based factory functions to proper classes with `@RegisterClass` decorator. Use eager instantiation and dependency injection.

### Changes Required

#### 1. WorldPresentation Class (merge WorldUpdates + EntityHighlights)

**File**: `src/project/WorldPresentation.ts` (new file)

Create a class that combines the functionality of both modules:

```typescript
@RegisterClass("WorldPresentation")
export class WorldPresentation {
  constructor(private readonly project: Project) {}

  updateWorldEntities(entity: ProjectEntity, startStage: StageNumber): void { ... }
  updateNewWorldEntitiesWithoutWires(entity: ProjectEntity): void { ... }
  refreshWorldEntityAtStage(entity: ProjectEntity, stage: StageNumber): void { ... }
  updateAllHighlights(entity: ProjectEntity): void { ... }
  updateErrorOutlines(entity: ProjectEntity): void { ... }
  deleteAllHighlights(entity: ProjectEntity): void { ... }
}
```

Migration steps:

1. Create the class file with `@RegisterClass("WorldPresentation")`
2. Move all methods from `world-updates.ts` as class methods
3. Move all methods from `entity-highlights.ts` as class methods
4. Replace closure variables with class fields
5. Update all call sites to use class instance methods

#### 2. UserActions Class

**File**: `src/project/UserActions.ts` (rename/restructure existing)

```typescript
@RegisterClass("UserActions")
export class UserActions {
  constructor(
    private readonly project: Project,
    private readonly projectUpdates: ProjectUpdates,
    private readonly worldPresentation: WorldPresentation
  ) {}

  onEntityCreated(entity: LuaEntity, stage: StageNumber, byPlayer: PlayerIndex | nil): UndoAction | nil { ... }
  onEntityDeleted(entity: LuaEntity, stage: StageNumber, byPlayer: PlayerIndex | nil): void { ... }
}
```

#### 3. ProjectUpdates Class

**File**: `src/project/ProjectUpdates.ts` (restructure existing)

```typescript
@RegisterClass("ProjectUpdates")
export class ProjectUpdates {
  constructor(
    private readonly project: Project,
    private readonly worldPresentation: WorldPresentation
  ) {}

  addNewEntity(entity: LuaEntity, stage: StageNumber, ...): ProjectEntity | nil { ... }
  tryUpdateEntityFromWorld(entity: ProjectEntity, stage: StageNumber, ...): EntityUpdateResult { ... }
}
```

#### 4. Update UserProject with Eager Loading and DI

**File**: `src/project/UserProject.ts`

Replace LazyLoadClass usage (lines 95-97, 402-410) with direct eager instantiation:

```typescript
readonly worldPresentation: WorldPresentation
readonly updates: ProjectUpdates
readonly actions: UserActions

constructor(...) {
  this.worldPresentation = new WorldPresentation(this)
  this.updates = new ProjectUpdates(this, this.worldPresentation)
  this.actions = new UserActions(this, this.updates, this.worldPresentation)
}
```

#### 5. Update Project Interface

**File**: `src/project/ProjectDef.d.ts`

Replace `worldUpdates: WorldUpdates` with `worldPresentation: WorldPresentation`. Update all call sites.

#### 6. Delete LazyLoadClass

**File**: `src/lib/LazyLoad.ts`

Delete after all usages are removed.

### Success Criteria

#### Automated Verification

- [ ] `npm test && npm run lint`
- [ ] No `WorldUpdates` or `EntityHighlights` factory functions exist
- [ ] `LazyLoadClass` is deleted

#### Manual Verification

- [ ] Create project, add entities, verify world entities and highlights appear
- [ ] Save and reload game, verify project state persists

---

## Phase 2: Extract Entity Storage with Unified Type-Parameterized Pattern

### Overview

Move world entity storage (`this[stage] = LuaEntity`) and presentation entity storage (`stageProperties`) from ProjectEntity into a unified storage structure owned by WorldPresentation. Design the storage so world entities are just another "type" alongside highlights, using a type parameter approach.

### Changes Required

#### 1. Create Generic EntityStorage Class

**File**: `src/project/EntityStorage.ts` (new file)

```typescript
@RegisterClass("EntityStorage")
export class EntityStorage<T extends Record<string, unknown>> {
  private readonly data = new LuaMap<
    ProjectEntity,
    LuaMap<keyof T & string, LuaMap<StageNumber, T[keyof T]>>
  >()

  get<K extends keyof T & string>(
    entity: ProjectEntity,
    type: K,
    stage: StageNumber
  ): T[K] | nil {
    const byType = this.data.get(entity)
    if (!byType) return nil
    const byStage = byType.get(type)
    if (!byStage) return nil
    const value = byStage.get(stage)
    if (value && typeof value == "object" && "valid" in value && !value.valid) {
      byStage.delete(stage)
      this.cleanupEmpty(entity, type, byType, byStage)
      return nil
    }
    return value as T[K]
  }

  set<K extends keyof T & string>(
    entity: ProjectEntity,
    type: K,
    stage: StageNumber,
    value: T[K] | nil
  ): void {
    if (value == nil) {
      this.delete(entity, type, stage)
      return
    }

    let byType = this.data.get(entity)
    if (!byType) {
      byType = new LuaMap()
      this.data.set(entity, byType)
    }

    let byStage = byType.get(type)
    if (!byStage) {
      byStage = new LuaMap()
      byType.set(type, byStage)
    }

    const existing = byStage.get(stage)
    if (existing && existing != value && typeof existing == "object" && "valid" in existing) {
      if (existing.valid) {
        if ("destroy" in existing) existing.destroy()
      }
    }

    byStage.set(stage, value)
  }

  delete<K extends keyof T & string>(
    entity: ProjectEntity,
    type: K,
    stage: StageNumber
  ): void {
    const byType = this.data.get(entity)
    if (!byType) return
    const byStage = byType.get(type)
    if (!byStage) return

    const existing = byStage.get(stage)
    if (existing && typeof existing == "object" && "valid" in existing && existing.valid) {
      if ("destroy" in existing) existing.destroy()
    }

    byStage.delete(stage)
    this.cleanupEmpty(entity, type, byType, byStage)
  }

  deleteAllOfType<K extends keyof T & string>(entity: ProjectEntity, type: K): void {
    const byType = this.data.get(entity)
    if (!byType) return
    const byStage = byType.get(type)
    if (!byStage) return

    for (const [, value] of byStage) {
      if (value && typeof value == "object" && "valid" in value && value.valid) {
        if ("destroy" in value) value.destroy()
      }
    }

    byType.delete(type)
    if (next(byType)[0] == nil) {
      this.data.delete(entity)
    }
  }

  deleteAllForEntity(entity: ProjectEntity): void {
    const byType = this.data.get(entity)
    if (!byType) return

    for (const [, byStage] of byType) {
      for (const [, value] of byStage) {
        if (value && typeof value == "object" && "valid" in value && value.valid) {
          if ("destroy" in value) value.destroy()
        }
      }
    }

    this.data.delete(entity)
  }

  iterateType<K extends keyof T & string>(
    entity: ProjectEntity,
    type: K
  ): LuaIterable<LuaMultiReturn<[StageNumber, NonNullable<T[K]>]>> { ... }

  hasInRange<K extends keyof T & string>(
    entity: ProjectEntity,
    type: K,
    start: StageNumber,
    end: StageNumber
  ): boolean { ... }

  /** Shift all stage keys up by 1 starting from fromStage (for stage insertion) */
  shiftStageKeysUp(entity: ProjectEntity, fromStage: StageNumber): void {
    const byType = this.data.get(entity)
    if (!byType) return
    for (const [, byStage] of byType) {
      shiftNumberKeysUp(byStage, fromStage)
    }
  }

  /** Shift all stage keys down by 1 starting from fromStage (for stage deletion) */
  shiftStageKeysDown(entity: ProjectEntity, fromStage: StageNumber): void {
    const byType = this.data.get(entity)
    if (!byType) return
    for (const [, byStage] of byType) {
      shiftNumberKeysDown(byStage, fromStage)
    }
  }

  private cleanupEmpty(
    entity: ProjectEntity,
    type: keyof T & string,
    byType: LuaMap<keyof T & string, LuaMap<StageNumber, unknown>>,
    byStage: LuaMap<StageNumber, unknown>
  ): void {
    if (next(byStage)[0] == nil) {
      byType.delete(type)
      if (next(byType)[0] == nil) {
        this.data.delete(entity)
      }
    }
  }
}
```

#### 2. Define Storage Types in WorldPresentation

**File**: `src/project/WorldPresentation.ts`

```typescript
export interface WorldEntityTypes {
  worldEntity: LuaEntity
  errorOutline: HighlightBoxEntity
  errorElsewhereIndicator: LuaRenderObject
  settingsRemnantHighlight: HighlightBoxEntity
  configChangedHighlight: HighlightBoxEntity
  configChangedLaterHighlight: LuaRenderObject
  stageDeleteHighlight: LuaRenderObject
  itemRequestHighlight: LuaRenderObject
  itemRequestHighlightOverlay: LuaRenderObject
}

type HighlightType = Exclude<keyof WorldEntityTypes, "worldEntity">

@RegisterClass("WorldPresentation")
export class WorldPresentation {
  private readonly project: Project
  readonly entityStorage: EntityStorage<WorldEntityTypes>

  constructor(project: Project) {
    this.project = project
    this.entityStorage = new EntityStorage<WorldEntityTypes>()
  }

  getWorldOrPreviewEntity(entity: ProjectEntity, stage: StageNumber): LuaEntity | nil {
    return this.entityStorage.get(entity, "worldEntity", stage)
  }

  getWorldEntity(entity: ProjectEntity, stage: StageNumber): LuaEntity | nil {
    const luaEntity = this.getWorldOrPreviewEntity(entity, stage)
    if (luaEntity && isPreviewEntity(luaEntity)) return nil
    return luaEntity
  }

  replaceWorldOrPreviewEntity(entity: ProjectEntity, stage: StageNumber, luaEntity: LuaEntity | nil): void {
    const existing = this.entityStorage.get(entity, "worldEntity", stage)
    if (existing && existing.valid && existing != luaEntity) {
      raise_script_destroy({ entity: existing })
    }
    this.entityStorage.set(entity, "worldEntity", stage, luaEntity)
    if (luaEntity && movableTypes.has(luaEntity.type)) {
      registerEntity(luaEntity, entity)
    }
  }

  getHighlight<K extends HighlightType>(entity: ProjectEntity, type: K, stage: StageNumber): WorldEntityTypes[K] | nil {
    return this.entityStorage.get(entity, type, stage)
  }

  setHighlight<K extends HighlightType>(
    entity: ProjectEntity,
    type: K,
    stage: StageNumber,
    value: WorldEntityTypes[K] | nil,
  ): void {
    this.entityStorage.set(entity, type, stage, value)
  }

  /** Called by UserProject when a stage is inserted. Shifts all entity storage keys. */
  onStageInserted(content: ProjectContent, fromStage: StageNumber): void {
    for (const entity of content.allEntities()) {
      this.entityStorage.shiftStageKeysUp(entity, fromStage)
    }
  }

  /** Called by UserProject when a stage is deleted. Shifts all entity storage keys. */
  onStageDeleted(content: ProjectContent, fromStage: StageNumber): void {
    for (const entity of content.allEntities()) {
      this.entityStorage.shiftStageKeysDown(entity, fromStage)
    }
  }
}
```

#### 3. Remove World Entity Methods from ProjectEntity

**File**: `src/entity/ProjectEntity.ts`

Remove these methods and the numeric index signature:

- `[stage: StageNumber]: LuaEntity | nil` (line 224)
- `getWorldOrPreviewEntity()` (lines 590-596)
- `getWorldEntity()` (lines 598-601)
- `replaceWorldEntity()` (lines 603-606)
- `replaceWorldOrPreviewEntity()` (lines 607-617)
- `destroyWorldOrPreviewEntity()` (lines 619-626)
- `destroyAllWorldOrPreviewEntities()` (lines 628-638)
- `hasWorldEntityInRange()` (lines 640-650)
- `iterateWorldOrPreviewEntities()` (lines 705-717)
- `hasErrorAt()` (line 271) - moves to WorldPresentation

Remove extra entity methods:

- `getExtraEntity()` (lines 653-663)
- `replaceExtraEntity()` (lines 664-671)
- `destroyExtraEntity()` (lines 672-686)
- `destroyAllExtraEntities()` (lines 688-698)
- `hasAnyExtraEntities()` (lines 700-703)

Remove `stageProperties` field for extra entities (keep for `unstagedValue`).

#### 3a. Move hasErrorAt to WorldPresentation

`hasErrorAt()` (src/entity/ProjectEntity.ts:271-279) depends on `getWorldEntity()` and must move to WorldPresentation:

```typescript
hasErrorAt(entity: ProjectEntity, stage: StageNumber): boolean {
  if (!entity.isInStage(stage)) return false
  const worldEntity = this.getWorldEntity(entity, stage)
  return (
    worldEntity == nil ||
    (worldEntity.type == "underground-belt" &&
      worldEntity.belt_to_ground_type != (entity.firstValue as UndergroundBeltEntity).type)
  )
}
```

Update call sites in `entity-highlights.ts` (lines 238, 247).

#### 4. Update All Call Sites

Files that need updating:

- `src/project/user-actions.ts` - use `worldPresentation.replaceWorldOrPreviewEntity()`
- `src/ui/opened-entity.tsx` - use `project.worldPresentation.getWorldOrPreviewEntity()`
- `src/blueprints/blueprint-creation.ts` - use `project.worldPresentation.getWorldOrPreviewEntity()`
- Test files: updates follow from interface changes (compiler errors guide refactoring)

### Success Criteria

#### Automated Verification

- [ ] `npm test && npm run lint`

#### Manual Verification

- [ ] Existing projects load correctly after migration
- [ ] World entities and highlights display correctly
- [ ] Save/reload preserves all entity state

---

## Phase 3: Public/Internal ProjectEntity Interfaces

### Overview

Create separate interfaces for ProjectEntity - a public read-only interface for general use and an internal interface for the content module that includes all mutation methods. This enables enforcing that ALL mutations go through `MutableProjectContent`.

**Key principle**: External code receives only `ProjectEntity` (read-only). Only `MutableProjectContent` can access `InternalProjectEntity` for mutations.

### Changes Required

#### 1. Define Public Interface

**File**: `src/entity/ProjectEntity.ts`

```typescript
/** Public read-only interface - this is what external code sees */
export interface ProjectEntity<T extends Entity = Entity> extends StagedValue<T, StageDiff<T>> {
  readonly position: MapPosition
  readonly direction: defines.direction
  readonly firstStage: StageNumber
  readonly lastStage: StageNumber | nil
  readonly isSettingsRemnant: true | nil
  readonly wireConnections: ReadonlyLuaMap<ProjectEntity, ReadonlyLuaSet<ProjectWireConnection>> | nil

  // Read-only query methods
  getValueAtStage(stage: StageNumber): T
  getPropAtStage<K extends keyof T>(stage: StageNumber, prop: K): LuaMultiReturn<[T[K], StageNumber]>
  getUpgradeAtStage(stage: StageNumber): NameAndQuality
  getUnstagedValue(stage: StageNumber): UnstagedEntityProps | nil
  isInStage(stage: StageNumber): boolean
  isPastLastStage(stage: StageNumber): boolean
  hasChangesInStage(stage: StageNumber): boolean
  hasStageDiff(): boolean
  getFirstStageDiffForProp<K extends keyof T>(prop: K): LuaMultiReturn<[] | [StageNumber | nil, T[K]]>

  // Type guards
  isUndergroundBelt(): this is UndergroundBeltProjectEntity
  isInserter(): this is InserterProjectEntity
  isMovable(): this is MovableProjectEntity
  isPersistent(): boolean
  isTrain(): this is TrainProjectEntity
  getType(): EntityType | nil
}
```

#### 2. Define Internal Interface

**File**: `src/entity/ProjectEntity.ts`

```typescript
/** Internal interface - only accessible within content module */
export interface InternalProjectEntity<T extends Entity = Entity> extends ProjectEntity<T> {
  // Mutable fields (write access)
  position: MapPosition
  direction: defines.direction
  isSettingsRemnant: true | nil

  // Stage mutation
  setFirstStageUnchecked(stage: StageNumber): void
  setLastStageUnchecked(stage: StageNumber | nil): void

  // Value mutation
  adjustValueAtStage(stage: StageNumber, value: T): boolean
  setPropAtStage<K extends keyof T>(stage: StageNumber, prop: K, value: T[K]): boolean
  applyUpgradeAtStage(stage: StageNumber, newValue: NameAndQuality): boolean
  resetValue(stage: StageNumber): boolean
  resetProp<K extends keyof T>(stage: StageNumber, prop: K): boolean
  moveValueDown(stage: StageNumber): StageNumber | nil
  movePropDown<K extends keyof T>(stage: StageNumber, prop: K): StageNumber | nil

  // Unstaged values
  setUnstagedValue(stage: StageNumber, value: UnstagedEntityProps | nil): boolean
  clearPropertyInAllStages(prop: string): void

  // Direct setters (for import)
  setFirstValueDirectly(value: T): void
  setStageDiffsDirectly(stageDiffs: StageDiffs | nil): void

  // Wire connections (internal)
  addOneWayWireConnection(connection: ProjectWireConnection): boolean
  removeOneWayWireConnection(connection: ProjectWireConnection): void
  syncIngoingConnections(existing: ReadonlyLuaSet<ProjectEntity>): void
  removeIngoingConnections(): void
}

/** Underground belt internal interface */
export interface InternalUndergroundBeltProjectEntity
  extends InternalProjectEntity<UndergroundBeltEntity>,
    UndergroundBeltProjectEntity {
  setTypeProperty(type: "input" | "output"): void
}

/** Inserter internal interface */
export interface InternalInserterProjectEntity extends InternalProjectEntity<InserterEntity>, InserterProjectEntity {
  setDropPosition(position: Position | nil): void
  setPickupPosition(position: Position | nil): void
}
```

#### 3. Update ProjectContentImpl

**File**: `src/entity/ProjectContent.ts`

ProjectContentImpl stores `LuaSet<InternalProjectEntity>` internally but returns `ProjectEntity` from public methods:

```typescript
@RegisterClass("EntityMap")
class ProjectContentImpl implements MutableProjectContent {
  private readonly entities = new LuaSet<InternalProjectEntity>()

  allEntities(): LuaIterable<ProjectEntity> {
    return this.entities as unknown as LuaIterable<ProjectEntity>
  }

  // Internal helper to cast
  private asInternal(entity: ProjectEntity): InternalProjectEntity {
    return entity as InternalProjectEntity
  }
}
```

#### 4. Update newProjectEntity Factory

```typescript
export function newProjectEntity<T extends Entity>(
  value: T,
  position: Position,
  direction: defines.direction,
  stage: StageNumber,
  unstagedValue?: UnstagedEntityProps,
): InternalProjectEntity<T> {
  // Returns InternalProjectEntity for use within content module
  const entity = new ProjectEntityImpl(stage, value, position, direction)
  if (unstagedValue) entity.setUnstagedValue(stage, unstagedValue)
  return entity
}
```

### Success Criteria

#### Automated Verification

- [ ] `npm test`
- [ ] External code cannot call internal methods without casting
- [ ] `InternalProjectEntity` includes all mutation methods

#### Manual Verification

- [ ] Existing functionality works unchanged

---

## Phase 4: Comprehensive ContentObserver and MutableProjectContent API

### Overview

Add a comprehensive observer interface and mutation API to `MutableProjectContent`. **All mutations** to `ProjectEntity` or `ProjectContent` must go through `MutableProjectContent`, which notifies the `ContentObserver`. This is the core of the separation of concerns.

WorldPresentation methods fall into two categories:

- **Reactions to content mutations** (via ContentObserver): world entity creation/update/deletion, highlights, wires, settings remnant transitions, tiles
- **Commands** (remain directly callable): `rebuildStage()`, `rebuildAllStages()`, `refreshWorldEntityAtStage()`

### Changes Required

#### 1. Define ContentObserver Interface

**File**: `src/entity/ContentObserver.ts` (new file)

```typescript
import { ProjectEntity, StageNumber, MapPosition, ProjectWireConnection } from "./ProjectEntity"

export interface ContentObserver {
  // === Structural changes ===
  onEntityAdded(entity: ProjectEntity, stage: StageNumber): void
  onEntityDeleted(entity: ProjectEntity): void
  onEntityPositionChanged(entity: ProjectEntity, oldPosition: MapPosition): void

  // === Stage changes ===
  onEntityFirstStageChanged(entity: ProjectEntity, oldStage: StageNumber): void
  onEntityLastStageChanged(entity: ProjectEntity, oldStage: StageNumber | nil): void

  // === Value changes ===
  /** Called when entity value/props change at a stage. WorldPresentation updates from this stage. */
  onEntityValueChanged(entity: ProjectEntity, stage: StageNumber): void
  /** Called when entity direction changes (always affects from firstStage). */
  onEntityDirectionChanged(entity: ProjectEntity): void

  // === Settings remnant ===
  onEntityBecameSettingsRemnant(entity: ProjectEntity): void
  onEntityRevivedFromSettingsRemnant(entity: ProjectEntity, newFirstStage: StageNumber): void

  // === Wire connections ===
  onWireConnectionsChanged(entity: ProjectEntity): void

  // === Tiles ===
  onTileChanged(position: MapPosition, stage: StageNumber): void
  onTileDeleted(position: MapPosition): void

  // === Batch control (for multi-entity coordination like underground belts) ===
  beginBatch?(): void
  endBatch?(): void
}
```

#### 2. Comprehensive MutableProjectContent API

**File**: `src/entity/ProjectContent.ts`

```typescript
export interface MutableProjectContent extends ProjectContent {
  setObserver(observer: ContentObserver | nil): void

  // === Entity lifecycle ===
  addEntity(entity: InternalProjectEntity): void
  deleteEntity(entity: ProjectEntity): void

  // === Entity position ===
  /** Returns false if position is blocked */
  changeEntityPosition(entity: ProjectEntity, position: Position): boolean

  // === Entity stages ===
  setEntityFirstStage(entity: ProjectEntity, stage: StageNumber): void
  setEntityLastStage(entity: ProjectEntity, stage: StageNumber | nil): void

  // === Entity value mutations ===
  /** Adjusts value at stage. Returns true if changed. */
  adjustEntityValue(entity: ProjectEntity, stage: StageNumber, value: EntityValue): boolean
  /** Sets a single prop at stage. Returns true if changed. */
  setEntityProp<T extends Entity, K extends keyof T>(
    entity: ProjectEntity<T>,
    stage: StageNumber,
    prop: K,
    value: T[K],
  ): boolean
  /** Applies upgrade (name/quality change). Returns true if changed. */
  applyEntityUpgrade(entity: ProjectEntity, stage: StageNumber, upgrade: NameAndQuality): boolean
  /** Resets all props at stage. Returns true if there were diffs. */
  resetEntityValue(entity: ProjectEntity, stage: StageNumber): boolean
  /** Resets single prop at stage. Returns true if changed. */
  resetEntityProp<T extends Entity, K extends keyof T>(entity: ProjectEntity<T>, stage: StageNumber, prop: K): boolean
  /** Moves all props down to previous applicable stage. Returns target stage or nil. */
  moveEntityValueDown(entity: ProjectEntity, stage: StageNumber): StageNumber | nil
  /** Moves single prop down. Returns target stage or nil. */
  moveEntityPropDown<T extends Entity, K extends keyof T>(
    entity: ProjectEntity<T>,
    stage: StageNumber,
    prop: K,
  ): StageNumber | nil

  // === Entity direction ===
  setEntityDirection(entity: ProjectEntity, direction: defines.direction): void

  // === Unstaged values ===
  setEntityUnstagedValue(entity: ProjectEntity, stage: StageNumber, value: UnstagedEntityProps | nil): boolean
  clearEntityUnstagedValues(entity: ProjectEntity): void

  // === Settings remnant ===
  makeEntitySettingsRemnant(entity: ProjectEntity): void
  reviveEntityFromSettingsRemnant(entity: ProjectEntity, newFirstStage: StageNumber): void

  // === Underground belt specific ===
  setUndergroundBeltType(entity: UndergroundBeltProjectEntity, type: "input" | "output"): void

  // === Inserter specific ===
  setInserterPositions(entity: InserterProjectEntity, pickup: Position | nil, drop: Position | nil): void

  // === Wire connections ===
  addWireConnection(connection: ProjectWireConnection): void
  removeWireConnection(connection: ProjectWireConnection): void

  // === Bulk operations (for import/staged info) ===
  setEntityValueDirectly(entity: ProjectEntity, firstValue: EntityValue, stageDiffs: StageDiffs | nil): void

  // === Tiles ===
  setTileValue(position: Position, stage: StageNumber, value: string | nil): void

  // === Batch control ===
  beginBatch(): void
  endBatch(): void
}
```

#### 3. Implement ProjectContentImpl Methods

**File**: `src/entity/ProjectContent.ts`

```typescript
@RegisterClass("EntityMap")
class ProjectContentImpl implements MutableProjectContent {
  private observer: ContentObserver | nil = nil

  setObserver(observer: ContentObserver | nil): void {
    this.observer = observer
  }

  private asInternal(entity: ProjectEntity): InternalProjectEntity {
    return entity as InternalProjectEntity
  }

  addEntity(entity: InternalProjectEntity): void {
    if (this.entities.has(entity)) return
    this.entities.add(entity)
    this.addToSpatialIndex(entity)
    this.observer?.onEntityAdded(entity, entity.firstStage)
  }

  deleteEntity(entity: ProjectEntity): void {
    const internal = this.asInternal(entity)
    if (!this.entities.has(internal)) return
    internal.removeIngoingConnections()
    this.removeFromSpatialIndex(entity)
    this.entities.delete(internal)
    this.observer?.onEntityDeleted(entity)
  }

  changeEntityPosition(entity: ProjectEntity, position: Position): boolean {
    const internal = this.asInternal(entity)
    const oldPosition = entity.position
    if (Pos.equals(oldPosition, position)) return true
    // validation logic...
    this.removeFromSpatialIndex(entity)
    internal.position = position
    this.addToSpatialIndex(entity)
    this.observer?.onEntityPositionChanged(entity, oldPosition)
    return true
  }

  setEntityFirstStage(entity: ProjectEntity, stage: StageNumber): void {
    const internal = this.asInternal(entity)
    const oldStage = entity.firstStage
    internal.setFirstStageUnchecked(stage)
    this.observer?.onEntityFirstStageChanged(entity, oldStage)
  }

  setEntityLastStage(entity: ProjectEntity, stage: StageNumber | nil): void {
    const internal = this.asInternal(entity)
    const oldStage = entity.lastStage
    internal.setLastStageUnchecked(stage)
    this.observer?.onEntityLastStageChanged(entity, oldStage)
  }

  adjustEntityValue(entity: ProjectEntity, stage: StageNumber, value: EntityValue): boolean {
    const internal = this.asInternal(entity)
    const changed = internal.adjustValueAtStage(stage, value)
    if (changed) {
      this.observer?.onEntityValueChanged(entity, stage)
    }
    return changed
  }

  setEntityProp<T extends Entity, K extends keyof T>(
    entity: ProjectEntity<T>,
    stage: StageNumber,
    prop: K,
    value: T[K],
  ): boolean {
    const internal = this.asInternal(entity) as InternalProjectEntity<T>
    const changed = internal.setPropAtStage(stage, prop, value)
    if (changed) {
      this.observer?.onEntityValueChanged(entity, stage)
    }
    return changed
  }

  applyEntityUpgrade(entity: ProjectEntity, stage: StageNumber, upgrade: NameAndQuality): boolean {
    const internal = this.asInternal(entity)
    const changed = internal.applyUpgradeAtStage(stage, upgrade)
    if (changed) {
      this.observer?.onEntityValueChanged(entity, stage)
    }
    return changed
  }

  resetEntityValue(entity: ProjectEntity, stage: StageNumber): boolean {
    const internal = this.asInternal(entity)
    const changed = internal.resetValue(stage)
    if (changed) {
      this.observer?.onEntityValueChanged(entity, stage)
    }
    return changed
  }

  resetEntityProp<T extends Entity, K extends keyof T>(entity: ProjectEntity<T>, stage: StageNumber, prop: K): boolean {
    const internal = this.asInternal(entity) as InternalProjectEntity<T>
    const changed = internal.resetProp(stage, prop)
    if (changed) {
      this.observer?.onEntityValueChanged(entity, stage)
    }
    return changed
  }

  moveEntityValueDown(entity: ProjectEntity, stage: StageNumber): StageNumber | nil {
    const internal = this.asInternal(entity)
    const targetStage = internal.moveValueDown(stage)
    if (targetStage) {
      this.observer?.onEntityValueChanged(entity, targetStage)
    }
    return targetStage
  }

  moveEntityPropDown<T extends Entity, K extends keyof T>(
    entity: ProjectEntity<T>,
    stage: StageNumber,
    prop: K,
  ): StageNumber | nil {
    const internal = this.asInternal(entity) as InternalProjectEntity<T>
    const targetStage = internal.movePropDown(stage, prop)
    if (targetStage) {
      this.observer?.onEntityValueChanged(entity, targetStage)
    }
    return targetStage
  }

  setEntityDirection(entity: ProjectEntity, direction: defines.direction): void {
    const internal = this.asInternal(entity)
    if (internal.direction == direction) return
    internal.direction = direction
    this.observer?.onEntityDirectionChanged(entity)
  }

  setEntityUnstagedValue(entity: ProjectEntity, stage: StageNumber, value: UnstagedEntityProps | nil): boolean {
    const internal = this.asInternal(entity)
    return internal.setUnstagedValue(stage, value)
    // Unstaged values don't affect world entities, no observer notification
  }

  clearEntityUnstagedValues(entity: ProjectEntity): void {
    const internal = this.asInternal(entity)
    internal.clearPropertyInAllStages("unstagedValue")
  }

  makeEntitySettingsRemnant(entity: ProjectEntity): void {
    const internal = this.asInternal(entity)
    internal.isSettingsRemnant = true
    this.observer?.onEntityBecameSettingsRemnant(entity)
  }

  reviveEntityFromSettingsRemnant(entity: ProjectEntity, newFirstStage: StageNumber): void {
    const internal = this.asInternal(entity)
    internal.setFirstStageUnchecked(newFirstStage)
    internal.isSettingsRemnant = nil
    this.observer?.onEntityRevivedFromSettingsRemnant(entity, newFirstStage)
  }

  setUndergroundBeltType(entity: UndergroundBeltProjectEntity, type: "input" | "output"): void {
    const internal = entity as InternalUndergroundBeltProjectEntity
    internal.setTypeProperty(type)
    this.observer?.onEntityValueChanged(entity, entity.firstStage)
  }

  setInserterPositions(entity: InserterProjectEntity, pickup: Position | nil, drop: Position | nil): void {
    const internal = entity as InternalInserterProjectEntity
    if (pickup !== undefined) internal.setPickupPosition(pickup)
    if (drop !== undefined) internal.setDropPosition(drop)
    this.observer?.onEntityValueChanged(entity, entity.firstStage)
  }

  addWireConnection(connection: ProjectWireConnection): void {
    const { fromEntity, toEntity } = connection
    const fromInternal = this.asInternal(fromEntity)
    const toInternal = this.asInternal(toEntity)
    fromInternal.addOneWayWireConnection(connection)
    toInternal.addOneWayWireConnection(connection)
    this.observer?.onWireConnectionsChanged(fromEntity)
    if (fromEntity != toEntity) {
      this.observer?.onWireConnectionsChanged(toEntity)
    }
  }

  removeWireConnection(connection: ProjectWireConnection): void {
    const { fromEntity, toEntity } = connection
    const fromInternal = this.asInternal(fromEntity)
    const toInternal = this.asInternal(toEntity)
    fromInternal.removeOneWayWireConnection(connection)
    toInternal.removeOneWayWireConnection(connection)
    this.observer?.onWireConnectionsChanged(fromEntity)
    if (fromEntity != toEntity) {
      this.observer?.onWireConnectionsChanged(toEntity)
    }
  }

  setEntityValueDirectly(entity: ProjectEntity, firstValue: EntityValue, stageDiffs: StageDiffs | nil): void {
    const internal = this.asInternal(entity)
    internal.setFirstValueDirectly(firstValue)
    internal.setStageDiffsDirectly(stageDiffs)
    this.observer?.onEntityValueChanged(entity, entity.firstStage)
  }

  beginBatch(): void {
    this.observer?.beginBatch?.()
  }

  endBatch(): void {
    this.observer?.endBatch?.()
  }
}
```

#### 4. WorldPresentation Implements ContentObserver with Batch Support

**File**: `src/project/WorldPresentation.ts`

```typescript
@RegisterClass("WorldPresentation")
export class WorldPresentation implements ContentObserver, ProjectLifecycleObserver {
  private batchDepth = 0
  private pendingValueUpdates = new LuaMap<ProjectEntity, StageNumber>()
  private pendingHighlightUpdates = new LuaSet<ProjectEntity>()

  constructor(
    readonly stagePresentation: StagePresentation,
    readonly surfaces: SurfaceProvider,
    readonly entityBehavior: EntityBehaviorSettings,
    readonly content: MutableProjectContent,
  ) {
    content.setObserver(this)
  }

  // === Batch control ===
  beginBatch(): void {
    this.batchDepth++
  }

  endBatch(): void {
    this.batchDepth--
    if (this.batchDepth == 0) {
      this.flushPendingUpdates()
    }
  }

  private flushPendingUpdates(): void {
    // Update all world entities first (without highlights)
    for (const [entity, fromStage] of this.pendingValueUpdates) {
      this.updateWorldEntitiesInternal(entity, fromStage, false)
    }
    // Then update all highlights together
    for (const entity of this.pendingHighlightUpdates) {
      this.updateAllHighlights(entity)
    }
    for (const [entity] of this.pendingValueUpdates) {
      this.updateAllHighlights(entity)
    }
    this.pendingValueUpdates = new LuaMap()
    this.pendingHighlightUpdates = new LuaSet()
  }

  private queueOrExecuteValueUpdate(entity: ProjectEntity, fromStage: StageNumber): void {
    if (this.batchDepth > 0) {
      const existing = this.pendingValueUpdates.get(entity)
      if (existing == nil || fromStage < existing) {
        this.pendingValueUpdates.set(entity, fromStage)
      }
    } else {
      this.updateWorldEntities(entity, fromStage)
    }
  }

  private queueOrExecuteHighlightUpdate(entity: ProjectEntity): void {
    if (this.batchDepth > 0) {
      this.pendingHighlightUpdates.add(entity)
    } else {
      this.updateAllHighlights(entity)
    }
  }

  // === ContentObserver implementation ===
  onEntityAdded(entity: ProjectEntity, stage: StageNumber): void {
    this.createWorldEntitiesWithoutWires(entity)
    this.queueOrExecuteHighlightUpdate(entity)
  }

  onEntityDeleted(entity: ProjectEntity): void {
    this.destroyAllWorldEntities(entity)
    this.entityStorage.deleteAllForEntity(entity)
  }

  onEntityPositionChanged(entity: ProjectEntity, oldPosition: MapPosition): void {
    this.rebuildWorldEntitiesForEntity(entity)
  }

  onEntityFirstStageChanged(entity: ProjectEntity, oldStage: StageNumber): void {
    this.updateWorldEntitiesOnFirstStageChanged(entity, oldStage)
    this.queueOrExecuteHighlightUpdate(entity)
  }

  onEntityLastStageChanged(entity: ProjectEntity, oldStage: StageNumber | nil): void {
    this.updateWorldEntitiesOnLastStageChanged(entity, oldStage)
    this.queueOrExecuteHighlightUpdate(entity)
  }

  onEntityValueChanged(entity: ProjectEntity, stage: StageNumber): void {
    this.queueOrExecuteValueUpdate(entity, stage)
  }

  onEntityDirectionChanged(entity: ProjectEntity): void {
    this.queueOrExecuteValueUpdate(entity, entity.firstStage)
  }

  onEntityBecameSettingsRemnant(entity: ProjectEntity): void {
    this.destroyAllWorldEntities(entity)
    this.createPreviewEntitiesForSettingsRemnant(entity)
    this.createSettingsRemnantHighlights(entity)
  }

  onEntityRevivedFromSettingsRemnant(entity: ProjectEntity, newFirstStage: StageNumber): void {
    this.rebuildWorldEntitiesForEntity(entity)
    this.queueOrExecuteHighlightUpdate(entity)
  }

  onWireConnectionsChanged(entity: ProjectEntity): void {
    this.updateWireConnectionsForEntity(entity)
    this.queueOrExecuteHighlightUpdate(entity)
  }

  onTileChanged(position: MapPosition, stage: StageNumber): void {
    this.updateTilesFromStage(position, stage)
  }

  onTileDeleted(position: MapPosition): void {
    this.updateTilesFromStage(position, 1)
  }

  // === Commands (directly callable) ===
  rebuildStage(stage: StageNumber): void { ... }
  rebuildAllStages(): void { ... }
  refreshWorldEntityAtStage(entity: ProjectEntity, stage: StageNumber): void { ... }
  refreshAllWorldEntities(entity: ProjectEntity): void { ... }
  clearWorldEntityAtStage(entity: ProjectEntity, stage: StageNumber): void { ... }

  /** Called by UserProject.create() for space platform projects (one-time init) */
  initSpacePlatform(): void {
    // Rebuild all space-platform-hub entities
    for (const stage of this.surfaces.getAllStages()) {
      for (const hub of stage.surface.find_entities_filtered({ type: "space-platform-hub" })) {
        this.rebuildEntity(hub, stage.stageNumber)
      }
    }
    // Import existing space-platform-foundation tiles
    const firstSurface = this.surfaces.getSurface(1)
    const tiles = firstSurface.find_tiles_filtered({ name: "space-platform-foundation" })
    for (const tile of tiles) {
      this.content.setTileValue(tile.position, 1, tile.name)
    }
  }
}
```

#### 5. Example: Underground Belt Pair Coordination

**File**: `src/project/UserActions.ts`

Callers use batch mode for coordinated multi-entity updates:

```typescript
function rotateUndergroundBeltPair(
  content: MutableProjectContent,
  entity: UndergroundBeltProjectEntity,
  pair: UndergroundBeltProjectEntity | nil,
  newDirection: defines.direction,
): void {
  content.beginBatch()

  content.setEntityDirection(entity, newDirection)
  const oldType = entity.firstValue.type
  content.setUndergroundBeltType(entity, oldType == "input" ? "output" : "input")

  if (pair) {
    content.setEntityDirection(pair, newDirection)
    content.setUndergroundBeltType(pair, oldType) // opposite of what entity became
  }

  content.endBatch()
  // WorldPresentation receives events, processes all updates together at endBatch
}
```

### Success Criteria

#### Automated Verification

- [ ] `npm test`
- [ ] All entity mutations go through `MutableProjectContent`
- [ ] No direct mutation of `ProjectEntity` from outside content module

#### Manual Verification

- [ ] Entity add/delete/update triggers world updates via observer
- [ ] Underground belt pair rotation works correctly
- [ ] Rebuild commands work when called directly

---

## Phase 5: Extract StageCount Interface

### Overview

Extract `StageCount` as a first-class interface. Also extract `lastStageFor` as a standalone utility function.

### Changes Required

#### 1. Define StageCount Interface

**File**: `src/project/StageCount.ts` (new file)

```typescript
export interface StageCount {
  stageCount(): StageNumber
}
```

#### 2. Extract lastStageFor as Standalone Util

**File**: `src/entity/stage-util.ts` (new file)

```typescript
import { StagedValue, StageNumber, AnyNotNil } from "./types"

export function lastStageFor(entity: StagedValue<AnyNotNil, AnyNotNil>, stageCount: StageNumber): StageNumber {
  return Math.min(entity.lastStage ?? stageCount, stageCount)
}
```

#### 3. Migrate Components to Use StageCount

Components that only need stage count should take `StageCount`:

```typescript
class WorldPresentation {
  constructor(private readonly stageCount: StageCount, ...) {}
}
```

### Success Criteria

- [ ] `npm test`
- [ ] `StageCount` interface exists with single `stageCount` field
- [ ] `lastStageFor()` is a standalone function

---

## Phase 6: Extract Remaining Settings Interfaces

### Overview

Create role-based interfaces for remaining settings:

- `StagePresentation extends StageCount`
- `EntityBehaviorSettings`
- `ProjectSettingsReader`

### Changes Required

#### 1. Define Settings Interfaces

**File**: `src/project/ProjectSettings.ts` (new file)

```typescript
export interface EntityBehaviorSettings {
  isSpacePlatform(): boolean
  readonly landfillTile: Property<string | nil>
}

export interface StagePresentation extends StageCount {
  getStageName(stage: StageNumber): LocalisedString
  getStageNameProperty(stage: StageNumber): Property<string>
}

export interface ProjectSettingsReader extends EntityBehaviorSettings, StagePresentation {
  readonly projectName: Property<string>
  readonly stagedTilesEnabled: Property<boolean>
  readonly defaultBlueprintSettings: Property<OverrideableBlueprintSettings>
  readonly surfaceSettings: Property<SurfaceSettings>

  getStageSettings(stage: StageNumber): Property<StageSettingsData>
}

export interface ProjectSettingsWriter extends ProjectSettingsReader {
  readonly projectName: MutableProperty<string>
  readonly landfillTile: MutableProperty<string | nil>
  readonly stagedTilesEnabled: MutableProperty<boolean>
  readonly defaultBlueprintSettings: MutableProperty<OverrideableBlueprintSettings>

  getStageNameProperty(stage: StageNumber): MutableProperty<string>
  getStageSettings(stage: StageNumber): MutableProperty<StageSettingsData>

  insertStageSettings(stage: StageNumber, settings: StageSettingsData): void
  removeStageSettings(stage: StageNumber): void
}
```

#### 2. Create ProjectSettings Class

**File**: `src/project/ProjectSettings.ts`

```typescript
export interface ProjectSettingsData {
  projectName: string
  landfillTile: string | nil
  stagedTilesEnabled: boolean
  defaultBlueprintSettings: OverrideableBlueprintSettings
  surfaceSettings: SurfaceSettings
  isSpacePlatform: boolean
  stages: StageSettingsData[]  // 1-indexed
}

export interface StageSettingsData {
  name: string
  blueprintOverrides: BlueprintSettingsOverrideTable
  stageBlueprintSettings: StageBlueprintSettingsTable
}

@RegisterClass("ProjectSettings")
export class ProjectSettings implements ProjectSettingsWriter {
  private _stageCount: StageNumber
  readonly projectName: MutableProperty<string>
  readonly landfillTile: MutableProperty<string | nil>
  readonly stagedTilesEnabled: MutableProperty<boolean>
  readonly defaultBlueprintSettings: MutableProperty<OverrideableBlueprintSettings>
  readonly surfaceSettings: Property<SurfaceSettings>
  private readonly _isSpacePlatform: boolean

  private readonly stages: { name: MutableProperty<string>, settings: MutableProperty<StageSettingsData> }[] = []
  private blueprintBookTemplateInv?: LuaInventory

  constructor(data: ProjectSettingsData, stageCount: StageNumber) {
    this._stageCount = stageCount
    this.projectName = property(data.projectName)
    this.landfillTile = property(data.landfillTile)
    this.stagedTilesEnabled = property(data.stagedTilesEnabled)
    this.defaultBlueprintSettings = property(data.defaultBlueprintSettings)
    this.surfaceSettings = property(data.surfaceSettings)
    this._isSpacePlatform = data.isSpacePlatform

    for (let i = 1; i <= stageCount; i++) {
      const stageData = data.stages[i] ?? { name: `Stage ${i}`, blueprintOverrides: {} }
      this.stages[i] = {
        name: property(stageData.name),
        settings: property(stageData),
      }
    }
  }

  stageCount(): StageNumber { return this._stageCount }
  isSpacePlatform(): boolean { return this._isSpacePlatform }
  getStageName(stage: StageNumber): LocalisedString { return this.stages[stage].name.get() }
  getStageNameProperty(stage: StageNumber): MutableProperty<string> { return this.stages[stage].name }
  getStageSettings(stage: StageNumber): MutableProperty<StageSettingsData> { return this.stages[stage].settings }

  insertStageSettings(stage: StageNumber, settings: StageSettingsData): void {
    for (let i = this._stageCount; i >= stage; i--) this.stages[i + 1] = this.stages[i]
    this.stages[stage] = { name: property(settings.name), settings: property(settings) }
    this._stageCount++
    this.addStageToBlueprintBookTemplate(stage)
  }

  removeStageSettings(stage: StageNumber): void {
    for (let i = stage; i < this._stageCount; i++) this.stages[i] = this.stages[i + 1]
    delete this.stages[this._stageCount]
    this._stageCount--
  }

  generateNewStageName(stageNumber: StageNumber): string {
    const otherStageNum = stageNumber == 1 ? 1 : stageNumber - 1
    const previousName = this.getStageName(otherStageNum) as string
    const [prefix, numStr] = string.match(previousName, "^(.-)(%d+)$")
    const num = tonumber(numStr)

    if (prefix != nil && num != nil) {
      const newNum = num + (stageNumber == 1 ? -1 : 1)
      if (newNum >= 0) {
        const candidateName = prefix + newNum
        const nextName = this.stages[stageNumber]?.name.get()
        if (candidateName != nextName) return candidateName
      }
    }

    if (stageNumber == 1) return "New Stage"
    const sep = string.match(previousName, "^.*%d+([^%d]+)%d+$")[0] ?? (prefix != nil ? "." : " ")
    return previousName + sep + "1"
  }

  getBlueprintBookTemplate(): LuaItemStack | nil {
    if (!this.blueprintBookTemplateInv?.valid) return nil
    const stack = this.blueprintBookTemplateInv[0]
    if (stack.valid_for_read && stack.is_blueprint_book) return stack
    return nil
  }

  getOrCreateBlueprintBookTemplate(): LuaItemStack {
    if (this.blueprintBookTemplateInv == nil) {
      this.blueprintBookTemplateInv = game.create_inventory(1)
    }
    const stack = this.blueprintBookTemplateInv[0]
    if (!stack.valid_for_read || !stack.is_blueprint_book) {
      this.setInitialBlueprintBookTemplate(stack)
    }
    return stack
  }

  resetBlueprintBookTemplate(): void {
    this.blueprintBookTemplateInv?.destroy()
    this.blueprintBookTemplateInv = nil
  }

  private setInitialBlueprintBookTemplate(stack: LuaItemStack): void { ... }
  private addStageToBlueprintBookTemplate(newStage: StageNumber): void { ... }

  destroy(): void {
    this.blueprintBookTemplateInv?.destroy()
  }
}
```

#### 3. Add `settings` Field to Project Interface

**File**: `src/project/ProjectDef.d.ts`

```typescript
export interface Project {
  readonly settings: ProjectSettingsReader
  readonly content: MutableProjectContent
}
```

Update UserProject to expose `settings: ProjectSettings`.

#### 4. Create MockStagePresentation for Tests

**File**: `src/test/project/StagePresentation-mock.ts` (new file)

```typescript
export function createMockStagePresentation(count: number, names?: string[]): StagePresentation {
  return {
    stageCount() { return count },
    getStageName(stage: StageNumber): LocalisedString {
      return names?.[stage - 1] ?? `Stage ${stage}`
    },
    getStageNameProperty(stage: StageNumber): Property<string> {
      return property(names?.[stage - 1] ?? `Stage ${stage}`)
    },
  }
}
```

#### 5. Migrate Code and Tests

Replace `project.numStages()` with `settings.stageCount()`. Components should take the minimal interface they need:

```typescript
class WorldPresentation {
  constructor(
    private readonly stagePresentation: StagePresentation,
    private readonly surfaces: SurfaceProvider,
    private readonly entityBehavior: EntityBehaviorSettings,
    private readonly content: ProjectContent,
  ) {}
}

function StageLabel(presentation: StagePresentation, stage: StageNumber) {
  return presentation.getStageName(stage)
}

function handleTiles(behavior: EntityBehaviorSettings) {
  if (behavior.isSpacePlatform()) { ... }
  const tile = behavior.landfillTile.get()
}
```

**Example test transformation**:

```typescript
let stagePresentation: StagePresentation
let surfaces: SurfaceProvider
let entityBehavior: EntityBehaviorSettings
let content: MutableProjectContent
before_each(() => {
  stagePresentation = createMockStagePresentation(4)
  surfaces = createMockSurfaceProvider(testSurfaces)
  entityBehavior = createMockEntityBehavior({ isSpacePlatform: false })
  content = newProjectContent()
  worldPresentation = new WorldPresentation(stagePresentation, surfaces, entityBehavior, content)
})
```

#### 6. Update Stage to Delegate Name to Settings

**File**: `src/project/UserProject.ts`

```typescript
class StageImpl implements Stage {
  getName(): MutableProperty<string> {
    return this.project.settings.getStageNameProperty(this.stageNumber)
  }
}
```

Remove `name` field from Stage constructor. `registerEvents()` and `onNameChange()` move to ProjectSurfaces.

**File**: `src/project/ProjectSurfaces.ts`

Define combined interface using `StagePresentation`:

```typescript
export interface SurfaceConfig {
  readonly surfaceSettings: Property<SurfaceSettings>
  readonly projectName: Property<string>
}

export interface SurfacesSettingsProvider extends StagePresentation, SurfaceConfig {}

@RegisterClass("ProjectSurfaces")
export class ProjectSurfaces implements SurfaceManager {
  constructor(private readonly settings: SurfacesSettingsProvider) {
    for (let i = 1; i <= settings.stageCount; i++) {
      settings.getStageNameProperty(i).subscribeAndFire((name) => {
        this.updateSurfaceName(i, name)
      })
    }
  }
}
```

This keeps ProjectSettings as pure data with no knowledge of surfaces. ProjectSurfaces owns the surface sync behavior.

### Success Criteria

#### Automated Verification

- [ ] `npm test`
- [ ] `createMockStagePresentation()` exists and is used in tests
- [ ] No `project.getStageName()`, `project.isSpacePlatform`, or `project.stageCount` - all use `project.settings.*`

#### Manual Verification

- [ ] Settings persist correctly
- [ ] Stage insertion/deletion works
- [ ] UI reacts to settings changes

---

## Phase 7: Extract ProjectSurfaces and Add `surfaces` Field

### Overview

Move surface storage and lifecycle management from UserProject into a dedicated `ProjectSurfaces` class.

### Changes Required

#### 1. Define Surface Interfaces

**File**: `src/project/ProjectSurfaces.ts` (new file)

```typescript
export interface SurfaceProvider {
  getSurface(stage: StageNumber): LuaSurface | nil
  getAllSurfaces(): readonly LuaSurface[]
}

export interface SurfaceManager extends SurfaceProvider {
  createSurface(stage: StageNumber, stageName: string, area: BoundingBox | nil): LuaSurface
  deleteSurface(stage: StageNumber): void
  insertSurface(stage: StageNumber, stageName: string, area: BoundingBox | nil): LuaSurface
  updateSurfaceName(stage: StageNumber, stageName: string): void
}
```

#### 2. Create ProjectSurfaces Class

**File**: `src/project/ProjectSurfaces.ts`

```typescript
export interface SurfacesSettingsProvider extends StagePresentation, SurfaceConfig {}

@RegisterClass("ProjectSurfaces")
export class ProjectSurfaces implements SurfaceManager {
  private readonly surfaces: LuaSurface[] = []

  constructor(private readonly settings: SurfacesSettingsProvider) {
    for (let i = 1; i <= settings.stageCount; i++) {
      settings.getStageNameProperty(i).subscribeAndFire((name) => {
        this.updateSurfaceName(i, name)
      })
    }
  }

  getSurface(stage: StageNumber): LuaSurface | nil {
    if (stage < 1 || stage > this.settings.stageCount) return nil
    return this.surfaces[stage]
  }

  getAllSurfaces(): readonly LuaSurface[] {
    return this.surfaces
  }

  createSurface(stage: StageNumber, stageName: string, area: BoundingBox | nil): LuaSurface {
    const surface = createStageSurface(
      this.settings.surfaceSettings.get(),
      this.settings.projectName.get(),
      stageName,
      area,
    )
    this.surfaces[stage] = surface
    registerSurface(surface.index, this, stage)
    return surface
  }

  deleteSurface(stage: StageNumber): void {
    const surface = this.surfaces[stage]
    if (!surface) return
    unregisterSurface(surface.index)
    destroySurface(surface)
    const n = this.settings.stageCount
    for (let i = stage; i < n; i++) {
      this.surfaces[i] = this.surfaces[i + 1]
    }
    delete this.surfaces[n + 1]
  }

  insertSurface(stage: StageNumber, stageName: string, area: BoundingBox | nil): LuaSurface {
    const n = this.settings.stageCount
    for (let i = n; i >= stage; i--) {
      this.surfaces[i + 1] = this.surfaces[i]
    }
    return this.createSurface(stage, stageName, area)
  }

  updateSurfaceName(stage: StageNumber, stageName: string): void {
    const surface = this.surfaces[stage]
    if (surface) {
      updateStageSurfaceName(surface, this.settings.projectName.get(), stageName)
    }
  }
}
```

#### 3. Add `surfaces` Field to Project Interface

**File**: `src/project/ProjectDef.d.ts`

```typescript
export interface Project {
  readonly settings: ProjectSettingsReader
  readonly surfaces: SurfaceProvider
  readonly content: MutableProjectContent
}
```

Update UserProject to expose `surfaces: ProjectSurfaces`.

#### 4. Create MockSurfaceProvider for Tests

**File**: `src/test/project/SurfaceProvider-mock.ts` (new file)

```typescript
export class MockSurfaceProvider implements SurfaceProvider {
  constructor(private readonly surfaces: LuaSurface[]) {}

  getSurface(stage: StageNumber): LuaSurface | nil {
    return this.surfaces[stage - 1]
  }

  getAllSurfaces(): readonly LuaSurface[] {
    return this.surfaces
  }
}

export function createMockSurfaceProvider(surfaces: LuaSurface[]): SurfaceProvider {
  return new MockSurfaceProvider(surfaces)
}
```

#### 5. Migrate Code and Tests to Use `surfaces`

Replace `project.getSurface(stage)` with `surfaces.getSurface(stage)`.

Files to update:

- `src/project/world-updates.ts`: Lines 145, 179, 375, 383, 391, 460
- `src/project/entity-highlights.ts`: Lines 230, 301, 324, 328
- `src/project/user-actions.ts`: Line 714
- `src/project/project-updates.ts`: Line 808

#### 6. Update Stage and Global Surface Mapping

Stage continues to store `surface: LuaSurface` directly. ProjectSurfaces manages surface lifecycle; UserProject owns the global `storage.surfaceIndexToStage` mapping.

**File**: `src/project/UserProject.ts` (Stage creation)

```typescript
insertStage(index: StageNumber): Stage {
  const name = this.settings.getStageName(index) ?? `Stage ${index}`
  const surface = this.surfaces.insertSurface(index, name, nil)
  const stage = new StageImpl(this, surface, index)
  this.registerStage(index, stage)
  return stage
}
```

#### 7. WorldPresentation Uses Separate Dependencies

**File**: `src/project/WorldPresentation.ts`

```typescript
@RegisterClass("WorldPresentation")
export class WorldPresentation implements ContentObserver {
  readonly entityStorage = new EntityStorage<WorldEntityTypes>()

  constructor(
    readonly stagePresentation: StagePresentation,
    readonly surfaces: SurfaceProvider,
    readonly entityBehavior: EntityBehaviorSettings,
    readonly content: MutableProjectContent,
  ) {}
}
```

#### 7. Update Project to Wire All Dependencies

**File**: `src/project/UserProject.ts`

```typescript
class UserProjectImpl {
  readonly settings: ProjectSettings
  readonly surfaces: ProjectSurfaces
  readonly content: MutableProjectContent
  readonly worldPresentation: WorldPresentation
  readonly actions: UserActions

  constructor(stageCount: StageNumber, data: ProjectSettingsData, content: MutableProjectContent) {
    this.settings = new ProjectSettings(data, stageCount)
    this.content = content
    this.surfaces = new ProjectSurfaces(this.settings)
    this.worldPresentation = new WorldPresentation(this.settings, this.surfaces, this.settings, this.content)
    this.actions = new UserActions(this.worldPresentation)
  }
}
```

### Success Criteria

#### Automated Verification

- [ ] `npm test`
- [ ] No `project.getSurface()` method exists
- [ ] `MockSurfaceProvider` exists and is used in tests

#### Manual Verification

- [ ] Existing projects load with correct surfaces
- [ ] Surface insertion/deletion and renaming works

## Phase 8: Delete ProjectUpdates and Eliminate Project Interface

### Overview

1. Move remaining ProjectUpdates logic to ProjectContent and UserActions
2. Delete ProjectUpdates module entirely
3. Remove delegate methods from UserProject
4. Eliminate the `Project` interface
5. Update Stage to delegate to UserProject's component fields

### Changes Required

#### 1. Move ProjectUpdates Methods

**Data mutation methods** → MutableProjectContent (from Phase 5)

**Validation/coordination methods** → UserActions:

```typescript
export class UserActions {
  constructor(private readonly worldPresentation: WorldPresentation) {}

  private stagePresentation(): StagePresentation {
    return this.worldPresentation.stagePresentation
  }
  private surfaces(): SurfaceProvider {
    return this.worldPresentation.surfaces
  }
  private content(): MutableProjectContent {
    return this.worldPresentation.content
  }

  checkCanSetFirstStage(entity: ProjectEntity, stage: StageNumber): boolean
  checkCanSetLastStage(entity: ProjectEntity, stage: StageNumber | nil): boolean
  trySetFirstStage(entity: ProjectEntity, stage: StageNumber): boolean
  trySetLastStage(entity: ProjectEntity, stage: StageNumber | nil): boolean
  addNewEntity(luaEntity: LuaEntity, stage: StageNumber): ProjectEntity | nil
  deleteEntityCompletely(entity: ProjectEntity): void
}
```

#### 2. Delete ProjectUpdates

- Delete `src/project/project-updates.ts`
- Remove all imports of `ProjectUpdates`
- Remove `updates` field from any remaining interfaces
- Convert `entity.getWorldEntity(stage)` calls to `worldPresentation.getWorldEntity(entity, stage)` (11 call sites)
- Convert `entity.destroyAllWorldOrPreviewEntities()` to `worldPresentation.destroyAllWorldEntities(entity)` (1 call site)

#### 3. Eliminate the Project Interface

Components receive granular interfaces instead of Project. Delete `createMockProject()` after all tests are migrated.

#### 4. Refactor UserProject (Remove Delegate Methods)

**File**: `src/project/UserProject.ts`

Remove delegate methods:

- `getSurface(stageNum)`, `getStageName(stageNumber)`, `numStages()`, `lastStageFor(entity)`, `isSpacePlatform()`

Remove old fields now in components:

- `name`, `landfillTile`, `stagedTilesEnabled`, `defaultBlueprintSettings`, `surfaceSettings`

Keep on UserProject:

- `id`, `valid`, `content`, `settings`, `surfaces`, `worldPresentation`, `actions`
- `localEvents` (until Phase 8)
- `displayName()`, stage lifecycle methods, `delete()`

```typescript
@RegisterClass("Assembly")
class UserProjectImpl implements UserProject {
  readonly id: ProjectId
  readonly settings: ProjectSettings
  readonly surfaces: ProjectSurfaces
  readonly content: MutableProjectContent
  readonly worldPresentation: WorldPresentation
  readonly actions: UserActions
  localEvents = new SimpleEvent<LocalProjectEvent>()
  valid = true

  private readonly stages: LuaMap<StageNumber, StageImpl> = new LuaMap()

  delete(): void {
    // ... cleanup logic
    this.settings.destroy()
  }
}
```

UserProject can optionally be renamed to `ProjectBundle`. Keep `@RegisterClass("Assembly")` for storage compatibility.

#### 5. Handle Undo System

The undo system (user-actions.ts lines 108, 111, 148) stores full project references. Keep `project: UserProject` reference in undo records - the undo system is inherently coupled to full project state.

#### 6. Update Stage to Delegate to Components

Stage must remain stored (not created on-demand) for `storage.surfaceIndexToStage` mapping.

```typescript
@RegisterClass("Stage")
class StageImpl implements Stage {
  public stageNumber: StageNumber
  readonly surface: LuaSurface
  readonly surfaceIndex: SurfaceIndex
  readonly valid = true
  id?: StageId

  constructor(
    public project: UserProjectImpl,
    surface: LuaSurface,
    stageNumber: StageNumber,
  ) {
    this.surface = surface
    this.stageNumber = stageNumber
    this.surfaceIndex = surface.index
    if (project.id != 0) storage.surfaceIndexToStage.set(this.surfaceIndex, this)
  }

  getActions(): UserActions { return this.project.actions }
  getName(): MutableProperty<string> { return this.project.settings.getStageNameProperty(this.stageNumber) }

  getBlueprintOverrideSettings(): BlueprintSettingsOverrideTable {
    return this.project.settings.getStageSettings(this.stageNumber).get().blueprintOverrides
  }
  getStageBlueprintSettings(): StageBlueprintSettingsTable {
    return this.project.settings.getStageSettings(this.stageNumber).get().stageBlueprintSettings
  }

  getBlueprintSettingsView(): BlueprintSettingsTable {
    return mergeBlueprintSettings(
      this.project.settings.defaultBlueprintSettings.get(),
      this.getBlueprintOverrideSettings()
    )
  }

  getBlueprintBBox(): BBox {
    return this.project.content.computeBoundingBox() ?? BBox.coords(-20, -20, 20, 20)
  }

  getID(): StageId {
    if (this.id == nil) {
      this.id = (storage.nextStageId ?? 1) as StageId
      storage.nextStageId = (this.id + 1) as StageId
    }
    return this.id
  }

  deleteByMerging(): void { this.project.mergeStage(this.stageNumber) }
  discardInProject(): void { this.project.discardStage(this.stageNumber) }
  _doDelete(): void { ... }
}
```

```typescript
insertStage(index: StageNumber): Stage {
  const name = this.settings.generateNewStageName(index)
  this.settings.insertStageSettings(index, { name, blueprintOverrides: createEmptyBlueprintOverrideSettings(), stageBlueprintSettings: createStageBlueprintSettingsTable() })

  // Coordinate cross-cutting concerns: shift entity storage keys before content.insertStage
  this.worldPresentation.onStageInserted(this.content, index)
  this.content.insertStage(index)

  const [surface, hub] = this.surfaces.insertSurface(index, name, this.content.computeBoundingBox())
  const stage = new StageImpl(this, surface, index)
  this.stages.set(index, stage)
  for (const i of $range(index + 1, this.settings.stageCount)) {
    this.stages.get(i)!.stageNumber = i
  }
  return stage
}

mergeStage(index: StageNumber): void {
  // ... pre-deletion logic ...

  // Coordinate cross-cutting concerns: shift entity storage keys
  this.worldPresentation.onStageDeleted(this.content, index)
  this.content.mergeStage(index)

  // ... rest of merge logic ...
}

discardStage(index: StageNumber): LuaMultiReturn<[...]> {
  // ... pre-deletion logic ...

  // Coordinate cross-cutting concerns: shift entity storage keys
  this.worldPresentation.onStageDeleted(this.content, index)
  const result = this.content.discardStage(index)

  // ... rest of discard logic ...
  return result
}

getStage(stageNumber: StageNumber): Stage | nil {
  return this.stages.get(stageNumber)
}
```

#### 7. Migrate All Tests

Replace `let project: Project` with separate component variables and mocks.

### Success Criteria

#### Automated Verification

- [ ] `npm test`
- [ ] No `Project` interface exists
- [ ] No `createMockProject()` or `ProjectUpdates` exists
- [ ] No deprecated access patterns (`project.getSurface()`, `project.getStageName()`, `project.numStages()`, etc.)

#### Manual Verification

- [ ] All entity operations, stage moves, undo/redo, save/load work correctly

## Phase 9: Project Events Refactoring

### Overview

Refactor the ad-hoc global project event system into a structured pattern where:

- UserProject coordinates project-scoped lifecycle events via observers (stored in UserProject, survives save/load)
- Cross-project events use storage-based `Event` class (not `GlobalEvent` which doesn't persist)
- UI components use Subscription-based listeners with proper lifecycle management

### Storage Persistence Requirement

All subscriptions must survive game save/load. This requires:

- **Project-scoped observers**: Stored in `UserProject.lifecycleObservers` (LuaSet of `@RegisterClass` objects)
- **Cross-project events**: Use `SimpleEvent` inside a `@RegisterClass` class (`ProjectList`) stored in `storage.projectList`
- **Observers must be `Func<...>`**: Function references via references.ts system, or `@RegisterClass` objects with methods

The existing `Event` class is already storage-compatible. `GlobalEvent` is NOT (module-level, loses listeners on reload).

### Current Problems

1. **Global singleton with switch filtering**: Every listener does `switch(e.type)` to filter events
2. **Components don't own listeners**: Module-level listeners iterate all players to find components (`AllProjects.tsx:273-292`)
3. **Mixed responsibilities**: `project-event-listener.ts` handles both world rebuild AND space platform init
4. **`localEvents` barely used**: Most code uses global `ProjectEvents`, per-project `localEvents` is redundant
5. **`GlobalEvent` doesn't persist**: Listeners lost on game reload

### Changes Required

#### 1. Define ProjectLifecycleObserver Interface

**File**: `src/project/ProjectLifecycleObserver.ts` (new file)

```typescript
export interface ProjectLifecycleObserver {
  onStageAdded?(stage: Stage): void
  onPreStageDeleted?(stage: Stage): void
  onStageDeleted?(stage: Stage): void
}
```

#### 2. UserProject Manages Lifecycle Observers

**File**: `src/project/UserProject.ts`

```typescript
@RegisterClass("Assembly")
class UserProjectImpl implements UserProject {
  // For persistent observers (WorldPresentation) - survives save/load
  private readonly lifecycleObservers = new LuaSet<ProjectLifecycleObserver>()

  // For UI components (Subscription-based) - ephemeral, tied to GUI lifecycle
  readonly stageAdded = new SimpleEvent<Stage>()
  readonly preStageDeleted = new SimpleEvent<Stage>()
  readonly stageDeleted = new SimpleEvent<Stage>()

  registerLifecycleObserver(observer: ProjectLifecycleObserver): void {
    this.lifecycleObservers.add(observer)
  }

  unregisterLifecycleObserver(observer: ProjectLifecycleObserver): void {
    this.lifecycleObservers.delete(observer)
  }

  insertStage(index: StageNumber): Stage {
    // ... existing logic ...
    for (const observer of this.lifecycleObservers) {
      observer.onStageAdded?.(newStage)
    }
    this.stageAdded.raise(newStage) // For UI components
    return newStage
  }

  private deleteStage(index: StageNumber, isMerge: boolean): void {
    // ... pre-delete logic ...
    for (const observer of this.lifecycleObservers) {
      observer.onPreStageDeleted?.(stage)
    }
    this.preStageDeleted.raise(stage) // For UI components
    // ... delete logic ...
    for (const observer of this.lifecycleObservers) {
      observer.onStageDeleted?.(stage)
    }
    this.stageDeleted.raise(stage) // For UI components
  }
}
```

#### 3. WorldPresentation Implements ProjectLifecycleObserver

**File**: `src/project/WorldPresentation.ts`

```typescript
@RegisterClass("WorldPresentation")
export class WorldPresentation implements ContentObserver, ProjectLifecycleObserver {
  onStageAdded(stage: Stage): void {
    if (this.entityBehavior.isSpacePlatform()) {
      this.initSpacePlatformStage(stage)
    }
    this.rebuildStage(stage.stageNumber)
  }

  onStageDeleted(stage: Stage): void {
    const stageToRebuild = stage.stageNumber == 1 ? 1 : stage.stageNumber - 1
    this.rebuildStage(stageToRebuild)
  }

  private initSpacePlatformStage(stage: Stage): void {
    for (const hub of stage.surface.find_entities_filtered({ type: "space-platform-hub" })) {
      // ... rebuild hub logic
    }
  }
}
```

#### 4. Create ProjectList Class

**File**: `src/project/ProjectList.ts` (new file)

```typescript
import { SimpleEvent, Subscription } from "../lib/event"

declare const storage: {
  projectList: ProjectList
  nextProjectId: ProjectId
}

@RegisterClass("ProjectList")
export class ProjectList {
  private readonly projects: UserProjectImpl[] = []

  readonly projectCreated = new SimpleEvent<UserProject>()
  readonly projectDeleted = new SimpleEvent<UserProject>()
  readonly projectsReordered = new SimpleEvent<{ project1: UserProject; project2: UserProject }>()

  getAll(): readonly UserProject[] {
    return this.projects
  }

  count(): number {
    return this.projects.length
  }

  getById(id: ProjectId): UserProject | nil {
    return this.projects.find((p) => p.id == id)
  }

  add(project: UserProjectImpl): void {
    this.projects.push(project)
    this.projectCreated.raise(project)
  }

  remove(project: UserProject): void {
    remove_from_list(this.projects, project as UserProjectImpl)
    this.projectDeleted.raise(project)
  }

  moveUp(project: UserProject): boolean {
    const index = this.projects.indexOf(project as UserProjectImpl)
    if (index <= 0) return false
    this.swap(index - 1, index)
    return true
  }

  moveDown(project: UserProject): boolean {
    const index = this.projects.indexOf(project as UserProjectImpl)
    if (index < 0 || index >= this.projects.length - 1) return false
    this.swap(index, index + 1)
    return true
  }

  private swap(index1: number, index2: number): void {
    const temp = this.projects[index1]
    this.projects[index1] = this.projects[index2]
    this.projects[index2] = temp
    this.projectsReordered.raise({
      project1: this.projects[index1],
      project2: this.projects[index2],
    })
  }
}

export function getProjectList(): ProjectList {
  return storage.projectList
}
```

**Update storage declaration** in `src/project/UserProject.ts`:

```typescript
declare const storage: {
  nextProjectId: ProjectId
  projectList: ProjectList
  surfaceIndexToStage: LuaMap<SurfaceIndex, StageImpl>
  nextStageId?: StageId
}

Events.on_init(() => {
  storage.nextProjectId = 1 as ProjectId
  storage.projectList = new ProjectList()
  storage.surfaceIndexToStage = new LuaMap()
})
```

**Update UserProjectImpl** to use ProjectList:

```typescript
static create(...): UserProjectImpl {
  const project = new UserProjectImpl(storage.nextProjectId++ as ProjectId, name, initialNumStages, surfaceSettings)
  getProjectList().add(project)
  project.registerEvents()

  // One-time initialization for space platform projects
  if (project.settings.isSpacePlatform()) {
    project.worldPresentation.initSpacePlatform()
  }

  return project
}

delete() {
  if (!this.valid) return
  getProjectList().remove(this)
  // ... rest of cleanup
}
```

Delete `GlobalProjectEvents` and replace module-level functions (`getAllProjects`, `moveProjectUp`, `moveProjectDown`) to use `getProjectList()`.

#### 5. Update UI Components to Use ProjectList Events

**File**: `src/ui/AllProjects.tsx`

```typescript
@RegisterClass("gui:AllProjects")
class AllProjects extends Component {
  private subscription!: Subscription

  override render(props: EmptyProps, context: RenderContext): Element {
    this.subscription = new Subscription()
    const projectList = getProjectList()
    projectList.projectCreated.subscribe(this.subscription, ibind(this.onProjectCreated))
    projectList.projectDeleted.subscribe(this.subscription, ibind(this.onProjectDeleted))
    projectList.projectsReordered.subscribe(this.subscription, ibind(this.onProjectsReordered))
    // ... rest of render
  }

  override onDestroy(): void {
    this.subscription.close()
  }

  private onProjectCreated(project: UserProject): void {
    render(this.projectButtonFlow(project), this.scrollPane)
    this.scrollToCurrentProject()
  }

  private onProjectDeleted(project: UserProject): void {
    const flow = this.scrollPane.children.find((c) => c.tags.projectId == project.id)
    if (flow) destroy(flow)
  }
}
```

#### 6. Delete project-event-listener.ts

Move logic to WorldPresentation.onStageAdded/onStageDeleted. Delete `src/project/project-event-listener.ts`.

#### 7. Update PlayerChangedStageEvent to Use Storage

**File**: `src/ui/player-current-stage.ts`

```typescript
declare const storage: StorageWithPlayer & {
  playerChangedStageEvent: SimpleEvent<{ player: LuaPlayer; newStage: Stage | nil; oldStage: Stage | nil }>
}

export function getPlayerChangedStageEvent() {
  return storage.playerChangedStageEvent
}
```

#### 8. Remove localEvents from UserProject

Delete `localEvents: SimpleSubscribable<LocalProjectEvent>` from UserProject.

### Success Criteria

#### Automated Verification

- [ ] `npm test && npm run lint`
- [ ] `project-event-listener.ts` is deleted
- [ ] No `GlobalEvent` or `GlobalProjectEvents` used for project events
- [ ] No `localEvents` field on UserProject

#### Manual Verification

- [ ] Stage add/delete triggers world rebuild correctly
- [ ] AllProjects UI updates when projects are created/deleted/reordered
- [ ] Save game, reload - all event subscriptions still work

---

## Testing Strategy

- Unit tests: new classes/interfaces, migrations, observer notifications
- Integration tests: full entity lifecycle, wire connections, surface lifecycle
- Run full test suite after each phase

---

## Phase 10: Simplify Import/Export

### Overview

Move import/export responsibility to the components that own the data. After refactoring, `ProjectSettings` and `MutableProjectContent` handle their own serialization.

### Changes Required

#### 1. Add Export/Import to ProjectSettings

**File**: `src/project/ProjectSettings.ts`

```typescript
class ProjectSettings {
  exportData(): ProjectSettingsData {
    return {
      projectName: this.projectName.get(),
      landfillTile: this.landfillTile.get(),
      stagedTilesEnabled: this.stagedTilesEnabled.get(),
      defaultBlueprintSettings: this.defaultBlueprintSettings.get(),
      surfaceSettings: this.surfaceSettings.get(),
      isSpacePlatform: this.isSpacePlatform,
      stages: this.exportStages(),
    }
  }

  private exportStages(): StageSettingsData[] {
    const result: StageSettingsData[] = []
    for (let i = 1; i <= this._stageCount; i++) {
      const stage = this.stages[i]
      result.push({
        name: stage.name.get(),
        blueprintOverrides: stage.settings.get().blueprintOverrides,
        stageBlueprintSettings: stage.settings.get().stageBlueprintSettings,
      })
    }
    return result
  }

  static fromData(data: ProjectSettingsData): ProjectSettings {
    return new ProjectSettings(data, data.stages.length)
  }
}
```

#### 2. Add Export/Import to MutableProjectContent

**File**: `src/entity/ProjectContent.ts`

Move `exportAllEntities()` and `importAllEntities()` from `src/import-export/entity.ts`:

```typescript
interface MutableProjectContent {
  exportEntities(): EntityExport[]
  importEntities(entities: EntityExport[]): void
}

class ProjectContentImpl implements MutableProjectContent {
  exportEntities(): EntityExport[] {
    // Move logic from exportAllEntities()
    // Filter out settings remnants (isSettingsRemnant == true)
    // Use existing stage diff conversion helpers from src/import-export/entity.ts
  }

  importEntities(entities: EntityExport[]): void {
    // Move logic from importAllEntities()
    // Handles wire connections
  }
}
```

#### 3. Simplify project.ts

**File**: `src/import-export/project.ts`

```typescript
export interface ProjectExport {
  settings: ProjectSettingsData
  entities: EntityExport[]
}

export function exportProject(project: UserProject): ProjectExport {
  return {
    settings: project.settings.exportData(),
    entities: project.content.exportEntities(),
  }
}

export function importProjectDataOnly(data: ProjectExport): UserProject {
  return UserProject.createFromExport(data.settings, data.entities)
}
```

#### 4. Add Factory Method to UserProject

**File**: `src/project/UserProject.ts`

```typescript
class UserProjectImpl {
  static createFromExport(settingsData: ProjectSettingsData, entities: EntityExport[]): UserProject {
    const settings = ProjectSettings.fromData(settingsData)
    const content = newProjectContent()
    content.importEntities(entities)

    // Space platform hub: delete imported hub entity since a new one is created with the surface
    // The hub from export data would conflict with the auto-created one
    if (settingsData.isSpacePlatform) {
      for (const entity of content.allEntities()) {
        if (entity.firstValue.name == "space-platform-hub") {
          content.deleteEntity(entity)
          break
        }
      }
    }

    return new UserProjectImpl(settings, content)
  }
}

// Note: Export format is backward compatible - old exports missing new fields
// get defaults applied in ProjectSettings.fromData() and importEntities()
```

#### 5. Update from-blueprint-book.ts

Use new content/settings APIs instead of direct property manipulation.

#### 6. Clean Up entity.ts

- Keep `exportEntity()`, `importEntity()` as internal helpers
- Remove `exportAllEntities()`, `importAllEntities()` (now in ProjectContent)

### Success Criteria

#### Automated Verification

- [ ] `npm test`
- [ ] `exportAllEntities` and `importAllEntities` no longer exported from entity.ts

#### Manual Verification

- [ ] Export project, import in new game - all settings and entities preserved

---

## Phase 11: Consolidated Migration

### Overview

All code changes from Phases 1-10 are implemented first, then a single consolidated migration transforms old storage format to the new structure.

### Subscription Migration Strategy

Old subscriptions must be explicitly closed during migration to avoid memory leaks and duplicate handlers.

**GUI Subscriptions**: Handled automatically by `Migrations.fromAny(cleanGuiInstances)` in `src/lib/factoriojsx/render.ts`.

**Project/Stage Subscriptions**: Must be explicitly migrated.

### Changes Required

#### 1. Initialize New Storage Fields

**File**: `src/project/ProjectList.ts`

```typescript
Migrations.since("$CURRENT_VERSION", () => {
  storage.projectList = new ProjectList()
  const oldProjects = (storage as { projects?: UserProjectImpl[] }).projects
  if (oldProjects) {
    for (const project of oldProjects) {
      storage.projectList._addWithoutEvent(project)
    }
    delete (storage as { projects?: unknown }).projects
  }
  storage.playerChangedStageEvent = new SimpleEvent()
})
```

Add helper method to ProjectList for migration:

```typescript
@RegisterClass("ProjectList")
export class ProjectList {
  _addWithoutEvent(project: UserProjectImpl): void {
    this.projects.push(project)
  }
}
```

#### 2. Consolidated Data Migration

**File**: `src/project/index.ts`

```typescript
interface OldProjectSchema {
  name: MutableProperty<string>
  landfillTile: MutableProperty<string | nil>
  stagedTilesEnabled: MutableProperty<boolean>
  defaultBlueprintSettings: BlueprintSettingsTable
  surfaceSettings: SurfaceSettings
  blueprintBookTemplateInv?: LuaInventory
  subscription?: Subscription
  stages: Record<number, OldStageSchema>
  localEvents?: SimpleEvent<LocalProjectEvent>
}

interface OldStageSchema {
  name: MutableProperty<string>
  blueprintOverrideSettings: BlueprintSettingsOverrideTable
  stageBlueprintSettings: StageBlueprintSettingsTable
  surface: LuaSurface
  subscription?: Subscription
}

Migrations.to("$CURRENT_VERSION", () => {
  for (const project of getAllProjects()) {
    const old = project as unknown as OldProjectSchema
    const stageCount = luaLength(old.stages)

    // Step 1: Close all old subscriptions
    old.subscription?.close()
    old.name?.closeAll()
    old.landfillTile?.closeAll()
    old.stagedTilesEnabled?.closeAll()
    old.localEvents?.closeAll()
    for (const i of $range(1, stageCount)) {
      const oldStage = old.stages[i]
      oldStage.subscription?.close()
      oldStage.name?.closeAll()
    }

    // Step 2: Create ProjectSettings
    assume<Mutable<UserProject>>(project)
    project.settings = new ProjectSettings(
      {
        projectName: old.name.get(),
        landfillTile: old.landfillTile.get(),
        stagedTilesEnabled: old.stagedTilesEnabled.get(),
        defaultBlueprintSettings: old.defaultBlueprintSettings,
        surfaceSettings: old.surfaceSettings,
        isSpacePlatform: old.surfaceSettings.type == "spacePlatform",
        stages: [],
      },
      stageCount,
    )
    for (const i of $range(1, stageCount)) {
      const oldStage = old.stages[i]
      project.settings.insertStageSettings(i, {
        name: oldStage.name.get(),
        blueprintOverrides: oldStage.blueprintOverrideSettings,
        stageBlueprintSettings: oldStage.stageBlueprintSettings,
      })
    }
    if (old.blueprintBookTemplateInv?.valid) {
      project.settings.setBlueprintBookTemplateInv(old.blueprintBookTemplateInv)
    }

    // Step 3: Create ProjectSurfaces
    project.surfaces = new ProjectSurfaces(project.settings)
    for (const i of $range(1, stageCount)) {
      project.surfaces.setSurface(i, old.stages[i].surface)
    }

    // Step 4: Create WorldPresentation (also sets itself as content observer)
    project.worldPresentation = new WorldPresentation(
      project.settings,
      project.surfaces,
      project.settings,
      project.content,
    )

    // Step 5: Register lifecycle observers
    project.registerLifecycleObserver(project.worldPresentation)

    // Step 6: Delete deprecated fields
    delete old.name
    delete old.defaultBlueprintSettings
    delete old.landfillTile
    delete old.stagedTilesEnabled
    delete old.surfaceSettings
    delete old.blueprintBookTemplateInv
    delete old.subscription
    delete old.localEvents
    for (const i of $range(1, stageCount)) {
      const oldStage = old.stages[i] as unknown as Record<string, unknown>
      delete oldStage.name
      delete oldStage.blueprintOverrideSettings
      delete oldStage.stageBlueprintSettings
      delete oldStage.subscription
    }
  }
})
```

### Migration Order

1. **Close all subscriptions first** - Prevents duplicate handlers
2. **Create ProjectSettings** - Extracts settings from old fields
3. **Create ProjectSurfaces** - Depends on ProjectSettings
4. **Register lifecycle observers** - WorldPresentation registers on UserProject
5. **Delete deprecated fields** - After all data is extracted

### What Each Phase Contributes to Migration

| Phase   | Migration Responsibility                                                             |
| ------- | ------------------------------------------------------------------------------------ |
| Phase 2 | Entity storage moves to WorldPresentation.entityStorage (runtime, no data migration) |
| Phase 6 | Create ProjectSettings, extract project/stage settings                               |
| Phase 7 | Create ProjectSurfaces, transfer surface references                                  |
| Phase 9 | Create `storage.projectList`, register lifecycle observers, delete localEvents       |

### Success Criteria

#### Automated Verification

- [ ] `npm test && npm run lint`

#### Manual Verification

- [ ] Existing projects load correctly after migration
- [ ] Settings persist correctly
- [ ] Save game, reload - all functionality works

## Import/Export Module (`src/import-export/`)

See Phase 10 for full refactoring. Summary: `ProjectSettings.exportData()`/`fromData()` and `MutableProjectContent.exportEntities()`/`importEntities()` encapsulate serialization.

---

## Appendix A: Affected Files

### Core Files (Major Restructure)

| File                                    | Changes                                                              |
| --------------------------------------- | -------------------------------------------------------------------- |
| `src/project/UserProject.ts`            | Extract settings/surfaces, remove delegates, add lifecycle observers |
| `src/project/ProjectDef.d.ts`           | Delete Project interface, update type definitions                    |
| `src/entity/ProjectEntity.ts`           | Remove world/extra entity methods (~150 lines)                       |
| `src/entity/ProjectContent.ts`          | Add ContentObserver, comprehensive mutation API                      |
| `src/project/world-updates.ts`          | Merge into WorldPresentation class                                   |
| `src/project/entity-highlights.ts`      | Merge into WorldPresentation class                                   |
| `src/project/user-actions.ts`           | Convert to @RegisterClass                                            |
| `src/project/project-updates.ts`        | Delete (logic moves to ProjectContent/UserActions)                   |
| `src/lib/LazyLoad.ts`                   | Delete after migration                                               |
| `src/project/project-event-listener.ts` | Delete (logic moves to WorldPresentation)                            |

### UI Files (14)

- `src/ui/ProjectSettings.tsx` - Update project.settings access
- `src/ui/opened-entity.tsx` - Update entity methods, project.worldPresentation
- `src/ui/AllProjects.tsx` - Migrate to ProjectList events
- `src/ui/StageSelector.tsx` - Migrate localEvents to stageAdded/stageDeleted
- `src/ui/StageReferencesBox.tsx` - Migrate localEvents
- `src/ui/player-current-stage.ts` - Migrate ProjectEvents subscription
- `src/ui/player-navigation.ts` - Update stage.project access
- `src/ui/MapGenSettings.tsx` - Update settings access
- `src/ui/stage-move-tool.ts` - Update stage.project access
- `src/ui/entity-util.ts` - Update entity methods
- `src/ui/copy-staged-value.ts` - Update entity methods
- `src/ui/create-blueprint-with-stage-info.ts` - Update project/entity access
- `src/ui/create-stage-blueprint.ts` - Update project access
- `src/ui/commands.ts` - Update project.updates calls

### Import/Export Files (6)

- `src/import-export/project.ts` - Use settings.exportData(), content.exportEntities()
- `src/import-export/entity.ts` - Move bulk methods to ProjectContent
- `src/import-export/from-blueprint-book.ts` - Update project creation
- `src/blueprints/blueprint-creation.ts` - Update entity.getWorldOrPreviewEntity()
- `src/blueprints/take-single-blueprint.ts` - Update project access
- `src/blueprints/stage-reference.ts` - Update stage.project access

### Entity Files (7)

- `src/entity/save-load.ts` - Update entity method calls
- `src/entity/wires.ts` - Update entity.getWorldEntity() calls
- `src/entity/wire-connection.ts` - Update type references
- `src/entity/underground-belt.ts` - Update entity access
- `src/entity/registration.ts` - No changes (uses storage directly)
- `src/entity/map2d.ts` - No changes
- `src/entity/prototype-info.ts` - No changes

### Tiles Files (3)

- `src/tiles/ProjectTile.ts` - Update Project type reference
- `src/tiles/set-tiles.ts` - Update stage.project access
- `src/tiles/tile-events.ts` - Update stage.project access

### Project Module Files (5)

- `src/project/index.ts` - Add Phase 11 migration
- `src/project/player-project-data.ts` - Migrate ProjectEvents subscription
- `src/project/surfaces.ts` - Referenced by ProjectSurfaces
- `src/project/undo.ts` - Keep project reference in undo records
- `src/project/notifications.ts` - Update stage name access

### Test Files (41)

**Project tests** (need mock pattern updates):

- `src/test/project/project-updates.test.ts`
- `src/test/project/world-updates.test.ts`
- `src/test/project/user-actions.test.ts`
- `src/test/project/entity-highlights.test.ts`
- `src/test/project/entity-update-integration.test.ts`
- `src/test/project/UserProject.test.ts`
- `src/test/project/space-platform-integration.test.ts`
- `src/test/project/event-handlers.test.ts`
- `src/test/project/underground-belt.test.ts`
- `src/test/project/Project-mock.ts` - Replace with granular mocks

**Entity tests**:

- `src/test/entity/ProjectEntity.test.ts`
- `src/test/entity/ProjectContent.test.ts`
- `src/test/entity/save-load.test.ts`
- `src/test/entity/wires.test.ts`
- `src/test/entity/connections.test.ts`

**Other tests** (31 more with indirect dependencies via Project-mock.ts)

---

## Appendix B: Transformation Examples

### Entity World Access

```typescript
// Before
const luaEntity = entity.getWorldOrPreviewEntity(stage)
entity.replaceWorldOrPreviewEntity(stage, newEntity)

// After
const luaEntity = project.worldPresentation.getWorldOrPreviewEntity(entity, stage)
project.worldPresentation.replaceWorldOrPreviewEntity(entity, stage, newEntity)
```

### Project Settings Access

```typescript
// Before
const name = project.getStageName(stage)
const count = project.numStages()
if (project.isSpacePlatform()) { ... }

// After
const name = project.settings.getStageName(stage)
const count = project.settings.stageCount()
if (project.settings.isSpacePlatform()) { ... }
```

### Test Mock Creation

```typescript
// Before
const project = createMockProject(surfaces)
project.worldUpdates = fMock<WorldUpdates>()

// After
const stagePresentation = createMockStagePresentation(4)
const surfaceProvider = createMockSurfaceProvider(surfaces)
const entityBehavior = createMockEntityBehavior({ isSpacePlatform: false })
const content = newProjectContent()
const worldPresentation = new WorldPresentation(stagePresentation, surfaceProvider, entityBehavior, content)
```

### Event Subscriptions

```typescript
// Before
ProjectEvents.addListener((e) => {
  if (e.type == "project-deleted") { ... }
})

// After
getProjectList().projectDeleted.subscribe(subscription, func)
```

---

## References

- Original design document: `thoughts/scratch/separation-of-concerns.md`
- ProjectEntity implementation: `src/entity/ProjectEntity.ts`
- WorldUpdates implementation: `src/project/world-updates.ts`
- EntityHighlights implementation: `src/project/entity-highlights.ts`
- ProjectContent implementation: `src/entity/ProjectContent.ts`
- UserProject implementation: `src/project/UserProject.ts`
- Stage implementation: `src/project/UserProject.ts` (StageImpl class)
- Import/Export implementation: `src/import-export/project.ts`, `src/import-export/entity.ts`
- Project events: `src/project/project-event-listener.ts`, `src/project/UserProject.ts` (GlobalProjectEvents)
- Event types: `src/project/ProjectDef.d.ts` (GlobalProjectEvent, LocalProjectEvent)
- GlobalEvent implementation: `src/lib/event/GlobalEvent.ts`
- UI event listeners: `src/ui/AllProjects.tsx`, `src/ui/player-current-stage.ts`
