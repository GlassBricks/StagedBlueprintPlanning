import {
  LuaItemStack,
  OnPlayerAltSelectedAreaEvent,
  OnPlayerReverseSelectedAreaEvent,
  OnPlayerSelectedAreaEvent,
} from "factorio:runtime"
import { CustomInputs, Prototypes } from "../../constants"
import { ProtectedEvents } from "../../lib"
import { addSelectionToolHandlers } from "../../lib/selection-tool"
import { L_Interaction } from "../../locale"
import { createBlueprintWithStageInfo } from "../../ui/create-blueprint-with-stage-info"
import { getProjectPlayerData } from "../player-project-data"
import { getStageAtSurface } from "../project-refs"
import { pushGroupUndo, pushUndo, UndoAction } from "../actions/undo"
import { getStageAtEntityOrPreview, getState } from "./shared-state"

const Events = ProtectedEvents

declare global {
  interface PlayerData {
    blueprintToSetup?: LuaItemStack
  }
}
declare const storage: StorageWithPlayer

function onCleanupToolSelected(e: OnPlayerSelectedAreaEvent): void {
  const stage = getStageAtSurface(e.surface.index)
  if (!stage) return
  const updateLater: import("factorio:runtime").LuaEntity[] = []
  const { stageNumber } = stage
  const { actions } = stage
  for (const entity of e.entities) {
    if (entity.train) {
      updateLater.push(entity)
    } else {
      actions.onCleanupToolUsed(entity, stageNumber)
    }
  }
  for (const entity of updateLater) {
    actions.onCleanupToolUsed(entity, stageNumber)
  }
}

function onCleanupToolReverseSelected(e: OnPlayerSelectedAreaEvent): void {
  const playerIndex = e.player_index
  const stage = getStageAtSurface(e.surface.index)
  if (!stage) return
  const { actions } = stage
  const stageNumber = stage.stageNumber
  const undoActions: UndoAction[] = []
  for (const entity of e.entities) {
    const undoAction = actions.onEntityForceDeleteUsed(entity, stageNumber, playerIndex)
    if (undoAction) undoActions.push(undoAction)
  }
  const player = game.get_player(playerIndex)
  if (player) pushGroupUndo(player, e.surface, undoActions)
}

addSelectionToolHandlers(Prototypes.CleanupTool, {
  onSelected: onCleanupToolSelected,
  onAltSelected: onCleanupToolSelected,
  onReverseSelected: onCleanupToolReverseSelected,
})

function stageMoveToolUsed(e: OnPlayerSelectedAreaEvent): void {
  const stage = getStageAtSurface(e.surface.index)
  if (!stage) return
  const playerIndex = e.player_index
  const playerData = getProjectPlayerData(playerIndex, stage.project)
  if (!playerData) return
  const targetStage = playerData.moveTargetStage
  if (!targetStage) {
    error("moveTargetStage was not set")
  }
  const { stageNumber } = stage
  const undoActions: UndoAction[] = []
  const { actions } = stage
  const onlyIfMatchesFirstStage = e.name != defines.events.on_player_alt_selected_area
  for (const entity of e.entities) {
    const undoAction = actions.onSendToStageUsed(entity, stageNumber, targetStage, onlyIfMatchesFirstStage, playerIndex)
    if (undoAction) undoActions.push(undoAction)
  }
  const player = game.get_player(playerIndex)
  if (player) pushGroupUndo(player, e.surface, undoActions)
}

function selectionToolUsed(
  e: OnPlayerSelectedAreaEvent | OnPlayerAltSelectedAreaEvent | OnPlayerReverseSelectedAreaEvent,
  action:
    | "onStageDeleteUsed"
    | "onStageDeleteReverseUsed"
    | "onStageDeleteCancelUsed"
    | "onBringToStageUsed"
    | "onBringDownToStageUsed",
): void {
  const stage = getStageAtSurface(e.surface.index)
  if (!stage) return

  const { stageNumber, actions } = stage
  const undoActions: UndoAction[] = []
  const playerIndex = e.player_index
  for (const entity of e.entities) {
    const undoAction = actions[action](entity, stageNumber, playerIndex)
    if (undoAction) undoActions.push(undoAction)
  }

  const player = game.get_player(playerIndex)
  if (player) pushGroupUndo(player, e.surface, undoActions)
}

addSelectionToolHandlers(Prototypes.StageMoveTool, {
  onSelected: stageMoveToolUsed,
  onAltSelected: stageMoveToolUsed,
  onReverseSelected: (e) => selectionToolUsed(e, "onBringToStageUsed"),
  onAltReverseSelected: (e) => selectionToolUsed(e, "onBringDownToStageUsed"),
})

addSelectionToolHandlers(Prototypes.StageDeconstructTool, {
  onSelected: (e) => selectionToolUsed(e, "onStageDeleteUsed"),
  onAltSelected: (e) => selectionToolUsed(e, "onStageDeleteCancelUsed"),
  onReverseSelected: (e) => selectionToolUsed(e, "onStageDeleteReverseUsed"),
})

