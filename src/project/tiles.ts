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
import { Settings } from "../constants"

function autoLandfill(surface: LuaSurface, area: BoundingBox): boolean {
  if (!waterLandfillTilesExist()) return false
  const tiles: Mutable<TileWrite>[] = []
  let i = 1
  const tileName = settings.global[Settings.LandfillTile].value as string
  for (const [x, y] of BBox.roundTile(area).iterateTiles()) {
    tiles[i - 1] = {
      name: tileName,
      position: { x, y },
    }
    i++
  }
  surface.set_tiles(tiles, true, "abort_on_collision")

  for (const k of $range(1, i - 1)) tiles[k - 1].name = "water"

  surface.set_tiles(tiles, true, "abort_on_collision")
  return true
}

function autoSetLandfillAndLabTiles(surface: LuaSurface, area: BoundingBox): boolean {
  if (!autoLandfill(surface, area)) return false
  const tileName = settings.global[Settings.LandfillTile].value as string
  const landfillTiles = surface.find_tiles_filtered({
    area,
    name: tileName,
  })
  const tiles = landfillTiles.map((tile) => ({
    name: tileName,
    position: tile.position,
  }))
  surface.build_checkerboard(area)
  surface.set_tiles(tiles, true, "abort_on_collision")
  return true
}

function setLabTiles(surface: LuaSurface, area: BoundingBox): void {
  surface.build_checkerboard(area)
}

function waterLandfillTilesExist(): boolean {
  return game.tile_prototypes.water != nil && game.tile_prototypes.landfill != nil
}

export const enum AutoSetTilesType {
  LabTiles,
  LandfillAndWater,
  LandfillAndLabTiles,
}
export function setTiles(surface: LuaSurface, area: BBox, type: AutoSetTilesType): boolean {
  if (type == AutoSetTilesType.LabTiles) {
    setLabTiles(surface, area)
    return true
  }
  if (type == AutoSetTilesType.LandfillAndWater) {
    return autoLandfill(surface, area)
  }
  if (type == AutoSetTilesType.LandfillAndLabTiles) {
    return autoSetLandfillAndLabTiles(surface, area)
  }
  error("Invalid AutoSetTilesType")
}
