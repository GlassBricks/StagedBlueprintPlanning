# Phase 3: Project Structure Implementation Plan

## Overview

Extract `ProjectSettings`, `ProjectSurfaces`, `BlueprintBookTemplate`, and `ProjectList` from the `UserProject` god object. Replace `GlobalProjectEvents`/`localEvents` with `ProjectLifecycleObserver` pattern and `ProjectList` events. Restructure `Project` and `Stage` to match the target state.

This phase works against the current codebase (no Phase 1-2 changes). The old pipeline (`UserActions`, `ProjectUpdates`, `WorldUpdates`) remains functional and is still accessed via the Project.

## Current State Analysis

`UserProjectImpl` (src/project/UserProject.ts) owns:
- Settings: `name`, `landfillTile`, `stagedTilesEnabled`, `defaultBlueprintSettings`, `surfaceSettings`
- Surface management: delegated to `StageImpl.create()` which calls `createStageSurface()`
- Blueprint book template: inventory management methods
- Stage lifecycle: `insertStage()`, `deleteStage()`, `mergeStage()`, `discardStage()`
- Event dispatching: `localEvents` (per-project) + `GlobalProjectEvents` (singleton)
- Module refs: `actions`, `updates`, `worldUpdates` (via `LazyLoadClass`)

`ProjectDef.d.ts` defines minimal `Project` interface + `UserProject` extending it with everything.

Event subscribers:
- `project-event-listener.ts`: stage rebuild, space platform init
- `player-project-data.ts`: cleanup on project-deleted
- `player-current-stage.ts`: update players on project/stage deletion
- `StageSelector.tsx`: re-setup on stage-added/deleted (via `localEvents`)
- `StageReferencesBox.tsx`: re-setup on any local event (via `localEvents`)
- `AllProjects.tsx`: project-created/deleted/reordered (via `ProjectEvents`)

### Key Discoveries:
- `project-event-listener.ts:25-54` handles stage-added → `worldUpdates.rebuildStage()`, stage-deleted → rebuild adjacent, project-created → `initSpacePlatform()`
- `StageSelector.tsx:60` subscribes to `project.localEvents`
- `StageReferencesBox.tsx:38` subscribes to `project.localEvents`
- `AllProjects.tsx:273-282` subscribes to `ProjectEvents` for project-level events
- `player-current-stage.ts:49-65` subscribes to `ProjectEvents` for deletion cleanup
- `player-project-data.ts:30-36` subscribes to `ProjectEvents` for deletion cleanup
- Blueprint book template logic spans UserProject.ts lines 260-335

## Desired End State

After this phase:
- `ProjectSettings` class owns all settings + `BlueprintBookTemplate`
- `ProjectSurfaces` class manages surface lifecycle, observes stage name changes
- `ProjectList` class manages project collection, emits events
- `Project` (renamed from `UserProject`) coordinates stage lifecycle by calling components directly
- `ProjectLifecycleObserver` replaces `localEvents` for UI components
- `ProjectList` events replace `GlobalProjectEvents` for project-level lifecycle
- `project-event-listener.ts` deleted; its logic moved into `Project` methods
- `ProjectDef.d.ts` deleted; types live in their implementing files
- `Stage` is a lightweight accessor

### Verification:
- All existing tests pass
- New unit tests for `ProjectSettings`, `BlueprintBookTemplate`, `ProjectSurfaces`, `ProjectList`
- No `GlobalProjectEvents` or `localEvents` references remain
- `project-event-listener.ts` deleted

## What We're NOT Doing

- Phase 1 content layer changes (`MutableProjectContent` mutation methods, `ContentObserver`, `InternalProjectEntity`)
- Phase 2 presentation layer changes (`EntityStorage`, `WorldPresentation`)
- Phase 4 wiring (`ProjectActions`, feature flag)
- Changing `event-handlers.ts` dispatch (still calls old `UserActions`)
- Moving entity files to `content/` module (Phase 5)

## Implementation Approach

Incremental extraction: each sub-phase extracts one component, delegates from `Project`, and all tests pass before proceeding. The event system replacement happens last since it touches the most files.

## Phase 3a: Extract ProjectSettings + BlueprintBookTemplate

### Overview
Extract settings properties and blueprint book template management from `UserProjectImpl` into `ProjectSettings` and `BlueprintBookTemplate` classes together. `BlueprintBookTemplate` is owned by `ProjectSettings` from the start, avoiding an intermediate state where it lives on `Project` directly.

