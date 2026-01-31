# Phase 3: Project Structure Implementation Plan

## Overview

Extract `ProjectSettings`, `ProjectSurfaces`, and `BlueprintBookTemplate` from the `UserProject` god object. Move project list management to a dedicated `ProjectList.ts` module with flat exported functions and module-level `GlobalEvent` exports. Replace `GlobalProjectEvents`/`localEvents` with these module-level events and per-project `SimpleEvent` fields. Restructure `Project` and `Stage` to match the target state.

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
- Module-level functions in `ProjectList.ts` manage project collection; module-level `GlobalEvent` exports replace `GlobalProjectEvents`
- `Project` (renamed from `UserProject`) coordinates stage lifecycle by calling components directly
- Per-project `SimpleEvent` fields (`stageAdded`, `preStageDeleted`, `stageDeleted`) replace `localEvents` for UI components
- Module-level `GlobalEvent` exports in `ProjectList.ts` replace `GlobalProjectEvents` for project-level lifecycle
- `project-event-listener.ts` deleted; its logic moved into `Project` methods
- `ProjectDef.d.ts` deleted; types live in their implementing files
- `Stage` is a lightweight accessor with `getFoo()` methods (no property-style accessors)
- All callers use new API paths directly (e.g., `project.settings.projectName`, `project.surfaces.getSurface()`) — no delegation layer on `Project`

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

Incremental extraction: each sub-phase extracts one component, eagerly migrates all callers to the new API (no temporary delegation layer), and all tests pass before proceeding. The event system replacement happens last since it touches the most files.

For wide-reaching mechanical refactors (e.g., `project.name` → `project.settings.projectName`), use ast-grep, regex search-replace, or parallel haiku agents to efficiently update all call sites.

### Commits

Make a commit after every stage passes.

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
- Remove `displayName()`, `isSpacePlatform()`, `getStageName()`, `numStages()` — no delegation, callers migrated directly
- `insertStage()`: calls `settings.insertStageSettings()` for the name/settings, calls `settings.blueprintBookTemplate.onStageInserted()`
- `deleteStage()`: calls `settings.removeStageSettings()`
- `delete()`: calls `settings.blueprintBookTemplate.destroy()`
- `onNameChange()`: subscribe to `settings.projectName`, call `settings.blueprintBookTemplate.onProjectNameChanged()`

#### 4. Update `StageImpl`
- Remove `name` property (now comes from `settings.getStageNameProperty(stageNumber)`)
- Remove `blueprintOverrideSettings`, `stageBlueprintSettings` (now from `settings.getStageSettings(stageNumber)`)
- No delegation methods — callers migrated to access `project.settings` directly or via Stage accessor methods

#### 5. Update `ProjectDef.d.ts`
Add `settings: ProjectSettings` to interfaces. Remove extracted fields and methods from interfaces (no backward-compatible delegates).

#### 6. Migrate all callers (mechanical refactor)
Use ast-grep, regex search-replace, or parallel haiku agents for these bulk migrations:

**Project property migrations (~80 call sites across ~25 files):**
- `project.name` → `project.settings.projectName`
- `project.landfillTile` → `project.settings.landfillTile`
- `project.stagedTilesEnabled` → `project.settings.stagedTilesEnabled`
- `project.defaultBlueprintSettings` → `project.settings.defaultBlueprintSettings`
- `project.surfaceSettings` → `project.settings.surfaceSettings`
- `project.numStages()` → `project.settings.stageCount()`
- `project.displayName()` → `project.settings.displayName()`
- `project.isSpacePlatform()` → `project.settings.isSpacePlatform()`
- `project.getStageName(` → `project.settings.getStageName(`

**Stage property migrations (~120 call sites across ~20 files):**
- `stage.name` → `stage.getName()` (Stage keeps a thin accessor that calls `project.settings.getStageNameProperty(stageNumber)`)
- `stage.blueprintOverrideSettings` → `stage.getSettings().blueprintOverrideSettings` (or callers access `project.settings` directly)
- `stage.stageBlueprintSettings` → `stage.getSettings().stageBlueprintSettings`

**Blueprint book method migrations (~15 call sites across ~3 files):**
- `project.getBlueprintBookTemplate()` → `project.settings.blueprintBookTemplate.get()`
- `project.getOrCreateBlueprintBookTemplate()` → `project.settings.blueprintBookTemplate.getOrCreate(project)`
- `project.resetBlueprintBookTemplate()` → `project.settings.blueprintBookTemplate.reset()`

