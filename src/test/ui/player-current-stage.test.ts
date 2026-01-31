// Copyright (c) 2022-2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { LuaPlayer, PlayerIndex, SurfaceIndex } from "factorio:runtime"
import expect from "tstl-expect"
import { Pos } from "../../lib/geometry"
import { UserProject } from "../../project/ProjectDef"
import { createUserProject, _deleteAllProjects } from "../../project/UserProject"
import { exitProject, playerCurrentStage, teleportToProject, teleportToStage } from "../../ui/player-current-stage"

before_each(() => {
  const player = game.players[1]
  player.teleport([0, 0], 1 as SurfaceIndex)
})
after_all(() => {
  const player = game.players[1]
  player.teleport([0, 0], 1 as SurfaceIndex)
  _deleteAllProjects()
  player.cursor_stack!.clear()
})

test("playerCurrentStage", () => {
  const project = createUserProject("Test", 3)
  const player = game.players[1]
  player.teleport([0, 0], 1 as SurfaceIndex)
  const currentStage = playerCurrentStage(1 as PlayerIndex)
  expect(currentStage.get()).toBeNil()

  expect(player.surface_index).not.toBe(project.getStage(1)!.surface.index)

  on_tick((t) => {
    const stage = project.getStage(math.floor((t - 1) / 2) + 1)!
    if (stage != nil) {
      if (t % 2 == 1) {
        player.teleport(player.position, stage.surface)
      } else {
        expect(currentStage.get()).comment(`Player should be on stage ${stage.stageNumber}`).toBe(stage)
      }
    } else {
      project.mergeStage(project.settings.stageCount())
      after_ticks(1, () => {
        expect(currentStage.get()).toBeNil()

        player.teleport(player.position, project.getStage(1)!.surface)
        after_ticks(2, () => {
          expect(currentStage.get()).toBe(project.getStage(1))

          project.delete()
          expect(currentStage.get()).toBeNil()
          done()
        })
      })
      return false
    }
  })
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
    after_ticks(1, () => {
      expect(project1.getStage(1)!).toBe(playerCurrentStage(1 as PlayerIndex).get())
      teleportToStage(player, project1.getStage(2)!)

      after_ticks(1, () => {
        expect(project1.getStage(2)!).toBe(playerCurrentStage(1 as PlayerIndex).get())
      })
    })
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
    after_ticks(1, () => {
      expect(project1.getStage(1)!).toBe(playerCurrentStage(1 as PlayerIndex).get())
      teleportToProject(player, project2)
      after_ticks(1, () => {
        expect(project2.getStage(1)!).toBe(playerCurrentStage(1 as PlayerIndex).get())
      })
    })
  })

  test("teleport to project remembers last stage and position", () => {
    teleportToStage(player, project1.getStage(2)!)
    player.teleport(Pos(5, 10))

    teleportToStage(player, project2.getStage(1)!)

    teleportToProject(player, project1)
    after_ticks(1, () => {
      expect(player.position).toEqual(Pos(5, 10))
      expect(playerCurrentStage(player.index).get()).toBe(project1.getStage(2))
    })
  })

  test("exitProject remembers last position when teleporting from outside project", () => {
    player.teleport(Pos(15, 20), 1 as SurfaceIndex)
    teleportToProject(player, project2)
    exitProject(player)
    after_ticks(1, () => {
      expect(player.position).toEqual(Pos(15, 20))
      expect(player.surface_index).toEqual(1)
    })
  })
})