### Changes Required:

#### 1. Create `BlueprintBookTemplate` class
**File**: `src/project/BlueprintBookTemplate.ts`

```typescript
interface StageProvider {
  getAllStages(): readonly Stage[]
  getStage(stageNumber: StageNumber): Stage | nil
}

@RegisterClass("BlueprintBookTemplate")
class BlueprintBookTemplate {
  private inventory?: LuaInventory

  get(): LuaItemStack | nil
  getOrCreate(stages: StageProvider): LuaItemStack
  reset(): void
  onStageInserted(stageNumber: StageNumber, stages: StageProvider): void
  onProjectNameChanged(name: string, oldName: string): void
  destroy(): void
}
```

Move logic from `UserProjectImpl`:
- `getBlueprintBookTemplate()` → `get()`
- `getOrCreateBlueprintBookTemplate()` → `getOrCreate(stages)`
- `resetBlueprintBookTemplate()` → `reset()`
- `setInitialBlueprintBookTemplate()` → private `setInitial()`
- `addStageToBlueprintBookTemplate()` → `onStageInserted()`
- `pushBpBookInventory()` → private `pushInventory()`
- `onNameChange()` template logic → `onProjectNameChanged()`

#### 2. Create `ProjectSettings` class
**File**: `src/project/ProjectSettings.ts`

```typescript
interface StageSettingsData {
  blueprintOverrideSettings: OverrideTable<OverrideableBlueprintSettings>
  stageBlueprintSettings: StageBlueprintSettings
}

@RegisterClass("ProjectSettings")
class ProjectSettings implements ProjectSettingsWriter {
  readonly projectName: MutableProperty<string>
  readonly landfillTile: MutableProperty<string | nil>
  readonly stagedTilesEnabled: MutableProperty<boolean>
  readonly defaultBlueprintSettings: MutableProperty<OverrideableBlueprintSettings>
  readonly surfaceSettings: Property<SurfaceSettings>
  readonly blueprintBookTemplate: BlueprintBookTemplate

  private stageNames: MutableProperty<string>[]
  private stageSettings: MutableProperty<StageSettingsData>[]

  constructor(name: string, surfaceSettings: SurfaceSettings)

  stageCount(): StageNumber
  getStageName(stage: StageNumber): LocalisedString
  getStageNameProperty(stage: StageNumber): MutableProperty<string>
  getStageSettings(stage: StageNumber): MutableProperty<StageSettingsData>
  isSpacePlatform(): boolean

  insertStageSettings(stage: StageNumber, name: string): void
  removeStageSettings(stage: StageNumber): void

  displayName(): Property<LocalisedString>
}
```

Move from `UserProjectImpl`:
- `name` → `projectName`
- `landfillTile`, `stagedTilesEnabled`, `defaultBlueprintSettings` → direct fields
- `surfaceSettings` → stored as property
- `_getNewStageName()` → helper used by `insertStageSettings()`
- `displayName()` and `getDisplayName()` → on `ProjectSettings`
- `isSpacePlatform()` → on `ProjectSettings`

Move from `StageImpl`:
- `blueprintOverrideSettings`, `stageBlueprintSettings` → stored in `ProjectSettings.stageSettings[]`
- `name` property → stored in `ProjectSettings.stageNames[]`

#### 3. Update `UserProjectImpl`
**File**: `src/project/UserProject.ts`

- Add `readonly settings: ProjectSettings` field, constructed in constructor
- Remove extracted fields: `name`, `landfillTile`, `stagedTilesEnabled`, `defaultBlueprintSettings`, `surfaceSettings`, `blueprintBookTemplateInv`, and all blueprint book methods
- Delegate `displayName()`, `isSpacePlatform()`, `getStageName()` to `settings`
- `numStages()` delegates to `settings.stageCount()`
- `insertStage()`: calls `settings.insertStageSettings()` for the name/settings, calls `settings.blueprintBookTemplate.onStageInserted()`
- `deleteStage()`: calls `settings.removeStageSettings()`
- `delete()`: calls `settings.blueprintBookTemplate.destroy()`
- `onNameChange()`: subscribe to `settings.projectName`, call `settings.blueprintBookTemplate.onProjectNameChanged()`

