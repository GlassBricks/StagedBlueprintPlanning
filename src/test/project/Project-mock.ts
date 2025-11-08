// Copyright (c) 2022-2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { LuaSurface } from "factorio:runtime"
import { newProjectContent } from "../../entity/ProjectContent"
import { getPlayer } from "../../lib/test/misc"
import { Project } from "../../project/ProjectDef"
import { createStageSurface, destroySurface, getDefaultSurfaceSettings } from "../../project/surfaces"

export function createMockProject(stages: number | LuaSurface[]): Project {
  const surfaces: LuaSurface[] =
    typeof stages == "number" ? Array.from({ length: stages }, () => game.surfaces[1]) : stages
  return {
    getSurface: (stage) => surfaces[stage - 1],
    numStages: () => surfaces.length,
    lastStageFor: (entity) => (entity.lastStage ? math.min(entity.lastStage, surfaces.length) : surfaces.length),
    content: newProjectContent(),
    getStageName: (n) => "mock stage " + n,
    valid: true,
    actions: "actions not mocked" as any,
    updates: "updates not mocked" as any,
    worldUpdates: "entityUpdates not mocked" as any,
  }
}

export function setupTestSurfaces(numSurfaces: number): LuaSurface[] {
  const surfaces: LuaSurface[] = []
  before_all(() => {
    for (let i = 0; i < numSurfaces; i++) {
      surfaces[i] = createStageSurface(getDefaultSurfaceSettings(), "test", "i")[0]
      assert(surfaces[i].valid)
    }
    const player = getPlayer()
    player.teleport(player.position, surfaces[0])
  })
  before_each(() => {
    for (const surface of surfaces) {
      if (surface.valid) surface.find_entities().forEach((e) => e.destroy())
    }
  })
  after_all(() => {
    surfaces.forEach((s) => destroySurface(s))
    const player = getPlayer()
    player.teleport(player.position, game.surfaces[1])
  })
  return surfaces
}
