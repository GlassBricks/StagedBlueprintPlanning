# Separation of Concerns: Target State

This doc outlines a major refactor to improve the separation of concerns and architecture around projects.

## Out of Scope

- **Player navigation and stage tracking** — `PlayerChangedStageEvent`, `playerCurrentStage()` property, and `player-current-stage.ts` are orthogonal player state management, not project architecture. They remain unchanged.

## Problems Addressed

1. **ProjectEntity as god object** - stores LuaEntity references, presentation entities, and pure data in one class
2. **Closure-based modules** - ProjectUpdates, WorldUpdates use factory functions incompatible with clean Factorio storage
3. **Tight coupling** - ProjectUpdates directly calls WorldUpdates; no abstraction layer
4. **UserProject as god object** - stores surfaces, settings, content, and module refs in one class
5. **Project interface conflation** - the minimal `Project` interface mixes settings queries, surface access, content, and module refs; `UserProject` extends it redundantly

## Component Overview

### Core Components

**Project** - Central coordinator owning all project components. Manages project identity and stage lifecycle (insert/merge/discard) by calling components directly in sequence. Raises per-project stage lifecycle events after core components are synchronized. Renamed from `UserProject`.

**ProjectSettings** - Stores and exposes project configuration as reactive properties: project name, stage names, blueprint settings, surface settings, entity behavior flags. Implements `ProjectSettingsWriter`.

**ProjectSurfaces** - Creates and manages Factorio surfaces for each stage. Subscribes to `ProjectSettings` for stage name changes and updates surface names accordingly. Implements `SurfaceManager`.

**MutableProjectContent** - Pure data storage for project entities and tiles. Has no knowledge of LuaEntity, world state, or business rules. All entity mutations flow through this component, which notifies its `ContentObserver` of changes. External code interacts with entities via `ProjectEntity` (read-only); only the content module uses `InternalProjectEntity` for mutations.

**WorldPresentation** - Synchronizes Factorio world state with project content. Implements `ContentObserver` to react to content changes (entity added/deleted/modified) by creating/updating/destroying world entities and highlights. Uses `EntityStorage` for world entity tracking.

**EntityStorage** - Generic storage mapping `(ProjectEntity, type, stage)` to world objects (LuaEntity, highlights, render objects). Handles stage key shifting when stages are inserted/deleted.

**ProjectActions** - The business logic layer between events and data. Receives Factorio events (from `event-handlers.ts`) and programmatic calls (from UI). Responsibilities:
- **Validation**: Enforces business rules (e.g., rotation only at first stage, stage movement constraints)
- **Coordination**: Orchestrates multi-entity operations (underground belt pairs, train carriages)
- **LuaEntity reading**: Extracts entity values from world for "update from world" operations
- **Content mutation**: Calls `MutableProjectContent` methods to modify data
- **User feedback**: Sends notifications to players
- **Undo/redo**: Returns `UndoAction` objects for registration

Internally may use pure helper functions for complex domain logic (e.g., underground belt pairing, train handling). These helpers encapsulate what was previously in `ProjectUpdates`, minus the world sync calls.

**ProjectList module** (`ProjectList.ts`) - Module-level functions managing the `storage.projects` array. Module-level `GlobalEvent` exports emit events when projects are created, deleted, or reordered.

### Composition

Module-level functions in `ProjectList.ts` manage the project collection in `storage.projects`. Each `Project` owns: `ProjectSettings`, `ProjectSurfaces`, `MutableProjectContent`, `WorldPresentation`, and `ProjectActions`.

`ProjectSurfaces` observes `ProjectSettings` for stage name changes.
`WorldPresentation` owns `EntityStorage` and implements `ContentObserver` to receive content change notifications.
`MutableProjectContent` notifies its registered `ContentObserver` on all mutations.

### Module Organization

Content-related types should be organized into a dedicated `content/` module:

**Moves to `content/`:**

- `Entity.d.ts` - base entity type definitions
- `StagedValue.ts` - base staged value class
- `ProjectEntity.ts` - entity implementation
- `ProjectContent.ts` - entity collection
- `stage-diff.ts` - stage diff types
- `wire-connection.ts` - wire connection types
- `map2d.ts` - spatial data structure (internal to ProjectContent)

**Public exports from `content/`:**

- `ProjectEntity` (read-only interface)
- `MutableProjectContent` / `ProjectContent`
- `StagedValue`, `StageDiff`
- `ProjectWireConnection`
- Entity type definitions

**Internal (not exported):**

- `InternalProjectEntity`
- `map2d` utilities

**Stays in `entity/` (operational/domain helpers):**

- `prototype-info.ts` - prototype metadata (used widely)
- `save-load.ts` - blueprint import/export
- `wires.ts` - wire sync operations
- `registration.ts` - runtime entity registration
- `underground-belt.ts` - underground belt pairing logic
- `item-requests.ts` - blueprint item handling

### Data Flow

**Entity mutations:**

1. **User interaction** → `ProjectActions` receives Factorio event (via `event-handlers.ts`)
2. **Validation & coordination** → `ProjectActions` validates operation and coordinates multi-entity changes
3. **Content mutation** → `ProjectActions` calls `MutableProjectContent` methods
4. **Observer notification** → `MutableProjectContent` notifies `WorldPresentation` via `ContentObserver`
5. **World sync** → `WorldPresentation` updates Factorio entities and highlights

