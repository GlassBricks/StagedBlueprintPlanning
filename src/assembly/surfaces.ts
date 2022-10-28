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

import { BBox } from "../lib/geometry"

export function createStageSurface(): LuaSurface {
  const result = game.create_surface("bp100-stage-temp", {
    width: 10000,
    height: 10000,
  } as MapGenSettingsWrite)
  result.generate_with_lab_tiles = true
  result.always_day = true
  result.show_clouds = false
  result.name = "bp100-stage-" + result.index
  return result
}

export function prepareArea(surface: LuaSurface, area: BBox): void {
  const { is_chunk_generated, set_chunk_generated_status } = surface
  const status = defines.chunk_generated_status.entities
  const pos = { x: 0, y: 0 }
  const chunkArea = BBox.scale(area, 1 / 32).roundTile()
  for (const [x, y] of chunkArea.iterateTiles()) {
    pos.x = x
    pos.y = y
    if (!is_chunk_generated(pos)) {
      set_chunk_generated_status(pos, status)
    }
  }
  const actualArea = chunkArea.scale(32)
  surface.build_checkerboard(actualArea)
}