function stagedCopyToolUsed(event: OnPlayerSelectedAreaEvent): void {
  const player = game.get_player(event.player_index)!
  const stage = getStageAtSurface(event.surface.index)
  if (!stage) {
    return player.print([L_Interaction.NotInAnProject])
  }
  const stack = createBlueprintWithStageInfo(player, stage, event.area)
  if (!stack) return
  if (event.name != defines.events.on_player_alt_selected_area) {
    player.add_to_clipboard(stack)
    player.activate_paste()
  } else {
    player.clear_cursor()
    player.opened = stack
    storage.players[event.player_index].blueprintToSetup = stack
  }
}

Events.on_gui_closed((e) => {
  const playerData = storage.players[e.player_index]
  const stack = playerData.blueprintToSetup
  if (!stack) return
  delete playerData.blueprintToSetup
  const player = game.get_player(e.player_index)!
  if (!(stack?.valid && stack.valid_for_read)) return
  if (stack.valid_for_read && stack.is_blueprint && stack.is_blueprint_setup()) {
    player.add_to_clipboard(stack)
    player.activate_paste()
  }
  stack.clear()
})

addSelectionToolHandlers(Prototypes.StagedCopyTool, {
  onSelected: stagedCopyToolUsed,
  onAltSelected: stagedCopyToolUsed,
})

function forceDeleteToolUsed(event: OnPlayerSelectedAreaEvent): void {
  const stage = getStageAtSurface(event.surface.index)
  if (!stage) return
  const { stageNumber, actions } = stage
  const undoActions: UndoAction[] = []
  for (const entity of event.entities) {
    const undoAction = actions.onEntityForceDeleteUsed(entity, stageNumber, event.player_index)
    if (undoAction) undoActions.push(undoAction)
  }
  const player = game.get_player(event.player_index)
  if (player) pushGroupUndo(player, event.surface, undoActions)
}

addSelectionToolHandlers(Prototypes.ForceDeleteTool, {
  onSelected: forceDeleteToolUsed,
  onAltSelected: forceDeleteToolUsed,
})

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

function cutToolUsed(event: OnPlayerSelectedAreaEvent): void {
  stagedCopyToolUsed(event)
  forceDeleteToolUsed(event)
}

addSelectionToolHandlers(Prototypes.StagedCutTool, {
  onSelected: cutToolUsed,
  onAltSelected: cutToolUsed,
})

Events.on_marked_for_deconstruction((e) => {
  const playerIndex = e.player_index
  if (!playerIndex) return
  const player = game.get_player(playerIndex)!
  const cursorStack = player.cursor_stack
  if (!cursorStack || !cursorStack.valid_for_read || cursorStack.name != Prototypes.FilteredStageMoveTool) return

  const entity = e.entity
  entity.cancel_deconstruction(entity.force)
  const stage = getStageAtSurface(entity.surface_index)
  if (!stage) return
  const playerData = getProjectPlayerData(playerIndex, stage.project)
  if (!playerData) return
  const targetStage = playerData.moveTargetStage
  if (!targetStage) return
  const undoAction = stage.actions.onSendToStageUsed(entity, stage.stageNumber, targetStage, true, playerIndex)
  if (undoAction) {
    ;(getState().accumulatedUndoActions ??= []).push(undoAction)
  }
})

Events.on_player_deconstructed_area((e) => {
  if (e.item != Prototypes.FilteredStageMoveTool) return
  const player = game.get_player(e.player_index)!
  if (getStageAtSurface(player.surface_index) == nil) {
    player.create_local_flying_text({
      text: [L_Interaction.NotInAnProject],
      create_at_cursor: true,
    })
    player.play_sound({ path: "utility/cannot_build" })
    return
  }
  const undoActions = getState().accumulatedUndoActions
  if (undoActions) {
    const player = game.get_player(e.player_index)
    if (player) pushGroupUndo(player, player.surface, undoActions)
    delete getState().accumulatedUndoActions
  }
})

Events.on(CustomInputs.ForceDelete, (e) => {
  const playerIndex = e.player_index
  const player = game.get_player(playerIndex)!
  const entity = player.selected
  if (!entity) return
  const stage = getStageAtEntityOrPreview(entity)
  if (!stage) return
  const { name, position } = entity
  const undoAction = stage.actions.onEntityForceDeleteUsed(entity, stage.stageNumber, playerIndex)
  if (undoAction) {
    player.play_sound({ path: "entity-mined/" + name, position })
    pushUndo(player, player.surface, undoAction)
  }
})

Events.on(CustomInputs.MoveToThisStage, (e) => {
  const player = game.get_player(e.player_index)!
  const entity = player.selected
  if (!entity) return
  const stage = getStageAtEntityOrPreview(entity)
  if (!stage) {
    player.create_local_flying_text({
      text: [L_Interaction.NotInAnProject],
      create_at_cursor: true,
    })
    return
  }

  const undoAction = stage.actions.onMoveEntityToStageCustomInput(entity, stage.stageNumber, e.player_index)
  if (undoAction) pushUndo(player, player.surface, undoAction)
})
