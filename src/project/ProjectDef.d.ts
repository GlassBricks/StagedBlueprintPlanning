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
