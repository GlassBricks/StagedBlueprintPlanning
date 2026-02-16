// Copyright (c) 2024 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import expect from "tstl-expect"
import { newProjectEntity, ProjectEntity, StageDiffs } from "../../entity/ProjectEntity"
import { newProjectContent } from "../../entity/ProjectContent"
import {
  EntityExport,
  serializeAllEntities,
  serializeEntity,
  ExportNilPlaceholder,
  fromExportStageDiffs,
  deserializeEntity,
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

describe("serializeEntity and deserializeEntity", () => {
  it("should serialize and deserialize entity correctly", () => {
    const initialEntity = {
      name: "foo",
      a: 2,
      b: "hi",
      c: "hello",
    }
    const entity = newProjectEntity(initialEntity, { x: 1, y: 2 }, 4, 1)
    entity.setLastStage(5)
    entity.setStageDiffsDirectly({
      2: {
        a: 1,
        b: "test",
        c: getNilPlaceholder(),
      },
    })

    const exportedEntity: EntityExport = serializeEntity(entity, 17)
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
      stageProperties: nil,
    })
    const imported = deserializeEntity(exportedEntity)
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
    const exported = serializeEntity(entity)
    expect(exported.direction).toBeNil()
  })
})

test("serializeAllEntities", () => {
  const content = newProjectContent()
  const entity1 = newProjectEntity({ name: "foo" }, { x: 1, y: 2 }, 4, 1)
  const entity2 = newProjectEntity({ name: "bar" }, { x: 3, y: 4 }, 6, 2)
  content.addEntity(entity1)
  content.addEntity(entity2)
  const fromId = 2
  const toId = 4
  content.addWireConnection({
    fromEntity: entity1,
    toEntity: entity2,
    fromId,
    toId,
  })

  const entities = newLuaSet<ProjectEntity>(entity1, entity2)
  const [export1, export2] = serializeAllEntities(entities)

  expect(export1).toMatchTable({ entityNumber: 1 })
  expect(export2).toMatchTable({ entityNumber: 2 })

  expect(export1.wires).toEqual([[1, fromId, 2, toId]])
  expect(export2.wires).toEqual([[2, toId, 1, fromId]])
})

describe("stage properties export/import", () => {
  it("should serialize and deserialize unstaged values correctly", () => {
    const entity = newProjectEntity({ name: "fast-inserter" }, { x: 1, y: 2 }, 0, 1)
    entity.setLastStage(3)

    const unstagedValue1 = { items: [simpleInsertPlan(defines.inventory.chest, "iron-ore", 0, 10)] }
    const unstagedValue2 = { items: [simpleInsertPlan(defines.inventory.chest, "copper-ore", 1, 20)] }

    entity.setUnstagedValue(1, unstagedValue1)
    entity.setUnstagedValue(3, unstagedValue2)

    const exported = serializeEntity(entity, 42)
    expect(exported.stageProperties).toEqual({
      unstagedValue: {
        1: unstagedValue1,
        3: unstagedValue2,
      },
    })

    const imported = deserializeEntity(exported)
    expect(imported.getUnstagedValue(1)).toEqual(unstagedValue1)
    expect(imported.getUnstagedValue(2)).toBeNil()
    expect(imported.getUnstagedValue(3)).toEqual(unstagedValue2)
  })

  it("should handle entity with no stage properties", () => {
    const entity = newProjectEntity({ name: "fast-inserter" }, { x: 1, y: 2 }, 0, 1)
    const exported = serializeEntity(entity)

    expect(exported.stageProperties).toBeNil()

    const imported = deserializeEntity(exported)
    expect(imported.getUnstagedValue(1)).toBeNil()
  })

  it("should handle partial unstaged values across stages", () => {
    const entity = newProjectEntity({ name: "assembling-machine-1" }, { x: 0, y: 0 }, 0, 2)
    entity.setLastStage(5)

    const unstagedValue = { items: [simpleInsertPlan(defines.inventory.crafter_input, "iron-plate", 0, 50)] }
    entity.setUnstagedValue(4, unstagedValue)

    const exported = serializeEntity(entity)
    expect(exported.stageProperties).toEqual({
      unstagedValue: {
        4: unstagedValue,
      },
    })

    const imported = deserializeEntity(exported)
    expect(imported.getUnstagedValue(2)).toBeNil()
    expect(imported.getUnstagedValue(3)).toBeNil()
    expect(imported.getUnstagedValue(4)).toEqual(unstagedValue)
    expect(imported.getUnstagedValue(5)).toBeNil()
  })

  it("should serialize and deserialize excludedFromBlueprints", () => {
    const entity = newProjectEntity({ name: "fast-inserter" }, { x: 1, y: 2 }, 0, 1)
    entity.setLastStage(5)
    entity.setExcludedFromBlueprints(2, true)
    entity.setExcludedFromBlueprints(4, true)

    const exported = serializeEntity(entity)
    expect(exported.stageProperties).toEqual({
      excludedFromBlueprints: {
        2: true,
        4: true,
      },
    })

    const imported = deserializeEntity(exported)
    expect(imported.isExcludedFromBlueprints(1)).toBe(false)
    expect(imported.isExcludedFromBlueprints(2)).toBe(true)
    expect(imported.isExcludedFromBlueprints(3)).toBe(false)
    expect(imported.isExcludedFromBlueprints(4)).toBe(true)
  })

  it("should round-trip entity with both unstagedValue and excludedFromBlueprints", () => {
    const entity = newProjectEntity({ name: "fast-inserter" }, { x: 1, y: 2 }, 0, 1)
    entity.setLastStage(5)

    const unstagedValue = { items: [simpleInsertPlan(defines.inventory.chest, "iron-ore", 0, 10)] }
    entity.setUnstagedValue(2, unstagedValue)
    entity.setExcludedFromBlueprints(3, true)

    const exported = serializeEntity(entity)
    expect(exported.stageProperties).toEqual({
      unstagedValue: { 2: unstagedValue },
      excludedFromBlueprints: { 3: true },
    })

    const imported = deserializeEntity(exported)
    expect(imported.getUnstagedValue(2)).toEqual(unstagedValue)
    expect(imported.isExcludedFromBlueprints(3)).toBe(true)
    expect(imported.isExcludedFromBlueprints(2)).toBe(false)
    expect(imported.getUnstagedValue(3)).toBeNil()
  })

  it("should deserialize legacy unstagedValue format", () => {
    const unstagedValue = { items: [simpleInsertPlan(defines.inventory.chest, "iron-ore", 0, 10)] }
    const legacyExport: EntityExport = {
      entityNumber: 1,
      firstStage: 1,
      lastStage: 3,
      firstValue: { name: "fast-inserter" },
      position: { x: 1, y: 2 },
      unstagedValue: { 2: unstagedValue },
    }

    const imported = deserializeEntity(legacyExport)
    expect(imported.getUnstagedValue(2)).toEqual(unstagedValue)
  })
})