**Stage operations:**

1. **Stage operation** → `Project.insertStage()` / `deleteStage()` called
2. **Direct coordination** → `Project` calls components in sequence (see Stage Synchronization)
3. **External notification** → Per-project stage events raised last (for UI components)

## Stage

Stage is a lightweight accessor combining a Project reference with a stage number. Provides convenience methods delegating to project components.

```typescript
@RegisterClass("Stage")
class Stage {
  readonly project: Project
  private _stageNumber: StageNumber

  constructor(project: Project, stageNumber: StageNumber)

  get stageNumber(): StageNumber
  get surface(): LuaSurface
  get name(): LocalisedString
  get nameProperty(): Property<string>
  get settings(): Property<StageSettingsData>

  // Called by Project during stage deletion renumbering
  _setStageNumber(stageNumber: StageNumber): void
}
```

### Global Registration

Stage objects are stored for the global surface mapping:

- `storage.surfaceIndexToStage`: Maps `SurfaceIndex → Stage`
- Event handlers call `getStageAtSurface(surfaceIndex)` to get Stage

## Observer Patterns

### ContentObserver

`MutableProjectContent` notifies `ContentObserver` on all entity/tile mutations. `WorldPresentation` implements `ContentObserver` to react to content changes.

### Replace event system

`GlobalProjectEvents` and `localEvents` are replaced with two event types matching their subscriber lifecycles:

**`ProjectList.ts` module-level `GlobalEvent` exports** for project-level lifecycle (project created/deleted/reordered). Module-level listeners register raw functions at module load time, re-registered every load. No `Func` wrappers or storable subscriptions needed. This matches the existing `GlobalProjectEvents` pattern — subscribers have no storage concerns.

- `AllProjects.tsx` → `projectCreated.addListener(...)`, etc.
- `player-project-data.ts` → `projectDeleted.addListener(...)`
- `player-current-stage.ts` → `projectDeleted.addListener(...)`; stage deletion handled by existing `on_player_changed_surface` event (surface is destroyed)

**`Project` uses `SimpleEvent`** for per-project stage lifecycle (`stageAdded`, `preStageDeleted`, `stageDeleted`). GUI components subscribe via `subscribe(subscription, func)` where the `Subscription` is tied to the render context lifecycle. `Subscription.close()` removes the observer from the event's map on GUI destruction. This matches the existing `localEvents` pattern — subscriptions are storable and cleaned up through the `Subscription` lifecycle.

- `StageSelector.tsx` → `project.stageAdded.subscribe(subscription, ...)`, `project.stageDeleted.subscribe(subscription, ...)`
- `StageReferencesBox.tsx` → same pattern

**Hardcoded/always-active listeners** move inside components:
- `project-event-listener.ts` (stage rebuild on add/delete, space platform init) → logic moves into `Project` stage lifecycle methods and `WorldPresentation`

## Stage Synchronization

Stage operations require coordinated updates across multiple components with specific ordering. Rather than using an observer pattern (which has undefined ordering), `Project` directly calls components in sequence.

### Insert Stage

```typescript
insertStage(stageNumber: StageNumber): Stage {
  // 1. Create surface (must exist before world sync)
  const surface = this.surfaces.insertSurface(stageNumber, name, area)

  // 2. Update settings (add stage settings entry)
  this.settings.insertStageSettings(stageNumber, defaultSettings)

  // 3. Update blueprint book template
  this.settings.blueprintBookTemplate.onStageInserted(stageNumber, this.settings)

  // 4. Shift content keys (updates entity firstStage/lastStage/stageDiffs)
  this.content.insertStage(stageNumber)

  // 5. Shift world storage keys and rebuild
  this.worldPresentation.onStageInserted(stageNumber)

  // 6. Create and register stage object
  const stage = new Stage(this, stageNumber)
  this.stages.set(stageNumber, stage)
  registerStage(stage)

  // 7. Notify external subscribers (UI components)
  this.stageAdded.raise(stage)

  return stage
}
```

### Delete Stage

```typescript
deleteStage(stageNumber: StageNumber, merge: boolean): void {
  const stage = this.stages.get(stageNumber)!

  // 1. Notify external subscribers of pending deletion (UI cleanup)
  this.preStageDeleted.raise(stage)

  // 2. Clear world entities on the stage being deleted
  this.worldPresentation.onPreStageDeleted(stageNumber)

  // 3. Update content (merge or discard entity values, shift keys)
  // These fire ContentObserver.onStageMerged / onStageDiscarded,
  // which WorldPresentation handles to destroy/rebuild affected world entities
  if (merge) {
    this.content.mergeStage(stageNumber)
  } else {
    this.content.discardStage(stageNumber)
  }

  // 4. Shift world storage keys
  this.worldPresentation.onStageDeleted(stageNumber)

  // 5. Delete surface
  this.surfaces.deleteSurface(stageNumber)

  // 6. Remove settings and update blueprint book template
  this.settings.removeStageSettings(stageNumber)

  // 7. Unregister and remove stage object
  unregisterStage(stage)
  this.stages.delete(stageNumber)

  // 8. Renumber remaining stages
  for (const [num, s] of this.stages) {
    if (num > stageNumber) {
      this.stages.delete(num)
      this.stages.set(num - 1, s)
      s._setStageNumber(num - 1)
    }
  }

  // 9. Notify external subscribers
  this.stageDeleted.raise(stage)
}
```

