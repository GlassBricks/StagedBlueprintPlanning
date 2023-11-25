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

import { LuaPlayer, PlayerIndex, SurfaceIndex } from "factorio:runtime"
import expect from "tstl-expect"
import { Pos } from "../../lib/geometry"
import { UserProject } from "../../project/ProjectDef"
import { _deleteAllProjects, createUserProject } from "../../project/UserProject"
import { exitProject, playerCurrentStage, teleportToProject, teleportToStage } from "../../ui/player-current-stage"

before_each(() => {
  const player = game.players[1]!
  player.teleport([0, 0], 1 as SurfaceIndex)
})
after_all(() => {
  const player = game.players[1]!
  player.teleport([0, 0], 1 as SurfaceIndex)
  _deleteAllProjects()
  player.cursor_stack!.clear()
})

test("playerCurrentStage", () => {
  const project = createUserProject("Test", 3)
  const player = game.players[1]!
  player.teleport([0, 0], 1 as SurfaceIndex)
  const currentStage = playerCurrentStage(1 as PlayerIndex)
  expect(currentStage.get()).toBeNil()

  for (const stage of project.getAllStages()) {
    player.teleport(player.position, stage.surface)
    expect(stage).toBe(currentStage.get())
  }

  project.deleteStage(project.numStages())
  expect(currentStage.get()).toBeNil()

  player.teleport(player.position, project.getStage(1)!.surface)
  expect(project.getStage(1)!).toBe(currentStage.get())

  project.delete()
  expect(currentStage.get()).toBeNil()
})

describe("teleporting to stage/project", () => {
  let project1: UserProject
  let project2: UserProject
  let player: LuaPlayer
  before_all(() => {
    project1 = createUserProject("Test1", 3)
    project2 = createUserProject("Test2", 3)
    player = game.players[1]!
  })
  test("can teleport to stage", () => {
    teleportToStage(player, project1.getStage(1)!)
    expect(project1.getStage(1)!).toBe(playerCurrentStage(1 as PlayerIndex).get())
    teleportToStage(player, project1.getStage(2)!)
    expect(project1.getStage(2)!).toBe(playerCurrentStage(1 as PlayerIndex).get())
  })
  test("keeps players position when teleporting from same project", () => {
    teleportToStage(player, project1.getStage(1)!)
    player.teleport(Pos(5, 10))
    teleportToStage(player, project1.getStage(2)!)
    expect(player.position).toEqual(Pos(5, 10))
  })

  test("remembers last position when teleporting from different project", () => {
    teleportToStage(player, project1.getStage(1)!)
    player.teleport(Pos(5, 10))
    teleportToStage(player, project2.getStage(1)!)
    teleportToStage(player, project1.getStage(1)!)
    expect(player.position).toEqual(Pos(5, 10))
  })

  test("can teleport to project", () => {
    teleportToProject(player, project1)
    expect(project1.getStage(1)!).toBe(playerCurrentStage(1 as PlayerIndex).get())
    teleportToProject(player, project2)
    expect(project2.getStage(1)!).toBe(playerCurrentStage(1 as PlayerIndex).get())
  })

  test("teleport to project remembers last stage and position", () => {
    teleportToStage(player, project1.getStage(2)!)
    player.teleport(Pos(5, 10))

    teleportToStage(player, project2.getStage(1)!)

    teleportToProject(player, project1)
    expect(player.position).toEqual(Pos(5, 10))
    expect(playerCurrentStage(player.index).get()).toBe(project1.getStage(2))
  })

  test("exitProject remembers last position when teleporting from outside project", () => {
    player.teleport(Pos(15, 20), 1 as SurfaceIndex)
    teleportToProject(player, project2)
    exitProject(player)
    expect(player.position).toEqual(Pos(15, 20))
    expect(player.surface_index).toEqual(1)
  })
})
