# Exclude Entity from Blueprints

## Overview

Add the ability to mark individual entities as "excluded from blueprints" on a per-stage basis. This is an unstaged property (applies to one stage only, no propagation). Excluded entities are filtered out when taking blueprints. A selection tool allows bulk mark/unmark, a highlight icon shows excluded status, and the entity GUI shows the status with a cancel button.

## Current State Analysis

- `StageProperties` (`ProjectEntity.ts:148-150`) already supports per-stage unstaged properties via `stageProperties[key][stage]` storage pattern
- The highlight system (`entity-highlights.ts`) renders sprite icons relative to entity selection boxes
- Blueprint filtering (`take-single-blueprint.ts:55-85`) filters by unit number set and blacklist; needs entity-level exclusion
- Selection tools follow a consistent pattern: prototype definition → entity filters → event handler → action method
- Entity GUI (`opened-entity.tsx`) renders per-entity info with action buttons

### Key Discoveries:
- `StageProperties` interface at `ProjectEntity.ts:148` — add new key here
- `setProperty`/`getProperty` on `InternalProjectEntity` handle per-stage storage generically
- `ComputeUnitNumberFilterStep` at `blueprint-creation.ts:129-165` builds the unit number filter set — exclude entities here
- `HighlightTypes` at `entity-highlights.ts:32-41` — add new highlight type
- `highlightConfigs` at `entity-highlights.ts:71-121` — add sprite config using `"utility/not_available"`
- Selection tool registration pattern: `addSelectionToolHandlers()` at `selection-tool.ts:26-33`

## What We're NOT Doing

- No propagation of exclusion across stages (explicitly per-stage only)
- No blueprint settings UI integration (this is per-entity, not per-blueprint-settings)
- No undo support for the selection tool (matching cleanup tool pattern which also has no undo for its primary action)

## Implementation Approach

Add `excludedFromBlueprints` as a new key in `StageProperties`, following the same pattern as `unstagedValue`. Create a selection tool for toggling exclusion, a highlight sprite to visualize it, filter excluded entities during blueprint creation, and show status in the entity GUI.them

## Phase 1: Data Model & Blueprint Filtering

### Changes Required:

#### 1. Add `excludedFromBlueprints` to `StageProperties`
**File**: `src/entity/ProjectEntity.ts`

```typescript
export interface StageProperties {
  unstagedValue?: UnstagedEntityProps
  excludedFromBlueprints?: true
}
```

Add convenience methods to `ProjectEntity` interface and `ProjectEntityImpl`:

```typescript
// On ProjectEntity interface:
isExcludedFromBlueprints(stage: StageNumber): boolean

// On InternalProjectEntity interface:
setExcludedFromBlueprints(stage: StageNumber, excluded: boolean): boolean
```

Implementation delegates to `getProperty("excludedFromBlueprints", stage)` and `setProperty("excludedFromBlueprints", stage, value)`.

#### 2. Add `setEntityExcludedFromBlueprints` to `MutableProjectContent`
**File**: `src/entity/ProjectContent.ts`

```typescript
setEntityExcludedFromBlueprints(entity: ProjectEntity, stage: StageNumber, excluded: boolean): boolean
```

Follows same pattern as `setEntityUnstagedValue`: delegates to entity method, calls `notifyEntityChanged` if changed.

#### 3. Filter excluded entities from blueprints
**File**: `src/blueprints/blueprint-creation.ts`

In `ComputeUnitNumberFilterStep.run()`, after adding entity unit numbers to the result set, remove unit numbers of entities that are excluded at the target stage. Alternatively, skip adding them in the first place.

In the `for` loops at lines 148-161, add a check: skip entity if `entity.isExcludedFromBlueprints(stageNumber)`.

For blueprints taken without a unit number filter (no `stageLimit` and no `excludeFromFutureBlueprints`), we need a new path. Currently `unitNumberFilter` is only computed when those settings are active. Add logic to also compute the filter when any entity in the project has `excludedFromBlueprints` set for the target stage.

**File**: `src/blueprints/blueprint-creation.ts` — `addTakeBlueprintTasks()`

Check if any entities are excluded at this stage; if so, ensure `ComputeChangedEntitiesStep` and `ComputeUnitNumberFilterStep` run.

