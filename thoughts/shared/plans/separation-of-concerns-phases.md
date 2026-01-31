# Separation of Concerns: Phasing Plan

Reference: [Target State](./separation-of-concerns-target-state.md)

## Strategy

### Strangler Fig with Feature Flag

Build new components alongside old ones. During transition, adapters delegate between old and new. A feature flag (`useNewArchitecture`) in project settings controls which pipeline processes events. Integration tests run against both pipelines, validating identical behavior. Once stable, delete all old code.

The feature flag sits at the `event-handlers.ts` → actions boundary: events either dispatch to old `UserActions` or new `ProjectActions`. Both pipelines share the same `ProjectContent` data, so switching is safe mid-game.

### Parallel Tracks

Three tracks can proceed mostly independently, merging at defined integration points:

- **Track A: Content Layer** — Expand `MutableProjectContent`, add `ContentObserver`, create `InternalProjectEntity` pattern
- **Track B: Presentation Layer** — Extract `EntityStorage`, create `WorldPresentation` shell, merge `WorldUpdates` + `EntityHighlights`
- **Track C: Project Structure** — Extract `ProjectSettings`, `ProjectSurfaces`, restructure `Project`/`Stage`, replace event system

Tracks A and B have a single integration point: wiring `ContentObserver` to `WorldPresentation`. Track C can proceed in parallel with minor coordination on interface names.

### Recommended Merge Order: Phase 3 → Phase 1 → Phase 2

All three tracks develop in parallel, but merge sequentially:

- **Phase 3 first**: Largest structural change to `UserProject.ts` (rename, extraction, event system replacement). Merging first avoids rebasing a massive rename over Phase 2's `worldPresentation` additions. Phase 3 doesn't touch `ProjectEntity.ts` or `ProjectContent.ts`, so it's orthogonal to Phase 1.
- **Phase 1 second**: Splits `ProjectEntity` interface, expands `ProjectContent`. Doesn't touch `UserProject.ts` significantly. Clean merge over Phase 3.
- **Phase 2 last**: Highest-risk phase (~50 call sites). Benefits from Phase 1's `InternalProjectEntity` split already being in place (knows exactly which interface to remove methods from). Benefits from Phase 3's `Project` rename already being done (adds `worldPresentation` to the final class). Phase 3's `worldUpdates.rebuildStage()` references in the moved `project-event-listener.ts` logic get updated to `worldPresentation.rebuildStage()` as part of Phase 2's normal migration.

## Pre-Refactor: Integration Test Coverage

Before any refactoring, expand integration tests to cover all user-visible behavior. Tests should be agnostic to internal architecture — they interact through the public API surface (`project.actions` / entity creation / stage operations) and verify world state outcomes.

### Current Coverage Assessment

Existing integration tests (`src/test/integration/`) cover:
- Entity lifecycle (create, delete, rotate, upgrade, move, die, settings remnants)
- Stage operations (rebuild, merge, discard)
- Blueprint paste (upgrades, quality, rotation, mirroring)
- Wire connections (copper, circuit)
- Underground belts (pairing, rotation)
- Item requests
- Trains and vehicles
- Tile updates
- Space platform init

### Gaps to Fill

1. **Undo/redo end-to-end** — Create entity, delete it, undo delete, verify entity restored with correct world state. Cover undo for: stage moves, last-stage changes, force delete, settings remnant revive
2. **Multi-stage entity propagation** — Entity created at stage 1, verify correct world entities at stages 1-N. Modify at stage 3, verify stages 1-2 unchanged, stages 3-N updated
3. **Stage insert/delete with entities** — Insert stage in middle, verify all entities shifted correctly with correct world state. Delete stage (merge vs discard), verify entities and world state
4. **Blueprint export round-trip** — Create entities, export blueprint, verify blueprint contents match expected. Import blueprint to new stage, verify entities created correctly
5. **Settings remnant lifecycle** — Delete entity at non-first stage → settings remnant. Revive it. Delete at first stage → actual delete. Verify world entities at each step
6. **Fast-replace integration** — Build entity, fast-replace with compatible entity, verify project entity updated (not new entity created)
7. **Selection tool operations** — Stage move tools (send/bring), cleanup tool, force delete tool — verify world state outcomes
8. **Error states** — Entity that fails to place (collision), verify error highlights. Fix collision, verify error clears

