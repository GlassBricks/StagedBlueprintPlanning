# Phase 5: Cleanup Implementation Plan

## Overview

Final cleanup phase of the separation-of-concerns refactoring. Removes closure pattern from WorldPresentation, converts EntityHighlights to a class, eliminates the `ProjectBase` god-interface by passing specific components, deletes LazyLoad, removes `TestWorldQueries` indirection, and cleans up test infrastructure.

## Current State Analysis

The refactoring is functionally complete. All new components are implemented and wired. The remaining issues are:

1. **WorldPresentation uses closure pattern** — `world-updates.ts` and `entity-highlights.ts` are closure-based "modules" lazily created via a weak-keyed cache. This pattern exists because the old `LazyLoadClass` couldn't store methods on `@RegisterClass` objects. Now that WorldPresentation is a proper `@RegisterClass`, these can be normal methods/fields.
2. **`LazyLoad.ts`** — no longer imported by any src/ code
3. **`lastStageFor` delegate on ProjectBase** — should be a method on `ProjectEntity`
4. **`ProjectBase` interface is a god-interface** — bundles `settings`, `surfaces`, `content`, `actions`, `worldPresentation`, `valid`, and `lastStageFor` into one bag. Every consumer receives the whole bag but only uses 2-3 fields. This defeats the purpose of separation of concerns.
5. **Test files import internals** — `HighlightEntities` type used in tests instead of `WorldEntityTypes`

### What's Already Done
- All new components implemented (`ProjectSettings`, `ProjectSurfaces`, `ProjectList`, `ProjectActions`, `WorldPresentation`, `EntityStorage`)
- All old modules deleted (`user-actions.ts`, `project-updates.ts`, `project-event-listener.ts`, `ProjectDef.d.ts`, `GlobalProjectEvents`)
- `ProjectActions` has zero imports of `WorldUpdates`/`EntityHighlights`/`EntityStorage`

### ProjectBase Usage Analysis

After removing `lastStageFor` (Phase 4), each consumer uses:

| Consumer | settings | surfaces | content | valid | actions | worldPresentation |
|---|---|---|---|---|---|---|
| **WorldPresentation** (post-merge) | stageCount, getStageName, isSpacePlatform | getSurface | allEntities, findCompatible, tiles | | onEntityPossiblyUpdated (resync only) | self |
| **EntityHighlights** (post-class) | stageCount (for lastStageWith) | getSurface | | | | |
| **ProjectActions** | getStageName, stageCount (already separate param) | getSurface (2 sites) | (already separate param) | 1 site | | (already separate param as WorldPresenter) |

Key observations:
- **WorldPresentation**: After porting world-updates, needs content + surfaces + settings + actions. The `actions` dependency is **only** for `ResyncWithWorldTask` (calls `actions.onEntityPossiblyUpdated`). Move resync task to Project to break this cycle.
- **EntityHighlights**: After Phase 4, only needs `surfaces.getSurface()` and a stage count. Since it becomes internal to WorldPresentation, it can use WorldPresentation's own dependencies.
- **ProjectActions**: Already receives `content`, `worldPresenter`, `settings` as separate params. Only uses `project` for `surfaces.getSurface()` (2 sites) and `valid` (1 site). Can add `surfaces` param and a `valid` field.
- **Undo records**: Store `project: ProjectBase` for serialization, but only access `project.actions`. Can store `actions: ProjectActions` directly since it's a `@RegisterClass`.

## What We're NOT Doing

- Moving entity files to `content/` module (deferred — mechanical file move, orthogonal to architecture)

## Phase 1: Delete `LazyLoad.ts`

Delete files:
- `src/lib/LazyLoad.ts`
- `src/lib/test/LazyLoad.test.ts`

### Success Criteria
- [x] `pnpm run test` passes
- [x] No remaining imports of `LazyLoad` in src/

## Phase 2: Convert EntityHighlights to a class

