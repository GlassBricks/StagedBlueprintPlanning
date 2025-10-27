// Copyright (c) 2022-2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { BlueprintInsertPlan, LuaSurface, RealOrientation } from "factorio:runtime"
import { EntityType } from "factorio:prototype"
import { Position } from "../lib/geometry"

export interface Entity {
  readonly name: string
  readonly quality?: string
  // modules only
  readonly items?: BlueprintInsertPlan[]
}

export interface UnstagedEntityProps {
  // non-modules
  readonly items?: BlueprintInsertPlan[]
  readonly _forTest?: unknown
}

export interface EntityIdentification {
  readonly name: string
  readonly type: EntityType
  readonly position: Position
  readonly direction: defines.direction
  readonly belt_to_ground_type: "input" | "output" | nil
  readonly object_name?: string
}
export interface LuaEntityInfo extends EntityIdentification {
  readonly surface: LuaSurface
  readonly position: Position
  readonly valid?: boolean
}
export interface UndergroundBeltEntity extends Entity {
  type: "input" | "output"
}
export type LoaderEntity = UndergroundBeltEntity
export interface InserterEntity extends Entity {
  override_stack_size?: number
  drop_position?: Position
  pickup_position?: Position
}
export interface MovableEntity extends Entity {
  orientation?: RealOrientation
}
export interface AssemblingMachineEntity extends Entity {
  recipe?: string
  recipe_quality?: string
}