### Test Architecture for Dual-Pipeline

```typescript
describe.each(["old", "new"])("entity lifecycle (%s pipeline)", (pipeline) => {
  before_each(() => {
    storage.useNewArchitecture = pipeline == "new"
    // ... standard setup
  })
  // ... tests identical for both pipelines
})
```

Tests verify world state outcomes, not internal method calls. This means they work with either pipeline.

### Deliverable

All integration tests pass. No refactoring code changes yet.

## Phase 1: Content Layer Foundation (Track A)

### 1a. InternalProjectEntity Pattern

Split `ProjectEntity` into read-only public interface and internal mutable interface. This is a type-level change — the runtime class doesn't change, but callers outside the content module lose direct mutation access.

- Create `InternalProjectEntity` interface extending `ProjectEntity` with mutation methods
- `newProjectEntity()` return type changes to `InternalProjectEntity`
- `MutableProjectContent` stores `InternalProjectEntity` internally, exposes `ProjectEntity` in public API
- Callers that currently mutate entity properties directly (in `project-updates.ts`) continue working — they cast via `MutableProjectContent` methods (added in next step)

### 1b. Expand MutableProjectContent

Add mutation methods that wrap `InternalProjectEntity` operations. Each method:
1. Casts the `ProjectEntity` to `InternalProjectEntity`
2. Performs the mutation
3. Calls `ContentObserver` notification (if observer attached)

New methods on `MutableProjectContent` (per target state §MutableProjectContent):
- Entity value mutations: `adjustEntityValue`, `setEntityProp`, `applyEntityUpgrade`, `resetEntityValue`, `resetEntityProp`, `moveEntityValueDown`, `moveEntityPropDown`
- Entity stage bounds: `setEntityFirstStage`, `setEntityLastStage`
- Entity transform: `setEntityPosition`, `setEntityDirection`
- Settings remnant: `makeEntitySettingsRemnant`, `reviveEntity`
- Wire connections: `addWireConnection`, `removeWireConnection`
- Type-specific: `setUndergroundBeltType`, `setInserterPositions`
- Import: `setEntityValue`
- Unstaged: `setEntityUnstagedValue`, `clearEntityUnstagedValues`

Initially, the observer is nil — notifications are no-ops. This makes all changes purely additive.

### 1c. ContentObserver Interface

Define `ContentObserver` interface (per target state §ContentObserver). Add `setObserver()` to `MutableProjectContent`. Observer notifications fire from the mutation methods added in 1b.

No implementor yet — observer is nil during this phase.

### Testing

Unit tests for each new `MutableProjectContent` method: call method, verify entity state changed, verify observer notification fired (using mock observer).

### Deliverable

`MutableProjectContent` has all mutation methods. `ContentObserver` interface defined. Observer notifications fire but have no effect (no implementor). All existing tests pass unchanged. New unit tests for mutation methods.

## Phase 2: Presentation Layer Foundation (Track B)

### 2a. EntityStorage

Create `EntityStorage<T>` class (per target state §EntityStorage). Generic storage mapping `(ProjectEntity, type, stage)` → value. Handles validity checking, stage key shifting.

Initially exists alongside the current storage on `ProjectEntity`. Not yet wired in.

### 2b. WorldPresentation Shell

Create `WorldPresentation` class that delegates to existing `WorldUpdates` + `EntityHighlights`. This is an adapter — same behavior, new interface.

```typescript
class WorldPresentation implements ContentObserver {
  constructor(
    private worldUpdates: WorldUpdates,
    private highlights: EntityHighlights,
    readonly entityStorage: EntityStorage<WorldEntityTypes>,
  ) {}

  // ContentObserver methods — delegate to worldUpdates/highlights
  onEntityChanged(entity, fromStage) {
    this.worldUpdates.updateWorldEntities(entity, fromStage)
    this.highlights.updateAllHighlights(entity)
  }
  // ... etc
}
```

### 2c. Migrate World Entity Storage

