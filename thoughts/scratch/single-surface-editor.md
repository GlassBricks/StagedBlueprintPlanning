# Single-Surface Project Editor

## Concept

Instead of N surfaces (one per stage), a project uses a single surface. When the player switches stages, the world entities on that surface are swapped to reflect the selected stage. The player stays on the same surface; only the visible entities change.

## Current Architecture Summary

- `ProjectSurfaces` maintains `Record<StageNumber, LuaSurface>` — one surface per stage
- `WorldPresentation` implements `ContentObserver`, `WorldPresenter`, `WorldEntityLookup` and maintains `EntityStorage<WorldEntityTypes>` — a 3-level map of `(ProjectEntity, type, StageNumber) → LuaEntity`
- Every world entity (real or preview) exists on its stage's surface simultaneously across all stages
- Player navigation = teleporting between surfaces
- `getStageAtSurface(surfaceIndex)` is the universal mechanism to determine which stage a Factorio event belongs to
- Entity highlights exist per-entity per-stage on each surface
- `on_chunk_generated` synchronizes chunk generation across all project surfaces

## Abstraction Layer: `ProjectPresentation`

Extract a `ProjectPresentation` interface that both multi-surface and single-surface modes implement. This interface is the single point of abstraction between the project data model and the world representation. `ProjectSurfaces`, `EntityStorage`, and stage-switching behavior are all implementation details behind this interface.

### Faceted Interface Design

`ProjectPresentation` exposes focused sub-interfaces as fields rather than inheriting everything into one flat surface. Consumers depend on only the facet they need.

```typescript
// Existing interfaces (unchanged)
interface WorldEntityLookup {
  getWorldOrPreviewEntity(entity: ProjectEntity, stage: StageNumber): LuaEntity | nil
  getWorldEntity(entity: ProjectEntity, stage: StageNumber): LuaEntity | nil
  hasErrorAt(entity: ProjectEntity, stage: StageNumber): boolean
}

interface WorldPresenter extends WorldEntityLookup {
  replaceWorldOrPreviewEntity(entity: ProjectEntity, stage: StageNumber, luaEntity: LuaEntity | nil): void
  destroyAllWorldOrPreviewEntities(entity: ProjectEntity): void
  rebuildStage(stage: StageNumber): void
  rebuildAllStages(): void
  rebuildEntity(entity: ProjectEntity, stage: StageNumber): void
  refreshEntity(entity: ProjectEntity, stage: StageNumber): void
  refreshAllEntities(entity: ProjectEntity): void
  deleteEntityAtStage(entity: ProjectEntity, stage: StageNumber): void
  resetUnderground(entity: ProjectEntity, stage: StageNumber): void
  updateTiles(position: Position, fromStage: StageNumber): TileCollision | nil
  disableAllEntitiesInStage(stage: StageNumber): void
  enableAllEntitiesInStage(stage: StageNumber): void
}

// Existing interface (unchanged)
interface SurfaceProvider {
  getSurface(stage: StageNumber): LuaSurface | nil
}

// New: stage switching abstraction
interface StageNavigation {
  switchPlayerToStage(player: LuaPlayer, stage: Stage): void
  getDisplayedStage(player: LuaPlayer): StageNumber
}

// New: unified presentation interface — faceted, not flat
interface ProjectPresentation extends SurfaceProvider {
  readonly project: Project

  // Sub-interface facets as fields
  readonly worldEntities: WorldEntityLookup
  readonly worldPresenter: WorldPresenter
  readonly navigation: StageNavigation

  // Stage resolution
  getStageForSurface(surfaceIndex: SurfaceIndex): Stage | nil

  // Lifecycle (called by Project internals)
  onStageInserted(stageNumber: StageNumber): void
  onStageDeleted(stageNumber: StageNumber): void
  resyncWithWorld(): void
  close(): void
  destroy(): void

  // Presentation-dependent event handling (moved from ProjectActions)
  onSurfaceCleared(stage: StageNumber): void
  onChunkGeneratedForEntity(previewEntity: LuaEntity, stage: StageNumber): void
  scanProjectForExistingTiles(): void
}
```

`ContentObserver` is NOT part of the public interface — it's an implementation detail. Both implementations implement it, but it's wired internally.

