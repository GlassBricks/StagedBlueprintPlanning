/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of 100% Blueprint Planning.
 *
 * 100% Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * 100% Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with 100% Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { StageNumber } from "../entity/AssemblyEntity"
import { MutableEntityMap } from "../entity/EntityMap"
import { MutableState, Observable, PRecord, State } from "../lib"
import { Position } from "../lib/geometry"

export type AssemblyId = number & { _assemblyIdBrand: never }
export interface Assembly {
  maxStage(): StageNumber

  getStageName(stage: StageNumber): LocalisedString
  getSurface(stage: StageNumber): LuaSurface | nil
  readonly content: MutableEntityMap
}
export interface UserAssembly extends Assembly {
  readonly id: AssemblyId

  readonly name: MutableState<string>
  readonly displayName: State<LocalisedString>

  readonly content: MutableEntityMap

  readonly localEvents: Observable<LocalAssemblyEvent>

  readonly lastPlayerPosition: PRecord<
    PlayerIndex,
    {
      stageNumber: StageNumber
      position: Position
    }
  >

  getStage(stageNumber: StageNumber): Stage | nil
  getAllStages(): readonly Stage[]

  insertStage(index: StageNumber): Stage
  /** Cannot be first stage, contents will be merged with previous stage. */
  deleteStage(index: StageNumber): void

  readonly blueprintBookSettings: BlueprintBookSettings
  makeBlueprintBook(stackToSet: LuaItemStack): boolean

  readonly valid: boolean
  delete(): void
}
export interface BlueprintBookSettings {
  readonly autoLandfill: MutableState<boolean>

  useNextStageTiles: MutableState<boolean>
}

export interface Stage {
  readonly surface: LuaSurface

  readonly name: MutableState<string>

  readonly stageNumber: StageNumber
  readonly assembly: UserAssembly

  /** The blueprint should be treated as readonly. */
  takeBlueprint(): BlueprintItemStack | nil

  /** Opens blueprint edit gui for player. Returns if successful. */
  editBlueprint(player: LuaPlayer): boolean

  autoSetTiles(tiles: AutoSetTilesType): boolean

  readonly valid: boolean
  deleteInAssembly(): void
}

export const enum AutoSetTilesType {
  LabTiles,
  LandfillAndWater,
  LandfillAndLabTiles,
}

export interface AssemblyCreatedEvent {
  readonly type: "assembly-created"
  readonly assembly: UserAssembly
}
export interface AssemblyDeletedEvent {
  readonly type: "assembly-deleted"
  readonly assembly: UserAssembly
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
  | StageAddedEvent
  | PreStageDeletedEvent
  | StageDeletedEvent
export type LocalAssemblyEvent = AssemblyDeletedEvent | StageAddedEvent | PreStageDeletedEvent | StageDeletedEvent
