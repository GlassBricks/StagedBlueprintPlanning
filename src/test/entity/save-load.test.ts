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

import { BlueprintEntity, LuaSurface, TrainScheduleRecord } from "factorio:runtime"
import expect from "tstl-expect"
import { oppositedirection } from "util"
import { Entity } from "../../entity/Entity"
import { canBeAnyDirection, createEntity, saveEntity, updateEntity } from "../../entity/save-load"
import { assert } from "../../lib"
import { createRollingStocks } from "./createRollingStock"

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
  const saved = saveEntity(entity)
  expect(saved).to.equal({ name: "inserter", override_stack_size: 2 })
  expect(entity.direction).to.be(defines.direction.east)
})
const directions = Object.values(defines.direction) as defines.direction[]
test.each(directions)("can saved a curved rail in all directions", (direction) => {
  const entity = surface.create_entity({
    name: "curved-rail",
    position: { x: 12.5, y: 12.5 },
    force: "player",
    direction,
  })!
  expect(entity.direction).to.be(direction)

  const saved = saveEntity(entity)
  expect(saved).to.equal({ name: "curved-rail" })
})

test.each(directions)("can saved a straight rail in all directions", (direction) => {
  const entity = surface.create_entity({
    name: "straight-rail",
    position: { x: 12.5, y: 12.5 },
    force: "player",
    direction,
  })!

  const saved = saveEntity(entity)
  if (direction == defines.direction.south || direction == defines.direction.west) {
    direction = oppositedirection(direction)
  }
  expect(entity.direction).to.be(direction)
  expect(saved).to.equal({ name: "straight-rail" })
})

test("can create an entity", () => {
  const luaEntity = createEntity(surface, { x: 0.5, y: 0.5 }, defines.direction.north, {
    name: "iron-chest",
    bar: 3,
  } as Entity)!
  expect(luaEntity).to.be.any()
  expect(luaEntity.name).to.be("iron-chest")
  expect(luaEntity.position).to.equal({ x: 0.5, y: 0.5 })
  expect(luaEntity.get_inventory(defines.inventory.chest)!.get_bar() - 1).to.be(3)
})

