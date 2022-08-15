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
  HighlightValues,
} from "../../assembly/EntityHighlighter"
import { AssemblyEntity, createAssemblyEntity, LayerNumber } from "../../entity/AssemblyEntity"
import { Entity } from "../../entity/Entity"
import { BBox, Pos } from "../../lib/geometry"
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
    createSprite: (params) => simpleMock<RenderObj<"sprite">>(params as any),
    createRectangle(
      surface: LuaSurface,
      box: BBox,
      color: Color | ColorArray,
      filled: boolean,
    ): RenderObj<"rectangle"> {
      return simpleMock<RenderObj<"rectangle">>({
        left_top: { position: box.left_top },
        right_bottom: { position: box.right_bottom },
        color,
        filled,
      })
    },
  }
  highlightCreator = createHighlightCreator(entityCreator)
  entity = createAssemblyEntity({ name: "stone-furnace" }, Pos(1, 1), nil, 2)
})
describe("entity preview highlights", () => {
  test("doesn't create anything if false", () => {
    highlightCreator.updateEntityPreviewHighlight(assembly, entity, 1, false)
    assert.is_nil(entity.getWorldEntity(1, "previewHighlight")!)
    assert.is_nil(entity.getWorldEntity(1, "previewIcon")!)
  })
  test("can create highlights", () => {
    highlightCreator.updateEntityPreviewHighlight(assembly, entity, 1, true)
    assert.not_nil(entity.getWorldEntity(1, "previewHighlight")!)
    const icon = assert.not_nil(entity.getWorldEntity(1, "previewIcon")!) as RenderObj<"sprite">
    assert.equal(icon.sprite, "entity/" + entity.getBaseValue().name)
  })
  test("can delete highlights", () => {
    highlightCreator.updateEntityPreviewHighlight(assembly, entity, 1, true)
    highlightCreator.updateEntityPreviewHighlight(assembly, entity, 1, false)
    assert.is_nil(entity.getWorldEntity(1, "previewHighlight")!)
    assert.is_nil(entity.getWorldEntity(1, "previewIcon")!)
  })
})

describe("error highlights", () => {
  before_each(() => {
    for (const i of $range(1, 5)) {
      entity.replaceWorldEntity(i, simpleMock<LuaEntity>())
    }
  })
  test("creates highlight when world entity missing", () => {
    entity.destroyWorldEntity(2, "mainEntity")
    highlightCreator.updateHighlights(assembly, entity)
    const highlight = entity.getWorldEntity(2, "errorHighlight")!
    assert.not_nil(highlight)
  })

  test("deletes highlight when set to false", () => {
    entity.destroyWorldEntity(2, "mainEntity")
    highlightCreator.updateHighlights(assembly, entity)
    const highlight = entity.getWorldEntity(2, "errorHighlight")!
    entity.replaceWorldEntity(2, simpleMock<LuaEntity>())
    highlightCreator.updateHighlights(assembly, entity)
    assert.false(highlight.valid)
    assert.nil(entity.getWorldEntity(2, "errorHighlight"))
  })

  test.each([[[2]], [[2, 3]], [[2, 4]], [[3]]])("creates indicator in other layers, %s", (layers) => {
    const layerSet = new LuaSet()
    for (const layer of layers) {
      entity.destroyWorldEntity(layer, "mainEntity")
      layerSet.add(layer)
    }
    highlightCreator.updateHighlights(assembly, entity)

    for (let i = 1; i < 5; i++) {
      if (i === 1 || layerSet.has(i)) {
        assert.nil(entity.getWorldEntity(i, "errorInOtherLayerHighlight"), `should not have indicator in layer ${i}`)
      } else {
        assert.not_nil(entity.getWorldEntity(i, "errorInOtherLayerHighlight"), `should have indicator in layer ${i}`)
      }
    }
  })

  test("deletes indicators only when all highlights removed", () => {
    entity.destroyWorldEntity(2, "mainEntity")
    entity.destroyWorldEntity(3, "mainEntity")
    highlightCreator.updateHighlights(assembly, entity)
    for (let i = 4; i <= 5; i++) assert.not_nil(entity.getWorldEntity(i, "errorInOtherLayerHighlight"), `layer ${i}`)
    entity.replaceWorldEntity(3, simpleMock<LuaEntity>())
    highlightCreator.updateHighlights(assembly, entity)
    for (let i = 3; i <= 5; i++) assert.not_nil(entity.getWorldEntity(i, "errorInOtherLayerHighlight"), `layer ${i}`)
    entity.replaceWorldEntity(2, simpleMock<LuaEntity>())
    highlightCreator.updateHighlights(assembly, entity)
    for (let i = 1; i <= 5; i++) assert.nil(entity.getWorldEntity(i, "errorInOtherLayerHighlight"), `layer ${i}`)
  })

  test("does nothing if created in lower layer", () => {
    highlightCreator.updateHighlights(assembly, entity)
    assert.nil(entity.getWorldEntity(1, "errorHighlight"))
  })
})

