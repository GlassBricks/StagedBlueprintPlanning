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

import { oppositedirection } from "util"
import { Entity } from "./Entity"
import { isUndergroundBeltType } from "./entity-info"

/** Inverts direction if is a output underground belt. */
export function getSavedDirection(entity: LuaEntity): defines.direction {
  if (entity.type === "underground-belt" && entity.belt_to_ground_type === "output") {
    return oppositedirection(entity.direction)
  }
  return entity.direction
}

export function getPastedDirection(entity: BlueprintEntity, direction: defines.direction): defines.direction {
  const name = entity.name
  const isUnderground = isUndergroundBeltType(name)
  if (isUnderground && entity.type === "output") {
    return oppositedirection(direction)
  }
  return direction
}

export interface UndergroundBeltEntity extends Entity {
  type: "input" | "output"
}
