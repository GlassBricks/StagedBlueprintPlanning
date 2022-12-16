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
import { canBeAnyDirection, EntityHandler } from "../../entity/EntityHandler"
import { EAST, NORTH, SOUTH, WEST } from "../../entity/direction"
import expect from "tstl-expect"

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
  expect(saved).to.equal({ name: "inserter", override_stack_size: 2 })
  expect(direction).to.be(defines.direction.east)
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
  expect(saved).to.equal({ name: "curved-rail" })
  expect(savedDirection).to.be(direction)
})

test.each(directions)("can saved a straight rail in all directions", (direction) => {
  const entity = surface.create_entity({
    name: "straight-rail",
    position: { x: 12.5, y: 12.5 },
    force: "player",
    direction,
  })!

  const [saved, savedDirection] = EntityHandler.saveEntity(entity)
  if (direction == defines.direction.south || direction == defines.direction.west) {
    direction = oppositedirection(direction)
  }
  expect(saved).to.equal({ name: "straight-rail" })
  expect(savedDirection).to.be(direction)
})

test("can create an entity", () => {
  const luaEntity = EntityHandler.createEntity(surface, { x: 0.5, y: 0.5 }, NORTH, {
    name: "iron-chest",
    bar: 3,
  } as Entity)!
  expect(luaEntity).to.be.any()
  expect(luaEntity.name).to.be("iron-chest")
  expect(luaEntity.position).to.equal({ x: 0.5, y: 0.5 })
  expect(luaEntity.get_inventory(defines.inventory.chest)!.get_bar() - 1).to.be(3)
})

test("can create an offshore pump anywhere", () => {
  const luaEntity = EntityHandler.createEntity(surface, { x: 0.5, y: 0.5 }, NORTH, {
    name: "offshore-pump",
  })!
  expect(luaEntity).to.be.any()
  expect(luaEntity.name).to.be("offshore-pump")
  expect(luaEntity.position).to.equal({ x: 0.5, y: 0.5 })
})

test("can still place if there are items on the ground", () => {
  const item = surface.create_entity({
    name: "item-on-ground",
    position: { x: 0.5, y: 0.5 },
    stack: "iron-plate",
  })
  expect(item).to.be.any()

  const luaEntity = EntityHandler.createEntity(surface, { x: 0.5, y: 0.5 }, NORTH, {
    name: "assembling-machine-1",
  })!
  expect(luaEntity).to.be.any()
  expect(luaEntity.name).to.be("assembling-machine-1")
  expect(luaEntity.position).to.equal({ x: 0.5, y: 0.5 })
})

test("can update an entity", () => {
  const entity = surface.create_entity({
    name: "iron-chest",
    position: { x: 12.5, y: 12.5 },
    force: "player",
    bar: 3,
  })!
  const newEntity = EntityHandler.updateEntity(entity, { name: "iron-chest", bar: 4 } as Entity, NORTH)
  expect(newEntity).to.be(entity)
  expect(entity.get_inventory(defines.inventory.chest)!.get_bar() - 1).to.be(4)
})

test("can upgrade an entity", () => {
  const entity = surface.create_entity({
    name: "iron-chest",
    position: { x: 12.5, y: 12.5 },
    force: "player",
  })!
  entity.minable = false
  entity.destructible = false
  const newEntity = EntityHandler.updateEntity(entity, { name: "steel-chest" } as Entity, NORTH)!
  expect(newEntity.name).to.be("steel-chest")
  expect(entity.valid).to.be(false)
})

test("can rotate entity", () => {
  const entity = surface.create_entity({
    name: "inserter",
    position: { x: 12.5, y: 12.5 },
    force: "player",
    direction: defines.direction.east,
  })!
  const newEntity = EntityHandler.updateEntity(entity, { name: "inserter" } as Entity, SOUTH)
  expect(entity).to.be(newEntity)
  expect(entity.direction).to.be(defines.direction.south)
})

