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

import { AssemblyEntity, createAssemblyEntity } from "../entity/AssemblyEntity"
import { BBox, Pos } from "../lib/geometry"
import { entityMock } from "../test-util/simple-mock"
import { LayerPosition } from "./Assembly"
import { createHighlightCreator, HighlightCreator, HighlightEntityCreator } from "./HighlightCreator"

let entityCreator: mock.Mocked<HighlightEntityCreator>
let highlightCreator: HighlightCreator
let entity: AssemblyEntity
let layer: LayerPosition
let expectedBBox: BBox

before_each(() => {
  layer = {
    layerNumber: 1,
    left_top: { x: 0, y: 0 },
    right_bottom: { x: 0, y: 0 },
    surface: nil!,
  }
  entityCreator = {
    createHighlight: spy((surface, position, bbox, type) =>
      entityMock({
        name: "test-highlight",
        position,
        bounding_box: bbox,
        highlight_box_type: type,
      }),
    ),
  }
  highlightCreator = createHighlightCreator(entityCreator)
  entity = createAssemblyEntity({ name: "stone-furnace" }, Pos(1, 1), nil, 1)
  expectedBBox = BBox.translate(game.entity_prototypes["stone-furnace"].selection_box, Pos(1, 1))
})

describe("setErrorHighlightAt", () => {
  test("creates highlight when set to true", () => {
    highlightCreator.setErrorHighlightAt(entity, layer, true)
    assert.spy(entityCreator.createHighlight).called_with(layer.surface, Pos(1, 1), expectedBBox, "not-allowed")
    const val = entityCreator.createHighlight.returnvals[0].vals[0]
    assert.same(val, entity.getWorldEntity(layer.layerNumber, "errorHighlight"))
  })
  test("deletes highlight when set to false", () => {
    highlightCreator.setErrorHighlightAt(entity, layer, true)
    const val = entityCreator.createHighlight.returnvals[0].refs[0] as LuaEntity
    highlightCreator.setErrorHighlightAt(entity, layer, false)
    assert.false(val.valid)
    assert.nil(entity.getWorldEntity(layer.layerNumber, "errorHighlight"))
  })
})
