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
import { AssemblyPosition, LayerPosition } from "./Assembly"
import { DefaultHighlightCreator, HighlightCreator } from "./HighlightCreator"

/**
 * Updates entities in the world in response to changes in the assembly.
 *
 * This includes highlight entities.
 * @noSelf
 */
export interface WorldUpdater {
  /**
   * Re-syncs all layer entities for a given assembly entity
   * @param assembly the assembly position info
   * @param entity the assembly entity
   * @param startLayer
   * @param endLayer inclusive. If not specified, defaults to the max assembly layer
   * @param replace if entities should be replaced (deleted and created) instead of updated
   */
  updateWorldEntities(
    assembly: AssemblyPosition,
    entity: AssemblyEntity,
    startLayer: LayerNumber,
    endLayer?: LayerNumber,
    replace?: boolean,
  ): void

  deleteAllWorldEntities(assembly: AssemblyPosition, entity: AssemblyEntity): void
}

declare const luaLength: LuaLength<Record<number, any>, number>

export function createWorldUpdater(entityCreator: EntityCreator, highlighter: HighlightCreator): WorldUpdater {
  interface AssemblyPosition {
    readonly layers: Record<LayerNumber, LayerPosition>
  }
  const { createEntity, updateEntity } = entityCreator
  const { setErrorHighlightAt, deleteAllHighlights } = highlighter

  function updateWorldEntities(
    assembly: AssemblyPosition,
    entity: AssemblyEntity,
    startLayer: LayerNumber,
    endLayer?: LayerNumber,
    replace?: boolean,
  ): void {
    const baseLayer = entity.getBaseLayer()
    const { layers } = assembly
    const maxLayer = luaLength(layers)
    assert(startLayer >= baseLayer, "startLayer must be >= baseLayer")
    if (endLayer) {
      assert(endLayer >= startLayer, "endLayer must be >= startLayer")
      assert(endLayer <= maxLayer, "endLayer must be <= maxLayer")
    } else {
      endLayer = maxLayer
    }

    const direction = entity.direction ?? 0

    for (const [layerNum, value] of entity.iterateValues(startLayer, endLayer)) {
      const existing = entity.getWorldEntity(layerNum)
      if (existing && !replace) {
        existing.direction = direction
        updateEntity(existing, value)
      } else {
        if (existing) existing.destroy()
        const layer = layers[layerNum]
        const newEntity = createEntity(layer, entity, value)
        entity.replaceWorldEntity(layerNum, newEntity)
        setErrorHighlightAt(entity, layer, newEntity === nil)
      }
    }
  }

  function deleteAllWorldEntities(assembly: AssemblyPosition, entity: AssemblyEntity): void {
    entity.destroyAllWorldEntities("main")
    deleteAllHighlights(entity)
  }

  return {
    updateWorldEntities,
    deleteAllWorldEntities,
  }
}

export const DefaultWorldUpdater = createWorldUpdater(DefaultEntityHandler, DefaultHighlightCreator)
