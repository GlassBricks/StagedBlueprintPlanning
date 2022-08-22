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

import { AssemblyEntity, LayerNumber } from "../entity/AssemblyEntity"
import { DefaultEntityHandler, EntityCreator } from "../entity/EntityHandler"
import { AssemblyContent } from "./Assembly"
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
   * Re-syncs all layer entities for a given assembly entity.
   * @param assembly the assembly position info
   * @param entity the assembly entity
   * @param startLayer
   * @param endLayer inclusive. If not specified, defaults to the max assembly layer
   * @param replace if entities should be replaced (deleted and created) instead of updated
   */
  updateWorldEntities(
    assembly: AssemblyContent,
    entity: AssemblyEntity,
    startLayer: LayerNumber,
    endLayer?: LayerNumber,
    replace?: boolean,
  ): void

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
    startLayer: number,
    endLayer: number,
    replace: boolean | undefined,
  ): void {
    const baseLayer = entity.getBaseLayer()

    const direction = entity.direction ?? 0
    for (const [layerNum, value] of entity.iterateValues(startLayer, endLayer)) {
      if (value === nil) {
        entity.destroyWorldEntity(layerNum, "mainEntity")
        continue
      }

      const existing = entity.getWorldEntity(layerNum)
      let luaEntity: LuaEntity | undefined
      if (existing && !replace) {
        existing.direction = direction
        luaEntity = updateEntity(existing, value)
        entity.replaceWorldEntity(layerNum, luaEntity)
      } else {
        if (existing) existing.destroy()
        luaEntity = createEntity(assembly.getLayer(layerNum)!, entity, value)
        entity.replaceWorldEntity(layerNum, luaEntity)
      }

      if (luaEntity) {
        if (layerNum !== baseLayer) makeEntityIndestructible(luaEntity)
        else makeEntityDestructible(luaEntity)
        updateWireConnections(assembly, entity, layerNum, luaEntity)
      }
    }
  }

  function updateWorldEntities(
    assembly: AssemblyContent,
    entity: AssemblyEntity,
    startLayer: LayerNumber,
    endLayer?: LayerNumber,
    replace?: boolean,
  ): void {
    assert(!entity.isSettingsRemnant)

    if (startLayer < 1) startLayer = 1
    const maxLayer = assembly.numLayers()
    if (!endLayer || endLayer > maxLayer) endLayer = maxLayer
    if (startLayer > endLayer) return

    doUpdateWorldEntities(assembly, entity, startLayer, endLayer, replace)
    updateHighlights(assembly, entity, startLayer, endLayer)
  }

  function makeEntityIndestructible(entity: LuaEntity) {
    entity.minable = false
    entity.destructible = false
    entity.rotatable = false
  }
  function makeEntityDestructible(entity: LuaEntity) {
    entity.minable = true
    entity.destructible = true
    entity.rotatable = true
  }

  function makeSettingsRemnant(assembly: AssemblyContent, entity: AssemblyEntity): void {
    assert(entity.isSettingsRemnant)
    entity.destroyAllWorldEntities("mainEntity")
    highlighter.makeSettingsRemnant(assembly, entity)
  }
  function reviveSettingsRemnant(assembly: AssemblyContent, entity: AssemblyEntity): void {
    assert(!entity.isSettingsRemnant)
    doUpdateWorldEntities(assembly, entity, 1, assembly.numLayers(), true)
    highlighter.reviveSettingsRemnant(assembly, entity)
  }

  return {
    updateWorldEntities,
    deleteWorldEntities(entity: AssemblyEntity): void {
      entity.destroyAllWorldEntities("mainEntity")
      highlighter.deleteEntity(entity)
    },
    deleteExtraEntitiesOnly(entity: AssemblyEntity): void {
      highlighter.deleteEntity(entity)
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
