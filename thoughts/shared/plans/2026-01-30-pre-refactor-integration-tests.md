# Pre-Refactor Integration Test Coverage Plan

## Overview

Expand integration test coverage before the separation-of-concerns refactor. Tests must be architecture-agnostic — they interact through player simulation, event simulation, and stable adapter interfaces. They must NOT call `project.updates`, `project.worldUpdates`, or `project.actions` directly, since those internal modules are being replaced.

## Current State Analysis

10 integration test files exist in `src/test/integration/`. Many existing tests call internal APIs directly:
- 15 calls to `project.updates.*` (setup + triggering)
- 16 calls to `project.worldUpdates.*` (setup + triggering)
- 6 calls to `project.actions.*` (triggering)

### Key Discoveries:
- `buildEntity` helper (`integration-test-util.ts:201-220`) calls `project.actions.onEntityCreated` — equivalent to what `event-handlers.ts` `on_built_entity` does
- `checkForEntityUpdates` (`event-handlers.ts`) flows through the full event pipeline and is already used in 6 integration test calls
- Selection tools are simulated via `Events.raiseFakeEventNamed` with tool prototype in `item` field
- Stage move tool reads target from `getProjectPlayerData(player, project).moveTargetStage`
- Undo is simulated via `_simulateUndo(player)` from `undo.ts:158`

## Desired End State

All tests (new and existing) use simulation or adapters. No direct calls to `project.updates`, `project.worldUpdates`, or `project.actions` remain in integration tests. Dual-pipeline scaffold in place. All user-visible behavior covered.

## What We're NOT Doing

- Blueprint export round-trip integration tests (unit tests sufficient)
- Changing production code
- Adding the feature flag itself (Phase 4 of refactor)

## Implementation Approach

### Interaction Patterns for New Tests

**Player simulation** — for entity lifecycle:
- `player.build_from_cursor(...)` — entity creation, blueprint paste, fast replace
- `player.mine_entity(entity, true)` — entity deletion
- `entity.rotate({ by_player: player })` — rotation
- `entity.order_upgrade(...)` — upgrades
- `entity.die()` — entity death
- `surface.set_tiles(...)` — tile placement

**Event simulation** — for tool operations:
- `Events.raiseFakeEventNamed("on_player_selected_area", { item: Prototypes.CleanupTool, ... })` — selection tools
- `Events.raiseFakeEventNamed("on_player_reverse_selected_area", ...)` — reverse selection
- Same for alt and alt-reverse variants

**`checkForEntityUpdates(worldEntity, nil)`** — for "entity changed in world" scenarios:
- Modify world entity properties directly (e.g., `worldEntity.inserter_stack_size_override = 2`)
- Call `checkForEntityUpdates` to trigger the full pipeline
- This creates stage diffs without calling `project.updates` directly

**Project-level methods** — stable across both architectures:
- `project.insertStage(n)`, `project.mergeStage(n)`, `project.discardStage(n)`

### Creating Test State Without Internal APIs

| Instead of | Use |
|---|---|
| `_applyDiffAtStage(n, diff)` + `worldUpdates.updateWorldEntities` | Modify world entity at stage n + `checkForEntityUpdates` |
| `updates.trySetLastStage(entity, n)` | Stage deconstruct tool event at stage n+1 |
| `updates.deleteEntityOrCreateSettingsRemnant(entity)` | `player.mine_entity(entity.getWorldEntity(firstStage), true)` (when entity has diffs) |
| `updates.tryReviveSettingsRemnant(entity, stage)` | Build entity over remnant preview position at that stage |
| `actions.onEntityForceDeleteUsed(entity, stage, player)` | Force delete tool selection event |
| `actions.onMoveEntityToStageCustomInput(entity, stage, player)` | Custom input event simulation, or stage move tool selection event |

### Adapter Interfaces

For operations the UI calls that can't be easily event-simulated, and for world operations that both architectures expose, define adapter interfaces on the test context. These delegate to old code now, and swap to new code when the pipeline flag is toggled.