#### 4. Update `StageImpl`
- Remove `name` property (now comes from `settings.getStageNameProperty(stageNumber)`)
- Remove `blueprintOverrideSettings`, `stageBlueprintSettings` (now from `settings.getStageSettings(stageNumber)`)
- Add getters that delegate to `project.settings`

#### 5. Update `ProjectDef.d.ts`
Add `settings: ProjectSettings` to interfaces. Keep backward-compatible delegate methods during this phase.

#### 6. Update callers
Callers that access `project.name` → `project.settings.projectName`
Callers that access `stage.name` → `project.settings.getStageNameProperty(stageNumber)` (or keep Stage delegation)
Callers that access `project.landfillTile` etc. → `project.settings.landfillTile`

**File**: `src/ui/ProjectSettings.tsx`
- `editBlueprintBookTemplate()`: `project.getOrCreateBlueprintBookTemplate()` → `project.settings.blueprintBookTemplate.getOrCreate(project)`
- `resetBlueprintBookTemplate()`: `project.resetBlueprintBookTemplate()` → `project.settings.blueprintBookTemplate.reset()`

**File**: `src/blueprints/blueprint-creation.ts`
- `addBlueprintBookTasks()`: `project.getBlueprintBookTemplate()` → `project.settings.blueprintBookTemplate.get()`

#### 7. Add migration
**File**: `src/project/index.ts`

Single migration to construct both `BlueprintBookTemplate` and `ProjectSettings` from fields scattered across `UserProjectImpl` and `StageImpl`.

```typescript
Migrations.to($CURRENT_VERSION)(() => {
  for (const project of getAllProjects()) {
    const raw = project as any
    if (!raw.settings) {
      const blueprintBookTemplate = raw.blueprintBookTemplateInv
        ? BlueprintBookTemplate._fromExistingInventory(raw.blueprintBookTemplateInv)
        : new BlueprintBookTemplate()
      raw.settings = ProjectSettings._fromExisting({
        name: raw.name,
        landfillTile: raw.landfillTile,
        stagedTilesEnabled: raw.stagedTilesEnabled,
        defaultBlueprintSettings: raw.defaultBlueprintSettings,
        surfaceSettings: raw.surfaceSettings,
        blueprintBookTemplate,
        stages: raw.stages, // extract per-stage names and settings
      })
      delete raw.blueprintBookTemplateInv
      // delete other migrated fields from project
    }
  }
})
```

#### 8. Add tests
**File**: `src/test/project/BlueprintBookTemplate.test.ts`

Unit tests for `BlueprintBookTemplate`:
- `get()` returns nil initially
- `getOrCreate()` creates book with correct stage references
- `reset()` destroys inventory, subsequent `get()` returns nil
- `onProjectNameChanged()` updates label when label matches old name
- `onProjectNameChanged()` does not update label when label differs
- `onStageInserted()` inserts reference at correct position (middle, beginning, end)
- `onStageInserted()` handles empty slots and inventory expansion

**File**: `src/test/project/ProjectSettings.test.ts`

Unit tests for `ProjectSettings`:
- Constructor initializes all properties correctly
- `stageCount()` returns correct count
- `getStageName()` / `getStageNameProperty()` return correct values
- `insertStageSettings()` generates correct name via naming convention detection, shifts subsequent entries
- `removeStageSettings()` removes entry and shifts
- `displayName()` returns name when non-empty, localized placeholder when empty
- `isSpacePlatform()` returns correct value for normal and space platform settings
- `getStageSettings()` returns blueprint override and stage blueprint settings

Move existing "new stage name" tests from `UserProject.test.ts` to `ProjectSettings.test.ts` (or keep both, with UserProject tests exercising via delegation).

Existing `blueprintBookTemplate` tests in `UserProject.test.ts` should continue passing via delegate methods.

### Success Criteria:

#### Automated Verification:
- [ ] `pnpm run test` passes
- [ ] `pnpm run lint` passes
- [ ] `pnpm run format:fix` passes
- [ ] New unit tests in `src/test/project/BlueprintBookTemplate.test.ts`
- [ ] New unit tests in `src/test/project/ProjectSettings.test.ts`

---

## Phase 3b: Extract ProjectSurfaces

### Overview
Extract surface creation/deletion/naming from `StageImpl.create()` and `UserProjectImpl` into `ProjectSurfaces` class.

### Changes Required:

#### 1. Create `ProjectSurfaces` class
**File**: `src/project/ProjectSurfaces.ts`

