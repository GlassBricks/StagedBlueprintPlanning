// Copyright (c) 2022-2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

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
import {
  enterLastProject,
  exitProject,
  playerCurrentStage,
  teleportToProject,
  teleportToStage,
} from "./player-current-stage"

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
  if (!stage) return
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

Events.on(CustomInputs.GoToProjectFirstStage, (e) => {
  const player = game.get_player(e.player_index)!
  const stage = playerCurrentStage(e.player_index).get()
  if (!stage) return
  teleportToStage(player, stage.project.getStage(1)!)
})

Events.on(CustomInputs.GoToProjectLastStage, (e) => {
  const player = game.get_player(e.player_index)!
  const stage = playerCurrentStage(e.player_index).get()
  if (!stage) return
  teleportToStage(player, stage.project.getStage(stage.project.numStages())!)
})

Events.on(CustomInputs.GoToEntityFirstStage, (e) => {
  const player = game.get_player(e.player_index)!
  const entity = player.selected
  if (!entity) return
  const [stage, projectEntity] = getProjectEntityOfEntity(entity)
  if (!projectEntity) return
  const firstStageNum = projectEntity.firstStage
  const currentStage = stage!.stageNumber
  if (firstStageNum == currentStage) {
    return notifyError(player, [L_Interaction.AlreadyAtFirstStage], false)
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

Events.on(CustomInputs.ExitProject, (e) => {
  exitProject(game.get_player(e.player_index)!)
})

Events.on(CustomInputs.ReturnToLastProject, (e) => {
  enterLastProject(game.get_player(e.player_index)!)
})
