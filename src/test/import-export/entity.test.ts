/*
 * Copyright (c) 2024 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import expect from "tstl-expect"
import { addWireConnection, createProjectEntityNoCopy, StageDiffs } from "../../entity/ProjectEntity"
import {
  exportEntity,
  EntityExport,
  ExportNilPlaceholder,
  StageDiffsExport,
  fromExportStageDiffs,
  importEntity,
  isExportNilPlaceholder,
  toExportStageDiffs,
  exportAllEntities,
} from "../../import-export/entity"
import { getNilPlaceholder } from "../../utils/diff-value"

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
    const entity = createProjectEntityNoCopy(initialEntity, { x: 1, y: 2 }, 4, 1)
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
    const entity = createProjectEntityNoCopy({ name: "foo", a: 2, b: "hi", c: "hello" }, { x: 1, y: 2 }, undefined, 1)
    const exported = exportEntity(entity)
    expect(exported.direction).toBeNil()
  })
})

test("exportAllEntities", () => {
  const entity1 = createProjectEntityNoCopy({ name: "foo" }, { x: 1, y: 2 }, 4, 1)
  const entity2 = createProjectEntityNoCopy({ name: "bar" }, { x: 3, y: 4 }, 6, 2)
  const fromId = 2
  const toId = 4
  addWireConnection({
    fromEntity: entity1,
    toEntity: entity2,
    fromId,
    toId,
  })

  const [export1, export2] = exportAllEntities(newLuaSet(entity1, entity2))

  expect(export1).toMatchTable({ entityNumber: 1 })
  expect(export2).toMatchTable({ entityNumber: 2 })

  expect(export1.wires).toEqual([[1, fromId, 2, toId]])
  expect(export2.wires).toEqual([[2, toId, 1, fromId]])
})
