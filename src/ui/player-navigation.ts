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

/**
 * This file handles player navigation.
 * For project editing, see project/event-handlers.ts.
 */

import { CustomInputEvent, LocalisedString, LuaPlayer } from "factorio:runtime"
import { CustomInputs } from "../constants"
import { ProtectedEvents } from "../lib"
import { L_Interaction } from "../locale"
import { getAllProjects } from "../project/UserProject"
import { getProjectEntityOfEntity } from "./entity-util"
import { playerCurrentStage, teleportToProject, teleportToStage } from "./player-current-stage"

const Events = ProtectedEvents

function playErrorSound(player: LuaPlayer) {
  player.play_sound({ path: "utility/cannot_build" })
}
function notifyError(player: LuaPlayer, message: LocalisedString, playSound: boolean) {
  if (playSound) playErrorSound(player)
  player.create_local_flying_text({
    text: message,
    create_at_cursor: true,
  })
}

function goToStageRelative(event: CustomInputEvent, diff: number, ErrorLocale: string) {
  const player = game.get_player(event.player_index)!
  const stage = playerCurrentStage(event.player_index).get()
  if (!stage) {
    return notifyError(player, [L_Interaction.NotInAnProject], false)
  }
  const nextStageNum = stage.stageNumber + diff
  const toStage = stage.project.getStage(nextStageNum)
  if (!toStage) {
    return notifyError(player, [ErrorLocale], false)
  }
  teleportToStage(player, toStage)
}

Events.on(CustomInputs.NextStage, (e) => {
  goToStageRelative(e, 1, L_Interaction.NoNextStage)
})

Events.on(CustomInputs.PreviousStage, (e) => {
  goToStageRelative(e, -1, L_Interaction.NoPreviousStage)
})

Events.on(CustomInputs.GoToFirstStage, (e) => {
  const player = game.get_player(e.player_index)!
  const entity = player.selected
  if (!entity) return
  const [stage, projectEntity] = getProjectEntityOfEntity(entity)
  if (!projectEntity) {
    return notifyError(player, [L_Interaction.NotInAnProject], true)
  }
  const firstStageNum = projectEntity.firstStage
  const currentStage = stage!.stageNumber
  if (firstStageNum == currentStage) {
    return notifyError(player, [L_Interaction.AlreadyAtFirstStage], true)
  }
  const firstStage = stage!.project.getStage(firstStageNum)
  assert(firstStage, "First stage not found")
  teleportToStage(player, firstStage!)
})

function goToBuildRelative(event: CustomInputEvent, diff: number, ErrorLocale: string) {
  const projects = getAllProjects()
  if (projects.length == 0) return
  let targetIndex: number

  const currentProject = playerCurrentStage(event.player_index).get()?.project
  if (!currentProject) {
    targetIndex = 0
  } else {
    const curIndex = projects.indexOf(currentProject)
    if (curIndex == -1) {
      targetIndex = 0
    } else {
      targetIndex = curIndex + diff
    }
  }

  if (targetIndex < 0 || targetIndex >= projects.length) {
    return notifyError(game.get_player(event.player_index)!, [ErrorLocale], false)
  }
  const nextProject = projects[targetIndex]
  teleportToProject(game.get_player(event.player_index)!, nextProject)
}

Events.on(CustomInputs.NextProject, (e) => {
  goToBuildRelative(e, 1, L_Interaction.NoNextProject)
})

Events.on(CustomInputs.PreviousProject, (e) => {
  goToBuildRelative(e, -1, L_Interaction.NoPreviousProject)
})
