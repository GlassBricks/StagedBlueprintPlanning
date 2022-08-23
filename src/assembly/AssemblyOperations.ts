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

import { isWorldEntityAssemblyEntity, LayerNumber } from "../entity/AssemblyEntity"
import { AssemblyContent, LayerPosition } from "./Assembly"
import { DefaultWorldUpdater, WorldUpdater } from "./WorldUpdater"

/**
 * User and miscellaneous operations on the assembly.
 * @noSelf
 */
export interface AssemblyOperations {
  deleteAllExtraEntitiesOnly(assembly: AssemblyContent): void
  deleteLayerEntities(assembly: AssemblyContent, layerNumber: LayerNumber): void

  resetLayer(assembly: AssemblyContent, layer: LayerPosition): void
}

/** @noSelf */
export interface AssemblyOpWorldInteractor {
  deleteAllWorldEntities(layer: LayerPosition): void
}

export function createAssemblyOperations(
  worldUpdater: WorldUpdater,
  worldInteractor: AssemblyOpWorldInteractor,
): AssemblyOperations {
  const { updateWorldEntities, deleteExtraEntitiesOnly, deleteWorldEntitiesInLayer } = worldUpdater

  function deleteAllExtraEntitiesOnly(assembly: AssemblyContent) {
    for (const entity of assembly.content.iterateAllEntities()) {
      deleteExtraEntitiesOnly(entity)
    }
  }

  function resetLayer(assembly: AssemblyContent, layer: LayerPosition) {
    worldInteractor.deleteAllWorldEntities(layer)
    const layerNumber = layer.layerNumber
    for (const entity of assembly.content.iterateAllEntities()) {
      updateWorldEntities(assembly, entity, layerNumber, layerNumber, true)
    }
  }

  function deleteLayerEntities(assembly: AssemblyContent, layerNumber: LayerNumber) {
    for (const entity of assembly.content.iterateAllEntities()) {
      deleteWorldEntitiesInLayer(entity, layerNumber)
    }
  }

  return {
    deleteAllExtraEntitiesOnly,
    deleteLayerEntities,
    resetLayer,
  }
}

const DefaultWorldInteractor: AssemblyOpWorldInteractor = {
  deleteAllWorldEntities(layer: LayerPosition) {
    layer.surface
      .find_entities_filtered({ area: layer })
      .filter((x) => isWorldEntityAssemblyEntity(x))
      .forEach((x) => x.destroy())
  },
}

export const AssemblyOperations = createAssemblyOperations(DefaultWorldUpdater, DefaultWorldInteractor)