Rationale: Core components have explicit dependencies and ordering requirements. `insertStage` on `MutableProjectContent` does not fire `ContentObserver` notifications — `Project` coordinates the world rebuild via `WorldPresentation.onStageInserted`. `mergeStage` and `discardStage` fire `ContentObserver.onStageMerged` / `onStageDiscarded` with affected entity/tile lists, so `WorldPresentation` handles world cleanup/rebuild directly. `WorldPresentation.onStageDeleted` then only shifts world storage keys. The import flow detaches the observer entirely and calls `rebuildAllStages()` after.

## Testing Approach

Components are constructed with granular mocks instead of full Project:

```typescript
stagePresentation = createMockStagePresentation(4)
surfaces = createMockSurfaceProvider(testSurfaces)
entityBehavior = createMockEntityBehavior({ isSpacePlatform: false })
content = newProjectContent()
worldPresentation = new WorldPresentation(stagePresentation, surfaces, entityBehavior, content)
```

## Project

Renamed from `UserProject`. The minimal `Project` interface is deleted.

- Project identity and lifecycle (`id`, `valid`, `delete()`)
- Stage lifecycle (`insertStage()`, `mergeStage()`, `discardStage()`, `getStage()`, `getAllStages()`)
- Coordinates stage operations (see Stage Synchronization)
- Display helper (`displayName()`)
- Stage registration (`registerStage()`, `unregisterStage()`)
- Stage lifecycle events (for external/UI subscribers)

```typescript
@RegisterClass("Assembly")
class ProjectImpl implements Project {
  readonly id: ProjectId
  readonly settings: ProjectSettings
  readonly surfaces: ProjectSurfaces
  readonly content: MutableProjectContent
  readonly worldPresentation: WorldPresentation
  readonly actions: ProjectActions
  valid = true

  private readonly stages: LuaMap<StageNumber, Stage>
  readonly stageAdded = new SimpleEvent<Stage>()
  readonly preStageDeleted = new SimpleEvent<Stage>()
  readonly stageDeleted = new SimpleEvent<Stage>()
}
```

## Core Interfaces

### StageCount

```typescript
interface StageCount {
  stageCount(): StageNumber
}
```

Minimal interface for components that only need to know how many stages exist. Used by `lastStageFor()` utility and as base for `StagePresentation`.

### StagePresentation

```typescript
interface StagePresentation extends StageCount {
  getStageName(stage: StageNumber): LocalisedString
  getStageNameProperty(stage: StageNumber): Property<string>
}
```

For components that need stage count and display names. Used by `WorldPresentation` to iterate stages and by UI components displaying stage labels.

### EntityBehaviorSettings

```typescript
interface EntityBehaviorSettings {
  isSpacePlatform(): boolean
  readonly landfillTile: Property<string | nil>
}
```

Settings that affect how entities behave in the world. Used by `WorldPresentation` when creating/updating world entities (e.g., space platforms have different tile handling).

### ProjectSettingsReader / ProjectSettingsWriter

```typescript
interface ProjectSettingsReader extends EntityBehaviorSettings, StagePresentation {
  readonly projectName: Property<string>
  readonly stagedTilesEnabled: Property<boolean>
  readonly defaultBlueprintSettings: Property<OverrideableBlueprintSettings>
  readonly surfaceSettings: Property<SurfaceSettings>
  getStageSettings(stage: StageNumber): Property<StageSettingsData>
}

interface ProjectSettingsWriter extends ProjectSettingsReader {
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

`ProjectSettingsReader` is for components that read settings (UI, blueprint export). `ProjectSettingsWriter` adds mutation for settings UI and `Project` stage lifecycle. `ProjectSettings` implements both.

### SurfaceProvider / SurfaceManager

```typescript
interface SurfaceProvider {
  getSurface(stage: StageNumber): LuaSurface | nil
  getAllSurfaces(): readonly LuaSurface[]
}