```typescript
interface TestWorldOps {
  rebuildStage(stage: StageNumber): void
  rebuildAllStages(): void
  refreshEntity(entity: ProjectEntity, stage: StageNumber): void
  refreshAllEntities(entity: ProjectEntity): void
  rebuildEntity(entity: ProjectEntity, stage: StageNumber): void
  updateAllHighlights(entity: ProjectEntity): void
  resyncWithWorld(): void
}

interface TestProjectOps {
  resetProp(entity: ProjectEntity, stage: StageNumber, prop: keyof BlueprintEntity): void
  movePropDown(entity: ProjectEntity, stage: StageNumber, prop: keyof BlueprintEntity): void
  resetAllProps(entity: ProjectEntity, stage: StageNumber): void
  moveAllPropsDown(entity: ProjectEntity, stage: StageNumber): void
  setTileAtStage(position: Position, stage: StageNumber, value: string | nil): void
}

interface TestWorldQueries {
  getWorldEntity(entity: ProjectEntity, stage: StageNumber): LuaEntity | nil
  getWorldOrPreviewEntity(entity: ProjectEntity, stage: StageNumber): LuaEntity | nil
  hasErrorAt(entity: ProjectEntity, stage: StageNumber): boolean
  getExtraEntity<T extends keyof ExtraEntities>(
    entity: ProjectEntity, type: T, stage: StageNumber
  ): ExtraEntities[T] | nil
  hasAnyExtraEntities(entity: ProjectEntity, type: ExtraEntityType): boolean
}
```

Old pipeline implementation delegates to `project.worldUpdates` / `project.updates` / `entity.*` methods. New pipeline implementation (added in Phase 4) delegates to `project.worldPresentation` / `project.actions` (the new ProjectActions class).

---

## Phase 1: Dual-Pipeline Scaffold, Adapters, and Existing Test Migration

### Overview
Add `describeDualPipeline` helper, adapter interfaces, adapter implementations for the old pipeline, and migrate all existing integration tests to use adapters/simulation instead of direct internal API calls.

### Changes Required:

#### 1a. Add scaffold to integration-test-util.ts
**File**: `src/test/integration/integration-test-util.ts`

Add types and helpers:

```typescript
type Pipeline = "old" | "new"

function describeDualPipeline(
  name: string,
  fn: (pipeline: Pipeline) => void,
): void {
  describe.each<[Pipeline]>([["old"], ["new"]])(
    `${name} (%s pipeline)`,
    (pipeline) => fn(pipeline),
  )
}
```

Add `TestWorldOps`, `TestProjectOps`, and `TestWorldQueries` interfaces.

Add `worldOps`, `projectOps`, and `worldQueries` to `EntityTestContext`, populated in `setupEntityIntegrationTest`:

```typescript
// Old pipeline implementation (delegates to project internals)
worldOps: {
  rebuildStage: (stage) => ctx.project.worldUpdates.rebuildStage(stage),
  rebuildAllStages: () => ctx.project.worldUpdates.rebuildAllStages(),
  refreshEntity: (entity, stage) => ctx.project.worldUpdates.refreshWorldEntityAtStage(entity, stage),
  refreshAllEntities: (entity) => ctx.project.worldUpdates.refreshAllWorldEntities(entity),
  rebuildEntity: (entity, stage) => ctx.project.worldUpdates.rebuildWorldEntityAtStage(entity, stage),
  updateWorldEntities: (entity, stage) => ctx.project.worldUpdates.updateWorldEntities(entity, stage),
  updateAllHighlights: (entity) => ctx.project.worldUpdates.updateAllHighlights(entity),
  resyncWithWorld: () => ctx.project.worldUpdates.resyncWithWorld(),
},
projectOps: {
  resetProp: (entity, stage, prop) => ctx.project.updates.resetProp(entity, stage, prop),
  movePropDown: (entity, stage, prop) => ctx.project.updates.movePropDown(entity, stage, prop),
  resetAllProps: (entity, stage) => ctx.project.updates.resetAllProps(entity, stage),
  moveAllPropsDown: (entity, stage) => ctx.project.updates.moveAllPropsDown(entity, stage),
  setTileAtStage: (position, stage, value) => ctx.project.updates.setTileAtStage(position, stage, value),
  deleteTile: (position) => ctx.project.updates.deleteTile(position),
  trySetLastStage: (entity, stage) => ctx.project.updates.trySetLastStage(entity, stage),
  trySetFirstStage: (entity, stage) => ctx.project.updates.trySetFirstStage(entity, stage),
  addNewEntity: (entity, stage) => ctx.project.updates.addNewEntity(entity, stage),
  deleteEntityOrCreateSettingsRemnant: (entity) => ctx.project.updates.deleteEntityOrCreateSettingsRemnant(entity),
  tryReviveSettingsRemnant: (entity, stage) => ctx.project.updates.tryReviveSettingsRemnant(entity, stage),
},
```