```typescript
@RegisterClass("ProjectSurfaces")
class ProjectSurfaces implements SurfaceManager {
  private surfaces: LuaSurface[]

  constructor(settings: ProjectSettings)

  getSurface(stage: StageNumber): LuaSurface | nil
  getAllSurfaces(): readonly LuaSurface[]
  createSurface(stage: StageNumber, stageName: string, area: BoundingBox | nil): LuaSurface
  deleteSurface(stage: StageNumber): void
  insertSurface(stage: StageNumber, stageName: string, area: BoundingBox | nil): LuaSurface
  updateSurfaceName(stage: StageNumber, stageName: string): void
}
```

- Wraps `createStageSurface()` and `destroySurface()` from `surfaces.ts`
- Subscribes to stage name changes from `settings` to update surface names
- Subscribes to project name changes from `settings` to update all surface names
- Manages the ordered list of surfaces

#### 2. Update `StageImpl`
- Remove `surface` storage from `StageImpl` constructor (surface comes from `project.surfaces.getSurface(stageNumber)`)
- Remove `StageImpl.create()` static method (surface creation moves to `ProjectSurfaces`)
- `surface` getter delegates to `project.surfaces.getSurface(this.stageNumber)`
- Remove `registerEvents()` / `onNameChange()` (surface name sync moves to `ProjectSurfaces`)

#### 3. Update `UserProjectImpl`
- Add `readonly surfaces: ProjectSurfaces` field
- Constructor: create surfaces via `this.surfaces.createSurface()` instead of `StageImpl.create()`
- `insertStage()`: call `this.surfaces.insertSurface()` instead of `StageImpl.create()`
- `deleteStage()`: call `this.surfaces.deleteSurface()` after stage cleanup
- Remove `onNameChange()` surface update logic (now in `ProjectSurfaces`)
- `getSurface()` delegates to `this.surfaces.getSurface()`

#### 4. Update `storage.surfaceIndexToStage` mapping
Currently populated in `StageImpl` constructor. Move to `Project` level — `Project` manages the `surfaceIndexToStage` mapping when creating/deleting stages.

#### 5. Add migration
**File**: `src/project/index.ts`

Migration to construct `ProjectSurfaces` from existing per-stage surface references. For each project, collect the ordered surface list from stages and wrap in a `ProjectSurfaces` instance.

```typescript
Migrations.to($CURRENT_VERSION)(() => {
  for (const project of getAllProjects()) {
    const raw = project as any
    if (!raw.surfaces) {
      const surfaces: LuaSurface[] = []
      for (const [, stage] of pairs(raw.stages)) {
        surfaces[stage.stageNumber - 1] = stage.surface
      }
      raw.surfaces = ProjectSurfaces._fromExisting(surfaces, raw.settings)
      // remove surface field from each stage
    }
  }
})
```

#### 6. Add tests
**File**: `src/test/project/ProjectSurfaces.test.ts`

Unit tests for `ProjectSurfaces`:
- `createSurface()` creates a valid surface with correct name
- `getSurface()` returns correct surface by stage number
- `getAllSurfaces()` returns ordered list
- `insertSurface()` creates surface, shifts existing surfaces in the array
- `deleteSurface()` destroys surface and shifts array
- Surface name updates when stage name property changes
- Surface name updates when project name property changes
- `deleteSurface()` on last remaining surface

### Success Criteria:

#### Automated Verification:
- [ ] `pnpm run test` passes
- [ ] `pnpm run lint` passes
- [ ] `pnpm run format:fix` passes
- [ ] New unit tests in `src/test/project/ProjectSurfaces.test.ts`

---

## Phase 3c: Extract ProjectList

### Overview
Extract project list management from module-level functions into `ProjectList` class with typed events.

### Changes Required:

#### 1. Create `ProjectList` class
**File**: `src/project/ProjectList.ts`

```typescript
@RegisterClass("ProjectList")
class ProjectList {
  readonly projectCreated: SimpleEvent<Project>
  readonly projectDeleted: SimpleEvent<Project>
  readonly projectsReordered: SimpleEvent<{ project1: Project; project2: Project }>

  getAll(): readonly Project[]
  count(): number
  getById(id: ProjectId): Project | nil
  add(project: Project): void
  remove(project: Project): void
  moveUp(project: Project): boolean
  moveDown(project: Project): boolean
}
```