`SurfaceProvider` stays directly on the interface (1 method) since it's used pervasively via `stage.getSurface()`.

### Presentation-First Lookup

The current lookup chain is: **surface → stage → project → presentation**. This inverts the natural ownership. A surface belongs to a presentation, and the presentation determines the stage.

The new lookup is: **surface → presentation → stage**.

```typescript
// New global lookup
function getPresentationAtSurface(surfaceIndex: SurfaceIndex): ProjectPresentation | nil {
  return storage.surfaceIndexToPresentation.get(surfaceIndex)
}

// Stage resolution is a method on the presentation
// Multi-surface: looks up which stage owns this surface
// Single-surface: returns the active stage
presentation.getStageForSurface(surfaceIndex): Stage | nil
```

The combined lookup for event handlers (convenience):

```typescript
interface SurfaceContext {
  readonly presentation: ProjectPresentation
  readonly stage: Stage
}

function getContextAtSurface(surfaceIndex: SurfaceIndex): SurfaceContext | nil {
  const presentation = getPresentationAtSurface(surfaceIndex)
  if (!presentation) return nil
  const stage = presentation.getStageForSurface(surfaceIndex)
  if (!stage) return nil
  return { presentation, stage }
}
```

Event handlers receive this context and route to either `context.stage.actions.*` (for player actions) or `context.presentation.*` (for presentation events). They never navigate `stage.project.worldPresentation`.

### Consumer Dependency Map

Each consumer depends on the narrowest facet:

| Consumer | Facet | Methods used |
|----------|-------|-------------|
| `ProjectActions` | `worldPresenter` field | `replaceWorldOrPreviewEntity`, `refreshEntity`, `rebuildEntity`, `getWorldEntity`, etc. |
| `EntityHighlights` | `worldEntities` field | `getWorldOrPreviewEntity`, `getWorldEntity`, `hasErrorAt` |
| `wires.ts` | `worldEntities` field | `getWorldEntity` |
| `ProjectContent` | `ContentObserver` (internal) | `onEntityAdded`, `onEntityChanged`, etc. |
| `event-handlers.ts` | `SurfaceContext` | `presentation.getSurface`, `stage.actions.*` |
| `player-navigation.ts` | `navigation` field | `switchPlayerToStage` |
| `blueprint-creation.ts` | `SurfaceProvider`, `worldEntities` | `getSurface`, `getWorldEntity` |
| `set-tiles.ts` | `SurfaceProvider` | `getSurface` |
| UI / external code | `worldEntities` field | `getWorldEntity`, `getWorldOrPreviewEntity` |
| `EditorTab.tsx` | `worldPresenter` field | `rebuildStage`, `rebuildAllStages`, `disableAllEntitiesInStage` |

### Moving Methods Out of ProjectActions

Three methods move from `ProjectActions` to `ProjectPresentation`, eliminating ProjectActions' `SurfaceProvider` dependency entirely:

**`onSurfaceCleared(stage)`** — responds to `on_surface_cleared` by restoring entity previews and re-preparing the surface area. Event handlers route directly to `presentation.onSurfaceCleared(stage)`.

**`scanProjectForExistingTiles()`** — scans all surfaces for tiles and imports them into project content. UI button calls `project.presentation.scanProjectForExistingTiles()`.

**`onChunkGeneratedForEntity(previewEntity, stage)`** — refreshes a preview entity when its chunk generates. Event handlers route to `presentation.onChunkGeneratedForEntity(...)`.

After these moves, ProjectActions takes only `(content, worldPresenter, settings)` — no `SurfaceProvider`. It stays focused on player-initiated entity actions.

### What Goes Behind the Abstraction

These become implementation details, not exposed on `Project`:

| Component | Multi-Surface impl | Single-Surface impl |
|-----------|-------------------|---------------------|
| **Surface management** | `ProjectSurfaces` — one `LuaSurface` per stage, create/destroy on stage add/remove | Single `LuaSurface`, no lifecycle changes on stage add/remove |
| **Entity storage** | `EntityStorage<WorldEntityTypes>` — 3-level map `(entity, type, stage) → value`, all stages populated | Flat map `(entity, type) → value` — only active stage's entities exist |
| **Resync task** | `ResyncWithWorldTask` — reads all surfaces, rebuilds all stages across ticks | Reads and rebuilds active stage only |
| **Rebuild task** | `RebuildAllStagesTask` — iterates all stages | Rebuilds active stage (single step) |
| **Chunk sync** | `on_chunk_generated` syncs across all project surfaces | Standard single-surface chunk generation |