Convert the closure-based `EntityHighlights` function into a proper class. The closure currently captures `project`, `worldEntities`, and `entityStorage` — these become constructor parameters stored as fields. Replace `project: ProjectBase` with the specific dependencies it actually uses: `surfaces` (for `getSurface`) and `stageCount` (via a callback or interface).

### Changes Required

#### `src/project/entity-highlights.ts`

Convert from closure function to class. Replace `project: ProjectBase` with specific deps.

Define `StageCount` interface (from target state) and `SurfaceProvider`:

```typescript
// In a shared location (e.g., ProjectSurfaces.ts or a new interfaces file)
interface StageCount {
  stageCount(): StageNumber
}

interface SurfaceProvider {
  getSurface(stage: StageNumber): LuaSurface | nil
}
```

`ProjectSettings` implements `StageCount`. `ProjectSurfaces` implements `SurfaceProvider`.

```typescript
export class EntityHighlights {
  constructor(
    private surfaces: SurfaceProvider,
    private stageCount: StageCount,
    private worldEntities: WorldEntityLookup,
    private entityStorage: EntityStorage<WorldEntityTypes>,
  ) {}

  updateAllHighlights(entity: ProjectEntity): void { ... }
  deleteAllHighlights(entity: ProjectEntity): void { ... }
  makeSettingsRemnantHighlights(entity: ProjectEntity): void { ... }
  updateHighlightsOnReviveSettingsRemnant(entity: ProjectEntity): void { ... }
}
```

All inner functions become private methods. Replace `project.surfaces.getSurface(stage)` with `this.surfaces.getSurface(stage)` and `project.lastStageFor(entity)` with `entity.lastStageWith(this.stageCount)`.

Also update `entity.lastStageWith` to accept `StageCount` (not a number):
```typescript
// On ProjectEntity
lastStageWith(stageCount: StageCount): StageNumber
```

The `HighlightEntities` interface becomes a type alias (or just use `WorldEntityTypes` directly). `HighlightConstants` and `getItemRequestSampleItemName` remain exported.

Remove the `/** @noSelf */` interface — the class has `self` natively.

#### `src/project/WorldPresentation.ts`

Update to instantiate `EntityHighlights` as a class (still using closure cache for now — Phase 3 will inline it):
```typescript
const highlights = new EntityHighlights(
  wp.project.surfaces,
  wp.project.settings,
  wp,
  wp.entityStorage,
)
```

#### `src/test/project/entity-highlights.test.ts`

Update instantiation to pass specific deps:
```typescript
entityHighlights = new EntityHighlights(
  project.surfaces,
  project.settings, // implements StageCount
  project.worldPresentation,
  project.worldPresentation.entityStorage,
)
```

### Success Criteria
- [x] `pnpm run test` passes
- [x] `EntityHighlights` is a class, not a closure function
- [x] `EntityHighlights` does not import or reference `ProjectBase`
- [ ] `HighlightEntities` interface removed (use `WorldEntityTypes` keys instead)
- [x] `StageCount` and `SurfaceProvider` interfaces defined

## Phase 3: Port WorldUpdates into WorldPresentation

Move all functionality from `world-updates.ts` directly into `WorldPresentation` as methods. The closure currently captures `project`, `wp` (WorldPresentation itself), `content`, and `highlights` — all available as `this` fields on WorldPresentation.

### Changes Required

#### `src/project/WorldPresentation.ts`

1. Add `EntityHighlights` as an eagerly-created field (initialized in constructor):
```typescript
class WorldPresentation {
  readonly entityStorage = new EntityStorage<WorldEntityTypes>()
  private highlights: EntityHighlights

  constructor(readonly project: ProjectBase) {
    this.highlights = new EntityHighlights(project.surfaces, project.settings, this, this.entityStorage)
  }
}
```

2. Move all WorldUpdates functions as methods on WorldPresentation. The current delegate methods (e.g., `rebuildStage` calling `this.getWorldUpdates().rebuildStage(stage)`) become direct method implementations.

