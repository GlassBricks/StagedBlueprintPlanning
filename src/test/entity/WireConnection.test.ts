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

import { WireConnection, wireConnectionEquals } from "../../entity/WireConnection"
import { shallowCopy } from "../../lib"

test("wireConnectionEquals", () => {
  const entityA = {} as any
  const entityB = {} as any

  const wireConnectionA: WireConnection = {
    fromEntity: entityA,
    fromType: defines.circuit_connector_id.accumulator,
    toEntity: entityB,
    toType: defines.circuit_connector_id.constant_combinator,
    wireType: defines.wire_type.red,
  }
  const identical = shallowCopy(wireConnectionA)
  const wireConnectionB: WireConnection = {
    toEntity: entityA,
    toType: defines.circuit_connector_id.accumulator,
    fromEntity: entityB,
    fromType: defines.circuit_connector_id.constant_combinator,
    wireType: defines.wire_type.red,
  }
  assert.true(wireConnectionEquals(wireConnectionA, identical))
  assert.true(wireConnectionEquals(wireConnectionA, wireConnectionB))

  const different: WireConnection = {
    toEntity: entityA,
    toType: defines.circuit_connector_id.constant_combinator,
    fromEntity: entityA,
    fromType: defines.circuit_connector_id.accumulator,
    wireType: defines.wire_type.red,
  }
  assert.false(wireConnectionEquals(wireConnectionA, different))
  assert.false(wireConnectionEquals(wireConnectionB, different))
})
