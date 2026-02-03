// Copyright (c) 2022-2026 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { LuaSurface } from "factorio:runtime"
import { MutableProjectContent, newProjectContent } from "../../entity/ProjectContent"
import { StageNumber } from "../../entity/ProjectEntity"
import { getPlayer } from "../../lib/test/misc"
import { SurfaceProvider } from "../../project/EntityHighlights"
import { ProjectSettings } from "../../project/ProjectSettings"
import { createStageSurface, destroySurface, getDefaultSurfaceSettings } from "../../project/surfaces"
import { WorldPresentation } from "../../project/WorldPresentation"

export interface MockProject {
  surfaces: SurfaceProvider
  settings: ProjectSettings
  content: MutableProjectContent
  worldPresentation: WorldPresentation
}

export function createMockProject(stages: number | LuaSurface[]): MockProject {
  const surfaces: LuaSurface[] =
    typeof stages == "number" ? Array.from({ length: stages }, () => game.surfaces[1]) : stages
  const mockSurfaces: SurfaceProvider = {
    getSurface(stage: StageNumber) {
      return surfaces[stage - 1] ?? nil
    },
  }
  const settings = {
    stageCount() {
      return surfaces.length
    },
    getStageName(n: number) {
      return "mock stage " + n
    },
    isSpacePlatform() {
      return false
    },
  } as unknown as ProjectSettings
  const content = newProjectContent()
  const worldPresentation = new WorldPresentation(settings, mockSurfaces, content)
  content.setObserver(worldPresentation)
  return { surfaces: mockSurfaces, settings, content, worldPresentation }
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
