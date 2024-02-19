/*
 * Copyright (c) 2022-2023 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { LuaSurface, MapGenSettingsWrite } from "factorio:runtime"
import { BBox } from "../lib/geometry"

const defaultPreparedArea = BBox.around({ x: 0, y: 0 }, script.active_mods["factorio-test"] != nil ? 32 : 5 * 32)

export function copyMapGenSettings(fromSurface: LuaSurface, toSurface: LuaSurface): void {
  toSurface.map_gen_settings = fromSurface.map_gen_settings
  toSurface.generate_with_lab_tiles = fromSurface.generate_with_lab_tiles
}

function prepareSurface(surface: LuaSurface, area: BBox, copySettingsFrom: LuaSurface | nil): void {
  if (!copySettingsFrom) {
    surface.generate_with_lab_tiles = true
  } else {
    copyMapGenSettings(copySettingsFrom, surface)
  }
  surface.always_day = true
  surface.show_clouds = false

  const newName = "bp100-stage-" + surface.index
  if (surface.name != newName) surface.name = newName

  prepareArea(surface, area)
}
function createNewStageSurface(area: BBox = defaultPreparedArea, copySettingsFrom: LuaSurface | nil): LuaSurface {
  const surface = game.create_surface("bp100-stage-temp", {
    width: 10000,
    height: 10000,
  } as MapGenSettingsWrite)
  prepareSurface(surface, area, copySettingsFrom)
  return surface
}

export function prepareArea(surface: LuaSurface, area: BBox): void {
  const { is_chunk_generated, set_chunk_generated_status } = surface
  const status = defines.chunk_generated_status.entities
  const pos = { x: 0, y: 0 }
  const chunkArea = BBox.scale(area, 1 / 32).roundTile()
  if (surface.generate_with_lab_tiles) {
    for (const [x, y] of chunkArea.iterateTiles()) {
      pos.x = x
      pos.y = y
      if (!is_chunk_generated(pos)) {
        set_chunk_generated_status(pos, status)
      }
    }
    const actualArea = chunkArea.scale(32)
    surface.build_checkerboard(actualArea)
  } else {
    surface.request_to_generate_chunks([0, 0], BBox.size(chunkArea).x / 32)
  }
}

declare const global: {
  freeSurfaces?: LuaSurface[]
}

/** @noSelf */
interface SurfaceCreator {
  createSurface(preparedArea?: BBox, copySettingsFrom?: LuaSurface): LuaSurface
  destroySurface(surface: LuaSurface): void
}

let surfaceCreator: SurfaceCreator
if (!script.active_mods["factorio-test"]) {
  surfaceCreator = {
    createSurface: createNewStageSurface,
    destroySurface: (surface) => game.delete_surface(surface),
  }
} else {
  surfaceCreator = {
    createSurface: (area = defaultPreparedArea, copySettingsFrom) => {
      if (!global.freeSurfaces) {
        global.freeSurfaces = []
      }
      while (global.freeSurfaces.length > 0) {
        const surface = global.freeSurfaces.pop()!
        if (surface.valid) {
          surface.destroy_decoratives({})
          prepareSurface(surface, area, copySettingsFrom)
          return surface
        }
      }
      return createNewStageSurface(area, copySettingsFrom)
    },
    destroySurface: (surface) => {
      if (!surface.valid) return
      surface.find_entities().forEach((entity) => entity.destroy())
      if (!global.freeSurfaces) {
        global.freeSurfaces = []
      }
      global.freeSurfaces.push(surface)
      for (const id of rendering.get_all_ids(script.mod_name)) {
        if (rendering.get_surface(id) == surface) rendering.destroy(id)
      }
    },
  }
}

export function deleteAllFreeSurfaces(): void {
  if (global.freeSurfaces) {
    for (const surface of global.freeSurfaces) {
      if (surface.valid) game.delete_surface(surface)
    }
    delete global.freeSurfaces
  }
}

export const createStageSurface = surfaceCreator.createSurface
export const destroySurface = surfaceCreator.destroySurface
