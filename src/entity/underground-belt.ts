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

import { direction_vectors, oppositedirection } from "util"
import { Mutable } from "../lib"
import { Pos, Position } from "../lib/geometry"
import { ProjectContent } from "./ProjectContent"
import { StageNumber, UndergroundBeltProjectEntity } from "./ProjectEntity"
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

export function undergroundCanReach(
  entity1: UndergroundBeltProjectEntity,
  entity2: UndergroundBeltProjectEntity,
  ugName: string,
): boolean {
  const reach = prototypes.entity[ugName].max_underground_distance
  if (!reach) return false
  return Pos.manhattanDistance(entity1.position, entity2.position) <= reach
}

export function findUndergroundPair(
  content: ProjectContent,
  member: UndergroundBeltProjectEntity,
  stage: StageNumber,
  name: string = member.getNameAtStage(stage),
  ignore?: UndergroundBeltProjectEntity,
): UndergroundBeltProjectEntity | nil {
  const reach = prototypes.entity[name].max_underground_distance
  if (!reach) return

  const direction = getUndergroundDirection(member.direction, member.firstValue.type)
  const otherDirection = oppositedirection(direction)

  const { x, y } = member.position
  const [dx, dy] = direction_vectors[direction]

  // find pair
  // If multiple possible, break ties first by stage, then by closeness
  let currentPair: UndergroundBeltProjectEntity | nil = nil
  let shadowStage: StageNumber = Infinity
  const curPos = {} as Mutable<Position>
  for (const i of $range(1, reach)) {
    curPos.x = x + i * dx
    curPos.y = y + i * dy
    const candidate = content.findCompatibleEntity(name, curPos, nil, stage) as UndergroundBeltProjectEntity | nil
    if (
      !candidate ||
      candidate.getNameAtStage(stage) != name ||
      candidate.firstStage >= shadowStage ||
      candidate == ignore
    )
      continue
    const candidateDirection = getUndergroundDirection(candidate.direction, candidate.firstValue.type)
    if (candidateDirection == direction) {
      // same direction and type; can shadow
      shadowStage = min(shadowStage, candidate.firstStage)
      if (shadowStage <= stage) break
    }
    if (candidateDirection == otherDirection) {
      if (candidate.firstStage <= stage) return candidate
      if (currentPair == nil || candidate.firstStage < currentPair.firstStage) currentPair = candidate
    }
  }
  return currentPair
}
