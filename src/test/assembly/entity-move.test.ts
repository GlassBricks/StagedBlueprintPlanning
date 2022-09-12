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
import { createStageSurface, prepareArea } from "../../assembly/surfaces"
import { BBox } from "../../lib/geometry"

let surfaces: LuaSurface[]
before_all(() => {
  surfaces = Array.from({ length: 3 }, () => {
    const surface = createStageSurface()
    prepareArea(surface, BBox.around({ x: 0, y: 0 }, 20))
    return surface
  })
})

after_all(() => {
  surfaces.forEach((s) => game.delete_surface(s))
})

const origPos = { x: 0.5, y: 0.5 }
const origDir = defines.direction.east
let entities: LuaEntity[]
before_each(() => {
  entities = surfaces.map((s) =>
    assert(
      s.create_entity({
        name: "inserter",
        position: origPos,
        direction: origDir,
        force: "player",
      }),
    ),
  )
})
after_each(() => {
  surfaces.forEach((s) => s.find_entities().forEach((e) => e.destroy()))
})

const newPos = { x: 1.5, y: 1.5 }
test("can move single entity", () => {
  const entity = entities[0]
  forceMoveEntity(entity, newPos, defines.direction.south)
  assert.same(newPos, entity.position)
  assert.same(defines.direction.south, entity.direction)
})

test("can move multiple entities", () => {
  const result = tryMoveAllEntities(entities, newPos, defines.direction.south)
  assert.equal("success", result)
  for (const entity of entities) {
    assert.same(newPos, entity.position)
    assert.same(defines.direction.south, entity.direction)
  }
})

test("does not move any if any overlaps", () => {
  const pos = { x: 1.5, y: 1.5 }
  surfaces[1].create_entity({
    name: "inserter",
    position: pos,
    direction: defines.direction.east,
  })
  const result = tryMoveAllEntities(entities, pos, defines.direction.south)
  assert.equal("overlap", result)
  for (const entity of entities) {
    assert.same(origPos, entity.position)
    assert.same(origDir, entity.direction)
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
    }),
    "failed to connect",
  )
  const result = tryMoveAllEntities(entities, newPos, defines.direction.south)
  assert.equal("wires-cannot-reach", result)
  for (const entity of entities) {
    assert.same(origPos, entity.position)
    assert.same(origDir, entity.direction)
  }
})
