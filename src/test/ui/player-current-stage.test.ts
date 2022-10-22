/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of 100% Blueprint Planning.
 *
 * 100% Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * 100% Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with 100% Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { UserAssembly } from "../../assembly/AssemblyDef"
import { _deleteAllAssemblies, createUserAssembly } from "../../assembly/UserAssembly"
import { Pos } from "../../lib/geometry"
import { playerCurrentStage, teleportToAssembly, teleportToStage } from "../../ui/player-current-stage"

before_each(() => {
  const player = game.players[1]!
  player.teleport([0, 0], 1 as SurfaceIndex)
})
after_all(() => {
  const player = game.players[1]!
  player.teleport([0, 0], 1 as SurfaceIndex)
  _deleteAllAssemblies()
})

test("playerCurrentStage", () => {
  const assembly = createUserAssembly("Test", 3)
  const player = game.players[1]!
  player.teleport([0, 0], 1 as SurfaceIndex)
  const currentStage = playerCurrentStage(1 as PlayerIndex)
  assert.nil(currentStage.get())

  for (const [, stage] of assembly.iterateStages()) {
    player.teleport(player.position, stage.surface)
    assert.equal(currentStage.get(), stage)
  }

  assembly.deleteStage(assembly.numStages())
  assert.nil(currentStage.get())

  player.teleport(player.position, assembly.getStage(1)!.surface)
  assert.equal(currentStage.get(), assembly.getStage(1)!)

  assembly.delete()
  assert.nil(currentStage.get())
})

describe("teleporting to stage/assembly", () => {
  let assembly1: UserAssembly
  let assembly2: UserAssembly
  let player: LuaPlayer
  before_all(() => {
    assembly1 = createUserAssembly("Test1", 3)
    assembly2 = createUserAssembly("Test2", 3)
    player = game.players[1]!
  })
  test("can teleport to stage", () => {
    teleportToStage(player, assembly1.getStage(1)!)
    assert.equal(playerCurrentStage(1 as PlayerIndex).get(), assembly1.getStage(1)!)
    teleportToStage(player, assembly1.getStage(2)!)
    assert.equal(playerCurrentStage(1 as PlayerIndex).get(), assembly1.getStage(2)!)
  })
  test("keeps players position when teleporting from same assembly", () => {
    teleportToStage(player, assembly1.getStage(1)!)
    player.teleport(Pos(5, 10))
    teleportToStage(player, assembly1.getStage(2)!)
    assert.same(Pos(5, 10), player.position)
  })

  test("remembers last position when teleporting from different assembly", () => {
    teleportToStage(player, assembly1.getStage(1)!)
    player.teleport(Pos(5, 10))
    teleportToStage(player, assembly2.getStage(1)!)
    teleportToStage(player, assembly1.getStage(1)!)
    assert.same(Pos(5, 10), player.position)
  })

  test("can teleport to assembly", () => {
    teleportToAssembly(player, assembly1)
    assert.equal(playerCurrentStage(1 as PlayerIndex).get(), assembly1.getStage(1)!)
    teleportToAssembly(player, assembly2)
    assert.equal(playerCurrentStage(1 as PlayerIndex).get(), assembly2.getStage(1)!)
  })

  test("teleport to assembly remembers last stage and position", () => {
    teleportToStage(player, assembly1.getStage(2)!)
    player.teleport(Pos(5, 10))

    teleportToStage(player, assembly2.getStage(1)!)

    teleportToAssembly(player, assembly1)
    assert.same(Pos(5, 10), player.position)
    assert.equal(assembly1.getStage(2), playerCurrentStage(player.index).get())
  })
})
