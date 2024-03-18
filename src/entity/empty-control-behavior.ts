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

import { BlueprintControlBehavior } from "factorio:runtime"
import { ProjectEntity, StageNumber } from "./ProjectEntity"
import { OnPrototypeInfoLoaded } from "./prototype-info"

export const emptyBeltControlBehavior: BlueprintControlBehavior = {
  circuit_enable_disable: false,
  circuit_read_hand_contents: false,
  circuit_contents_read_mode: 0,
}
export const emptyInserterControlBehavior: BlueprintControlBehavior = {
  circuit_mode_of_operation: defines.control_behavior.inserter.circuit_mode_of_operation.none,
}

let nameToType: ReadonlyLuaMap<string, string>
OnPrototypeInfoLoaded.addListener((info) => {
  nameToType = info.nameToType
})

export function maybeSetEmptyControlBehavior(entity: ProjectEntity, stageNumber: StageNumber): boolean {
  if (!(stageNumber > entity.firstStage && entity.firstValue.control_behavior == nil)) return false
  const type = nameToType.get(entity.firstValue.name)
  if (type == "inserter") {
    entity.setPropAtStage(entity.firstStage, "control_behavior", emptyInserterControlBehavior)
    return true
  }
  if (type == "transport-belt") {
    entity.setPropAtStage(entity.firstStage, "control_behavior", emptyBeltControlBehavior)
    return true
  }
  return false
}
