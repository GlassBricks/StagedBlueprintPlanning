// Copyright (c) 2022-2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { LocalisedString, LuaItemStack, LuaSurface } from "factorio:runtime"
import {
  BlueprintSettingsOverrideTable,
  BlueprintSettingsTable,
  OverrideableBlueprintSettings,
  StageBlueprintSettings,
  StageBlueprintSettingsTable,
} from "../blueprints/blueprint-settings"
import { MutableProjectContent } from "../entity/ProjectContent"
import { StageNumber } from "../entity/ProjectEntity"
import { StagedValue } from "../entity/StagedValue"
import { MutableProperty, Property, SimpleSubscribable } from "../lib"
import { BBox } from "../lib/geometry"
import { NestedPropertiesTable, OverrideTable, PropertiesTable } from "../utils/properties-obj"
import { ProjectUpdates } from "./project-updates"

import type { SurfaceSettings } from "./surfaces"
import { UserActions } from "./user-actions"
import { WorldUpdates } from "./world-updates"

export type ProjectId = number & {
  _projectIdBrand: never
}
export type StageId = number & {
  _stageIdBrand: never
}

export interface Project {
  numStages(): StageNumber
  lastStageFor(entity: StagedValue<AnyNotNil, AnyNotNil>): StageNumber

  getStageName(stage: StageNumber): LocalisedString
  getSurface(stage: StageNumber): LuaSurface | nil
  readonly content: MutableProjectContent

  isSpacePlatform?(): boolean

  readonly valid: boolean

  // Refs to modules, handling all possible updates
  actions: UserActions
  updates: ProjectUpdates
  worldUpdates: WorldUpdates
}

export interface ProjectSettings {
  readonly name: string
  readonly landfillTile: string | nil
  readonly stagedTilesEnabled: boolean
}

export interface NestedProjectSettings {
  readonly defaultBlueprintSettings: OverrideableBlueprintSettings
}

export interface UserProject
  extends Project,
    PropertiesTable<ProjectSettings>,
    NestedPropertiesTable<NestedProjectSettings> {
  readonly id: ProjectId

  // settings
  readonly name: MutableProperty<string>
  readonly defaultBlueprintSettings: PropertiesTable<OverrideableBlueprintSettings>
  surfaceSettings: SurfaceSettings
  readonly landfillTile: MutableProperty<string | nil>
  readonly stagedTilesEnabled: MutableProperty<boolean>

  // data
  readonly content: MutableProjectContent

  // transient
  readonly localEvents: SimpleSubscribable<LocalProjectEvent>

  getBlueprintBookTemplate(): LuaItemStack | nil
  getOrCreateBlueprintBookTemplate(): LuaItemStack
  resetBlueprintBookTemplate(): void

  displayName(): Property<LocalisedString>
  getStage(stageNumber: StageNumber): Stage | nil
  getAllStages(): readonly Stage[]
  getStageById(stageId: StageId): Stage | nil

  insertStage(index: StageNumber): Stage
  deleteStage(index: StageNumber): void

  isSpacePlatform(): boolean

  readonly valid: boolean
  delete(): void
}

export interface StageSettings {
  name: string
}

export interface NestedStageSettings {
  readonly blueprintOverrideSettings: OverrideTable<OverrideableBlueprintSettings>
  readonly stageBlueprintSettings: StageBlueprintSettings
}

export interface Stage extends PropertiesTable<StageSettings>, NestedPropertiesTable<NestedStageSettings> {
  readonly name: MutableProperty<string>

  readonly stageNumber: StageNumber

  readonly surface: LuaSurface
  readonly project: UserProject

  getID(): StageId

  /** Same value as project.actions */
  readonly actions: UserActions

  readonly blueprintOverrideSettings: BlueprintSettingsOverrideTable
  readonly stageBlueprintSettings: StageBlueprintSettingsTable
  getBlueprintSettingsView(): BlueprintSettingsTable

  getBlueprintBBox(): BBox
  readonly valid: boolean
  deleteInProject(): void
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
