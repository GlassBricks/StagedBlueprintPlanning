---
date: 2025-11-23T17:25:58-06:00
git_commit: aff9bfc6fd5787bc8ce7f3de83efd55fba11e6d3
branch: better-bp-paste
repository: StagedBlueprintPlanning
topic: "How is blueprint paste events handled; how does the mod handle updates when a blueprint is pasted?"
tags: [research, codebase, blueprint-paste, event-handling, entity-markers, project-updates]
status: complete
last_updated: 2025-11-23
last_updated_note: "Updated to reflect removal of knownValue parameter"
---

# Research: Blueprint Paste Event Handling

**Date**: 2025-11-23T17:25:58-06:00
**Git Commit**: aff9bfc6fd5787bc8ce7f3de83efd55fba11e6d3
**Branch**: better-bp-paste
**Repository**: StagedBlueprintPlanning

## Research Question

How is blueprint paste events handled; how does the mod handle updates when a blueprint is pasted?

## Summary

The mod uses an "entity marker injection" system to track and update entities when blueprints are pasted. Before a blueprint is pasted, invisible marker entities are temporarily injected into the blueprint. When these markers are built during the paste operation, they trigger detection and updating of the actual pasted entities with multi-stage information. The blueprint is then reverted to its original state.

The system is currently in a transition phase, with planned migration to a new Factorio event (`on_blueprint_settings_pasted`) that will eliminate the need for blueprint modification.

## Detailed Findings

### Event Pipeline Architecture

The blueprint paste handling follows a 4-stage event pipeline:

1. **Event Detection** (`src/project/event-handlers.ts`)
   - Parses Factorio events into custom events
   - Detects blueprint paste via `on_pre_build` event

2. **User Action Processing** (`src/project/user-actions.ts`)
   - Handles player interactions
   - Decides whether to create or update entities
   - Extracts stage information from blueprint data

3. **Project State Updates** (`src/project/project-updates.ts`)
   - Updates `ProjectContent` with new/modified entities
   - Applies multi-stage metadata to project entities
   - Manages first stage, last stage, stage diffs, and unstaged values

4. **World Synchronization** (`src/project/world-updates.ts`, `src/project/entity-highlights.ts`)
   - Syncs project state with Factorio world
   - Updates entity highlights and visual feedback

### Entity Marker System (Current Implementation)

#### Marker Injection Process

Location: `src/project/event-handlers.ts:570-608` (`prepareBlueprintForStagePaste()`)

When a player initiates a blueprint paste:

1. **Pre-build event triggers** (line 335)
   - `on_pre_build` event handler detects blueprint paste
   - Validates blueprint needs preparation via `blueprintNeedsPreparation()` (lines 560-562)

2. **Marker entities injected** (lines 577-592)
   - For each entity in the blueprint, creates an invisible marker entity at the same position
   - Marker structure:
     ```typescript
     {
       entity_number: nextIndex,
       name: Prototypes.EntityMarker,  // "bp100_entity-marker"
       direction: originalEntity.direction,
       position: originalEntity.position,
       tags: {
         referencedName: originalEntity.name,
         referencedLuaIndex: i  // 1-based Lua index
       }
     }
     ```
   - Last marker tagged with `IsLastEntity: true` flag (line 603)

3. **Blueprint state tracking** (lines 619-647)
   - Creates `state.currentBlueprintPaste` object storing:
     - Modified blueprint entities array
     - Original entity count
     - Stage context
     - Transformation state (flip, mirror, rotation)
     - Entity and wire tracking maps

4. **Blueprint modified** (line 605-607)
   - Calls `stack.set_blueprint_entities(entities)` with injected markers
   - Factorio pastes modified blueprint

#### Marker Processing During Paste

Location: `src/project/event-handlers.ts:460-870` (`on_built_entity` handler)

As Factorio pastes the blueprint:

1. **Marker detection** (lines 469-473)
   - Each built entity triggers `on_built_entity` event
   - Checks if entity is `Prototypes.EntityMarker` and paste is active
   - Routes marker to `handleEntityMarkerBuilt()` (line 723)

2. **Real entity lookup** (lines 730-746)
   - Retrieves blueprint entity data from `tags.referencedLuaIndex`
   - Searches for actual pasted entity at marker position
   - Handles entity upgrades if shift-click paste used

3. **Transformation handling** (lines 752-799)
   - Applies direction/rotation transformations for flipped/mirrored pastes
   - Special handling for different entity types:
     - **Storage tanks** (lines 756-759): Adjust direction for 2-direction tanks
     - **Curved rails** (lines 760-762): Adjust diagonal placement
     - **Splitters** (lines 763-767): Flip input/output priority
     - **Inserters** (lines 768-789): Transform pickup/drop positions
     - **Assembling machines** (lines 790-793): Mirror entity state
     - **Other diagonal entities** (lines 795-798): Adjust direction

4. **Direction matching** (lines 801-826)
   - Finds correct LuaEntity matching transformed direction
   - Underground belts: Match by direction AND `belt_to_ground_type`
   - Other entities: Match by rotation type

