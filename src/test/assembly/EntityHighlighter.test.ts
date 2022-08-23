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
import { createMockAssemblyContent } from "../../assembly/Assembly-mock"
import { AssemblyContent } from "../../assembly/AssemblyContent"
import {
  createHighlightCreator,
  EntityHighlighter,
  HighlightCreator,
  HighlightEntities,
  HighlightValues,
} from "../../assembly/EntityHighlighter"
import { AssemblyEntity, createAssemblyEntity, LayerNumber } from "../../entity/AssemblyEntity"
import { Entity } from "../../entity/Entity"
import { Pos } from "../../lib/geometry"
import { SpriteRender } from "../../lib/rendering"
import { entityMock, simpleMock } from "../simple-mock"

interface FooEntity extends Entity {
  foo?: number
}
let entity: AssemblyEntity<FooEntity>
let assembly: AssemblyContent
let highlightCreator: EntityHighlighter

before_each(() => {
  assembly = createMockAssemblyContent(5)
  const entityCreator: HighlightCreator = {
    createHighlightBox: (target, type) =>
      entityMock({
        name: "test-highlight",
        position: target.position,
        highlight_box_type: type,
      }),
    createSprite: (params) => simpleMock(params as any),
    createEntityPreview(surface, type, position, direction): LuaEntity | nil {
      return entityMock({
        name: "test-preview",
        position,
        direction,
      })
    },
    createSelectionProxy(surface, type, position, direction): LuaEntity | nil {
      return entityMock({
        name: "test-proxy",
        position,
        direction,
      })
    },
  }
  highlightCreator = createHighlightCreator(entityCreator)
  entity = createAssemblyEntity({ name: "stone-furnace" }, Pos(1, 1), nil, 2)
})
describe("entity previews", () => {
  test("doesn't create anything if has entity", () => {
    entity.replaceWorldEntity(2, simpleMock<LuaEntity>())
    highlightCreator.updateHighlights(assembly, entity)
    assert.is_nil(entity.getWorldEntity(2, "previewEntity")!)
  })
  test("can create previews", () => {
    highlightCreator.updateHighlights(assembly, entity)
    assert.not_nil(entity.getWorldEntity(1, "previewEntity")!)
  })
  test("can delete previews", () => {
    highlightCreator.updateHighlights(assembly, entity)
    entity.replaceWorldEntity(1, simpleMock<LuaEntity>())
    highlightCreator.updateHighlights(assembly, entity)
    assert.is_nil(entity.getWorldEntity(1, "previewEntity")!)
  })
})

describe("error highlights/selection proxy", () => {
  before_each(() => {
    for (const i of $range(1, 5)) {
      entity.replaceWorldEntity(i, simpleMock<LuaEntity>())
    }
  })
  test("creates highlight when world entity missing", () => {
    entity.destroyWorldEntity(2, "mainEntity")
    highlightCreator.updateHighlights(assembly, entity, 2, 2)
    assert.not_nil(entity.getWorldEntity(2, "errorOutline")!)
    assert.not_nil(entity.getWorldEntity(2, "selectionProxy")!)
  })

  test("deletes highlight when set to false", () => {
    entity.destroyWorldEntity(2, "mainEntity")
    highlightCreator.updateHighlights(assembly, entity, 2, 2)
    entity.replaceWorldEntity(2, simpleMock<LuaEntity>())
    highlightCreator.updateHighlights(assembly, entity, 2, 2)
    assert.nil(entity.getWorldEntity(2, "errorOutline"))
    assert.nil(entity.getWorldEntity(2, "selectionProxy"))
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
        assert.nil(entity.getWorldEntity(i, "errorElsewhereIndicator"), `should not have indicator in layer ${i}`)
      } else {
        assert.not_nil(entity.getWorldEntity(i, "errorElsewhereIndicator"), `should have indicator in layer ${i}`)
      }
    }
  })

  test("deletes indicators only when all highlights removed", () => {
    entity.destroyWorldEntity(2, "mainEntity")
    entity.destroyWorldEntity(3, "mainEntity")
    highlightCreator.updateHighlights(assembly, entity)
    for (let i = 4; i <= 5; i++) assert.not_nil(entity.getWorldEntity(i, "errorElsewhereIndicator"), `layer ${i}`)
    entity.replaceWorldEntity(3, simpleMock<LuaEntity>())
    highlightCreator.updateHighlights(assembly, entity)
    for (let i = 3; i <= 5; i++) assert.not_nil(entity.getWorldEntity(i, "errorElsewhereIndicator"), `layer ${i}`)
    entity.replaceWorldEntity(2, simpleMock<LuaEntity>())
    highlightCreator.updateHighlights(assembly, entity)
    for (let i = 1; i <= 5; i++) assert.nil(entity.getWorldEntity(i, "errorElsewhereIndicator"), `layer ${i}`)
  })

  test("does nothing if created in lower than base layer", () => {
    highlightCreator.updateHighlights(assembly, entity)
    assert.nil(entity.getWorldEntity(1, "errorOutline"))
  })
})