```typescript
// Old pipeline implementation (delegates to entity methods directly)
worldQueries: {
  getWorldEntity: (entity, stage) => entity.getWorldEntity(stage),
  getWorldOrPreviewEntity: (entity, stage) => entity.getWorldOrPreviewEntity(stage),
  hasErrorAt: (entity, stage) => entity.hasErrorAt(stage),
  getExtraEntity: (entity, type, stage) => entity.getExtraEntity(type, stage),
  hasAnyExtraEntities: (entity, type) => entity.hasAnyExtraEntities(type),
},
```

Also add a helper to create stage diffs via simulation:

```typescript
function applyDiffViaWorld(
  ctx: EntityTestContext,
  entity: ProjectEntity,
  stage: StageNumber,
  applyFn: (worldEntity: LuaEntity) => void,
): void {
  const worldEntity = ctx.worldQueries.getWorldEntity(entity, stage)
  assert(worldEntity, "world entity must exist at stage")
  applyFn(worldEntity)
  checkForEntityUpdates(worldEntity, nil)
}
```

#### 1b. Migrate assertion helpers to use `worldQueries`

Rewrite `assertEntityCorrect`, `assertEntityNotPresent`, and `assertIsSettingsRemnant` to accept `TestWorldQueries` (via `EntityTestContext`) instead of calling world entity methods on `ProjectEntity` directly. These helpers currently call `entity.getWorldEntity(stage)`, `entity.getWorldOrPreviewEntity(stage)`, `entity.hasErrorAt(stage)`, `entity.getExtraEntity(type, stage)`, and `entity.hasAnyExtraEntities(type)` — all of which Phase 2 removes from `ProjectEntity`.

| Old call in helper | New call | Helper function |
|---|---|---|
| `entity.getWorldOrPreviewEntity(stage)` | `worldQueries.getWorldOrPreviewEntity(entity, stage)` | assertEntityCorrect, assertEntityNotPresent, assertIsSettingsRemnant |
| `entity.getWorldEntity(stage)` | `worldQueries.getWorldEntity(entity, stage)` | assertEntityCorrect |
| `entity.hasErrorAt(stage)` | `worldQueries.hasErrorAt(entity, stage)` | assertEntityCorrect |
| `entity.getExtraEntity(type, stage)` | `worldQueries.getExtraEntity(entity, type, stage)` | assertEntityCorrect, assertIsSettingsRemnant |
| `entity.hasAnyExtraEntities(type)` | `worldQueries.hasAnyExtraEntities(entity, type)` | assertEntityNotPresent, assertIsSettingsRemnant |

The module-level helper functions need `worldQueries` as a parameter. Since they are wrapped by `EntityTestContext` methods, the context methods pass `this.worldQueries` through.

#### 1c. Migrate existing tests — mechanical adapter replacements

Find-and-replace across all integration test files using ast-grep where applicable. All `ctx.project.worldUpdates.*` → `ctx.worldOps.*`, all `ctx.project.updates.*` → `ctx.projectOps.*`:

| Old call | New call | Files affected |
|---|---|---|
| `ctx.project.worldUpdates.rebuildStage(n)` | `ctx.worldOps.rebuildStage(n)` | entity-lifecycle, stage-operations, trains-and-vehicles, item-requests |
| `ctx.project.worldUpdates.rebuildAllStages()` | `ctx.worldOps.rebuildAllStages()` | entity-lifecycle, trains-and-vehicles |
| `ctx.project.worldUpdates.refreshWorldEntityAtStage(e, n)` | `ctx.worldOps.refreshEntity(e, n)` | entity-lifecycle, underground-belt |
| `ctx.project.worldUpdates.refreshAllWorldEntities(e)` | `ctx.worldOps.refreshAllEntities(e)` | entity-lifecycle, trains-and-vehicles, stage-operations, underground-belt |
| `ctx.project.worldUpdates.rebuildWorldEntityAtStage(e, n)` | `ctx.worldOps.rebuildEntity(e, n)` | entity-lifecycle |
| `ctx.project.worldUpdates.updateWorldEntities(e, n)` | `ctx.worldOps.updateWorldEntities(e, n)` | stage-operations, underground-belt, item-requests |
| `ctx.project.worldUpdates.updateAllHighlights(e)` | `ctx.worldOps.updateAllHighlights(e)` | underground-belt |
| `ctx.project.worldUpdates.resyncWithWorld()` | `ctx.worldOps.resyncWithWorld()` | stage-operations |
| `ctx.project.updates.resetProp(...)` | `ctx.projectOps.resetProp(...)` | entity-lifecycle |
| `ctx.project.updates.movePropDown(...)` | `ctx.projectOps.movePropDown(...)` | entity-lifecycle |
| `ctx.project.updates.resetAllProps(...)` | `ctx.projectOps.resetAllProps(...)` | entity-lifecycle |
| `ctx.project.updates.moveAllPropsDown(...)` | `ctx.projectOps.moveAllPropsDown(...)` | entity-lifecycle |
| `ctx.project.updates.trySetLastStage(...)` | `ctx.projectOps.trySetLastStage(...)` | stage-operations |
| `ctx.project.updates.trySetFirstStage(...)` | `ctx.projectOps.trySetFirstStage(...)` | trains-and-vehicles |
| `ctx.project.updates.setTileAtStage(...)` | `ctx.projectOps.setTileAtStage(...)` | tile-updates |
| `ctx.project.updates.deleteTile(...)` | `ctx.projectOps.deleteTile(...)` | space-platforms-tile-reset |
| `ctx.project.updates.addNewEntity(...)` | `ctx.projectOps.addNewEntity(...)` | trains-and-vehicles |
| `ctx.project.updates.deleteEntityOrCreateSettingsRemnant(...)` | `ctx.projectOps.deleteEntityOrCreateSettingsRemnant(...)` | entity-lifecycle |
| `ctx.project.updates.tryReviveSettingsRemnant(...)` | `ctx.projectOps.tryReviveSettingsRemnant(...)` | entity-lifecycle |

#### 1d. Migrate existing tests — `checkForEntityUpdates` replacements

Replace `updates.tryUpdateEntityFromWorld` and `updates.updateWiresFromWorld` with `checkForEntityUpdates`:

| Old call | New call | File |
|---|---|---|
| `ctx.project.updates.tryUpdateEntityFromWorld(entity, n)` | `checkForEntityUpdates(ctx.worldQueries.getWorldEntity(entity, n)!, nil)` | entity-lifecycle (2 calls) |
| `ctx.project.updates.updateWiresFromWorld(pole, n)` | `checkForEntityUpdates(ctx.worldQueries.getWorldEntity(pole, n)!, nil)` | wire-connections (3 calls) |

Note: `tryUpdateEntityFromWorld` returns `EntityUpdateResult` — tests that check the return value need to verify the result via entity state assertions instead.

#### 1e. Migrate existing tests — event simulation replacements

Replace direct `project.actions.*` calls with event simulation:

| Old call | Replacement | File |
|---|---|---|
| `ctx.project.actions.onTryFixEntity(preview, stage)` | Raise cleanup tool `on_player_selected_area` event | entity-lifecycle:88 |
| `ctx.project.actions.onEntityForceDeleteUsed(entity, stage, player)` | Raise force delete tool `on_player_selected_area` event | entity-lifecycle:185 |
| `ctx.project.actions.onMoveEntityToStageCustomInput(entity, stage, player)` | Raise stage move tool bring/send event | entity-lifecycle:270, 277 |
| `ctx.project.actions.userSetLastStageWithUndo(entity, stage, player)` | Raise stage deconstruct tool event | entity-lifecycle:390 |

### Success Criteria:

#### Automated Verification:
- [x] All existing tests pass: `pnpm run test`
- [x] No remaining direct calls to `project.updates`, `project.worldUpdates`, or `project.actions` in integration tests (except `buildEntity` helper)
- [x] No remaining direct calls to `entity.getWorldEntity`, `entity.getWorldOrPreviewEntity`, `entity.hasErrorAt`, `entity.getExtraEntity`, or `entity.hasAnyExtraEntities` in integration tests (all go through `ctx.worldQueries`)
- [x] Lint passes: `pnpm run lint`
- [x] Format passes: `pnpm run format:fix`

---

## Phase 2: Undo/Redo End-to-End Tests

### Overview
Only one undo integration test exists (stage delete alt-select, `entity-lifecycle.test.ts:388-407`). Add end-to-end undo tests for all undoable operations.

