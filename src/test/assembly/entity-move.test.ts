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

import { forceMoveEntity, tryMoveAllEntities } from "../../assembly/entity-move"
import { Pos } from "../../lib/geometry"
import { setupEntityMoveTest } from "./setup-entity-move-test"

const { surfaces, entities, origDir, origPos } = setupEntityMoveTest(nil, nil, nil, false)

const newPos = { x: 1.5, y: 2 }
const newDir = defines.direction.south
test("can move single entity", () => {
  const entity = entities[0]
  forceMoveEntity(entity, newPos, newDir)
  assert.same(newPos, entity.position)
  assert.same(newDir, entity.direction)
})

test("can move multiple entities", () => {
  const result = tryMoveAllEntities(entities, newPos, newDir)
  assert.equal("success", result)
  for (const entity of entities) {
    assert.same(newPos, entity.position)
    assert.same(newDir, entity.direction)
  }
})

test("can teleport onto self", () => {
  const newPos2 = Pos.plus(origPos, { x: 1, y: 0 })
  const entity = entities[0]
  forceMoveEntity(entity, newPos2, origDir)
  const result = tryMoveAllEntities(entities, newPos2, origDir)
  assert.equal("success", result)
  for (const entity of entities) {
    assert.same(newPos2, entity.position)
    assert.same(origDir, entity.direction)
  }
})

test("does not move any if any overlaps", () => {
  surfaces[1].create_entity({
    name: "inserter",
    position: newPos,
    direction: defines.direction.east,
  })
  const result = tryMoveAllEntities(entities, newPos, newDir)
  assert.equal("overlap", result)
  for (const entity of entities) {
    assert.same(origPos, entity.position)
    assert.same(origDir, entity.direction)
  }
})

test("ok if already at target position", () => {
  forceMoveEntity(entities[0], newPos, newDir)

  const result = tryMoveAllEntities(entities, newPos, newDir)
  assert.equal("success", result)
  for (const entity of entities) {
    assert.same(newPos, entity.position)
    assert.same(newDir, entity.direction)
  }
})

test("does not move any if wires cannot reach", () => {
  const pole = surfaces[1].create_entity({
    name: "small-electric-pole",
    position: { x: -6, y: -6 }, // barely in range
  })!
  assert(
    pole.connect_neighbour({
      wire: defines.wire_type.red,
      target_entity: entities[1],
      target_circuit_id: defines.circuit_connector_id.combinator_input,
    }),
    "failed to connect",
  )
  const result = tryMoveAllEntities(entities, newPos, newDir)
  assert.equal("wires-cannot-reach", result)
  for (const entity of entities) {
    assert.same(origDir, entity.direction)
    assert.same(origPos, entity.position)
  }
})
