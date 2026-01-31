// Copyright (c) 2022-2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { LuaItemStack, LuaPlayer } from "factorio:runtime"
import { CustomInputs, Prototypes } from "../constants"
import { ProtectedEvents } from "../lib"
import { L_Interaction } from "../locale"
import { getProjectPlayerData, ProjectPlayerData } from "../project/player-project-data"
import { getStageAtSurface } from "../project/project-refs"
import { Stage } from "../project/ProjectDef"

import { PlayerChangedStageEvent, playerCurrentStage } from "./player-current-stage"

const Events = ProtectedEvents

function updateItemLabel(cursor: LuaItemStack, stage: Stage): void {
  cursor.label = "Send to " + stage.getSettings().name.get()
}
export function updateMoveToolInCursor(player: LuaPlayer): LuaPlayer | nil {
  const cursor = getCursorIfHoldingStageMoveTool(player)
  if (!cursor) return

  cursor.allow_manual_label_change = false

  const stage = getStageAtSurface(player.surface_index)
  if (!stage) {
    if (cursor.name == Prototypes.FilteredStageMoveTool) {
      cursor.label = "<Not in a staged BP project>"
    } else {
      player.create_local_flying_text({
        text: [L_Interaction.NotInAnProject],
        create_at_cursor: true,
      })
      cursor.clear()
    }
    return
  }
  const project = stage.project

  const projectPlayerData = getProjectPlayerData(player.index, project)
  if (!projectPlayerData) return
  let selectedStage = projectPlayerData.moveTargetStage
  if (!selectedStage || selectedStage < 1 || selectedStage > project.settings.stageCount()) {
    selectedStage = stage.stageNumber
  }

  projectPlayerData.moveTargetStage = selectedStage
  updateItemLabel(cursor, project.getStage(selectedStage)!)

  return player
}

Events.on_player_cursor_stack_changed((e) => {
  const player = updateMoveToolInCursor(game.get_player(e.player_index)!)
  if (player && player.cursor_stack!.name == Prototypes.FilteredStageMoveTool) {
    player.print([L_Interaction.FilteredStageMoveToolWarning])
  }
})
PlayerChangedStageEvent.addListener((player) => {
  updateMoveToolInCursor(player)
})

function getCursorIfHoldingStageMoveTool(player: LuaPlayer): LuaItemStack | nil {
  const cursor = player.cursor_stack
  if (
    !cursor ||
    !cursor.valid_for_read ||
    (cursor.name != Prototypes.StageMoveTool && cursor.name != Prototypes.FilteredStageMoveTool)
  )
    return
  return cursor
}

function getStageAndData(player: LuaPlayer): LuaMultiReturn<[LuaItemStack, Stage, ProjectPlayerData] | [_?: nil]> {
  const cursor = getCursorIfHoldingStageMoveTool(player)
  if (!cursor) return $multi()

  const stage = playerCurrentStage(player.index).get()
  if (!stage) return $multi()

  const project = stage.project
  const projectPlayerData = getProjectPlayerData(player.index, project)
  if (!projectPlayerData) return $multi()

  return $multi(cursor, stage, projectPlayerData)
}

function changeSelectedStage(player: LuaPlayer, delta: number) {
  const [cursor, stage, projectPlayerData] = getStageAndData(player)
  if (!cursor) return

  let selectedStage = projectPlayerData.moveTargetStage ?? stage.stageNumber
  selectedStage += delta
  if (selectedStage < 1) selectedStage = 1
  const maxStage = stage.project.settings.stageCount()
  if (selectedStage > maxStage) selectedStage = maxStage

  projectPlayerData.moveTargetStage = selectedStage
  updateItemLabel(cursor, stage.project.getStage(selectedStage)!)
}
Events.on(CustomInputs.StageSelectNext, (e) => {
  changeSelectedStage(game.get_player(e.player_index)!, 1)
})
Events.on(CustomInputs.StageSelectPrevious, (e) => {
  changeSelectedStage(game.get_player(e.player_index)!, -1)
})
