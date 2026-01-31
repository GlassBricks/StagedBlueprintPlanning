// Copyright (c) 2024 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { LuaPlayer } from "factorio:runtime"
import expect from "tstl-expect"
import { Pos } from "../../lib/geometry"
import { UserProject } from "../../project/ProjectDef"
import { createUserProject } from "../../project/UserProject"
import { createOldPipelineProjectOps, TestProjectOps } from "./integration-test-util"

describe("Tiles integration tests", () => {
  let project: UserProject
  let player: LuaPlayer
  let projectOps: TestProjectOps

  before_each(() => {
    project = createUserProject("Test", 6)
    project.stagedTilesEnabled.set(true)
    player = game.players[1]
    projectOps = createOldPipelineProjectOps(project)
  })

  after_each(() => {
    project?.delete()
  })

  test("place tile, modify at later stage, mine at that stage", () => {
    const pos = Pos(5, 5)

    const stage2 = project.getSurface(2)!
    stage2.set_tiles([{ name: "concrete", position: pos }], nil, nil, nil, true)

    const tile = project.content.tiles.get(5, 5)!
    expect(tile.getTileAtStage(2)).toBe("concrete")
    expect(tile.getTileAtStage(3)).toBe("concrete")

    const stage4 = project.getSurface(4)!
    stage4.set_tiles([{ name: "stone-path", position: pos }], nil, nil, nil, true)

    expect(tile.getTileAtStage(2)).toBe("concrete")
    expect(tile.getTileAtStage(4)).toBe("stone-path")

    player.teleport(pos, stage4)
    player.mine_tile(stage4.get_tile(5, 5))

    expect(tile.getTileAtStage(2)).toBe("concrete")
    expect(tile.getTileAtStage(4)).toBeNil()
    expect(stage4.get_tile(5, 5).name).not.toBe("stone-path")
    expect(stage4.get_tile(5, 5).name).not.toBe("concrete")
  })

  test("mining at first stage with later values sets nil", () => {
    const pos = Pos(10, 10)

    const stage1 = project.getSurface(1)!
    stage1.set_tiles([{ name: "concrete", position: pos }], nil, nil, nil, true)

    const stage3 = project.getSurface(3)!
    stage3.set_tiles([{ name: "stone-path", position: pos }], nil, nil, nil, true)

    const tile = project.content.tiles.get(10, 10)!

    player.teleport(pos, stage1)
    player.mine_tile(stage1.get_tile(10, 10))

    expect(tile.getTileAtStage(1)).toBeNil()
    expect(tile.getTileAtStage(2)).toBeNil()
    expect(tile.getTileAtStage(3)).toBe("stone-path")
    expect(project.content.tiles.get(10, 10)).toBe(tile)
  })

  test("mining all entries deletes tile", () => {
    const pos = Pos(15, 15)

    const stage2 = project.getSurface(2)!
    stage2.set_tiles([{ name: "concrete", position: pos }], nil, nil, nil, true)

    player.teleport(pos, stage2)
    player.mine_tile(stage2.get_tile(15, 15))

    expect(project.content.tiles.get(15, 15)).toBeNil()
  })

  test("building over nil entry works", () => {
    const pos = Pos(20, 20)

    const stage2 = project.getSurface(2)!
    stage2.set_tiles([{ name: "concrete", position: pos }], nil, nil, nil, true)

    player.teleport(pos, stage2)
    player.mine_tile(stage2.get_tile(20, 20))

    const stage3 = project.getSurface(3)!
    stage3.set_tiles([{ name: "stone-path", position: pos }], nil, nil, nil, true)

    const tile = project.content.tiles.get(20, 20)!
    expect(tile.getTileAtStage(2)).toBeNil()
    expect(tile.getTileAtStage(3)).toBe("stone-path")
  })

  test("tile change stops propagating when entity blocks it", () => {
    const pos = Pos(25, 25)

    projectOps.setTileAtStage(pos, 1, "concrete")

    const tile = project.content.tiles.get(25, 25)!
    expect(tile.getTileAtStage(1)).toBe("concrete")
    expect(tile.getTileAtStage(3)).toBe("concrete")

    const stage1 = project.getSurface(1)!
    const stage3 = project.getSurface(3)!

    expect(stage1.get_tile(pos).name).toBe("concrete")
    expect(stage3.get_tile(pos).name).toBe("concrete")

    stage3.create_entity({
      name: "iron-chest",
      position: { x: pos.x + 0.5, y: pos.y + 0.5 },
    })

    projectOps.setTileAtStage(pos, 1, "water")

    expect(tile.getTileAtStage(1)).toBe("water")
    expect(tile.getTileAtStage(2)).toBe("water")
    expect(tile.getTileAtStage(3)).toBe("concrete")
    expect(tile.getTileAtStage(4)).toBe("concrete")

    expect(stage1.get_tile(pos).name).toBe("water")
    expect(stage3.get_tile(pos).name).toBe("concrete")
  })

  test("changing tile to water at middle stage stops at entity in later stage", () => {
    const pos = Pos(30, 30)

    projectOps.setTileAtStage(pos, 1, "concrete")
    projectOps.setTileAtStage(pos, 5, "stone-path")

    const tile = project.content.tiles.get(30, 30)!
    expect(tile.getTileAtStage(1)).toBe("concrete")
    expect(tile.getTileAtStage(3)).toBe("concrete")
    expect(tile.getTileAtStage(5)).toBe("stone-path")

    const stage3 = project.getSurface(3)!
    stage3.create_entity({
      name: "iron-chest",
      position: { x: pos.x + 0.5, y: pos.y + 0.5 },
    })

    projectOps.setTileAtStage(pos, 2, "water")

    expect(tile.getTileAtStage(1)).toBe("concrete")
    expect(tile.getTileAtStage(2)).toBe("water")
    expect(tile.getTileAtStage(3)).toBe("concrete")
    expect(tile.getTileAtStage(5)).toBe("stone-path")

    const stage2 = project.getSurface(2)!
    expect(stage2.get_tile(pos).name).toBe("water")
    expect(stage3.get_tile(pos).name).toBe("concrete")
  })
})