3. Move `RebuildAllStagesTask` class and the `worldUpdatesBlocked` flag into `WorldPresentation.ts`. `ResyncWithWorldTask` moves to `Project.ts` (see below).

4. Move `TileCollision` interface into `WorldPresentation.ts`.

5. Remove the closure cache (`closureCache`, `getClosures`, `getWorldUpdates`, `getHighlights`).

6. Remove the `WorldUpdates` interface — all methods are now on `WorldPresentation` or `WorldPresenter`.

7. Add `resyncWithWorld()` to `WorldPresenter` interface. Implementation just submits `RebuildAllStagesTask` (not `ResyncWithWorldTask` — that moves to Project).

**`ResyncWithWorldTask` moves to `Project.ts`**: This task calls `project.actions.onEntityPossiblyUpdated()` and `project.worldPresentation.rebuildStage()`, coordinating two separate components. It's a project-level operation, not a presentation operation. Moving it breaks WorldPresentation's dependency on `actions`, which is essential for eliminating `ProjectBase` in Phase 5.

`EditorTab.tsx` changes to call `project.resyncWithWorld()` instead of going through worldPresentation.

Key method mapping (WorldUpdates → WorldPresentation):
- Public methods already on WorldPresenter: `rebuildStage`, `rebuildAllStages`, `rebuildEntity`→`rebuildWorldEntityAtStage`, `refreshEntity`→`refreshWorldEntityAtStage`, `refreshAllEntities`→`refreshAllWorldEntities`, `deleteEntityAtStage`→`clearWorldEntityAtStage`, `resetUnderground`, `updateTiles`→`updateTilesInRange`, `disableAllEntitiesInStage`, `enableAllEntitiesInStage`
- ContentObserver implementations: `onEntityAdded`→calls `updateNewWorldEntitiesWithoutWires`+`updateAllHighlights`, `onEntityChanged`→calls `updateWorldEntities`, etc.
- Private/internal helpers: `updateWorldEntitiesInRange`, `updateWires`, `makePreviewEntity`, `setEntityUpdateable`, `deleteUndergroundBelt`

#### `src/project/world-updates.ts`

Delete this file entirely.

#### `src/project/Project.ts`

Add `resyncWithWorld()` method that submits `ResyncWithWorldTask`. Move `ResyncWithWorldTask` class here.

#### `src/project/index.ts`

Line 125 calls `project.worldPresentation.getWorldUpdates().updateWorldEntitiesOnLastStageChanged(...)`. Change to call the method directly on WorldPresentation:
```typescript
project.worldPresentation.updateWorldEntitiesOnLastStageChanged(entity, oldLastStage)
```

#### `src/ui/project-settings/EditorTab.tsx`

Line 146: Change `this.project.worldPresentation.getWorldUpdates().resyncWithWorld()` to `this.project.resyncWithWorld()`.

#### `src/test/integration/integration-test-util.ts`

The `TestWorldOps` interface has `updateWorldEntities`, `updateAllHighlights`, `resyncWithWorld` which previously came from `WorldUpdates`. Update:
- `updateWorldEntities` → call on wp directly (internal method, acceptable for tests)
- `updateAllHighlights` → call on wp directly (delegates to highlights internally)
- `resyncWithWorld` → call on project directly

Remove `wp.getWorldUpdates()` call.

#### `src/test/integration/test-world-queries.ts`

Replace `HighlightEntities` import with `WorldEntityTypes` from `WorldPresentation`:
```typescript
import { WorldEntityTypes, WorldPresentation } from "../../project/WorldPresentation"
```

#### `src/test/project/world-updates.test.ts`

Rename to `WorldPresentation.test.ts`. Test WorldPresentation directly instead of WorldUpdates.

Since these tests already use real surfaces and create real entities, and `entity-highlights.test.ts` separately tests highlight behavior in detail, **convert to use real EntityHighlights**. Remove the `fMock<EntityHighlights>()`. Tests that verify `entityHighlights.updateAllHighlights` was called: either remove (covered by entity-highlights tests) or verify actual highlight state via `TestWorldQueries`.

