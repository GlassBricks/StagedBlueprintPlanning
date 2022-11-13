/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { oppositedirection } from "util"
import { SavedDirection } from "./AssemblyEntity"
import { Entity } from "./Entity"
import { isUndergroundBeltType, rollingStockTypes } from "./entity-info"
import floor = math.floor

export interface UndergroundBeltEntity extends Entity {
  type: "input" | "output"
}
export type LoaderEntity = UndergroundBeltEntity
export interface RollingStockEntity extends Entity {
  orientation?: RealOrientation
}
/** Inverts direction if is a output underground belt. */
export function getSavedDirection(entity: LuaEntity): SavedDirection {
  const type = entity.type
  if (type == "underground-belt") {
    if (entity.belt_to_ground_type == "output") {
      return oppositedirection(entity.direction) as SavedDirection
    }
  } else if (rollingStockTypes.has(type)) {
    return 0 as SavedDirection
  }
  return entity.direction as SavedDirection
}

export function getPastedDirection(entity: BlueprintEntity, direction: defines.direction): defines.direction | nil {
  if (entity.orientation != nil) return nil
  const isUnderground = isUndergroundBeltType(entity.name)
  if (isUnderground && entity.type == "output") {
    return oppositedirection(direction)
  }
  return direction
}

export function orientationToDirection(orientation: RealOrientation | nil): defines.direction {
  if (orientation == nil) return 0
  return floor(orientation * 8 + 0.5) % 8
}

export function makePreviewIndestructible(entity: LuaEntity | nil): void {
  if (!entity) return
  entity.destructible = false
  entity.minable = false
  entity.rotatable = false
  if (entity.type == "rail-remnants") {
    entity.corpse_expires = false
    entity.corpse_immune_to_entity_placement = true
  }
}
