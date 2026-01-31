// Copyright (c) 2022-2025 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import {
  LuaEntity,
  LuaSurface,
  MapGenSettings,
  MapGenSettingsWrite,
  nil,
  PrototypeWithQualityRead,
} from "factorio:runtime"
import { BBox } from "../lib/geometry"
import { Stage, Project } from "./Project"
import { withTileEventsDisabled } from "../tiles/tile-events"

export interface NormalSurfaceSettings {
  readonly type: "normal"
  readonly map_gen_settings: MapGenSettings
  readonly planet: string | nil
  readonly generate_with_lab_tiles: boolean
  readonly ignore_surface_conditions: boolean
  readonly has_global_electric_network: boolean
}

export interface SpacePlatformSettings {
  readonly type: "spacePlatform"
  readonly starterPack: PrototypeWithQualityRead
  readonly initialPlanet?: string
}

export type SurfaceSettings = NormalSurfaceSettings | SpacePlatformSettings

export function getDefaultSurfaceSettings(): NormalSurfaceSettings {
  return {
    type: "normal",
    map_gen_settings: game.default_map_gen_settings,
    planet: nil,
    generate_with_lab_tiles: true,
    ignore_surface_conditions: true,
    has_global_electric_network: false,
  }
}

export function applySurfaceSettings(settings: NormalSurfaceSettings, surface: LuaSurface): void {
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

export function readSurfaceSettings(surface: LuaSurface): Partial<NormalSurfaceSettings> {
  return {
    map_gen_settings: surface.generate_with_lab_tiles ? nil : surface.map_gen_settings,
    generate_with_lab_tiles: surface.generate_with_lab_tiles,
    ignore_surface_conditions: surface.ignore_surface_conditions,
    has_global_electric_network: surface.has_global_electric_network,
  }
}

export function syncMapGenSettings(stage: Stage): void {
  const project = stage.project
  if (project.settings.surfaceSettings.type != "normal") return
  const settings = readSurfaceSettings(stage.getSurface())

  project.settings.surfaceSettings = { ...project.settings.surfaceSettings, ...settings }
  applySurfaceSettingsAndClear(project)
}

export function applySurfaceSettingsAndClear(project: Project): void {
  const settings = project.settings.surfaceSettings
  if (settings.type != "normal") return
  for (const stage of project.getAllStages()) {
    applySurfaceSettings(settings, stage.getSurface())
  }
  for (const stage of project.getAllStages()) {
    stage.getSurface().clear()
  }
}

const inTest = script.active_mods["factorio-test"] != nil
const defaultPreparedArea = BBox.around({ x: 0, y: 0 }, inTest ? 32 : 5 * 32)

function orUnnamed(str: string): string {
  if (str.length == 0) return "<Unnamed>"
  return str
}

function generateStageSurfaceName(projectName: string, stageName: string): string {
  return `stage ${orUnnamed(projectName)}/${orUnnamed(stageName)}`
}

function tryRenameSurface(surface: LuaSurface, newName: string): void {
  if (surface.name == newName) return
  const surfaces = game.surfaces
  if (!surfaces[newName]) {
    surface.name = newName
    return
  }

  let attemptName = newName
  let suffix = 1

  while (true) {
    attemptName = `${newName} (${suffix})`
    if (!surfaces[attemptName]) {
      surface.name = attemptName
      return
    }
    suffix++
  }
}
export function updateStageSurfaceName(surface: LuaSurface, projectName: string, stageName: string): void {
  const newName = generateStageSurfaceName(projectName, stageName)
  tryRenameSurface(surface, newName)
}

function prepareSurface(
  surface: LuaSurface,
  area: BBox,
  settings: NormalSurfaceSettings,
  projectName: string,
  stageName: string,
): void {
  if (settings == nil) {
    settings = getDefaultSurfaceSettings()
  }

  applySurfaceSettings(settings, surface)

  surface.always_day = true
  surface.show_clouds = false

  game.forces.player.set_surface_hidden(surface, true)

  updateStageSurfaceName(surface, projectName, stageName)
  prepareArea(surface, area)
}

function createNewStageSurface(
  settings: NormalSurfaceSettings,
  projectName: string,
  stageName: string,
  area: BBox,
): LuaSurface {
  const size = inTest ? 32 * 2 : 10000
  const surface = game.create_surface("bp100-stage-temp", {
    width: size,
    height: size,
  } as MapGenSettingsWrite)
  prepareSurface(surface, area, settings, projectName, stageName)
  return surface
}

function createSpacePlatform(
  settings: SpacePlatformSettings,
  projectName: string,
  stageName: string,
): [LuaSurface, hub?: LuaEntity] {
  const starterPack = settings.starterPack
  const platform = game.forces.player.create_space_platform({
    name: projectName.length == 0 ? "Platform" : projectName,
    planet: settings.initialPlanet ?? "nauvis",
    starter_pack: starterPack,
  })!
  assert(platform, "could not create platform")
  let hub = platform.apply_starter_pack()
  const surface = platform.surface
  assert(surface, "could not create platform surface")

  if (hub && hub.quality.name != starterPack.quality) {
    hub = surface.create_entity({
      name: hub.name,
      quality: starterPack.quality,
      position: hub.position,
      force: hub.force,
      fast_replace: true,
      create_build_effect_smoke: false,
    })
  }
  if (hub) {
    hub.destructible = false
    hub.minable = false
  }
  updateStageSurfaceName(surface, projectName, stageName)
  return [surface, nil]
}

function createNewSurface(
  settings: SurfaceSettings,
  projectName: string,
  stageName: string,
  area: BBox = defaultPreparedArea,
): [LuaSurface, hub?: LuaEntity] {
  if (settings?.type == "spacePlatform") {
    return createSpacePlatform(settings, projectName, stageName)
  } else {
    return [createNewStageSurface(settings, projectName, stageName, area)]
  }
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
    projectSettings: SurfaceSettings,
    projectName: string,
    stageName: string,
    preparedArea?: BBox,
  ): [LuaSurface, hub?: LuaEntity]
  destroySurface(surface: LuaSurface): void
}

let surfaceCreator: SurfaceCreator
if (!inTest) {
  surfaceCreator = {
    createSurface: (settings, projectName, stageName, area) => createNewSurface(settings, projectName, stageName, area),
    destroySurface: (surface) => game.delete_surface(surface),
  }
} else {
  surfaceCreator = {
    createSurface: (settings, projectName, stageName, area = defaultPreparedArea): [LuaSurface, hub?: LuaEntity] => {
      if (settings?.type == "spacePlatform") {
        return createSpacePlatform(settings, projectName, stageName)
      }
      if (!storage.freeSurfaces) {
        storage.freeSurfaces = []
      }
      while (storage.freeSurfaces.length > 0) {
        const surface = storage.freeSurfaces.pop()!
        if (surface.valid) {
          surface.destroy_decoratives({})
          for (const entity of surface.find_entities()) entity.destroy()
          prepareSurface(surface, area, settings, projectName, stageName)
          return [surface]
        }
      }
      return [createNewStageSurface(settings, projectName, stageName, area)]
    },
    destroySurface: (surface) => {
      if (!surface.valid) return
      if (surface.platform) {
        game.delete_surface(surface)
        return
      }
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
