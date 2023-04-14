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

import expect from "tstl-expect"
import { getAssemblyPlayerData } from "../../assembly/player-assembly-data"
import { _deleteAllAssemblies, createUserAssembly } from "../../assembly/UserAssembly"
import { CustomInputs, Prototypes } from "../../constants"
import { Events } from "../../lib"
import { updateMoveToolInCursor } from "../../ui/stage-move-tool"

let player: LuaPlayer
before_each(() => {
  player = game.players[1]!
})
after_each(() => {
  player.cursor_stack!.clear()
  _deleteAllAssemblies()
})

test("current selected stage starts out as current stage", () => {
  const assembly = createUserAssembly("Test", 3)
  player.teleport([0, 0], assembly.getSurface(2))

  const assemblyPlayerData = getAssemblyPlayerData(player.index, assembly)!
  expect(assemblyPlayerData.moveTargetStage).to.be(nil)

  player.cursor_stack!.set_stack(Prototypes.StageMoveTool)
  updateMoveToolInCursor(player)

  expect(assemblyPlayerData.moveTargetStage).to.be(2)
  expect(player.cursor_stack!.label).to.be("Send to Stage 2")

  player.teleport([0, 0], assembly.getSurface(1))

  expect(assemblyPlayerData.moveTargetStage).to.be(2) // still same
  expect(player.cursor_stack!.label).to.be("Send to Stage 2")
})

test("item removed if not in assembly", () => {
  player.teleport([0, 0], 1 as SurfaceIndex)
  player.cursor_stack!.set_stack(Prototypes.StageMoveTool)
  updateMoveToolInCursor(player)
  expect(player.cursor_stack!.valid_for_read).to.be(false)
})

test("changing selected stage", () => {
  const assembly = createUserAssembly("Test", 3)
  player.teleport([0, 0], assembly.getSurface(2))

  const assemblyPlayerData = getAssemblyPlayerData(player.index, assembly)!
  player.cursor_stack!.set_stack(Prototypes.StageMoveTool)
  updateMoveToolInCursor(player)

  expect(assemblyPlayerData.moveTargetStage).to.be(2)
  expect(player.cursor_stack!.label).to.be("Send to Stage 2")

  Events.raiseFakeEvent(CustomInputs.StageSelectNext, { player_index: player.index, cursor_position: { x: 0, y: 0 } })
  expect(assemblyPlayerData.moveTargetStage).to.be(3)
  expect(player.cursor_stack!.label).to.be("Send to Stage 3")
  Events.raiseFakeEvent(CustomInputs.StageSelectNext, { player_index: player.index, cursor_position: { x: 0, y: 0 } })
  expect(assemblyPlayerData.moveTargetStage).to.be(3) // max stage

  Events.raiseFakeEvent(CustomInputs.StageSelectPrevious, {
    player_index: player.index,
    cursor_position: { x: 0, y: 0 },
  })
  expect(assemblyPlayerData.moveTargetStage).to.be(2)
  expect(player.cursor_stack!.label).to.be("Send to Stage 2")
  Events.raiseFakeEvent(CustomInputs.StageSelectPrevious, {
    player_index: player.index,
    cursor_position: { x: 0, y: 0 },
  })
  expect(assemblyPlayerData.moveTargetStage).to.be(1)
  expect(player.cursor_stack!.label).to.be("Send to Stage 1")
  Events.raiseFakeEvent(CustomInputs.StageSelectPrevious, {
    player_index: player.index,
    cursor_position: { x: 0, y: 0 },
  })
  expect(assemblyPlayerData.moveTargetStage).to.be(1)
  expect(player.cursor_stack!.label).to.be("Send to Stage 1")
})

test("filtered stage move tool name set to <Not in a staged build>", () => {
  player.teleport([0, 0], 1 as SurfaceIndex)
  player.cursor_stack!.set_stack(Prototypes.FilteredStageMoveTool)
  updateMoveToolInCursor(player)
  expect(player.cursor_stack!.label).to.be("<Not in a staged build>")
})

test("changing selected stage with filtered stage move tool", () => {
  // only test 3 stages
  const assembly = createUserAssembly("Test", 3)
  player.teleport([0, 0], assembly.getSurface(2))

  const assemblyPlayerData = getAssemblyPlayerData(player.index, assembly)!
  player.cursor_stack!.set_stack(Prototypes.FilteredStageMoveTool)
  updateMoveToolInCursor(player)

  expect(assemblyPlayerData.moveTargetStage).to.be(2)
  expect(player.cursor_stack!.label).to.be("Send to Stage 2")

  Events.raiseFakeEvent(CustomInputs.StageSelectNext, { player_index: player.index, cursor_position: { x: 0, y: 0 } })
  expect(assemblyPlayerData.moveTargetStage).to.be(3)
  expect(player.cursor_stack!.label).to.be("Send to Stage 3")
})
