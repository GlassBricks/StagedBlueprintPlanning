// Copyright (c) 2022-2025 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { LuaSurface, MapGenSettings, MapGenSettingsWrite, nil, SurfaceIndex } from "factorio:runtime"
import { BBox } from "../lib/geometry"
import { Stage, UserProject } from "./ProjectDef"
import { withTileEventsDisabled } from "./tile-events"

export interface SurfaceSettings {
  readonly map_gen_settings: MapGenSettings
  readonly planet: string | nil
  readonly generate_with_lab_tiles: boolean
  readonly ignore_surface_conditions: boolean
  readonly has_global_electric_network: boolean
}

export function getDefaultSurfaceSettings(): SurfaceSettings {
  return {
    map_gen_settings: game.default_map_gen_settings,
    planet: nil,
    generate_with_lab_tiles: true,
    ignore_surface_conditions: true,
    has_global_electric_network: false,
  }
}

export function applySurfaceSettings(settings: SurfaceSettings, surface: LuaSurface): void {
  surface.generate_with_lab_tiles = settings.generate_with_lab_tiles

  if (!settings.generate_with_lab_tiles) {
    surface.map_gen_settings = settings.map_gen_settings
  }

  surface.ignore_surface_conditions = settings.ignore_surface_conditions

  if (settings.has_global_electric_network != surface.has_global_electric_network) {
    if (settings.has_global_electric_network) {
      surface.create_global_electric_network()
    } else {
      surface.destroy_global_electric_network()
    }
  }

  const planetProto = settings.planet != nil ? prototypes.space_location[settings.planet] : nil
  if (planetProto?.surface_properties != nil) {
    for (const [propertyName, value] of pairs(planetProto.surface_properties)) {
      surface.set_property(propertyName, value)
    }
  } else {
    const nauvis = game.surfaces[1]
    for (const [propertyName] of prototypes.surface_property) {
      surface.set_property(propertyName, nauvis.get_property(propertyName))
    }
  }
}

export function readSurfaceSettings(surface: LuaSurface): Partial<SurfaceSettings> {
  return {
    map_gen_settings: surface.generate_with_lab_tiles ? nil : surface.map_gen_settings,
    generate_with_lab_tiles: surface.generate_with_lab_tiles,
    ignore_surface_conditions: surface.ignore_surface_conditions,
    has_global_electric_network: surface.has_global_electric_network,
  }
}

export function syncMapGenSettings(stage: Stage): void {
  const project = stage.project
  const settings = readSurfaceSettings(stage.surface)

  project.surfaceSettings = { ...project.surfaceSettings, ...settings }
  applySurfaceSettingsAndClear(project)
}

export function applySurfaceSettingsAndClear(project: UserProject): void {
  for (const stage of project.getAllStages()) {
    applySurfaceSettings(project.surfaceSettings, stage.surface)
  }
  for (const stage of project.getAllStages()) {
    stage.surface.clear()
  }
}

const inTest = script.active_mods["factorio-test"] != nil
const defaultPreparedArea = BBox.around({ x: 0, y: 0 }, inTest ? 32 : 5 * 32)

function sanitizeForSurfaceName(str: string): string {
  let result = string.gsub(str, "[^%w]+", "-")[0]
  result = string.gsub(result, "^-+", "")[0]
  result = string.gsub(result, "-+$", "")[0]
  return result
}

function generateStageSurfaceName(surfaceIndex: SurfaceIndex, projectName: string, stageName: string): string {
  const sanitizedProject = sanitizeForSurfaceName(projectName)
  const sanitizedStage = sanitizeForSurfaceName(stageName)

  return `bp100-${surfaceIndex}-${sanitizedProject}-${sanitizedStage}`
}

function tryRenameSurface(surface: LuaSurface, newName: string): void {
  if (surface.name == newName) return

  const [success] = pcall(() => {
    surface.name = newName
  })

  if (!success) {
    print(
      `[Staged Blueprint Planning] Warning: Could not rename surface ${surface.name} to ${newName} (name collision)`,
    )
  }
}

export function updateStageSurfaceName(surface: LuaSurface, projectName: string, stageName: string): void {
  const newName = generateStageSurfaceName(surface.index, projectName, stageName)
  tryRenameSurface(surface, newName)
}

function prepareSurface(
  surface: LuaSurface,
  area: BBox,
  projectSettings: SurfaceSettings | nil,
  projectName: string,
  stageName: string,
): void {
  if (projectSettings == nil) {
    projectSettings = getDefaultSurfaceSettings()
  }
  applySurfaceSettings(projectSettings, surface)

  surface.always_day = true
  surface.show_clouds = false

  const newName = generateStageSurfaceName(surface.index, projectName, stageName)
  tryRenameSurface(surface, newName)

  prepareArea(surface, area)
}

function createNewStageSurface(
  area: BBox = defaultPreparedArea,
  projectSettings: SurfaceSettings | nil,
  projectName: string,
  stageName: string,
): LuaSurface {
  const size = inTest ? 32 * 2 : 10000
  const surface = game.create_surface("bp100-stage-temp", {
    width: size,
    height: size,
  } as MapGenSettingsWrite)
  prepareSurface(surface, area, projectSettings, projectName, stageName)
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
  createSurface(
    preparedArea?: BBox,
    projectSettings?: SurfaceSettings,
    projectName?: string,
    stageName?: string,
  ): LuaSurface
  destroySurface(surface: LuaSurface): void
}

let surfaceCreator: SurfaceCreator
if (!inTest) {
  surfaceCreator = {
    createSurface: (area = defaultPreparedArea, projectSettings, projectName = "", stageName = "") =>
      createNewStageSurface(area, projectSettings, projectName, stageName),
    destroySurface: (surface) => game.delete_surface(surface),
  }
} else {
  surfaceCreator = {
    createSurface: (area = defaultPreparedArea, projectSettings, projectName = "", stageName = "") => {
      if (!storage.freeSurfaces) {
        storage.freeSurfaces = []
      }
      while (storage.freeSurfaces.length > 0) {
        const surface = storage.freeSurfaces.pop()!
        if (surface.valid) {
          surface.destroy_decoratives({})
          for (const entity of surface.find_entities()) entity.destroy()
          prepareSurface(surface, area, projectSettings, projectName, stageName)
          return surface
        }
      }
      return createNewStageSurface(area, projectSettings, projectName, stageName)
    },
    destroySurface: (surface) => {
      if (!surface.valid) return
      surface.find_entities().forEach((entity) => entity.destroy())
      if (!storage.freeSurfaces) {
        storage.freeSurfaces = []
      }
      surface.name = `bp100-${surface.index}-free`
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
