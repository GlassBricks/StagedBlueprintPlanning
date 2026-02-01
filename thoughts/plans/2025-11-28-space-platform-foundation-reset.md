# Space Platform Foundation Reset Implementation Plan

## Overview

Implement a "Reset space platform foundations" feature for space platform projects that computes minimal platform tiles needed to support all entities while ensuring connectivity and no holes, then syncs with the staged tiles system.

## Current State Analysis

The first part of space platform tile handling has been implemented:
- `UserProject.ts:113-116` - Default `landfillTile` is set to `"space-platform-foundation"` for space platforms
- `ProjectSettings.tsx:244-246` - UI shows "Platform tile:" label instead of "Selected tile:" for space platforms
- `UserProject.isSpacePlatform()` method exists to detect space platform projects

Current tile filling functionality:
- Three fill buttons exist: "Fill with landfill tile", "Fill with landfill and water", "Fill with landfill and lab tiles"
- These use `setTilesForStage()`, `setTilesAndWaterForStage()`, `setTilesAndCheckerboardForStage()` from `src/tiles/set-tiles.ts`
- Tile operations integrate with staged tiles system via `project-updates.ts:setTileAtStage()`

Tile optimization algorithm:
- Exists in `thoughts/scratch/steiner_erosion.ts` as generic TypeScript
- Needs porting to TypescriptToLua (TSTL) compatible code
- Implements priority queue erosion algorithm that starts with filled area and removes unnecessary tiles
- Ensures single 8-connected component with no holes (4-connected empty space from boundary)

## Desired End State

For space platform projects:
- Single "Reset space platform foundations" button replaces the three existing fill buttons in UI
- Clicking the button:
  1. Identifies all tile positions blocked by entities (required tiles)
  2. Runs optimization algorithm to find minimal tile set that:
     - Includes all required tiles
     - Forms single 8-connected component
     - Has no holes (empty tiles are 4-connected to boundary)
  3. Applies optimized tile layout to the surface
  4. If staged tiles are enabled, updates the stored tile data to match

### Verification
- Unit tests pass for steiner erosion algorithm
- Integration test verifies full reset operation on a test space platform
- Manual test: Create space platform with scattered entities, verify minimal tiles used while maintaining connectivity

## What We're NOT Doing

- Not modifying the behavior for non-space-platform projects (keep existing three buttons)
- Not changing how staged tiles work fundamentally
- Not optimizing for real-time performance (this is a manual operation, async task is acceptable)
- Not making the erosion algorithm configurable (use sensible defaults for distance priorities)

## Implementation Approach

Break into four phases:
1. Port steiner erosion algorithm to TSTL-compatible code
2. Implement the reset foundations core algorithm
3. Update UI to conditionally show appropriate buttons
4. Ensure staged tiles integration works correctly

Each phase can be tested independently before moving to the next.

---

## Phase 1: Port Steiner Erosion Algorithm

### Overview
Port the tile optimization algorithm from `thoughts/scratch/steiner_erosion.ts` to TSTL-compatible TypeScript in the main codebase.

### Changes Required

#### 1. Create new file: `src/tiles/steiner-erosion.ts`
**Changes**: Port the algorithm with TSTL compatibility fixes

TSTL adaptations needed:
- Replace `Set<string>` with `LuaSet<string>`
- Replace `Map<string, number>` with `LuaMap<string, number>` or `Record<string, number>`
- Use `nil` instead of `undefined`
- Array operations: Replace `.shift()` with manual index tracking (queue index pattern)
- Array initialization: Use Lua-compatible patterns

Implementation structure:
```typescript
export type Point = [number, number]

// MaxHeap for priority queue - port from original
class MaxHeap {
  private heap: { dist: number; distCenter: number; x: number; y: number; key: string }[]

  push(dist: number, distCenter: number, x: number, y: number, key: string): void
  pop(): string | nil
  isEmpty(): boolean
  // ... helper methods
}

// Core functions to export:
export function solveSteinerErosion(
  W: number,
  H: number,
  required: LuaSet<string>
): LuaSet<string>

// Helper functions:
export function posToKey(p: Point): string  // Convert [x,y] to "x,y" string key
export function keyToPos(k: string): Point  // Convert "x,y" string key to [x,y]
export function pointsToSet(points: Point[]): LuaSet<string>
export function visualize(W: number, H: number, required: LuaSet<string>, filled: LuaSet<string>): string
```

