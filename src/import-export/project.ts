// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { OverrideableBlueprintSettings, StageBlueprintSettings } from "../blueprints/blueprint-settings"
import { ProjectEntity } from "../entity/ProjectEntity"
import { Stage, StageSettings, Project } from "../project/Project"
import { type SurfaceSettings } from "../project/surfaces"
import { createProject } from "../project/Project"
import { getCurrentValues, getCurrentValuesOf, OverrideTable, setCurrentValuesOf } from "../utils/properties-obj"
import { EntityExport, exportAllEntities, importAllEntities } from "./entity"

export interface ProjectExport {
  name?: string
  stages?: StageExport[]
  entities?: EntitiesExport
  surfaceSettings?: SurfaceSettings
  defaultBlueprintSettings?: Partial<OverrideableBlueprintSettings>
  landfillTile?: string | nil
  stagedTilesEnabled?: boolean
}

export type EntitiesExport = EntityExport[]

export interface StageExport extends Partial<StageSettings> {
  blueprintOverrideSettings?: Partial<OverrideTable<OverrideableBlueprintSettings>>
  stageBlueprintSettings?: Partial<StageBlueprintSettings>
}

export function exportProject(project: Project): ProjectExport {
  return {
    name: project.settings.projectName.get(),
    defaultBlueprintSettings: getCurrentValues(project.settings.defaultBlueprintSettings),
    surfaceSettings: project.settings.surfaceSettings,
    stages: project.getAllStages().map(exportStage),
    entities: exportAllEntities(project.content.allEntities()),
    landfillTile: project.settings.landfillTile.get(),
    stagedTilesEnabled: project.settings.stagedTilesEnabled.get(),
  }
}

export function exportStage(this: unknown, stage: Stage): StageExport {
  const settings = stage.getSettings()
  return {
    blueprintOverrideSettings: getCurrentValuesOf<OverrideTable<OverrideableBlueprintSettings>>(
      settings.blueprintOverrideSettings,
      keys<OverrideableBlueprintSettings>(),
    ),
    stageBlueprintSettings: getCurrentValuesOf<StageBlueprintSettings>(
      settings.stageBlueprintSettings,
      keys<StageBlueprintSettings>(),
    ),
    ...getCurrentValuesOf<StageSettings>(stage.getSettings(), keys<StageSettings>()),
  }
}

export function importProjectDataOnly(project: ProjectExport): Project {
  const stages = project.stages
  const result = createProject(project.name ?? "", stages?.length ?? 3, project?.surfaceSettings)

  if (project.landfillTile != nil) {
    result.settings.landfillTile.set(project.landfillTile)
  }
  if (project.stagedTilesEnabled != nil) {
    result.settings.stagedTilesEnabled.set(project.stagedTilesEnabled)
  }

  if (project.defaultBlueprintSettings != nil) {
    setCurrentValuesOf<OverrideableBlueprintSettings>(
      result.settings.defaultBlueprintSettings,
      project.defaultBlueprintSettings,
      keys<OverrideableBlueprintSettings>(),
    )
  }

  if (stages != nil) {
    for (const [i, stage] of ipairs(stages)) {
      importStage(stage, result.getStage(i)!)
    }
  }
  if (result.settings.isSpacePlatform()) {
    const hub = next(result.content.allEntities())[0] as ProjectEntity | nil
    if (hub) {
      result.actions.forceDeleteEntity(hub)
    }
  }

  importAllEntities(result.content, assert(project.entities))

  return result
}

function importStage(importedStage: StageExport, result: Stage): void {
  const settings = result.getSettings()
  if (importedStage.blueprintOverrideSettings != nil) {
    setCurrentValuesOf<OverrideTable<OverrideableBlueprintSettings>>(
      settings.blueprintOverrideSettings,
      importedStage.blueprintOverrideSettings,
      keys<OverrideableBlueprintSettings>(),
    )
  }
  if (importedStage.stageBlueprintSettings != nil) {
    setCurrentValuesOf<StageBlueprintSettings>(
      settings.stageBlueprintSettings,
      importedStage.stageBlueprintSettings,
      keys<StageBlueprintSettings>(),
    )
  }
  setCurrentValuesOf<StageSettings>(result.getSettings(), importedStage, keys<StageSettings>())
}
