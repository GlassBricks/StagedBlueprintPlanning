---
date: 2025-11-27T12:00:00+00:00
git_commit: 9d671cca713186deff6935ce01b02cc0d3bc632e
branch: main
repository: StagedBlueprintPlanning
topic: "All possible user actions for updating projects and entities"
tags: [research, codebase, event-handlers, user-actions, shortcuts, gui-actions, undo]
status: complete
last_updated: 2025-11-27
last_updated_note: "Added follow-up research on undo support for all actions"
---

# Research: All User Actions for Project/Entity Updates

**Date**: 2025-11-27
**Git Commit**: 9d671cca713186deff6935ce01b02cc0d3bc632e
**Branch**: main
**Repository**: StagedBlueprintPlanning

## Research Question

List all possible actions a user can take to update a project or its entities, based on event-handlers, user-actions, custom shortcuts, and GUI actions.

## Summary

User actions flow through a three-tier system:

1. **Event Handlers** (`event-handlers.ts`) - Parse raw Factorio events into semantic actions
2. **User Actions** (`user-actions.ts`) - Process semantic actions and decide project changes
3. **Project Updates** (`project-updates.ts`) - Execute actual modifications to ProjectContent

Actions can be triggered via:

- Direct entity manipulation (build, mine, rotate, upgrade, wire)
- Selection tools (cleanup, stage move, force delete, staged copy/cut)
- Custom keyboard shortcuts (stage navigation, entity movement)
- GUI buttons and dialogs (project settings, entity info panels)

## Detailed Findings

### Entity Manipulation Actions (Factorio Events)

These are triggered by standard Factorio gameplay interactions:

| Action              | Factorio Event(s)                                                 | User Action Called                           | Line                        |
| ------------------- | ----------------------------------------------------------------- | -------------------------------------------- | --------------------------- |
| Build entity        | `on_built_entity`, `on_robot_built_entity`, `script_raised_built` | `onEntityCreated`                            | event-handlers.ts:529-586   |
| Mine entity         | `on_player_mined_entity`, `on_robot_mined_entity`                 | `onEntityDeleted`                            | event-handlers.ts:495-511   |
| Entity dies         | `on_entity_died`                                                  | `onEntityDied`                               | event-handlers.ts:236       |
| Rotate entity       | `on_player_rotated_entity`                                        | `onEntityRotated`                            | event-handlers.ts:250       |
| Copy-paste settings | `on_entity_settings_pasted`                                       | `onEntityPossiblyUpdated`                    | event-handlers.ts:238       |
| Close entity GUI    | `on_gui_closed` (with entity)                                     | `onEntityPossiblyUpdated`                    | event-handlers.ts:239-241   |
| Fast transfer       | `on_player_fast_transferred`                                      | `onEntityPossiblyUpdated`                    | event-handlers.ts:242       |
| Drop item           | `on_player_dropped_item`                                          | `onEntityPossiblyUpdated`                    | event-handlers.ts:243       |
| Flip entity         | `on_player_flipped_entity`                                        | `onEntityPossiblyUpdated`                    | event-handlers.ts:245       |
| Mark for upgrade    | `on_marked_for_upgrade`                                           | `onEntityMarkedForUpgrade`                   | event-handlers.ts:252       |
| Wire connection     | Custom via `Build` input                                          | `onWiresPossiblyUpdated`                     | event-handlers.ts:1012-1020 |
| Blueprint paste     | `on_pre_build` + `on_built_entity`                                | `onEntityPossiblyUpdated` (with staged info) | event-handlers.ts:404-447   |

### Tile Actions

| Action     | Trigger          | User Action Called | Line                    |
| ---------- | ---------------- | ------------------ | ----------------------- |
| Place tile | Tile build event | `onTileBuilt`      | user-actions.ts:717-723 |
| Mine tile  | Tile mine event  | `onTileMined`      | user-actions.ts:725-727 |

### Selection Tool Actions

Each tool provides multiple modes (normal, alt, reverse, alt-reverse):

#### Cleanup Tool (`bp100_cleanup-tool`)

