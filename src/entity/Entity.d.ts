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

import { BlueprintInsertPlan, LuaSurface, RealOrientation } from "factorio:runtime"
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
}

export interface EntityIdentification {
  readonly name: string
  readonly type: string
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
export interface RollingStockEntity extends Entity {
  orientation?: RealOrientation
}
export interface AssemblingMachineEntity extends Entity {
  recipe?: string
  recipe_quality?: string
}
