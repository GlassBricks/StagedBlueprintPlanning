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
  circuitConnectionEquals,
  circuitConnectionMatches,
  getDirectionalInfo,
  ProjectCircuitConnection,
} from "../../entity/circuit-connection"
import { shallowCopy } from "../../lib"

test("circuitConnectionEquals", () => {
  const entityA = {} as any
  const entityB = {} as any

  const circuitConnectionA: ProjectCircuitConnection = {
    fromEntity: entityA,
    fromId: defines.wire_connector_id.circuit_red,
    toEntity: entityB,
    toId: defines.wire_connector_id.combinator_input_red,
  }
  const identical = shallowCopy(circuitConnectionA)
  const circuitConnectionB: ProjectCircuitConnection = {
    toEntity: entityA,
    toId: defines.wire_connector_id.circuit_red,
    fromEntity: entityB,
    fromId: defines.wire_connector_id.combinator_input_red,
  }
  expect(circuitConnectionEquals(circuitConnectionA, identical)).toBe(true)
  expect(circuitConnectionEquals(circuitConnectionA, circuitConnectionB)).toBe(true)

  const different: ProjectCircuitConnection = {
    toEntity: entityA,
    toId: defines.wire_connector_id.combinator_input_red,
    fromEntity: entityA,
    fromId: defines.wire_connector_id.circuit_red,
  }
  expect(circuitConnectionEquals(circuitConnectionA, different)).toBe(false)
  expect(circuitConnectionEquals(circuitConnectionB, different)).toBe(false)
})

test("getDirectionalInfo", () => {
  const entityA = {} as any
  const entityB = {} as any

  const circuitConnectionA: ProjectCircuitConnection = {
    fromEntity: entityA,
    fromId: defines.wire_connector_id.circuit_red,
    toEntity: entityB,
    toId: defines.wire_connector_id.combinator_output_red,
  }
  expect(getDirectionalInfo(circuitConnectionA, entityA)).toEqual([
    entityB,
    defines.wire_connector_id.circuit_red,
    defines.wire_connector_id.combinator_output_red,
  ])
  expect(getDirectionalInfo(circuitConnectionA, entityB)).toEqual([
    entityA,
    defines.wire_connector_id.combinator_output_red,
    defines.wire_connector_id.circuit_red,
  ])
})
test("circuitConnectionMatches", () => {
  const entityA = {} as any
  const entityB = {} as any

  const connection: ProjectCircuitConnection = {
    fromEntity: entityA,
    fromId: 0,
    toEntity: entityB,
    toId: 1,
  }
  expect(circuitConnectionMatches(connection, entityA, 1, 0)).toBe(true)
  expect(circuitConnectionMatches(connection, entityB, 0, 1)).toBe(true)
  expect(circuitConnectionMatches(connection, entityA, 1, 0)).toBe(false)
  expect(circuitConnectionMatches(connection, entityA, 0, 1)).toBe(false)
})
