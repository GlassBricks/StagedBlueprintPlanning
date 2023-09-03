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
  OverrideableBlueprintSettings,
  StageBlueprintSettings,
  StageBlueprintSettingsTable,
} from "../blueprints/blueprint-settings"
import { MutableProjectContent } from "../entity/ProjectContent"
import { ProjectEntity, StageNumber } from "../entity/ProjectEntity"
import { MutableProperty, Property, SimpleSubscribable } from "../lib"
import { BBox } from "../lib/geometry"
import { PropertiesTable } from "../utils/properties-obj"
import { AutoSetTilesType } from "./tiles"

export type ProjectId = number & {
  _projectIdBrand: never
}
export interface Project {
  numStages(): StageNumber
  lastStageFor(entity: ProjectEntity): StageNumber

  getStageName(stage: StageNumber): LocalisedString
  getSurface(stage: StageNumber): LuaSurface | nil
  readonly content: MutableProjectContent

  readonly valid: boolean
}
export interface UserProject extends Project {
  readonly id: ProjectId
  readonly name: MutableProperty<string>
  readonly displayName: Property<LocalisedString>
  readonly content: MutableProjectContent
  readonly defaultBlueprintSettings: PropertiesTable<OverrideableBlueprintSettings>
  readonly localEvents: SimpleSubscribable<LocalProjectEvent>

  getStage(stageNumber: StageNumber): Stage | nil
  getAllStages(): readonly Stage[]

  insertStage(index: StageNumber): Stage
  /** Cannot be first stage, contents will be merged with previous stage. */
  deleteStage(index: StageNumber): void

  readonly valid: boolean
  delete(): void
}

export interface Stage {
  readonly surface: LuaSurface
  readonly name: MutableProperty<string>

  readonly stageNumber: StageNumber
  readonly project: UserProject // TODO: migrate

  readonly stageBlueprintSettings: StageBlueprintSettingsTable
  getBlueprintSettingsView(): PropertiesTable<StageBlueprintSettings>

  getBlueprintBBox(): BBox
  autoSetTiles(tiles: AutoSetTilesType): boolean
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
