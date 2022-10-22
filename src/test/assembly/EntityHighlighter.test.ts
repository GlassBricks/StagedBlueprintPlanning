/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of 100% Blueprint Planning.
 *
 * 100% Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * 100% Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with 100% Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { keys } from "ts-transformer-keys"
import { AssemblyData } from "../../assembly/AssemblyDef"
import {
  createHighlightCreator,
  EntityHighlighter,
  HighlightCreator,
  HighlightEntities,
  HighlightValues,
} from "../../assembly/EntityHighlighter"
import { Prototypes } from "../../constants"
import { AssemblyEntity, createAssemblyEntity, StageNumber } from "../../entity/AssemblyEntity"
import { Entity } from "../../entity/Entity"
import { SpriteRender } from "../../lib"
import { Pos } from "../../lib/geometry"
import { simpleMock } from "../simple-mock"
import { createMockAssembly, setupTestSurfaces } from "./Assembly-mock"

interface FooEntity extends Entity {
  foo?: number
}
let entity: AssemblyEntity<FooEntity>
let assembly: AssemblyData
let highlightCreator: EntityHighlighter

const surfaces = setupTestSurfaces(5)
before_each(() => {
  assembly = createMockAssembly(surfaces)
  const entityCreator: HighlightCreator = {
    createHighlightBox: HighlightCreator.createHighlightBox,
    createSprite: (params) => simpleMock(params as any),
  }
  highlightCreator = createHighlightCreator(entityCreator)
  entity = createAssemblyEntity({ name: "stone-furnace" }, Pos(1, 1), nil, 2)
})

function createEntity(stage: StageNumber) {
  return assert(
    surfaces[stage - 1].create_entity({
      name: "stone-furnace",
      position: Pos(1, 1),
    }),
  )
}
function createPreview(stage: StageNumber) {
  return assert(
    surfaces[stage - 1].create_entity({
      name: Prototypes.PreviewEntityPrefix + "stone-furnace",
      position: Pos(1, 1),
    }),
  )
}

function removeInStage(stage: StageNumber) {
  entity.replaceWorldOrPreviewEntity(stage, createPreview(stage))
}
function addInStage(stage: StageNumber) {
  entity.replaceWorldOrPreviewEntity(stage, createEntity(stage))
}
describe("error highlights and selection proxy", () => {
  before_each(() => {
    for (const i of $range(1, 5)) addInStage(i)
  })
  test("creates highlight when world entity missing", () => {
    removeInStage(2)
    highlightCreator.updateHighlights(assembly, entity, 2, 2)
    assert.not_nil(entity.getExtraEntity("errorOutline", 2)!, "has error highlight")
  })

  test("deletes highlight when entity revived", () => {
    removeInStage(2)
    highlightCreator.updateHighlights(assembly, entity, 2, 2)
    addInStage(2)
    highlightCreator.updateHighlights(assembly, entity, 2, 2)
    assert.nil(entity.getExtraEntity("errorOutline", 2))
  })

  test.each([[[2]], [[2, 3]], [[2, 4]], [[3]]])("creates indicator in other stages, %s", (stages) => {
    const stageSet = new LuaSet()
    for (const stage of stages) {
      removeInStage(stage)
      stageSet.add(stage)
    }
    highlightCreator.updateHighlights(assembly, entity)

    for (let i = 1; i < 5; i++) {
      if (i === 1 || stageSet.has(i)) {
        assert.nil(entity.getExtraEntity("errorElsewhereIndicator", i), `should not have indicator in stage ${i}`)
      } else {
        assert.not_nil(entity.getExtraEntity("errorElsewhereIndicator", i), `should have indicator in stage ${i}`)
      }
    }
  })

  test("deletes indicators only when all highlights removed", () => {
    removeInStage(2)
    removeInStage(3)
    highlightCreator.updateHighlights(assembly, entity)
    for (let i = 4; i <= 5; i++) assert.not_nil(entity.getExtraEntity("errorElsewhereIndicator", i), `stage ${i}`)
    addInStage(3)
    highlightCreator.updateHighlights(assembly, entity)
    for (let i = 3; i <= 5; i++) assert.not_nil(entity.getExtraEntity("errorElsewhereIndicator", i), `stage ${i}`)
    addInStage(2)
    highlightCreator.updateHighlights(assembly, entity)
    for (let i = 1; i <= 5; i++) assert.nil(entity.getExtraEntity("errorElsewhereIndicator", i), `stage ${i}`)
  })

  test("does nothing if created in lower than first stage", () => {
    highlightCreator.updateHighlights(assembly, entity)
    assert.nil(entity.getExtraEntity("errorOutline", 1))
  })
})