| Mode       | Action                                                               | Line                        |
| ---------- | -------------------------------------------------------------------- | --------------------------- |
| Normal/Alt | `onCleanupToolUsed` - Fixes entity errors, deletes settings remnants | event-handlers.ts:1059-1063 |
| Reverse    | `onEntityForceDeleteUsed` - Force deletes entity                     | event-handlers.ts:1045-1057 |

#### Stage Move Tool (`bp100_stage-move-tool`)

| Mode        | Action                                                                   | Line                        |
| ----------- | ------------------------------------------------------------------------ | --------------------------- |
| Normal/Alt  | `onSendToStageUsed` - Sends entity to selected stage                     | event-handlers.ts:1112-1117 |
| Reverse     | `onBringToStageUsed` - Brings entity to current stage                    | event-handlers.ts:1112-1117 |
| Alt-Reverse | `onBringDownToStageUsed` - Brings entity down to stage (only if earlier) | event-handlers.ts:1112-1117 |

#### Filtered Stage Move Tool (`bp100_filtered-stage-move-tool`)

| Mode               | Action                          | Line                        |
| ------------------ | ------------------------------- | --------------------------- |
| Via deconstruction | `onSendToStageUsed` with filter | event-handlers.ts:1198-1217 |

#### Stage Deconstruct Tool (`bp100_stage-deconstruct-tool`)

| Mode    | Action                                                           | Line                        |
| ------- | ---------------------------------------------------------------- | --------------------------- |
| Normal  | `onStageDeleteUsed` - Sets entity last stage                     | event-handlers.ts:1119-1123 |
| Alt     | `onStageDeleteCancelUsed` - Clears entity last stage             | event-handlers.ts:1119-1123 |
| Reverse | `onStageDeleteReverseUsed` - Sets last stage (reverse direction) | event-handlers.ts:1119-1123 |

#### Staged Copy Tool (`bp100_staged-copy-tool`)

| Mode       | Action                            | Line                        |
| ---------- | --------------------------------- | --------------------------- |
| Normal/Alt | Creates blueprint with stage info | event-handlers.ts:1164-1167 |

#### Staged Cut Tool (`bp100_staged-cut-tool`)

| Mode       | Action                                              | Line                        |
| ---------- | --------------------------------------------------- | --------------------------- |
| Normal/Alt | Creates blueprint with stage info, marks for delete | event-handlers.ts:1192-1195 |

#### Force Delete Tool (`bp100_force-delete-tool`)

| Mode       | Action                    | Line                        |
| ---------- | ------------------------- | --------------------------- |
| Normal/Alt | `onEntityForceDeleteUsed` | event-handlers.ts:1182-1185 |

### Custom Keyboard Shortcuts

#### Stage Navigation

| Shortcut                          | Default Key               | Handler                 | Action                       |
| --------------------------------- | ------------------------- | ----------------------- | ---------------------------- |
| `bp100_next-stage`                | `CTRL + mouse-wheel-down` | player-navigation.ts:50 | Navigate to next stage       |
| `bp100_previous-stage`            | `CTRL + mouse-wheel-up`   | player-navigation.ts:54 | Navigate to previous stage   |
| `bp100_go-to-first-stage`         | `CTRL + mouse-button-3`   | player-navigation.ts:72 | Jump to entity's first stage |
| `bp100_go-to-project-first-stage` | _(none)_                  | player-navigation.ts:58 | Jump to project first stage  |
| `bp100_go-to-project-last-stage`  | _(none)_                  | player-navigation.ts:65 | Jump to project last stage   |

#### Project Navigation

| Shortcut                       | Default Key | Handler                  | Action                        |
| ------------------------------ | ----------- | ------------------------ | ----------------------------- |
| `bp100_next-project`           | _(none)_    | player-navigation.ts:112 | Switch to next project        |
| `bp100_previous-project`       | _(none)_    | player-navigation.ts:116 | Switch to previous project    |
| `bp100_exit-project`           | _(none)_    | player-navigation.ts:120 | Exit current project          |
| `bp100_return-to-last-project` | _(none)_    | player-navigation.ts:124 | Return to last viewed project |

