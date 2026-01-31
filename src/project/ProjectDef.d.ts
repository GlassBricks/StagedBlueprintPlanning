// Copyright (c) 2022-2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { LuaSurface } from "factorio:runtime"
import { BlueprintSettingsTable } from "../blueprints/blueprint-settings"
import { MutableProjectContent } from "../entity/ProjectContent"
import { StageNumber } from "../entity/ProjectEntity"
import { ReadonlyStagedValue } from "../entity/StagedValue"
import { SimpleSubscribable } from "../lib"
import { BBox } from "../lib/geometry"
import { ProjectUpdates } from "./project-updates"
import type { ProjectSettings, StageSettingsData } from "./ProjectSettings"
import type { ProjectSurfaces } from "./ProjectSurfaces"

import { UserActions } from "./user-actions"
import { WorldUpdates } from "./world-updates"
import { WorldPresentation } from "./WorldPresentation"

export type ProjectId = number & {
  _projectIdBrand: never
}
export type StageId = number & {
  _stageIdBrand: never
}

export interface Project {
  readonly settings: ProjectSettings
  readonly surfaces: ProjectSurfaces

  lastStageFor(entity: ReadonlyStagedValue<AnyNotNil, AnyNotNil>): StageNumber

  readonly content: MutableProjectContent

  readonly valid: boolean

  actions: UserActions
  updates: ProjectUpdates
  worldUpdates: WorldUpdates
  worldPresentation: WorldPresentation
}

export interface UserProject extends Project {
  readonly id: ProjectId
  readonly settings: ProjectSettings
  readonly surfaces: ProjectSurfaces

  readonly content: MutableProjectContent

  readonly stageAdded: SimpleSubscribable<Stage>
  readonly preStageDeleted: SimpleSubscribable<Stage>
  readonly stageDeleted: SimpleSubscribable<Stage>

  getStage(stageNumber: StageNumber): Stage | nil
  getAllStages(): readonly Stage[]
  getStageById(stageId: StageId): Stage | nil

  insertStage(index: StageNumber): Stage
  mergeStage(index: StageNumber): void
  discardStage(index: StageNumber): void

  readonly valid: boolean
  delete(): void
}

export interface StageSettings {
  name: string
}

export interface Stage {
  readonly stageNumber: StageNumber

  readonly project: UserProject

  getSurface(): LuaSurface

  getID(): StageId

  readonly actions: UserActions

  getSettings(): StageSettingsData
  getBlueprintSettingsView(): BlueprintSettingsTable
  getBlueprintBBox(): BBox
  readonly valid: boolean
  deleteByMerging(): void
  discardInProject(): void
}