interface SurfaceManager extends SurfaceProvider {
  createSurface(stage: StageNumber, stageName: string, area: BoundingBox | nil): LuaSurface
  deleteSurface(stage: StageNumber): void
  insertSurface(stage: StageNumber, stageName: string, area: BoundingBox | nil): LuaSurface
  updateSurfaceName(stage: StageNumber, stageName: string): void
}
```

`SurfaceProvider` is for read-only surface access (used by `WorldPresentation`). `SurfaceManager` adds lifecycle operations (used by `Project` during stage insert/delete).

### ContentObserver

Notified by `MutableProjectContent` whenever entities are mutated. `WorldPresentation` implements this to keep world entities synchronized with project content. Tile world sync is not handled via `ContentObserver` — see Tile Sync below.

Most entity changes (position, direction, value, firstStage) result in the same world operation: rebuild entities + wires + highlights from a start stage. These are unified into `onEntityChanged`. Each mutation method determines the correct `fromStage` (usually the stage parameter passed to it; for first-stage changes, `min(oldFirstStage, newFirstStage)`).

Only cases with fundamentally different world behavior get separate methods:

- **lastStage changed**: needs `oldLastStage` to determine rebuild direction (destroy past end vs create new)
- **settings remnant / revive**: completely different visual representation (preview entities + special highlights)
- **deleted**: separate for cleanup ordering
- **added**: separate for import optimization (skip wires, conditionally skip highlights). During import, the observer is detached entirely and `rebuildAllStages()` is called after, so this is only relevant for interactive entity creation.

**Underground belt pair highlights:** When `WorldPresentation` rebuilds any underground belt entity, it always also looks up the paired underground belt via the world `LuaEntity` and updates highlights on the pair. This means no batching or deferred highlight logic is needed for multi-entity operations — each observer notification independently ensures both the entity and its pair have correct highlights. Redundant highlight updates on the pair are acceptable for simplicity.
- **wires changed**: reconnects circuit/logistics wires across stages — a distinct operation from rebuilding entity properties

```typescript
interface ContentObserver {
  onEntityAdded(entity: ProjectEntity): void
  onEntityDeleted(entity: ProjectEntity): void
  onEntityChanged(entity: ProjectEntity, fromStage: StageNumber): void
  onEntityLastStageChanged(entity: ProjectEntity, oldLastStage: StageNumber | nil): void
  onEntityBecameSettingsRemnant(entity: ProjectEntity): void
  onEntityRevived(entity: ProjectEntity): void
  onWiresChanged(entity: ProjectEntity): void

  // Stage operations (fired by MutableProjectContent during merge/discard)
  onStageDiscarded(
    stageNumber: StageNumber,
    deleted: ProjectEntity[],
    updated: ProjectEntity[],
    updatedTiles: MapPosition[],
  ): void
  onStageMerged(stageNumber: StageNumber): void
}
```

### Tile Sync

Tile world sync is a direct call from `ProjectActions` to `WorldPresentation`, not via `ContentObserver`. Tile placement can fail due to collisions (e.g., entities blocking tile placement), requiring `ProjectActions` to read back the actual tile value and adjust content. This request-response pattern doesn't fit fire-and-forget observer notifications.

`MutableProjectContent.setTile()` mutates content data silently. `ProjectActions` then calls `WorldPresentation.updateTiles(position, fromStage)` which returns `TileCollision | nil`. If a collision occurs, `ProjectActions` adjusts content accordingly. `WorldPresentation.rebuildStage()` handles tile rebuilds internally.

### Per-Project Stage Lifecycle Events

For external/UI components only. Core components are coordinated directly by `Project`. These are `SimpleEvent` fields on `Project`, enabling GUI components to subscribe via `subscribe(subscription, func)` with automatic cleanup through the `Subscription` lifecycle.

```typescript
// On Project:
readonly stageAdded = new SimpleEvent<Stage>()
readonly preStageDeleted = new SimpleEvent<Stage>()
readonly stageDeleted = new SimpleEvent<Stage>()
```

### ProjectEntity (Public Read-Only)

The read-only view of an entity. External code (UI, `WorldPresentation`, `ProjectActions`) uses this interface to query entity state without direct mutation access.

```typescript
interface ProjectEntity<T extends Entity = Entity> extends StagedValue<T, StageDiff<T>> {
  // Transform
  readonly position: MapPosition
  readonly direction: defines.direction

  // Stage bounds
  readonly firstStage: StageNumber
  readonly lastStage: StageNumber | nil
  lastStageWith(stageCount: StageNumber): StageNumber // replaces previous util function lastStageFor
  isInStage(stage: StageNumber): boolean
  isPastLastStage(stage: StageNumber): boolean

  // Value queries
  getValueAtStage(stage: StageNumber): T
  getPropAtStage<K extends keyof T>(stage: StageNumber, prop: K): LuaMultiReturn<[T[K], StageNumber]>
  getUpgradeAtStage(stage: StageNumber): NameAndQuality
  hasStageDiff(): boolean
  hasStageDiffAt(stage: StageNumber): boolean
  getFirstStageDiffForProp<K extends keyof T>(prop: K): LuaMultiReturn<[] | [StageNumber | nil, T[K]]>

  // Unstaged value
  getUnstagedValue(stage: StageNumber): UnstagedEntityProps | nil

  // Settings remnant
  readonly isSettingsRemnant: true | nil

  // Wire connections
  readonly wireConnections: ReadonlyLuaMap<ProjectEntity, ReadonlyLuaSet<ProjectWireConnection>> | nil

  // Type queries
  getType(): EntityType | nil
  isUndergroundBelt(): this is UndergroundBeltProjectEntity
  isInserter(): this is InserterProjectEntity
  isTrain(): this is TrainProjectEntity
  isMovable(): this is MovableProjectEntity
  isPersistent(): boolean
}
```

### InternalProjectEntity (Content Module Only)

Extends `ProjectEntity` with mutation methods. Only `MutableProjectContent` uses this interface to modify entities; external code cannot access these methods without explicit casting.

```typescript
interface InternalProjectEntity<T extends Entity = Entity> extends ProjectEntity<T> {
  // Mutable transform
  position: MapPosition
  direction: defines.direction

