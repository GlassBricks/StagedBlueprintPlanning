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
import { AssemblyEntity, StageNumber, UndergroundBeltAssemblyEntity } from "../entity/AssemblyEntity"
import { Mutable } from "../lib"
import { Pos, Position, PositionClass } from "../lib/geometry"
import { MutableEntityMap } from "./EntityMap"

/**
 * Finds an underground pair. If there are multiple possible pairs, returns the first one, and true as the second return value.
 */
export function findUndergroundPair(
  content: MutableEntityMap,
  member: AssemblyEntity,
): LuaMultiReturn<[underground: UndergroundBeltAssemblyEntity | nil, hasMultiple: boolean]> {
  const [pair, hasMultiple] = findUndergroundPairOneDirection(content, member)
  if (!pair || hasMultiple) return $multi(pair, hasMultiple)

  const [, pairHasMultiple] = findUndergroundPairOneDirection(content, pair)
  return $multi(pair, pairHasMultiple)
}

function findUndergroundPairOneDirection(
  content: MutableEntityMap,
  member: AssemblyEntity,
): LuaMultiReturn<[underground: UndergroundBeltAssemblyEntity | nil, hasMultiple: boolean]> {
  const name = member.firstValue.name
  const reach = game.entity_prototypes[name].max_underground_distance
  if (!reach) return $multi(nil, false)

  const direction = member.getDirection()
  const otherDirection = oppositedirection(direction)

  const { x, y } = member.position
  const { x: dx, y: dy } = unit(direction)

  let found: UndergroundBeltAssemblyEntity | nil
  const curPos = {} as Mutable<Position>
  for (const i of $range(1, reach)) {
    curPos.x = x + i * dx
    curPos.y = y + i * dy
    const underground = content.findCompatibleByName(name, curPos, otherDirection) as
      | UndergroundBeltAssemblyEntity
      | nil
    if (underground && underground.firstValue.name === name) {
      if (found) return $multi(found, true)
      found = underground
    }
  }
  return $multi(found, false)
}

export function unit(direction: defines.direction): PositionClass {
  if (direction === defines.direction.north) return Pos(0, -1)
  if (direction === defines.direction.south) return Pos(0, 1)
  if (direction === defines.direction.west) return Pos(-1, 0)
  if (direction === defines.direction.east) return Pos(1, 0)
  error("Invalid direction: " + direction)
}

// todo: refactor this
export function getPreviewStages(entity: AssemblyEntity): LuaMultiReturn<[StageNumber | nil, StageNumber | nil]> {
  if (entity.isRollingStock()) {
    const firstStage = entity.firstStage
    return $multi(firstStage, firstStage)
  }
  return $multi(nil, nil)
}
