# Separation of Concerns: UserProject, ProjectContent, ProjectEntity

## Current Structure Summary

| Class              | Lines | Primary Concern        | Mixed Concerns                                  |
| ------------------ | ----- | ---------------------- | ----------------------------------------------- |
| **ProjectEntity**  | 826   | Staged entity data     | LuaEntity storage, highlights, wire connections |
| **UserProject**    | 396   | Project coordination   | Settings, stage collection, world state         |
| **Stage**          | 90    | Stage metadata         | Settings + LuaSurface reference                 |
| **ProjectContent** | 343   | Entity/tile collection | Mostly clean                                    |

## Core Problem: ProjectEntity as God Object

The most significant issue is `ProjectEntity` storing LuaEntity references directly in the same object.

`ProjectEntity.ts:224` uses numeric keys for world entities:

```typescript
[stage: StageNumber]: LuaEntity | nil  // world entities stored in table keys
stageProperties?: {                     // highlights stored here too
  [P in keyof StageData]?: PRecord<StageNumber, StageData[P]>
}
```

A single `ProjectEntity` conflates three concerns:

1. **Pure Data**: position, direction, firstValue, stageDiffs (via `StagedValue` base)
2. **World References**: `this[stage]` = LuaEntity (lines 590-650)
3. **Presentation**: `stageProperties` for extra entities like highlights (lines 653-703)

## Recommended Refactoring

### Approach: External Storage Pattern

Instead of `ProjectEntity` owning LuaEntity references, move them to external maps owned by the presentation layer.

### New Structure

```
┌─────────────────────────────────────────────────────────────────┐
│                         UserProject                             │
├─────────────────┬─────────────────┬─────────────────────────────┤
│ ProjectSettings │ ProjectContent  │ WorldPresentation           │
│                 │ (pure data)     │                             │
│ - name          │ - entities      │ - WorldEntityMap            │
│ - blueprintOpts │ - tiles         │ - PresentationMap           │
│ - landfillTile  │ - wireConns?    │ - stages[] (LuaSurface)     │
│ - tilesEnabled  │                 │ - actions, worldUpdates     │
└─────────────────┴─────────────────┴─────────────────────────────┘
```

### Concrete Changes

#### Extract world entity storage from ProjectEntity

Create a new `WorldEntityStorage` class (owned by `WorldUpdates` or `UserProject`):

```typescript
// New: src/project/WorldEntityStorage.ts
interface WorldEntityStorage {
  get(entity: ProjectEntity, stage: StageNumber): LuaEntity | nil
  getOrPreview(entity: ProjectEntity, stage: StageNumber): LuaEntity | nil
  set(entity: ProjectEntity, stage: StageNumber, luaEntity: LuaEntity | nil): void
  destroy(entity: ProjectEntity, stage: StageNumber): void
  destroyAll(entity: ProjectEntity): void
  hasInRange(entity: ProjectEntity, start: StageNumber, end: StageNumber): boolean
  iterate(entity: ProjectEntity): LuaIterable<[StageNumber, LuaEntity]>
}

// Implementation: Map<ProjectEntity, Map<StageNumber, LuaEntity>>
```

#### Extract presentation storage from ProjectEntity

Create `PresentationStorage` (owned by `EntityHighlights`):

```typescript
// New: src/project/PresentationStorage.ts
interface PresentationStorage {
  getExtra<T extends ExtraEntityType>(entity: ProjectEntity, type: T, stage: StageNumber): ExtraEntities[T] | nil
  setExtra<T extends ExtraEntityType>(entity: ProjectEntity, type: T, stage: StageNumber, value: ExtraEntities[T]): void
  destroyExtra(entity: ProjectEntity, type: ExtraEntityType, stage: StageNumber): void
  destroyAllExtras(entity: ProjectEntity, type: ExtraEntityType): void
}
```

#### ProjectEntity becomes pure data

Remove from `ProjectEntity`:

- `[stage: StageNumber]: LuaEntity` storage
- `getWorldEntity()`, `replaceWorldEntity()`, `destroyWorldOrPreviewEntity()` etc.
- `getExtraEntity()`, `replaceExtraEntity()`, `destroyExtraEntity()` etc.
- `hasErrorAt()` (moves to presentation layer, or becomes a query)

Keep in `ProjectEntity`:

