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

  /** If the entity is a lost reference, creates lost reference highlights. */
  deleteAllWorldEntities(assembly: AssemblyContent, entity: AssemblyEntity): void
}

declare const luaLength: LuaLength<Record<number, any>, number>

export function createWorldUpdater(
  entityCreator: EntityCreator,
  wireHandler: WireUpdater,
  highlighter: EntityHighlighter,
): WorldUpdater {
  const { createEntity, updateEntity } = entityCreator
  const { setHasError, removeAllHighlights, updateLostReferenceHighlights, updateConfigChangedHighlight } = highlighter
  const { updateWireConnections } = wireHandler

  function updateWorldEntities(
    assembly: AssemblyContent,
    entity: AssemblyEntity,
    startLayer: LayerNumber,
    endLayer?: LayerNumber,
    replace?: boolean,
  ): void {
    const { layers } = assembly
    const baseLayer = entity.getBaseLayer()
    const maxLayer = luaLength(layers)

    if (startLayer < baseLayer) startLayer = baseLayer
    if (!endLayer || endLayer > maxLayer) endLayer = maxLayer
    if (startLayer > endLayer) return

    assert(!entity.isLostReference)
    updateLostReferenceHighlights(assembly, entity)

    const direction = entity.direction ?? 0

    for (const [layerNum, value] of entity.iterateValues(startLayer, endLayer)) {
      const existing = entity.getWorldEntity(layerNum)
      let luaEntity: LuaEntity | undefined
      if (existing && !replace) {
        existing.direction = direction
        luaEntity = updateEntity(existing, value)
        entity.replaceWorldEntity(layerNum, luaEntity)
        setHasError(assembly, entity, layerNum, luaEntity === nil)
      } else {
        if (existing) existing.destroy()
        const layer = layers[layerNum]
        luaEntity = createEntity(layer, entity, value)
        entity.replaceWorldEntity(layerNum, luaEntity)
      }

      if (luaEntity) {
        if (layerNum !== baseLayer) makeEntityIndestructible(luaEntity)
        updateWireConnections(assembly, entity, layerNum, luaEntity)
      }
      setHasError(assembly, entity, layerNum, luaEntity === nil)
      updateConfigChangedHighlight(assembly, entity, layerNum)
    }
  }

  function makeEntityIndestructible(entity: LuaEntity) {
    entity.minable = false
    entity.destructible = false
    entity.rotatable = false
  }

  function deleteAllWorldEntities(assembly: AssemblyContent, entity: AssemblyEntity): void {
    entity.destroyAllWorldEntities("mainEntity")
    removeAllHighlights(entity)
    updateLostReferenceHighlights(assembly, entity)
  }

  return {
    updateWorldEntities,
    deleteAllWorldEntities,
  }
}

export const DefaultWorldUpdater = createWorldUpdater(
  DefaultEntityHandler,
  DefaultWireHandler,
  DefaultEntityHighlighter,
)
