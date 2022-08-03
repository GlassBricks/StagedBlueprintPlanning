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
import { BBox, Pos } from "../lib/geometry"
import { LayerPosition } from "./Assembly"

export function setErrorHighlight(entity: AssemblyEntity, layer: LayerPosition, hasHighlight: boolean): void {
  const { _highlights } = entity
  const { layerNumber } = layer
  if (hasHighlight) {
    // create if not exists
    const highlight = _highlights[layerNumber] ?? (_highlights[layerNumber] = {})
    highlight.error ??= createErrorHighlight(entity, layer)
  } else {
    // remove if exists
    const highlight = _highlights[layerNumber]
    if (!highlight) return
    const error = highlight.error
    if (error && error.valid) error.destroy()
    delete highlight.error
  }
}

function createErrorHighlight(entity: AssemblyEntity, layer: LayerPosition): HighlightBoxEntity {
  const prototypeName = entity.categoryName
  // bbox.translate ( layer.left_top + entity.position )
  const position = entity.position
  const selectionBox = BBox.translate(
    game.entity_prototypes[prototypeName].selection_box,
    Pos.plus(layer.left_top, position),
  )
  const result = layer.surface.create_entity({
    name: "highlight-box",
    position,
    bounding_box: selectionBox,
    box_type: "not-allowed",
    force: "player",
  })
  return result!
}

export function destroyAllErrorHighlights(entity: AssemblyEntity): void {
  const { _highlights } = entity
  for (const [, layer] of pairs(_highlights)) {
    const error = layer.error
    if (error && error.valid) error.destroy()
  }
}