5. **Project entity update** (lines 755-762)
   - Calls `stage.actions.onEntityPossiblyUpdated()` with:
     - Found `luaEntity`
     - Current `stage.stageNumber`
     - Player index
     - **Stage info** extracted from blueprint tags: `value.tags?.bp100 as StageInfoExport | nil`
     - **Items** from blueprint entity: `value.items`

6. **Wire connection handling** (lines 837-854)
   - Deferred for transport belts and upgraded entities
   - Immediate for normal entities
   - Stores entities in `knownLuaEntities` map for later connection

7. **Cleanup on last marker** (lines 679-872, `onLastEntityMarkerBuilt()`)
   - Processes deferred wire connections (lines 860-866)
   - Reverts blueprint to original state via `revertPreparedBlueprint()` (line 871)
   - Clears paste state (line 872)

#### Blueprint Reversion

Location: `src/project/event-handlers.ts:610-617` (`revertPreparedBlueprint()`)

After all markers are processed:

1. Retrieves original blueprint entities (line 611)
2. Removes entities from blueprint entities array (lines 613-615)
3. Applies reverted entities to blueprint (line 616)
   - Calls `stack.set_blueprint_entities(entities)` with original entities only
   - Blueprint restored to pre-injection state

### Project Update Pipeline

#### Stage Information Detection

Location: `src/project/user-actions.ts:375-385` (`onEntityPossiblyUpdated()`)

When an entity is built or updated during blueprint paste:

1. **Entry point** (line 375)
   - Receives `stagedInfo?: StageInfoExport` parameter
   - Receives `items?: BlueprintInsertPlan[]` parameter
   - Stage info is extracted from blueprint tags by the caller

2. **Stage info routing** (lines 383-384)
   ```typescript
   if (stagedInfo) {
     return handlePasteValue(entity, stage, previousDirection, byPlayer, stagedInfo, items)
   }
   ```

   - Routes to specialized paste handler if stage info is present

#### Stage Information Application

Location: `src/project/project-updates.ts:563-602` (`setValueFromStagedInfo()`)

For existing entities being updated with stage info:

1. **First value determination** (lines 569-570)
   - Extracts `info.firstValue` from `StageInfoExport`, or if not present
   - Calls `saveEntity(luaEntity, items)` to read current entity value from the world

2. **First stage update** (lines 571-576)
   - Extracts `info.firstStage` from `StageInfoExport`
   - Validates via `checkCanSetFirstStage()`
   - Applies: `entity.setFirstStageUnchecked(targetStage)`

3. **Last stage update** (lines 577-587)
   - Extracts `info.lastStage`
   - Validates via `checkCanSetLastStage()`
   - Calls `updateWorldEntitiesOnLastStageChanged()` to remove entities from deleted stages

4. **First value and stage diffs restoration** (lines 591-594)

   ```typescript
   entity.setFirstValueDirectly(firstValue)
   const stageDiffs = info.stageDiffs ? fromExportStageDiffs(info.stageDiffs) : nil
   entity.setStageDiffsDirectly(stageDiffs)
   replaceUnstagedValue(entity, info)
   ```

   - Sets base entity configuration
   - Restores per-stage property changes
   - Restores unstaged values (items/item requests) per stage

5. **World synchronization** (line 596)
   - Calls `updateWorldEntities(entity, 1)` to sync all stages
   - Updates entity highlights

#### New Entity Creation from Paste

Location: `src/project/project-updates.ts:160-199`

For new entities created during paste:

1. **Stage info detection** (lines 166-168 in `createNewProjectEntity()`)

   ```typescript
   if (stageInfo) {
     return createProjectEntityFromStagedInfo(entity, stageInfo, items)
   }
   ```

   - Routes to specialized creation if stage info is provided

2. **ProjectEntity creation with stage info** (lines 539-561, `createProjectEntityFromStagedInfo()`)

   ```typescript
   const [value, unstagedValue] = saveEntity(entity, items)
   if (!value) return nil

   const projectEntity = newProjectEntity(
     stageInfo.firstValue ?? value,
     entity.position,
     entity.direction,
     stageInfo.firstStage,
     unstagedValue,
   )
   projectEntity.setLastStageUnchecked(stageInfo.lastStage)
   const diffs = stageInfo.stageDiffs
   if (diffs) {
     projectEntity.setStageDiffsDirectly(fromExportStageDiffs(diffs))
   }
   replaceUnstagedValue(projectEntity, stageInfo)
   ```

   - Calls `saveEntity(entity, items)` to read current entity value from the world
   - Creates entity with first value (from stage info or current value) and first stage
   - Sets last stage
   - Applies stage diffs
   - Restores unstaged values

3. **Entity addition** (line 183)
   - Calls `content.addEntity(projectEntity)` to add to collection
   - Uses `LinkedMap2D` spatial index for fast position lookup

4. **World sync and highlights** (lines 191-196)
   - Updates wire connections
   - Refreshes entity highlights

### Stage Information Structure

#### StageInfoExport Format

Location: `src/import-export/entity.ts:15-21`

Blueprint tags contain structured multi-stage metadata:

