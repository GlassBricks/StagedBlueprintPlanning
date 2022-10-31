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

import { AssemblyEntity, StageNumber } from "./AssemblyEntity"
import { nameToType } from "./entity-info"

export const emptyBeltControlBehavior: BlueprintControlBehavior = {
  circuit_enable_disable: false,
  circuit_read_hand_contents: false,
  circuit_contents_read_mode: 0,
}
export const emptyInserterControlBehavior: BlueprintControlBehavior = {
  circuit_mode_of_operation: defines.control_behavior.inserter.circuit_mode_of_operation.none,
}

export function hasControlBehaviorSet(entity: AssemblyEntity, stageNumber: StageNumber): boolean {
  const firstStage = entity.firstStage
  if (firstStage >= stageNumber) return false
  const [existingProp, setStage] = entity.getPropAtStage(stageNumber, "control_behavior")
  return !(existingProp === nil && setStage === firstStage)
}

export function fixEmptyControlBehavior(entity: AssemblyEntity): void {
  const firstStage = entity.firstStage
  const type = nameToType.get(entity.firstValue.name)
  if (type === "inserter") {
    entity.setPropAtStage(firstStage, "control_behavior", emptyInserterControlBehavior)
  } else if (type === "transport-belt") {
    entity.setPropAtStage(firstStage, "control_behavior", emptyBeltControlBehavior)
  }
}
