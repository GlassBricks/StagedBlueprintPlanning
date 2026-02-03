// Copyright (c) 2022-2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { SurfaceCreateEntity } from "factorio:runtime"
import expect from "tstl-expect"
import { Prototypes } from "../../constants"
import { Entity } from "../../entity/Entity"
import { newProjectEntity, ProjectEntity, StageNumber } from "../../entity/ProjectEntity"
import { Pos } from "../../lib/geometry"
import { EntityHighlights, HighlightTypes } from "../../project/EntityHighlights"
import { simpleInsertPlan } from "../entity/entity-util"
import { moduleMock } from "../module-mock"
import { simpleMock } from "../simple-mock"
import {
  assertConfigChangedHighlightsCorrect,
  assertErrorHighlightsCorrect,
  assertItemRequestHighlightsCorrect,
  assertLastStageHighlightCorrect,
} from "./entity-highlight-test-util"
import { createMockProject, setupTestSurfaces } from "./Project-mock"

interface FooEntity extends Entity {
  foo?: number
}
let entity: ProjectEntity<FooEntity>
let project: ReturnType<typeof createMockProject>

import _highlightCreator = require("../../project/create-highlight")

const highlightCreator = moduleMock(_highlightCreator, false)

const surfaces = setupTestSurfaces(5)
let entityHighlights: EntityHighlights

function wp() {
  return project.worldPresentation
}
function es() {
  return project.worldPresentation.entityStorage
}

before_each(() => {
  project = createMockProject(surfaces)
  entityHighlights = new EntityHighlights(
    project.surfaces,
    project.settings,
    project.worldPresentation,
    project.worldPresentation.entityStorage,
  )
  highlightCreator.createSprite.invokes((params) => simpleMock(params as any))
  entity = newProjectEntity({ name: "stone-furnace" }, Pos(1, 1), 0, 2)
})

function createEntity(stage: StageNumber, params?: Partial<SurfaceCreateEntity>) {
  const entity = surfaces[stage - 1].create_entity({
    name: "stone-furnace",
    position: Pos(1, 1),
    ...params,
  })
  assert(entity, "entity created")
  return entity!
}
function createPreview(stage: StageNumber, params: Partial<SurfaceCreateEntity> = {}) {
  return assert(
    surfaces[stage - 1].create_entity({
      position: Pos(1, 1),
      ...params,
      name: Prototypes.PreviewEntityPrefix + tostring(params?.name ?? "stone-furnace"),
    }),
  )
}

function removeInStage(stage: StageNumber) {
  wp().replaceWorldOrPreviewEntity(entity, stage, createPreview(stage))
}
function addInStage(stage: StageNumber) {
  wp().replaceWorldOrPreviewEntity(entity, stage, createEntity(stage))
}
describe("error highlights", () => {
  before_each(() => {
    for (const i of $range(1, 5)) addInStage(i)
  })
  after_each(() => {
    assertErrorHighlightsCorrect(entity, 5, wp())
  })
  test("creates highlight when world entity missing", () => {
    removeInStage(2)
    entityHighlights.updateAllHighlights(entity)
    expect(es().get(entity, "errorOutline", 2)!).toBeAny()
  })
  test("deletes highlight when entity revived", () => {
    removeInStage(2)
    entityHighlights.updateAllHighlights(entity)
    addInStage(2)
    entityHighlights.updateAllHighlights(entity)
    expect(es().get(entity, "errorOutline", 2)).toBeNil()
  })

  test.each<[readonly number[]]>([[[2]], [[2, 3]], [[2, 4]], [[3]]])(
    "creates indicator in other stages, %s",
    (stages) => {
      const stageSet = new LuaSet()
      for (const stage of stages) {
        removeInStage(stage)
        stageSet.add(stage)
      }
      entityHighlights.updateAllHighlights(entity)

      for (let i = 1; i < 5; i++) {
        if (stageSet.has(i)) {
          expect(es().get(entity, "errorElsewhereIndicator", i)).toBeNil()
        } else {
          expect(es().get(entity, "errorElsewhereIndicator", i)).toBeAny()
        }
      }
    },
  )

  test("deletes indicators only when all highlights removed", () => {
    removeInStage(2)
    removeInStage(3)
    entityHighlights.updateAllHighlights(entity)
    for (let i = 4; i <= 5; i++) expect(es().get(entity, "errorElsewhereIndicator", i)).toBeAny()
    addInStage(3)
    entityHighlights.updateAllHighlights(entity)
    for (let i = 3; i <= 5; i++) expect(es().get(entity, "errorElsewhereIndicator", i)).toBeAny()
    addInStage(2)
    entityHighlights.updateAllHighlights(entity)
    for (let i = 1; i <= 5; i++) expect(es().get(entity, "errorElsewhereIndicator", i)).toBeNil()
  })

  test("does nothing if created in lower than first stage", () => {
    entityHighlights.updateAllHighlights(entity)
    expect(es().get(entity, "errorOutline", 1)).toBeNil()
  })
})
describe("undergrounds", () => {
  before_each(() => {
    surfaces.forEach((s) => s.find_entities().forEach((e) => e.destroy()))
  })
  test("creates error highlight if underground in wrong direction", () => {
    const pos = Pos(1.5, 1.5)
    const undergroundEntity = newProjectEntity(
      {
        name: "underground-belt",
        type: "input",
      },
      pos,
      defines.direction.east,
      2,
    )
    wp().replaceWorldOrPreviewEntity(
      undergroundEntity,
      1,
      createPreview(1, {
        name: "underground-belt",
        position: pos,
      }),
    )
    for (const i of $range(2, 5)) {
      wp().replaceWorldOrPreviewEntity(
        undergroundEntity,
        i,
        createEntity(i, {
          name: "underground-belt",
          type: "output",
          direction: defines.direction.west,
          position: pos,
        }),
      )
    }
    entityHighlights.updateAllHighlights(undergroundEntity)
    expect(es().get(undergroundEntity, "errorOutline", 2)).toBeAny()
    assertErrorHighlightsCorrect(undergroundEntity, 5, wp())
  })
})