```typescript
interface StageInfoExport {
  firstStage: StageNumber // First stage entity appears
  lastStage: StageNumber // Last stage entity appears
  firstValue?: BlueprintEntity // Base entity configuration
  stageDiffs?: StageDiffsExport // Property changes per stage
  unstagedValue?: UnstagedValuesExport // Items/requests per stage
}
```

**Stage Diffs Format**:

- Maps stage numbers to property changes
- Uses `ExportNilPlaceholder` (`{ __nil: true }`) for nil values
- Converted to internal `NilPlaceholder` singleton during import

**Unstaged Values**:

- Items and item requests that vary per stage
- Not stored in `stageDiffs` due to separate handling

## Code References

### Core Event Handling

- `src/project/event-handlers.ts:335-378` - `on_pre_build` event handler
- `src/project/event-handlers.ts:460-870` - `on_built_entity` event handler
- `src/project/event-handlers.ts:570-608` - `prepareBlueprintForStagePaste()` - Marker injection
- `src/project/event-handlers.ts:610-617` - `revertPreparedBlueprint()` - Blueprint restoration
- `src/project/event-handlers.ts:723-855` - `handleEntityMarkerBuilt()` - Marker processing

### Project Updates

- `src/project/user-actions.ts:375-399` - `onEntityPossiblyUpdated()` - Entry point
- `src/project/user-actions.ts:340-366` - `handlePasteValue()` - Paste orchestration
- `src/project/project-updates.ts:160-199` - `createNewProjectEntity()` - Entity creation
- `src/project/project-updates.ts:539-561` - `createProjectEntityFromStagedInfo()` - Stage info creation
- `src/project/project-updates.ts:563-602` - `setValueFromStagedInfo()` - Stage info application

### Import/Export

- `src/import-export/entity.ts:15-21` - `StageInfoExport` interface definition
- `src/import-export/entity.ts:65-77` - Stage diffs conversion
- `src/blueprints/blueprint-creation.ts` - Blueprint creation from project
- `src/ui/create-blueprint-with-stage-info.ts` - Blueprint creation with stage metadata

### Entity Data Structures

- `src/entity/ProjectEntity.ts` - Individual entity data structure
- `src/entity/ProjectContent.ts` - Entity collection with spatial indexing
- `src/entity/save-load.ts` - Entity serialization and creation

### Tests

- `src/test/project/event-handlers.test.ts:788-1031` - Blueprint paste test suite
- `src/test/project/project-updates.test.ts` - Project update tests
- `src/test/import-export/entity.test.ts` - Entity import/export tests

### Prototypes

- `src/prototypes/entity-marker.ts:38` - Entity marker prototype definition
- `src/constants.ts:17` - `Prototypes.EntityMarker = "bp100_entity-marker"` constant

## Architecture Insights

### Entity Marker Pattern

The entity marker system is a workaround for Factorio's event timing:

- `on_built_entity` fires **before** entity settings are fully applied
- Blueprint entity data not accessible during normal paste
- Markers provide a bridge between blueprint data and world entities
- Position-based matching links markers to real entities

**Key Design Decisions**:

- Markers appended to entity array (not interspersed)
- Last marker flagged for cleanup trigger
- Blueprint reverted immediately after paste completes
- Transformation state tracked globally during paste

### Deferred Wire Processing

Wire connections can't always be established immediately:

- Upgraded entities may be destroyed and recreated
- Transport belts have special connection requirements
- Solution: Queue in `needsManualConnections` array
- Process all at once when last marker is built

### Blueprint Transformation Handling

Different entity types require different transformation logic:

- **2-direction entities** (storage tanks): Direction adjustment
- **Splitters**: Priority field flipping
- **Inserters**: Pickup/drop position transformation
- **Diagonal entities**: Direction adjustment for odd rotations

Transformations applied to blueprint data **before** matching with world entity.

### Spatial Indexing

`ProjectContent` uses `LinkedMap2D` for fast entity lookup:

- O(1) position-based queries
- Critical for marker → entity matching
- Supports overlapping entities (linked list per position)

### State Management

Blueprint paste uses global state machine:

- `state.currentBlueprintPaste` tracks active paste operation
- Set in `on_pre_build`, cleared after last marker
- Prevents concurrent paste operations from interfering
- Stores transformation state for marker processing

### Delayed Event Infrastructure

**Source**: `src/lib/delayed-event.ts`

A custom infrastructure for deferring event execution to next game tick:

- Stores pending events in global storage
- Currently used by `FutureUndoEvent` in `src/project/undo.ts:111`

**Recent Addition**:

- Commit: "Add only slightly hacky 'delayed event' infrastructure"
- Provides event deferral without complex state machines

## Related Research

None found in `thoughts/shared/research/` directory.

## Open Questions

1. **Timeline for on_blueprint_settings_pasted event**: When will Factorio officially release this event?
2. **Backward compatibility**: How will migration handle existing blueprints with stage info?
3. **Performance impact**: What is the overhead of marker injection for large blueprints?
4. **Blueprint library**: Does current marker system work with blueprint library, or only cursor stack?
5. **Concurrent pastes**: How does the system handle multiple players pasting blueprints simultaneously?