#### 4. Tests
**File**: `src/test/entity/ProjectEntity.test.ts` (or new section in existing test)

- `isExcludedFromBlueprints()` returns false by default
- `setExcludedFromBlueprints(stage, true)` makes `isExcludedFromBlueprints(stage)` return true
- Setting on one stage doesn't affect other stages
- `setExcludedFromBlueprints(stage, false)` clears exclusion

**File**: `src/test/blueprints/blueprint-creation.test.ts` (or integration test)

- Excluded entity is not present in taken blueprint
- Non-excluded entities are still present
- Exclusion at one stage doesn't affect blueprints at other stages

### Success Criteria:

#### Automated Verification:
- [x] `pnpm run test` passes
- [x] `pnpm run lint` passes
- [x] `pnpm exec tstl` compiles without errors

---

## Phase 2: Highlight Icon

### Changes Required:

#### 1. Add highlight type
**File**: `src/project/entity-highlights.ts`

Add to `HighlightTypes`:
```typescript
excludedFromBlueprintsHighlight: LuaRenderObject
```

Add to `HighlightConstants`:
```typescript
ExcludedFromBlueprints = "utility/deconstruction_mark"
```

Add to `highlightConfigs`:
```typescript
excludedFromBlueprintsHighlight: {
  type: "sprite",
  sprite: HighlightConstants.ExcludedFromBlueprints,
  offset: { x: 0.5, y: 0.5 },
  scale: 0.5,
  renderLayer: "entity-info-icon-above",
}
```

Position offset may need tuning to avoid overlap with existing highlights (item request uses `{x: 0.5, y: 0.1}`). Using `{x: 0.5, y: 0.5}` centers it.

#### 2. Add update method
**File**: `src/project/entity-highlights.ts`

```typescript
private updateExcludedFromBlueprintsHighlight(entity: ProjectEntity): void {
  this.destroyAllExtraEntities(entity, "excludedFromBlueprintsHighlight")
  const allStages = entity.getPropertyAllStages("excludedFromBlueprints")
  if (!allStages) return
  for (const [stage] of pairs(allStages)) {
    this.createHighlight(entity, stage, this.surfaces.getSurface(stage)!, "excludedFromBlueprintsHighlight")
  }
}
```

Call from `updateAllHighlights()`.

#### 3. Tests

Test that highlight is created/destroyed when exclusion is toggled.

### Success Criteria:

#### Automated Verification:
- [x] `pnpm run test` passes
- [x] `pnpm exec tstl` compiles

#### Manual Verification:
- [ ] `utility/deconstruction_mark` sprite renders on excluded entities at the correct position
- [ ] Sprite disappears when exclusion is removed
- [ ] No overlap with other highlight sprites

---

## Phase 3: Selection Tool

### Changes Required:

#### 1. Add prototype constant
**File**: `src/constants.ts`

```typescript
ExcludeFromBlueprintsTool = "bp100_exclude-from-blueprints-tool"
```

#### 2. Define selection tool prototype
**File**: `src/prototypes/selection-tools.ts`

Define `excludeFromBlueprintsTool: SelectionToolPrototype`:
- `select`: mode `["any-entity"]`, red-ish border color, cursor type `"not-allowed"`
- `alt_select`: mode `["any-entity"]`, green border color, cursor type `"entity"`
- Flags: `["only-in-cursor", "spawnable", "not-stackable"]`
- Icon: use "utility/not_available" layered on top of deconstruction tool

Register with `data.extend()` including shortcut and custom input.

#### 3. Add entity filters
**File**: `src/data-final-fixes.ts`

Set entity filters for both `select` and `alt_select` to `entityOrPreviewNames` (both real and preview entities, so it works on entities that only exist as previews at certain stages).

#### 4. Add event handlers
**File**: `src/project/event-handlers.ts`

