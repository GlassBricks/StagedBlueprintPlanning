/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { getAssemblyPlayerData } from "../../assembly/player-assembly-data"
import { createUserAssembly } from "../../assembly/UserAssembly"
import { CustomInputs, Prototypes } from "../../constants"
import { Events } from "../../lib"
import { updateMoveToolInCursor } from "../../ui/move-to-stage-tool"

let player: LuaPlayer
before_each(() => {
  player = game.players[1]!
})

test("current selected stage starts out as current stage", () => {
  const assembly = createUserAssembly("Test", 3)
  player.teleport([0, 0], assembly.getSurface(2))

  const assemblyPlayerData = getAssemblyPlayerData(player.index, assembly)!
  assert.equal(nil, assemblyPlayerData.moveTargetStage)

  player.cursor_stack!.set_stack(Prototypes.MoveToStageTool)
  updateMoveToolInCursor(player.index)

  assert.equal(2, assemblyPlayerData.moveTargetStage)
  assert.equal("Move to <Stage 2>", player.cursor_stack!.label)

  player.teleport([0, 0], assembly.getSurface(1))

  assert.equal(2, assemblyPlayerData.moveTargetStage) // still same
  assert.equal("Move to <Stage 2>", player.cursor_stack!.label)
})

test("changing selected stage", () => {
  const assembly = createUserAssembly("Test", 3)
  player.teleport([0, 0], assembly.getSurface(2))

  const assemblyPlayerData = getAssemblyPlayerData(player.index, assembly)!
  player.cursor_stack!.set_stack(Prototypes.MoveToStageTool)
  updateMoveToolInCursor(player.index)

  assert.equal(2, assemblyPlayerData.moveTargetStage)
  assert.equal("Move to <Stage 2>", player.cursor_stack!.label)

  Events.raiseFakeEvent(CustomInputs.StageSelectNext, { player_index: player.index, cursor_position: { x: 0, y: 0 } })
  assert.equal(3, assemblyPlayerData.moveTargetStage)
  assert.equal("Move to <Stage 3>", player.cursor_stack!.label)
  Events.raiseFakeEvent(CustomInputs.StageSelectNext, { player_index: player.index, cursor_position: { x: 0, y: 0 } })
  assert.equal(3, assemblyPlayerData.moveTargetStage) // max stage

  Events.raiseFakeEvent(CustomInputs.StageSelectPrevious, {
    player_index: player.index,
    cursor_position: { x: 0, y: 0 },
  })
  assert.equal(2, assemblyPlayerData.moveTargetStage)
  assert.equal("Move to <Stage 2>", player.cursor_stack!.label)
  Events.raiseFakeEvent(CustomInputs.StageSelectPrevious, {
    player_index: player.index,
    cursor_position: { x: 0, y: 0 },
  })
  assert.equal(1, assemblyPlayerData.moveTargetStage)
  assert.equal("Move to <Stage 1>", player.cursor_stack!.label)
  Events.raiseFakeEvent(CustomInputs.StageSelectPrevious, {
    player_index: player.index,
    cursor_position: { x: 0, y: 0 },
  })
  assert.equal(1, assemblyPlayerData.moveTargetStage)
  assert.equal("Move to <Stage 1>", player.cursor_stack!.label)
})
