// Copyright (c) 2024-2025 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { MapGenSettings } from "factorio:runtime"
import expect from "tstl-expect"
import { asMutable, deepCopy, Mutable } from "../../lib"
import { createProject, Project } from "../../project/Project"
import { NormalSurfaceSettings, syncMapGenSettings } from "../../project/surfaces"

// NOTE: do NOT call setupTestSurfaces here, or clear() any shared/pooled surface in a hook around
// these tests. syncMapGenSettings regenerates real terrain; clearing a pooled/reused surface that
// carries that generation state hits an unbounded loop in Factorio's map generation and spins the
// game forever (engine bug in applyRequestsAsLabTiles). Each test owns its project and cleans up with
// project.delete() only. See _research/map-gen-test-hang.md.

let project: Project
after_each(() => {
  project.delete()
})

function realMapGenSettings(seed: number): Mutable<MapGenSettings> {
  const settings = asMutable(deepCopy(game.default_map_gen_settings))
  settings.seed = seed
  return settings
}

test("reads map gen settings from a stage and applies to all stages", () => {
  project = createProject("test", 3)
  const stage1Surface = project.getStage(1)!.getSurface()
  stage1Surface.generate_with_lab_tiles = false
  stage1Surface.map_gen_settings = realMapGenSettings(54321)

  syncMapGenSettings(project.getStage(1)!)

  const projectSettings = project.settings.surfaceSettings as NormalSurfaceSettings
  expect(projectSettings).toMatchTable({
    type: "normal",
    generate_with_lab_tiles: false,
    map_gen_settings: { seed: 54321 },
  })

  for (const stage of project.getAllStages()) {
    expect(stage.getSurface()).toMatchTable({
      generate_with_lab_tiles: false,
      map_gen_settings: { seed: 54321 },
    })
  }
})

test("syncs has_global_electric_network across all stages", () => {
  project = createProject("test", 3)
  const stage1Surface = project.getStage(1)!.getSurface()
  stage1Surface.generate_with_lab_tiles = false
  stage1Surface.map_gen_settings = realMapGenSettings(100)
  stage1Surface.create_global_electric_network()

  syncMapGenSettings(project.getStage(1)!)

  const projectSettings = project.settings.surfaceSettings as NormalSurfaceSettings
  expect(projectSettings.has_global_electric_network).toBe(true)

  for (const stage of project.getAllStages()) {
    expect(stage.getSurface().has_global_electric_network).toBe(true)
  }
})
