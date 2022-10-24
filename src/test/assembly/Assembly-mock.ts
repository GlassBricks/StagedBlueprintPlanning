/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of 100% Blueprint Planning.
 *
 * 100% Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * 100% Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with 100% Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { Assembly, StageSurface } from "../../assembly/AssemblyDef"
import { createStageSurface, prepareArea } from "../../assembly/surfaces"
import { newEntityMap } from "../../entity/EntityMap"
import { BBox, Pos } from "../../lib/geometry"

export function createMockAssembly(stages: number | LuaSurface[]): Assembly {
  const stageSurfaces: StageSurface[] =
    typeof stages === "number"
      ? Array.from({ length: stages }, () => ({ surface: game.surfaces[1] }))
      : stages.map((s) => ({ surface: s }))
  return {
    getStage: (n) => stageSurfaces[n - 1],
    numStages: () => stageSurfaces.length,
    iterateStages: (start = 1, end = stageSurfaces.length): any => {
      function next(s: StageSurface[], i: number) {
        if (i >= end) return
        i++
        return $multi(i, s[i - 1])
      }
      return $multi(next, stageSurfaces, start - 1)
    },
    content: newEntityMap(),
    getStageName: (n) => "mock stage " + n,
  }
}

export function setupTestSurfaces(numSurfaces: number): LuaSurface[] {
  const surfaces: LuaSurface[] = []
  before_all(() => {
    for (let i = 0; i < numSurfaces; i++) {
      const surface = createStageSurface()
      prepareArea(surface, BBox.around(Pos(0, 0), 10))
      surfaces.push(surface)
    }
  })
  before_each(() => {
    for (const surface of surfaces) {
      surface.find_entities().forEach((e) => e.destroy())
    }
  })
  after_all(() => {
    surfaces.forEach((surface) => game.delete_surface(surface))
  })
  return surfaces
}