test("can rotate an assembler with no fluid recipe", () => {
  const entity = surface.create_entity({
    name: "assembling-machine-1",
    position: { x: 12.5, y: 12.5 },
    force: "player",
    direction: defines.direction.east,
  })!
  const newEntity = EntityHandler.updateEntity(entity, { name: "assembling-machine-1" } as Entity, SOUTH)
  expect(entity).to.be(newEntity)
  expect(entity.direction).to.be(defines.direction.south)
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
    expect(saved).to.equal({ name: "underground-belt", type: inOut })
    if (flipped) {
      expect(direction).to.be(defines.direction.north)
    } else {
      expect(direction).to.be(defines.direction.south)
    }
  })

  test("creating an underground belt in output direction flips direction", () => {
    const luaEntity = EntityHandler.createEntity(surface, { x: 0.5, y: 0.5 }, SOUTH, {
      name: "underground-belt",
      type: inOut,
    } as Entity)!
    expect(luaEntity).to.be.any()
    expect(luaEntity.name).to.be("underground-belt")
    expect(luaEntity.position).to.equal({ x: 0.5, y: 0.5 })
    if (flipped) {
      expect(luaEntity.direction).to.be(defines.direction.north)
    } else {
      expect(luaEntity.direction).to.be(defines.direction.south)
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
    expect(westUnderground).to.be.any()
    // try pasting east output underground at 1.5, 0.5
    // if west underground is output, the created entity will be flipped
    const eastUnderground = EntityHandler.createEntity(surface, { x: 1.5, y: 0.5 }, WEST, {
      name: "underground-belt",
      type: "output",
    } as Entity)!
    if (flipped) {
      expect(eastUnderground).to.be.nil()
      expect(surface.find_entity("underground-belt", { x: 1.5, y: 0.5 })).to.be.nil()
    } else {
      expect(eastUnderground).to.be.any()
      expect(eastUnderground.name).to.be("underground-belt")
      expect(eastUnderground.direction).to.be(defines.direction.east) // flipped as is output
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
      EAST,
    )!
    expect(updated).to.be(entity)
    expect(updated.belt_to_ground_type).to.be(otherDir)
    expect(updated.rotatable).to.be(false)
  })

  test("can upgrade underground", () => {
    const entity = surface.create_entity({
      name: "underground-belt",
      position: { x: 12.5, y: 12.5 },
      force: "player",
      type: inOut,
      direction: !flipped ? defines.direction.west : defines.direction.east, // actual is west
    })!
    expect(entity).to.be.any()
    const updated = EntityHandler.updateEntity(
      entity,
      {
        name: "fast-underground-belt",
        type: inOut,
      } as Entity,
      WEST,
    )!
    expect(updated).to.be.any()
    expect(updated.name).to.be("fast-underground-belt")
    expect(updated.direction).to.be(!flipped ? defines.direction.west : defines.direction.east)
    expect(updated.belt_to_ground_type).to.be(inOut)
  })

  test("can rotate underground", () => {
    const entity = surface.create_entity({
      name: "underground-belt",
      position: { x: 12.5, y: 12.5 },
      force: "player",
      type: inOut,
      direction: !flipped ? defines.direction.west : defines.direction.east, // actual is west
    })!
    expect(entity).to.be.any()
    const updated = EntityHandler.updateEntity(
      entity,
      {
        name: "underground-belt",
        type: inOut,
      } as Entity,
      SOUTH,
    )!
    expect(updated).to.be.any()
    expect(updated.name).to.be("underground-belt")
    expect(updated.direction).to.be(!flipped ? defines.direction.south : defines.direction.north)
  })
})

test("can create loader", () => {
  const entity = EntityHandler.createEntity(surface, { x: 12.5, y: 12 }, EAST, {
    name: "loader",
    type: "output",
  } as Entity)!
  expect(entity.name).to.be("loader")
  expect(entity.direction).to.be(defines.direction.east)
  expect(entity.loader_type).to.be("output")

  const entity2 = EntityHandler.createEntity(surface, { x: 14.5, y: 12 }, EAST, {
    name: "loader",
    type: "input",
  } as Entity)!
  expect(entity2.name).to.be("loader")
  expect(entity2.direction).to.be(defines.direction.east)
  expect(entity2.loader_type).to.be("input")
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
    EAST,
  )!
  expect(updated).to.be(entity)
  expect(updated.loader_type).to.be("output")
  expect(updated.rotatable).to.be(false)
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
    NORTH,
  )
  expect(entity).to.be(newEntity)
  expect(entity.get_module_inventory()!.get_contents()).to.equal(newContents)
})

test("can be any direction", () => {
  // only true if assembling machine with no fluid inputs
  const entity = surface.create_entity({
    name: "assembling-machine-3",
    position: { x: 12.5, y: 12.5 },
    force: "player",
  })!
  expect(canBeAnyDirection(entity)).to.be(true)
  entity.set_recipe("rocket-fuel")
  expect(canBeAnyDirection(entity)).to.be(false)

  const entity2 = surface.create_entity({
    name: "iron-chest",
    position: { x: 0.5, y: 0.5 },
    force: "player",
  })!
  expect(canBeAnyDirection(entity2)).to.be(false)
})