describe("config changed highlight", () => {
  before_each(() => {
    for (const i of $range(1, 5)) entity.replaceWorldEntity(i, createEntity(i))
  })
  function setAt(stage: StageNumber) {
    assert(stage >= 2)
    entity._applyDiffAtStage(stage, { foo: stage })
  }
  function setUpgradeAt(stage: StageNumber) {
    assert(stage >= 2)
    // ;(entity._getStageDiffs() as any)[stage] = { name: "test" + stage.toString() }
    entity._applyDiffAtStage(stage, { name: "test" + stage.toString() })
  }
  function clearAt(stage: StageNumber) {
    assert(stage >= 2)
    // ;(entity._getStageDiffs() as any)[stage] = nil
    entity.adjustValueAtStage(stage, entity.getValueAtStage(stage - 1)!)
  }
  function assertCorrect() {
    highlightCreator.updateHighlights(assembly, entity)
    let i = 2
    for (const [stageNumber, changes] of pairs(entity.getStageDiffs() ?? {})) {
      const isUpgrade = changes.name !== nil

      const highlight = assert.not_nil(
        entity.getExtraEntity("configChangedHighlight", stageNumber),
      ) as HighlightBoxEntity
      assert.equal(isUpgrade ? HighlightValues.Upgraded : "logistics", highlight.highlight_box_type, "highlight type")

      const firstI = i
      for (; i < stageNumber; i++) {
        if (i !== firstI)
          assert.nil(entity.getExtraEntity("configChangedHighlight", i), "should not have highlight in stage " + i)

        const highlight = assert.not_nil(
          entity.getExtraEntity("configChangedLaterHighlight", i),
          `stage ${i}`,
        ) as SpriteRender
        assert.equal(isUpgrade ? HighlightValues.UpgradedLater : "item/blueprint", highlight.sprite)
      }
    }
    for (let j = i; j <= 5; j++) {
      if (j !== i)
        assert.nil(entity.getExtraEntity("configChangedHighlight", j), "should not have highlight in stage " + j)
      assert.nil(
        entity.getExtraEntity("configChangedLaterHighlight", j),
        "should not have later highlight in stage " + j,
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
  test("clears when moved to higher stage", () => {
    setAt(3)
    assertCorrect()
    entity.moveToStage(2)
    assertCorrect()
    assert.nil(entity.getExtraEntity("configChangedLaterHighlight", 1))
  })
})
describe("settings remnants", () => {
  function createSettingsRemnant() {
    entity.isSettingsRemnant = true
    for (let i = 1; i <= 5; i++) removeInStage(i)
  }
  function reviveSettingsRemnant() {
    entity.isSettingsRemnant = nil
    for (let i = 1; i <= 5; i++) addInStage(i)
  }
  test("makeSettingsRemnant creates highlights", () => {
    createSettingsRemnant()
    highlightCreator.makeSettingsRemnant(assembly, entity)
    for (let i = 1; i <= 5; i++) {
      assert.not_nil(entity.getExtraEntity("settingsRemnantHighlight", i))
    }
  })
  test("reviveSettingsRemnant removes highlights and sets entities correct", () => {
    createSettingsRemnant()
    highlightCreator.makeSettingsRemnant(assembly, entity)
    reviveSettingsRemnant()
    highlightCreator.reviveSettingsRemnant(assembly, entity)
    for (let i = 1; i <= 5; i++) {
      assert.nil(entity.getExtraEntity("settingsRemnantHighlight", i))
    }
  })
})

test("deleteErrorHighlights deletes all highlights", () => {
  entity.destroyWorldOrPreviewEntity(2)
  entity.destroyWorldOrPreviewEntity(3)
  highlightCreator.updateHighlights(assembly, entity)
  highlightCreator.deleteHighlights(entity)
  for (let i = 1; i <= 5; i++) {
    for (const type of keys<HighlightEntities>()) {
      assert.nil(entity.getExtraEntity(type, i), `stage ${i}`)
    }
  }
})