  // Stage bounds
  setFirstStage(stage: StageNumber): void
  setLastStage(stage: StageNumber | nil): void

  // Value mutations
  adjustValueAtStage(stage: StageNumber, value: T): boolean
  setPropAtStage<K extends keyof T>(stage: StageNumber, prop: K, value: T[K]): boolean
  applyUpgradeAtStage(stage: StageNumber, upgrade: NameAndQuality): boolean
  resetValue(stage: StageNumber): boolean
  resetProp<K extends keyof T>(stage: StageNumber, prop: K): boolean
  moveValueDown(stage: StageNumber): StageNumber | nil
  movePropDown<K extends keyof T>(stage: StageNumber, prop: K): StageNumber | nil
  clearPropertyInAllStages(prop: string): void

  // Direct value setters (for import)
  setFirstValue(value: T): void
  setAllStageDiffs(stageDiffs: StageDiffs | nil): void

  // Unstaged value
  setUnstagedValue(stage: StageNumber, value: UnstagedEntityProps | nil): boolean

  // Settings remnant
  isSettingsRemnant: true | nil

  // Wire connections (one-way: only updates this entity's side)
  addOneWayWireConnection(connection: ProjectWireConnection): boolean
  removeOneWayWireConnection(connection: ProjectWireConnection): void
  syncIngoingConnections(existing: ReadonlyLuaSet<ProjectEntity>): void
  removeIngoingConnections(): void
}
```

### MutableProjectContent

Pure data storage. All entity mutations go through this interface, which notifies ContentObserver. Has no knowledge of:
- LuaEntity or world state
- Business rules or validation
- Multi-entity coordination

Callers (`ProjectActions`) are responsible for validation and coordination before calling these methods.

ProjectContent is existing interface in ProjectContent.ts. MutableProjectContent extends it with mutation methods:

```typescript
interface MutableProjectContent extends ProjectContent {
  setObserver(observer: ContentObserver | nil): void

  // Stage operations (called directly by Project)
  // insertStage does NOT fire ContentObserver — Project coordinates via WorldPresentation.onStageInserted
  insertStage(stageNumber: StageNumber): void
  // mergeStage and discardStage fire ContentObserver.onStageMerged / onStageDiscarded
  // with affected entities/tiles, so WorldPresentation can handle world cleanup/rebuild
  mergeStage(stageNumber: StageNumber): void
  discardStage(stageNumber: StageNumber): void

  // Entity lifecycle
  addEntity(entity: InternalProjectEntity): void
  deleteEntity(entity: ProjectEntity): void

  // Entity transform
  setEntityPosition(entity: ProjectEntity, position: Position): boolean
  setEntityDirection(entity: ProjectEntity, direction: defines.direction): void

  // Entity stage bounds
  setEntityFirstStage(entity: ProjectEntity, stage: StageNumber): void
  setEntityLastStage(entity: ProjectEntity, stage: StageNumber | nil): void

  // Entity value mutations
  adjustEntityValue(entity: ProjectEntity, stage: StageNumber, value: EntityValue): boolean
  setEntityProp<T extends Entity, K extends keyof T>(
    entity: ProjectEntity<T>,
    stage: StageNumber,
    prop: K,
    value: T[K],
  ): boolean
  applyEntityUpgrade(entity: ProjectEntity, stage: StageNumber, upgrade: NameAndQuality): boolean
  resetEntityValue(entity: ProjectEntity, stage: StageNumber): boolean
  resetEntityProp<T extends Entity, K extends keyof T>(entity: ProjectEntity<T>, stage: StageNumber, prop: K): boolean
  moveEntityValueDown(entity: ProjectEntity, stage: StageNumber): StageNumber | nil
  moveEntityPropDown<T extends Entity, K extends keyof T>(
    entity: ProjectEntity<T>,
    stage: StageNumber,
    prop: K,
  ): StageNumber | nil

  // Direct value setters (for import)
  setEntityValue(entity: ProjectEntity, firstValue: EntityValue, stageDiffs: StageDiffs | nil): void

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