### Changes Required:

#### 1. New test file
**File**: `src/test/integration/undo-redo.test.ts`

All tests use `describeDualPipeline`. Undo is triggered via `_simulateUndo(player)`.

**Force delete undo:**
- Build entity at stage 3, create diff at stage 4 via `applyDiffViaWorld`
- Raise `on_player_selected_area` with `item: Prototypes.ForceDeleteTool`, entities = [world entity at stage 4]
- `assertEntityNotPresent`
- `_simulateUndo(player)`
- Verify entity restored: `assertEntityCorrect(entity, false)`

**Move entity to stage undo:**
- Build entity at stage 3
- Simulate by having player select preview at stage 2, raise custom input `MoveToThisStage`
  - OR call `project.actions.onMoveEntityToStageCustomInput` — this is one of the event-handler-pathway methods that both architectures expose with same signature. Acceptable if no easy event simulation exists.
  - Alternative: use stage move tool bring-to-stage event
- `_simulateUndo(player)`
- Verify `entity.firstStage == 3`, `assertEntityCorrect`

**Send to stage undo (stage move tool):**
- Build entity at stage 2
- Set `getProjectPlayerData(player.index, project).moveTargetStage = 4`
- Raise `on_player_selected_area` with `item: Prototypes.StageMoveTool` on stage 2 surface, entities = [world entity]
- Verify `entity.firstStage == 4`
- `_simulateUndo(player)`
- Verify `entity.firstStage == 2`, `assertEntityCorrect`

**Bring to stage undo (stage move tool reverse):**
- Build entity at stage 4
- Raise `on_player_reverse_selected_area` with `item: Prototypes.StageMoveTool` on stage 2 surface, entities = [preview entity at stage 2]
- Verify `entity.firstStage == 2`
- `_simulateUndo(player)`
- Verify `entity.firstStage == 4`, `assertEntityCorrect`

**Bring down to stage undo (stage move tool alt-reverse):**
- Build entity at stage 4
- Raise `on_player_alt_reverse_selected_area` with `item: Prototypes.StageMoveTool` on stage 2 surface
- Verify `entity.firstStage == 2`
- `_simulateUndo(player)`
- Verify `entity.firstStage == 4`, `assertEntityCorrect`

**Last stage set undo (stage deconstruct tool):**
- Build entity at stage 1
- Raise `on_player_selected_area` with `item: Prototypes.StageDeconstructTool` at stage 3, entities = [world entity at stage 3]
- Verify `entity.lastStage == 2`
- `_simulateUndo(player)`
- Verify `entity.lastStage == nil`, `assertEntityCorrect`

**Last stage cancel undo (stage deconstruct tool alt):**
- Build entity at stage 1, set lastStage via stage deconstruct tool at stage 4
- Raise `on_player_alt_selected_area` with `item: Prototypes.StageDeconstructTool` at stage 3, entities = [world entity at stage 3]
- Verify `entity.lastStage == nil`
- `_simulateUndo(player)`
- Verify `entity.lastStage == 3`, `assertEntityCorrect`

**Group undo (multiple entities in single selection):**
- Build 3 entities at different positions
- Select all with force delete tool in single event
- `_simulateUndo(player)` once
- All 3 entities restored

### Success Criteria:

#### Automated Verification:
- [x] Tests pass: `pnpm run test "undo%-redo"`
- [x] All existing tests pass: `pnpm run test`

**Implementation Note**: Pause for manual confirmation before proceeding.

---

## Phase 3: Stage Insert with Entities

### Overview
Stage insertion is not tested at integration level. Verify entities shift correctly with proper world state after insert.

### Changes Required:

#### 1. Add to stage-operations.test.ts
**File**: `src/test/integration/stage-operations.test.ts`

**Insert stage in the middle:**
- Build entity at stage 2, create diff at stage 4 via `applyDiffViaWorld`
- Build entity at stage 3
- Build entity at stage 1, set lastStage via stage deconstruct tool at stage 4
- Call `project.insertStage(3)`
- Verify:
  - Entity originally at stage 2 still at stage 2, diff shifted to stage 5
  - Entity originally at stage 3 now at stage 4
  - Entity with old lastStage 3 now has lastStage 4
  - `assertEntityCorrect` for all entities
  - All world entities belong to project entities (using `assertAllInsertersInProject` pattern)