#### 7. Add tests
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

Existing `blueprintBookTemplate` tests in `UserProject.test.ts` should be updated to use the new API paths (e.g., `project.settings.blueprintBookTemplate.get()`).

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
- Keep `getSurface()` accessor method that delegates to `project.surfaces.getSurface(this.stageNumber)`
- Remove `registerEvents()` / `onNameChange()` (surface name sync moves to `ProjectSurfaces`)

#### 3. Update `UserProjectImpl`
- Add `readonly surfaces: ProjectSurfaces` field
- Constructor: create surfaces via `this.surfaces.createSurface()` instead of `StageImpl.create()`
- `insertStage()`: call `this.surfaces.insertSurface()` instead of `StageImpl.create()`
- `deleteStage()`: call `this.surfaces.deleteSurface()` after stage cleanup
- Remove `onNameChange()` surface update logic (now in `ProjectSurfaces`)
- Remove `getSurface()` method — no delegation, callers migrated directly

#### 4. Update `storage.surfaceIndexToStage` mapping
Currently populated in `StageImpl` constructor. Move to `Project` level — `Project` manages the `surfaceIndexToStage` mapping when creating/deleting stages.

#### 5. Migrate all callers (mechanical refactor)
Use ast-grep, regex search-replace, or parallel haiku agents for these bulk migrations:

**Project surface migrations (~60 call sites across ~15 files):**
- `project.getSurface(` → `project.surfaces.getSurface(`

**Stage surface migrations (~63 call sites across ~22 files):**
- `stage.surface` → `stage.getSurface()` (Stage keeps accessor method)

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

## Phase 3c: ProjectList Module

### Overview
Move project list management from `UserProject.ts` to a dedicated `ProjectList.ts` module with flat exported functions and module-level `GlobalEvent` exports. `GlobalEvent` is used because all subscribers are module-level listeners that register raw functions at module load time and re-register every load — no `Func` wrappers or storable subscriptions needed. Module-level `globalEvent()` calls are initialized once at module load; no re-creation on save/load needed.

### Changes Required:

#### 1. Create `ProjectList.ts` module
**File**: `src/project/ProjectList.ts`

