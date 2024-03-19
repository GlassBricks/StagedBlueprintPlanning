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

import { LocalisedString, LuaSurface } from "factorio:runtime"
import {
  BlueprintOverrideSettings,
  BlueprintSettingsTable,
  OverrideableBlueprintSettings,
} from "../blueprints/blueprint-settings"
import { MutableProjectContent } from "../entity/ProjectContent"
import { StageNumber } from "../entity/ProjectEntity"
import { StagedValue } from "../entity/StagedValue"
import { MutableProperty, Property, SimpleSubscribable } from "../lib"
import { BBox } from "../lib/geometry"
import { PropertiesTable } from "../utils/properties-obj"
import { ProjectUpdates } from "./project-updates"

import { UserActions } from "./user-actions"
import { WorldUpdates } from "./world-updates"

export type ProjectId = number & {
  _projectIdBrand: never
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

export interface UserProject extends Project {
  readonly id: ProjectId
  readonly name: MutableProperty<string>
  readonly content: MutableProjectContent
  readonly localEvents: SimpleSubscribable<LocalProjectEvent>

  readonly defaultBlueprintSettings: PropertiesTable<OverrideableBlueprintSettings>

  // this may become a per-stage setting in the future
  readonly landfillTile: MutableProperty<string | nil>
  readonly stagedTilesEnabled: MutableProperty<boolean>

  displayName(): Property<LocalisedString>
  getStage(stageNumber: StageNumber): Stage | nil
  getAllStages(): readonly Stage[]

  insertStage(index: StageNumber): Stage
  deleteStage(index: StageNumber): void

  readonly valid: boolean
  delete(): void
}

export interface Stage {
  readonly surface: LuaSurface
  readonly name: MutableProperty<string>

  readonly stageNumber: StageNumber
  readonly project: UserProject

  /** Same value as project.actions */
  readonly actions: UserActions

  readonly stageBlueprintSettings: BlueprintOverrideSettings
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