**Insert stage at beginning (stage 1):**
- Build entity at stage 1
- Call `project.insertStage(1)`
- Verify entity shifted to stage 2, preview exists at stage 1
- `assertEntityCorrect`

**Insert stage at end:**
- Build entity at stage 1, set lastStage via stage deconstruct tool at stage 6
- Call `project.insertStage(ctx.project.numStages() + 1)`
- Verify entity's lastStage unchanged (5)
- `assertEntityCorrect`

### Success Criteria:

#### Automated Verification:
- [x] Tests pass: `pnpm run test "stage%-operations"`
- [x] All existing tests pass: `pnpm run test`

**Implementation Note**: Pause for manual confirmation before proceeding.

---

## Phase 4: Selection Tool Operations

### Overview
Selection tools (cleanup, stage move, force delete via selection) have zero integration test coverage except stage deconstruct tool.

### Changes Required:

#### 1. New test file
**File**: `src/test/integration/selection-tools.test.ts`

Use `describeDualPipeline`. All actions triggered via `Events.raiseFakeEventNamed`.

**Cleanup tool — fix error entity:**
- Build entity at stage 3, place wall at stage 4 to cause error
- Destroy wall
- Raise `on_player_selected_area` with `item: Prototypes.CleanupTool`, entities = [preview at stage 4]
- `assertEntityCorrect(entity, false)` — error cleared

**Cleanup tool — delete settings remnant:**
- Build entity at stage 3, create diff at stage 4 via `applyDiffViaWorld`
- Mine entity at stage 3 → becomes settings remnant
- `assertIsSettingsRemnant`
- Raise `on_player_selected_area` with `item: Prototypes.CleanupTool`, entities = [preview at stage 3]
- `assertEntityNotPresent`

**Force delete tool via selection (multiple entities):**
- Build 2 entities at different positions
- Raise `on_player_selected_area` with `item: Prototypes.ForceDeleteTool`, entities = [both world entities]
- Both entities not present
- `_simulateUndo(player)` — both restored (group undo)

**Stage move tool — send to stage:**
- Build entity at stage 2
- Set `getProjectPlayerData(player.index, project).moveTargetStage = 4`
- Raise `on_player_selected_area` with `item: Prototypes.StageMoveTool` on stage 2 surface
- Verify `entity.firstStage == 4`, `assertEntityCorrect`

