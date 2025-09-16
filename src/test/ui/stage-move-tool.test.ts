// Copyright (c) 2022-2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { LuaPlayer, SurfaceIndex } from "factorio:runtime"
import expect from "tstl-expect"
import { CustomInputs, Prototypes } from "../../constants"
import { Events } from "../../lib"
import { getProjectPlayerData } from "../../project/player-project-data"
import { _deleteAllProjects, createUserProject } from "../../project/UserProject"
import { updateMoveToolInCursor } from "../../ui/stage-move-tool"

let player: LuaPlayer
before_each(() => {
  player = game.players[1]!
})
after_each(() => {
  player.cursor_stack!.clear()
  _deleteAllProjects()
})

test("current selected stage starts out as current stage", () => {
  const project = createUserProject("Test", 3)
  player.teleport([0, 0], project.getSurface(2))

  const projectPlayerData = getProjectPlayerData(player.index, project)!
  expect(projectPlayerData.moveTargetStage).toBe(nil)

  player.cursor_stack!.set_stack(Prototypes.StageMoveTool)
  updateMoveToolInCursor(player)

  expect(projectPlayerData.moveTargetStage).toBe(2)
  expect(player.cursor_stack!.label).toBe("Send to Stage 2")

  player.teleport([0, 0], project.getSurface(1))

  expect(projectPlayerData.moveTargetStage).toBe(2) // still the same
  expect(player.cursor_stack!.label).toBe("Send to Stage 2")
})

test("item removed if not in project", () => {
  player.teleport([0, 0], 1 as SurfaceIndex)
  player.cursor_stack!.set_stack(Prototypes.StageMoveTool)
  updateMoveToolInCursor(player)
  expect(player.cursor_stack!.valid_for_read).toBe(false)
})

test("changing selected stage", () => {
  const project = createUserProject("Test", 3)
  player.teleport([0, 0], project.getSurface(2))
  after_ticks(1, () => {
    const projectPlayerData = getProjectPlayerData(player.index, project)!
    player.cursor_stack!.set_stack(Prototypes.StageMoveTool)
    updateMoveToolInCursor(player)

    expect(projectPlayerData.moveTargetStage).toBe(2)
    expect(player.cursor_stack!.label).toBe("Send to Stage 2")

    Events.raiseFakeEvent(CustomInputs.StageSelectNext, { player_index: player.index, cursor_position: { x: 0, y: 0 } })
    expect(projectPlayerData.moveTargetStage).toBe(3)
    expect(player.cursor_stack!.label).toBe("Send to Stage 3")
    Events.raiseFakeEvent(CustomInputs.StageSelectNext, { player_index: player.index, cursor_position: { x: 0, y: 0 } })
    expect(projectPlayerData.moveTargetStage).toBe(3) // max stage

    Events.raiseFakeEvent(CustomInputs.StageSelectPrevious, {
      player_index: player.index,
      cursor_position: { x: 0, y: 0 },
    })
    expect(projectPlayerData.moveTargetStage).toBe(2)
    expect(player.cursor_stack!.label).toBe("Send to Stage 2")
    Events.raiseFakeEvent(CustomInputs.StageSelectPrevious, {
      player_index: player.index,
      cursor_position: { x: 0, y: 0 },
    })
    expect(projectPlayerData.moveTargetStage).toBe(1)
    expect(player.cursor_stack!.label).toBe("Send to Stage 1")
    Events.raiseFakeEvent(CustomInputs.StageSelectPrevious, {
      player_index: player.index,
      cursor_position: { x: 0, y: 0 },
    })
    expect(projectPlayerData.moveTargetStage).toBe(1)
    expect(player.cursor_stack!.label).toBe("Send to Stage 1")
  })
})

test("filtered stage move tool name set to <Not in a staged BP project>", () => {
  player.teleport([0, 0], 1 as SurfaceIndex)
  player.cursor_stack!.set_stack(Prototypes.FilteredStageMoveTool)
  updateMoveToolInCursor(player)
  expect(player.cursor_stack!.label).toBe("<Not in a staged BP project>")
})

test("changing selected stage with filtered stage move tool", () => {
  // only test 3 stages
  const project = createUserProject("Test", 3)
  player.teleport([0, 0], project.getSurface(2))
  after_ticks(1, () => {
    const projectPlayerData = getProjectPlayerData(player.index, project)!
    player.cursor_stack!.set_stack(Prototypes.FilteredStageMoveTool)
    updateMoveToolInCursor(player)

    expect(projectPlayerData.moveTargetStage).toBe(2)
    expect(player.cursor_stack!.label).toBe("Send to Stage 2")

    Events.raiseFakeEvent(CustomInputs.StageSelectNext, { player_index: player.index, cursor_position: { x: 0, y: 0 } })
    expect(projectPlayerData.moveTargetStage).toBe(3)
    expect(player.cursor_stack!.label).toBe("Send to Stage 3")
  })
})
