import { OverrideableBlueprintSettings, StageBlueprintSettings } from "../blueprints/blueprint-settings"
import { getErrorWithStacktrace } from "../lib"
import {
  NestedProjectSettings,
  NestedStageSettings,
  ProjectSettings,
  Stage,
  StageSettings,
  UserProject,
} from "../project/ProjectDef"
import { createUserProject } from "../project/UserProject"
import { getCurrentValues, getCurrentValuesOf, OverrideTable, setCurrentValuesOf } from "../utils/properties-obj"
import { EntityExport, exportAllEntities, importAllEntities } from "./entity"

type NestedPartial<T> = {
  [K in keyof T]?: Partial<T[K]>
}

export interface ProjectExport extends Partial<ProjectSettings>, NestedPartial<NestedProjectSettings> {
  stages: StageExport[]
  entities: EntitiesExport
}

export type EntitiesExport = EntityExport[]

export interface StageExport extends Partial<StageSettings>, NestedPartial<NestedStageSettings> {}

export function exportProject(project: UserProject): ProjectExport {
  return {
    defaultBlueprintSettings: getCurrentValues(project.defaultBlueprintSettings),
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
  const result = createUserProject(project.name ?? "", stages.length)
  setCurrentValuesOf<ProjectSettings>(result, project, keys<ProjectSettings>())
  if (project.defaultBlueprintSettings != nil) {
    setCurrentValuesOf<OverrideableBlueprintSettings>(
      result.defaultBlueprintSettings,
      project.defaultBlueprintSettings,
      keys<OverrideableBlueprintSettings>(),
    )
  }
  for (const [i, stage] of ipairs(stages)) {
    setStageExport(stage, result.getStage(i)!)
  }
  importAllEntities(result.content, assert(project.entities))

  return result
}

/**
 * On error, returns an error message.
 */
export function importProject(project: ProjectExport): UserProject | string {
  const [success, result] = xpcall(importProjectDataOnly, getErrorWithStacktrace, project)
  if (success) {
    result.worldUpdates.rebuildAllStages()
    return result
  }
  const [msg, stacktrace] = result
  log(`Failed to import project: ${stacktrace}`)
  return `Failed to import project: ${tostring(msg)}\nPlease report this to the mod author if you think this is a bug.`
}

export function setStageExport(stage: StageExport, stageToExport: Stage): void {
  if (stage.blueprintOverrideSettings != nil) {
    setCurrentValuesOf<OverrideTable<OverrideableBlueprintSettings>>(
      stageToExport.blueprintOverrideSettings,
      stage.blueprintOverrideSettings,
      keys<OverrideableBlueprintSettings>(),
    )
  }
  if (stage.stageBlueprintSettings != nil) {
    setCurrentValuesOf<StageBlueprintSettings>(
      stageToExport.stageBlueprintSettings,
      stage.stageBlueprintSettings,
      keys<StageBlueprintSettings>(),
    )
  }
  setCurrentValuesOf<StageSettings>(stageToExport, stage, keys<StageSettings>())
}