describe("config changed highlight", () => {
  function setAt(layer: LayerNumber) {
    assert(layer >= 2)
    ;(entity._getLayerChanges() as any)[layer] = { foo: layer }
  }
  function setUpgradeAt(layer: LayerNumber) {
    assert(layer >= 2)
    ;(entity._getLayerChanges() as any)[layer] = { name: "test" + layer.toString() }
  }
  function clearAt(layer: LayerNumber) {
    assert(layer >= 2)
    ;(entity._getLayerChanges() as any)[layer] = nil
  }
  function assertCorrect() {
    highlightCreator.updateHighlights(assembly, entity)
    let i = 2
    for (const [layerNumber, changes] of pairs(entity._getLayerChanges())) {
      const isUpgrade = changes.name !== nil

      const highlight = assert.not_nil(
        entity.getWorldEntity(layerNumber, "configChangedHighlight"),
      ) as HighlightBoxEntity
      assert.equal(
        isUpgrade ? HighlightValues.Upgraded : HighlightValues.ConfigChanged,
        highlight.highlight_box_type,
        "highlight type",
      )

      const firstI = i
      for (; i < layerNumber; i++) {
        if (i !== firstI)
          assert.nil(entity.getWorldEntity(i, "configChangedHighlight"), "should not have highlight in layer " + i)

        const highlight = assert.not_nil(
          entity.getWorldEntity(i, "configChangedLaterHighlight"),
          `layer ${i}`,
        ) as RenderObj<"sprite">
        assert.equal(isUpgrade ? HighlightValues.UpgradedLater : HighlightValues.ConfigChangedLater, highlight.sprite)
      }
    }
    for (let j = i; j <= 5; j++) {
      if (j !== i)
        assert.nil(entity.getWorldEntity(j, "configChangedHighlight"), "should not have highlight in layer " + j)
      assert.nil(
        entity.getWorldEntity(j, "configChangedLaterHighlight"),
        "should not have later highlight in layer " + j,
      )
    }
  }
  test("single", () => {
    setAt(3)
    assertCorrect()
    clearAt(3)
    assertCorrect()
  })
  test("multiple", () => {
    setAt(3)
    setAt(4)
    assertCorrect()
    clearAt(3)
    assertCorrect()
    clearAt(4)
    assertCorrect()
  })
  test("with upgrade", () => {
    setUpgradeAt(3)
    assertCorrect()
    clearAt(3)
    assertCorrect()
  })
  test("with upgrade, multiple", () => {
    setAt(3)
    setUpgradeAt(4)
    assertCorrect()
    setUpgradeAt(3)
    assertCorrect()
    clearAt(4)
    assertCorrect()
    clearAt(3)
    assertCorrect()
  })
})

describe("lost reference highlights", () => {
  test("does nothing if not a lost reference", () => {
    highlightCreator.updateHighlights(assembly, entity)
    for (let i = 1; i <= 5; i++) assert.nil(entity.getWorldEntity(2, "lostReferenceHighlight"))
  })
  test("creates lost reference highlights in layers above base if lost reference", () => {
    entity.isLostReference = true
    highlightCreator.updateHighlights(assembly, entity)
    for (let i = 2; i <= 5; i++) assert.not_nil(entity.getWorldEntity(i, "lostReferenceHighlight"))
    assert.nil(entity.getWorldEntity(1, "lostReferenceHighlight"))
  })
  test("deletes lost reference highlights if no longer lost reference", () => {
    entity.isLostReference = true
    highlightCreator.updateHighlights(assembly, entity)
    entity.isLostReference = nil
    highlightCreator.updateHighlights(assembly, entity)
    for (let i = 1; i <= 5; i++) assert.nil(entity.getWorldEntity(i, "lostReferenceHighlight"))
  })
})

test("deleteErrorHighlights deletes all highlights", () => {
  entity.destroyWorldEntity(2, "mainEntity")
  entity.destroyWorldEntity(3, "mainEntity")
  highlightCreator.updateHighlights(assembly, entity)
  highlightCreator.deleteAllHighlights(entity)
  for (let i = 1; i <= 5; i++) {
    for (const type of keys<HighlightEntities>()) {
      assert.nil(entity.getWorldEntity(i, type), `layer ${i}`)
    }
  }
})
