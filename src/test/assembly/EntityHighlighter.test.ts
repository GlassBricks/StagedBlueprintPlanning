/*
 * Copyright (c) 2022-2023 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import expect from "tstl-expect"
import { Assembly } from "../../assembly/AssemblyDef"
import {
  deleteAllHighlights,
  HighlightEntities,
  makeSettingsRemnantHighlights,
  updateAllHighlights,
  updateHighlightsOnSettingsRemnantRevived,
} from "../../assembly/EntityHighlighter"
import { Prototypes } from "../../constants"
import { AssemblyEntity, createAssemblyEntity, StageNumber } from "../../entity/AssemblyEntity"
import { Entity } from "../../entity/Entity"
import { Pos } from "../../lib/geometry"
import { moduleMock } from "../module-mock"
import { simpleMock } from "../simple-mock"
import { createMockAssembly, setupTestSurfaces } from "./Assembly-mock"
import { assertConfigChangedHighlightsCorrect, assertErrorHighlightsCorrect } from "./entity-highlight-test-util"

interface FooEntity extends Entity {
  foo?: number
}
let entity: AssemblyEntity<FooEntity>
let assembly: Assembly

import _highlightCreator = require("../../assembly/HighlightCreator")

const highlightCreator = moduleMock(_highlightCreator, false)

const surfaces = setupTestSurfaces(5)
before_each(() => {
  assembly = createMockAssembly(surfaces)
  highlightCreator.createSprite.invokes((params) => simpleMock(params as any))
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
  after_each(() => {
    assertErrorHighlightsCorrect(entity, 5)
  })
  test("creates highlight when world entity missing", () => {
    removeInStage(2)
    updateAllHighlights(assembly, entity, 2, 2)
    expect(entity.getExtraEntity("errorOutline", 2)!).to.be.any()
  })

  test("deletes highlight when entity revived", () => {
    removeInStage(2)
    updateAllHighlights(assembly, entity, 2, 2)
    addInStage(2)
    updateAllHighlights(assembly, entity, 2, 2)
    expect(entity.getExtraEntity("errorOutline", 2)).to.be.nil()
  })

  test.each([[[2]], [[2, 3]], [[2, 4]], [[3]]])("creates indicator in other stages, %s", (stages) => {
    const stageSet = new LuaSet()
    for (const stage of stages) {
      removeInStage(stage)
      stageSet.add(stage)
    }
    updateAllHighlights(assembly, entity)

    for (let i = 1; i < 5; i++) {
      if (i == 1 || stageSet.has(i)) {
        expect(entity.getExtraEntity("errorElsewhereIndicator", i)).to.be.nil()
      } else {
        expect(entity.getExtraEntity("errorElsewhereIndicator", i)).to.be.any()
      }
    }
  })

  test("deletes indicators only when all highlights removed", () => {
    removeInStage(2)
    removeInStage(3)
    updateAllHighlights(assembly, entity)
    for (let i = 4; i <= 5; i++) expect(entity.getExtraEntity("errorElsewhereIndicator", i)).to.be.any()
    addInStage(3)
    updateAllHighlights(assembly, entity)
    for (let i = 3; i <= 5; i++) expect(entity.getExtraEntity("errorElsewhereIndicator", i)).to.be.any()
    addInStage(2)
    updateAllHighlights(assembly, entity)
    for (let i = 1; i <= 5; i++) expect(entity.getExtraEntity("errorElsewhereIndicator", i)).to.be.nil()
  })

  test("does nothing if created in lower than first stage", () => {
    updateAllHighlights(assembly, entity)
    expect(entity.getExtraEntity("errorOutline", 1)).to.be.nil()
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
    updateAllHighlights(assembly, entity)
    assertConfigChangedHighlightsCorrect(entity, 5)
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
    expect(entity.getExtraEntity("configChangedLaterHighlight", 1)).to.be.nil()
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
    makeSettingsRemnantHighlights(assembly, entity)
    for (let i = 1; i <= 5; i++) {
      expect(entity.getExtraEntity("settingsRemnantHighlight", i)).to.be.any()
    }
  })
  test("reviveSettingsRemnant removes highlights and sets entities correct", () => {
    createSettingsRemnant()
    makeSettingsRemnantHighlights(assembly, entity)
    reviveSettingsRemnant()
    updateHighlightsOnSettingsRemnantRevived(assembly, entity)
    for (let i = 1; i <= 5; i++) {
      expect(entity.getExtraEntity("settingsRemnantHighlight", i)).to.be.nil()
    }
  })
})

test("deleteAllHighlights deletes all highlights", () => {
  entity.destroyWorldOrPreviewEntity(2)
  entity.destroyWorldOrPreviewEntity(3)
  updateAllHighlights(assembly, entity)
  deleteAllHighlights(entity)
  for (let i = 1; i <= 5; i++) {
    for (const type of keys<HighlightEntities>()) {
      expect(entity.getExtraEntity(type, i)).to.be.nil()
    }
  }
})
