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

import { AssemblyEntity, StageNumber } from "../entity/AssemblyEntity"
import { DefaultEntityHandler, EntityCreator } from "../entity/EntityHandler"
import { AssemblyContent } from "./AssemblyContent"
import { DefaultEntityHighlighter, EntityHighlighter } from "./EntityHighlighter"
import { DefaultWireHandler, WireUpdater } from "./WireHandler"

/**
 * Updates entities in the world in response to changes in the assembly.
 *
 * This includes highlight entities.
 * @noSelf
 */
export interface WorldUpdater {
  /**
   * Re-syncs all stage entities for a given assembly entity.
   * @param assembly the assembly position info
   * @param entity the assembly entity
   * @param startStage
   * @param endStage inclusive. If not specified, defaults to the max assembly stage
   * @param replace if entities should be replaced (deleted and created) instead of updated
   */
  updateWorldEntities(
    assembly: AssemblyContent,
    entity: AssemblyEntity,
    startStage: StageNumber,
    endStage?: StageNumber,
    replace?: boolean,
  ): void

  forceDeleteEntity(assembly: AssemblyContent, entity: AssemblyEntity, stage: StageNumber): void

  deleteWorldEntitiesInStage(entity: AssemblyEntity, stage: StageNumber): void

  deleteWorldEntities(entity: AssemblyEntity): void
  deleteExtraEntitiesOnly(entity: AssemblyEntity): void

  makeSettingsRemnant(assembly: AssemblyContent, entity: AssemblyEntity): void
  reviveSettingsRemnant(assembly: AssemblyContent, entity: AssemblyEntity): void
}

export function createWorldUpdater(
  entityCreator: EntityCreator,
  wireHandler: WireUpdater,
  highlighter: EntityHighlighter,
): WorldUpdater {
  const { createEntity, updateEntity } = entityCreator
  const { updateWireConnections } = wireHandler
  const { updateHighlights } = highlighter

  function doUpdateWorldEntities(
    assembly: AssemblyContent,
    entity: AssemblyEntity,
    startStage: number,
    endStage: number,
    replace: boolean | undefined,
  ): void {
    const firstStage = entity.getFirstStage()

    const direction = entity.direction ?? 0
    for (const [stageNum, value] of entity.iterateValues(startStage, endStage)) {
      if (value === nil) {
        entity.destroyWorldEntity(stageNum, "mainEntity")
        continue
      }

      const existing = entity.getWorldEntity(stageNum)
      let luaEntity: LuaEntity | undefined
      if (existing && !replace) {
        luaEntity = updateEntity(existing, value, direction)
      } else {
        if (existing) existing.destroy()
        luaEntity = createEntity(assembly.getStage(stageNum)!, entity, value)
      }
      entity.replaceWorldEntity(stageNum, luaEntity)

      if (luaEntity) {
        if (stageNum !== firstStage) makeEntityIndestructible(luaEntity)
        else makeEntityDestructible(luaEntity)
        updateWireConnections(assembly, entity, stageNum, luaEntity)
      }
    }
  }

  function updateWorldEntities(
    assembly: AssemblyContent,
    entity: AssemblyEntity,
    startStage: StageNumber,
    endStage?: StageNumber,
    replace?: boolean,
  ): void {
    assert(!entity.isSettingsRemnant)

    if (startStage < 1) startStage = 1
    const maxStage = assembly.numStages()
    if (!endStage || endStage > maxStage) endStage = maxStage
    if (startStage > endStage) return

    doUpdateWorldEntities(assembly, entity, startStage, endStage, replace)
    updateHighlights(assembly, entity, startStage, endStage)
  }

  function forceDeleteEntity(assembly: AssemblyContent, entity: AssemblyEntity, stage: StageNumber): void {
    entity.destroyWorldEntity(stage, "mainEntity")
    updateHighlights(assembly, entity, stage, stage)
  }

  function makeEntityIndestructible(entity: LuaEntity) {
    entity.minable = false
    entity.rotatable = false
    entity.destructible = false
  }
  function makeEntityDestructible(entity: LuaEntity) {
    entity.minable = true
    entity.rotatable = true
    entity.destructible = false
  }

  function makeSettingsRemnant(assembly: AssemblyContent, entity: AssemblyEntity): void {
    assert(entity.isSettingsRemnant)
    entity.destroyAllWorldEntities("mainEntity")
    highlighter.makeSettingsRemnant(assembly, entity)
  }
  function reviveSettingsRemnant(assembly: AssemblyContent, entity: AssemblyEntity): void {
    assert(!entity.isSettingsRemnant)
    doUpdateWorldEntities(assembly, entity, 1, assembly.numStages(), true)
    highlighter.reviveSettingsRemnant(assembly, entity)
  }

  return {
    updateWorldEntities,
    forceDeleteEntity,
    deleteWorldEntities(entity: AssemblyEntity): void {
      entity.destroyAllWorldEntities("mainEntity")
      highlighter.deleteHighlights(entity)
    },
    deleteWorldEntitiesInStage(entity: AssemblyEntity, stage: StageNumber): void {
      entity.destroyWorldEntity(stage, "mainEntity")
      highlighter.deleteHighlightsInStage(entity, stage)
    },
    deleteExtraEntitiesOnly(entity: AssemblyEntity): void {
      highlighter.deleteHighlights(entity)
      for (const [, luaEntity] of entity.iterateWorldEntities("mainEntity")) {
        makeEntityDestructible(luaEntity)
      }
    },
    makeSettingsRemnant,
    reviveSettingsRemnant,
  }
}

export const DefaultWorldUpdater = createWorldUpdater(
  DefaultEntityHandler,
  DefaultWireHandler,
  DefaultEntityHighlighter,
)
