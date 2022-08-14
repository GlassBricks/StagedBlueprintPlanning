/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of BBPP3.
 *
 * BBPP3 is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * BBPP3 is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with BBPP3. If not, see <https://www.gnu.org/licenses/>.
 */

import { AssemblyWireConnection, getDirectionalInfo, wireConnectionEquals } from "../../entity/AssemblyWireConnection"
import { shallowCopy } from "../../lib"

test("wireConnectionEquals", () => {
  const entityA = {} as any
  const entityB = {} as any

  const wireConnectionA: AssemblyWireConnection = {
    fromEntity: entityA,
    fromId: defines.circuit_connector_id.accumulator,
    toEntity: entityB,
    toId: defines.circuit_connector_id.constant_combinator,
    wire: defines.wire_type.red,
  }
  const identical = shallowCopy(wireConnectionA)
  const wireConnectionB: AssemblyWireConnection = {
    toEntity: entityA,
    toId: defines.circuit_connector_id.accumulator,
    fromEntity: entityB,
    fromId: defines.circuit_connector_id.constant_combinator,
    wire: defines.wire_type.red,
  }
  assert.true(wireConnectionEquals(wireConnectionA, identical))
  assert.true(wireConnectionEquals(wireConnectionA, wireConnectionB))

  const different: AssemblyWireConnection = {
    toEntity: entityA,
    toId: defines.circuit_connector_id.constant_combinator,
    fromEntity: entityA,
    fromId: defines.circuit_connector_id.accumulator,
    wire: defines.wire_type.red,
  }
  assert.false(wireConnectionEquals(wireConnectionA, different))
  assert.false(wireConnectionEquals(wireConnectionB, different))
})

test("getDirectionalInfo", () => {
  const entityA = {} as any
  const entityB = {} as any

  const wireConnectionA: AssemblyWireConnection = {
    fromEntity: entityA,
    fromId: defines.circuit_connector_id.accumulator,
    toEntity: entityB,
    toId: defines.circuit_connector_id.constant_combinator,
    wire: defines.wire_type.red,
  }
  assert.same(
    [entityB, defines.circuit_connector_id.accumulator, defines.circuit_connector_id.constant_combinator],
    getDirectionalInfo(wireConnectionA, entityA),
  )
  assert.same(
    [entityA, defines.circuit_connector_id.constant_combinator, defines.circuit_connector_id.accumulator],
    getDirectionalInfo(wireConnectionA, entityB),
  )
})
