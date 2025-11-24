# Detailed Plan: Remove knownValue Optimization (Step 1 of Better Blueprint Paste)

## Executive Summary

**Goal**: Remove the performance optimization in `saveEntity` that skips blueprinting when `knownValue` is provided.

**Why**: This optimization is unnecessarily complex, and makes future refactors difficult, and does not provide a significant enough performance improvement to justify its complexity.

**Scope**:

- Remove knownValue parameter from 5 functions in `save-load.ts` and `project-updates.ts`
- Remove 1 function argument in `user-actions.ts`
- Update 1 interface definition
- Update 3 test files

**Impact**:

- Cleaner code with less special-case logic

## Understanding Current Usage

**knownValue has TWO distinct purposes:**

1. **Performance optimization in `saveEntity`**: Skip re-blueprinting if value is already known (**TO BE REMOVED**)
2. **Data extraction**: Used in `createProjectEntityFromStagedInfo` to get entity value from blueprint (**TO BE KEPT**)
3. **Blueprint paste detection**: Used in `fixNewUndergroundBelt` to detect blueprint paste vs manual build (**BECOMES UNNECESSARY**)

**Current Flow:**

```
event-handlers.ts (no knownValue passed currently)
    ↓
user-actions.ts::onEntityPossiblyUpdated(knownBpValue?)
    ↓ extracts knownBpValue?.tags?.bp100
    ↓ splits into two paths:
    ├─→ handlePasteValue (if has StageInfoExport tags)
    │   └─→ createProjectEntityFromStagedInfo(entity, knownValue, stageInfo)
    │       └─→ copyKnownValue(knownValue!) [KEEPS knownValue for data extraction]
    └─→ getCompatibleAtCurrentStageOrAdd
         └─→ tryAddNewEntity → addNewEntity(entity, stage, knownValue)
              └─→ createNewProjectEntity(entity, stage, knownValue)
                   └─→ saveEntity(entity, knownValue)  [OPTIMIZATION TO REMOVE]
                        └─→ if knownValue: return copyKnownValue(knownValue) [REMOVE THIS]
```

**Key Insight:** After removing the optimization, `saveEntity` will ALWAYS blueprint the entity from the world, which means:

- Underground belts will always get their REAL direction from the world entity
- The `if (knownValue)` correction in `fixNewUndergroundBelt` becomes unnecessary

## Quick Reference: What Changes

### Functions Modified (remove knownValue parameter)

| Function                       | File                   | Change                                                 |
| ------------------------------ | ---------------------- | ------------------------------------------------------ |
| `saveEntity`                   | save-load.ts:463       | Remove `knownValue?` parameter, remove optimization    |
| `applyValueFromWorld`          | project-updates.ts:255 | Remove `knownValue?` parameter                         |
| `handleUpdate`                 | project-updates.ts:303 | Remove `knownBpValue` parameter, simplify line 318-322 |
| `tryUpdateEntityFromWorld`     | project-updates.ts:269 | Remove `knownValue?` parameter                         |
| `fixNewUndergroundBelt`        | project-updates.ts:136 | Remove `knownValue` parameter, delete lines 144-147    |
| `ProjectUpdates` interface     | project-updates.ts:69  | Remove `knownValue?` from signature                    |
| `onEntityPossiblyUpdated` call | user-actions.ts:389    | Remove knownValue argument from call                   |

### Functions NOT Changed (keep knownValue)

| Function                            | File                   | Why Keep                                   |
| ----------------------------------- | ---------------------- | ------------------------------------------ |
| `copyKnownValue`                    | save-load.ts:456       | Used for data extraction, not optimization |
| `createProjectEntityFromStagedInfo` | project-updates.ts:542 | Extracts entity value from blueprint       |
| `createNewProjectEntity`            | project-updates.ts:161 | Checks for stageInfo tags                  |
| `addNewEntity`                      | project-updates.ts:175 | Passes to createNewProjectEntity           |
| `onEntityPossiblyUpdated`           | user-actions.ts:374    | Passes to addNewEntity/handlePasteValue    |
| `handlePasteValue`                  | user-actions.ts:339    | Passes to setValueFromStagedInfo           |
| `getCompatibleAtCurrentStageOrAdd`  | user-actions.ts:283    | Passes to tryAddNewEntity                  |
| `tryAddNewEntity`                   | user-actions.ts:263    | Passes to addNewEntity                     |

## Detailed Implementation Steps

### Step 1: Modify `save-load.ts`

**File**: `src/entity/save-load.ts`

