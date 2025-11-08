// Copyright (c) 2024-2025 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { MapGenSettings } from "factorio:runtime"
import expect from "tstl-expect"
import { asMutable, deepCopy, Mutable } from "../../lib"
import { UserProject } from "../../project/ProjectDef"
import { NormalSurfaceSettings, syncMapGenSettings } from "../../project/surfaces"
import { createUserProject } from "../../project/UserProject"
import { setupTestSurfaces } from "./Project-mock"

const surfaces = setupTestSurfaces(2)
let project: UserProject
before_each(() => {
  project = createUserProject("test", 3)
})
after_each(() => {
  project.delete()
  surfaces.forEach((s) => {
    s.generate_with_lab_tiles = true
    s.clear()
  })
})

test("sync map gen settings", () => {
  const surface1 = surfaces[0]
  surface1.map_gen_settings = {
    ...surface1.map_gen_settings,
    seed: 100,
  }
  surface1.create_global_electric_network()
  surface1.generate_with_lab_tiles = false
  const surface2 = surfaces[1]
  surface2.map_gen_settings = {
    ...surface2.map_gen_settings,
    seed: 200,
  }
  surface2.generate_with_lab_tiles = true

  syncMapGenSettings(project.getStage(1)!)

  expect(surface1).toMatchTable({
    map_gen_settings: { seed: 100 },
    generate_with_lab_tiles: false,
    has_global_electric_network: true,
  })
  expect(surface2).toMatchTable({
    map_gen_settings: { seed: 100 },
    generate_with_lab_tiles: false,
    has_global_electric_network: true,
  })

  after_ticks(20, () => {
    // wait for surface to reset
  })
})

test("syncMapGenSettings reads from stage and applies to all", () => {
  const project = createUserProject("Test", 3)
  const stage1 = project.getStage(1)!

  stage1.surface.generate_with_lab_tiles = false
  const mapGenSettings: Mutable<MapGenSettings> = asMutable(deepCopy(game.default_map_gen_settings))
  mapGenSettings.seed = 54321
  stage1.surface.map_gen_settings = mapGenSettings

  syncMapGenSettings(stage1)

  const projectSettings = project.surfaceSettings as NormalSurfaceSettings
  expect(projectSettings).toMatchTable({
    type: "normal",
    generate_with_lab_tiles: false,
    map_gen_settings: { seed: 54321 },
  })

  expect(project.getStage(2)!.surface.map_gen_settings.seed).toBe(54321)
  expect(project.getStage(3)!.surface.map_gen_settings.seed).toBe(54321)

  project.delete()
})
