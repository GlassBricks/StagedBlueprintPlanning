/*
 * Copyright (c) 2022-2023 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { Stage } from "../assembly/AssemblyDef"
import { AssemblyPlayerData, getAssemblyPlayerData } from "../assembly/player-assembly-data"
import { getStageAtSurface } from "../assembly/UserAssembly"
import { CustomInputs, Prototypes } from "../constants"
import { ProtectedEvents } from "../lib"
import { L_Interaction } from "../locale"
import { PlayerChangedStageEvent, playerCurrentStage } from "./player-current-stage"

const Events = ProtectedEvents

function updateItemLabel(cursor: LuaItemStack, stage: Stage): void {
  cursor.label = "Send to " + stage.name.get()
}
export function updateMoveToolInCursor(player: LuaPlayer): LuaPlayer | nil {
  const cursor = getCursorIfHoldingStageMoveTool(player)
  if (!cursor) return

  cursor.allow_manual_label_change = false

  const stage = getStageAtSurface(player.surface.index)
  if (!stage) {
    if (cursor.name == Prototypes.FilteredStageMoveTool) {
      cursor.label = "<Not in a staged build>"
    } else {
      player.create_local_flying_text({
        text: [L_Interaction.NotInAnAssembly],
        create_at_cursor: true,
      })
      cursor.clear()
    }
    return
  }
  const assembly = stage.assembly

  const assemblyPlayerData = getAssemblyPlayerData(player.index, assembly)
  if (!assemblyPlayerData) return
  let selectedStage = assemblyPlayerData.moveTargetStage
  if (!selectedStage || selectedStage < 1 || selectedStage > assembly.numStages()) {
    selectedStage = stage.stageNumber
  }

  assemblyPlayerData.moveTargetStage = selectedStage
  updateItemLabel(cursor, assembly.getStage(selectedStage)!)

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

function getStageAndData(player: LuaPlayer): LuaMultiReturn<[LuaItemStack, Stage, AssemblyPlayerData] | [_?: nil]> {
  const cursor = getCursorIfHoldingStageMoveTool(player)
  if (!cursor) return $multi()

  const stage = playerCurrentStage(player.index).get()
  if (!stage) return $multi()

  const assembly = stage.assembly
  const assemblyPlayerData = getAssemblyPlayerData(player.index, assembly)
  if (!assemblyPlayerData) return $multi()

  return $multi(cursor, stage, assemblyPlayerData)
}

function changeSelectedStage(player: LuaPlayer, delta: number) {
  const [cursor, stage, assemblyPlayerData] = getStageAndData(player)
  if (!cursor) return

  let selectedStage = assemblyPlayerData.moveTargetStage ?? stage.stageNumber
  selectedStage += delta
  if (selectedStage < 1) selectedStage = 1
  const maxStage = stage.assembly.numStages()
  if (selectedStage > maxStage) selectedStage = maxStage

  assemblyPlayerData.moveTargetStage = selectedStage
  updateItemLabel(cursor, stage.assembly.getStage(selectedStage)!)
}
Events.on(CustomInputs.StageSelectNext, (e) => {
  changeSelectedStage(game.get_player(e.player_index)!, 1)
})
Events.on(CustomInputs.StageSelectPrevious, (e) => {
  changeSelectedStage(game.get_player(e.player_index)!, -1)
})
