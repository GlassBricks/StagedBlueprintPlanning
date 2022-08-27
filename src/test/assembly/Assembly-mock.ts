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

import { AssemblyContent, StagePosition } from "../../assembly/AssemblyContent"
import { Stage } from "../../assembly/AssemblyDef"
import { newEntityMap } from "../../assembly/EntityMap"

export function createMockAssemblyContent(numStages: number): AssemblyContent {
  const stages: StagePosition[] = Array.from({ length: numStages }, (_, i) => ({
    stageNumber: i + 1,
    surface: game.surfaces[1],
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