```typescript
declare const storage: {
  projects: Project[]
}

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

Functions operate directly on `storage.projects`. `storage.nextProjectId` management stays in `Project.create()`.

#### 2. Move functions from `UserProject.ts`
**File**: `src/project/UserProject.ts`
- Remove `getAllProjects()`, `moveProjectUp()`, `moveProjectDown()`, `swapProjects()`
- Remove `UserProjectImpl.onProjectCreated()` static method
- `UserProjectImpl.create()`: calls `addProject(project)` which raises `projectCreated`
- `UserProjectImpl.delete()`: calls `removeProject(this)` which raises `projectDeleted`

#### 3. Move `getProjectById` from `project-refs.ts`
**File**: `src/project/project-refs.ts`
- `getProjectById` moves to `ProjectList.ts` (alongside the other project collection functions)

#### 4. Update callers
- `AllProjects.tsx:31`: import `getAllProjects`, `moveProjectUp`, `moveProjectDown` from `ProjectList`
- All `ProjectEvents.addListener` calls → import specific event (`projectCreated`, `projectDeleted`, `projectsReordered`) and call `.addListener()`

#### 5. Add tests
**File**: `src/test/project/ProjectList.test.ts`

Unit tests:
- `addProject()` appends to list and fires `projectCreated` event
- `removeProject()` removes from list and fires `projectDeleted` event
- `getAllProjects()` returns readonly list in insertion order
- `getProjectCount()` returns correct count
- `getProjectById()` returns project by id, nil for missing id
- `moveProjectUp()` swaps with previous, fires `projectsReordered`, returns true; returns false at start
- `moveProjectDown()` swaps with next, fires `projectsReordered`, returns true; returns false at end

### Success Criteria:

#### Automated Verification:
- [ ] `pnpm run test` passes
- [ ] `pnpm run lint` passes
- [ ] `pnpm run format:fix` passes
- [ ] New unit tests in `src/test/project/ProjectList.test.ts`

---

## Phase 3d: Replace Event System

### Overview
Replace `GlobalProjectEvents` and `localEvents` with two event types matching subscriber lifecycles: module-level `GlobalEvent` exports in `ProjectList.ts` for module-level listeners, and per-project `SimpleEvent` fields for GUI component subscribers. Move `project-event-listener.ts` logic into `Project` methods.

**Justification:** Two subscriber categories have different lifecycles:
- **Module-level listeners** (`player-project-data.ts`, `player-current-stage.ts`, `AllProjects.tsx`): Register raw functions at module load, re-registered every load. `GlobalEvent` avoids `Func` wrappers and storable subscription concerns. Using `SimpleEvent` here would cause double-registration on save/load (stored subscriptions persist, module re-registers).
- **Per-project GUI subscribers** (`StageSelector.tsx`, `StageReferencesBox.tsx`): Subscribe via `Subscription` from render context. `SimpleEvent` enables automatic cleanup through `Subscription.close()` on GUI destruction. An observer-set pattern would risk zombie references (GUI instances serialized into the set, invalid after load).

### Changes Required:

#### 1. Add per-project stage lifecycle events to `Project`
**File**: `src/project/UserProject.ts`

```typescript
readonly stageAdded = new SimpleEvent<Stage>()
readonly preStageDeleted = new SimpleEvent<Stage>()
readonly stageDeleted = new SimpleEvent<Stage>()
```

These are `SimpleEvent` (storable, `@RegisterClass("ObserverList")`). Subscribers use `event.subscribe(subscription, func)` with `Func` wrappers. Subscriptions are cleaned up when the GUI `Subscription` is closed.

#### 2. Move `project-event-listener.ts` logic into `Project`
**File**: `src/project/UserProject.ts`

`insertStage()`:
- After all other work, call `this.worldUpdates.rebuildStage(stageNumber)` (was in project-event-listener; Phase 2 renames to `this.worldPresentation.rebuildStage()`)
- If `hub` exists, call `this.actions.rebuildEntity(hub, stageNumber)` (was in project-event-listener)
- Raise `this.stageAdded.raise(newStage)`

`deleteStage()`:
- Before deletion: raise `this.preStageDeleted.raise(stage)`
- After deletion + content update: `this.worldUpdates.rebuildStage(adjacentStage)` (was in project-event-listener; Phase 2 renames to `this.worldPresentation.rebuildStage()`)
- After all cleanup: raise `this.stageDeleted.raise(stage)`

`Project.create()`:
- If space platform: call `initSpacePlatform()` directly (was in project-event-listener)

Delete `project-event-listener.ts`.

#### 3. Update `StageSelector.tsx`
Replace `project.localEvents.subscribe()` with per-project `SimpleEvent` subscriptions:

```typescript
project.stageAdded.subscribe(subscription, ibind(this.setup))
project.stageDeleted.subscribe(subscription, ibind(this.setup))
```

Same subscription lifecycle as current `localEvents` — subscription is tied to the render context and cleaned up on GUI destruction.

#### 4. Update `StageReferencesBox.tsx`
Same pattern — subscribe to `project.stageAdded` and `project.stageDeleted` with `subscription` from render context.

#### 5. Update `AllProjects.tsx`
Replace `ProjectEvents.addListener()` with `ProjectList.ts` module event listeners:

```typescript
projectCreated.addListener(...)
projectDeleted.addListener(...)
projectsReordered.addListener(...)
```

Same lifecycle as current `GlobalProjectEvents` — raw functions, re-registered every load.

#### 6. Update `player-project-data.ts`
Replace `ProjectEvents.addListener()` with `projectDeleted.addListener(...)` (imported from `ProjectList.ts`).

#### 7. Update `player-current-stage.ts`
Replace `ProjectEvents.addListener()` with:
- `projectDeleted.addListener(...)` (imported from `ProjectList.ts`) → update all players
- Stage deletion handling: `Project` lifecycle now raises `stageDeleted`. But `player-current-stage.ts` currently handles "stage-deleted" via `ProjectEvents` to update all players. This should instead rely on `on_player_changed_surface` (which already exists at line 48) — when a stage is deleted, its surface is destroyed, triggering `on_player_changed_surface`. The existing handler already calls `updatePlayer()`. So the `ProjectEvents` subscription for "stage-deleted" is redundant with the surface deletion event and can be removed. Only "project-deleted" needs explicit handling via `projectList.projectDeleted`.

#### 8. Delete old event types and fields
- Remove `localEvents` field from `UserProjectImpl`
- Remove `GlobalProjectEvents` and `ProjectEvents` exports
- Remove event type definitions from `ProjectDef.d.ts`: `ProjectCreatedEvent`, `ProjectDeletedEvent`, etc.
- Remove `raiseEvent()` method

#### 9. Delete `project-event-listener.ts`
Remove file and its import from `src/project/index.ts`.

#### 10. Update tests
**File**: `src/test/project/UserProject.test.ts`

- Update "project created calls event" test to verify `projectCreated` fires (use `addListener` / `removeListener`)
- Update "calls event" deletion test to verify `projectDeleted` fires
- Update "insert stage" test to verify `project.stageAdded` fires (use `_subscribeIndependently` or mock)
- Update "delete stage" test to verify `project.preStageDeleted` fires
- Remove assertions on `localEvents` (field no longer exists)
- Verify `initSpacePlatform()` is called during project creation (not via event listener)

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

#### 1. Finalize `Stage` as lightweight accessor
**File**: `src/project/UserProject.ts` (or new `src/project/Stage.ts`)

Stage should already be a lightweight accessor after phases 3a-3b. This step removes remaining non-accessor members:

```typescript
@RegisterClass("Stage")
class Stage {
  readonly project: Project
  private _stageNumber: StageNumber