### Success Criteria
- [ ] `pnpm run test` passes
- [ ] `pnpm run lint` passes
- [ ] `world-updates.ts` deleted
- [ ] No `getWorldUpdates()` or `getHighlights()` public methods on WorldPresentation
- [ ] No `WorldUpdates` interface exists
- [ ] `resyncWithWorld` on Project (not WorldPresenter)
- [ ] `WorldPresentation` has no dependency on `actions`

## Phase 4: Add `lastStageWith` to ProjectEntity, remove `lastStageFor`

### Changes Required

#### `src/entity/ProjectEntity.ts`
Add to `ProjectEntity` interface and implementation:
```typescript
lastStageWith(stageCount: StageCount): StageNumber
```
Implementation: `return this.lastStage != nil ? min(this.lastStage, stageCount.stageCount()) : stageCount.stageCount()`

Uses the `StageCount` interface defined in Phase 2. This avoids storing functions and lets callers pass any object implementing `StageCount` (e.g., `ProjectSettings`).

#### `src/project/Project.ts`
Remove `lastStageFor` from `ProjectBase` interface and `ProjectImpl` class.

#### All call sites (~25)
Replace `project.lastStageFor(entity)` → `entity.lastStageWith(project.settings)`.

For WorldPresentation methods (formerly world-updates), `this.settings` (or `this.project.settings`) is available — it implements `StageCount`.

#### `src/test/project/Project-mock.ts`
Remove `lastStageFor` from mock.

### Success Criteria
- [ ] `pnpm run test` passes
- [ ] `pnpm run lint` passes
- [ ] No `lastStageFor` on `ProjectBase` interface
- [ ] `lastStageWith` exists on `ProjectEntity` interface

## Phase 5: Eliminate ProjectBase

After Phases 2-4, `ProjectBase` has lost `lastStageFor` and WorldPresentation no longer needs `actions`. The remaining fields consumers need can be passed as specific components.

### ProjectBase field analysis (post-Phase 4)

```typescript
interface ProjectBase {
  readonly settings: ProjectSettings
  readonly surfaces: ProjectSurfaces
  readonly content: MutableProjectContent
  readonly valid: boolean
  actions: ProjectActions
  worldPresentation: WorldPresentation
}
```

### Changes Required

#### Define narrow interfaces

In `src/project/ProjectSurfaces.ts` or a shared types file:

```typescript
interface SurfaceProvider {
  getSurface(stage: StageNumber): LuaSurface | nil
}
```

The target state also defines `StagePresentation` and `EntityBehaviorSettings`, but `ProjectSettings` already implements all the methods used. For now, just add `SurfaceProvider`. Additional interface extraction can be done later if needed.

#### `src/project/WorldPresentation.ts`

Replace `project: ProjectBase` constructor param with specific deps. EntityHighlights is eagerly created in constructor:

```typescript
class WorldPresentation {
  readonly entityStorage = new EntityStorage<WorldEntityTypes>()
  private highlights: EntityHighlights

  constructor(
    private settings: ProjectSettings,
    private surfaces: SurfaceProvider,
    readonly content: MutableProjectContent,
  ) {
    this.highlights = new EntityHighlights(surfaces, settings, this, this.entityStorage)
  }
}
```

All internal references change:
- `this.project.content` → `this.content`
- `this.project.surfaces.getSurface()` → `this.surfaces.getSurface()`
- `this.project.settings.stageCount()` → `this.settings.stageCount()`
- `this.project.settings.getStageName()` → `this.settings.getStageName()`
- `this.project.settings.isSpacePlatform()` → `this.settings.isSpacePlatform()`

`RebuildAllStagesTask` needs settings and worldPresentation — pass these as constructor params instead of `project`.

#### `src/project/ProjectActions.ts`

Replace `project: ProjectBase` with specific components:

