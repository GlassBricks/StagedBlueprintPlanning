/*
 * Copyright (c) 2023 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { AssemblyContent } from "./AssemblyContent"
import { AssemblyEntity, StageNumber } from "./AssemblyEntity"
import { nameToType } from "./entity-info"

export declare const enum StageRangeChangeResult {
  Changed = "changed",
  NoChange = "no-change",
  CannotSetPastLastStage = "cannot-set-past-last-stage",
  CannotSetBeforeFirstStage = "cannot-set-before-first-stage",

  IntersectsAnotherEntity = "intersects-another-entity",
}

export function trySetFirstStage(
  content: AssemblyContent,
  entity: AssemblyEntity,
  newStage: StageNumber,
): StageRangeChangeResult {
  if (newStage == entity.firstStage) return StageRangeChangeResult.NoChange
  // check firstStage <= lastStage
  if (entity.lastStage && newStage > entity.lastStage) return StageRangeChangeResult.CannotSetPastLastStage

  if (!firstStageChangeWillIntersect(content, entity, newStage)) {
    return StageRangeChangeResult.IntersectsAnotherEntity
  }
  entity.setFirstStageUnchecked(newStage)
  return StageRangeChangeResult.Changed
}

function firstStageChangeWillIntersect(
  content: AssemblyContent,
  entity: AssemblyEntity,
  newStage: StageNumber,
): boolean {
  // moving up is ok
  if (newStage >= entity.firstStage) return true

  // check moving down
  const name = entity.firstValue.name
  const foundBelow = content.findCompatibleWithLuaEntity(
    {
      name,
      type: nameToType.get(name)!,
      position: entity.position,
      direction: entity.getDirection(),
      belt_to_ground_type: entity.isUndergroundBelt() ? entity.firstValue.type : nil,
    },
    nil,
    newStage,
  )

  return foundBelow == nil || foundBelow == entity
}

export function trySetLastStage(
  content: AssemblyContent,
  entity: AssemblyEntity,
  newStage: StageNumber | nil,
): StageRangeChangeResult {
  if (newStage == entity.lastStage) return StageRangeChangeResult.NoChange

  // check firstStage <= lastStage
  if (newStage != nil && newStage < entity.firstStage) return StageRangeChangeResult.CannotSetBeforeFirstStage

  if (!lastStageChangeWillIntersect(content, entity, newStage)) {
    return StageRangeChangeResult.IntersectsAnotherEntity
  }

  entity.setLastStageUnchecked(newStage)
  return StageRangeChangeResult.Changed
}
function lastStageChangeWillIntersect(
  content: AssemblyContent,
  entity: AssemblyEntity,
  newStage: StageNumber | nil,
): boolean {
  const { lastStage } = entity
  // moving down is ok
  if (lastStage == nil || (newStage != nil && newStage < lastStage)) return true

  // check moving up
  const name = entity.firstValue.name
  const foundAbove = content.findCompatibleWithLuaEntity(
    {
      name,
      type: nameToType.get(name)!,
      position: entity.position,
      direction: entity.getDirection(),
      belt_to_ground_type: entity.isUndergroundBelt() ? entity.firstValue.type : nil,
    },
    nil,
    lastStage + 1,
  )
  return foundAbove == nil || (newStage != nil && foundAbove.firstStage > newStage)
}