#### Entity Manipulation

| Shortcut                   | Default Key                     | Handler                     | Action                       |
| -------------------------- | ------------------------------- | --------------------------- | ---------------------------- |
| `bp100_move-to-this-stage` | `CTRL + ALT + mouse-button-3`   | event-handlers.ts:1254-1270 | Move entity to current stage |
| `bp100_force-delete`       | `CTRL + SHIFT + mouse-button-2` | event-handlers.ts:1239-1252 | Force delete entity          |

#### Stage Creation

| Shortcut                        | Default Key | Handler             | Action                     |
| ------------------------------- | ----------- | ------------------- | -------------------------- |
| `bp100_new-stage-after-current` | _(none)_    | misc-controls.ts:22 | Create stage after current |
| `bp100_new-stage-at-front`      | _(none)_    | misc-controls.ts:14 | Create stage at beginning  |

#### Blueprint Export

| Shortcut                    | Default Key | Handler             | Action                          |
| --------------------------- | ----------- | ------------------- | ------------------------------- |
| `bp100_get-stage-blueprint` | _(none)_    | misc-controls.ts:31 | Get blueprint for current stage |
| `bp100_get-blueprint-book`  | _(none)_    | misc-controls.ts:35 | Get blueprint book for project  |

#### Tool Shortcuts

| Shortcut                      | Default Key                | Handler                  | Action                            |
| ----------------------------- | -------------------------- | ------------------------ | --------------------------------- |
| `bp100_stage-select-next`     | `SHIFT + mouse-wheel-down` | stage-move-tool.ts:103   | Select next stage (move tool)     |
| `bp100_stage-select-previous` | `SHIFT + mouse-wheel-up`   | stage-move-tool.ts:106   | Select previous stage (move tool) |
| `bp100_toggle-staged-copy`    | _(none)_                   | toggle-staged-copy.ts:16 | Toggle staged copy mode           |
| `bp100_staged-copy-tool`      | `CTRL + SHIFT + C`         | _(tool spawn)_           | Spawn staged copy tool            |
| `bp100_staged-cut-tool`       | `CTRL + SHIFT + X`         | _(tool spawn)_           | Spawn staged cut tool             |

### GUI Actions

#### Project Settings Panel (`ProjectSettings.tsx`)

**Stage Management:**

| Action                  | Handler             | Line | Effect                                |
| ----------------------- | ------------------- | ---- | ------------------------------------- |
| New stage after current | `newStageAfter`     | 367  | `project.insertStage(index)`          |
| New stage at front      | `newStageAtFront`   | 372  | `project.insertStage(0)`              |
| Delete/merge stage      | Stage list handlers | 693  | `project.deleteStage(index, isMerge)` |

**Rebuild Actions:**

| Action               | Handler              | Line | Effect                                     |
| -------------------- | -------------------- | ---- | ------------------------------------------ |
| Rebuild stage        | `rebuildStage`       | 214  | `worldUpdates.rebuildStage(stageNumber)`   |
| Rebuild all stages   | `rebuildAllStages`   | 219  | `worldUpdates.rebuildAllStages()`          |
| Disable all entities | `disableAllEntities` | 226  | `worldUpdates.disableAllEntitiesInStage()` |
| Enable all entities  | `enableAllEntities`  | 231  | `worldUpdates.enableAllEntitiesInStage()`  |

**Tile Management:**

| Action               | Handler                       | Line | Effect                                  |
| -------------------- | ----------------------------- | ---- | --------------------------------------- |
| Set lab tiles        | `setLabTiles`                 | 257  | Sets lab tile pattern                   |
| Set selected tile    | `setSelectedTile`             | 262  | Sets tile type                          |
| Set landfill + lab   | `setLandfillAndLabTiles`      | 268  | Sets both tile types                    |
| Set landfill + water | `setLandfillAndWater`         | 274  | Sets landfill and water                 |
| Scan for tiles       | `scanProjectForExistingTiles` | 665  | `updates.scanProjectForExistingTiles()` |

