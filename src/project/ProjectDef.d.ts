// Copyright (c) 2022-2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { LuaEntity, LuaSurface } from "factorio:runtime"
import { BlueprintSettingsTable } from "../blueprints/blueprint-settings"
import { MutableProjectContent } from "../entity/ProjectContent"
import { StageNumber } from "../entity/ProjectEntity"
import { StagedValue } from "../entity/StagedValue"
import { MutableProperty, SimpleSubscribable } from "../lib"
import { BBox } from "../lib/geometry"
import { PropertiesTable } from "../utils/properties-obj"
import { ProjectUpdates } from "./project-updates"
import type { ProjectSettings, StageSettingsData } from "./ProjectSettings"

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

  lastStageFor(entity: StagedValue<AnyNotNil, AnyNotNil>): StageNumber

  getSurface(stage: StageNumber): LuaSurface | nil
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

  readonly content: MutableProjectContent

  readonly localEvents: SimpleSubscribable<LocalProjectEvent>

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

export interface Stage extends PropertiesTable<StageSettings> {
  readonly name: MutableProperty<string>

  readonly stageNumber: StageNumber

  readonly surface: LuaSurface
  readonly project: UserProject

  getID(): StageId

  readonly actions: UserActions

  getSettings(): StageSettingsData
  getBlueprintSettingsView(): BlueprintSettingsTable
  getBlueprintBBox(): BBox
  readonly valid: boolean
  deleteByMerging(): void
  discardInProject(): void
}

export interface ProjectCreatedEvent {
  readonly type: "project-created"
  readonly project: UserProject
}
export interface ProjectDeletedEvent {
  readonly type: "project-deleted"
  readonly project: UserProject
}

export interface ProjectsReorderedEvent {
  readonly type: "projects-reordered"
  readonly project1: UserProject
  readonly project2: UserProject
}
export interface StageAddedEvent {
  readonly type: "stage-added"
  readonly spacePlatformHub: LuaEntity | nil
  readonly project: UserProject
  readonly stage: Stage
}
export interface PreStageDeletedEvent {
  readonly type: "pre-stage-deleted"
  readonly project: UserProject
  readonly stage: Stage
}
export interface StageDeletedEvent {
  readonly type: "stage-deleted"
  readonly project: UserProject
  readonly stage: Stage
}
export type GlobalProjectEvent =
  | ProjectCreatedEvent
  | ProjectDeletedEvent
  | ProjectsReorderedEvent
  | StageAddedEvent
  | PreStageDeletedEvent
  | StageDeletedEvent
export type LocalProjectEvent = ProjectDeletedEvent | StageAddedEvent | PreStageDeletedEvent | StageDeletedEvent
