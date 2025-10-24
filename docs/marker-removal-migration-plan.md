# Entity Marker Removal Migration Plan

## Executive Summary

An upcoming `on_blueprint_settings_pasted` event in Factorio will provide direct notification when blueprint entities are pasted, eliminating the need for the complex entity marker workaround system. Once the event is released, this migration will remove hundreds of lines of code while improving reliability and enabling blueprint library support. Until release, the strategy is a hybrid approach supporting both systems.

## Background

**Old System (Entity Markers):** Modified blueprints to inject invisible marker entities, then matched markers to pasted entities via position-based lookup. Required blueprint modification and complex transformation logic (rotations, flips, upgrades, wire connections).

**New System (Blueprint Settings Pasted Event):** Direct notification after entity is pasted and fully configured. Provides entity reference, blueprint tags (`bp100`), and player index. No blueprint modification needed, works with blueprint library.

**Critical Difference:** The new event fires AFTER entity configuration is complete, so we can read entity data from the world instead of preserving it from the blueprint via `knownValue`.

## Key Insight: knownValue → stageInfo

**Old:** `knownValue` (type: `BlueprintEntity`) contained full entity data from the blueprint being pasted. Needed because `on_built_entity` fired before entity settings were applied, and position-based matching couldn't guarantee data completeness.

**New:** `stageInfo` (type: `StageInfoExport`) contains only multi-stage metadata from `event.tags.bp100`. Entity configuration is read from the world entity, which is already fully configured when `on_blueprint_settings_pasted` fires.

**Parameter Change:**
- `knownValue?: BlueprintEntity` → `stageInfo?: StageInfoExport`
- Only present for staged blueprints (with `bp100` tags)
- Entity data always extracted from world entity via `saveEntity()`

## Files to be Modified or Removed

### Prototype & Localization - **REMOVE**
- `src/prototypes/entity-marker.ts` - Delete file
- `src/constants.ts` - Remove `Prototypes.EntityMarker`
- `src/prototypes/index.ts` - Remove entity-marker import
- `src/locale/en/en.cfg` - Remove entity-marker and blueprint-not-handled strings
- `src/locale/index.d.ts` - Remove locale keys

### Event Handlers (`src/project/event-handlers.ts`) - **MAJOR REFACTORING**

**Remove functions:**
- `blueprintNeedsPreparation()`, `prepareBlueprintForStagePaste()`, `revertPreparedBlueprint()`
- `onEntityMarkerBuilt()`, `handleEntityMarkerBuilt()`, `onLastEntityMarkerBuilt()`
- `tryFixBlueprint()`, `getInnerBlueprint()`, `getInnerName()`
- `editPassedValue()`, `flipSplitterPriority()`, `mirrorEntity()`, `manuallyConnectWires()`
- `onPreBlueprintPasted()` - entire function

**Remove state:** `currentBlueprintPaste` object and `IsLastEntity`, `MarkerTags`

**Remove event handlers:** Marker-specific `on_built_entity`, blueprint cleanup handlers

**Keep:** `on_blueprint_settings_pasted` event handler (becomes primary paste handler)

### User Actions & Project Updates

**`src/project/user-actions.ts`:**
- `onEntityPossiblyUpdated()` - Change param `knownBpValue?: BlueprintEntity` → `stageInfo?: StageInfoExport`
- `handlePasteValue()` - Change to accept `stageInfo` instead of `knownValue` and `stagedInfo`
- `getCompatibleAtCurrentStageOrAdd()` - Remove `knownValue` param

**`src/project/project-updates.ts`:**
- `addNewEntity()` - Change param `knownValue` → `stageInfo`
- `tryUpdateEntityFromWorld()` - Remove `knownValue` param
- `createNewProjectEntity()` - Change param `knownValue` → `stageInfo`
- `createProjectEntityFromStagedInfo()` - Remove `knownValue` param
- `setValueFromStagedInfo()` - Remove `value: BlueprintEntity` param
- `fixNewUndergroundBelt()`, `applyValueFromWorld()` - Remove `knownValue` param

### Save/Load (`src/entity/save-load.ts`)
- `saveEntity()` - Remove `knownValue` param, always extract from world entity
- `copyKnownValue()` - Delete function

### Helper Functions
- `src/entity/prototype-info.ts`: `getCompatibleNames()` - Review if still needed for non-marker features

### Tests
- `src/test/project/event-handlers.test.ts` - Remove marker tests
- `src/test/project/entity-update-integration.test.ts` - Update for new event
- `src/test/entity/save-load.test.ts` - Remove "with knownValue" test
- `src/test/project/project-updates.test.ts` - Update params: `knownValue` → `stageInfo`
- `src/test/project/user-actions.test.ts` - Update params: `knownBpValue` → `stageInfo`