Algorithm overview:
1. Start with filled bounding box around required tiles
2. BFS from boundary to detect holes and fill them (required tiles can't be removed)
3. BFS from required tiles to compute distance priorities
4. Priority queue erosion: Remove tiles far from required tiles while maintaining:
   - 8-connected component (no tile removal that splits the platform)
   - No holes (all empty tiles must be 4-connected to boundary)

Notes:
- The MaxHeap implementation is already complete in the source file
- Use `LuaSet` from typed-factorio for set operations
- String keys in "x,y" format for tile positions (via `posToKey`/`keyToPos`)
- Queue pattern: use index tracking instead of `.shift()`
- `posToKey([x, y])` returns `"x,y"` - use `tostring(x)` and string concatenation
- `keyToPos("x,y")` returns `[x, y]` - use `string.match()` or `string.gmatch()` to parse

#### 2. Create test file: `src/test/tiles/steiner-erosion.test.ts`
**Changes**: Create comprehensive unit tests using **data-driven/parameterized testing**

**IMPORTANT:** Use parameterized tests (e.g., `test.each()` pattern) to avoid repetitive test code.

Structure:
```typescript
describe("solveSteinerErosion()", () => {
  // Helper to create test grids from patterns
  function makeGrid(pattern: string[]): { W: number; H: number; required: LuaSet<string> } {
    // Parse pattern like ["R.R", "...", "R.R"] where R = required, . = empty
  }

  // Parameterized test cases
  const testCases = [
    {
      name: "four corners",
      pattern: ["R.....R", ".......", ".......", ".......", ".......", ".......", "R.....R"],
      expectedMaxTiles: 30, // Should connect efficiently
    },
    {
      name: "single required tile",
      pattern: ["...", ".R.", "..."],
      expectedResult: 1, // Just that tile
    },
    {
      name: "empty required set",
      pattern: ["...", "...", "..."],
      expectedResult: 0,
    },
    // ... more test cases
  ]

  test.each(testCases)("$name", ({ pattern, expectedMaxTiles, expectedResult }) => {
    const { W, H, required } = makeGrid(pattern)
    const result = solveSteinerErosion(W, H, required)

    if (expectedResult !== undefined) {
      expect(result.size).toBe(expectedResult)
    } else if (expectedMaxTiles !== undefined) {
      expect(result.size).toBeLessThanOrEqual(expectedMaxTiles)
    }

    // All required tiles must be in result
    for (const tile of required) {
      expect(result.has(tile)).toBe(true)
    }

    // Verify connectivity, no holes (if result is non-empty)
    if (result.size > 0) {
      verifyConnectivity(W, H, result)
      verifyNoHoles(W, H, result)
    }
  })
})
```

Test cases to include:
- **Four corners** - should connect with minimal tiles
- **Single required tile** - should return just that tile
- **Empty required set** - should return empty set
- **Two adjacent tiles** - should not add extra tiles
- **Required tiles with holes** - holes should be filled and included in result
- **Large sparse grid** - few required tiles in large area, should remove most tiles
- **Already optimal layout** - should not modify an already-minimal connected set
- **L-shaped required tiles** - verify connectivity maintained with minimal additions
- **Scattered clusters** - multiple groups should be connected efficiently
- **Boundary tiles** - required tiles at grid edges handled correctly
- **All tiles required** - should return full grid when all tiles are required

Helper functions to implement:
- `makeGrid(pattern: string[])` - Convert ASCII pattern to grid
- `verifyConnectivity(W, H, filled)` - BFS to ensure 8-connected component
- `verifyNoHoles(W, H, filled)` - BFS from boundary to ensure no isolated empty regions

### Success Criteria

#### Automated Verification:
- [x] All steiner erosion unit tests pass: `npm run test` (filter for steiner-erosion.test.ts)
- [x] Build succeeds without TSTL warnings: `npm run build:test`
- [ ] Type checking passes: `npm run lint`

#### Manual Verification:
- [ ] Use `visualize()` helper to inspect algorithm output for test cases
- [ ] Verify algorithm produces minimal tile sets while maintaining connectivity
- [ ] Verify no holes are present in output (empty tiles are 4-connected to boundary)

---

## Phase 2: Implement Reset Platform Foundations Function

### Overview
Create the main algorithm that resets space platform foundations by identifying required tiles, computing optimal layout, and syncing with staged tiles.

### Changes Required

#### 1. Add to `src/tiles/set-tiles.ts`
**File**: `src/tiles/set-tiles.ts`
**Changes**: Add new exported function `resetSpacePlatformFoundations()`

```typescript
import { solveSteinerErosion, posToKey, keyToPos, Point } from "./steiner-erosion"

export function resetSpacePlatformFoundations(stage: Stage): boolean {
  const project = stage.project
  const surface = stage.surface
  const area = stage.getBlueprintBBox()
  const bbox = BBox.load(area)

  // Step 1: Fill with space-platform-foundation forcibly to reset
  const tiles = getTiles(area, "space-platform-foundation")
  surface.set_tiles(tiles, true, true, true, true) // force=true

  // Step 2: Try to remove tiles with empty-space, abort_on_collision
  // Tiles that remain are blocked by entities (required tiles)
  const emptyTiles = getTiles(area, "empty-space")
  surface.set_tiles(emptyTiles, false, "abort_on_collision")

  // Step 3: Query which tiles are still platform tiles (required positions)
  const required = new LuaSet<string>()
  const foundationTiles = surface.find_tiles_filtered({
    area,
    name: "space-platform-foundation"
  })

  for (const tile of foundationTiles) {
    const pos = tile.position
    // Convert to grid coordinates relative to bbox
    const gridX = math.floor(pos.x - bbox.left_top.x)
    const gridY = math.floor(pos.y - bbox.left_top.y)
    required.add(posToKey([gridX, gridY]))
  }

  // Step 4: Run steiner erosion algorithm to find optimal tile set
  const width = bbox.width()
  const height = bbox.height()
  const optimized = solveSteinerErosion(width, height, required)

  // Step 5: Apply optimized layout to surface
  withTileEventsDisabled(() => {
    applyOptimizedTiles(surface, bbox, optimized)
  })

  // Step 6: Update staged tiles if enabled
  if (project.stagedTilesEnabled.get()) {
    syncStagedTiles(project, stage, bbox, optimized)
  }

  return true
}

function applyOptimizedTiles(
  surface: LuaSurface,
  bbox: BBox,
  optimized: LuaSet<string>
): void {
  const tiles: Mutable<TileWrite>[] = []

  // Iterate over entire bounding box
  for (const [x, y] of bbox.iterateTiles()) {
    const gridX = x - bbox.left_top.x
    const gridY = y - bbox.left_top.y
    const k = posToKey([gridX, gridY])

    tiles.push({
      position: { x, y },
      name: optimized.has(k) ? "space-platform-foundation" : "empty-space"
    })
  }

  surface.set_tiles(tiles, true, true, true, true)
}

function syncStagedTiles(
  project: UserProject,
  stage: Stage,
  bbox: BBox,
  optimized: LuaSet<string>
): void {
  // Update project tile data to match optimized layout
  for (const [x, y] of bbox.iterateTiles()) {
    const gridX = x - bbox.left_top.x
    const gridY = y - bbox.left_top.y
    const k = posToKey([gridX, gridY])

    const tileName = optimized.has(k) ? "space-platform-foundation" : nil
    project.updates.setTileAtStage({ x, y }, stage.stageNumber, tileName)
  }
}
```

Key implementation notes:
- Use `withTileEventsDisabled()` wrapper for tile operations to avoid event spam
- Convert between world coordinates and grid coordinates (0-based relative to bbox)
- The algorithm works on grid coordinates, surface operations use world coordinates
- `abort_on_collision` in step 2 identifies tiles blocked by entities
- Handle edge case: empty blueprint area (no required tiles)

#### 2. Update locale strings
**File**: `src/locale/en/en.cfg`
**Changes**: Add new locale key under `[gui-project-settings]` section

```ini
ResetSpacePlatformFoundations=Reset space platform foundations
ResetSpacePlatformFoundationsTooltip=Clears and resets space platform foundations, to only tiles needed under entities. Connects islands components using a heuristic algorithm; hand-optimization may be better for less tiles.
```

Then run: `npm run build:locale` to regenerate type definitions

### Success Criteria

#### Automated Verification:
- [x] Build succeeds: `npm run build:test`
- [ ] Type checking passes: `npm run lint`
- [x] Locale build generates correct types: `npm run build:locale`

#### Manual Verification:
- [ ] Function can be called programmatically without errors
- [ ] Platform tiles are filled correctly
- [ ] Empty space is removed where entities don't block
- [ ] (Will verify full behavior in Phase 4 integration test)

---

## Phase 3: Update UI for Space Platforms

### Overview
Conditionally show either the single "Reset space platform foundations" button (for space platforms) or the existing three fill buttons (for normal projects).

### Changes Required

#### 1. Modify `src/ui/ProjectSettings.tsx`
**File**: `src/ui/ProjectSettings.tsx`
**Changes**: Update the `EditorTab()` method around lines 258-279

Replace the three fill button section with conditional rendering:

```typescript
// Around line 258-279, replace:
<button ... caption={[L_GuiProjectSettings.SetLabTiles]} ... />
<button ... caption={[L_GuiProjectSettings.SetSelectedTile]} ... />
<button ... caption={[L_GuiProjectSettings.SetSelectedTileAndLab]} ... />
<button ... caption={[L_GuiProjectSettings.SetSelectedTileAndWater]} ... />

// With:
{this.project.isSpacePlatform() ? (
  <button
    styleMod={{ width: LandfillButtonWidth }}
    caption={[L_GuiProjectSettings.ResetSpacePlatformFoundations]}
    tooltip={[L_GuiProjectSettings.ResetSpacePlatformFoundationsTooltip]}
    on_gui_click={ibind(this.resetSpacePlatformFoundations)}
  />
) : (
  <>
    <button
      styleMod={{ width: LandfillButtonWidth }}
      caption={[L_GuiProjectSettings.SetLabTiles]}
      on_gui_click={ibind(this.setLabTiles)}
    />
    <button
      styleMod={{ width: LandfillButtonWidth }}
      caption={[L_GuiProjectSettings.SetSelectedTile]}
      on_gui_click={ibind(this.setSelectedTile)}
    />
    <button
      styleMod={{ width: LandfillButtonWidth }}
      caption={[L_GuiProjectSettings.SetSelectedTileAndLab]}
      tooltip={[L_GuiProjectSettings.SetSelectedTileAndLabTooltip]}
      on_gui_click={ibind(this.setLandfillAndLabTiles)}
    />
    <button
      styleMod={{ width: LandfillButtonWidth }}
      caption={[L_GuiProjectSettings.SetSelectedTileAndWater]}
      tooltip={[L_GuiProjectSettings.SetSelectedTileAndWaterTooltip]}
      on_gui_click={ibind(this.setLandfillAndWater)}
    />
  </>
)}
```

Add new method to the `ProjectSettings` class:

```typescript
private resetSpacePlatformFoundations() {
  const stage = playerCurrentStage(this.playerIndex).get()
  if (!stage || !stage.valid) return
  const success = resetSpacePlatformFoundations(stage)
  if (!success) {
    game.get_player(this.playerIndex)?.create_local_flying_text({
      text: [L_GuiProjectSettings.FailedToSetTiles],
      create_at_cursor: true,
    })
  }
}
```

Import the new function at the top:
```typescript
import {
  setCheckerboard,
  setTilesAndCheckerboardForStage,
  setTilesAndWaterForStage,
  setTilesForStage,
  resetSpacePlatformFoundations,  // ADD THIS
} from "../tiles/set-tiles"
```

### Success Criteria

#### Automated Verification:
- [x] Build succeeds: `npm run build:test`
- [ ] Type checking passes: `npm run lint`
- [x] No JSX/TSX compilation errors

#### Manual Verification:
- [ ] Open project settings for a normal project - should show 4 buttons (lab tiles + 3 landfill variants)
- [ ] Open project settings for a space platform project - should show 1 button ("Reset space platform foundations")
- [ ] Button click triggers the reset function without errors

---

## Phase 4: Integration Testing and Staged Tiles

### Overview
Create a single integration test to verify the full feature works with real Factorio tiles and staged tiles system. The algorithm itself is thoroughly tested via unit tests in Phase 1.

### Changes Required

#### 1. Create integration test
**File**: `src/test/integration/space-platform-foundations.test.ts`
**Changes**: New test file with single comprehensive test

```typescript
import { test, before_all, describe, expect } from "@NoResolution/factorio-test"
import { createTestStage } from "../project/project-test-util"
import { resetSpacePlatformFoundations } from "../../tiles/set-tiles"

describe("space platform foundation reset", () => {
  test("resets platform with scattered entities - full integration", () => {
    // This is the ONLY integration test - it verifies:
    // 1. Real Factorio tile operations work correctly
    // 2. Entity collision detection works
    // 3. Tiles are properly connected after reset
    // 4. Staged tiles integration works
    // 5. No unnecessary tiles remain

    const project = createSpacePlatformProject()
    project.stagedTilesEnabled.set(true)
    const stage = project.getStage(1)!
    const surface = stage.surface
    const bbox = stage.getBlueprintBBox()

    // Place scattered entity groups to create multiple "islands"
    // Group 1: Top-left
    surface.create_entity({ name: "space-platform-hub", position: { x: 5, y: 5 }, force: "player" })
    surface.create_entity({ name: "assembling-machine-1", position: { x: 6, y: 5 }, force: "player" })

    // Group 2: Top-right
    surface.create_entity({ name: "assembling-machine-1", position: { x: 15, y: 5 }, force: "player" })

    // Group 3: Bottom-left
    surface.create_entity({ name: "assembling-machine-1", position: { x: 5, y: 15 }, force: "player" })

    // Group 4: Bottom-right
    surface.create_entity({ name: "assembling-machine-1", position: { x: 15, y: 15 }, force: "player" })

    // Fill area with platforms initially (simulating manual placement)
    const allTiles = getTiles(bbox, "space-platform-foundation")
    surface.set_tiles(allTiles, true)

    const initialCount = surface.count_tiles_filtered({
      area: bbox,
      name: "space-platform-foundation"
    })

    // Run the reset operation
    resetSpacePlatformFoundations(stage)

    // Verify results
    const finalCount = surface.count_tiles_filtered({
      area: bbox,
      name: "space-platform-foundation"
    })

    // Should remove unnecessary tiles
    expect(finalCount).toBeLessThan(initialCount)
    expect(finalCount).toBeGreaterThan(0)

    // All entity positions must still have platform tiles
    const entities = surface.find_entities_filtered({ area: bbox })
    for (const entity of entities) {
      const tile = surface.get_tile(entity.position.x, entity.position.y)
      expect(tile.name).toBe("space-platform-foundation")
    }

    // Verify staged tiles were updated correctly
    const platformTiles = surface.find_tiles_filtered({
      area: bbox,
      name: "space-platform-foundation"
    })
    for (const tile of platformTiles) {
      const projectTile = project.content.tiles.get(tile.position.x, tile.position.y)
      expect(projectTile).toExist()
      expect(projectTile.getTileAtStage(stage.stageNumber)).toBe("space-platform-foundation")
    }

    // Verify tiles form connected component
    // (This is guaranteed by algorithm, but verify integration works)
    // Simple check: walk from first platform tile using flood fill
    const platformPositions = new LuaSet<string>()
    for (const tile of platformTiles) {
      platformPositions.add(`${tile.position.x},${tile.position.y}`)
    }

    const visited = new LuaSet<string>()
    const queue: Position[] = [platformTiles[0].position]
    visited.add(`${platformTiles[0].position.x},${platformTiles[0].position.y}`)

    while (queue.length > 0) {
      const pos = queue.shift()!

      // Check 8 neighbors
      for (const dx of [-1, 0, 1]) {
        for (const dy of [-1, 0, 1]) {
          if (dx == 0 && dy == 0) continue
          const nx = pos.x + dx
          const ny = pos.y + dy
          const nkey = `${nx},${ny}`

          if (platformPositions.has(nkey) && !visited.has(nkey)) {
            visited.add(nkey)
            queue.push({ x: nx, y: ny })
          }
        }
      }
    }

    // All platform tiles should be reachable from first tile
    expect(visited.size).toBe(platformPositions.size)
  })
})
```

### Success Criteria

#### Automated Verification:
- [x] All unit tests pass (steiner-erosion algorithm): `npm run test` (filter for steiner-erosion.test.ts)
- [x] Integration test passes: `npm run test` (filter for space-platform-foundations.test.ts)
- [x] All existing tests still pass: `npm run test`
- [x] Build succeeds: `npm run build:test`
- [ ] Linting passes: `npm run lint`

#### Manual Verification:
- [ ] Create a space platform project in Factorio
- [ ] Place several groups of entities (space platform hubs, assemblers, etc.) separated by gaps
- [ ] Enable staged tiles in project settings
- [ ] Click "Reset space platform foundations" button
- [ ] Verify visually:
  - Platform tiles connect all entity groups
  - Minimal tiles used (no large empty platform areas)
  - Layout looks reasonable
- [ ] Test with stage propagation:
  - Switch to stage 2, manually place some different tiles
  - Go back to stage 1, click reset again
  - Verify stage 2 manual tiles are preserved

---

## Testing Strategy

### Unit Tests (Phase 1)
**Data-driven/parameterized tests** for the algorithm without Factorio surfaces:
- Use `test.each()` pattern with array of test cases
- Each test case is a simple pattern (ASCII grid) + expected constraints
- Helper functions verify connectivity and no-holes invariants
- Fast execution allows exhaustive coverage

Test scenarios:
- Various required tile patterns (corners, L-shapes, scattered clusters)
- Edge cases: empty set, single tile, already optimal layout
- Hole filling behavior
- Connectivity preservation (8-connected filled, 4-connected empty)
- Boundary conditions
- Large sparse grids

Benefits of parameterized approach:
- Easy to add new test cases (just add to array)
- Consistent verification logic via helper functions
- Clear test case names in output
- Reduced code duplication

### Integration Test (Phase 4)
Single comprehensive test with real Factorio:
- Verifies tile operations work correctly with Factorio API
- Tests entity collision detection (`abort_on_collision`)
- Validates staged tiles synchronization
- Confirms connectivity with real tile queries
- Tests the full pipeline: identify required → optimize → apply → sync

One integration test is sufficient since the algorithm logic is thoroughly covered by unit tests.

### Manual Testing Steps
1. Create new space platform project with 3 stages
2. In stage 1: place space-platform-hub and a few assemblers in scattered groups (4+ separate clusters)
3. Verify UI shows "Reset space platform foundations" button (not the 3 normal buttons)
4. Click the button, verify:
   - All entity groups are connected
   - Minimal tiles used (compare to filling entire area)
   - No visual artifacts or disconnected sections
5. Enable staged tiles, test propagation:
   - Switch to stage 2, manually place some tiles
   - Return to stage 1, click reset again
   - Verify stage 2 manual tiles are preserved
6. Test edge cases:
   - Empty platform (no entities) → should clear all tiles
   - Single entity → should have minimal platform around it
   - Very large platform (100x100) → check performance is acceptable

## Performance Considerations

- The steiner erosion algorithm is O(N log N) where N is the bounding box size
- Steps:
  - BFS from boundary: O(N)
  - BFS from required tiles: O(N)
  - Priority queue erosion: O(N log N) due to heap operations
- For large platforms (e.g., 200x200 = 40,000 tiles), this might take 1-2 seconds
- The algorithm is most efficient when there are few required tiles (sparse entities)
- Consider using async task with progress bar if performance is an issue (can be added as follow-up)
- The `withTileEventsDisabled()` wrapper prevents event spam during tile operations

## Migration Notes

No data migration needed - this is a new feature that doesn't change existing data structures.

## References

- Original feature request: `thoughts/scratch/space_platform_filling.md`
- Steiner erosion algorithm: `thoughts/scratch/steiner_erosion.ts`
- Similar tile fill implementation: `src/tiles/set-tiles.ts:71-143`
- Space platform detection: `src/project/UserProject.ts:125-127`
- Staged tiles integration: `src/project/project-updates.ts:766-791`
- UI conditional rendering patterns: `src/ui/ProjectSettings.tsx:244-256`
