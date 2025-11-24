# Better Blueprint Paste Implementation Plan

## Overview

Migrate blueprint paste handling from the current "entity marker injection" system to a new approach using **bplib** (Blueprint Manipulation Library). The new system will be more performant, support blueprint library, eliminate blueprint modification, and handle wire connections more reliably.

## Current State Analysis

### Current Implementation (Entity Markers)

**Location**: `src/project/event-handlers.ts`

The current system uses an "entity marker injection" pattern:

1. **Preparation** (`prepareBlueprintForStagePaste()` lines 565-603):
   - Injects invisible marker entities into blueprint before paste
   - Markers store references to original entities via tags
   - Last marker flagged with `IsLastEntity: true`
   - Blueprint modified via `stack.set_blueprint_entities()`

2. **Detection** (`handleEntityMarkerBuilt()` lines 688-782):
   - Each marker triggers `on_built_entity` event
   - Finds actual LuaEntity at marker position
   - Applies complex direction transformation logic
   - Updates entity with stage info from blueprint tags
   - Defers wire connections for problematic cases

3. **Cleanup** (`onLastEntityMarkerBuilt()` lines 784-800):
   - Processes deferred wire connections manually
   - Reverts blueprint to original state via `revertPreparedBlueprint()`
   - Clears paste state

**State Storage**: `state.currentBlueprintPaste` (lines 268-279)
```typescript
{
  stage: Stage
  entities: BlueprintEntity[]                   // Modified with markers
  knownLuaEntities: PRecord<number, LuaEntity>  // For wire connections
  needsManualConnections: number[]              // Deferred wires
  originalNumEntities: number
  allowPasteUpgrades: boolean
  isFlipped: boolean
  flipVertical: boolean
  flipHorizontal: boolean
  direction: defines.direction
}
```

### Why This is Hacky

1. **Blueprint Modification**: Temporarily modifies user's blueprint
2. **Blueprint Library Incompatibility**: Doesn't work with blueprint library
3. **Manual Wire Handling**: Must manually reconnect circuit wires
4. **Reversion Required**: Must restore blueprint after paste completes
5. **Performance**: Creates dummy entities just for detection

### Key Discoveries

**Critical Code to Preserve** (src/project/event-handlers.ts:709-725):
- Direction transformation for flips/rotations
- Storage tank 2-direction handling (lines 713-716)
- Curved rail diagonal adjustments (lines 717-720)
- Other diagonal entities adjustment (lines 721-724)
- Underground belt opposite type matching (lines 728-738)

**Already Exists**: Future event check (lines 619-620)
```typescript
if (blueprint_settings_pasted_event_id) {
  return // use new method
}
```
This shows the mod is already prepared for a future Factorio event (`on_blueprint_settings_pasted`) that would eliminate the need for markers. bplib is an interim solution.

## Desired End State

After implementation:
- Blueprint paste works with both entity markers (old) and bplib (new)
- User setting toggles between implementations
- Old tests pass with both implementations
- New tests verify bplib-specific features (blueprint library, external wires)
- No regressions in functionality

### Verification Criteria

**Automated:**
- All existing blueprint paste tests pass with feature off
- All existing blueprint paste tests pass with feature on
- New bplib-specific tests pass
- No TypeScript errors: `npm run build:test`
- All tests pass: `npm test`

