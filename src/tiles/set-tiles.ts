// Copyright (c) 2022 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { BoundingBox, LuaSurface, Tile, TileWrite } from "factorio:runtime"
import { newMap2d } from "../entity/map2d"
import { Mutable } from "../lib"
import { BBox } from "../lib/geometry"
import { Stage } from "../project/ProjectDef"
import { posToKey, solveSteinerErosion } from "./steiner-erosion"
import { withTileEventsDisabled } from "./tile-events"

function getTiles(area: BoundingBox, tile: string): Mutable<TileWrite>[] {
  const tiles: TileWrite[] = []
  let i = 0
  for (const [x, y] of BBox.roundTile(area).iterateTiles()) {
    i++
    tiles[i - 1] = {
      name: tile,
      position: { x, y },
    }
  }
  return tiles
}

function getTilesFilteredByUnderEntity(
  surface: LuaSurface,
  area: BoundingBox,
  resetWaterTiles: boolean,
): {
  underEntityTiles: Mutable<Tile>[]
  freeTiles: Mutable<Tile>[]
} {
  const oldTiles = surface.find_tiles_filtered({ area })
  const oldTileMap = newMap2d<string>()
  for (const {
    name,
    position: { x, y },
  } of oldTiles)
    oldTileMap.set(x, y, name)

  surface.set_tiles(getTiles(area, "water"), false, "abort_on_collision")

  const freeTiles: Mutable<Tile>[] = []
  for (const freeTile of surface.find_tiles_filtered({ area, name: "water" })) {
    const { x, y } = freeTile.position
    const oldTile = oldTileMap.get(x, y)
    oldTileMap.delete(x, y)
    freeTiles.push({
      name: oldTile ?? "water",
      position: { x, y },
    })
  }
  if (resetWaterTiles) {
    surface.set_tiles(freeTiles, true, "abort_on_collision")
  }

  const underEntityTiles: Mutable<Tile>[] = []

  for (const [x, row] of pairs(oldTileMap.asRecord())) {
    for (const [y, name] of pairs(row)) {
      underEntityTiles.push({
        name,
        position: { x, y },
      })
    }
  }
  return { underEntityTiles, freeTiles }
}

export function setTiles(surface: LuaSurface, area: BoundingBox, tile: string): boolean {
  if (!(tile in prototypes.tile)) return false
  const tiles = getTiles(area, tile)
  surface.set_tiles(tiles, true, "abort_on_collision", true, true)
  return true
}

export function setTilesAndWater(
  surface: LuaSurface,
  area: BoundingBox,
  tileName: string,
): LuaMultiReturn<[boolean, freeTiles?: Mutable<Tile>[]]> {
  if (!("water" in prototypes.tile && tileName in prototypes.tile)) return $multi(false)
  const { underEntityTiles, freeTiles } = getTilesFilteredByUnderEntity(surface, area, false)
  for (const tile of underEntityTiles) {
    tile.name = tileName
  }
  surface.set_tiles(underEntityTiles, true, "abort_on_collision", true, true)

  return $multi(true, freeTiles)
}

export function setTilesAndCheckerboard(
  surface: LuaSurface,
  area: BoundingBox,
  tileName: string,
): LuaMultiReturn<[boolean, freeTiles?: Mutable<Tile>[]]> {
  if (!("water" in prototypes.tile && tileName in prototypes.tile)) return $multi(false)
  withTileEventsDisabled(surface.build_checkerboard, area)
  const { underEntityTiles, freeTiles } = getTilesFilteredByUnderEntity(surface, area, true)
  for (const tile of underEntityTiles) {
    tile.name = tileName
  }
  surface.set_tiles(underEntityTiles, true, "abort_on_collision", true, true)
  return $multi(true, freeTiles)
}

export function setTilesForStage(stage: Stage): boolean {
  const tile = stage.project.landfillTile.get()
  return tile != nil && setTiles(stage.surface, stage.getBlueprintBBox(), tile)
}

export function setTilesAndWaterForStage(stage: Stage): boolean {
  return setTilesUnderEntities(stage, setTilesAndWater)
}

export function setTilesAndCheckerboardForStage(stage: Stage): boolean {
  return setTilesUnderEntities(stage, setTilesAndCheckerboard)
}

// refactor of above
function setTilesUnderEntities(
  stage: Stage,
  fn: (
    surface: LuaSurface,
    area: BoundingBox,
    tileName: string,
  ) => LuaMultiReturn<[boolean, freeTiles?: Mutable<Tile>[]]>,
): boolean {
  const project = stage.project
  const tile = project.landfillTile.get()
  if (tile == nil) return false
  const [success, freeTiles] = fn(stage.surface, stage.getBlueprintBBox(), tile)
  if (!success) return false

  if (freeTiles && project.stagedTilesEnabled.get()) {
    for (const { position } of freeTiles) {
      project.updates.setTileAtStage(position, stage.stageNumber, nil)
    }
  }

  return true
}

export function setCheckerboard(surface: LuaSurface, area: BoundingBox): void {
  surface.build_checkerboard(area)
}

function applyOptimizedTiles(surface: LuaSurface, bbox: BBox, optimized: LuaSet<string>, tileName: string): void {
  const tiles: Mutable<TileWrite>[] = []

  for (const [x, y] of BBox.iterateTiles(bbox)) {
    const gridX = x - bbox.left_top.x
    const gridY = y - bbox.left_top.y
    const k = posToKey([gridX, gridY])

    tiles.push({
      position: { x, y },
      name: optimized.has(k) ? tileName : "empty-space",
    })
  }

  surface.set_tiles(tiles, true, true, true, true)
}

function syncStagedTiles(stage: Stage, bbox: BBox, optimized: LuaSet<string>, tileName: string): void {
  const project = stage.project

  for (const [x, y] of BBox.iterateTiles(bbox)) {
    const gridX = x - bbox.left_top.x
    const gridY = y - bbox.left_top.y
    const k = posToKey([gridX, gridY])

    const tileValue = optimized.has(k) ? tileName : nil
    project.updates.setTileAtStage({ x, y }, stage.stageNumber, tileValue)
  }
}

export function resetSpacePlatformTiles(stage: Stage): boolean {
  const project = stage.project
  const surface = stage.surface
  const area = stage.getBlueprintBBox()
  const bbox = BBox.load(area)

  const tileName = project.landfillTile.get()
  if (!tileName) return false

  const tiles = getTiles(area, tileName)
  surface.set_tiles(tiles, true, "abort_on_collision")

  const emptyTiles = getTiles(area, "empty-space")
  surface.set_tiles(emptyTiles, true, "abort_on_collision")

  const required = new LuaSet<string>()
  const foundationTiles = surface.find_tiles_filtered({
    area,
    name: tileName,
  })

  for (const tile of foundationTiles) {
    const pos = tile.position
    const gridX = math.floor(pos.x - bbox.left_top.x)
    const gridY = math.floor(pos.y - bbox.left_top.y)
    required.add(posToKey([gridX, gridY]))
  }

  const size = BBox.size(bbox)
  const width = size.x
  const height = size.y
  const optimized = solveSteinerErosion(width, height, required)

  withTileEventsDisabled(() => {
    applyOptimizedTiles(surface, bbox, optimized, tileName)
  })

  if (project.stagedTilesEnabled.get()) {
    syncStagedTiles(stage, bbox, optimized, tileName)
  }

  return true
}

export const _mockable = true
