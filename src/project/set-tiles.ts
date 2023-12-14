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

import { BoundingBox, LuaSurface, TileWrite } from "factorio:runtime"
import { Mutable } from "../lib"
import { BBox } from "../lib/geometry"
import { Stage } from "./ProjectDef"

function getTiles(area: BoundingBox, tile: string): [Mutable<TileWrite>[], number] {
  const tiles: TileWrite[] = []
  let i = 0
  for (const [x, y] of BBox.roundTile(area).iterateTiles()) {
    i++
    tiles[i - 1] = {
      name: tile,
      position: { x, y },
    }
  }
  return [tiles, i]
}

export function setTiles(surface: LuaSurface, area: BoundingBox, tile: string): boolean {
  if (!(tile in game.tile_prototypes)) return false
  const [tiles] = getTiles(area, tile)
  surface.set_tiles(tiles, true, "abort_on_collision")
  return true
}

export function setTilesAndWater(surface: LuaSurface, area: BoundingBox, tile: string): boolean {
  if (!("water" in game.tile_prototypes && tile in game.tile_prototypes)) return false
  const [tiles, count] = getTiles(area, tile)
  surface.set_tiles(tiles, true, "abort_on_collision")

  for (const k of $range(1, count)) tiles[k - 1].name = "water"

  surface.set_tiles(tiles, true, "abort_on_collision")
  return true
}

export function setTilesAndCheckerboard(surface: LuaSurface, area: BoundingBox, tile: string): boolean {
  if (!setTilesAndWater(surface, area, tile)) return false
  const nonWaterTiles = surface.find_tiles_filtered({
    area: BBox.expand(area, 1),
    name: tile,
  })
  const tiles = nonWaterTiles.map((luaTile) => ({
    name: tile,
    position: luaTile.position,
  }))
  surface.build_checkerboard(area)
  surface.set_tiles(tiles, true, "abort_on_collision")
  return true
}

export function setTilesForStage(stage: Stage): boolean {
  const tile = stage.project.landfillTile.get()
  return tile != nil && setTiles(stage.surface, stage.getBlueprintBBox(), tile)
}

export function setTilesAndWaterForStage(stage: Stage): boolean {
  const tile = stage.project.landfillTile.get()
  return tile != nil && setTilesAndWater(stage.surface, stage.getBlueprintBBox(), tile)
}

export function setTilesAndCheckerboardForStage(stage: Stage): boolean {
  const tile = stage.project.landfillTile.get()
  return tile != nil && setTilesAndCheckerboard(stage.surface, stage.getBlueprintBBox(), tile)
}

export function setCheckerboard(surface: LuaSurface, area: BoundingBox): void {
  surface.build_checkerboard(area)
}

export const _mockable = true
