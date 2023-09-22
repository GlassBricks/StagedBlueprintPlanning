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
import { Position } from "../lib/geometry"
import { MutableProjectContent } from "./ProjectContent"
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

/**
 * Finds an underground pair. If there are multiple possible pairs, returns the first one, and true as the second return value.
 */
export function findUndergroundPair(
  content: MutableProjectContent,
  member: UndergroundBeltProjectEntity,
  stage: StageNumber,
  name: string = member.getNameAtStage(stage),
): UndergroundBeltProjectEntity | nil {
  const reach = game.entity_prototypes[name].max_underground_distance
  if (!reach) return

  const direction = getUndergroundDirection(member.direction, member.firstValue.type)
  const otherDirection = oppositedirection(direction)

  const { x, y } = member.position
  const [dx, dy] = direction_vectors[direction]

  // find pair: first by stage, then by closeness

  let currentPair: UndergroundBeltProjectEntity | nil = nil
  let shadowStage: StageNumber = Infinity
  const curPos = {} as Mutable<Position>
  for (const i of $range(1, reach)) {
    curPos.x = x + i * dx
    curPos.y = y + i * dy
    const candidate = content.findCompatibleByProps(name, curPos, nil, stage) as UndergroundBeltProjectEntity | nil
    if (!candidate || candidate.getNameAtStage(stage) != name || candidate.firstStage >= shadowStage) continue
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
    // if <= firstStage, can't get any better, and is closest
  }
  return currentPair
}
