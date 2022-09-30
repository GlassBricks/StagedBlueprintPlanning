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

import {
  AsmCircuitConnection,
  circuitConnectionEquals,
  circuitConnectionMatches,
  getDirectionalInfo,
} from "../../entity/AsmCircuitConnection"
import { shallowCopy } from "../../lib"

test("circuitConnectionEquals", () => {
  const entityA = {} as any
  const entityB = {} as any

  const circuitConnectionA: AsmCircuitConnection = {
    fromEntity: entityA,
    fromId: defines.circuit_connector_id.accumulator,
    toEntity: entityB,
    toId: defines.circuit_connector_id.constant_combinator,
    wire: defines.wire_type.red,
  }
  const identical = shallowCopy(circuitConnectionA)
  const circuitConnectionB: AsmCircuitConnection = {
    toEntity: entityA,
    toId: defines.circuit_connector_id.accumulator,
    fromEntity: entityB,
    fromId: defines.circuit_connector_id.constant_combinator,
    wire: defines.wire_type.red,
  }
  assert.true(circuitConnectionEquals(circuitConnectionA, identical))
  assert.true(circuitConnectionEquals(circuitConnectionA, circuitConnectionB))

  const different: AsmCircuitConnection = {
    toEntity: entityA,
    toId: defines.circuit_connector_id.constant_combinator,
    fromEntity: entityA,
    fromId: defines.circuit_connector_id.accumulator,
    wire: defines.wire_type.red,
  }
  assert.false(circuitConnectionEquals(circuitConnectionA, different))
  assert.false(circuitConnectionEquals(circuitConnectionB, different))
})

test("getDirectionalInfo", () => {
  const entityA = {} as any
  const entityB = {} as any

  const circuitConnectionA: AsmCircuitConnection = {
    fromEntity: entityA,
    fromId: defines.circuit_connector_id.accumulator,
    toEntity: entityB,
    toId: defines.circuit_connector_id.constant_combinator,
    wire: defines.wire_type.red,
  }
  assert.same(
    [entityB, defines.circuit_connector_id.accumulator, defines.circuit_connector_id.constant_combinator],
    getDirectionalInfo(circuitConnectionA, entityA),
  )
  assert.same(
    [entityA, defines.circuit_connector_id.constant_combinator, defines.circuit_connector_id.accumulator],
    getDirectionalInfo(circuitConnectionA, entityB),
  )
})
test("circuitConnectionMatches", () => {
  const entityA = {} as any
  const entityB = {} as any

  const connection: AsmCircuitConnection = {
    fromEntity: entityA,
    fromId: 0,
    toEntity: entityB,
    toId: 1,
    wire: defines.wire_type.red,
  }
  assert.true(circuitConnectionMatches(connection, defines.wire_type.red, entityA, 1, 0))
  assert.true(circuitConnectionMatches(connection, defines.wire_type.red, entityB, 0, 1))
  assert.false(circuitConnectionMatches(connection, defines.wire_type.green, entityA, 1, 0))
  assert.false(circuitConnectionMatches(connection, defines.wire_type.red, entityA, 0, 1))
})