### `Stage.getSurface()` Delegation

Currently: `Stage.getSurface()` → `project.surfaces.getSurface(stageNumber)`.

New: `Stage.getSurface()` → `project.presentation.getSurface(stageNumber)`.

In multi-surface mode, returns the stage's dedicated surface. In single-surface mode, returns the single surface regardless of stage number. No call-site changes needed — the ~20 production call sites all go through `stage.getSurface()` or `SurfaceProvider`.

Note: with multiple presentations, `Stage.getSurface()` would need to know WHICH presentation. This could be addressed by deprecating `Stage.getSurface()` in favor of `presentation.getSurface(stage)` when multi-presentation support is added. For now, it delegates through the project's primary presentation.

### `Project` Interface Changes

```typescript
// Before
interface Project {
  surfaces: ProjectSurfaces
  worldPresentation: WorldPresentation
  // ...
}

// After
interface Project {
  presentation: ProjectPresentation
  // surfaces and worldPresentation removed from public interface
  // ...
}
```

External code accesses entity lookup via `project.presentation.worldEntities.getWorldEntity(...)`. Test utilities that currently reach into `wp.entityStorage` would use query methods on `worldEntities` instead.

## Implementation: Multi-Surface Presentation

Rename current `WorldPresentation` to `MultiSurfacePresentation`. It implements `ProjectPresentation` and internally owns `ProjectSurfaces` and `EntityStorage`. The facet fields point to `this` (since it implements all sub-interfaces directly).

```typescript
@RegisterClass("MultiSurfacePresentation")
class MultiSurfacePresentation
  implements ProjectPresentation, WorldPresenter, ContentObserver, StageNavigation {

  private surfaces: ProjectSurfaces
  private entityStorage: EntityStorage<WorldEntityTypes>
  private highlights: EntityHighlights

  // Facets — point to self
  readonly worldEntities: WorldEntityLookup = this
  readonly worldPresenter: WorldPresenter = this
  readonly navigation: StageNavigation = this

  // SurfaceProvider
  getSurface(stage: StageNumber): LuaSurface | nil {
    return this.surfaces.getSurface(stage)
  }

  // Stage resolution
  getStageForSurface(surfaceIndex: SurfaceIndex): Stage | nil {
    // look up which stage's surface has this index
  }

  // StageNavigation
  switchPlayerToStage(player: LuaPlayer, stage: Stage): void {
    recordPlayerLastPosition(player)
    teleportPlayer(player, this.surfaces.getSurface(stage.stageNumber)!, player.position)
    // playerCurrentStage updated via on_player_changed_surface event
  }

  getDisplayedStage(player: LuaPlayer): StageNumber {
    return this.getStageForSurface(player.surface_index)!.stageNumber
  }

  // Lifecycle
  onStageInserted(stageNumber: StageNumber): void {
    this.surfaces.insertSurface(stageNumber, ...)
    // shift entity storage keys, register surface
  }

  onStageDeleted(stageNumber: StageNumber): void {
    // unregister surface
    this.surfaces.deleteSurface(stageNumber)
    // shift entity storage keys
  }

  // Presentation-dependent events (moved from ProjectActions)
  onSurfaceCleared(stage: StageNumber): void { ... }
  onChunkGeneratedForEntity(previewEntity: LuaEntity, stage: StageNumber): void { ... }
  scanProjectForExistingTiles(): void { ... }

  // ContentObserver: updates all stages (existing behavior)
  // WorldPresenter: operates on all stages (existing behavior)
}
```

## Implementation: Dynamic Surface Presentation

New class for single-surface mode. Owns a single `LuaSurface` and a flat entity storage. May split sub-interface implementations into separate objects.

