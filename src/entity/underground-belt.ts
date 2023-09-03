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

import { oppositedirection } from "util"
import { Mutable } from "../lib"
import { Pos, Position, PositionClass } from "../lib/geometry"
import { MutableProjectContent } from "./ProjectContent"
import { ProjectEntity, UndergroundBeltProjectEntity } from "./ProjectEntity"
import max = math.max
import min = math.min

/**
 * Gets the underground direction (direction of where a paired underground belt would be).
 */
export function getUndergroundDirection(
  direction: defines.direction,
  undergroundBeltType: "input" | "output" | nil,
): defines.direction {
  if (undergroundBeltType == "output") return oppositedirection(direction)
  return direction
}

/**
 * Finds an underground pair. If there are multiple possible pairs, returns the first one, and true as the second return value.
 */
export function findUndergroundPair(
  content: MutableProjectContent,
  entity: UndergroundBeltProjectEntity,
): LuaMultiReturn<[underground: UndergroundBeltProjectEntity | nil, hasMultiple: boolean]> {
  const [pair, hasMultiple] = findUndergroundPairOneDirection(content, entity)
  if (!pair || hasMultiple) return $multi(pair, hasMultiple)

  const [pairPair, pairHasMultiple] = findUndergroundPairOneDirection(content, pair)
  if (pairHasMultiple) {
    return $multi(pair, true)
  }
  if (pairPair != entity) return $multi(nil, false)
  return $multi(pair, false)
}

function findUndergroundPairOneDirection(
  content: MutableProjectContent,
  member: UndergroundBeltProjectEntity,
): LuaMultiReturn<[underground: UndergroundBeltProjectEntity | nil, hasMultiple: boolean]> {
  const name = member.firstValue.name
  const reach = game.entity_prototypes[name].max_underground_distance
  if (!reach) return $multi(nil, false)

  const direction = getUndergroundDirection(member.direction, member.firstValue.type)
  const otherDirection = oppositedirection(direction)

  const { x, y } = member.position
  const { x: dx, y: dy } = unit(direction)

  // let found: UndergroundBeltProjectEntity | nil
  const firstStage = member.firstStage
  const lastStage = member.lastStage ?? math.huge
  let pair: UndergroundBeltProjectEntity | nil = nil
  const curPos = {} as Mutable<Position>
  for (const i of $range(1, reach)) {
    curPos.x = x + i * dx
    curPos.y = y + i * dy
    const found = content.findCompatibleByProps(name, curPos, nil, firstStage) as UndergroundBeltProjectEntity | nil
    if (
      !(
        found &&
        getUndergroundDirection(found.direction, found.firstValue.type) == otherDirection &&
        found.firstValue.name == name
      )
    )
      continue
    if (pair == nil) {
      pair = found
    } else {
      // if the first pair completely shadows the second pair, then we don't count it
      if (stageRangeCovers(pair, found, firstStage, lastStage)) continue

      return $multi(pair, true)
    }
  }
  return $multi(pair, false)
}

export function unit(direction: defines.direction): PositionClass {
  if (direction == defines.direction.north) return Pos(0, -1)
  if (direction == defines.direction.south) return Pos(0, 1)
  if (direction == defines.direction.west) return Pos(-1, 0)
  if (direction == defines.direction.east) return Pos(1, 0)
  error("Invalid direction: " + direction)
}

export function stageRangeCovers(
  existing: ProjectEntity,
  newEntity: ProjectEntity,
  minStage: number,
  maxStage: number,
): boolean {
  // covers:
  // |---- existing  ----|
  //   |-- newEntity --|
  const existingFirstStage = max(existing.firstStage, minStage)
  const existingLastStage = min(existing.lastStage ?? math.huge, maxStage)
  const newEntityFirstStage = max(newEntity.firstStage, minStage)
  const newEntityLastStage = min(newEntity.lastStage ?? math.huge, maxStage)
  return existingFirstStage <= newEntityFirstStage && existingLastStage >= newEntityLastStage
}