  // Tiles
  setTile(position: Position, stage: StageNumber, value: string | nil): void
}
```

## Component Classes

### ProjectSettings

```typescript
@RegisterClass("ProjectSettings")
class ProjectSettings implements ProjectSettingsWriter {
  readonly blueprintBookTemplate: BlueprintBookTemplate
  // Implements all settings interfaces
  // Generates stage names
}
```

### BlueprintBookTemplate

Manages the blueprint book template inventory used for blueprint export. Provides stage reference insertion and label syncing.

```typescript
@RegisterClass("BlueprintBookTemplate")
class BlueprintBookTemplate {
  get(): LuaItemStack | nil
  getOrCreate(settings: ProjectSettingsReader): LuaItemStack
  reset(): void
  onStageInserted(stage: StageNumber, settings: ProjectSettingsReader): void
  onProjectNameChanged(name: string): void
  destroy(): void
}
```

### ProjectSurfaces

```typescript
@RegisterClass("ProjectSurfaces")
class ProjectSurfaces implements SurfaceManager {
  constructor(settings: SurfacesSettingsProvider)
  // Subscribes to stage name changes and updates surface names
}
```

### EntityStorage

Generic type-parameterized storage for world-rendered objects (LuaEntity, highlights, render objects). Pure data properties like `unstagedValue` remain on `ProjectEntity` — they are not world objects and don't belong in EntityStorage.

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

@RegisterClass("EntityStorage")
class EntityStorage<T extends Record<string, unknown>> {
  get<K extends keyof T & string>(entity: ProjectEntity, type: K, stage: StageNumber): T[K] | nil
  set<K extends keyof T & string>(entity: ProjectEntity, type: K, stage: StageNumber, value: T[K] | nil): void
  delete<K extends keyof T & string>(entity: ProjectEntity, type: K, stage: StageNumber): void
  deleteAllOfType<K extends keyof T & string>(entity: ProjectEntity, type: K): void
  deleteAllForEntity(entity: ProjectEntity): void
  iterateType<K extends keyof T & string>(entity: ProjectEntity, type: K): LuaIterable<...>
  hasInRange<K extends keyof T & string>(entity: ProjectEntity, type: K, start: StageNumber, end: StageNumber): boolean
  shiftStageKeysUp(entity: ProjectEntity, fromStage: StageNumber): void
  shiftStageKeysDown(entity: ProjectEntity, fromStage: StageNumber): void
}
```

### WorldPresentation

Merges WorldUpdates + EntityHighlights, implements ContentObserver.

```typescript
@RegisterClass("WorldPresentation")
class WorldPresentation implements ContentObserver {
  readonly entityStorage: EntityStorage<WorldEntityTypes>

  constructor(
    stagePresentation: StagePresentation,
    surfaces: SurfaceProvider,
    entityBehavior: EntityBehaviorSettings,
    content: MutableProjectContent,
  )

  // World entity access
  getWorldOrPreviewEntity(entity: ProjectEntity, stage: StageNumber): LuaEntity | nil
  getWorldEntity(entity: ProjectEntity, stage: StageNumber): LuaEntity | nil
  replaceWorldOrPreviewEntity(entity: ProjectEntity, stage: StageNumber, luaEntity: LuaEntity | nil): void
  hasErrorAt(entity: ProjectEntity, stage: StageNumber): boolean

  // Stage lifecycle (called directly by Project, not via observer)
  onStageInserted(stageNumber: StageNumber): void
  onPreStageDeleted(stageNumber: StageNumber): void
  // Shifts world storage keys after stage deletion. Entity cleanup is handled
  // by ContentObserver.onStageMerged / onStageDiscarded before this is called.
  onStageDeleted(stageNumber: StageNumber): void

  // Commands
  rebuildStage(stage: StageNumber): void
  rebuildAllStages(): void
  refreshEntity(entity: ProjectEntity, stage: StageNumber): void
  refreshAllEntities(entity: ProjectEntity): void
  rebuildEntity(entity: ProjectEntity, stage: StageNumber): void
  // was: clearWorldEntityAtStage
  deleteEntity(entity: ProjectEntity, stage: StageNumber): void
  resetUnderground(entity: ProjectEntity, stage: StageNumber): void
  disableAllEntitiesInStage(stage: StageNumber): void
  enableAllEntitiesInStage(stage: StageNumber): void

  // Tile sync (called directly by ProjectActions, not via ContentObserver)
  updateTiles(position: Position, fromStage: StageNumber): TileCollision | nil

  initSpacePlatform(): void
}
```

### ProjectActions

The business logic layer. `MutableProjectContent` is pure data storage; `ProjectActions` contains all validation, coordination, and domain logic.

**Responsibilities:**
- Validate operations against business rules
- Coordinate multi-entity changes (underground belt pairs, train carriages)
- Read entity values from LuaEntity for "update from world" operations
- Call `MutableProjectContent` for each data mutation
- Query `WorldPresentation` for world entity state (e.g., settings remnant decisions, error checks)
- Call `WorldPresentation` directly for operations that bypass the observer (train rebuilds, tile sync)
- Provide user feedback via notifications
- Return `UndoAction` objects for undo registration

**Internal helpers:** Complex domain logic (underground belt pairing, train handling, collision detection) may be extracted to pure helper functions. These encapsulate what was previously in `ProjectUpdates`, but without world sync calls. Helpers are internal implementation details, not a separate layer.

**No observer batching needed.** Most multi-entity operations (underground belt pairs, undo groups) work correctly with per-mutation observer notifications, at the cost of occasional redundant world rebuilds. Train carriage operations require ordered destroy-all-then-rebuild-all, which `ProjectActions` handles by calling `WorldPresentation` directly for the destroy/rebuild sequence rather than relying on observer notifications. Stage merge/discard already use single batched `ContentObserver` notifications. Import defers observer attachment entirely.

Receives events from `event-handlers.ts` or other user-handling code (GUI, custom input actions, etc). `event-handlers.ts` remains mostly as-is — it continues to own Factorio event parsing, state machines (fast replace detection, blueprint paste coordination, wire tracking), selection tool dispatch, and undo registration. It calls `ProjectActions` methods instead of the current `UserActions`/`ProjectUpdates` split.

