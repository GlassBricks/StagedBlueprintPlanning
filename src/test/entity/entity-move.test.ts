/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { forceDollyEntity, tryDollyAllEntities } from "../../entity/picker-dollies"
import { Pos } from "../../lib/geometry"
import { setupEntityMoveTest } from "./setup-entity-move-test"
import expect from "tstl-expect"

const { surfaces, entities, origDir, origPos } = setupEntityMoveTest()

const newPos = { x: 1.5, y: 2 }
const newDir = defines.direction.south
test("forceMoveEntity moves entities", () => {
  const entity = entities[0]
  forceDollyEntity(entity, newPos, newDir)
  expect(entity.position).to.equal(newPos)
  expect(entity.direction).to.equal(newDir)
})

test("tryMoveAllEntities moves all entities", () => {
  const result = tryDollyAllEntities(entities, newPos, newDir)
  expect(result).to.be("success")
  for (const entity of entities) {
    expect(entity.position).to.equal(newPos)
    expect(entity.direction).to.equal(newDir)
  }
})

test("can move to position overlapping with itself", () => {
  const newPos2 = Pos.plus(origPos, { x: 1, y: 0 })
  const entity = entities[0]
  forceDollyEntity(entity, newPos2, origDir)
  const result = tryDollyAllEntities(entities, newPos2, origDir)
  expect(result).to.be("success")
  for (const entity of entities) {
    expect(entity.position).to.equal(newPos2)
    expect(entity.direction).to.equal(origDir)
  }
})

test("does not move any entities if any would overlap", () => {
  surfaces[1].create_entity({
    name: "inserter",
    position: newPos,
    direction: defines.direction.east,
  })
  const result = tryDollyAllEntities(entities, newPos, newDir)
  expect(result).to.be("overlap")
  for (const entity of entities) {
    expect(entity.position).to.equal(origPos)
    expect(entity.direction).to.equal(origDir)
  }
})

test("ok if already at target position", () => {
  forceDollyEntity(entities[0], newPos, newDir)

  const result = tryDollyAllEntities(entities, newPos, newDir)
  expect(result).to.be("success")
  for (const entity of entities) {
    expect(entity.position).to.equal(newPos)
    expect(entity.direction).to.equal(newDir)
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
  const result = tryDollyAllEntities(entities, newPos, newDir)
  expect(result).to.be("wires-cannot-reach")
  for (const entity of entities) {
    expect(entity.direction).to.equal(origDir)
    expect(entity.position).to.equal(origPos)
  }
})