**Blueprint Actions:**

| Action           | Handler               | Line | Effect                  |
| ---------------- | --------------------- | ---- | ----------------------- |
| Get blueprint    | `getBlueprint`        | 558  | Gets stage blueprint    |
| Export book      | `exportBlueprintBook` | 565  | Exports project as book |
| Export to string | `exportBookToString`  | 571  | Exports to string       |

**Settings:**

| Action                | Handler                          | Line | Effect                   |
| --------------------- | -------------------------------- | ---- | ------------------------ |
| Edit grid settings    | `editGridSettingsAndDescription` | 437  | Opens grid editor        |
| Revert grid settings  | `revertAllGridSettings`          | 441  | Resets all grid settings |
| Edit blacklist filter | `editFilter`                     | 451  | Opens filter editor      |
| Edit whitelist filter | `editFilter`                     | 472  | Opens filter editor      |

#### Entity Info Panel (`opened-entity.tsx`)

| Action                 | Handler                  | Line | Effect                             |
| ---------------------- | ------------------------ | ---- | ---------------------------------- |
| Teleport to stage      | `teleportToStageAction`  | 106  | Teleports player                   |
| Remove last stage      | `removeLastStage`        | 136  | Clears entity last stage           |
| Move to this stage     | `moveToThisStage`        | 143  | `userMoveEntityToStageWithUndo()`  |
| Reset vehicle location | `resetVehicleLocation`   | 152  | `updates.resetVehicleLocation()`   |
| Set vehicle location   | `setVehicleLocationHere` | 157  | `updates.setVehicleLocationHere()` |
| Delete entity          | `deleteEntity`           | 167  | `updates.forceDeleteEntity()`      |
| Reset property         | `resetProp`              | 225  | `updates.resetProp()`              |
| Apply to lower stage   | `applyToLowerStage`      | 231  | `updates.movePropDown()`           |

#### Project List (`AllProjects.tsx`)

| Action            | Handler           | Line | Effect                    |
| ----------------- | ----------------- | ---- | ------------------------- |
| New project       | `newProject`      | 92   | Opens new project dialog  |
| Import project    | `importProject`   | 99   | Opens import dialog       |
| Exit project      | `exitProject`     | 105  | Exits current project     |
| Delete project    | `deleteProject`   | 218  | `project.delete()`        |
| Research all tech | `researchAllTech` | 115  | Researches all technology |

#### Blueprint Import (`blueprint-string.tsx`)

| Action           | Handler                 | Line | Effect                      |
| ---------------- | ----------------------- | ---- | --------------------------- |
| Import string    | `import`                | 88   | Imports blueprint           |
| Import project   | `importProjectString`   | 146  | Creates project from string |
| Import from book | `importProjectFromBook` | 155  | Creates project from book   |

### Project Update Operations

All entity/tile modifications ultimately call functions in `project-updates.ts`:

#### Entity Operations

| Function                    | Line    | Description                                       |
| --------------------------- | ------- | ------------------------------------------------- |
| `addNewEntity`              | 174-199 | Creates new ProjectEntity from LuaEntity          |
| `maybeDeleteProjectEntity`  | 214-226 | Handles entity deletion/settings remnant creation |
| `forceDeleteEntity`         | 237-240 | Unconditionally deletes entity                    |
| `readdDeletedEntity`        | 242-245 | Re-adds deleted entity (for undo)                 |
| `tryReviveSettingsRemnant`  | 247-257 | Revives a settings remnant                        |
| `tryUpdateEntityFromWorld`  | 273-281 | Syncs entity properties from world                |
| `tryRotateEntityFromWorld`  | 283-287 | Handles entity rotation                           |
| `tryUpgradeEntityFromWorld` | 294-301 | Handles entity upgrade                            |
| `updateWiresFromWorld`      | 509-515 | Syncs wire connections                            |
| `setValueFromStagedInfo`    | 563-602 | Sets entity from blueprint paste                  |