```typescript
function onExcludeFromBlueprintsSelected(e: OnPlayerSelectedAreaEvent): void {
  const stage = getStageAtSurface(e.surface.index)
  if (!stage) return
  for (const entity of e.entities) {
    stage.actions.onExcludeFromBlueprintsUsed(entity, stage.stageNumber, true)
  }
}

function onExcludeFromBlueprintsAltSelected(e: OnPlayerSelectedAreaEvent): void {
  const stage = getStageAtSurface(e.surface.index)
  if (!stage) return
  for (const entity of e.entities) {
    stage.actions.onExcludeFromBlueprintsUsed(entity, stage.stageNumber, false)
  }
}

addSelectionToolHandlers(Prototypes.ExcludeFromBlueprintsTool, {
  onSelected: onExcludeFromBlueprintsSelected,
  onAltSelected: onExcludeFromBlueprintsAltSelected,
})
```

#### 5. Add action method
**File**: `src/project/ProjectActions.ts`

```typescript
onExcludeFromBlueprintsUsed(entity: LuaEntity, stage: StageNumber, excluded: boolean): void {
  const projectEntity = this.content.findCompatibleWithLuaEntity(entity, nil, stage)
  if (!projectEntity) return
  this.content.setEntityExcludedFromBlueprints(projectEntity, stage, excluded)
}
```

#### 6. Locale strings
**File**: `src/locale/en/en.cfg`

```
bp100_exclude-from-blueprints-tool=Blueprint exclusion tool
```
in `[item-name]` section.

#### 7. Tests

- Selection tool marks entities as excluded
- Alt-selection unmarks entities
- Only affects entities in the current stage

### Success Criteria:

#### Automated Verification:
- [x] `pnpm run test` passes
- [x] `pnpm exec tstl` compiles
- [x] `pnpm run build:locale` generates updated locale types

#### Manual Verification:
- [ ] Selection tool appears in shortcut bar
- [ ] Dragging over entities with select marks them excluded (highlight appears)
- [ ] Dragging over entities with alt-select unmarks them (highlight disappears)

---

## Phase 4: Entity GUI Integration

### Changes Required:

#### 1. Show exclusion status in entity info
**File**: `src/ui/opened-entity.tsx`

In `EntityProjectInfo.render()`, after the existing content (before the error entity section), add:

```tsx
{entity.isExcludedFromBlueprints(currentStageNum) && [
  <line direction="horizontal" />,
  <flow direction="horizontal">
    <label caption={[L_GuiEntityInfo.ExcludedFromBlueprints]} />
    <HorizontalPusher />
    <SmallToolButton
      sprite="utility/close_black"
      tooltip={[L_Game.Cancel]}
      on_gui_click={ibind(this.cancelExcludeFromBlueprints)}
    />
  </flow>,
]}
```

#### 2. Add cancel handler
**File**: `src/ui/opened-entity.tsx`

```typescript
private cancelExcludeFromBlueprints() {
  this.stage.project.content.setEntityExcludedFromBlueprints(
    this.entity,
    this.stage.stageNumber,
    false,
  )
  this.rerender(false)
}
```

#### 3. Locale strings
**File**: `src/locale/en/en.cfg`

In `[bp100.gui.entity-info]`:
```
excluded-from-blueprints=Excluded from blueprints
```

#### 4. Tests

- GUI shows exclusion status when entity is excluded
- Cancel button clears exclusion
- GUI does not show section when entity is not excluded

### Success Criteria:

#### Automated Verification:
- [x] `pnpm run test` passes
- [x] `pnpm exec tstl` compiles
- [x] `pnpm run build:locale` generates updated locale types

#### Manual Verification:
- [ ] "Excluded from blueprints" text appears in entity info when excluded
- [ ] Cancel button removes the exclusion and the text disappears
- [ ] Taking a blueprint after excluding correctly omits the entity

---

## Migration Notes

Adding a new key to `StageProperties` does not require a migration — the property is optional and defaults to absent/false. Existing entities will have no `excludedFromBlueprints` entries, which is the correct default behavior.

## References

- `src/entity/ProjectEntity.ts:148-150` — `StageProperties` interface
- `src/project/entity-highlights.ts:32-41` — `HighlightTypes` interface
- `src/prototypes/selection-tools.ts` — selection tool prototypes
- `src/project/event-handlers.ts:1059-1063` — cleanup tool handler registration pattern
- `src/blueprints/blueprint-creation.ts:129-165` — `ComputeUnitNumberFilterStep`
- `src/ui/opened-entity.tsx:68-171` — `EntityProjectInfo` component
