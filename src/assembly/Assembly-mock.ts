/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of BBPP3.
 *
 * BBPP3 is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * BBPP3 is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with BBPP3. If not, see <https://www.gnu.org/licenses/>.
 */

import { AssemblyContent, StagePosition } from "./AssemblyContent"
import { Stage } from "./AssemblyDef"
import { newEntityMap } from "./EntityMap"

export function createMockAssemblyContent(numStages: number): AssemblyContent {
  const stages: StagePosition[] = Array.from({ length: numStages }, (_, i) => ({
    stageNumber: i + 1,
    surface: game.surfaces[1],
    left_top: { x: 0, y: 0 },
    right_bottom: { x: 32, y: 32 },
  }))
  return {
    getStage: (n) => stages[n - 1],
    numStages: () => stages.length,
    iterateStages: (start = 1, end = stages.length): any => {
      function next(stages: Stage[], i: number) {
        if (i >= end) return
        i++
        return $multi(i, stages[i - 1])
      }
      return $multi(next, stages, start - 1)
    },
    content: newEntityMap(),
    getStageName: (n) => "mock stage " + n,
  }
}