1. **Remove `knownValue` parameter from `saveEntity`** (line 463)
   - Change signature from: `saveEntity(entity: LuaEntity, knownValue?: BlueprintEntity)`
   - To: `saveEntity(entity: LuaEntity)`
   - Remove the early return `if (knownValue) return copyKnownValue(knownValue)` (line 464)
   - Always execute the blueprinting logic

2. **Keep `copyKnownValue` function** (line 456)
   - Still used by `createProjectEntityFromStagedInfo` in project-updates.ts:547
   - This extracts the entity value from blueprint tags

**Expected test updates:**

- `src/test/entity/save-load.test.ts:63` - "saving an entity with knownValue" test needs updating or deletion

### Step 2: Modify `project-updates.ts`

**File**: `src/project/project-updates.ts`

#### 2.1 **Update `fixNewUndergroundBelt`** (line 136-156)

- Remove `knownValue: BlueprintEntity | nil` parameter
- **Delete the entire if-block at lines 144-147**:
  ```typescript
  if (knownValue) {
    // if blueprint paste, always respect REAL direction in case of flip
    projectEntity.setTypeProperty(entity.belt_to_ground_type)
  }
  ```
  This is no longer needed because `saveEntity` will always blueprint from world entity
- Keep the pairing logic (lines 148-156)

#### 2.2 **Update `applyValueFromWorld`** (line 255-267)

- Remove `knownValue?: BlueprintEntity` parameter
- Update line 261: Call `saveEntity(entitySource)` without knownValue (remove second argument)

#### 2.3 **Update `handleUpdate`** (line 303-368)

- Remove `knownBpValue: BlueprintEntity | nil` parameter
- Update line 318-322: Simplify to always use `getNameAndQuality(entitySource.name, entitySource.quality.name)`
  Before:
  ```typescript
  targetUpgrade ??
    (knownBpValue
      ? getNameAndQuality(knownBpValue.name, knownBpValue.quality)
      : getNameAndQuality(entitySource.name, entitySource.quality.name))
  ```
  After:
  ```typescript
  targetUpgrade ?? getNameAndQuality(entitySource.name, entitySource.quality.name)
  ```
- Update line 350: Remove `knownBpValue` argument from `applyValueFromWorld` call

#### 2.4 **Update `tryUpdateEntityFromWorld`** (line 269-281)

- Remove `knownValue?: BlueprintEntity` parameter
- Remove error check at lines 274-276 (the stageInfo check - move to caller)
- Update line 280: Remove `knownValue` argument from `handleUpdate` call
- Update interface at line 69: Remove `knownValue` parameter from signature

#### 2.5 **Update `createNewProjectEntity`** (line 161-174)

- **KEEP** `knownValue: BlueprintEntity | nil` parameter (still needed for data extraction)
- Line 166-168: stageInfo extraction stays the same
- Update line 171: Call `saveEntity(entity)` without knownValue (remove second argument)
- **NO signature change** - knownValue still needed to check for stageInfo tags

#### 2.6 **Update `addNewEntity`** (line 175-195)

- **KEEP** `knownValue?: BlueprintEntity` parameter (still passed to createNewProjectEntity)
- Update line 181: Remove `knownValue` argument from `fixNewUndergroundBelt` call
- Interface at line 54-59: **NO change** - signature stays the same

#### 2.7 **Update `createProjectEntityFromStagedInfo`** (line 542-563)

- **NO CHANGES** - This function correctly uses `copyKnownValue(knownValue!)` for data extraction
- This is NOT the optimization we're removing

### Step 3: Modify `user-actions.ts`

**File**: `src/project/user-actions.ts`

#### 3.1 **Update `onEntityPossiblyUpdated`** (line 374-392)

- **KEEP** `knownBpValue?: BlueprintEntity` parameter (still needed for `addNewEntity` and `handlePasteValue`)
- Line 381: stageInfo extraction stays the same
- Line 383-384: `handlePasteValue` call stays the same (it passes knownBpValue)
- Line 386: `getCompatibleAtCurrentStageOrAdd` call stays the same (it passes knownBpValue)
- Update line 389: Remove `knownBpValue` argument from `tryUpdateEntityFromWorld` call
- **NO signature change** - parameter still needed for upstream functions

#### 3.2 **Other functions**

- No changes needed - `handlePasteValue`, `getCompatibleAtCurrentStageOrAdd`, etc. all keep their signatures
- These functions pass knownValue downstream to `addNewEntity`, which is correct

### Step 4: Update Tests

**Files to update:**

1. **`src/test/entity/save-load.test.ts`**
   - Line 63: Test "saving an entity with knownValue"
   - **Delete this test** - the optimization no longer exists

