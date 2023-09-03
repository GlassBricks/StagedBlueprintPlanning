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
import { MutableAssemblyContent } from "../entity/AssemblyContent"
import { AssemblyEntity, StageNumber } from "../entity/AssemblyEntity"
import { MutableProperty, Property, SimpleSubscribable } from "../lib"
import { BBox } from "../lib/geometry"
import { PropertiesTable } from "../utils/properties-obj"
import { AutoSetTilesType } from "./tiles"

export type AssemblyId = number & { _assemblyIdBrand: never }
export interface Assembly {
  numStages(): StageNumber
  lastStageFor(entity: AssemblyEntity): StageNumber

  getStageName(stage: StageNumber): LocalisedString
  getSurface(stage: StageNumber): LuaSurface | nil
  readonly content: MutableAssemblyContent

  readonly valid: boolean
}
export interface UserAssembly extends Assembly {
  readonly id: AssemblyId
  readonly name: MutableProperty<string>
  readonly displayName: Property<LocalisedString>
  readonly content: MutableAssemblyContent
  readonly defaultBlueprintSettings: PropertiesTable<OverrideableBlueprintSettings>
  readonly localEvents: SimpleSubscribable<LocalAssemblyEvent>

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
  readonly assembly: UserAssembly

  readonly stageBlueprintSettings: StageBlueprintSettingsTable
  getBlueprintSettingsView(): PropertiesTable<StageBlueprintSettings>

  getBlueprintBBox(): BBox
  autoSetTiles(tiles: AutoSetTilesType): boolean
  readonly valid: boolean
  deleteInAssembly(): void
}

export interface AssemblyCreatedEvent {
  readonly type: "assembly-created"
  readonly assembly: UserAssembly
}
export interface AssemblyDeletedEvent {
  readonly type: "assembly-deleted"
  readonly assembly: UserAssembly
}

export interface AssembliesReorderedEvent {
  readonly type: "assemblies-reordered"
  readonly assembly1: UserAssembly
  readonly assembly2: UserAssembly
}
export interface StageAddedEvent {
  readonly type: "stage-added"
  readonly assembly: UserAssembly
  readonly stage: Stage
}
export interface PreStageDeletedEvent {
  readonly type: "pre-stage-deleted"
  readonly assembly: UserAssembly
  readonly stage: Stage
}
export interface StageDeletedEvent {
  readonly type: "stage-deleted"
  readonly assembly: UserAssembly
  readonly stage: Stage
}
export type GlobalAssemblyEvent =
  | AssemblyCreatedEvent
  | AssemblyDeletedEvent
  | AssembliesReorderedEvent
  | StageAddedEvent
  | PreStageDeletedEvent
  | StageDeletedEvent
export type LocalAssemblyEvent = AssemblyDeletedEvent | StageAddedEvent | PreStageDeletedEvent | StageDeletedEvent