#### Stage Movement

| Function           | Line    | Description                     |
| ------------------ | ------- | ------------------------------- |
| `trySetFirstStage` | 647-660 | Moves entity to new first stage |
| `trySetLastStage`  | 677-685 | Sets entity last stage          |

#### Property Management

| Function           | Line    | Description                    |
| ------------------ | ------- | ------------------------------ |
| `resetProp`        | 687-691 | Resets single property         |
| `movePropDown`     | 693-700 | Moves property to next stage   |
| `resetAllProps`    | 702-706 | Resets all properties at stage |
| `moveAllPropsDown` | 708-715 | Moves all properties down      |

#### Vehicle Operations

| Function                 | Line    | Description                    |
| ------------------------ | ------- | ------------------------------ |
| `resetVehicleLocation`   | 717-733 | Resets movable entity position |
| `setVehicleLocationHere` | 735-747 | Sets movable entity position   |

#### Tile Operations

| Function                      | Line    | Description                   |
| ----------------------------- | ------- | ----------------------------- |
| `setTileAtStage`              | 766-792 | Sets/removes tile at position |
| `deleteTile`                  | 794-800 | Removes tile completely       |
| `scanProjectForExistingTiles` | 802-834 | Scans surfaces for tiles      |

## Code References

- `src/project/event-handlers.ts` - Factorio event → semantic action translation
- `src/project/user-actions.ts` - Semantic action handling with undo support
- `src/project/project-updates.ts` - Core ProjectContent modification functions
- `src/prototypes/custom-inputs.ts` - Keyboard shortcut definitions
- `src/prototypes/selection-tools.ts` - Selection tool definitions
- `src/constants.ts:61-92` - CustomInputs enum
- `src/ui/ProjectSettings.tsx` - Main settings GUI
- `src/ui/opened-entity.tsx` - Entity info panel
- `src/ui/AllProjects.tsx` - Project list GUI
- `src/ui/player-navigation.ts` - Navigation shortcut handlers
- `src/ui/misc-controls.ts` - Misc shortcut handlers
- `src/ui/stage-move-tool.ts` - Stage move tool handlers

## Architecture Insights

**Event Flow:**

```
Factorio Event → event-handlers.ts → stage.actions.* → user-actions.ts → project-updates.ts → ProjectContent
```

**Undo System:** Many user actions return `UndoAction` objects that can be registered for Factorio undo system.

**Settings Remnants:** When an entity with stage diffs or wires is deleted, it becomes a "settings remnant" (ghost) that preserves configuration until force-deleted.

**Underground Belt Pairing:** Underground belts are always updated in pairs to maintain consistency. The system tracks pairing relationships.

**Blueprint Paste:** Two methods exist:

1. Entity marker method - adds temporary markers to blueprint for tracking
2. Bplib method - uses BlueprintBuild library for processing

## Undo Support Analysis

### Undo System Architecture

The mod implements a custom undo system that integrates with Factorio's built-in undo (Ctrl+Z). The mechanism works by:

