/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of BBPP3.
 *
 * BBPP3 is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * BBPP3 is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with BBPP3. If not, see <https://www.gnu.org/licenses/>.
 */

import { isWorldEntityAssemblyEntity, StageNumber } from "../entity/AssemblyEntity"
import { AssemblyContent, StagePosition } from "./AssemblyContent"
import { DefaultWorldUpdater, WorldUpdater } from "./WorldUpdater"

/**
 * User and miscellaneous operations on an entire assembly at once.
 * @noSelf
 */
export interface AssemblyOperations {
  /** Delete all extra (non-main) entities in the assembly. Before assembly deletion. */
  deleteAllExtraEntitiesOnly(assembly: AssemblyContent): void
  deleteStageEntities(assembly: AssemblyContent, stageNumber: StageNumber): void

  resetStage(assembly: AssemblyContent, stage: StagePosition): void
}

/** @noSelf */
export interface AssemblyOpWorldInteractor {
  deleteAllWorldEntities(stage: StagePosition): void
}

export function createAssemblyOperations(
  worldUpdater: WorldUpdater,
  worldInteractor: AssemblyOpWorldInteractor,
): AssemblyOperations {
  const { updateWorldEntities, deleteExtraEntitiesOnly, deleteAllEntitiesInStage } = worldUpdater

  function deleteAllExtraEntitiesOnly(assembly: AssemblyContent) {
    for (const entity of assembly.content.iterateAllEntities()) {
      deleteExtraEntitiesOnly(entity)
    }
  }

  function resetStage(assembly: AssemblyContent, stage: StagePosition) {
    worldInteractor.deleteAllWorldEntities(stage)
    const stageNumber = stage.stageNumber
    for (const entity of assembly.content.iterateAllEntities()) {
      updateWorldEntities(assembly, entity, stageNumber, stageNumber, true)
    }
  }

  function deleteStageEntities(assembly: AssemblyContent, stageNumber: StageNumber) {
    for (const entity of assembly.content.iterateAllEntities()) {
      deleteAllEntitiesInStage(entity, stageNumber)
    }
  }

  return {
    deleteAllExtraEntitiesOnly,
    deleteStageEntities,
    resetStage,
  }
}

const DefaultWorldInteractor: AssemblyOpWorldInteractor = {
  deleteAllWorldEntities(stage: StagePosition) {
    stage.surface
      .find_entities_filtered({ area: stage })
      .filter((x) => isWorldEntityAssemblyEntity(x))
      .forEach((x) => x.destroy())
  },
}

export const AssemblyOperations = createAssemblyOperations(DefaultWorldUpdater, DefaultWorldInteractor)