Storage changes:
- `storage.projects` array management moves into `ProjectList`
- `storage.nextProjectId` management stays in `Project.create()` or moves to `ProjectList.add()`

#### 2. Replace module-level functions
**File**: `src/project/UserProject.ts`
- Remove `getAllProjects()`, `moveProjectUp()`, `moveProjectDown()`, `swapProjects()`
- Remove `UserProjectImpl.onProjectCreated()` static method
- `UserProjectImpl.create()`: calls `projectList.add(project)` which raises `projectCreated`
- `UserProjectImpl.delete()`: calls `projectList.remove(this)` which raises `projectDeleted`

#### 3. Export `projectList` singleton
**File**: `src/project/ProjectList.ts`
Export a singleton `projectList` instance (stored in `storage`).

#### 4. Update callers
- `AllProjects.tsx:31`: `getAllProjects` → `projectList.getAll()`
- `AllProjects.tsx:31`: `moveProjectUp/Down` → `projectList.moveUp/Down()`
- All `ProjectEvents.addListener` calls → subscribe to `projectList` events
- `project-refs.ts`: `getProjectById` → `projectList.getById()`

#### 5. Add migration
**File**: `src/project/index.ts`

Migration to wrap `storage.projects` array in a `ProjectList` instance. `ProjectList` takes ownership of the existing array.

```typescript
Migrations.to($CURRENT_VERSION)(() => {
  if (!storage.projectList) {
    storage.projectList = ProjectList._fromExisting(storage.projects)
  }
})
```

#### 6. Add tests
**File**: `src/test/project/ProjectList.test.ts`

Unit tests for `ProjectList`:
- `add()` appends to list and fires `projectCreated` event
- `remove()` removes from list and fires `projectDeleted` event
- `getAll()` returns readonly list in insertion order
- `count()` returns correct count
- `getById()` returns project by id, nil for missing id
- `moveUp()` swaps with previous, fires `projectsReordered`, returns true; returns false at start
- `moveDown()` swaps with next, fires `projectsReordered`, returns true; returns false at end

### Success Criteria:

#### Automated Verification:
- [ ] `pnpm run test` passes
- [ ] `pnpm run lint` passes
- [ ] `pnpm run format:fix` passes
- [ ] New unit tests in `src/test/project/ProjectList.test.ts`

---

## Phase 3d: Replace Event System

### Overview
Replace `GlobalProjectEvents` and `localEvents` with `ProjectLifecycleObserver` for UI components and `ProjectList` events for project-level lifecycle. Move `project-event-listener.ts` logic into `Project` methods.

### Changes Required:

#### 1. Define `ProjectLifecycleObserver` interface
**File**: `src/project/ProjectLifecycleObserver.ts`

```typescript
interface ProjectLifecycleObserver {
  onStageAdded?(stage: Stage): void
  onPreStageDeleted?(stage: Stage): void
  onStageDeleted?(stage: Stage): void
}
```

#### 2. Add observer management to `Project`
**File**: `src/project/UserProject.ts`

```typescript
private readonly lifecycleObservers = new LuaSet<ProjectLifecycleObserver>()
addLifecycleObserver(observer: ProjectLifecycleObserver): void
removeLifecycleObserver(observer: ProjectLifecycleObserver): void
```

#### 3. Move `project-event-listener.ts` logic into `Project`
**File**: `src/project/UserProject.ts`

`insertStage()`:
- After all other work, call `this.worldUpdates.rebuildStage(stageNumber)` (was in project-event-listener; Phase 2 renames to `this.worldPresentation.rebuildStage()`)
- If `hub` exists, call `this.actions.rebuildEntity(hub, stageNumber)` (was in project-event-listener)
- Notify `lifecycleObservers.onStageAdded(newStage)`

`deleteStage()`:
- Before deletion: notify `lifecycleObservers.onPreStageDeleted(stage)`
- After deletion + content update: `this.worldUpdates.rebuildStage(adjacentStage)` (was in project-event-listener; Phase 2 renames to `this.worldPresentation.rebuildStage()`)
- After all cleanup: notify `lifecycleObservers.onStageDeleted(stage)`

`Project.create()`:
- If space platform: call `initSpacePlatform()` directly (was in project-event-listener)

Delete `project-event-listener.ts`.

#### 4. Update `StageSelector.tsx`
Replace `project.localEvents.subscribe()` with `ProjectLifecycleObserver`:

