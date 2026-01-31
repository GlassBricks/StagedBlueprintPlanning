// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { LuaEntity, TilePosition } from "factorio:runtime"
import expect from "tstl-expect"
import { ProjectEntity, StageNumber } from "../../entity/ProjectEntity"
import { assert } from "../../lib"
import { BBox } from "../../lib/geometry"
import { UserProject } from "../../project/ProjectDef"
import { SpacePlatformSettings } from "../../project/surfaces"
import { _deleteAllProjects, createUserProject } from "../../project/UserProject"
import { assertEntityCorrect, createOldPipelineProjectOps } from "./integration-test-util"
import { createWorldPresentationQueries } from "./test-world-queries"

before_each(() => {
  _deleteAllProjects()
})

function getHub(project: UserProject, stageNumber: StageNumber): [LuaEntity, ProjectEntity] {
  const stage = project.getStage(stageNumber)
  assert(stage, "Invalid stage number")
  const hubEntity = stage.getSurface().find_entities_filtered({ name: "space-platform-hub" })[0]
  assert(hubEntity, "Could not find hub entity")
  const hubProjectEntity = project.content.findCompatibleWithLuaEntity(hubEntity, nil, stageNumber)
  assert(hubProjectEntity, "Could not find hub project entity")
  return [hubEntity, hubProjectEntity]
}

function createSpacePlatformProject(quality: string = "normal"): UserProject {
  const settings: SpacePlatformSettings = {
    type: "spacePlatform",
    starterPack: { name: "space-platform-starter-pack", quality },
    initialPlanet: "nauvis",
  }
  return createUserProject("test", 3, settings)
}

describe("space platform hub", () => {
  before_each(() => {})
  test.each(["normal", "legendary"])(
    "hub automatically added to all stages when creating space platform project, with quality %s",
    (quality) => {
      const project = createSpacePlatformProject(quality)
      expect(project.settings.isSpacePlatform()).toBe(true)
      const [, hubEntity] = getHub(project, 1)

      expect(hubEntity.isPersistent()).toBe(true)
      expect(hubEntity.firstStage).toBe(1)
      expect(hubEntity.lastStage).toBeNil()

      const wq = createWorldPresentationQueries(project.worldPresentation)
      for (const stage of $range(1, project.settings.stageCount())) {
        const worldEntity = wq.getWorldEntity(hubEntity, stage)
        expect(worldEntity).toBeAny()
        expect(worldEntity!.name).toBe("space-platform-hub")
        expect(worldEntity!.position).toEqual(hubEntity.position)
        expect(worldEntity!.quality.name).toEqual(quality)
      }

      assertEntityCorrect(project, hubEntity, false, wq)
    },
  )

  test.each([1, 2])("hub correct when inserting stage at %s", (stage) => {
    const project = createSpacePlatformProject()
    const [, projectEntity] = getHub(project, 1)

    project.insertStage(stage)

    const [newWorldEntity, newProjectEntity] = getHub(project, stage)
    expect(newProjectEntity).toBe(projectEntity)

    expect(projectEntity.firstStage).toBe(1)
    expect(projectEntity.lastStage).toBe(nil)

    expect(newWorldEntity.name).toBe("space-platform-hub")
    assertEntityCorrect(project, projectEntity, false, createWorldPresentationQueries(project.worldPresentation))
  })
})

describe("space platform tiles", () => {
  test("default tiles added when project created", () => {
    const project = createSpacePlatformProject()
    expect(project.settings.stagedTilesEnabled.get()).toBe(true)

    const tiles = project.getStage(1)!.getSurface().find_tiles_filtered({ name: "space-platform-foundation" })
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
    const project = createSpacePlatformProject()
    const surface = project.getStage(1)!.getSurface()
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
    const projectOps = createOldPipelineProjectOps(project)
    for (const position of positionsToRemove) {
      projectOps.deleteTile(position)
    }

    const newStage = project.insertStage(project.settings.stageCount())
    const newSurface = newStage.getSurface()
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