2. **`src/test/project/project-updates.test.ts`**
   - Tests that pass knownValue to functions that will no longer accept it need to be updated
   - Search for calls to `tryUpdateEntityFromWorld`, `applyValueFromWorld`, `handleUpdate`, `fixNewUndergroundBelt`
   - Remove knownValue arguments from these test calls
   - Tests that pass knownValue to `addNewEntity` should continue to work unchanged

3. **`src/test/project/user-actions.test.ts`**
   - Line 329-333: Test `tryUpdateEntityFromWorld` with knownValue - remove knownValue argument
   - Line 367-377: Test with knownValue containing StageInfoExport - **keep unchanged** (this tests the data extraction path)
   - Other tests passing knownValue to `onEntityPossiblyUpdated` should continue to work

### Step 5: Update Type Definitions

**File**: `src/project/project-updates.ts`

Update the `ProjectUpdates` interface (lines 52-91):

- Line 69: Remove `knownValue?: BlueprintEntity` parameter from `tryUpdateEntityFromWorld` signature

## Testing Strategy

1. **Run existing tests** after each file change
2. **Add integration tests** for blueprint pasting without the optimization
3. **Performance testing** - Verify that removing the optimization doesn't cause noticeable slowdown
4. **Blueprint library testing** - Verify pasting from blueprint library works (motivation for this change)

## Order of Implementation

**Recommended approach: Make all changes together in a single commit**

Reason: The changes are tightly coupled - removing knownValue from `saveEntity` will break callers until they're updated. It's cleaner to update everything at once.

Order within the implementation:

1. `save-load.ts` - Remove optimization from `saveEntity`
2. `project-updates.ts` - Update all functions (start with low-level, move up)
   - `applyValueFromWorld`
   - `handleUpdate`
   - `tryUpdateEntityFromWorld`
   - `fixNewUndergroundBelt`
   - Update interface `ProjectUpdates`
3. `user-actions.ts` - Update `onEntityPossiblyUpdated` call to `tryUpdateEntityFromWorld`
4. Update all tests
5. Run test suite: `npm run test`
6. Manual testing with blueprint pasting from library

## Special Considerations

### Performance Impact

The optimization being removed is minor:

- It only applied when pasting blueprints from clipboard/library
- It saved one blueprint operation per entity
- Blueprinting is already fast for individual entities
- **Expected impact**: Negligible

### Underground Belt Behavior Change

After this change, underground belts will ALWAYS use the real world direction when created, rather than sometimes using the blueprint's direction. This is actually more correct behavior.

### Data Flow Clarity

After this change, there's a clearer separation:

- `knownValue` only used for carrying metadata (StageInfoExport tags) and data extraction
- `saveEntity` always blueprints from world (no special cases)
- More predictable behavior

## Files Modified Summary

**Core changes** (remove knownValue parameter):

- `src/entity/save-load.ts` - Remove knownValue parameter and optimization from `saveEntity`
- `src/project/project-updates.ts` - Remove knownValue from 4 functions + interface:
  - `applyValueFromWorld` - remove parameter
  - `handleUpdate` - remove parameter, simplify upgrade logic
  - `tryUpdateEntityFromWorld` - remove parameter + interface update
  - `fixNewUndergroundBelt` - remove parameter, delete if-block
- `src/project/user-actions.ts` - Remove knownValue argument from 1 call:
  - `onEntityPossiblyUpdated` - remove argument to `tryUpdateEntityFromWorld`

**Test updates** (remove knownValue from test calls):

- `src/test/entity/save-load.test.ts` - Delete "saving an entity with knownValue" test
- `src/test/project/project-updates.test.ts` - Remove knownValue from affected test calls
- `src/test/project/user-actions.test.ts` - Remove knownValue from `tryUpdateEntityFromWorld` test calls

**Functions that KEEP knownValue** (for data extraction, not optimization):

- `src/project/project-updates.ts`:
  - `createNewProjectEntity` - needs knownValue to check for stageInfo tags
  - `addNewEntity` - passes knownValue to createNewProjectEntity
  - `createProjectEntityFromStagedInfo` - uses knownValue for data extraction
- `src/project/user-actions.ts`:
  - `onEntityPossiblyUpdated` - passes knownValue to addNewEntity and handlePasteValue
  - `handlePasteValue` - passes knownValue to setValueFromStagedInfo
  - `getCompatibleAtCurrentStageOrAdd` - passes knownValue to tryAddNewEntity

## Success Criteria

After implementation:

1. All tests pass: `npm run test`
2. No TypeScript compilation errors
3. Manual test: Paste blueprint from library → entities are created correctly
4. Manual test: Paste staged blueprint → entities preserve stage information
5. Manual test: Paste underground belts from blueprint → correct pairing behavior