```typescript
private observer: ProjectLifecycleObserver = {
  onStageAdded: () => this.setup(),
  onStageDeleted: () => this.setup(),
}
// In setup():
project.addLifecycleObserver(this.observer)
// In cleanup:
project.removeLifecycleObserver(this.observer)
```

#### 5. Update `StageReferencesBox.tsx`
Same pattern — register as `ProjectLifecycleObserver` for stage-added/deleted events to call `setup()`.

#### 6. Update `AllProjects.tsx`
Replace `ProjectEvents.addListener()` with `projectList` event subscriptions:

```typescript
projectList.projectCreated.subscribe(subscription, ...)
projectList.projectDeleted.subscribe(subscription, ...)
projectList.projectsReordered.subscribe(subscription, ...)
```

#### 7. Update `player-project-data.ts`
Replace `ProjectEvents.addListener()` with `projectList.projectDeleted.subscribe()`.

#### 8. Update `player-current-stage.ts`
Replace `ProjectEvents.addListener()` with:
- `projectList.projectDeleted.subscribe()` → update all players
- Stage deletion handling: `Project` lifecycle now notifies observers. But `player-current-stage.ts` currently handles "stage-deleted" via `ProjectEvents` to update all players. This should instead subscribe to `on_player_changed_surface` (which already exists at line 48) — when a stage is deleted, its surface is destroyed, triggering `on_player_changed_surface`. The existing handler already calls `updatePlayer()`. So the `ProjectEvents` subscription for "stage-deleted" is redundant with the surface deletion event and can be removed. Only "project-deleted" needs explicit handling via `projectList.projectDeleted`.

#### 9. Delete old event types and fields
- Remove `localEvents` field from `UserProjectImpl`
- Remove `GlobalProjectEvents` and `ProjectEvents` exports
- Remove event type definitions from `ProjectDef.d.ts`: `ProjectCreatedEvent`, `ProjectDeletedEvent`, etc.
- Remove `raiseEvent()` method

#### 10. Delete `project-event-listener.ts`
Remove file and its import from `src/project/index.ts`.

#### 11. Update tests
**File**: `src/test/project/UserProject.test.ts`

- Replace `ProjectEvents.addListener(eventListener)` / `ProjectEvents.removeListener(eventListener)` with `ProjectLifecycleObserver` registration
- Update "project created calls event" test to verify `projectList.projectCreated` fires
- Update "calls event" deletion test to verify `projectList.projectDeleted` fires
- Update "insert stage" test to verify `ProjectLifecycleObserver.onStageAdded` called
- Update "delete stage" test to verify `ProjectLifecycleObserver.onPreStageDeleted` called
- Remove assertions on `localEvents` (field no longer exists)
- Verify `initSpacePlatform()` is called during project creation (not via event listener)

