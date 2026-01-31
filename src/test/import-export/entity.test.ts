// Copyright (c) 2024 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import expect from "tstl-expect"
import { addWireConnection, newProjectEntity, ProjectEntity, StageDiffs } from "../../entity/ProjectEntity"
import {
  EntityExport,
  exportAllEntities,
  exportEntity,
  ExportNilPlaceholder,
  fromExportStageDiffs,
  importEntity,
  isExportNilPlaceholder,
  StageDiffsExport,
  toExportStageDiffs,
} from "../../import-export/entity"
import { getNilPlaceholder } from "../../utils/diff-value"
import { simpleInsertPlan } from "../entity/entity-util"

test("isNilPlaceholder", () => {
  expect(isExportNilPlaceholder({})).toBe(false)
  expect(isExportNilPlaceholder({ __nil: true })).toBe(true)
})
test("toBpStageDiffs", () => {
  const value: StageDiffs<any> = {
    2: {
      a: 1,
      b: {},
      c: getNilPlaceholder(),
    },
  }
  const expected = {
    2: {
      a: 1,
      b: {},
      c: { __nil: true },
    },
  }
  expect(toExportStageDiffs(value)).toEqual(expected)
})
test("fromBpStageDiffs", () => {
  const value: StageDiffsExport<any> = {
    "2": {
      a: 1,
      b: {},
      c: { __nil: true },
    },
  }
  const expected: StageDiffs<any> = {
    2: {
      a: 1,
      b: {},
      c: getNilPlaceholder(),
    },
  }
  expect(fromExportStageDiffs(value)).toEqual(expected)
})

describe("exportEntity and importEntity", () => {
  it("should export and import entity correctly", () => {
    const initialEntity = {
      name: "foo",
      a: 2,
      b: "hi",
      c: "hello",
    }
    const entity = newProjectEntity(initialEntity, { x: 1, y: 2 }, 4, 1)
    entity.setLastStageUnchecked(5)
    entity.setStageDiffsDirectly({
      2: {
        a: 1,
        b: "test",
        c: getNilPlaceholder(),
      },
    })

    const exportedEntity: EntityExport = exportEntity(entity, 17)
    expect(exportedEntity).toEqual({
      entityNumber: 17,
      position: { x: 1, y: 2 },
      direction: 4,
      firstValue: {
        name: "foo",
        a: 2,
        b: "hi",
        c: "hello",
      },
      stageDiffs: {
        2: {
          a: 1,
          b: "test",
          c: { __nil: true } satisfies ExportNilPlaceholder,
        },
      },
      firstStage: 1,
      lastStage: 5,
      unstagedValue: nil,
    })
    const imported = importEntity(exportedEntity)
    expect(imported).toMatchTable({
      position: { x: 1, y: 2 },
      direction: 4,
      firstValue: {
        name: "foo",
        a: 2,
        b: "hi",
        c: "hello",
      },
      stageDiffs: {
        2: {
          a: 1,
          b: "test",
          c: getNilPlaceholder(),
        },
      },
    })
  })
  it("should handle optional direction being nil", () => {
    const entity = newProjectEntity({ name: "foo", a: 2, b: "hi", c: "hello" }, { x: 1, y: 2 }, 0, 1)
    const exported = exportEntity(entity)
    expect(exported.direction).toBeNil()
  })
})

test("exportAllEntities", () => {
  const entity1 = newProjectEntity({ name: "foo" }, { x: 1, y: 2 }, 4, 1)
  const entity2 = newProjectEntity({ name: "bar" }, { x: 3, y: 4 }, 6, 2)
  const fromId = 2
  const toId = 4
  addWireConnection({
    fromEntity: entity1,
    toEntity: entity2,
    fromId,
    toId,
  })

  const entities = newLuaSet<ProjectEntity>(entity1, entity2)
  const [export1, export2] = exportAllEntities(entities)

  expect(export1).toMatchTable({ entityNumber: 1 })
  expect(export2).toMatchTable({ entityNumber: 2 })

  expect(export1.wires).toEqual([[1, fromId, 2, toId]])
  expect(export2.wires).toEqual([[2, toId, 1, fromId]])
})

describe("unstaged value export/import", () => {
  it("should export and import unstaged values correctly", () => {
    const entity = newProjectEntity({ name: "fast-inserter" }, { x: 1, y: 2 }, 0, 1)
    entity.setLastStageUnchecked(3)

    // Add unstaged values for different stages
    const unstagedValue1 = { items: [simpleInsertPlan(defines.inventory.chest, "iron-ore", 0, 10)] }
    const unstagedValue2 = { items: [simpleInsertPlan(defines.inventory.chest, "copper-ore", 1, 20)] }

    entity.setUnstagedValue(1, unstagedValue1)
    entity.setUnstagedValue(3, unstagedValue2)

    const exported = exportEntity(entity, 42)
    expect(exported.unstagedValue).toEqual({
      1: unstagedValue1,
      3: unstagedValue2,
    })

    const imported = importEntity(exported)
    expect(imported.getUnstagedValue(1)).toEqual(unstagedValue1)
    expect(imported.getUnstagedValue(2)).toBeNil()
    expect(imported.getUnstagedValue(3)).toEqual(unstagedValue2)
  })

  it("should handle entity with no unstaged values", () => {
    const entity = newProjectEntity({ name: "fast-inserter" }, { x: 1, y: 2 }, 0, 1)
    const exported = exportEntity(entity)

    expect(exported.unstagedValue).toBeNil()

    const imported = importEntity(exported)
    expect(imported.getUnstagedValue(1)).toBeNil()
  })

  it("should handle partial unstaged values across stages", () => {
    const entity = newProjectEntity({ name: "assembling-machine-1" }, { x: 0, y: 0 }, 0, 2)
    entity.setLastStageUnchecked(5)

    // Only set unstaged value for stage 4
    const unstagedValue = { items: [simpleInsertPlan(defines.inventory.crafter_input, "iron-plate", 0, 50)] }
    entity.setUnstagedValue(4, unstagedValue)

    const exported = exportEntity(entity)
    expect(exported.unstagedValue).toEqual({
      4: unstagedValue,
    })

    const imported = importEntity(exported)
    expect(imported.getUnstagedValue(2)).toBeNil()
    expect(imported.getUnstagedValue(3)).toBeNil()
    expect(imported.getUnstagedValue(4)).toEqual(unstagedValue)
    expect(imported.getUnstagedValue(5)).toBeNil()
  })
})