```typescript
@RegisterClass("ProjectActions")
class ProjectActions {
  constructor(content: MutableProjectContent, worldPresentation: WorldPresentation, settings: StagePresentation)

  // Entity lifecycle events (from Factorio, called by event-handlers.ts)
  onEntityCreated(entity: LuaEntity, stage: StageNumber, byPlayer: PlayerIndex | nil): UndoAction | nil
  onEntityDeleted(entity: LuaEntity, stage: StageNumber): void
  onEntityDied(entity: LuaEntity, stage: StageNumber): void
  onEntityRotated(
    entity: LuaEntity,
    stage: StageNumber,
    previousDirection: defines.direction,
    byPlayer: PlayerIndex | nil,
  ): void
  onUndergroundBeltDragRotated(entity: LuaEntity, stage: StageNumber, byPlayer: PlayerIndex): void
  onWiresPossiblyUpdated(entity: LuaEntity, stage: StageNumber, byPlayer: PlayerIndex | nil): void
  onEntityPossiblyUpdated(
    entity: LuaEntity,
    stage: StageNumber,
    previousDirection: defines.direction,
    stagedInfo: StagedInfoExport | nil,
    byPlayer: PlayerIndex | nil,
    items: BlueprintInsertPlan[] | nil,
  ): ProjectEntity | nil
  onEntityMarkedForUpgrade(entity: LuaEntity, stage: StageNumber, byPlayer: PlayerIndex | nil): void

  // Surface/tile events (called by event-handlers.ts)
  onSurfaceCleared(stage: StageNumber): void
  onChunkGeneratedForEntity(previewEntity: LuaEntity, stage: StageNumber): void
  onTileBuilt(position: Position, value: string, stage: StageNumber): void
  onTileMined(position: Position, stage: StageNumber): void

  // Tool handlers (called by event-handlers.ts, return UndoAction for registration)
  onCleanupToolUsed(entity: LuaEntity, stage: StageNumber): void
  onTryFixEntity(previewEntity: LuaEntity, stage: StageNumber, deleteSettingsRemnants?: boolean): void
  onEntityForceDeleteUsed(entity: LuaEntity, stage: StageNumber, byPlayer: PlayerIndex): UndoAction | nil
  onStageDeleteUsed(entity: LuaEntity, stage: StageNumber, byPlayer: PlayerIndex): UndoAction | nil
  onStageDeleteReverseUsed(entity: LuaEntity, stage: StageNumber, byPlayer: PlayerIndex): UndoAction | nil
  onStageDeleteCancelUsed(entity: LuaEntity, stage: StageNumber, byPlayer: PlayerIndex): UndoAction | nil
  onBringToStageUsed(entity: LuaEntity, stage: StageNumber, byPlayer: PlayerIndex): UndoAction | nil
  onBringDownToStageUsed(entity: LuaEntity, stage: StageNumber, byPlayer: PlayerIndex): UndoAction | nil
  onSendToStageUsed(
    entity: LuaEntity,
    fromStage: StageNumber,
    toStage: StageNumber,
    onlyIfMatchesFirstStage: boolean,
    byPlayer: PlayerIndex,
  ): UndoAction | nil
  onMoveEntityToStageCustomInput(entity: LuaEntity, stage: StageNumber, byPlayer: PlayerIndex): UndoAction | nil

  // Programmatic actions (called by UI)
  reviveSettingsRemnant(entity: ProjectEntity, stage: StageNumber, byPlayer: PlayerIndex | nil): void
  moveEntityToStageWithUndo(entity: ProjectEntity, stage: StageNumber, byPlayer: PlayerIndex): void
  setEntityLastStageWithUndo(entity: ProjectEntity, newLastStage: StageNumber | nil, byPlayer: PlayerIndex): void
  resetVehicleLocation(entity: ProjectEntity): void
  setVehicleLocationHere(entity: ProjectEntity): void
  scanProjectForExistingTiles(): void
}

// Internal interface for undo system
interface InternalProjectActions extends ProjectActions {
  findCompatibleEntityForUndo(entity: ProjectEntity): ProjectEntity | nil
  forceDeleteEntity(entity: ProjectEntity): void
  readdDeletedEntity(entity: ProjectEntity): void

  // Core stage movement (used by undo handlers, show feedback indicators)
  moveEntityToStage(entity: ProjectEntity, stage: StageNumber, byPlayer: PlayerIndex, isUndo?: boolean): boolean
  setEntityLastStage(entity: ProjectEntity, stage: StageNumber | nil, byPlayer: PlayerIndex): boolean
  bringEntityToStage(entity: ProjectEntity, stage: StageNumber, byPlayer: PlayerIndex): boolean
  sendEntityToStage(entity: ProjectEntity, fromStage: StageNumber, toStage: StageNumber, byPlayer: PlayerIndex): boolean
}
```

Stage movement methods consolidated:

