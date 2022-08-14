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

import { keys } from "ts-transformer-keys"
import { AssemblyContent } from "../../assembly/Assembly"
import { createMockAssembly } from "../../assembly/Assembly-mock"
import {
  createHighlightCreator,
  EntityHighlighter,
  HighlightCreator,
  HighlightEntities,
} from "../../assembly/EntityHighlighter"
import { AssemblyEntity, createAssemblyEntity } from "../../entity/AssemblyEntity"
import { Entity } from "../../entity/Entity"
import { Pos } from "../../lib/geometry"
import { RenderObj } from "../../lib/rendering"
import { entityMock, simpleMock } from "../simple-mock"

interface FooEntity extends Entity {
  foo?: number
}
let entity: AssemblyEntity<FooEntity>
let assembly: AssemblyContent
let highlightCreator: EntityHighlighter

before_each(() => {
  assembly = createMockAssembly(5)
  const entityCreator: HighlightCreator = {
    createHighlightBox: (surface, position, bbox, type) =>
      entityMock({
        name: "test-highlight",
        position,
        bounding_box: bbox,
        highlight_box_type: type,
      }),
    createSprite: () => simpleMock<RenderObj<"sprite">>(),
  }
  highlightCreator = createHighlightCreator(entityCreator)
  entity = createAssemblyEntity({ name: "stone-furnace" }, Pos(1, 1), nil, 2)
})

describe("setHasError", () => {
  test("creates highlight when set to true", () => {
    highlightCreator.setHasError(assembly, entity, 2, true)
    const highlight = entity.getWorldEntity(2, "errorHighlight")!
    assert.not_nil(highlight)
    assert.equal("test-highlight", highlight.name)
    assert.equal("not-allowed", highlight.highlight_box_type)
  })

  test("deletes highlight when set to false", () => {
    highlightCreator.setHasError(assembly, entity, 2, true)
    const highlight = entity.getWorldEntity(2, "errorHighlight")!
    highlightCreator.setHasError(assembly, entity, 2, false)
    assert.false(highlight.valid)
    assert.nil(entity.getWorldEntity(2, "errorHighlight"))
  })

  test.each([[[2]], [[2, 3]], [[2, 4]], [[3]]])("creates indicator in other layers, %s", (layers) => {
    const layerSet = new LuaSet()
    for (const layer of layers) {
      highlightCreator.setHasError(assembly, entity, layer, true)
      layerSet.add(layer)
    }

    for (let i = 1; i < 5; i++) {
      if (i === 1 || layerSet.has(i)) {
        assert.nil(entity.getWorldEntity(i, "errorInOtherLayerIndicator"), `no indicator in layer ${i}`)
      } else {
        assert.not_nil(entity.getWorldEntity(i, "errorInOtherLayerIndicator"), `indicator in layer ${i}`)
      }
    }
  })

  test("deletes indicators only when all highlights removed", () => {
    highlightCreator.setHasError(assembly, entity, 2, true)
    highlightCreator.setHasError(assembly, entity, 3, true)
    for (let i = 4; i <= 5; i++) assert.not_nil(entity.getWorldEntity(i, "errorInOtherLayerIndicator"), `layer ${i}`)
    highlightCreator.setHasError(assembly, entity, 3, false)
    for (let i = 3; i <= 5; i++) assert.not_nil(entity.getWorldEntity(i, "errorInOtherLayerIndicator"), `layer ${i}`)
    highlightCreator.setHasError(assembly, entity, 2, false)
    for (let i = 1; i <= 5; i++) assert.nil(entity.getWorldEntity(i, "errorInOtherLayerIndicator"), `layer ${i}`)
  })

  test("does nothing if created in lower layer", () => {
    highlightCreator.setHasError(assembly, entity, 1, true)
    assert.nil(entity.getWorldEntity(1, "errorHighlight"))
  })
})

describe("updateConfigChangedHighlight", () => {
  test("creates highlight when there is a config change", () => {
    entity._applyDiffAtLayer(3, { foo: 2 })
    highlightCreator.updateConfigChangedHighlight(assembly, entity, 3)
    const highlight = entity.getWorldEntity(3, "configChangedHighlight")!
    assert.not_nil(highlight)
  })

  test("deletes highlight when there is no config change", () => {
    entity._applyDiffAtLayer(3, { foo: 2 })
    highlightCreator.updateConfigChangedHighlight(assembly, entity, 3)
    entity.adjustValueAtLayer(3, entity.getBaseValue())
    highlightCreator.updateConfigChangedHighlight(assembly, entity, 3)
    assert.nil(entity.getWorldEntity(3, "configChangedHighlight"))
  })
})

describe("updateLostReferenceHighlights", () => {
  test("does nothing if not a lost reference", () => {
    highlightCreator.updateLostReferenceHighlights(assembly, entity)
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

test("deleteErrorHighlights deletes all highlights", () => {
  highlightCreator.setHasError(assembly, entity, 1, true)
  highlightCreator.setHasError(assembly, entity, 2, true)
  highlightCreator.removeAllHighlights(entity)
  for (let i = 1; i <= 5; i++) {
    for (const type of keys<HighlightEntities>()) {
      assert.nil(entity.getWorldEntity(i, type), `layer ${i}`)
    }
  }
})