test("can create an offshore pump anywhere", () => {
  const luaEntity = createEntity(surface, { x: 0.5, y: 0.5 }, defines.direction.north, {
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

  const luaEntity = createEntity(surface, { x: 0.5, y: 0.5 }, defines.direction.north, {
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
  const newEntity = updateEntity(entity, { name: "iron-chest", bar: 4 } as Entity, defines.direction.north)
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
  const newEntity = updateEntity(entity, { name: "steel-chest" } as Entity, defines.direction.north)!
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
  const newEntity = updateEntity(entity, { name: "inserter" } as Entity, defines.direction.south)
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
  const newEntity = updateEntity(entity, { name: "assembling-machine-1" } as Entity, defines.direction.south)
  expect(entity).to.be(newEntity)
  expect(entity.direction).to.be(defines.direction.south)
})

describe.each([false, true])("undergrounds, flipped: %s", (flipped) => {
  const inOut = flipped ? "output" : "input"
  test("saving an underground belt in output direction KEEPS direction", () => {
    const entity = surface.create_entity({
      name: "underground-belt",
      position: { x: 12.5, y: 12.5 },
      force: "player",
      direction: defines.direction.south,
      type: inOut,
    })!
    expect(entity.direction).to.be(defines.direction.south)

    const saved = saveEntity(entity)
    expect(saved).to.equal({ name: "underground-belt", type: inOut })
  })

  test("creating an underground belt in output direction KEEPS direction", () => {
    const luaEntity = createEntity(surface, { x: 0.5, y: 0.5 }, defines.direction.south, {
      name: "underground-belt",
      type: inOut,
    } as Entity)!
    expect(luaEntity).to.be.any()
    expect(luaEntity.name).to.be("underground-belt")
    expect(luaEntity.position).to.equal({ x: 0.5, y: 0.5 })
    expect(luaEntity.direction).to.be(defines.direction.south)
  })

  test("creating a flipped underground still creates entity", () => {
    // create underground, tunneling east, at 0.5, 0.5
    const westUnderground = surface.create_entity({
      name: "underground-belt",
      position: { x: 0.5, y: 0.5 },
      force: "player",
      direction: flipped ? defines.direction.west : defines.direction.east,
      type: flipped ? "output" : "input",
    })
    expect(westUnderground).to.be.any()
    // try pasting east output underground at 1.5, 0.5
    // if west underground is output, the created entity will be flipped
    const eastUnderground = createEntity(
      surface,
      { x: 1.5, y: 0.5 },
      flipped ? defines.direction.east : defines.direction.west,
      {
        name: "underground-belt",
        type: flipped ? "output" : "input",
      } as Entity,
    )!
    expect(eastUnderground).toBeAny()
    expect(surface.find_entity("underground-belt", { x: 1.5, y: 0.5 })).toBeAny()
    expect(eastUnderground.belt_to_ground_type).toBe(flipped ? "input" : "output")
  })

  test("can flip underground", () => {
    const entity = surface.create_entity({
      name: "underground-belt",
      position: { x: 12.5, y: 12.5 },
      force: "player",
      direction: defines.direction.west,
      type: inOut,
    })!
    entity.rotatable = false // should not matter
    const otherDir = flipped ? "input" : "output"
    const updated = updateEntity(
      entity,
      {
        name: "underground-belt",
        type: otherDir,
      } as Entity,
      defines.direction.east,
    )!
    assert(updated)
    expect(updated).to.be(entity)
    expect(updated.belt_to_ground_type).to.be(otherDir)
    expect(updated.rotatable).to.be(false)
    expect(updated.direction).to.be(defines.direction.east)
  })

  test("can upgrade underground", () => {
    const entity = surface.create_entity({
      name: "underground-belt",
      position: { x: 12.5, y: 12.5 },
      force: "player",
      type: inOut,
      direction: defines.direction.west,
    })!
    expect(entity).to.be.any()
    const updated = updateEntity(
      entity,
      {
        name: "fast-underground-belt",
        type: inOut,
      } as Entity,
      defines.direction.west,
    )!
    expect(updated).to.be.any()
    expect(updated.name).to.be("fast-underground-belt")
    expect(updated.direction).to.be(defines.direction.west)
    expect(updated.belt_to_ground_type).to.be(inOut)
  })

  test("can rotate underground", () => {
    const entity = surface.create_entity({
      name: "underground-belt",
      position: { x: 12.5, y: 12.5 },
      force: "player",
      type: inOut,
      direction: defines.direction.west,
    })!
    expect(entity).to.be.any()
    const updated = updateEntity(
      entity,
      {
        name: "underground-belt",
        type: inOut,
      } as Entity,
      defines.direction.south,
    )!
    expect(updated).to.be.any()
    expect(updated.name).to.be("underground-belt")
    expect(updated.direction).to.be(defines.direction.south)
  })
})

test("can create loader", () => {
  const entity = createEntity(surface, { x: 12.5, y: 12 }, defines.direction.east, {
    name: "loader",
    type: "output",
  } as Entity)!
  expect(entity.name).to.be("loader")
  expect(entity.direction).to.be(defines.direction.east)
  expect(entity.loader_type).to.be("output")

  const entity2 = createEntity(surface, { x: 14.5, y: 12 }, defines.direction.east, {
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
  const updated = updateEntity(
    entity,
    {
      name: "loader",
      type: "output",
    } as Entity,
    defines.direction.east,
  )!
  expect(updated).to.be(entity)
  expect(updated.loader_type).to.be("output")
  expect(updated.rotatable).to.be(false)
})

test("can handle item changes", () => {
  const oldContents = { "productivity-module": 1, "productivity-module-2": 2 }
  const newContents = { "productivity-module-2": 1, "speed-module": 1, "productivity-module": 2 }

  const entity = surface.create_entity({
    name: "assembling-machine-3",
    position: { x: 12.5, y: 12.5 },
    force: "player",
  })!
  for (const [item, count] of pairs(oldContents)) entity.get_module_inventory()!.insert({ name: item, count })

  const newEntity = updateEntity(
    entity,
    {
      name: "assembling-machine-3",
      items: newContents,
    } as Entity,
    defines.direction.north,
  )
  expect(entity).to.be(newEntity)
  expect(entity.get_module_inventory()!.get_contents()).to.equal(newContents)
})

test("can set train schedule", () => {
  const [locomotive] = createRollingStocks(surface, "locomotive", "cargo-wagon")
  const schedule: TrainScheduleRecord[] = [
    {
      station: "test1",
      wait_conditions: [
        {
          type: "time",
          compare_type: "and",
          ticks: 100,
        },
      ],
    },
    {
      station: "test2",
      wait_conditions: [
        {
          type: "time",
          compare_type: "and",
          ticks: 200,
        },
      ],
    },
  ]
  locomotive.train!.schedule = {
    current: 2,
    records: schedule,
  }
  ;(schedule[1].wait_conditions![0] as any).ticks = 300
  const newValue: Partial<BlueprintEntity> = {
    name: "locomotive",
    schedule,
  }
  const newEntity = updateEntity(locomotive, newValue as Entity, defines.direction.north)!
  expect(newEntity).to.be(locomotive)
  expect(newEntity.train?.schedule?.current).to.equal(2)
  expect(newEntity.train?.schedule?.records).to.equal(newValue.schedule)
})

test("canBeAnyDirection", () => {
  // only true if is an assembling machine with no fluid inputs
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
