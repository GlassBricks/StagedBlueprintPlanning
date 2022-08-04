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
import { RenderObj } from "../lib/rendering"
import { entityMock, simpleMock } from "../test-util/simple-mock"
import { AssemblyPosition } from "./Assembly"
import { createMockAssembly } from "./Assembly-mock"
import { createHighlightCreator, EntityHighlighter, HighlightCreator } from "./EntityHighlighter"

let entity: AssemblyEntity
let assembly: AssemblyPosition
let expectedBBox: BBox
let entityCreator: mock.Mocked<HighlightCreator>
let highlightCreator: EntityHighlighter

before_each(() => {
  assembly = createMockAssembly(5)
  entityCreator = {
    createHighlight: spy((surface, position, bbox, type) =>
      entityMock({
        name: "test-highlight",
        position,
        bounding_box: bbox,
        highlight_box_type: type,
      }),
    ),
    createSprite: spy(() => simpleMock<RenderObj<"sprite">>()),
  }
  highlightCreator = createHighlightCreator(entityCreator)
  entity = createAssemblyEntity({ name: "stone-furnace" }, Pos(1, 1), nil, 2)
  expectedBBox = BBox.translate(game.entity_prototypes["stone-furnace"].selection_box, Pos(1, 1))
})

describe("setErrorHighlightAt", () => {
  test("creates highlight when set to true", () => {
    highlightCreator.setErrorHighlightAt(assembly, entity, 2, true)
    assert.spy(entityCreator.createHighlight).called_with(match._, Pos(1, 1), expectedBBox, "not-allowed")
    const val = entityCreator.createHighlight.returnvals[0].vals[0]
    assert.same(val, entity.getWorldEntity(2, "errorHighlight"))
  })

  test("deletes highlight when set to false", () => {
    highlightCreator.setErrorHighlightAt(assembly, entity, 2, true)
    const val = entityCreator.createHighlight.returnvals[0].refs[0] as LuaEntity
    highlightCreator.setErrorHighlightAt(assembly, entity, 2, false)
    assert.false(val.valid)
    assert.nil(entity.getWorldEntity(1, "errorHighlight"))
  })

  test.each([[[2]], [[2, 3]], [[2, 4]], [[3]]])("creates indicator in other layers, %s", (layers) => {
    const layerSet = new LuaSet()
    for (const layer of layers) {
      highlightCreator.setErrorHighlightAt(assembly, entity, layer, true)
      layerSet.add(layer)
    }

    for (let i = 1; i < 5; i++) {
      if (i === 1 || layerSet.has(i)) {
        assert.nil(entity.getWorldEntity(i, "errorIndicator"), `no indicator in layer ${i}`)
      } else {
        assert.not_nil(entity.getWorldEntity(i, "errorIndicator"), `indicator in layer ${i}`)
      }
    }
  })

  test("deletes indicators only when all highlights removed", () => {
    highlightCreator.setErrorHighlightAt(assembly, entity, 2, true)
    highlightCreator.setErrorHighlightAt(assembly, entity, 3, true)
    for (let i = 4; i <= 5; i++) assert.not_nil(entity.getWorldEntity(i, "errorIndicator"), `layer ${i}`)
    highlightCreator.setErrorHighlightAt(assembly, entity, 3, false)
    for (let i = 3; i <= 5; i++) assert.not_nil(entity.getWorldEntity(i, "errorIndicator"), `layer ${i}`)
    highlightCreator.setErrorHighlightAt(assembly, entity, 2, false)
    for (let i = 1; i <= 5; i++) assert.nil(entity.getWorldEntity(i, "errorIndicator"), `layer ${i}`)
  })

  test("does nothing if created in lower layer", () => {
    highlightCreator.setErrorHighlightAt(assembly, entity, 1, true)
    assert.spy(entityCreator.createHighlight).not_called()
    assert.nil(entity.getWorldEntity(1, "errorHighlight"))
  })
})

test("deleteErrorHighlights deletes all highlights", () => {
  highlightCreator.setErrorHighlightAt(assembly, entity, 1, true)
  highlightCreator.setErrorHighlightAt(assembly, entity, 2, true)
  highlightCreator.deleteErrorHighlights(entity)
  for (let i = 1; i <= 5; i++) assert.nil(entity.getWorldEntity(i, "errorHighlight"), `layer ${i}`)
})

describe("updateLostReferenceHighlights", () => {
  test("does nothing if not a lost reference", () => {
    highlightCreator.updateLostReferenceHighlights(assembly, entity)
    assert.spy(entityCreator.createHighlight).not_called()
    for (let i = 1; i <= 5; i++) assert.nil(entity.getWorldEntity(2, "lostReferenceHighlight"))
  })
  test("creates lost reference highlights in layers above base if lost reference", () => {
    entity.isLostReference = true
    highlightCreator.updateLostReferenceHighlights(assembly, entity)
    for (let i = 2; i <= 5; i++) assert.not_nil(entity.getWorldEntity(i, "lostReferenceHighlight"))
    assert.nil(entity.getWorldEntity(1, "lostReferenceHighlight"))
  })
  test("deletes lost reference highlights if no longer lost reference", () => {
    entity.isLostReference = true
    highlightCreator.updateLostReferenceHighlights(assembly, entity)
    entity.isLostReference = nil
    highlightCreator.updateLostReferenceHighlights(assembly, entity)
    for (let i = 1; i <= 5; i++) assert.nil(entity.getWorldEntity(i, "lostReferenceHighlight"))
  })
})
