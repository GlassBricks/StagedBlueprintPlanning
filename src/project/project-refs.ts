/*
 * Copyright (c) 2023 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

// This file is needed to avoid circular dependencies
import { nil, SurfaceIndex } from "factorio:runtime"
import { ProjectId, Stage, UserProject } from "./ProjectDef"

declare const storage: {
  surfaceIndexToStage: ReadonlyLuaMap<SurfaceIndex, Stage>
  projects: Record<number, UserProject>
}

export function getStageAtSurface(surfaceIndex: SurfaceIndex): Stage | nil {
  return storage.surfaceIndexToStage.get(surfaceIndex)
}
export function getProjectById(id: ProjectId): UserProject | nil {
  // yes, quadratic, but not a big deal
  for (const [, project] of pairs(storage.projects)) {
    if (project.id == id) return project
  }
  return nil
}