  getStageNumber(): StageNumber
  getSurface(): LuaSurface
  getName(): Property<string>
  getNameProperty(): MutableProperty<string>
  getSettings(): MutableProperty<StageSettingsData>

  _setStageNumber(stageNumber: StageNumber): void
}
```

Remove from `StageImpl`:
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
- Event types → already deleted in 3d

#### 3. Rename `UserProject` → `Project` (mechanical refactor)
Use ast-grep, regex search-replace, or parallel haiku agents:
- Rename `UserProjectImpl` → `ProjectImpl` (or just `Project` since minimal interface is deleted)
- Keep `@RegisterClass("Assembly")` for storage compatibility
- Update all imports across codebase: `UserProject` → `Project`
- `createUserProject()` → `createProject()`
- `_deleteAllProjects()` remains as test utility

#### 4. Migrate remaining Stage callers (mechanical refactor)
Use ast-grep, regex search-replace, or parallel haiku agents:
- `stage.actions` → `stage.project.actions` (~158 call sites across ~11 files)
- `stage.deleteByMerging()` → `project.mergeStage(stage.getStageNumber())`
- `stage.discardInProject()` → `project.discardStage(stage.getStageNumber())`
- `lastStageFor()` — extract to utility function if still needed

#### 5. Update tests
- Rename all `UserProject` references to `Project` in test files
- `createUserProject()` → `createProject()`
- Update imports across all test files

### Success Criteria:

#### Automated Verification:
- [ ] `pnpm run test` passes
- [ ] `pnpm run lint` passes
- [ ] `pnpm run format:fix` passes
- [ ] No `ProjectDef.d.ts` file exists
- [ ] No `UserProject` type references remain (except `@RegisterClass("Assembly")`)

#### Manual Verification:
- [ ] Mod loads correctly in Factorio
- [ ] Can create project, add/delete stages, all UI functional

---

## Phase 3f: Storage Migration

### Overview

Single consolidated migration in `src/project/index.ts` to transform existing save data to the new structure. All phases 3a-3e change the code but defer storage migration to this phase. During 3a-3e, tests create objects fresh via constructors; this phase handles upgrading existing saves.

### How Migrations Work

Migrations are registered via `Migrations.to($CURRENT_VERSION, func)` in `src/project/index.ts`. The `$CURRENT_VERSION` placeholder is replaced by the build script with the version from `src/info.json`. Migrations run inside `on_configuration_changed` — Factorio restores metatables for all `@RegisterClass`-registered objects *before* this event fires, so existing stored objects already have their methods.

New class instances created with `new` during migrations automatically get the correct metatable via TSTL's class system. For wrapper objects that need to be constructed from raw data (where `new` calls a constructor that doesn't match the old data shape), use a static `_fromExisting()` factory method.

Use `Migrations.early()` (priority 8, runs before normal `to()` at priority 9) if the migration creates objects that subsequent migrations need to call methods on.

### Changes Required

**File**: `src/project/index.ts`

One `Migrations.to($CURRENT_VERSION, ...)` block that performs all transformations:

```typescript
interface OldStage {
  surface: LuaSurface
  surfaceIndex: SurfaceIndex
  name: MutableProperty<string>
  actions: UserActions
  blueprintOverrideSettings: OverrideTable<OverrideableBlueprintSettings>
  stageBlueprintSettings: StageBlueprintSettings
}

