// Copyright (c) 2025 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { double, MapGenSettings } from "factorio:runtime"
import expect from "tstl-expect"
import { asMutable, deepCopy, Mutable } from "../../lib"
import { applySurfaceSettings, readSurfaceSettings, type SurfaceSettings } from "../../project/surfaces"

test("applySurfaceSettings applies all custom settings", () => {
  const surface = game.create_surface("test-surface")

  const nauvis = prototypes.space_location["nauvis"]
  const mapGenSettings: Mutable<MapGenSettings> = asMutable(deepCopy(nauvis.map_gen_settings!))
  mapGenSettings.seed = 99999

  const customProps: Record<string, double> = {}
  for (const [propertyName] of prototypes.surface_property) {
    customProps[propertyName] = 0.5
  }

  const settings: SurfaceSettings = {
    map_gen_settings: mapGenSettings,
    surface_properties: customProps,
    generate_with_lab_tiles: false,
    ignore_surface_conditions: false,
    has_global_electric_network: true,
  }

  applySurfaceSettings(settings, surface)

  expect(surface.generate_with_lab_tiles).toBe(false)
  expect(surface.map_gen_settings.seed).toBe(99999)
  expect(surface.ignore_surface_conditions).toBe(false)
  expect(surface.has_global_electric_network).toBe(true)
  for (const [propertyName] of prototypes.surface_property) {
    expect(surface.get_property(propertyName)).toBe(0.5)
  }

  game.delete_surface(surface)
})

test("applySurfaceSettings uses defaults for nil values", () => {
  const surface = game.create_surface("test-surface")

  const settings: SurfaceSettings = {
    map_gen_settings: nil,
    surface_properties: nil,
    generate_with_lab_tiles: false,
    ignore_surface_conditions: true,
    has_global_electric_network: false,
  }

  applySurfaceSettings(settings, surface)

  const nauvis = game.surfaces[1]
  for (const [propertyName] of prototypes.surface_property) {
    expect(surface.get_property(propertyName)).toBe(nauvis.get_property(propertyName))
  }
  expect(surface.map_gen_settings).toEqual(game.default_map_gen_settings)

  game.delete_surface(surface)
})

test("readSurfaceSettings reads all settings from surface", () => {
  const surface = game.create_surface("test-surface")
  surface.generate_with_lab_tiles = false
  const mapGenSettings: Mutable<MapGenSettings> = asMutable(deepCopy(game.default_map_gen_settings))
  mapGenSettings.seed = 12345
  surface.map_gen_settings = mapGenSettings

  const settings = readSurfaceSettings(surface)

  expect(settings.generate_with_lab_tiles).toBe(false)
  expect(settings.map_gen_settings!.seed).toBe(12345)
  expect(settings.surface_properties != nil).toBe(true)

  game.delete_surface(surface)
})

test("readSurfaceSettings returns nil map_gen_settings for lab tiles", () => {
  const surface = game.create_surface("test-surface")
  surface.generate_with_lab_tiles = true

  const settings = readSurfaceSettings(surface)

  expect(settings.map_gen_settings).toBeNil()

  game.delete_surface(surface)
})
