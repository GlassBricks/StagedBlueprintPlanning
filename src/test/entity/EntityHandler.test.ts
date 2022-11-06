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

import { oppositedirection } from "util"
import { Entity } from "../../entity/Entity"
import { EntityHandler } from "../../entity/EntityHandler"

let surface: LuaSurface
before_each(() => {
  surface = game.surfaces[1]
  surface.find_entities().forEach((e) => e.destroy())
})
test("can save an entity", () => {
  const entity = surface.create_entity({
    name: "inserter",
    position: { x: 12.5, y: 12.5 },
    force: "player",
    direction: defines.direction.east,
  })!
  entity.inserter_stack_size_override = 2
  const [saved, direction] = EntityHandler.saveEntity(entity)
  assert.same({ name: "inserter", override_stack_size: 2 }, saved)
  assert.equal(defines.direction.east, direction)
})
const directions = Object.values(defines.direction) as defines.direction[]
test.each(directions)("can saved a curved rail in all directions", (direction) => {
  const entity = surface.create_entity({
    name: "curved-rail",
    position: { x: 12.5, y: 12.5 },
    force: "player",
    direction,
  })!

  const [saved, savedDirection] = EntityHandler.saveEntity(entity)
  assert.same({ name: "curved-rail" }, saved)
  assert.equal(direction, savedDirection)
})

test.each(directions)("can saved a straight rail in all directions", (direction) => {
  const entity = surface.create_entity({
    name: "straight-rail",
    position: { x: 12.5, y: 12.5 },
    force: "player",
    direction,
  })!

  const [saved, savedDirection] = EntityHandler.saveEntity(entity)
  if (direction === defines.direction.south || direction === defines.direction.west) {
    direction = oppositedirection(direction)
  }
  assert.same({ name: "straight-rail" }, saved)
  assert.equal(direction, savedDirection)
})

test("can create an entity", () => {
  const luaEntity = EntityHandler.createEntity(surface, { x: 0.5, y: 0.5 }, 0, {
    name: "iron-chest",
    bar: 3,
  } as Entity)!
  assert.not_nil(luaEntity, "entity created")
  assert.equal("iron-chest", luaEntity.name)
  assert.same({ x: 0.5, y: 0.5 }, luaEntity.position)
  assert.equal(3, luaEntity.get_inventory(defines.inventory.chest)!.get_bar() - 1)
})

test("can update an entity", () => {
  const entity = surface.create_entity({
    name: "iron-chest",
    position: { x: 12.5, y: 12.5 },
    force: "player",
    bar: 3,
  })!
  const newEntity = EntityHandler.updateEntity(entity, { name: "iron-chest", bar: 4 } as Entity, 0)
  assert.equal(entity, newEntity)
  assert.equal(4, entity.get_inventory(defines.inventory.chest)!.get_bar() - 1)
})

test("can upgrade an entity", () => {
  const entity = surface.create_entity({
    name: "iron-chest",
    position: { x: 12.5, y: 12.5 },
    force: "player",
  })!
  entity.minable = false
  entity.destructible = false
  const newEntity = EntityHandler.updateEntity(entity, { name: "steel-chest" } as Entity, 0)
  assert.equal("steel-chest", newEntity.name)
  assert.false(entity.valid)
})

test("can rotate entity", () => {
  const entity = surface.create_entity({
    name: "inserter",
    position: { x: 12.5, y: 12.5 },
    force: "player",
    direction: defines.direction.east,
  })!
  const newEntity = EntityHandler.updateEntity(entity, { name: "inserter" } as Entity, defines.direction.south)
  assert.equal(newEntity, entity)
  assert.equal(defines.direction.south, entity.direction)
})

