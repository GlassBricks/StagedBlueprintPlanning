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

import { isWorldEntityAssemblyEntity } from "../entity/AssemblyEntity"
import { Assembly, AssemblyContent, Layer, LayerPosition } from "./Assembly"
import { prepareNewArea } from "./surfaces"
import { DefaultWorldUpdater, WorldUpdater } from "./WorldUpdater"

/**
 * User and miscellaneous operations on the assembly.
 * @noSelf
 */
export interface AssemblyOperations {
  deleteAllWorldEntities(assembly: AssemblyContent): void

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
  const { updateWorldEntities, deleteExtraEntitiesOnly } = worldUpdater

  function deleteAllWorldEntities(assembly: AssemblyContent) {
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

  return {
    deleteAllWorldEntities,
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

export function pushLayer(assembly: Assembly): Layer | nil {
  if (!assembly.valid) return
  const nextLayerNum = assembly.numLayers() + 1
  const bbox = assembly.bbox
  const surface = prepareNewArea(nextLayerNum, bbox)
  return assembly.pushLayer(surface, bbox)
}
