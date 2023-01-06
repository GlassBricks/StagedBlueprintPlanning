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

import { UserAssembly } from "../../assembly/AssemblyDef"
import { _deleteAllAssemblies, createUserAssembly } from "../../assembly/UserAssembly"
import { Pos } from "../../lib/geometry"
import { playerCurrentStage, teleportToAssembly, teleportToStage } from "../../ui/player-current-stage"
import expect from "tstl-expect"

before_each(() => {
  const player = game.players[1]!
  player.teleport([0, 0], 1 as SurfaceIndex)
})
after_all(() => {
  const player = game.players[1]!
  player.teleport([0, 0], 1 as SurfaceIndex)
  _deleteAllAssemblies()
  player.cursor_stack!.clear()
})

test("playerCurrentStage", () => {
  const assembly = createUserAssembly("Test", 3)
  const player = game.players[1]!
  player.teleport([0, 0], 1 as SurfaceIndex)
  const currentStage = playerCurrentStage(1 as PlayerIndex)
  expect(currentStage.get()).to.be.nil()

  for (const stage of assembly.getAllStages()) {
    player.teleport(player.position, stage.surface)
    expect(stage).to.be(currentStage.get())
  }

  assembly.deleteStage(assembly.maxStage())
  expect(currentStage.get()).to.be.nil()

  player.teleport(player.position, assembly.getStage(1)!.surface)
  expect(assembly.getStage(1)!).to.be(currentStage.get())

  assembly.delete()
  expect(currentStage.get()).to.be.nil()
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
    expect(assembly1.getStage(1)!).to.be(playerCurrentStage(1 as PlayerIndex).get())
    teleportToStage(player, assembly1.getStage(2)!)
    expect(assembly1.getStage(2)!).to.be(playerCurrentStage(1 as PlayerIndex).get())
  })
  test("keeps players position when teleporting from same assembly", () => {
    teleportToStage(player, assembly1.getStage(1)!)
    player.teleport(Pos(5, 10))
    teleportToStage(player, assembly1.getStage(2)!)
    expect(player.position).to.equal(Pos(5, 10))
  })

  test("remembers last position when teleporting from different assembly", () => {
    teleportToStage(player, assembly1.getStage(1)!)
    player.teleport(Pos(5, 10))
    teleportToStage(player, assembly2.getStage(1)!)
    teleportToStage(player, assembly1.getStage(1)!)
    expect(player.position).to.equal(Pos(5, 10))
  })

  test("can teleport to assembly", () => {
    teleportToAssembly(player, assembly1)
    expect(assembly1.getStage(1)!).to.be(playerCurrentStage(1 as PlayerIndex).get())
    teleportToAssembly(player, assembly2)
    expect(assembly2.getStage(1)!).to.be(playerCurrentStage(1 as PlayerIndex).get())
  })

  test("teleport to assembly remembers last stage and position", () => {
    teleportToStage(player, assembly1.getStage(2)!)
    player.teleport(Pos(5, 10))

    teleportToStage(player, assembly2.getStage(1)!)

    teleportToAssembly(player, assembly1)
    expect(player.position).to.equal(Pos(5, 10))
    expect(playerCurrentStage(player.index).get()).to.be(assembly1.getStage(2))
  })
})