interface OldProject {
  name: MutableProperty<string>
  landfillTile: MutableProperty<string | nil>
  stagedTilesEnabled: MutableProperty<boolean>
  defaultBlueprintSettings: MutableProperty<OverrideableBlueprintSettings>
  surfaceSettings: Property<SurfaceSettings>
  blueprintBookTemplateInv?: LuaInventory
  localEvents?: SimpleEvent<any>
  stages: Stage[]
  settings?: ProjectSettings
  surfaces?: ProjectSurfaces
}

Migrations.to($CURRENT_VERSION, () => {
  for (const project of storage.projects) {
    const old = project as unknown as OldProject

    // 1. Construct BlueprintBookTemplate from existing inventory
    const blueprintBookTemplate = old.blueprintBookTemplateInv
      ? BlueprintBookTemplate._fromExistingInventory(old.blueprintBookTemplateInv)
      : new BlueprintBookTemplate()
    delete old.blueprintBookTemplateInv

    // 2. Extract per-stage names and settings from old Stage objects
    const stageNames: MutableProperty<string>[] = []
    const stageSettings: MutableProperty<StageSettingsData>[] = []
    const surfaces: LuaSurface[] = []
    for (const stage of old.stages) {
      const oldStage = stage as unknown as OldStage
      stageNames.push(oldStage.name)
      stageSettings.push(property({
        blueprintOverrideSettings: oldStage.blueprintOverrideSettings,
        stageBlueprintSettings: oldStage.stageBlueprintSettings,
      }))
      surfaces.push(oldStage.surface)

      // Clean up fields moved out of Stage
      delete oldStage.surface
      delete oldStage.surfaceIndex
      delete oldStage.actions
      delete oldStage.blueprintOverrideSettings
      delete oldStage.stageBlueprintSettings
      delete oldStage.name
    }

    // 3. Construct ProjectSettings wrapping extracted data
    old.settings = ProjectSettings._fromExisting({
      projectName: old.name,
      landfillTile: old.landfillTile,
      stagedTilesEnabled: old.stagedTilesEnabled,
      defaultBlueprintSettings: old.defaultBlueprintSettings,
      surfaceSettings: old.surfaceSettings,
      blueprintBookTemplate,
      stageNames,
      stageSettings,
    })

    // 4. Construct ProjectSurfaces wrapping surface list
    old.surfaces = ProjectSurfaces._fromExisting(surfaces, old.settings)

    // Clean up fields moved to ProjectSettings
    delete old.name
    delete old.landfillTile
    delete old.stagedTilesEnabled
    delete old.defaultBlueprintSettings
    delete old.surfaceSettings

    // Clean up old event field (replaced by typed SimpleEvent fields on Project)
    old.localEvents?.closeAll()
    delete old.localEvents
  }

})
```

Each `_fromExisting()` factory is a static method on the respective class that wraps existing data without copying — it constructs an instance and assigns the already-deserialized properties directly. These factories are internal (`_` prefix) and only used by migrations.

No migration needed for `ProjectList` — it's a module with functions operating on `storage.projects`, which remains unchanged. The module-level `globalEvent()` exports are initialized at module load time and don't survive serialization by design.

### Testing

**File**: `src/test/project/migration.test.ts`

Test the migration by:
1. Setting up storage in the old format (raw fields on project and stage objects)
2. Running the migration function
3. Verifying the new structure: `project.settings`, `project.surfaces` exist with correct data
4. Verifying old fields are cleaned up

### Success Criteria

#### Automated Verification:
- [ ] `pnpm run test` passes
- [ ] `pnpm run lint` passes
- [ ] Migration test verifies old-format data transforms correctly
- [ ] No old fields remain on migrated objects

## References

- Target state: `./separation-of-concerns-target-state.md`
- Phasing plan: `./separation-of-concerns-phases.md`