describe("config changed highlight", () => {
  before_each(() => {
    for (const i of $range(1, 5)) wp().replaceWorldOrPreviewEntity(entity, i, createEntity(i))
  })
  function setAt(stage: StageNumber) {
    assert(stage >= 2)
    entity._asMut()._applyDiffAtStage(stage, { foo: stage })
  }
  function setUpgradeAt(stage: StageNumber) {
    assert(stage >= 2)
    // ;(entity._stageDiffs as any)[stage] = { name: "test" + stage.toString() }
    entity._asMut()._applyDiffAtStage(stage, { name: "test" + stage.toString() })
  }
  function clearAt(stage: StageNumber) {
    assert(stage >= 2)
    // ;(entity._stageDiffs as any)[stage] = nil
    entity._asMut().adjustValueAtStage(stage, entity.getValueAtStage(stage - 1)!)
  }
  function assertCorrect() {
    entityHighlights.updateAllHighlights(entity)
    assertConfigChangedHighlightsCorrect(entity, 5, wp())
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
    entity._asMut().setFirstStage(2)
    assertCorrect()
    expect(es().get(entity, "configChangedLaterHighlight", 1)).toBeNil()
  })
})

describe("stage delete highlights", () => {
  test("sets highlight if lastStage is set", () => {
    entity._asMut().setLastStage(3)
    entityHighlights.updateAllHighlights(entity)
    assertLastStageHighlightCorrect(entity, wp())
  })

  test("removes highlight if lastStage is cleared", () => {
    entity._asMut().setLastStage(3)
    entityHighlights.updateAllHighlights(entity)
    entity._asMut().setLastStage(nil)
    entityHighlights.updateAllHighlights(entity)
    assertLastStageHighlightCorrect(entity, wp())
  })

  test("does not create highlight if entity is movable", () => {
    const movableEntity = newProjectEntity({ name: "locomotive" }, Pos(1, 1), 0, 2)
    movableEntity._asMut().setLastStage(3)
    entityHighlights.updateAllHighlights(movableEntity)
    assertLastStageHighlightCorrect(movableEntity, wp())
  })
})

describe("settings remnants", () => {
  function createSettingsRemnant() {
    entity._asMut().isSettingsRemnant = true
    for (let i = 1; i <= 5; i++) removeInStage(i)
  }
  function reviveSettingsRemnant() {
    entity._asMut().isSettingsRemnant = nil
    for (let i = 1; i <= 5; i++) addInStage(i)
  }
  test("makeSettingsRemnant creates highlights", () => {
    createSettingsRemnant()
    entityHighlights.makeSettingsRemnantHighlights(entity)
    for (let i = 1; i <= 5; i++) {
      expect(es().get(entity, "settingsRemnantHighlight", i)).toBeAny()
    }
  })
  test("tryReviveSettingsRemnant removes highlights and sets entities correct", () => {
    createSettingsRemnant()
    entityHighlights.makeSettingsRemnantHighlights(entity)
    reviveSettingsRemnant()
    entityHighlights.updateHighlightsOnReviveSettingsRemnant(entity)
    for (let i = 1; i <= 5; i++) {
      expect(es().get(entity, "settingsRemnantHighlight", i)).toBeNil()
    }
  })
})
describe("stage request highlights", () => {
  test("sets highlight when stage is requested", () => {
    entity._asMut().setUnstagedValue(3, {
      items: [simpleInsertPlan(defines.inventory.item_main, "iron-plate", 0)],
    })
    entityHighlights.updateAllHighlights(entity)
    assertItemRequestHighlightsCorrect(entity, 5, wp())
  })
})

describe("excluded from blueprints highlights", () => {
  test("creates highlight when entity is excluded", () => {
    entity._asMut().setExcludedFromBlueprints(3, true)
    entityHighlights.updateAllHighlights(entity)
    expect(es().get(entity, "excludedFromBlueprintsHighlight", 3)).toBeAny()
  })

  test("does not create highlight for non-excluded stages", () => {
    entity._asMut().setExcludedFromBlueprints(3, true)
    entityHighlights.updateAllHighlights(entity)
    expect(es().get(entity, "excludedFromBlueprintsHighlight", 2)).toBeNil()
    expect(es().get(entity, "excludedFromBlueprintsHighlight", 4)).toBeNil()
  })

  test("removes highlight when exclusion is cleared", () => {
    entity._asMut().setExcludedFromBlueprints(3, true)
    entityHighlights.updateAllHighlights(entity)
    entity._asMut().setExcludedFromBlueprints(3, false)
    entityHighlights.updateAllHighlights(entity)
    expect(es().get(entity, "excludedFromBlueprintsHighlight", 3)).toBeNil()
  })
})

test("deleteAllHighlights", () => {
  entityHighlights.updateAllHighlights(entity)
  entityHighlights.deleteAllHighlights(entity)
  for (let i = 1; i <= 5; i++) {
    for (const type of keys<HighlightTypes>()) {
      expect(es().get(entity, type, i)).toBeNil()
    }
  }
})