```typescript
@RegisterClass("DynamicSurfacePresentation")
class DynamicSurfacePresentation implements ProjectPresentation, ContentObserver {

  private surface: LuaSurface
  private activeStage: StageNumber
  private entityData: LuaMap<ProjectEntity, LuaMap<keyof WorldEntityTypes, unknown>>

  // Facets
  readonly worldEntities: WorldEntityLookup = this
  readonly worldPresenter: WorldPresenter    // assigned in constructor
  readonly navigation: StageNavigation       // assigned in constructor

  // SurfaceProvider: always returns the single surface
  getSurface(stage: StageNumber): LuaSurface | nil {
    return this.surface
  }

  // Stage resolution: always returns active stage
  getStageForSurface(surfaceIndex: SurfaceIndex): Stage | nil {
    return this.project.getStage(this.activeStage)
  }

  // ContentObserver: only act if change affects activeStage
  onEntityAdded(entity: ProjectEntity): void {
    if (entity.isInStage(this.activeStage)) {
      this.createWorldEntityForActiveStage(entity)
    }
  }

  onEntityChanged(entity: ProjectEntity, fromStage: StageNumber): void {
    if (this.activeStage >= fromStage) {
      this.updateWorldEntityForActiveStage(entity)
    }
  }

  // Lifecycle: no surface creation/destruction needed
  onStageInserted(stageNumber: StageNumber): void {
    if (stageNumber <= this.activeStage) this.activeStage++
  }

  onStageDeleted(stageNumber: StageNumber): void {
    if (stageNumber < this.activeStage) this.activeStage--
    else if (stageNumber == this.activeStage) this.rebuildActiveStage()
  }

  resyncWithWorld(): void {
    // can only validate active stage against world
  }

  onSurfaceCleared(stage: StageNumber): void {
    this.rebuildActiveStage()
  }

  onChunkGeneratedForEntity(previewEntity: LuaEntity, stage: StageNumber): void {
    if (stage == this.activeStage) { ... }
  }

  scanProjectForExistingTiles(): void {
    // can only scan the single surface (active stage)
  }

  private rebuildActiveStage(): void {
    // 1. Destroy all project entities on surface
    // 2. Clear flat entity storage
    // 3. Rebuild entities, tiles, highlights for activeStage
  }
}

class DynamicStageNavigation implements StageNavigation {
  constructor(private presentation: DynamicSurfacePresentation) {}

  switchPlayerToStage(player: LuaPlayer, stage: Stage): void {
    this.presentation.switchToStage(stage.stageNumber)
    // update playerCurrentStage property explicitly
  }

  getDisplayedStage(player: LuaPlayer): StageNumber {
    return this.presentation.activeStage
  }
}
```

## Surface Registration

Each presentation registers its surfaces in a global map. This replaces the current `storage.surfaceIndexToStage` with `storage.surfaceIndexToPresentation`.

```typescript
// Global storage
declare const storage: {
  surfaceIndexToPresentation: LuaMap<SurfaceIndex, ProjectPresentation>
}

// Each presentation registers/unregisters its surfaces
// Multi-surface: registers all stage surfaces
// Single-surface: registers the one surface
```

`getStageAtSurface()` (for backwards compatibility during transition) can be implemented as:

```typescript
function getStageAtSurface(surfaceIndex: SurfaceIndex): Stage | nil {
  const presentation = getPresentationAtSurface(surfaceIndex)
  return presentation?.getStageForSurface(surfaceIndex)
}
```

## Stage Switching Details

### Multi-Surface Mode

```
switchPlayerToStage(player, stage):
  1. recordPlayerLastPosition(player)
  2. teleportPlayer(player, stage.getSurface(), preservedPosition)
  3. playerCurrentStage updated via on_player_changed_surface event
```

### Single-Surface Mode

```
switchPlayerToStage(player, stage):
  1. set activeStage = stage.stageNumber
  2. destroy all project entities on surface
  3. rebuild entities for new stage
  4. rebuild tiles for new stage
  5. rebuild highlights for new stage
  6. explicitly update playerCurrentStage property
  (player position unchanged — stays on same surface)
```

### Performance: Incremental Stage Switching

Instead of destroy-all + rebuild-all, diff the old and new stages:

- Entities unchanged between stages → leave in place, update properties if needed
- Entities in old stage but not new → destroy
- Entities in new stage but not old → create
- Entity with stage diffs between old and new → update in place

