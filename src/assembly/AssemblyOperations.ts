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

import { Prototypes } from "../constants"
import {
  AssemblyEntity,
  isWorldEntityAssemblyEntity,
  RollingStockAssemblyEntity,
  StageNumber,
} from "../entity/AssemblyEntity"
import { Entity } from "../entity/Entity"
import { assertNever } from "../lib"
import { AssemblyEvents } from "./Assembly"
import { AssemblyData, StageSurface } from "./AssemblyDef"
import { AssemblyUpdater } from "./AssemblyUpdater"
import { WorldUpdater } from "./WorldUpdater"

/**
 * User and miscellaneous operations on assemblies.
 * @noSelf
 */
export interface AssemblyOperations {
  /** Delete all extra (non-main) entities in the assembly. Before assembly deletion. */
  deleteAllExtraEntitiesOnly(assembly: AssemblyData): void

  resetStage(assembly: AssemblyData, stage: StageNumber): void

  resetProp<T extends Entity>(
    assembly: AssemblyData,
    entity: AssemblyEntity<T>,
    stageNumber: StageNumber,
    prop: keyof T,
  ): boolean
  movePropDown<T extends Entity>(
    assembly: AssemblyData,
    entity: AssemblyEntity<T>,
    stageNumber: StageNumber,
    prop: keyof T,
  ): boolean

  resetAllProps(assembly: AssemblyData, entity: AssemblyEntity, stageNumber: StageNumber): boolean
  moveAllPropsDown(assembly: AssemblyData, entity: AssemblyEntity, stageNumber: StageNumber): boolean

  resetTrain(assembly: AssemblyData, entity: RollingStockAssemblyEntity): void
  setTrainLocationToCurrent(assembly: AssemblyData, entity: RollingStockAssemblyEntity): void
}

/** @noSelf */
export interface AssemblyOpWorldInteractor {
  deleteAllWorldEntities(stage: StageSurface): void
}

export function createAssemblyOperations(
  assemblyUpdater: AssemblyUpdater,
  worldUpdater: WorldUpdater,
  worldInteractor: AssemblyOpWorldInteractor,
): AssemblyOperations {
  const { updateWorldEntities, deleteExtraEntitiesOnly } = worldUpdater

  return {
    deleteAllExtraEntitiesOnly(assembly: AssemblyData) {
      for (const entity of assembly.content.iterateAllEntities()) {
        deleteExtraEntitiesOnly(entity)
      }
    },
    resetStage(assembly: AssemblyData, stageNumber: StageNumber) {
      const stage = assembly.getStage(stageNumber)
      if (!stage) return
      worldInteractor.deleteAllWorldEntities(stage)
      const updateLater: RollingStockAssemblyEntity[] = []
      for (const entity of assembly.content.iterateAllEntities()) {
        if (entity.isRollingStock()) {
          updateLater.push(entity)
        } else {
          updateWorldEntities(assembly, entity, stageNumber, stageNumber)
        }
      }
      for (const entity of updateLater) {
        updateWorldEntities(assembly, entity, stageNumber, stageNumber)
      }
    },
    resetProp<T extends Entity>(
      assembly: AssemblyData,
      entity: AssemblyEntity<T>,
      stageNumber: StageNumber,
      prop: keyof T,
    ): boolean {
      const moved = entity.resetProp(stageNumber, prop)
      if (moved) updateWorldEntities(assembly, entity, stageNumber, nil)
      return moved
    },
    movePropDown<T extends Entity>(
      assembly: AssemblyData,
      entity: AssemblyEntity<T>,
      stageNumber: StageNumber,
      prop: keyof T,
    ): boolean {
      const movedStage = entity.movePropDown(stageNumber, prop)
      if (movedStage) {
        updateWorldEntities(assembly, entity, movedStage, nil)
        return true
      }
      return false
    },
    resetAllProps(assembly: AssemblyData, entity: AssemblyEntity, stageNumber: StageNumber): boolean {
      const moved = entity.resetValue(stageNumber)
      if (moved) updateWorldEntities(assembly, entity, stageNumber, nil)
      return moved
    },
    moveAllPropsDown(assembly: AssemblyData, entity: AssemblyEntity, stageNumber: StageNumber): boolean {
      const movedStage = entity.moveValueDown(stageNumber)
      if (movedStage) {
        updateWorldEntities(assembly, entity, movedStage, nil)
        return true
      }
      return false
    },
    resetTrain(assembly: AssemblyData, entity: RollingStockAssemblyEntity): void {
      const stage = entity.firstStage
      const luaEntity = entity.getWorldEntity(stage)
      if (!luaEntity) {
        updateWorldEntities(assembly, entity, stage, stage, true)
        return
      }

      const train = luaEntity.train
      if (!train) return

      const entities = train.carriages

      const content = assembly.content
      const assemblyEntities = entities.map((e) => content.findCompatible(e, nil)!)
      for (const entity of assemblyEntities) entity.destroyAllWorldOrPreviewEntities()
      for (const entity of assemblyEntities) updateWorldEntities(assembly, entity, stage, stage, true)
    },
    setTrainLocationToCurrent(assembly: AssemblyData, entity: RollingStockAssemblyEntity): void {
      const stageNum = entity.firstStage
      const luaEntity = entity.getWorldEntity(stageNum)
      if (!luaEntity) return

      const train = luaEntity.train
      if (!train) return

      const entities = train.carriages
      const content = assembly.content

      for (const luaEntity of entities) {
        // todo: make this part of AssemblyUpdater instead?
        const assemblyEntity = content.findCompatible(luaEntity, nil)
        if (assemblyEntity) {
          deleteExtraEntitiesOnly(assemblyEntity)
          content.changePosition(assemblyEntity, luaEntity.position)
          updateWorldEntities(assembly, assemblyEntity, stageNum, stageNum)
        } else {
          // add
          assemblyUpdater.onEntityCreated(assembly, stageNum, luaEntity, nil)
        }
      }
    },
  }
}

const AssemblyWorldInteractor: AssemblyOpWorldInteractor = {
  deleteAllWorldEntities(stage: StageSurface) {
    for (const entity of stage.surface.find_entities()) {
      if (isWorldEntityAssemblyEntity(entity)) entity.destroy()
    }
    for (const entity of stage.surface.find_entities_filtered({
      type: ["simple-entity-with-owner", "rail-remnants"], // todo: get actual list of preview entities
    })) {
      const name = entity.name
      if (name.startsWith(Prototypes.PreviewEntityPrefix)) entity.destroy()
    }
  },
}

export const AssemblyOperations = createAssemblyOperations(AssemblyUpdater, WorldUpdater, AssemblyWorldInteractor)

AssemblyEvents.addListener((e) => {
  switch (e.type) {
    case "assembly-created":
    case "assembly-deleted":
      break
    case "stage-added": {
      AssemblyOperations.resetStage(e.assembly, e.stage.stageNumber)
      break
    }
    case "pre-stage-deleted":
      break
    case "stage-deleted": {
      const stageNumber = e.stage.stageNumber
      const stageNumberToMerge = stageNumber === 1 ? 2 : stageNumber - 1
      AssemblyOperations.resetStage(e.assembly, stageNumberToMerge)
      break
    }
    default:
      assertNever(e)
  }
})
