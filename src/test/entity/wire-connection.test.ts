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
import {
  getDirectionalInfo,
  ProjectWireConnection,
  wireConnectionEquals,
  wireConnectionMatches,
} from "../../entity/wire-connection"
import { shallowCopy } from "../../lib"

test("wireConnectionEquals", () => {
  const entityA = {} as any
  const entityB = {} as any

  const wireConnectionA: ProjectWireConnection = {
    fromEntity: entityA,
    fromId: defines.wire_connector_id.circuit_red,
    toEntity: entityB,
    toId: defines.wire_connector_id.circuit_green,
  }
  const identical = shallowCopy(wireConnectionA)
  const wireConnectionB: ProjectWireConnection = {
    toEntity: entityA,
    toId: defines.wire_connector_id.circuit_red,
    fromEntity: entityB,
    fromId: defines.wire_connector_id.circuit_green,
  }
  expect(wireConnectionEquals(wireConnectionA, identical)).toBe(true)
  expect(wireConnectionEquals(wireConnectionA, wireConnectionB)).toBe(true)

  const different: ProjectWireConnection = {
    toEntity: entityA,
    toId: defines.wire_connector_id.combinator_input_red,
    fromEntity: entityA,
    fromId: defines.wire_connector_id.circuit_red,
  }
  expect(wireConnectionEquals(wireConnectionA, different)).toBe(false)
  expect(wireConnectionEquals(wireConnectionB, different)).toBe(false)
})

test("getDirectionalInfo", () => {
  const entityA = {} as any
  const entityB = {} as any

  const wireConnectionA: ProjectWireConnection = {
    fromEntity: entityA,
    fromId: defines.wire_connector_id.circuit_red,
    toEntity: entityB,
    toId: defines.wire_connector_id.combinator_output_red,
  }
  expect(getDirectionalInfo(wireConnectionA, entityA)).toEqual([
    entityB,
    defines.wire_connector_id.circuit_red,
    defines.wire_connector_id.combinator_output_red,
  ])
  expect(getDirectionalInfo(wireConnectionA, entityB)).toEqual([
    entityA,
    defines.wire_connector_id.combinator_output_red,
    defines.wire_connector_id.circuit_red,
  ])
})

test("wireConnectionMatches", () => {
  const entityA = {} as any
  const entityB = {} as any

  const connection: ProjectWireConnection = {
    fromEntity: entityA,
    fromId: 0,
    toEntity: entityB,
    toId: 1,
  }
  expect(wireConnectionMatches(connection, entityA, 1, 0)).toBe(true)
  expect(wireConnectionMatches(connection, entityB, 0, 1)).toBe(true)
  expect(wireConnectionMatches(connection, entityB, 1, 0)).toBe(false)
  expect(wireConnectionMatches(connection, entityA, 0, 1)).toBe(false)
})