- `moveEntityToStage` - shows notification "moved from/to stage X"
- `bringEntityToStage` - shows ">>" indicator when moving forward
- `sendEntityToStage` - shows "<<" indicator when moving backward
- "bring" and "send" are semantic inverses for undo (bring undoes send, send undoes bring)

#### Undo/Redo

The existing undo system (`src/project/undo.ts`) is compatible with this architecture and requires no structural changes. `ProjectActions` returns `UndoAction` objects; `event-handlers.ts` registers them. Undo handler implementations will be updated to call `MutableProjectContent` methods instead of `ProjectUpdates` methods.

### ProjectList Module

`src/project/ProjectList.ts` — module-level functions and events operating on `storage.projects`:

```typescript
export const projectCreated = globalEvent<[Project]>()
export const projectDeleted = globalEvent<[Project]>()
export const projectsReordered = globalEvent<[Project, Project]>()

export function getAllProjects(): readonly Project[]
export function getProjectCount(): number
export function getProjectById(id: ProjectId): Project | nil
export function addProject(project: Project): void
export function removeProject(project: Project): void
export function moveProjectUp(project: Project): boolean
export function moveProjectDown(project: Project): boolean
```

## Import/Export

```typescript
interface ProjectExport {
  settings: ProjectSettingsData
  entities: EntityExport[]
}

class ProjectSettings {
  exportData(): ProjectSettingsData
  static fromData(data: ProjectSettingsData): ProjectSettings
}

interface MutableProjectContent {
  exportEntities(): EntityExport[]
  importEntities(entities: EntityExport[]): void
}
```

### Import Flow

```typescript
function importProject(data: ProjectExport): Project {
  // 1. Create components without observer
  const settings = ProjectSettings.fromData(data.settings)
  const surfaces = new ProjectSurfaces(settings)
  for (let i = 1; i <= settings.stageCount(); i++) {
    surfaces.createSurface(i, settings.getStageName(i), nil)
  }
  const content = newMutableProjectContent()

  // 2. Delete auto-created space platform hub (surfaces auto-create one)
  if (settings.isSpacePlatform()) {
    const hub = next(content.allEntities())[0]
    if (hub) content.deleteEntity(hub)
  }

  // 3. Import entities (two-pass for wires, no observer notifications)
  content.importEntities(data.entities)

  // 4. Create presentation and attach observer
  const worldPresentation = new WorldPresentation(settings, surfaces, settings, content)
  content.setObserver(worldPresentation)

  // 5. Assemble and rebuild
  const project = new Project(settings, surfaces, content, worldPresentation)
  worldPresentation.rebuildAllStages()
  return project
}
```

Key difference from current: observer attachment is deferred until after entity import, avoiding per-entity world updates. `rebuildAllStages()` creates all world entities in one pass.
`importEntities()` handles wire connections internally via two-pass.

### Export Flow

```typescript
function exportProject(project: Project): ProjectExport {
  return {
    settings: project.settings.exportData(),
    entities: project.content.exportEntities(),
  }
}
```

## Deleted Components

- `Project` interface (the minimal interface; `UserProject` is renamed to `Project`)
- `ProjectUpdates` module
- `LazyLoadClass`
- `GlobalProjectEvents` singleton
- `localEvents` field on Project (replaced by typed `SimpleEvent` fields: `stageAdded`, `preStageDeleted`, `stageDeleted`)
- `project-event-listener.ts`
- Delegate methods on Project: `getSurface`, `getStageName`, `isSpacePlatform`, `numStages`, `lastStageFor`, `worldUpdates`, `updates`
- World entity methods on ProjectEntity: `getWorldOrPreviewEntity`, `getWorldEntity`, `replaceWorldEntity`, `replaceWorldOrPreviewEntity`, `destroyWorldOrPreviewEntity`, `destroyAllWorldOrPreviewEntities`, `hasWorldEntityInRange`, `iterateWorldOrPreviewEntities`, `hasErrorAt`
- Extra entity methods on ProjectEntity: `getExtraEntity`, `replaceExtraEntity`, `destroyExtraEntity`, `destroyAllExtraEntities`, `hasAnyExtraEntities`

## Verification Checklist

- [ ] No minimal `Project` interface exists (current `UserProject` renamed to `Project`)
- [ ] No `ProjectUpdates` module exists
- [ ] `LazyLoadClass` is deleted
- [ ] No delegate methods on Project
- [ ] `project-event-listener.ts` is deleted
- [ ] No `GlobalProjectEvents` singleton
- [ ] No `localEvents` field on Project (replaced by typed `SimpleEvent` fields)
- [ ] `ProjectList.ts` exports module-level `GlobalEvent` instances (not `SimpleEvent`, not instance fields)
- [ ] Import/export uses `ProjectSettings.exportData()` and `content.exportEntities()`
- [ ] All entity mutations go through `MutableProjectContent`
- [ ] `MutableProjectContent` has no LuaEntity references or business logic
- [ ] All validation and coordination logic is in `ProjectActions`
- [ ] No direct mutation of `ProjectEntity` from outside content module
- [ ] External code cannot call `InternalProjectEntity` methods without casting
- [ ] Stage operations in `Project` call components directly in order (not via observer)
- [ ] Per-project stage events (`SimpleEvent`) are only used by UI/external components
