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

import { LuaSurface } from "factorio:runtime"
import { newProjectContent } from "../../entity/ProjectContent"
import { getPlayer } from "../../lib/test/misc"
import { Project } from "../../project/ProjectDef"
import { createStageSurface, destroySurface } from "../../project/surfaces"

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
    entityUpdates: "entityUpdates not mocked" as any,
  }
}

export function setupTestSurfaces(numSurfaces: number): LuaSurface[] {
  const surfaces: LuaSurface[] = []
  before_all(() => {
    for (let i = 0; i < numSurfaces; i++) {
      surfaces[i] = createStageSurface()
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
