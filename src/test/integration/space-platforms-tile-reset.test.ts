// Copyright (c) 2025 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { TileWrite } from "factorio:runtime"
import expect from "tstl-expect"
import { Mutable } from "../../lib"
import { BBox, Position } from "../../lib/geometry"
import { Project } from "../../project/Project"
import { SpacePlatformSettings } from "../../project/surfaces"
import { _deleteAllProjects, createProject } from "../../project/Project"
import { resetSpacePlatformTiles } from "../../tiles/set-tiles"

before_each(() => {
  _deleteAllProjects()
})

function createSpacePlatformProject(quality: string = "normal"): Project {
  const settings: SpacePlatformSettings = {
    type: "spacePlatform",
    starterPack: { name: "space-platform-starter-pack", quality },
    initialPlanet: "nauvis",
  }
  return createProject("test", 2, settings)
}

describe("space platform foundation reset", () => {
  test("resets platform with scattered entities - full integration", () => {
    const project = createSpacePlatformProject()
    project.settings.stagedTilesEnabled.set(true)
    const stage = project.getStage(1)!
    const surface = stage.getSurface()
    const bbox = stage.getBlueprintBBox()

    surface.create_entity({ name: "assembling-machine-1", position: { x: 5, y: 5 }, force: "player" })

    surface.create_entity({ name: "assembling-machine-1", position: { x: 15, y: 5 }, force: "player" })

    surface.create_entity({ name: "assembling-machine-1", position: { x: 5, y: 15 }, force: "player" })

    surface.create_entity({ name: "assembling-machine-1", position: { x: 15, y: 15 }, force: "player" })

    const tileName = project.settings.landfillTile.get()!

    const allTiles: Mutable<TileWrite>[] = []
    for (const [x, y] of BBox.iterateTiles(BBox.load(bbox))) {
      allTiles.push({
        name: tileName,
        position: { x, y },
      })
    }
    surface.set_tiles(allTiles, true)

    const initialCount = surface.count_tiles_filtered({
      area: bbox,
      name: tileName,
    })

    resetSpacePlatformTiles(stage)

    const finalCount = surface.count_tiles_filtered({
      area: bbox,
      name: tileName,
    })

    expect(finalCount).toBeLessThan(initialCount)
    expect(finalCount).toBeGreaterThan(0)

    const entities = surface.find_entities_filtered({ area: bbox })
    for (const entity of entities) {
      const tile = surface.get_tile(entity.position.x, entity.position.y)
      expect(tile.name).toBe(tileName)
    }

    const platformTiles = surface.find_tiles_filtered({
      area: bbox,
      name: tileName,
    })
    for (const tile of platformTiles) {
      const projectTile = project.content.tiles.get(tile.position.x, tile.position.y)
      expect(projectTile).toBeAny()
      expect(projectTile!.getTileAtStage(stage.stageNumber)).toBe(tileName)
    }

    const platformPositions = new LuaSet<string>()
    for (const tile of platformTiles) {
      platformPositions.add(`${tile.position.x},${tile.position.y}`)
    }

    const firstTile = platformTiles[0]
    if (!firstTile) return

    const visited = new LuaSet<string>()
    const queue: Position[] = [firstTile.position]
    visited.add(`${firstTile.position.x},${firstTile.position.y}`)

    while (queue.length > 0) {
      const pos = queue.shift()!

      for (const dx of [-1, 0, 1]) {
        for (const dy of [-1, 0, 1]) {
          if (dx == 0 && dy == 0) continue
          const nx = pos.x + dx
          const ny = pos.y + dy
          const nkey = `${nx},${ny}`

          if (platformPositions.has(nkey) && !visited.has(nkey)) {
            visited.add(nkey)
            queue.push({ x: nx, y: ny })
          }
        }
      }
    }

    expect(table_size(visited)).toBe(table_size(platformPositions))
  })
})