```typescript
class ProjectActions {
  valid = true  // set to false by Project.delete()

  constructor(
    readonly content: MutableProjectContent,
    readonly worldPresenter: WorldPresenter,
    readonly settings: ProjectSettings,
    private surfaces: SurfaceProvider,
  ) {}
}
```

Update internal references:
- `this.project.settings.getStageName()` → `this.settings.getStageName()` (settings already a field)
- `this.project.settings.stageCount()` → `this.settings.stageCount()` (same)
- `this.project.surfaces.getSurface()` → `this.surfaces.getSurface()`
- `this.project.valid` → `this.valid`

#### Undo records

Change `ProjectEntityRecord` to store `actions: ProjectActions` instead of `project: ProjectBase`:

```typescript
interface ProjectEntityRecord {
  actions: ProjectActions
  entity: ProjectEntity
}
```

All undo handlers change from `(project as InternalProject).actions` to just `actions`. The `InternalProject` interface is deleted.

In `createAction` calls, pass `this` instead of `this.project`:
```typescript
undoManualStageMove.createAction(byPlayer, { actions: this, entity, oldStage })
```

#### Migration for undo records

Existing undo records in save files have `data: { project, entity, ... }` where `project` is a ProjectBase. Add a migration that walks `storage.players[*].undoEntries[*].data` and replaces `project` with `actions: project.actions` for the relevant handler names (`"delete entity"`, `"stage move"`, `"send to stage"`, `"bring to stage"`, `"last stage change"`).

#### `src/project/Project.ts`

Update `ProjectImpl` constructor to pass individual components:
```typescript
this.worldPresentation = new WorldPresentation(this.settings, this.surfaces, this.content)
this.actions = new ProjectActions(this.content, this.worldPresentation, this.settings, this.surfaces)
```

In `Project.delete()`, set `this.actions.valid = false`.

Delete `ProjectBase` interface entirely. The `Project` interface (used by UI, event-handlers, import-export) remains — it provides the full project API including stage lifecycle.

#### `src/test/project/Project-mock.ts`

`createMockProject` no longer returns `ProjectBase`. It can return a simpler test-specific type, or construct individual components directly. The mock becomes:

```typescript
export function createMockProject(stages: number | LuaSurface[]): {
  surfaces: SurfaceProvider
  settings: { stageCount(): number; getStageName(n: number): string; isSpacePlatform(): boolean }
  content: MutableProjectContent
  worldPresentation: WorldPresentation
} {
  // ... build from components
}
```

Or define a lightweight `TestProject` type.

### Success Criteria
- [ ] `pnpm run test` passes
- [ ] `pnpm run lint` passes
- [ ] `ProjectBase` interface deleted
- [ ] `WorldPresentation` constructor takes individual components, not ProjectBase
- [ ] `ProjectActions` constructor takes individual components, not ProjectBase
- [ ] `EntityHighlights` has no reference to ProjectBase
- [ ] Undo records store `actions: ProjectActions`, not `project: ProjectBase`
- [ ] No file imports `ProjectBase`

## Phase 6: Remove TestWorldOps and TestWorldQueries

Both are thin wrappers in test infrastructure that delegate directly to `WorldPresentation` (and after Phase 3, all WorldUpdates methods are on WorldPresentation too). They exist in the same file and are used by the same test files, so remove them together.

**TestWorldOps** delegates all methods to WorldPresentation or WorldUpdates (which is merged into WorldPresentation in Phase 3):
- `rebuildStage`, `rebuildAllStages`, `refreshEntity`, `refreshAllEntities`, `rebuildEntity` → already on `WorldPresentation`
- `updateWorldEntities`, `updateAllHighlights` → on `WorldPresentation` after Phase 3
- `resyncWithWorld` → on `Project` after Phase 3

**TestWorldQueries** delegates all methods to WorldPresentation + entityStorage:
- `getWorldEntity`, `getWorldOrPreviewEntity`, `hasErrorAt` → already on `WorldPresentation`
- `getExtraEntity` → `entityStorage.get(entity, type, stage)`
- `hasAnyExtraEntities` → `entityStorage.hasAnyOfType(entity, type)`