Move world entity storage from `ProjectEntity` numeric indexes to `EntityStorage`:
1. `EntityStorage` becomes the source of truth for `LuaEntity` references
2. `WorldPresentation.getWorldOrPreviewEntity()` reads from `EntityStorage`
3. `WorldUpdates` internal functions write to `EntityStorage` (via adapter)
4. Remove world entity methods from `ProjectEntity` (the target state's "Deleted Components" list)

This is the riskiest step in this track — it touches the ~50-dependent `ProjectEntity`.

### 2d. Migrate Highlight Storage

Same pattern: move highlight/render object storage from `ProjectEntity.stageProperties` to `EntityStorage`. Remove `getExtraEntity`, `replaceExtraEntity`, `destroyExtraEntity` from `ProjectEntity`.

### Testing

- Unit tests for `EntityStorage` (get/set/delete/shift operations)
- Integration tests continue passing (they test behavior, not storage location)
- `WorldPresentation` adapter tests verify delegation

### Deliverable

`EntityStorage` owns all world object storage. `WorldPresentation` exists as adapter. `ProjectEntity` no longer stores world objects. All tests pass.

## Phase 3: Project Structure (Track C)

### 3a. Extract ProjectSettings + BlueprintBookTemplate

Extract settings and blueprint book template from `UserProject` into `ProjectSettings` and `BlueprintBookTemplate` classes together:
- `BlueprintBookTemplate` owned by `ProjectSettings` from the start
- Project name, stage names, blueprint settings, surface settings, entity behavior flags
- Implements `ProjectSettingsWriter` (per target state)
- `UserProject` delegates to `ProjectSettings` instance

### 3b. Extract ProjectSurfaces

Extract surface management from `StageImpl.create()` and `UserProject`:
- `ProjectSurfaces` implements `SurfaceManager`
- Surface creation, deletion, naming
- Subscribes to `ProjectSettings` for name changes

### 3c. ProjectList Module

Move project list management from `UserProject.ts` to dedicated `ProjectList.ts` module:
- `getAllProjects()`, `moveProjectUp()`, `moveProjectDown()` → flat exported functions in `ProjectList.ts`
- Module-level `globalEvent()` exports (`projectCreated`, `projectDeleted`, `projectsReordered`) replace `GlobalProjectEvents`

### 3d. Replace Event System

- UI components (`StageSelector`, `StageReferencesBox`) subscribe to per-project `SimpleEvent` fields instead of `localEvents`
- `AllProjects.tsx` subscribes to `ProjectList.ts` module events instead of `GlobalProjectEvents`
- `player-current-stage.ts`, `player-project-data.ts` subscribe to `projectDeleted` from `ProjectList.ts`
- Delete `project-event-listener.ts` (logic moves into `Project` stage lifecycle; `worldUpdates.rebuildStage()` calls become `worldPresentation.rebuildStage()` after Phase 2 merges)
- Delete `GlobalProjectEvents` and `localEvents`

### 3e. Restructure Project and Stage

- Delete minimal `Project` interface from `ProjectDef.d.ts`
- Rename `UserProject` → `Project` (the class, not the interface)
- `Project` owns: `ProjectSettings`, `ProjectSurfaces`, `MutableProjectContent`, `WorldPresentation`, `ProjectActions`
- Stage operations (`insertStage`, `deleteStage`) use direct component coordination (per target state §Stage Synchronization)
- `Stage` becomes lightweight accessor (per target state §Stage)
- Delete `ProjectDef.d.ts` — types move to their implementing files

### Testing

- Unit tests for `ProjectSettings`, `ProjectSurfaces`, `ProjectList`
- Integration tests for stage insert/delete coordination
- Verify UI event subscriptions work with new observer pattern

### Deliverable

Clean project structure. No more god objects. Event system replaced with observers. All tests pass.

## Phase 4: Wire Together — ProjectActions + Feature Flag

### 4a. Create ProjectActions

Merge `user-actions.ts` + `project-updates.ts` into `ProjectActions` class:
- All validation and coordination logic from `project-updates.ts`
- All event handling and user feedback from `user-actions.ts`
- Calls `MutableProjectContent` for data mutations (which notifies `ContentObserver`)
- Queries `WorldPresentation` for world entity state
- Calls `WorldPresentation` directly for operations bypassing observer (tile sync, train rebuilds)
- Returns `UndoAction` objects

### 4b. Wire ContentObserver

Connect `MutableProjectContent` → `WorldPresentation` via `ContentObserver`:
- `WorldPresentation` registered as observer on content
- `ProjectActions` calls `MutableProjectContent` mutation methods
- `MutableProjectContent` notifies `WorldPresentation` automatically
- `WorldPresentation` creates/updates/destroys world entities

This is the architectural switch — world sync becomes reactive instead of imperative.

### 4c. Feature Flag Integration

Add `useNewArchitecture` flag:
- `event-handlers.ts` checks flag to dispatch to `ProjectActions` or old `UserActions`
- Both pipelines share the same `MutableProjectContent`
- Integration tests run with both flag values via `describe.each`

### 4d. Stabilize

Run full test suite with both pipelines. Fix any behavioral differences. The new pipeline should produce identical world state outcomes.

### Testing

- All integration tests pass with both `useNewArchitecture = true` and `false`
- New unit tests for `ProjectActions` with mocked `MutableProjectContent` and `WorldPresentation`

### Deliverable

Both old and new pipelines functional. Feature flag controls which is active. All tests pass with both.

## Phase 5: Migration and Cleanup

### 5a. Switch Default

Set `useNewArchitecture = true` as default. Old pipeline becomes fallback.

### 5b. Delete Old Code

- Delete `project-updates.ts`
- Delete `user-actions.ts`
- Delete `world-updates.ts`
- Delete `entity-highlights.ts` (merged into `WorldPresentation`)
- Delete `LazyLoadClass` and `LazyLoad.ts`
- Delete `project-event-listener.ts`
- Remove `GlobalProjectEvents`, `localEvents`, `ProjectEvents` export
- Remove feature flag and old-pipeline dispatch from `event-handlers.ts`
- Remove delegate methods from `Project` (`actions`, `updates`, `worldUpdates` in old form)
- Delete `ProjectDef.d.ts`
- Delete old unit tests for deleted modules (`project-updates.test.ts`, `user-actions.test.ts`, `world-updates.test.ts`, `entity-highlights.test.ts`)

### 5c. Content Module Organization

Move entity data files to `content/` module:
- `Entity.d.ts`, `StagedValue.ts`, `ProjectEntity.ts`, `ProjectContent.ts`, `stage-diff.ts`, `wire-connection.ts`, `map2d.ts` → `src/content/`
- Public exports: `ProjectEntity` (read-only), `MutableProjectContent`, `ProjectContent`, `StagedValue`, `StageDiff`, `ProjectWireConnection`
- Internal: `InternalProjectEntity`, `map2d`
- Operational helpers stay in `src/entity/`: `prototype-info.ts`, `save-load.ts`, `wires.ts`, `registration.ts`, `underground-belt.ts`, `item-requests.ts`

### 5d. Add Migration

Migration to handle storage format changes:
- `EntityStorage` data previously on `ProjectEntity` instances
- `ProjectSettings` data previously on `UserProject`
- Project class rename (`Assembly` RegisterClass name may need updating or migration)

### Testing

All tests pass. No feature flag references remain. Clean architecture matches target state.

## Dependency Graph Between Phases

```
Pre-Refactor (integration tests)
    │
    ├──→ Phase 1 (Track A: Content)
    │         │
    ├──→ Phase 2 (Track B: Presentation)
    │         │
    ├──→ Phase 3 (Track C: Project Structure)
    │         │
    └────────→ Phase 4 (Wire Together)
                  │
                  → Phase 5 (Cleanup)
```

Phases 1, 2, 3 can run in parallel after pre-refactor. Phase 4 requires all three. Phase 5 requires Phase 4.

## Risk Assessment

**Highest risk**: Phase 2c (migrate world entity storage from ProjectEntity). `ProjectEntity.ts` has ~50 dependents. Mitigated by: comprehensive integration tests from pre-refactor, incremental migration (world entities first, then highlights).

**Second highest risk**: Phase 4b (wire ContentObserver). This changes the fundamental data flow from imperative to reactive. Mitigated by: feature flag allowing side-by-side comparison, integration tests validating identical outcomes.

**Lowest risk**: Phase 1 (content layer). Purely additive — new methods, no behavior changes. Phase 3a-3c (settings/surfaces/list extraction) are also low-risk structural moves.
