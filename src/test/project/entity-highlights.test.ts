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

import { SurfaceCreateEntity } from "factorio:runtime"
import expect from "tstl-expect"
import { Prototypes } from "../../constants"
import { Entity } from "../../entity/Entity"
import { createProjectEntityNoCopy, ProjectEntity, StageNumber } from "../../entity/ProjectEntity"
import { Pos } from "../../lib/geometry"
import { EntityHighlights, HighlightEntities } from "../../project/entity-highlights"

import { Project } from "../../project/ProjectDef"
import { moduleMock } from "../module-mock"
import { simpleMock } from "../simple-mock"
import { assertConfigChangedHighlightsCorrect, assertErrorHighlightsCorrect } from "./entity-highlight-test-util"
import { createMockProject, setupTestSurfaces } from "./Project-mock"

interface FooEntity extends Entity {
  foo?: number
}
let entity: ProjectEntity<FooEntity>
let project: Project

import _highlightCreator = require("../../project/create-highlight")

const highlightCreator = moduleMock(_highlightCreator, false)

const surfaces = setupTestSurfaces(5)
let entityHighlights: EntityHighlights
before_each(() => {
  project = createMockProject(surfaces)
  entityHighlights = EntityHighlights(project)
  highlightCreator.createSprite.invokes((params) => simpleMock(params as any))
  entity = createProjectEntityNoCopy({ name: "stone-furnace" }, Pos(1, 1), nil, 2)
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
      name: Prototypes.PreviewEntityPrefix + (params?.name ?? "stone-furnace"),
    }),
  )
}

function removeInStage(stage: StageNumber) {
  entity.replaceWorldOrPreviewEntity(stage, createPreview(stage))
}
function addInStage(stage: StageNumber) {
  entity.replaceWorldOrPreviewEntity(stage, createEntity(stage))
}
describe("error highlights", () => {
  before_each(() => {
    for (const i of $range(1, 5)) addInStage(i)
  })
  after_each(() => {
    assertErrorHighlightsCorrect(entity, 5)
  })
  test("creates highlight when world entity missing", () => {
    removeInStage(2)
    entityHighlights.updateAllHighlights(entity)
    expect(entity.getExtraEntity("errorOutline", 2)!).toBeAny()
  })
  test("deletes highlight when entity revived", () => {
    removeInStage(2)
    entityHighlights.updateAllHighlights(entity)
    addInStage(2)
    entityHighlights.updateAllHighlights(entity)
    expect(entity.getExtraEntity("errorOutline", 2)).toBeNil()
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
          expect(entity.getExtraEntity("errorElsewhereIndicator", i)).toBeNil()
        } else {
          expect(entity.getExtraEntity("errorElsewhereIndicator", i)).toBeAny()
        }
      }
    },
  )

  test("deletes indicators only when all highlights removed", () => {
    removeInStage(2)
    removeInStage(3)
    entityHighlights.updateAllHighlights(entity)
    for (let i = 4; i <= 5; i++) expect(entity.getExtraEntity("errorElsewhereIndicator", i)).toBeAny()
    addInStage(3)
    entityHighlights.updateAllHighlights(entity)
    for (let i = 3; i <= 5; i++) expect(entity.getExtraEntity("errorElsewhereIndicator", i)).toBeAny()
    addInStage(2)
    entityHighlights.updateAllHighlights(entity)
    for (let i = 1; i <= 5; i++) expect(entity.getExtraEntity("errorElsewhereIndicator", i)).toBeNil()
  })

  test("does nothing if created in lower than first stage", () => {
    entityHighlights.updateAllHighlights(entity)
    expect(entity.getExtraEntity("errorOutline", 1)).toBeNil()
  })
})
describe("undergrounds", () => {
  before_each(() => {
    surfaces.forEach((s) => s.find_entities().forEach((e) => e.destroy()))
  })
  test("creates error highlight if underground in wrong direction", () => {
    const pos = Pos(1.5, 1.5)
    const undergroundEntity = createProjectEntityNoCopy(
      {
        name: "underground-belt",
        type: "input",
      },
      pos,
      defines.direction.east,
      2,
    )
    project.content.add(undergroundEntity)
    undergroundEntity.replaceWorldOrPreviewEntity(
      1,
      createPreview(1, {
        name: "underground-belt",
        position: pos,
      }),
    )
    for (const i of $range(2, 5)) {
      undergroundEntity.replaceWorldOrPreviewEntity(
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
    expect(undergroundEntity.getExtraEntity("errorOutline", 2)).toBeAny()
    assertErrorHighlightsCorrect(undergroundEntity, 5)
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
    entityHighlights.updateAllHighlights(entity)
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
    entity.setFirstStageUnchecked(2)
    assertCorrect()
    expect(entity.getExtraEntity("configChangedLaterHighlight", 1)).toBeNil()
  })
})

describe("stage delete highlights", () => {
  test("sets highlight if lastStage is set", () => {
    entity.setLastStageUnchecked(3)
    entityHighlights.updateAllHighlights(entity)
    expect(entity.getExtraEntity("stageDeleteHighlight", 3)).toBeAny()
  })

  test("removes highlight if lastStage is cleared", () => {
    entity.setLastStageUnchecked(3)
    entityHighlights.updateAllHighlights(entity)
    entity.setLastStageUnchecked(nil)
    entityHighlights.updateAllHighlights(entity)
    expect(entity.getExtraEntity("stageDeleteHighlight", 3)).toBeNil()
  })

  test("does not create highlight if lastStage == firstStage", () => {
    entity.setLastStageUnchecked(2)
    entityHighlights.updateAllHighlights(entity)
    expect(entity.getExtraEntity("stageDeleteHighlight", 2)).toBeNil()
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
    entityHighlights.makeSettingsRemnantHighlights(entity)
    for (let i = 1; i <= 5; i++) {
      expect(entity.getExtraEntity("settingsRemnantHighlight", i)).toBeAny()
    }
  })
  test("tryReviveSettingsRemnant removes highlights and sets entities correct", () => {
    createSettingsRemnant()
    entityHighlights.makeSettingsRemnantHighlights(entity)
    reviveSettingsRemnant()
    entityHighlights.updateHighlightsOnReviveSettingsRemnant(entity)
    for (let i = 1; i <= 5; i++) {
      expect(entity.getExtraEntity("settingsRemnantHighlight", i)).toBeNil()
    }
  })
})

test("deleteAllHighlights", () => {
  entity.destroyWorldOrPreviewEntity(2)
  entity.destroyWorldOrPreviewEntity(3)
  entityHighlights.updateAllHighlights(entity)
  entityHighlights.deleteAllHighlights(entity)
  for (let i = 1; i <= 5; i++) {
    for (const type of keys<HighlightEntities>()) {
      expect(entity.getExtraEntity(type, i)).toBeNil()
    }
  }
})
