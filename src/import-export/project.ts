// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { OverrideableBlueprintSettings, StageBlueprintSettings } from "../blueprints/blueprint-settings"
import { ProjectEntity } from "../entity/ProjectEntity"
import {
  NestedProjectSettings,
  NestedStageSettings,
  ProjectSettings,
  Stage,
  StageSettings,
  UserProject,
} from "../project/ProjectDef"
import { type SurfaceSettings } from "../project/surfaces"
import { createUserProject } from "../project/UserProject"
import { getCurrentValues, getCurrentValuesOf, OverrideTable, setCurrentValuesOf } from "../utils/properties-obj"
import { EntityExport, exportAllEntities, importAllEntities } from "./entity"

type NestedPartial<T> = {
  [K in keyof T]?: Partial<T[K]>
}

export interface ProjectExport extends Partial<ProjectSettings>, NestedPartial<NestedProjectSettings> {
  stages?: StageExport[]
  entities?: EntitiesExport
  surfaceSettings?: SurfaceSettings
}

export type EntitiesExport = EntityExport[]

export interface StageExport extends Partial<StageSettings>, NestedPartial<NestedStageSettings> {}

export function exportProject(project: UserProject): ProjectExport {
  return {
    defaultBlueprintSettings: getCurrentValues(project.defaultBlueprintSettings),
    surfaceSettings: project.surfaceSettings,
    stages: project.getAllStages().map(exportStage),
    entities: exportAllEntities(project.content.allEntities()),
    ...getCurrentValuesOf<ProjectSettings>(project, keys<ProjectSettings>()),
  }
}

export function exportStage(this: unknown, stage: Stage): StageExport {
  return {
    blueprintOverrideSettings: getCurrentValuesOf<OverrideTable<OverrideableBlueprintSettings>>(
      stage.blueprintOverrideSettings,
      keys<OverrideableBlueprintSettings>(),
    ),
    stageBlueprintSettings: getCurrentValuesOf<StageBlueprintSettings>(
      stage.stageBlueprintSettings,
      keys<StageBlueprintSettings>(),
    ),
    ...getCurrentValuesOf<StageSettings>(stage, keys<StageSettings>()),
  }
}

export function importProjectDataOnly(project: ProjectExport): UserProject {
  const stages = project.stages
  const result = createUserProject(project.name ?? "", stages?.length ?? 3, project?.surfaceSettings)
  setCurrentValuesOf<ProjectSettings>(result, project, keys<ProjectSettings>())
  if (project.defaultBlueprintSettings != nil) {
    setCurrentValuesOf<OverrideableBlueprintSettings>(
      result.defaultBlueprintSettings,
      project.defaultBlueprintSettings,
      keys<OverrideableBlueprintSettings>(),
    )
  }

  if (stages != nil) {
    for (const [i, stage] of ipairs(stages)) {
      importStage(stage, result.getStage(i)!)
    }
  }
  if (result.isSpacePlatform()) {
    const hub = next(result.content.allEntities())[0] as ProjectEntity | nil
    if (hub) {
      result.updates.forceDeleteEntity(hub)
    }
  }

  importAllEntities(result.content, assert(project.entities))

  return result
}

function importStage(importedStage: StageExport, result: Stage): void {
  if (importedStage.blueprintOverrideSettings != nil) {
    setCurrentValuesOf<OverrideTable<OverrideableBlueprintSettings>>(
      result.blueprintOverrideSettings,
      importedStage.blueprintOverrideSettings,
      keys<OverrideableBlueprintSettings>(),
    )
  }
  if (importedStage.stageBlueprintSettings != nil) {
    setCurrentValuesOf<StageBlueprintSettings>(
      result.stageBlueprintSettings,
      importedStage.stageBlueprintSettings,
      keys<StageBlueprintSettings>(),
    )
  }
  setCurrentValuesOf<StageSettings>(result, importedStage, keys<StageSettings>())
}
