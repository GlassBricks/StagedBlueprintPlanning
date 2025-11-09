// Copyright (c) 2024 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { LuaPlayer } from "factorio:runtime"
import expect from "tstl-expect"
import { Pos } from "../../lib/geometry"
import { UserProject } from "../../project/ProjectDef"
import { createUserProject } from "../../project/UserProject"

describe("Tiles integration tests", () => {
  let project: UserProject
  let player: LuaPlayer

  before_each(() => {
    project = createUserProject("Test", 6)
    project.stagedTilesEnabled.set(true)
    player = game.players[1]
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
})