1. Creating a ghost entity (`bp100_undo-reference`) at a unique position `[index, 0]`
2. Mining the ghost immediately (adding it to Factorio's undo queue)
3. Storing undo data in `playerData.undoEntries[index]`
4. When user presses Ctrl+Z, Factorio "rebuilds" the ghost, which triggers `on_built_entity`
5. The handler detects the undo reference and executes the stored undo action

**Key files:**

- `src/project/undo.ts` - Core undo system implementation
- `src/project/user-actions.ts:118-161` - Undo handler definitions

### Undo Handlers

Five undo handlers are defined in `user-actions.ts`:

| Handler               | Line    | Reverses          | Action Taken                                 |
| --------------------- | ------- | ----------------- | -------------------------------------------- |
| `undoDeleteEntity`    | 119-122 | Entity deletion   | `updates.readdDeletedEntity(entity)`         |
| `undoManualStageMove` | 124-130 | Stage move        | `userTryMoveEntityToStage(entity, oldStage)` |
| `undoSendToStage`     | 132-138 | Send to stage     | `userBringEntityToStage(entity, oldStage)`   |
| `undoBringToStage`    | 140-146 | Bring to stage    | `userSendEntityToStage(entity, oldStage)`    |
| `lastStageChangeUndo` | 152-161 | Last stage change | `userTrySetLastStage(entity, oldLastStage)`  |

### Entity Manipulation Actions - Undo Support

| Action              | Explicit Undo | Implicit Undo | Notes                                                                             |
| ------------------- | :-----------: | :-----------: | --------------------------------------------------------------------------------- |
| Build entity        |       ✓       |               | Returns `undoManualStageMove` if overbuild causes stage move                      |
| Mine entity         |               |       ✓       | Factorio undo rebuilds entity → triggers `onEntityCreated`                        |
| Entity dies         |               |               | No undo - death is not undoable                                                   |
| Rotate entity       |               |       ✓       | Factorio undo rotates back → triggers `onEntityRotated`                           |
| Copy-paste settings |               |       ✓       | Factorio undo reverses paste → triggers `onEntityPossiblyUpdated`                 |
| Close entity GUI    |               |               | No undo - GUI closure doesn't modify state undoably                               |
| Fast transfer       |               |       ✓       | Factorio undo reverses transfer → triggers `onEntityPossiblyUpdated`              |
| Drop item           |               |       ✓       | Factorio undo reverses drop → triggers `onEntityPossiblyUpdated`                  |
| Flip entity         |               |       ✓       | Factorio undo flips back → triggers `onEntityPossiblyUpdated`                     |
| Mark for upgrade    |               |       ✓       | Factorio undo cancels upgrade mark → triggers `onEntityMarkedForUpgrade` with nil |
| Wire connection     |               |       ✓       | Factorio undo reconnects/disconnects → triggers `onWiresPossiblyUpdated`          |
| Blueprint paste     |               |       ✓       | Factorio undo removes pasted entities → triggers `onEntityDeleted`                |

**Legend:**

- **Explicit Undo**: The mod registers an `UndoAction` that executes mod-specific reversal logic
- **Implicit Undo**: Factorio's native undo fires events that the mod handles, effectively undoing the change

### Selection Tool Actions - Undo Support

| Tool/Mode                        | Explicit Undo | Handler Used          | Registration                    |
| -------------------------------- | :-----------: | --------------------- | ------------------------------- |
| Cleanup Tool (reverse)           |       ✓       | `undoDeleteEntity`    | `registerGroupUndoAction()`     |
| Stage Move Tool (normal/alt)     |       ✓       | `undoSendToStage`     | `registerGroupUndoAction()`     |
| Stage Move Tool (reverse)        |       ✓       | `undoBringToStage`    | `registerGroupUndoAction()`     |
| Stage Move Tool (alt-reverse)    |       ✓       | `undoBringToStage`    | `registerGroupUndoAction()`     |
| Filtered Stage Move Tool         |       ✓       | `undoSendToStage`     | Accumulated, then group         |
| Stage Deconstruct Tool (normal)  |       ✓       | `lastStageChangeUndo` | `registerGroupUndoAction()`     |
| Stage Deconstruct Tool (alt)     |       ✓       | `lastStageChangeUndo` | `registerGroupUndoAction()`     |
| Stage Deconstruct Tool (reverse) |       ✓       | `lastStageChangeUndo` | `registerGroupUndoAction()`     |
| Force Delete Tool                |       ✓       | `undoDeleteEntity`    | `registerGroupUndoAction()`     |
| Cleanup Tool (normal/alt)        |               |                       | No undo - fixes errors only     |
| Staged Copy Tool                 |               |                       | No undo - read-only operation   |
| Staged Cut Tool                  |               |                       | No undo - marks for delete only |

### Custom Input Shortcuts - Undo Support

| Shortcut                   | Explicit Undo | Handler Used          | Line                        |
| -------------------------- | :-----------: | --------------------- | --------------------------- |
| `bp100_force-delete`       |       ✓       | `undoDeleteEntity`    | event-handlers.ts:1250      |
| `bp100_move-to-this-stage` |       ✓       | `undoManualStageMove` | event-handlers.ts:1269      |
| Stage navigation shortcuts |               |                       | No undo - navigation only   |
| Project navigation         |               |                       | No undo - navigation only   |
| Stage creation shortcuts   |               |                       | No undo - creates new stage |
| Blueprint export shortcuts |               |                       | No undo - read-only         |
| Tool shortcuts             |               |                       | No undo - spawns tool only  |

### GUI Actions - Undo Support

| Action                 | Explicit Undo | Handler Used          | Notes                                    |
| ---------------------- | :-----------: | --------------------- | ---------------------------------------- |
| Move to this stage     |       ✓       | `undoManualStageMove` | Via `userMoveEntityToStageWithUndo()`    |
| Remove last stage      |       ✓       | `lastStageChangeUndo` | Via `userSetLastStageWithUndo()`         |
| Delete entity (panel)  |               |                       | Calls `forceDeleteEntity()` without undo |
| Reset property         |               |                       | No undo support                          |
| Apply to lower stage   |               |                       | No undo support                          |
| Reset vehicle location |               |                       | No undo support                          |
| Set vehicle location   |               |                       | No undo support                          |
| Stage management       |               |                       | No undo - stage operations               |
| Rebuild actions        |               |                       | No undo - world refresh                  |
| Tile management        |               |                       | No undo support                          |
| Project operations     |               |                       | No undo - project-level changes          |

### Tile Actions - Undo Support

| Action     | Explicit Undo | Implicit Undo | Notes                                               |
| ---------- | :-----------: | :-----------: | --------------------------------------------------- |
| Place tile |               |       ✓       | Factorio undo removes tile → triggers `onTileMined` |
| Mine tile  |               |       ✓       | Factorio undo places tile → triggers `onTileBuilt`  |

### Actions Without Any Undo Support

These entity manipulation actions have **no explicit undo** and may not be fully reversible:

1. **Entity dies** (`onEntityDied`) - Death is a permanent state change
2. **Close entity GUI** - GUI closure captures state, not reversible
3. **Cleanup tool (normal/alt)** - Fixes errors, creates no undo action
4. **GUI: Delete entity** - Uses `forceDeleteEntity()` directly without undo
5. **GUI: Reset property** - Property reset has no undo
6. **GUI: Apply to lower stage** - Stage diff move has no undo
7. **GUI: Reset/set vehicle location** - Vehicle positioning has no undo
8. **All tile management GUI actions** - Bulk tile operations have no undo
9. **All rebuild actions** - World refresh operations are not undoable
10. **Stage/project management** - Structural changes (insert/delete stage) have no undo

### Undo Registration Call Sites

| Location               | Function Called                   | Registration Method         |
| ---------------------- | --------------------------------- | --------------------------- |
| event-handlers.ts:584  | `onEntityCreated`                 | `registerUndoActionLater()` |
| event-handlers.ts:1056 | `onEntityForceDeleteUsed` (group) | `registerGroupUndoAction()` |
| event-handlers.ts:1085 | `onSendToStageUsed` (group)       | `registerGroupUndoAction()` |
| event-handlers.ts:1109 | Stage tool actions (group)        | `registerGroupUndoAction()` |
| event-handlers.ts:1179 | `onEntityForceDeleteUsed` (group) | `registerGroupUndoAction()` |
| event-handlers.ts:1232 | Filtered stage move (accumulated) | `registerGroupUndoAction()` |
| event-handlers.ts:1250 | `onEntityForceDeleteUsed`         | `registerUndoAction()`      |
| event-handlers.ts:1269 | `onMoveEntityToStageCustomInput`  | `registerUndoAction()`      |
| user-actions.ts:576    | `userMoveEntityToStageWithUndo`   | `registerUndoAction()`      |
| user-actions.ts:690    | `userSetLastStageWithUndo`        | `registerUndoAction()`      |

## Open Questions

- Are there any mod compatibility hooks that trigger additional actions?