### Changes Required

#### Delete `src/test/integration/test-world-queries.ts`

#### `src/test/integration/integration-test-util.ts`

- Remove `TestWorldOps` interface and `worldOps` from `EntityTestContext`
- Remove `worldQueries` from `EntityTestContext`
- Remove `createWorldPresentationQueries` import
- Helper functions (`assertEntityCorrect`, `assertEntityNotPresent`, `assertIsSettingsRemnant`) take `wp: WorldPresentation` instead of `wq: TestWorldQueries`
- Expose `wp` (WorldPresentation) directly on `EntityTestContext` instead of the two wrappers

#### `src/test/project/entity-highlight-test-util.ts`

Replace `wq: TestWorldQueries` parameter with `wp: WorldPresentation` in all exported functions. Update calls:
- `wq.getWorldEntity(entity, stage)` → `wp.getWorldEntity(entity, stage)`
- `wq.hasErrorAt(entity, stage)` → `wp.hasErrorAt(entity, stage)`
- `wq.getExtraEntity(entity, type, stage)` → `wp.entityStorage.get(entity, type, stage)`
- `wq.hasAnyExtraEntities(entity, type)` → `wp.entityStorage.hasAnyOfType(entity, type)`

#### Integration test files (~10 files)

All files that access `ctx.worldOps` switch to `ctx.project.worldPresentation` (or `ctx.wp`). All files that access `ctx.worldQueries` do the same. `ctx.worldOps.resyncWithWorld()` becomes `ctx.project.resyncWithWorld()`.

Affected files:
- `entity-lifecycle.test.ts`
- `wire-connections.test.ts`
- `entity-highlights.test.ts`
- `underground-belt.test.ts`
- `item-requests.test.ts`
- `undo-redo.test.ts`
- `stage-operations.test.ts`
- `selection-tools.test.ts`
- `blueprint-paste.test.ts`
- `trains-and-vehicles.test.ts`

### Success Criteria
- [ ] `pnpm run test` passes
- [ ] `pnpm run lint` passes
- [ ] `test-world-queries.ts` deleted
- [ ] No `TestWorldQueries` or `TestWorldOps` types referenced anywhere
- [ ] No `createWorldPresentationQueries` function exists

## Verification Checklist (Target State)

After all phases:

- [ ] No minimal `Project` interface from ProjectDef.d.ts
- [ ] No `ProjectUpdates` module
- [ ] `LazyLoadClass` deleted (Phase 1)
- [ ] No delegate methods on Project (Phase 4 removes `lastStageFor`)
- [ ] `project-event-listener.ts` deleted
- [ ] No `GlobalProjectEvents` singleton
- [ ] No `localEvents` field on Project
- [ ] `ProjectList.ts` exports module-level `GlobalEvent` instances
- [ ] Import/export uses `ProjectSettings` and `content` directly
- [ ] All entity mutations go through `MutableProjectContent`
- [ ] `MutableProjectContent` has no LuaEntity references or business logic
- [ ] All validation and coordination logic is in `ProjectActions`
- [ ] `ProjectActions` depends on `WorldPresenter` interface, not `WorldPresentation` class
- [ ] `ProjectActions` has zero imports of `WorldUpdates`, `EntityHighlights`, or `EntityStorage`
- [ ] No direct mutation of `ProjectEntity` from outside content module
- [ ] External code cannot call `InternalProjectEntity` methods without `_asMut()`
- [ ] Stage operations in `Project` call components directly in order
- [ ] Per-project stage events (`SimpleEvent`) only used by UI/external
- [ ] Import flows construct content before project
- [ ] `WorldUpdates` and `EntityHighlights` are internal to WorldPresentation (Phase 3)
- [ ] No `ProjectBase` god-interface; components take specific dependencies (Phase 5)
- [ ] No `TestWorldQueries` or `TestWorldOps` wrappers; tests use `WorldPresentation` directly (Phase 6)