## Migration Strategy

### Phase 1: Update Event Handler
**File:** `src/project/event-handlers.ts`

Update `on_blueprint_settings_pasted` handler to:
- Extract `stageInfo` from `event.tags?.bp100`
- Pass `stageInfo` to `onEntityPossiblyUpdated()` instead of `knownValue`

### Phase 2: Update Function Signatures
Replace `knownValue?: BlueprintEntity` parameter with `stageInfo?: StageInfoExport`:

**`user-actions.ts`:**
- `onEntityPossiblyUpdated()`, `handlePasteValue()`, `getCompatibleAtCurrentStageOrAdd()`

**`project-updates.ts`:**
- `addNewEntity()`, `createNewProjectEntity()`, `createProjectEntityFromStagedInfo()`
- Remove param from: `tryUpdateEntityFromWorld()`, `fixNewUndergroundBelt()`, `applyValueFromWorld()`
- `setValueFromStagedInfo()` - Remove `value: BlueprintEntity` param

**`save-load.ts`:**
- `saveEntity()` - Remove `knownValue` param, always extract from world entity
- Delete `copyKnownValue()` function

### Phase 3: Update Implementation Logic
**Key changes:**
- `onEntityPossiblyUpdated()`: Receive `stageInfo` directly, no extraction from `knownBpValue.tags.bp100`
- `handlePasteValue()`: Accept single `stageInfo` param instead of both `knownValue` and `stagedInfo`
- `setValueFromStagedInfo()`: Use `saveEntity(entity.getWorldEntity())` when `firstValue` not in `stageInfo`
- `createProjectEntityFromStagedInfo()`: Always use `saveEntity(entity)` fallback
- `saveEntity()`: Remove `knownValue` branch, always call `blueprintEntity(entity)`

### Phase 4: Code Removal
After minimum Factorio version supports the event:
1. Remove conditional check for event availability
2. Remove all marker-related functions from `event-handlers.ts`
3. Remove marker prototype and localization files
4. Clean up imports and unused code

### Phase 5: Simplification
1. Remove blueprint library warning
2. Update tests for new event-based flow
3. Update documentation

## Benefits of Migration

### Code Reduction
- **Remove:** ~500-700 lines of complex event handling code
- **Remove:** Prototype definition file
- **Remove:** Multiple utility functions
- **Simplify:** Event handler registration

### Reliability Improvements
- No blueprint modification = no risk of corrupting blueprints
- Direct entity references = no position-matching errors
- Factorio-native event = better compatibility with game updates
- No cleanup phase = no risk of leaving markers if paste fails

### Maintenance Benefits
- Fewer edge cases to handle
- Less test coverage needed
- Clearer code flow
- Easier to understand for new contributors

## Migration Testing Checklist
- [ ] Blueprint paste from cursor (regular blueprint)
- [ ] Blueprint paste from cursor (staged blueprint with `bp100` tags)
- [ ] Blueprint paste from library
- [ ] Blueprint book paste
- [ ] Flipped blueprint paste (horizontal/vertical)
- [ ] Rotated blueprint paste
- [ ] Upgraded entity paste (e.g., inserter → fast inserter)
- [ ] Blueprint with circuit wires
- [ ] Blueprint with power wires
- [ ] Blueprint with special entities (tanks, rails, splitters)
- [ ] Multi-stage project updates via blueprint
- [ ] Undo/redo after blueprint paste
- [ ] Staged blueprint with incomplete `firstValue` (should extract from world)
- [ ] Regular blueprint paste (no `bp100` tags) - should extract all data from world

## Key Files Reference

**Main changes:**
- `src/project/event-handlers.ts` - Event handling
- `src/project/user-actions.ts` - User interaction handling
- `src/project/project-updates.ts` - Project state updates
- `src/entity/save-load.ts` - Entity serialization
- `src/entity/prototype-info.ts` - Entity compatibility (review `getCompatibleNames()` usage)

**Remove:**
- `src/prototypes/entity-marker.ts`
- Locale files

**Update tests:**
- `src/test/project/event-handlers.test.ts`
- `src/test/project/entity-update-integration.test.ts`
- `src/test/entity/save-load.test.ts`
- `src/test/project/project-updates.test.ts`
- `src/test/project/user-actions.test.ts`

## Summary

**Core change:** `knownValue?: BlueprintEntity` → `stageInfo?: StageInfoExport`

**Old flow:** Inject markers → Match by position → Apply transformations → Pass full blueprint entity data

**New flow:** Entity pasted & configured → Event fires → Extract stage metadata from tags → Read entity from world

**Estimated removal:** ~500-700 lines, 13 functions, 1 prototype, marker event handlers

**Estimated changes:** ~8-10 function signatures, ~15-20 implementations, test updates