No migration needed — this phase changes behavior (event dispatch) but not storage shape. The removal of `localEvents` from `UserProjectImpl` is handled by the 3b migration (or is a no-op since `SimpleEvent` instances don't persist meaningfully).

### Success Criteria:

#### Automated Verification:
- [ ] `pnpm run test` passes
- [ ] `pnpm run lint` passes
- [ ] `pnpm run format:fix` passes
- [ ] No references to `GlobalProjectEvents`, `ProjectEvents`, or `localEvents` remain
- [ ] `project-event-listener.ts` deleted
- [ ] Updated tests in `src/test/project/UserProject.test.ts`

---

## Phase 3e: Restructure Project and Stage

### Overview
Final cleanup: rename `UserProject` → `Project`, delete `ProjectDef.d.ts`, make `Stage` a lightweight accessor.

### Changes Required:

#### 1. Restructure `Stage`
**File**: `src/project/UserProject.ts` (or new `src/project/Stage.ts`)

`Stage` becomes a lightweight accessor:
```typescript
@RegisterClass("Stage")
class Stage {
  readonly project: Project
  private _stageNumber: StageNumber

  get stageNumber(): StageNumber
  get surface(): LuaSurface
  get name(): Property<string>
  get nameProperty(): MutableProperty<string>
  get settings(): MutableProperty<StageSettingsData>

  _setStageNumber(stageNumber: StageNumber): void
}
```

Remove from `StageImpl`:
- `blueprintOverrideSettings`, `stageBlueprintSettings` (now in `ProjectSettings`)
- `getBlueprintSettingsView()` — move to a utility or keep on Stage as a convenience that delegates to `project.settings`
- `getBlueprintBBox()` — keep as convenience on Stage
- `getID()` — keep (needed for stage references in blueprints)
- `deleteByMerging()`, `discardInProject()` — remove; callers use `project.mergeStage()`/`discardStage()` directly
- `actions` field — remove; callers access `project.actions` directly

#### 2. Delete `ProjectDef.d.ts`
Move remaining type definitions to their implementing files:
- `ProjectId`, `StageId` → `src/project/Project.ts` (or `src/project/ProjectSettings.ts`)
- `Stage` interface → merged with `Stage` class
- `UserProject` interface → deleted (class is the type)
- Event types → already deleted in 3e

#### 3. Rename `UserProject` → `Project`
- Rename `UserProjectImpl` → `ProjectImpl` (or just `Project` since minimal interface is deleted)
- Keep `@RegisterClass("Assembly")` for storage compatibility
- Update all imports across codebase: `UserProject` → `Project`
- `createUserProject()` → `createProject()`
- `_deleteAllProjects()` remains as test utility

#### 4. Remove delegate methods from `Project`
Now that `ProjectSettings` and `ProjectSurfaces` exist, remove convenience delegates:
- `getSurface()` — callers use `project.surfaces.getSurface()`
- `getStageName()` — callers use `project.settings.getStageName()`
- `isSpacePlatform()` — callers use `project.settings.isSpacePlatform()`
- `numStages()` — callers use `project.settings.stageCount()`
- `lastStageFor()` — utility function, not a method on Project
- `displayName()` — callers use `project.settings.displayName()`

#### 5. Update all callers
Mechanical rename/import changes across the codebase. `project.name` → `project.settings.projectName`, etc.

#### 6. Add migration
**File**: `src/project/index.ts`

Migration for the `Stage` restructure. If `StageImpl` stored fields that are now removed (e.g., `surface`, `actions`, `blueprintOverrideSettings`), clean them up. The `@RegisterClass("Stage")` name is preserved so no class rename migration is needed. `@RegisterClass("Assembly")` is preserved for `Project`.

```typescript
Migrations.to($CURRENT_VERSION)(() => {
  for (const project of getAllProjects()) {
    for (const stage of project.getAllStages()) {
      const raw = stage as any
      // Remove fields that moved to ProjectSettings/ProjectSurfaces
      delete raw.surface
      delete raw.surfaceIndex
      delete raw.actions
      delete raw.blueprintOverrideSettings
      delete raw.stageBlueprintSettings
      // name property moved to ProjectSettings in 3b migration
    }
  }
})
```

#### 7. Update tests
- Rename all `UserProject` references to `Project` in test files
- `createUserProject()` → `createProject()`
- Update imports across all test files
- Replace `project.getSurface()` → `project.surfaces.getSurface()`, etc.
- Replace `stage.actions` → `project.actions` in tests
- Replace `stage.deleteByMerging()` → `project.mergeStage(stage.stageNumber)` in tests

### Success Criteria:

#### Automated Verification:
- [ ] `pnpm run test` passes
- [ ] `pnpm run lint` passes
- [ ] `pnpm run format:fix` passes
- [ ] No `ProjectDef.d.ts` file exists
- [ ] No `UserProject` type references remain (except `@RegisterClass("Assembly")`)
- [ ] No delegate methods on `Project` for settings/surfaces

#### Manual Verification:
- [ ] Mod loads correctly in Factorio
- [ ] Can create project, add/delete stages, all UI functional

---

## Migration Strategy

Each sub-phase includes its own migration step in `src/project/index.ts` using `Migrations.to($CURRENT_VERSION)`. Migrations run in order and each handles the storage shape changes for that phase. Key considerations:

- `ProjectSettings` + `BlueprintBookTemplate` (3a): wraps settings fields and `blueprintBookTemplateInv` from `UserProjectImpl` + per-stage settings from `StageImpl`
- `ProjectSurfaces` (3b): wraps per-stage surface references
- `ProjectList` (3c): wraps `storage.projects` array
- `Stage` restructure (3e): removes fields that moved to other components
- Phase 3d (event system) has no storage changes

If multiple sub-phases ship together in a single version, their migrations can be consolidated into one `Migrations.to($CURRENT_VERSION)` block.

## References

- Target state: `./separation-of-concerns-target-state.md`
- Phasing plan: `./separation-of-concerns-phases.md`