Since ProjectEntity tracks `firstStage`, `lastStage`, and `stageDiffs`, the diff is cheap to compute. Most adjacent stages share the majority of entities, so incremental switching is significantly faster than full rebuild.

## Future Extension: Multiple Simultaneous Presentations

A single project could have multiple presentations active at once — for example, a multi-surface presentation alongside a dynamic presentation, or multiple dynamic presentations showing different stages.

### Preparation: Presentation-First Routing

To support this, all handlers and UI code should route through a specific presentation instance, never navigating `stage.project.presentation` to find "the" presentation. The key changes:

**1. Surface registration maps to presentation, not project.**

Already addressed above: `storage.surfaceIndexToPresentation` maps each surface to the specific presentation that owns it. Multiple presentations can register different surfaces for the same project.

**2. Event handlers receive `SurfaceContext` (presentation + stage), not just stage.**

```typescript
interface SurfaceContext {
  readonly presentation: ProjectPresentation
  readonly stage: Stage
}

function getContextAtSurface(surfaceIndex: SurfaceIndex): SurfaceContext | nil {
  const presentation = getPresentationAtSurface(surfaceIndex)
  if (!presentation) return nil
  const stage = presentation.getStageForSurface(surfaceIndex)
  if (!stage) return nil
  return { presentation, stage }
}
```

Event handlers use `context.presentation.worldPresenter` instead of `stage.project.presentation.worldPresenter`. This naturally routes to the correct presentation for the surface the event occurred on.

Current coupling points that need this change (production code):
- `event-handlers.ts:397, 941` — blueprint paste reaches `stage.project.worldPresentation` directly. Should use the captured presentation from the surface context.
- `event-handlers.ts:1379` — content access via `stage.project.content`. Content is project-level (shared), so `stage.project.content` is still correct.

**3. Player tracking references presentation, not just stage.**

`playerCurrentStage` currently stores `Stage | nil`. For multi-presentation, the player is on a specific presentation's surface. Options:

- Track `PlayerPresentationContext: { presentation: ProjectPresentation, stage: Stage } | nil` instead of just `Stage | nil`
- Or: derive the presentation from the player's surface on demand via `getPresentationAtSurface(player.surface_index)`

The on-demand approach avoids storing redundant state and works naturally since the player is always on exactly one surface.

`PlayerChangedStageEvent` currently carries `(player, stage | nil, oldStage | nil)`. For multi-presentation, it should carry presentation context:

```typescript
interface PlayerStageContext {
  readonly presentation: ProjectPresentation
  readonly stage: Stage
}

PlayerChangedStageEvent: GlobalEvent<[
  player: LuaPlayer,
  context: PlayerStageContext | nil,
  oldContext: PlayerStageContext | nil,
]>
```

Listeners that currently use `stage.project` to compare projects would use `context.presentation.project` instead.

**4. UI components receive presentation explicitly.**

Currently UI code reaches presentation via `stage.project.worldPresentation`. In multi-presentation, the UI component must know which presentation it's operating on. For components tied to a specific surface/view, the presentation is determined by context. For project-level UI (like EditorTab), the user selects which presentation to operate on, or the UI operates on all.

Specific sites:
- `opened-entity.tsx` — opens entity GUI for a world entity. Should receive presentation from the surface the entity is on.
- `copy-staged-value.ts` — copies entity value at a stage. Should receive presentation from the player's current surface.
- `EditorTab.tsx` — rebuild/disable operations. Could operate on a selected presentation or all.
- `create-blueprint-with-stage-info.ts` — creates blueprint from surface entities. Should receive presentation from the stage's surface context.

**5. ProjectContent supports multiple observers.**

Currently `setObserver(single)` replaces the observer. For multiple presentations:

```typescript
class MutableProjectContent {
  private observers: ContentObserver[] = []

  addObserver(observer: ContentObserver): void {
    this.observers.push(observer)
  }

  removeObserver(observer: ContentObserver): void {
    // remove from array
  }

  // Notification methods iterate all observers:
  private notifyEntityChanged(entity: ProjectEntity, fromStage: StageNumber): void {
    for (const observer of this.observers) {
      observer.onEntityChanged(entity, fromStage)
    }
  }
}
```

Each presentation registers itself as an observer. When an entity changes, all presentations are notified and update their own world representations.

