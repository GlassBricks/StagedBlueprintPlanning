// Copyright (c) 2024 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { submitProjectBlueprintBookTask } from "../blueprints/blueprint-creation"
import { CustomInputs } from "../constants"
import { ProtectedEvents } from "../lib"
import { createStageBlueprint } from "./create-stage-blueprint"
import { playerCurrentStage, teleportToStage } from "./player-current-stage"

const Events = ProtectedEvents

Events.on(CustomInputs.NewStageAtFront, (e) => {
  const player = game.get_player(e.player_index)!
  const project = playerCurrentStage(e.player_index).get()?.project
  if (!project) return
  const stage = project.insertStage(1)
  teleportToStage(player, stage)
})

Events.on(CustomInputs.NewStageAfterCurrent, (e) => {
  const player = game.get_player(e.player_index)!
  const currentStage = playerCurrentStage(e.player_index).get()
  if (!currentStage) return
  const project = currentStage.project
  const stage = project.insertStage(currentStage.stageNumber + 1)
  teleportToStage(player, stage)
})

Events.on(CustomInputs.GetStageBlueprint, (e) => {
  createStageBlueprint(game.get_player(e.player_index)!)
})

Events.on(CustomInputs.GetBlueprintBook, (e) => {
  const project = playerCurrentStage(e.player_index).get()?.project
  const player = game.get_player(e.player_index)!
  if (!player || !player.clear_cursor()) return
  const stack = player.cursor_stack
  if (!stack) return
  if (project) submitProjectBlueprintBookTask(project, stack)
})