describe.each([false, true])("undergrounds, flipped: %s", (flipped) => {
  const inOut = flipped ? "output" : "input"
  test("saving an underground belt in output direction flips direction", () => {
    const entity = surface.create_entity({
      name: "underground-belt",
      position: { x: 12.5, y: 12.5 },
      force: "player",
      direction: defines.direction.south,
      type: inOut,
    })!
    const [saved, direction] = EntityHandler.saveEntity(entity)
    assert.same({ name: "underground-belt", type: inOut }, saved)
    if (flipped) {
      assert.equal(defines.direction.north, direction)
    } else {
      assert.equal(defines.direction.south, direction)
    }
  })

  test("creating an underground belt in output direction flips direction", () => {
    const luaEntity = EntityHandler.createEntity(surface, { x: 0.5, y: 0.5 }, defines.direction.south, {
      name: "underground-belt",
      type: inOut,
    } as Entity)!
    assert.not_nil(luaEntity, "entity created")
    assert.equal("underground-belt", luaEntity.name)
    assert.same({ x: 0.5, y: 0.5 }, luaEntity.position)
    if (flipped) {
      assert.equal(defines.direction.north, luaEntity.direction)
    } else {
      assert.equal(defines.direction.south, luaEntity.direction)
    }
  })

  test("creating a flipped underground deletes entity and returns nil", () => {
    // create underground, tunneling east, at 0.5, 0.5
    const westUnderground = surface.create_entity({
      name: "underground-belt",
      position: { x: 0.5, y: 0.5 },
      force: "player",
      direction: !flipped ? defines.direction.east : defines.direction.west,
      type: inOut,
    })
    assert.not_nil(westUnderground, "entity created")
    // try pasting east output underground at 1.5, 0.5
    // if west underground is output, the created entity will be flipped
    const eastUnderground = EntityHandler.createEntity(surface, { x: 1.5, y: 0.5 }, defines.direction.west, {
      name: "underground-belt",
      type: "output",
    } as Entity)!
    if (flipped) {
      assert.nil(eastUnderground)
      assert.nil(surface.find_entity("underground-belt", { x: 1.5, y: 0.5 }))
    } else {
      assert.not_nil(eastUnderground)
      assert.equal("underground-belt", eastUnderground.name)
      assert.equal(defines.direction.east, eastUnderground.direction) // flipped as is output
    }
  })

  test("can flip underground", () => {
    const entity = surface.create_entity({
      name: "underground-belt",
      position: { x: 12.5, y: 12.5 },
      force: "player",
      direction: !flipped ? defines.direction.east : defines.direction.west,
      type: inOut,
    })!
    entity.rotatable = false // should not matter
    const otherDir = flipped ? "input" : "output"
    const updated = EntityHandler.updateEntity(
      entity,
      {
        name: "underground-belt",
        type: otherDir,
      } as Entity,
      defines.direction.east,
    )
    assert.equal(entity, updated)
    assert.equal(otherDir, updated.belt_to_ground_type)
    assert.false(updated.rotatable)
  })

  test("can upgrade underground", () => {
    const entity = surface.create_entity({
      name: "underground-belt",
      position: { x: 12.5, y: 12.5 },
      force: "player",
      type: inOut,
      direction: !flipped ? defines.direction.west : defines.direction.east, // actual is west
    })!
    assert.not_nil(entity, "entity created")
    const updated = EntityHandler.updateEntity(
      entity,
      {
        name: "fast-underground-belt",
        type: inOut,
      } as Entity,
      defines.direction.west,
    )
    assert.not_nil(updated, "entity updated")
    assert.equal("fast-underground-belt", updated.name)
    assert.equal(!flipped ? defines.direction.west : defines.direction.east, updated.direction)
    assert.equal(inOut, updated.belt_to_ground_type)
  })
})

test("can create loader", () => {
  const entity = EntityHandler.createEntity(surface, { x: 12.5, y: 12 }, defines.direction.east, {
    name: "loader",
    type: "output",
  } as Entity)!
  assert.equal("loader", entity.name)
  assert.equal(defines.direction.east, entity.direction)
  assert.equal("output", entity.loader_type)

  const entity2 = EntityHandler.createEntity(surface, { x: 14.5, y: 12 }, defines.direction.east, {
    name: "loader",
    type: "input",
  } as Entity)!
  assert.equal("loader", entity2.name)
  assert.equal(defines.direction.east, entity2.direction)
  assert.equal("input", entity2.loader_type)
})

test("can flip loader", () => {
  const entity = surface.create_entity({
    name: "loader",
    position: { x: 12.5, y: 12 },
    force: "player",
    direction: defines.direction.east,
  })!
  entity.loader_type = "input"
  entity.rotatable = false // should not matter
  const updated = EntityHandler.updateEntity(
    entity,
    {
      name: "loader",
      type: "output",
    } as Entity,
    defines.direction.east,
  )
  assert.equal(entity, updated)
  assert.equal("output", updated.loader_type)
  assert.false(updated.rotatable)
})

test("can handle item changes", () => {
  const oldContents = { "productivity-module": 1, "productivity-module-2": 2 }
  const newContents = { "productivity-module-2": 2, "speed-module": 1 }

  const entity = surface.create_entity({
    name: "assembling-machine-3",
    position: { x: 12.5, y: 12.5 },
    force: "player",
  })!
  for (const [item, count] of pairs(oldContents)) entity.get_module_inventory()!.insert({ name: item, count })

  const newEntity = EntityHandler.updateEntity(
    entity,
    {
      name: "assembling-machine-3",
      items: newContents,
    } as Entity,
    0,
  )
  assert.equal(newEntity, entity)
  assert.same(newContents, entity.get_module_inventory()!.get_contents())
})
