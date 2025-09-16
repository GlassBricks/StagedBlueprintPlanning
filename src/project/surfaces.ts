// Copyright (c) 2022-2025 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { LuaSurface, MapGenSettingsWrite } from "factorio:runtime"
import { BBox } from "../lib/geometry"
import { withTileEventsDisabled } from "./tile-events"

const inTest = script.active_mods["factorio-test"] != nil
const defaultPreparedArea = BBox.around({ x: 0, y: 0 }, inTest ? 32 : 5 * 32)

export function copyMapGenSettings(fromSurface: LuaSurface, toSurface: LuaSurface): void {
  if (fromSurface == toSurface) return
  const generateWithLabTiles = fromSurface.generate_with_lab_tiles
  toSurface.generate_with_lab_tiles = generateWithLabTiles
  toSurface.ignore_surface_conditions = fromSurface.ignore_surface_conditions
  if (!generateWithLabTiles) toSurface.map_gen_settings = fromSurface.map_gen_settings
  if (fromSurface.has_global_electric_network != toSurface.has_global_electric_network) {
    if (fromSurface.has_global_electric_network) toSurface.create_global_electric_network()
    else toSurface.destroy_global_electric_network()
  }
}

function prepareSurface(surface: LuaSurface, area: BBox, copySettingsFrom: LuaSurface | nil): void {
  if (!copySettingsFrom) {
    surface.generate_with_lab_tiles = true
  } else {
    copyMapGenSettings(copySettingsFrom, surface)
  }
  surface.always_day = true
  surface.show_clouds = false
  surface.ignore_surface_conditions = true

  const newName = "bp100-stage-" + surface.index
  if (surface.name != newName) surface.name = newName

  prepareArea(surface, area)
}
function createNewStageSurface(area: BBox = defaultPreparedArea, copySettingsFrom: LuaSurface | nil): LuaSurface {
  const size = inTest ? 32 * 2 : 10000
  const surface = game.create_surface("bp100-stage-temp", {
    width: size,
    height: size,
  } as MapGenSettingsWrite)
  prepareSurface(surface, area, copySettingsFrom)
  return surface
}

export function prepareArea(surface: LuaSurface, area: BBox): void {
  const { is_chunk_generated, set_chunk_generated_status, request_to_generate_chunks } = surface
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
    withTileEventsDisabled(surface.build_checkerboard, actualArea)
  } else {
    for (const [x, y] of chunkArea.iterateTiles()) {
      pos.x = x * 32
      pos.y = y * 32
      request_to_generate_chunks(pos)
    }
  }
}

declare const storage: {
  freeSurfaces?: LuaSurface[]
}

/** @noSelf */
interface SurfaceCreator {
  createSurface(preparedArea?: BBox, copySettingsFrom?: LuaSurface): LuaSurface
  destroySurface(surface: LuaSurface): void
}

let surfaceCreator: SurfaceCreator
if (!inTest) {
  surfaceCreator = {
    createSurface: createNewStageSurface,
    destroySurface: (surface) => game.delete_surface(surface),
  }
} else {
  surfaceCreator = {
    createSurface: (area = defaultPreparedArea, copySettingsFrom) => {
      if (!storage.freeSurfaces) {
        storage.freeSurfaces = []
      }
      while (storage.freeSurfaces.length > 0) {
        const surface = storage.freeSurfaces.pop()!
        if (surface.valid) {
          surface.destroy_decoratives({})
          for (const entity of surface.find_entities()) entity.destroy()
          prepareSurface(surface, area, copySettingsFrom)
          return surface
        }
      }
      return createNewStageSurface(area, copySettingsFrom)
    },
    destroySurface: (surface) => {
      if (!surface.valid) return
      surface.find_entities().forEach((entity) => entity.destroy())
      if (!storage.freeSurfaces) {
        storage.freeSurfaces = []
      }
      storage.freeSurfaces.push(surface)
      for (const render of rendering.get_all_objects(script.mod_name)) {
        if (render.surface == surface) {
          render.destroy()
        }
      }
    },
  }
}

export function deleteAllFreeSurfaces(): void {
  if (storage.freeSurfaces) {
    for (const surface of storage.freeSurfaces) {
      if (surface.valid) game.delete_surface(surface)
    }
    delete storage.freeSurfaces
  }
}

export const createStageSurface = surfaceCreator.createSurface
export const destroySurface = surfaceCreator.destroySurface