**6. ProjectActions takes a specific WorldPresenter, not "the" presenter.**

Currently one `ProjectActions` per project, wired to one `WorldPresenter`. With multiple presentations, player actions need to route to the presentation the player is currently interacting with.

Options:
- **Per-presentation actions:** Each presentation creates its own `ProjectActions` wired to its `WorldPresenter`. `stage.actions` would need to know which presentation is relevant.
- **Actions receives presenter dynamically:** `ProjectActions` methods take a `WorldPresenter` parameter instead of storing one. The event handler passes the correct presenter from the surface context.
- **Actions delegates through content:** Since `ProjectActions` primarily mutates `ProjectContent` (which notifies all observers), the world presentation updates happen indirectly. The direct `worldPresenter` calls in ProjectActions (replaceWorldOrPreviewEntity, refreshEntity, etc.) are for immediate feedback — these should target the specific presentation the player interacted with.

The cleanest approach: event handlers resolve the presentation from the surface, then call `stage.actions` with the presentation's `worldPresenter` as context. ProjectActions methods that currently use `this.worldPresenter` would take it as a parameter instead. Content mutations notify all presentations via the observer pattern.

### What Can Be Prepared Now

These changes are compatible with the single-presentation design and lay groundwork:

1. **Use `SurfaceContext` in event handlers** instead of bare `Stage`. Even with one presentation, the context carries both and avoids `stage.project.presentation` navigation.

2. **Register presentations (not projects) in surface map.** Already part of the current plan.

3. **Change `ProjectContent.setObserver` to `addObserver/removeObserver`.** Simple change, backward-compatible (just call `addObserver` where `setObserver` was called).

4. **UI components receive presentation as a parameter** rather than navigating through `stage.project`. Even with one presentation, this makes the dependency explicit.

5. **`PlayerChangedStageEvent` carries context** (presentation + stage) instead of bare stage.

6. **Avoid `stage.project.presentation` navigation** in all new code. Use the presentation from surface context or pass it explicitly.

## Changes Required by Area

### Event Handlers (`event-handlers.ts`)

Replace `getStageAtSurface()` with `getContextAtSurface()` returning `SurfaceContext`. Handlers receive both presentation and stage. Route player actions through `context.stage.actions.*` and presentation events through `context.presentation.*`.

Three events routed to presentation instead of actions:
- `on_surface_cleared` → `presentation.onSurfaceCleared(stage)`
- `on_chunk_generated` (entity refresh) → `presentation.onChunkGeneratedForEntity(...)`
- Chunk cross-surface sync: handled internally by presentation

Two blueprint paste sites (`event-handlers.ts:397, 941`) that currently reach `stage.project.worldPresentation` should use the captured presentation from the surface context instead.

### Player Navigation (`player-current-stage.ts`, `player-navigation.ts`)

Navigation functions call `presentation.navigation.switchPlayerToStage()`. The presentation handles mode-specific behavior.

`playerCurrentStage` tracking:
- Multi-surface: derived from `on_player_changed_surface` via `getContextAtSurface()`
- Single-surface: updated explicitly by `switchPlayerToStage()`

`teleportToProject()` and `exitProject()` still teleport (crossing between project and non-project surfaces).

### Entity Highlights (`entity-highlights.ts`)

`EntityHighlights` depends on `SurfaceProvider` and `WorldEntityLookup` — both provided by the presentation. In single-surface mode:
- Highlights created only for the active stage
- All highlights destroyed and recreated on stage switch (as part of rebuild)
- `SurfaceProvider.getSurface(stage)` returns the single surface

### Blueprint Operations (`blueprints/`)

Blueprint creation uses `stage.getSurface()` which delegates through the presentation. Blueprint paste flow captures a `SurfaceContext` at `on_pre_build` and carries it through the operation, ensuring all entity lookups use the correct presentation.

### Tiles (`set-tiles.ts`)

Tile operations use `stage.getSurface()`. In single-surface mode, only the active stage's tiles are present on the surface.

### Tools (selection tools)

All selection tools operate on "whatever is on the surface." No changes needed.

### Import/Export

Surface-independent — operates on ProjectEntity data. No changes needed.

### Project Settings UI

