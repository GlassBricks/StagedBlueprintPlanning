// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { OverrideableBlueprintSettings, StageBlueprintSettings } from "../blueprints/blueprint-settings"
import { newProjectContent } from "../entity/ProjectContent"
import { isEmpty } from "../lib"
import { createProject, Project, Stage, StageSettings } from "../project/Project"
import { type SurfaceSettings } from "../project/surfaces"
import { getNilPlaceholder } from "../utils/diff-value"
import {
  getCurrentValues,
  getCurrentValuesOf,
  OverrideTable,
  PropertyOverrideTable,
  setCurrentValuesOf,
} from "../utils/properties-obj"
import { deserializeAllEntities, EntityExport, serializeAllEntities } from "./entity"

const nilOverrideMarker = "__nil"

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
    entities: serializeAllEntities(project.content.allEntities()),
    landfillTile: project.settings.landfillTile.get(),
    stagedTilesEnabled: project.settings.stagedTilesEnabled.get(),
  }
}

export function exportStage(this: unknown, stage: Stage): StageExport {
  const settings = stage.getSettings()
  return {
    blueprintOverrideSettings: exportOverrideValues(
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

function exportOverrideValues<T extends object>(
  propertiesTable: PropertyOverrideTable<T>,
  ks: Array<keyof T>,
): Partial<OverrideTable<T>> {
  const result: Record<string, unknown> = {}
  for (const key of ks) {
    const value = propertiesTable[key].get()
    if (value == nil) continue
    if (typeof value == "object" && isEmpty(value)) {
      result[key as string] = nilOverrideMarker
    } else {
      result[key as string] = value
    }
  }
  return result as Partial<OverrideTable<T>>
}

function importOverrideValues<T extends object>(
  propertiesTable: PropertyOverrideTable<T>,
  values: Partial<OverrideTable<T>>,
  ks: Array<keyof T>,
): void {
  for (const key of ks) {
    const value = (values as Record<string, unknown>)[key as string]
    if (value == nil) continue
    if (value == nilOverrideMarker || (type(value) == "table" && isEmpty(value))) {
      propertiesTable[key].set(getNilPlaceholder())
    } else {
      propertiesTable[key].set(value as never)
    }
  }
}

export function importProjectDataOnly(data: ProjectExport): Project {
  const stages = data.stages
  const numStages = stages?.length ?? 3

  const content = newProjectContent()
  deserializeAllEntities(content, assert(data.entities))

  const result = createProject(data.name ?? "", numStages, data?.surfaceSettings, content)

  if (data.landfillTile != nil) {
    result.settings.landfillTile.set(data.landfillTile)
  }
  if (data.stagedTilesEnabled != nil) {
    result.settings.stagedTilesEnabled.set(data.stagedTilesEnabled)
  }

  if (data.defaultBlueprintSettings != nil) {
    setCurrentValuesOf<OverrideableBlueprintSettings>(
      result.settings.defaultBlueprintSettings,
      data.defaultBlueprintSettings,
      keys<OverrideableBlueprintSettings>(),
    )
  }

  if (stages != nil) {
    for (const [i, stage] of ipairs(stages)) {
      importStage(stage, result.getStage(i)!)
    }
  }

  return result
}

function importStage(importedStage: StageExport, result: Stage): void {
  const settings = result.getSettings()
  if (importedStage.blueprintOverrideSettings != nil) {
    importOverrideValues(
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