**Manual:**
- Paste blueprint in project - entities update correctly
- Paste from blueprint library - works (new feature)
- Flip/mirror paste - directions correct
- Shift-click paste (upgrades) - entities upgrade properly
- Circuit wire connections - preserved correctly
- External wire connections - work (new feature, old system doesn't support)

## What We're NOT Doing

- Removing the old entity marker system (keep for backward compatibility)
- Making bplib the default immediately (experimental phase)
- Testing every edge case manually (rely on automated tests)
- Adding new features beyond bplib migration
- Optimizing performance beyond what bplib provides
- Supporting Factorio versions before 2.0 (bplib requires 2.0)

## Implementation Approach

Use bplib's `BlueprintBuild` class to get entity positions without modifying blueprints. Since bplib events fire BEFORE paste completes, use delayed events to process entities AFTER they exist in the world.

**Key Decision**: Use `map_blueprint_indices_to_world_positions()` NOT `map_blueprint_indices_to_overlapping_entities()`. We want positions to look up entities ourselves, maintaining control over entity matching logic.

## Phase 1: Add Setting and Dependencies

### Overview
Add the user setting to toggle bplib usage and ensure bplib is available as a dependency.

### Changes Required

#### 1. Add Setting Constant
**File**: `src/constants.ts`

Add to `Settings` enum (after line 13):
```typescript
export const enum Settings {
  // ... other settings
  UseBplibForBlueprintPaste = "bp100_use-bplib-for-blueprint-paste",
}
```

#### 2. Register Setting
**File**: `src/settings.ts`

Add to settings array (after line 42):
```typescript
data.extend<StringSettingDefinition | BoolSettingDefinition>([
  // ... other settings
  {
    name: Settings.UseBplibForBlueprintPaste,
    type: "bool-setting",
    setting_type: "runtime-per-user",
    default_value: false,
    order: "f",
  },
])
```

#### 3. Add Localization
**File**: `src/locale/en/en.cfg`

Add to `[mod-setting-name]` section:
```ini
bp100_use-bplib-for-blueprint-paste=Use improved blueprint paste (experimental)
```

Add to `[mod-setting-description]` section:
```ini
bp100_use-bplib-for-blueprint-paste=Use improved handling for blueprint pastes. This is more performant, supports blueprint library, and handles wire connections better. Currently experimental. Please report bugs!
```

#### 4. Add bplib Dependency
**File**: `src/info.json`

Add bplib to dependencies array:
```json
"dependencies": [
  "base >= 2.0.64",
  "bplib >= 1.1.0",
  "? bobinserters >= 1.0.0",
  "? boblogistics >= 1.0.0",
  "? EditorExtensions >= 2.0.0"
]
```

#### 5. Rebuild Locale Definitions

Run locale build to regenerate TypeScript definitions:
```bash
npm run build:locale
```

This generates `src/locale/index.d.ts` with the new setting strings.

### Success Criteria

#### Automated Verification:
- [ ] Setting constant compiles: `npm run build:test`
- [ ] Locale definitions generated successfully
- [ ] No TypeScript errors

#### Manual Verification:
- [ ] New setting appears in game settings menu under "Per player" → "Staged Blueprint Planning"
- [ ] Setting description is clear and helpful

---

## Phase 2: Extract Common Code

### Overview
Extract reusable functions from the current implementation that will be shared by both old and new systems. This ensures consistency and reduces code duplication.

### Changes Required

#### 1. Extract Direction Transformation Function
**File**: `src/project/event-handlers.ts`

Create new function after `getCompatibleNames()` (around line 687):

```typescript
/**
 * Calculates the correct entity direction after blueprint transformation.
 * Handles flipping, rotation, and entity-specific direction adjustments.
 */
function calculateTransformedDirection(
  blueprintEntity: BlueprintEntity,
  blueprintDirection: defines.direction,
  isFlipped: boolean,
): defines.direction {
  const value = blueprintEntity
  const valueName = value.name
  const type = nameToType.get(valueName)!

  let entityDir = blueprintDirection

  if (type == "storage-tank") {
    if (twoDirectionTanks.has(valueName)) {
      entityDir = (entityDir + (isFlipped ? 4 : 0)) % 8
    }
  }
  else if (type == "curved-rail-a" || type == "curved-rail-b") {
    const isDiagonal = (((value.direction ?? 0) / 2) % 2 == 1) != isFlipped
    if (isDiagonal) entityDir = (entityDir + 2) % 16
  }
  else {
    const isDiagonal = (value.direction ?? 0) % 4 == 2
    if (isDiagonal) {
      entityDir = (entityDir + (isFlipped ? 14 : 2)) % 16
    }
  }

  return entityDir
}
```

**Refactor existing code** in `handleEntityMarkerBuilt()` (lines 709-725) to use this function:

```typescript
const entityDir = calculateTransformedDirection(
  value,
  value.direction ?? 0,
  bpState.isFlipped,
)
```

#### 2. Extract Entity Lookup Function
**File**: `src/project/event-handlers.ts`

Create new function (around line 730):

```typescript
interface FindPastedEntityParams {
  surface: LuaSurface
  position: MapPosition
  blueprintEntity: BlueprintEntity
  expectedDirection: defines.direction
  allowUpgrades: boolean
}

interface FindPastedEntityResult {
  entity: LuaEntity | nil
  wasUpgraded: boolean
}

/**
 * Finds the LuaEntity at a position matching the blueprint entity.
 */
function findPastedEntity(params: FindPastedEntityParams): FindPastedEntityResult {
  const { surface, position, blueprintEntity, expectedDirection, allowUpgrades } = params
  const referencedName = blueprintEntity.name
  const searchNames = allowUpgrades ? getCompatibleNames(referencedName) : referencedName

  if (searchNames == nil) return { entity: nil, wasUpgraded: false }

  const luaEntities = surface.find_entities_filtered({
    position,
    radius: 0,
    name: searchNames,
  })

  if (isEmpty(luaEntities)) return { entity: nil, wasUpgraded: false }

  const type = nameToType.get(referencedName)!
  let luaEntity = luaEntities.find((e) => !e.supports_direction || e.direction == expectedDirection)

  if (type == "underground-belt") {
    const valueType = (blueprintEntity as UndergroundBeltBlueprintEntity).type ?? "input"
    if (luaEntity) {
      if (luaEntity.belt_to_ground_type != valueType) return { entity: nil, wasUpgraded: false }
    } else {
      const oppositeDir = oppositedirection(expectedDirection)
      luaEntity = luaEntities.find((e) => e.direction == oppositeDir && e.belt_to_ground_type != valueType)
    }
  }

  if (!luaEntity) {
    const pasteRotatableType = getPrototypeRotationType(referencedName)
    if (pasteRotatableType == RotationType.AnyDirection) {
      luaEntity = luaEntities[0]
    } else if (pasteRotatableType == RotationType.Flippable) {
      const oppositeDir = oppositedirection(expectedDirection)
      luaEntity = luaEntities.find((e) => e.direction == oppositeDir)
    }
  }

  const wasUpgraded = luaEntity != nil && luaEntity.name != referencedName
  return { entity: luaEntity, wasUpgraded }
}
```

**Refactor existing code** in `handleEntityMarkerBuilt()` (lines 727-752) to use this function:

```typescript
const { entity: luaEntity, wasUpgraded } = findPastedEntity({
  surface: entity.surface,
  position: entity.position,
  blueprintEntity: value,
  expectedDirection: entityDir,
  allowUpgrades: bpState.allowPasteUpgrades,
})

if (!luaEntity) return

const projectEntity = stage.actions.onEntityPossiblyUpdated(
  luaEntity,
  stage.stageNumber,
  nil,
  e.player_index,
  value.tags?.bp100 as StageInfoExport | nil,
  value.items,
)
```

### Testing Changes

Update tests to verify extracted functions work correctly:

**File**: `src/test/project/event-handlers.test.ts`

All existing tests should continue to pass without modification, as we're only refactoring internal implementation.

### Success Criteria

#### Automated Verification:
- [ ] Code compiles successfully: `npm run build:test`
- [ ] All existing tests pass: `npm test`
- [ ] No change in test behavior (refactor only)
- [ ] Linting passes: `npm run lint`

#### Manual Verification:
- [ ] Blueprint paste still works correctly with old system
- [ ] All direction transformations work (normal, flipped, mirrored)
- [ ] Underground belts paste correctly
- [ ] Entity upgrades work (shift-click paste)

**Implementation Note**: After all automated verification passes and manual testing confirms no regressions, proceed to Phase 2.5.

---

## Phase 2.5: Add Direction Transformation Utilities

### Overview

Add utility functions to `src/lib/geometry/` for transforming direction values during blueprint paste. Entity markers in the old system were rotated along with the blueprint, so we need equivalent utilities to transform blueprint entity directions when using bplib.

### Changes Required

#### 1. Create Direction Utilities File
**File**: `src/lib/geometry/direction.ts`

Create new file with direction transformation utilities:

```typescript
export function roundToCardinalDirection(direction: defines.direction): defines.direction {
  const rounded = math.floor((direction + 2) / 4) * 4
  return (rounded % 16) as defines.direction
}

export function applyDirectionTransformation(
  direction: defines.direction,
  flipHorizontal: boolean,
  flipVertical: boolean,
  rotation: defines.direction,
): defines.direction {
  let dir = ((direction + rotation) % 16) as defines.direction

  if (flipHorizontal && flipVertical) {
    dir = ((dir + 8) % 16) as defines.direction
  } else if (flipHorizontal) {
    dir = ((16 - dir) % 16) as defines.direction
  } else if (flipVertical) {
    dir = ((8 - dir + 16) % 16) as defines.direction
  }

  return dir
}
```

This function applies transformations in order: rotation first, then flips. Both flips together equal a 180° rotation. Horizontal flip mirrors around the vertical axis, vertical flip mirrors around the horizontal axis.

#### 2. Export from Geometry Module
**File**: `src/lib/geometry/index.ts`

Add export for new direction utilities:

```typescript
export * from "./bounding-box"
export * from "./position"
export * from "./direction"
```

#### 3. Add Tests
**File**: `src/lib/test/geometry/direction.test.ts`

Create comprehensive tests for direction transformations:

```typescript
import { applyDirectionTransformation, roundToCardinalDirection } from "../../geometry/direction"

describe("roundToCardinalDirection()", () => {
  test.each<[defines.direction, defines.direction]>([
    [defines.direction.north, defines.direction.north],
    [defines.direction.east, defines.direction.east],
    [defines.direction.south, defines.direction.south],
    [defines.direction.west, defines.direction.west],
    [defines.direction.northeast, defines.direction.east],
    [defines.direction.southeast, defines.direction.south],
    [defines.direction.southwest, defines.direction.west],
    [defines.direction.northwest, defines.direction.north],
  ])("rounds direction %s to %s", (input, expected) => {
    expect(roundToCardinalDirection(input)).toBe(expected)
  })
})

describe("applyDirectionTransformation()", () => {
  test.each<[defines.direction, boolean, boolean, defines.direction, defines.direction, string]>([
    // [input direction, flipH, flipV, rotation, expected output, description]
    // No transformation
    [defines.direction.north, false, false, defines.direction.north, defines.direction.north, "no transformation"],

    // Rotation only
    [defines.direction.north, false, false, defines.direction.east, defines.direction.east, "rotate 90° CW"],
    [defines.direction.east, false, false, defines.direction.east, defines.direction.south, "rotate 90° CW from east"],
    [defines.direction.north, false, false, defines.direction.south, defines.direction.south, "rotate 180°"],

    // Horizontal flip only
    [defines.direction.north, true, false, defines.direction.north, defines.direction.north, "H-flip north unchanged"],
    [defines.direction.east, true, false, defines.direction.north, defines.direction.west, "H-flip east to west"],
    [defines.direction.northeast, true, false, defines.direction.north, defines.direction.northwest, "H-flip NE to NW"],
    [defines.direction.south, true, false, defines.direction.north, defines.direction.south, "H-flip south unchanged"],

    // Vertical flip only
    [defines.direction.north, false, true, defines.direction.north, defines.direction.south, "V-flip north to south"],
    [defines.direction.east, false, true, defines.direction.north, defines.direction.east, "V-flip east unchanged"],
    [defines.direction.northeast, false, true, defines.direction.north, defines.direction.southeast, "V-flip NE to SE"],
    [defines.direction.west, false, true, defines.direction.north, defines.direction.west, "V-flip west unchanged"],

    // Both flips (180° rotation)
    [defines.direction.north, true, true, defines.direction.north, defines.direction.south, "both flips = 180° from north"],
    [defines.direction.east, true, true, defines.direction.north, defines.direction.west, "both flips = 180° from east"],
    [defines.direction.northeast, true, true, defines.direction.north, defines.direction.southwest, "both flips = 180° from NE"],

    // Rotation + horizontal flip
    [defines.direction.north, true, false, defines.direction.east, defines.direction.west, "rotate 90° then H-flip"],
    [defines.direction.northeast, true, false, defines.direction.east, defines.direction.southwest, "rotate 90° then H-flip diagonal"],

    // Rotation + vertical flip
    [defines.direction.north, false, true, defines.direction.east, defines.direction.east, "rotate 90° then V-flip"],
    [defines.direction.east, false, true, defines.direction.east, defines.direction.north, "rotate 90° from east then V-flip"],

    // Rotation + both flips
    [defines.direction.north, true, true, defines.direction.east, defines.direction.west, "rotate 90° then both flips"],
  ])("transform dir=%s flipH=%s flipV=%s rot=%s -> %s (%s)", (input, flipH, flipV, rot, expected, _desc) => {
    expect(applyDirectionTransformation(input, flipH, flipV, rot)).toBe(expected)
  })
})
```

### Success Criteria

#### Automated Verification:
- [ ] Code compiles successfully: `npm run build:test`
- [ ] All new tests pass: `npm test`
- [ ] No TypeScript errors
- [ ] Linting passes: `npm run lint`

#### Manual Verification:
- [ ] Direction rounding works correctly for all 8 directions
- [ ] Direction transformations match entity marker behavior
- [ ] Tests cover all cardinal and diagonal directions

**Implementation Note**: These utilities will be used in Phase 3 to correctly transform blueprint entity directions.

---

## Phase 3: Implement bplib Blueprint Paste Handler

### Overview
Implement the new bplib-based blueprint paste handling using delayed events. This will coexist with the old system, selected via the user setting.

### Changes Required

#### 1. Add Imports
**File**: `src/project/event-handlers.ts`

Add imports at top of file (after existing imports):
```typescript
import { BlueprintBuild } from "__bplib__/blueprint"
import { applyDirectionTransformation, roundToCardinalDirection } from "../lib/geometry"
```

#### 2. Define Delayed Event Data Structure
**File**: `src/project/event-handlers.ts`

Add after `currentBlueprintPaste` state definition (around line 280):

```typescript
interface BplibPasteEntityData {
  readonly blueprintEntity: BlueprintEntity
  readonly worldPosition: MapPosition
}

interface BplibPasteData {
  readonly stage: Stage
  readonly playerIndex: PlayerIndex
  readonly surface: LuaSurface
  readonly entities: readonly BplibPasteEntityData[]
  readonly allowPasteUpgrades: boolean
  readonly flipVertical: boolean
  readonly flipHorizontal: boolean
  readonly direction: defines.direction
}
```

Add `pendingBplibPaste` field to the `state` object definition (around line 268):

```typescript
let state: {
  // ... existing fields
  currentBlueprintPaste?: { ... }
  pendingBplibPaste?: BplibPasteData
}
```

#### 3. Create Delayed Event Handler
**File**: `src/project/event-handlers.ts`

Add near top of file, after imports (around line 20):

```typescript
import { DelayedEvent } from "../lib/delayed-event"

const BplibPasteEvent = DelayedEvent<nil>("bplibPaste", () => {
  flushPendingBplibPaste()
})
```

#### 4. Implement Flush Function
**File**: `src/project/event-handlers.ts`

Add after delayed event definition:

```typescript
function flushPendingBplibPaste(): void {
  const data = state.pendingBplibPaste
  if (!data) return
  state.pendingBplibPaste = nil

  processPendingBplibPaste(data)
}

function processPendingBplibPaste(data: BplibPasteData): void {
  const { stage, playerIndex, surface, entities, allowPasteUpgrades, flipVertical, flipHorizontal, direction } = data

  for (const entityData of entities) {
    const { blueprintEntity, worldPosition } = entityData

    const rawDirection = blueprintEntity.direction ?? 0
    const cardinalDirection = roundToCardinalDirection(rawDirection)
    const transformedDirection = applyDirectionTransformation(
      cardinalDirection,
      flipHorizontal,
      flipVertical,
      direction,
    )

    const entityDir = calculateTransformedDirection(
      blueprintEntity,
      transformedDirection,
      flipVertical != flipHorizontal,
    )

    const { entity: luaEntity, wasUpgraded } = findPastedEntity({
      surface,
      position: worldPosition,
      blueprintEntity,
      expectedDirection: entityDir,
      allowUpgrades: allowPasteUpgrades,
    })

    if (!luaEntity) continue

    const projectEntity = stage.actions.onEntityPossiblyUpdated(
      luaEntity,
      stage.stageNumber,
      nil,
      playerIndex,
      blueprintEntity.tags?.bp100 as StageInfoExport | nil,
      blueprintEntity.items,
    )

    if (projectEntity) {
      let wireEntity = luaEntity
      if (!luaEntity.valid) {
        wireEntity = projectEntity.getWorldEntity(stage.stageNumber)
      }
      if (wireEntity) {
        stage.actions.onWiresPossiblyUpdated(wireEntity, stage.stageNumber, playerIndex)
      }
    }
  }
}
```

**Direction Transformation Notes**:
- We round blueprint entity direction to cardinal first because entity markers (which only support 4 directions) undergo the same transformation when placed in a blueprint. This ensures bplib behavior matches the entity marker system.
- `isFlipped = flipVertical != flipHorizontal` correctly identifies when entities are mirrored: both flips together equals a 180° rotation (not a mirror), so the XOR operation detects true mirroring.

**Wire Connection Notes**:
- bplib eliminates the need for deferred wire connections since the delayed event triggers AFTER all wire connections are established by Factorio. This should also avoid the transport belt wire connection bug mentioned in the old implementation.
- Wire validation code (`onWiresPossiblyUpdated`) is still needed because `onEntityPossiblyUpdated` might upgrade the entity, invalidating the LuaEntity reference. In that case, we fetch the new entity from the project and validate its wires.
- Existing tests will verify wire connections work correctly with bplib.

#### 5. Implement bplib Paste Preparation
**File**: `src/project/event-handlers.ts`

Modify `onPreBlueprintPasted()` function (starting at line 614) to branch based on setting:

```typescript
function onPreBlueprintPasted(player: LuaPlayer, stage: Stage | nil, event: OnPreBuildEvent): void {
  if (!stage) {
    tryFixBlueprint(player)
    return
  }
  if (blueprint_settings_pasted_event_id) {
    return
  }

  const useBplib = !!player.mod_settings[Settings.UseBplibForBlueprintPaste]?.value

  if (useBplib) {
    return onPreBlueprintPastedBplib(player, stage, event)
  }

  const blueprint = getInnerBlueprint(player.cursor_stack)
  if (!blueprint) {
    player.print([L_Interaction.BlueprintNotHandled])
    return
  }
  const [entities, numEntities] = prepareBlueprintForStagePaste(blueprint)
  if (entities != nil) {
    state.currentBlueprintPaste = {
      stage,
      entities,
      knownLuaEntities: {},
      needsManualConnections: [],
      originalNumEntities: numEntities,
      allowPasteUpgrades: event.build_mode == defines.build_mode.superforced,
      flipVertical: event.flip_vertical ?? false,
      flipHorizontal: event.flip_horizontal ?? false,
      direction: event.direction,
    }
  }
}
```

#### 6. Implement New bplib Paste Handler
**File**: `src/project/event-handlers.ts`

Add new function after `onPreBlueprintPasted()`:

```typescript
function onPreBlueprintPastedBplib(player: LuaPlayer, stage: Stage, event: OnPreBuildEvent): void {
  flushPendingBplibPaste()

  const bpBuild = BlueprintBuild.new(event)
  if (!bpBuild) {
    player.print([L_Interaction.BlueprintNotHandled])
    return
  }

  const blueprintEntities = bpBuild.get_entities()
  if (!blueprintEntities || blueprintEntities.length == 0) {
    return
  }

  const positionMap = bpBuild.map_blueprint_indices_to_world_positions()
  if (!positionMap) {
    return
  }

  const entities: BplibPasteEntityData[] = []
  for (const [index, position] of pairs(positionMap)) {
    const blueprintIndex = index as number
    const blueprintEntity = blueprintEntities[blueprintIndex - 1]
    if (!blueprintEntity) continue

    entities.push({
      blueprintEntity,
      worldPosition: position,
    })
  }

  if (entities.length == 0) return

  state.pendingBplibPaste = {
    stage,
    playerIndex: player.index,
    surface: bpBuild.surface,
    entities,
    allowPasteUpgrades: event.build_mode == defines.build_mode.superforced,
    flipVertical: event.flip_vertical ?? false,
    flipHorizontal: event.flip_horizontal ?? false,
    direction: event.direction,
  }

  BplibPasteEvent(nil)
}
```

#### 7. Add Defensive Flush to Existing Handler
**File**: `src/project/event-handlers.ts`

Modify existing `onPreBlueprintPasted()` to also flush on old path:

```typescript
function onPreBlueprintPasted(player: LuaPlayer, stage: Stage | nil, event: OnPreBuildEvent): void {
  if (!stage) {
    tryFixBlueprint(player)
    return
  }
  if (blueprint_settings_pasted_event_id) {
    return
  }

  flushPendingBplibPaste()

  const useBplib = !!player.mod_settings[Settings.UseBplibForBlueprintPaste]?.value

  if (useBplib) {
    return onPreBlueprintPastedBplib(player, stage, event)
  }

  const blueprint = getInnerBlueprint(player.cursor_stack)
  if (!blueprint) {
    player.print([L_Interaction.BlueprintNotHandled])
    return
  }
  const [entities, numEntities] = prepareBlueprintForStagePaste(blueprint)
  if (entities != nil) {
    state.currentBlueprintPaste = {
      stage,
      entities,
      knownLuaEntities: {},
      needsManualConnections: [],
      originalNumEntities: numEntities,
      allowPasteUpgrades: event.build_mode == defines.build_mode.superforced,
      flipVertical: event.flip_vertical ?? false,
      flipHorizontal: event.flip_horizontal ?? false,
      direction: event.direction,
    }
  }
}
```

### Success Criteria

#### Automated Verification:
- [ ] Code compiles successfully: `npm run build:test`
- [ ] No TypeScript errors
- [ ] Linting passes: `npm run lint`

#### Manual Verification:
- [ ] With setting OFF: Old entity marker system still works
- [ ] With setting ON: Blueprint paste works using bplib
- [ ] With setting ON: Pasting from blueprint library works (new capability)
- [ ] With setting ON: Flipped/mirrored pastes have correct directions
- [ ] With setting ON: Shift-click paste (upgrades) works
- [ ] With setting ON: Circuit wires preserved correctly
- [ ] With setting ON: No blueprint modification occurs (verify blueprint unchanged after paste)
- [ ] With setting ON: Paste with partially overlapping existing entities (mixed new/upgraded)
- [ ] With setting ON: Edge case entity types work correctly (curved rails, 2-direction storage tanks, inserters with pickup/drop positions)
- [ ] With setting ON: Large blueprint paste (50+ entities) for performance comparison
- [ ] Cursor stack change during paste doesn't cause issues
- [ ] Multiple sequential pastes work correctly

**Implementation Note**: Do not proceed to Phase 4 until all manual verification is complete and successful.

---

## Phase 4: Update Tests

### Overview
Update existing tests to run with both old and new implementations. Add new tests for bplib-specific features.

### Changes Required

#### 1. Add Test Helper for Setting Toggle
**File**: `src/test/test-init.ts`

Add after existing setting initialization (around line 80):

```typescript
player.mod_settings[Settings.UseBplibForBlueprintPaste] = { value: false }
```

Also add to the `reinit()` function to ensure clean state between test runs:

```typescript
player.mod_settings[Settings.DeleteAtNextStage] = { value: false }
player.mod_settings[Settings.UseBplibForBlueprintPaste] = { value: false }
```

#### 2. Wrap Blueprint Paste Tests
**File**: `src/test/project/event-handlers.test.ts`

Wrap the entire "blueprint paste" describe block with a parameterized describe. This block should include all tests related to blueprint pasting, approximately covering:
- Entity creation from paste
- Entity updates during paste
- Circuit connections (with/without staged info)
- Wire/cable connections
- Direction handling (normal and flipped)
- Ghost entity handling
- Rotation detection

The describe block structure (approximately around line 788):

```typescript
describe.each<[boolean, string]>([
  [false, "entity markers"],
  [true, "bplib"],
])("blueprint paste (using %s)", (useBplib, methodName) => {
  before_each(() => {
    getPlayer().mod_settings[Settings.UseBplibForBlueprintPaste] = { value: useBplib }
  })

  after_each(() => {
    getPlayer().mod_settings[Settings.UseBplibForBlueprintPaste] = { value: false }
  })

  // ... all existing blueprint paste tests go here
})
```

This will run all existing blueprint paste tests twice: once with entity markers, once with bplib.

### Success Criteria

#### Automated Verification:
- [ ] All wrapped tests pass with `useBplib = false`: `npm test`
- [ ] All wrapped tests pass with `useBplib = true`: `npm test`
- [ ] New bplib-specific tests pass
- [ ] Test coverage maintained or improved
- [ ] No test failures or warnings

#### Manual Verification:
- [ ] Tests complete in reasonable time (bplib should be faster)
- [ ] Test output clearly shows which implementation is being tested
- [ ] Any test failures are investigated and resolved

**Implementation Note**: If any tests fail with `useBplib = true`, investigate root cause before proceeding. The implementations should be functionally equivalent for existing features.

---

## Testing Strategy

### Unit Tests

**Location**: `src/test/project/event-handlers.test.ts`

All existing blueprint paste tests (lines 788-1003) will run with both implementations:
- Entity creation from paste
- Entity updates during paste
- Circuit connections (with/without staged info)
- Wire/cable connections
- Direction handling (normal and flipped)
- Ghost entity handling
- Rotation detection

### Integration Tests

New bplib-specific tests:
- Blueprint library paste support
- External wire connections
- No blueprint modification
- Performance improvements (optional)

### Manual Testing Steps

1. **Basic Paste Test**:
   - Create project with stage 1-3
   - Build entities at different stages
   - Create blueprint with stage info
   - Paste blueprint in another location
   - Verify: Entities have correct stages and properties

2. **Blueprint Library Test** (bplib only):
   - Save blueprint to library
   - Close and reopen game
   - Paste from library
   - Verify: Paste works (not possible with old system)

3. **Flip/Mirror Test**:
   - Create blueprint
   - Paste with horizontal flip (F key)
   - Paste with vertical flip (G key)
   - Verify: Entities rotated correctly

4. **Upgrade Test**:
   - Create blueprint with iron chest
   - Shift-click paste over existing steel chest
   - Verify: Chest upgraded, stage info preserved

5. **Wire Connection Test**:
   - Create entities with circuit connections
   - Blueprint them
   - Paste in new location
   - Verify: Wire connections preserved

6. **Performance Test** (optional):
   - Create large blueprint (100+ entities)
   - Time paste with old system
   - Time paste with bplib
   - Compare: bplib should be faster

## Performance Considerations

**Expected Improvements with bplib**:
- No blueprint modification overhead
- No blueprint reversion overhead
- No entity marker creation/destruction
- Faster wire connection handling (bplib handles automatically)

**Measurement**:
- Use Factorio's profiler to compare
- Focus on large blueprints (100+ entities)
- Measure on_pre_build and on_built_entity event times

**Potential Concerns**:
- Delayed event adds one-tick delay (acceptable for UX)
- bplib has its own overhead (likely minimal)
- Memory usage for pending paste data (cleared after processing)

## Migration Notes

### For Users

**When to enable bplib**:
- Want to paste from blueprint library
- Experience issues with entity marker system
- Want better performance on large pastes

**When to keep entity markers**:
- Encountering bugs with bplib implementation
- Prefer proven, stable system
- Don't need blueprint library support

### For Developers

**Maintenance**:
- Both implementations must be maintained in parallel during experimental phase
- Bug fixes should be applied to both where applicable
- Shared functions (direction transform, entity lookup) reduce duplication

**Future**:
- Consider removing entity marker system in major version update
- Announce deprecation first, give users time to switch
- Keep shared functions even after removal

## References

- Original plan: `thoughts/scratch/plans/better-bp-paste.md`
- Blueprint paste research: `thoughts/shared/research/2025-11-23-blueprint-paste-event-handling.md`
- bplib overview: `thoughts/shared/research/2025-11-23-bplib-overview.md`
- Current implementation: `src/project/event-handlers.ts:565-810`
- Delayed events: `src/lib/delayed-event.ts`
- bplib documentation: https://github.com/project-cybersyn/bplib
