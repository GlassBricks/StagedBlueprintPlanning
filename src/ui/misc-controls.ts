/*
 * Copyright (c) 2024 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

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
