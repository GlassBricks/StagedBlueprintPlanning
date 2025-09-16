// Copyright (c) 2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

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