**Stage move tool — send only if matches first stage (normal select):**
- Build entity at stage 2
- Set `moveTargetStage = 4`
- Raise `on_player_selected_area` on stage 3 surface (entity's first stage is 2, not 3)
- Verify entity NOT moved (`firstStage` still 2)

**Stage move tool — alt send (sends regardless of first stage):**
- Build entity at stage 2
- Set `moveTargetStage = 4`
- Raise `on_player_alt_selected_area` on stage 3 surface
- Verify entity moved to stage 4

**Stage move tool — bring to stage (reverse select):**
- Build entity at stage 4
- Raise `on_player_reverse_selected_area` with `item: Prototypes.StageMoveTool` on stage 2 surface
- Verify `entity.firstStage == 2`, `assertEntityCorrect`

**Stage move tool — bring down to stage (alt-reverse select):**
- Build entity at stage 1
- Raise `on_player_alt_reverse_selected_area` on stage 3 surface
- Verify `entity.firstStage == 3`, `assertEntityCorrect`

**Stage deconstruct tool — reverse (set last stage):**
- Build entity at stage 1
- Raise `on_player_reverse_selected_area` with `item: Prototypes.StageDeconstructTool` at stage 3
- Verify `entity.lastStage == 3`, `assertEntityCorrect`

### Success Criteria:

#### Automated Verification:
- [ ] Tests pass: `pnpm run test "selection%-tools"`
- [ ] All existing tests pass: `pnpm run test`

**Implementation Note**: Pause for manual confirmation before proceeding.

---

## Phase 5: Fast-Replace at Higher Stages

### Overview
First-stage fast replace is tested (`entity-lifecycle.test.ts:216-227`). Missing: fast replace at non-first stage creating a stage diff.

### Changes Required:

#### 1. Add to entity-lifecycle.test.ts
**File**: `src/test/integration/entity-lifecycle.test.ts`

Inside the existing `describe.each` block:

**Fast replace at higher stage creates diff:**
- Build entity at stage 1
- Teleport player to stage 3 surface
- `player.cursor_stack.set_stack(upgradeName)`
- `player.build_from_cursor({ position: pos, direction: dir })`
- Verify `entity.firstValue.name == name` (unchanged)
- Verify `entity.getStageDiff(3)` includes `{ name: upgradeName }`
- Verify world entity at stage 3 has upgrade name
- `assertEntityCorrect`

**Fast replace at higher stage with existing diff:**
- Build entity at stage 1
- Create diff at stage 3 via `applyDiffViaWorld` (e.g., change a property)
- Fast replace at stage 3 with upgrade via player simulation
- Verify diff updated to include name upgrade, `assertEntityCorrect`

### Success Criteria:

#### Automated Verification:
- [ ] Tests pass: `pnpm run test "entity%-lifecycle"`
- [ ] All existing tests pass: `pnpm run test`

**Implementation Note**: Pause for manual confirmation before proceeding.

---

## Phase 6: Multi-Stage Propagation

### Overview
Add dedicated tests for the full propagation chain across stages.

### Changes Required:

#### 1. Add to entity-lifecycle.test.ts
**File**: `src/test/integration/entity-lifecycle.test.ts`

**Entity at stage 1 has correct world entities at all stages:**
- Build entity at stage 1
- For each stage 1-6: verify `entity.getWorldEntity(stage)` exists, is not preview, saved value matches `entity.getValueAtStage(stage)`
- `assertEntityCorrect`

**Modify at stage 3, verify propagation:**
- Build entity at stage 1
- Modify world entity at stage 3 + `checkForEntityUpdates`
- Verify stages 1-2 world entities have original value (via `saveEntity`)
- Verify stages 3-6 world entities have updated value
- `assertEntityCorrect`

**Entity with lastStage:**
- Build entity at stage 1, set lastStage via stage deconstruct tool
- Verify stages up to lastStage have world entities
- Verify stages after lastStage have no world entities
- `assertEntityCorrect`

### Success Criteria:

#### Automated Verification:
- [ ] All tests pass: `pnpm run test`

**Implementation Note**: Pause for manual confirmation before proceeding.

---

## Phase 7: Error State Lifecycle

### Overview
Add full error → fix → highlights clear cycle tests.

### Changes Required:

#### 1. Add to entity-lifecycle.test.ts
**File**: `src/test/integration/entity-lifecycle.test.ts`

**Error clears when blocker removed and entity rebuilt:**
- Build entity at stage 3, place wall at stage 4
- Verify `entity.hasErrorAt(4) == true`
- Destroy wall
- Use cleanup tool on preview at stage 4 (triggers fix)
- Verify `entity.hasErrorAt(4) == false`
- `assertEntityCorrect(entity, false)`

**Error elsewhere indicator lifecycle:**
- Build entity at stage 2, place wall at stage 4
- Verify error at stage 4, verify `errorElsewhereIndicator` at non-error stages
- Destroy wall, use cleanup tool
- Verify all `errorElsewhereIndicator` gone
- `assertEntityCorrect(entity, false)`

### Success Criteria:

#### Automated Verification:
- [ ] All tests pass: `pnpm run test`

---

## Testing Strategy

### Dual-Pipeline Architecture
All new tests use `describeDualPipeline`. Both paths currently execute identically. In Phase 4 of the refactor, the "new" path will toggle `useNewArchitecture = true` and the adapter implementations will swap to new code.

### Adapter Swap Point
The adapters (`worldOps`, `projectOps`, `worldQueries`) on `EntityTestContext` are the swap points. When the new pipeline is ready:
1. `worldOps` delegates to `WorldPresentation` methods
2. `projectOps` delegates to `ProjectActions` methods
3. `worldQueries` delegates to `WorldPresentation` accessors (e.g., `project.worldPresentation.getWorldEntity(entity, stage)`) instead of `entity.getWorldEntity(stage)`
4. No individual tests change

Note: `worldQueries` is also swapped during Phase 2 (before Phase 4), when world entity storage moves from `ProjectEntity` to `EntityStorage`.

### Assertion Pattern
Every test ends with `assertEntityCorrect(entity, expectedError)` — validates world entities, previews, errors, highlights, and wire connections across all stages.

## References

- Phasing plan: `thoughts/shared/plans/separation-of-concerns-phases.md`
- Target state: `thoughts/shared/plans/separation-of-concerns-target-state.md`
- Test utility: `src/test/integration/integration-test-util.ts`
