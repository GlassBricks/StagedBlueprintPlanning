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

import { assertNever } from "../lib"
import { AssemblyEvents } from "./Assembly"
import { AssemblyOperations } from "./AssemblyOperations"

/**
 * Calls assembly operations in response to assembly events.
 */

AssemblyEvents.addListener((e) => {
  switch (e.type) {
    case "assembly-created":
      break
    case "assembly-deleted": {
      AssemblyOperations.deleteAllExtraEntitiesOnly(e.assembly)
      break
    }
    case "stage-added": {
      AssemblyOperations.resetStage(e.assembly, e.stage)
      break
    }
    case "pre-stage-deleted": {
      AssemblyOperations.deleteStageEntities(e.assembly, e.stage.stageNumber)
      break
    }
    case "stage-deleted": {
      const previousStage = e.assembly.getStage(e.stage.stageNumber - 1)
      if (previousStage) AssemblyOperations.resetStage(e.assembly, previousStage)
      break
    }
    default:
      assertNever(e)
  }
})
