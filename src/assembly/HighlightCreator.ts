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

import { AssemblyEntity } from "../entity/AssemblyEntity"
import { getWorldPosition } from "../entity/EntityHandler"
import { BBox, Position } from "../lib/geometry"
import { LayerPosition } from "./Assembly"

declare module "../entity/Entity" {
  export interface WorldEntityTypes {
    errorHighlight: "errorHighlight"
    futureErrorIndicator: "futureErrorIndicator"
  }
}

/** @noSelf */
export interface HighlightCreator {
  setErrorHighlightAt(entity: AssemblyEntity, layer: LayerPosition, value: boolean): void

  deleteAllHighlights(entity: AssemblyEntity): void
}

/** @noSelf */
export interface HighlightEntityCreator {
  createHighlight(
    surface: LuaSurface,
    position: Position,
    bbox: BoundingBox,
    type: CursorBoxRenderType,
  ): LuaEntity | nil
}

export function createHighlightCreator(entityCreator: HighlightEntityCreator): HighlightCreator {
  const { createHighlight } = entityCreator

  function setErrorHighlightAt(entity: AssemblyEntity, layer: LayerPosition, hasHighlight: boolean): void {
    const { layerNumber } = layer
    if (!hasHighlight) {
      entity.replaceWorldEntity(layerNumber, nil, "errorHighlight")
      return
    }

    const existingHighlight = entity.getWorldEntity(layerNumber, "errorHighlight")
    if (existingHighlight) return

    const highlight = createErrorHighlight(entity, layer)
    entity.replaceWorldEntity(layerNumber, highlight, "errorHighlight")
  }

  function createErrorHighlight(entity: AssemblyEntity, layer: LayerPosition) {
    const prototypeName = entity.categoryName
    const position = entity.position
    const selectionBox = BBox.translate(
      game.entity_prototypes[prototypeName].selection_box,
      getWorldPosition(position, layer),
    )
    return createHighlight(layer.surface, position, selectionBox, "not-allowed")!
  }

  function deleteAllHighlights(entity: AssemblyEntity): void {
    entity.destroyAllWorldEntities("errorHighlight")
  }

  return {
    setErrorHighlightAt,
    deleteAllHighlights,
  }
}

export const DefaultEntityCreator: HighlightEntityCreator = {
  createHighlight(
    surface: LuaSurface,
    position: Position,
    bbox: BoundingBox,
    type: CursorBoxRenderType,
  ): LuaEntity | nil {
    return surface.create_entity({
      name: "highlight-box",
      position,
      bounding_box: bbox,
      box_type: type,
      force: "player",
    })!
  },
}

export const DefaultHighlightCreator = createHighlightCreator(DefaultEntityCreator)
