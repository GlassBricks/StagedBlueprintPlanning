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

import { assertNever } from "../lib"
import { ProjectEvents } from "./UserProject"

ProjectEvents.addListener((e) => {
  switch (e.type) {
    case "stage-added":
      e.project.worldUpdates.rebuildStage(e.stage.stageNumber)
      return
    case "stage-deleted": {
      const stageNumber = e.stage.stageNumber
      const stageNumberToMerge = stageNumber == 1 ? 2 : stageNumber - 1
      e.project.worldUpdates.rebuildStage(stageNumberToMerge)
      return
    }
    case "project-created":
    case "project-deleted":
    case "pre-stage-deleted":
    case "projects-reordered":
      return
    default:
      assertNever(e)
  }
})