- Stage list navigation: calls `presentation.navigation.switchPlayerToStage()`
- Editor tab: rebuild/disable operations target a specific presentation
- Tile scan button: calls `presentation.scanProjectForExistingTiles()`
- New setting: presentation mode selector (multi-surface vs single-surface)

## Configuration & Mode Switching

- Project-level setting: `presentationMode: "multi-surface" | "single-surface"`
- Configurable in project settings UI
- Switching from multi-surface → single-surface:
  1. Unregister old presentation's surfaces, remove observer
  2. Destroy all surfaces except one (or create a fresh one)
  3. Create `DynamicSurfacePresentation`, add as observer, register surface
  4. Rebuild for stage 1
  5. Teleport all players in this project to the single surface
- Switching from single-surface → multi-surface:
  1. Unregister old presentation's surface, remove observer
  2. Create surfaces for all stages
  3. Create `MultiSurfacePresentation`, add as observer, register surfaces
  4. Rebuild each stage's surface
- Both transitions destroy world state but preserve ProjectEntity data

## Behavioral Differences & Limitations

| Aspect | Multi-Surface | Single-Surface |
|--------|--------------|----------------|
| Multiple players viewing different stages | Yes | No — all share same view |
| Viewing two stages side-by-side | Yes (two screens) | No |
| Stage switch speed | Instant (teleport) | Rebuild delay (mitigated by incremental diff) |
| Memory usage | N surfaces worth of chunks + entities | 1 surface |
| Resync from world | All stages | Active stage only |
| Blueprint for non-active stage | Direct | Requires stage switch first |

## Implementation Approach

### Phase 1: Extract `ProjectPresentation` interface (pure refactor)

1. Define `ProjectPresentation` interface with faceted fields (`worldEntities`, `worldPresenter`, `navigation`)
2. Rename `WorldPresentation` → `MultiSurfacePresentation`, implement `ProjectPresentation`
3. Move `ProjectSurfaces` ownership into `MultiSurfacePresentation`
4. Move `EntityStorage` into `MultiSurfacePresentation` (remove public access)
5. Move `onSurfaceCleared`, `onChunkGeneratedForEntity`, `scanProjectForExistingTiles` from `ProjectActions` to `MultiSurfacePresentation`
6. Remove `SurfaceProvider` dependency from `ProjectActions`
7. Move stage-switching logic (from `player-current-stage.ts`) into `MultiSurfacePresentation`'s `StageNavigation`
8. Move `ResyncWithWorldTask` into `MultiSurfacePresentation`
9. Change `Project` interface: replace `surfaces` + `worldPresentation` with `presentation: ProjectPresentation`
10. `Stage.getSurface()` delegates through `project.presentation.getSurface(stageNumber)`
11. Update all external references (`project.worldPresentation.x` → `project.presentation.worldPresenter.x`, etc.)
12. **All existing behavior unchanged — purely a refactor**

### Phase 1.5: Multi-presentation preparation (optional, can interleave with phase 1)

1. Change `ProjectContent.setObserver` to `addObserver/removeObserver`
2. Replace `getStageAtSurface()` with `getContextAtSurface()` returning `SurfaceContext`
3. Change surface registration to map surfaces to presentations (not stages/projects)
4. Update event handlers to use `SurfaceContext` and avoid `stage.project.presentation` navigation
5. Update `PlayerChangedStageEvent` to carry `SurfaceContext`
6. Pass presentation explicitly to UI components instead of navigating through stage.project
7. **Still one presentation per project — but the plumbing supports multiple**

### Phase 2: Implement `DynamicSurfacePresentation`

- Implement `ProjectPresentation` with single surface + flat entity storage
- Stage switching with incremental diff optimization
- Active stage tracking and `getStageForSurface` implementation
- All `ContentObserver` methods conditioned on active stage
- `StageNavigation` impl that rebuilds instead of teleporting

### Phase 3: Mode selection and switching

- Add presentation mode setting to `ProjectSettings`
- UI for mode selection in project settings
- Mode switching logic (surface creation/destruction, presentation swap)
- Teleport players during mode switch

### Phase 4: Polish

- Progress indicator during stage switching (if needed for large projects)
- Block stage switching during async operations
- Test coverage for single-surface mode
- Test coverage for mode switching
