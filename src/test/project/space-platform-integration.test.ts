// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { LuaEntity, LuaPlayer, LuaSurface, TilePosition } from "factorio:runtime"
import expect from "tstl-expect"
import { ProjectEntity, StageNumber } from "../../entity/ProjectEntity"
import { assert } from "../../lib"
import { BBox } from "../../lib/geometry"
import { UserProject } from "../../project/ProjectDef"
import { SpacePlatformSettings } from "../../project/surfaces"
import { _deleteAllProjects, createUserProject } from "../../project/UserProject"
import { assertEntityCorrect } from "./entity-integration-test-util"

let project: UserProject
let surfaces: LuaSurface[]
let player: LuaPlayer

function cleanup() {
  player?.cursor_stack?.clear()
  surfaces?.forEach((surface) => surface.find_entities().forEach((e) => e.destroy()))
  _deleteAllProjects()
}
before_each(cleanup)

before_each(() => {
  const settings: SpacePlatformSettings = {
    type: "spacePlatform",
    starterPack: { name: "space-platform-starter-pack", quality: "normal" },
    initialPlanet: "nauvis",
  }
  project = createUserProject("test", 3, settings)
  surfaces = project.getAllStages().map((stage) => stage.surface)
  player = game.players[1]
})

function getHub(stageNumber: StageNumber): [LuaEntity, ProjectEntity] {
  const stage = project.getStage(stageNumber)
  assert(stage, "Invalid stage number")
  const hubEntity = stage.surface.find_entities_filtered({ name: "space-platform-hub" })[0]
  assert(hubEntity, "Could not find hub entity")
  const hubProjectEntity = project.content.findCompatibleWithLuaEntity(hubEntity, nil, stageNumber)
  assert(hubProjectEntity, "Could not find hub project entity")
  return [hubEntity, hubProjectEntity]
}

describe("space platform hub", () => {
  test("hub automatically added to all stages when creating space platform project", () => {
    expect(project.isSpacePlatform()).toBe(true)
    const [, hubEntity] = getHub(1)

    expect(hubEntity.isPersistent()).toBe(true)
    expect(hubEntity.firstStage).toBe(1)
    expect(hubEntity.lastStage).toBeNil()

    for (const stage of $range(1, project.numStages())) {
      const worldEntity = hubEntity.getWorldEntity(stage)
      expect(worldEntity).toBeAny()
      expect(worldEntity!.name).toBe("space-platform-hub")
      expect(worldEntity!.position).toEqual(hubEntity.position)
    }

    assertEntityCorrect(project, hubEntity, false)
  })

  test("hub stays at stage 1 when inserting stage at front", () => {
    const [, hubEntity] = getHub(1)
    project.insertStage(1)

    const [stage1Entity, newHubEntity] = getHub(1)
    expect(newHubEntity).toBe(hubEntity)

    expect(hubEntity.firstStage).toBe(1)
    expect(hubEntity.lastStage).toBe(nil)

    expect(stage1Entity.name).toBe("space-platform-hub")
    assertEntityCorrect(project, hubEntity, false)
  })
})

describe.only("space platform tiles", () => {
  test("default tiles added when project created", () => {
    expect(project.stagedTilesEnabled.get()).toBe(true)

    const tiles = surfaces[0].find_tiles_filtered({ name: "space-platform-foundation" })
    expect(tiles.length).toBeGreaterThan(0)

    const missingPositions: TilePosition[] = []
    for (const { position } of tiles) {
      const projectTile = project.content.tiles.get(position.x, position.y)
      if (!projectTile) {
        missingPositions.push(position)
      } else {
        expect(projectTile.getTileAtStage(1)).toEqual("space-platform-foundation")
      }
    }

    expect(missingPositions).toEqual([])
  })

  test("default tiles removed when new stage added without them", () => {
    const surface = surfaces[0]
    const initialTiles = surface.find_tiles_filtered({ name: "space-platform-foundation" })
    expect(initialTiles.length).toBeGreaterThan(0)

    const positionsToRemove: TilePosition[] = []
    for (const [x, row] of pairs(project.content.tiles.asRecord())) {
      for (const [y] of pairs(row)) {
        const tileHasHub = surface.find_entities(BBox.around({ x, y }, 0.1)).length > 0
        if (!tileHasHub) {
          positionsToRemove.push({ x, y })
        }
      }
    }
    for (const position of positionsToRemove) {
      project.updates.deleteTile(position)
    }

    const newStage = project.insertStage(project.numStages())
    const newSurface = newStage.surface
    const newSurfaceTiles = newSurface.find_tiles_filtered({ name: "space-platform-foundation" })

    const incorrectPositions: TilePosition[] = []
    for (const { position } of newSurfaceTiles) {
      const projectTile = project.content.tiles.get(position.x, position.y)
      if (!projectTile) {
        incorrectPositions.push(position)
      }
    }
    expect(incorrectPositions).toEqual([])
  })
})