describe("config changed highlight", () => {
  before_each(() => {
    for (const i of $range(1, 5)) entity.replaceWorldEntity(i, entityMock({ name: "test" }))
  })
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
      assert.equal(isUpgrade ? HighlightValues.Upgraded : "logistics", highlight.highlight_box_type, "highlight type")

      const firstI = i
      for (; i < layerNumber; i++) {
        if (i !== firstI)
          assert.nil(entity.getWorldEntity(i, "configChangedHighlight"), "should not have highlight in layer " + i)

        const highlight = assert.not_nil(
          entity.getWorldEntity(i, "configChangedLaterHighlight"),
          `layer ${i}`,
        ) as SpriteRender
        assert.equal(isUpgrade ? HighlightValues.UpgradedLater : "item/blueprint", highlight.sprite)
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

test("makeSettingsRemnant creates highlights", () => {
  entity.isSettingsRemnant = true
  highlightCreator.makeSettingsRemnant(assembly, entity)
  for (let i = 1; i <= 5; i++) {
    assert.not_nil(entity.getWorldEntity(i, "settingsRemnantHighlight"))
    assert.not_nil(entity.getWorldEntity(i, "previewEntity"))
    assert.not_nil(entity.getWorldEntity(i, "selectionProxy"))
  }
})
test("deleteSettingsRemnant removes highlights and sets entities correct", () => {
  entity.isSettingsRemnant = true
  highlightCreator.makeSettingsRemnant(assembly, entity)
  entity.isSettingsRemnant = nil
  highlightCreator.reviveSettingsRemnant(assembly, entity)
  for (let i = 1; i <= 5; i++) {
    assert.nil(entity.getWorldEntity(i, "settingsRemnantHighlight"))
    assert.not_nil(entity.getWorldEntity(i, "previewEntity"))
    if (i >= entity.getBaseLayer()) assert.not_nil(entity.getWorldEntity(i, "selectionProxy"))
    else assert.nil(entity.getWorldEntity(i, "selectionProxy"))
  }
})

test("deleteErrorHighlights deletes all highlights", () => {
  entity.destroyWorldEntity(2, "mainEntity")
  entity.destroyWorldEntity(3, "mainEntity")
  highlightCreator.updateHighlights(assembly, entity)
  highlightCreator.deleteHighlights(entity)
  for (let i = 1; i <= 5; i++) {
    for (const type of keys<HighlightEntities>()) {
      assert.nil(entity.getWorldEntity(i, type), `layer ${i}`)
    }
    assert.nil(entity.getWorldEntity(i, "previewEntity"), `layer ${i}`)
    assert.nil(entity.getWorldEntity(i, "selectionProxy"), `layer ${i}`)
  }
})