- position, direction, firstValue, stageDiffs
- `getValueAtStage()`, `getPropAtStage()`, `adjustValueAtStage()` etc.
- `wireConnections` (arguably belongs here as it's part of entity data)
- Type queries: `isUndergroundBelt()`, `isInserter()`, etc.

#### Split UserProject concerns

```typescript
// Settings extraction
interface ProjectSettings {
  name: MutableProperty<string>
  defaultBlueprintSettings: BlueprintSettingsTable
  landfillTile: MutableProperty<string | nil>
  stagedTilesEnabled: MutableProperty<boolean>
  readonly surfaceSettings: SurfaceSettings
}

// Stage settings extraction
interface StageSettings {
  name: MutableProperty<string>
  blueprintOverrideSettings: BlueprintSettingsOverrideTable
  stageBlueprintSettings: StageBlueprintSettingsTable
}

// In-world state remains with presentation layer
interface StagePresentation {
  surface: LuaSurface
  surfaceIndex: SurfaceIndex
}
```

## Migration Path

### Phase 1: Create WorldEntityStorage as a parallel structure

- Add methods that delegate to it
- Keep old methods working

### Phase 2: Migrate callers to use new storage

- Update `WorldUpdates`, `EntityHighlights`, `UserActions`
- Test incrementally

### Phase 3: Remove old methods from ProjectEntity

- Delete numeric key storage
- Delete `stageProperties` for extra entities

### Phase 4: Extract settings interfaces

- Less critical, but cleaner

## Wire Connections: Where do they belong?

Wire connections are stored in `ProjectEntity.wireConnections`. This is a graph relationship between entities. Options:

1. **Keep in ProjectEntity** — It's part of the entity's data model (what it's connected to)
2. **Extract to ProjectContent** — Since ProjectContent already manages the entity collection

Recommendation: **Keep in ProjectEntity** since:

- Connections belong to specific entities
- They're part of blueprint import/export
- Moving them would complicate the API significantly

## Benefits

| Benefit           | Description                                                                           |
| ----------------- | ------------------------------------------------------------------------------------- |
| **Testability**   | Pure data classes are easier to test without mocking Factorio runtime                 |
| **Serialization** | Clean separation of what needs persistence vs. what's reconstructible                 |
| **Memory**        | Can destroy world entities without touching data                                      |
| **Clarity**       | Clear ownership: WorldUpdates owns world entities, EntityHighlights owns presentation |

## Implementation Considerations

The tricky part is that `ProjectEntity` currently uses `this[stage]` for both `LuaEntity` storage AND iteration. The external map approach requires:

1. Using a proper `LuaMap<ProjectEntity, LuaMap<StageNumber, LuaEntity>>` or similar
2. Handling entity invalidation (when LuaEntity becomes invalid)
3. Updating all call sites (mainly in `world-updates.ts`, `entity-highlights.ts`, `user-actions.ts`)

## The Project Interface Problem

### Current Interface (`ProjectDef.d.ts:33-49`)

```typescript
export interface Project {
  numStages(): StageNumber
  lastStageFor(entity: StagedValue<AnyNotNil, AnyNotNil>): StageNumber
  getStageName(stage: StageNumber): LocalisedString
  getSurface(stage: StageNumber): LuaSurface | nil
  readonly content: MutableProjectContent
  isSpacePlatform?(): boolean
  readonly valid: boolean

  // Module references
  actions: UserActions
  updates: ProjectUpdates
  worldUpdates: WorldUpdates
}
```

This interface mixes three concerns:

| Concern           | Members                                      |
| ----------------- | -------------------------------------------- |
| **Data queries**  | `content`, `numStages()`, `lastStageFor()`   |
| **World access**  | `getSurface()`, `worldUpdates`               |
| **Actions**       | `actions`, `updates`                         |

### The Mocking Problem (`Project-mock.ts`)

```typescript
export function createMockProject(stages: number | LuaSurface[]): Project {
  return {
    getSurface: (stage) => surfaces[stage - 1],
    numStages: () => surfaces.length,
    lastStageFor: (entity) => ...,
    content: newProjectContent(),           // Real implementation
    getStageName: (n) => "mock stage " + n,
    valid: true,
    actions: "actions not mocked" as any,   // Stub
    updates: "updates not mocked" as any,   // Stub
    worldUpdates: "entityUpdates not mocked" as any,  // Stub
  }
}
```

Tests must:
1. Create real `ProjectContent` even when only testing world updates
2. Provide stub strings cast to `any` for unused modules
3. Deal with `getSurface()` even when testing pure data operations

### Proposed Split

```typescript
// Pure data operations - easy to mock, no Factorio runtime needed
interface ProjectData {
  readonly content: MutableProjectContent
  numStages(): StageNumber
  lastStageFor(entity: StagedValue<any, any>): StageNumber
  getStageName(stage: StageNumber): LocalisedString
  readonly valid: boolean
}

// World/surface operations - requires Factorio surfaces
interface ProjectWorld {
  getSurface(stage: StageNumber): LuaSurface | nil
  isSpacePlatform?(): boolean
}

// Action handlers - the "controller" layer
interface ProjectActions {
  actions: UserActions
  updates: ProjectUpdates
  worldUpdates: WorldUpdates
}

// Full project combines all three
interface Project extends ProjectData, ProjectWorld, ProjectActions {}
```

### Benefits for Testing

| Test Type                | Old Approach                          | New Approach                     |
| ------------------------ | ------------------------------------- | -------------------------------- |
| **ProjectContent tests** | Mock entire Project with stubs        | Use only `ProjectData`           |
| **WorldUpdates tests**   | Need real surfaces + stub actions     | Use `ProjectData + ProjectWorld` |
| **UserActions tests**    | Need everything                       | Full `Project` (unchanged)       |
| **Pure entity tests**    | Sometimes need mock Project           | No Project dependency            |

### Mock Improvements

```typescript
// Data-only mock - no surfaces needed
function createMockProjectData(numStages: number): ProjectData {
  return {
    content: newProjectContent(),
    numStages: () => numStages,
    lastStageFor: (entity) => entity.lastStage ?? numStages,
    getStageName: (n) => `Stage ${n}`,
    valid: true,
  }
}

// World mock - with surfaces
function createMockProjectWorld(surfaces: LuaSurface[]): ProjectWorld {
  return {
    getSurface: (stage) => surfaces[stage - 1],
    isSpacePlatform: () => false,
  }
}

// Full mock when needed
function createMockProject(surfaces: LuaSurface[]): Project {
  return {
    ...createMockProjectData(surfaces.length),
    ...createMockProjectWorld(surfaces),
    actions: undefined as any,  // Explicitly undefined, not string
    updates: undefined as any,
    worldUpdates: undefined as any,
  }
}
```

### Migration for Project Interface

1. Define split interfaces `ProjectData`, `ProjectWorld`, `ProjectActions`
2. Have `Project` extend all three
3. Update function signatures to accept narrower interface where possible:
   - `ProjectUpdates` could take `ProjectData & { worldUpdates: WorldUpdates }`
   - `WorldUpdates` could take `ProjectData & ProjectWorld`
4. Update test mocks to use appropriate narrow interface
5. Gradually narrow parameter types in production code

## Later Stage: Refactor Action Handlers

### Current Problem with LazyLoadClass

The current pattern uses `LazyLoadClass` for dependency injection:

```typescript
// UserProject.ts:402-410
const UserActionsClass = LazyLoadClass<HasProject, UserActions>("UserActions", ({ project }) =>
  UserActions(project, project.updates, project.worldUpdates),
)
const ProjectUpdatesClass = LazyLoadClass<HasProject, ProjectUpdates>("ProjectUpdates", ({ project }) =>
  ProjectUpdates(project, project.worldUpdates),
)
const WorldUpdatesClass = LazyLoadClass<HasProject, WorldUpdates>("WorldUpdates", ({ project }) =>
  WorldUpdates(project, EntityHighlights(project)),
)
```

Issues:
- Hacky, not performant implementation
- All handlers hold a reference to `project` just for accessing other modules
- Circular dependency smell: project → handlers → project
- No clear data ownership

### Proposed Refactoring

#### UserActions → Stateless routing functions

UserActions holds no data. Convert to plain functions that route to ProjectUpdates with user interaction:

```typescript
// Instead of a class/module, just functions
function handleEntityPlaced(
  updates: ProjectUpdates,
  entity: LuaEntity,
  stage: StageNumber,
  player: LuaPlayer,
): void {
  // Route to updates, possibly show UI feedback
}

// Or a thin object if grouping is useful
interface UserActions {
  handleEntityPlaced(entity: LuaEntity, stage: StageNumber, player: LuaPlayer): void
  handleEntityRotated(entity: LuaEntity, stage: StageNumber, player: LuaPlayer): void
  // ...
}

function createUserActions(updates: ProjectUpdates): UserActions {
  return {
    handleEntityPlaced: (e, s, p) => { /* route to updates */ },
    // ...
  }
}
```

#### Merge ProjectUpdates into ProjectContent

Rather than having ContentManager wrap ProjectContent, merge them into a single class. This eliminates multiple mutation paths and removes the need for "unchecked" method variants.

```typescript
class ProjectContent {
  // Private internals - no external access
  private readonly byPosition: LinkedMap2D<ProjectEntity>
  private readonly entities: LuaSet<ProjectEntity>
  private readonly tiles: Map2D<ProjectTile>
  private readonly observers: ContentObserver[] = []

  // Read-only access
  findCompatibleEntity(...): ProjectEntity | nil
  findCompatibleWithLuaEntity(...): ProjectEntity | nil
  allEntities(): ReadonlyLuaSet<ProjectEntity>
  get numEntities(): number
  computeBoundingBox(): BoundingBox | nil

  // Validated mutations (absorbs ProjectUpdates methods)
  addNewEntity(luaEntity: LuaEntity, stage: StageNumber): ProjectEntity | nil {
    // Validates, creates ProjectEntity, adds to spatial index, notifies observers
  }
  deleteEntity(entity: ProjectEntity): void {
    // Validates, removes from index, notifies observers
  }
  moveEntity(entity: ProjectEntity, newPosition: Position): boolean {
    // Validates no collision, updates spatial index, notifies observers
  }
  trySetFirstStage(entity: ProjectEntity, stage: StageNumber): StageMoveResult
  trySetLastStage(entity: ProjectEntity, stage: StageNumber): StageMoveResult
  tryUpdateEntityFromWorld(entity: ProjectEntity, stage: StageNumber): EntityUpdateResult

  // Bulk operations for blueprint import (skip per-item notification)
  importEntities(entities: ProjectEntity[]): void {
    // Add all, then notify once
  }

  // Observer registration
  addObserver(observer: ContentObserver): void
}
```

Benefits:
- **Single mutation path** — No way to bypass validation via inner object reference
- **"Unchecked" methods become private** — `setPositionUnchecked` on ProjectEntity only callable internally
- **Simpler mental model** — One class for project data and its mutations
- **Spatial index is implementation detail** — Not exposed to callers

#### WorldUpdates → WorldPresentation (owns all world state)

Rename and consolidate all world/presentation concerns:

```typescript
class WorldPresentation {
  // Owns world entity storage (extracted from ProjectEntity)
  private readonly worldEntities: WorldEntityStorage
  private readonly presentationEntities: PresentationStorage

  // Owns surfaces/stages
  private readonly stages: StagePresentation[]

  // Owns highlights
  private readonly highlights: EntityHighlights

  constructor(surfaceSettings: SurfaceSettings) {
    this.worldEntities = new WorldEntityStorage()
    this.presentationEntities = new PresentationStorage()
    this.highlights = new EntityHighlights(this.presentationEntities)
  }

  // Surface access
  getSurface(stage: StageNumber): LuaSurface | nil

  // World entity operations
  updateWorldEntities(entity: ProjectEntity, startStage: StageNumber): void
  refreshWorldEntityAtStage(entity: ProjectEntity, stage: StageNumber): void
  deleteWorldEntities(entity: ProjectEntity): void

  // Highlight operations
  updateAllHighlights(entity: ProjectEntity): void
}
```

#### Dependency Direction

```
┌─────────────────┐
│   UserActions   │  (stateless functions)
└────────┬────────┘
         │ calls
         ▼
┌─────────────────┐
│ ProjectContent  │  (entities, tiles, validated mutations)
└────────┬────────┘
         │ notifies (observer pattern)
         ▼
┌─────────────────┐
│WorldPresentation│  (owns surfaces, world entities, highlights)
└─────────────────┘
```

#### Observer Pattern for Decoupling

ProjectContent notifies observers of changes, fully decoupling it from presentation:

```typescript
interface ContentObserver {
  onEntityAdded(entity: ProjectEntity, stage: StageNumber): void
  onEntityDeleted(entity: ProjectEntity): void
  onEntityUpdated(entity: ProjectEntity, stage: StageNumber): void
  onTileChanged(position: Position, stage: StageNumber): void
}

// WorldPresentation implements ContentObserver
class WorldPresentation implements ContentObserver {
  onEntityAdded(entity: ProjectEntity, stage: StageNumber): void {
    this.updateWorldEntities(entity, stage)
  }
  onEntityDeleted(entity: ProjectEntity): void {
    this.deleteWorldEntities(entity)
  }
  // ...
}
```

This allows multiple presentations (e.g., minimap view, different render modes) without ProjectContent knowing about them.

### Migration Path

1. **Phase 5**: Extract WorldEntityStorage and PresentationStorage from ProjectEntity
2. **Phase 6**: Rename WorldUpdates → WorldPresentation, move storage ownership into it
3. **Phase 7**: Merge ProjectUpdates into ProjectContent
   - Move validated mutation methods into ProjectContent
   - Make internal methods (`setPositionUnchecked`, etc.) private
   - Add observer notification for WorldPresentation
4. **Phase 8**: Convert UserActions to stateless functions
5. **Phase 9**: Remove LazyLoadClass entirely
6. **Phase 10** (optional): Support multiple observers for extensibility
