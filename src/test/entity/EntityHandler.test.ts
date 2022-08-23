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

import { StagePosition } from "../../assembly/AssemblyContent"
import { Entity } from "../../entity/Entity"
import { DefaultEntityHandler } from "../../entity/EntityHandler"
import { WorldArea } from "../../utils/world-location"
import { clearTestArea } from "../area"

let area: WorldArea
before_each(() => {
  area = clearTestArea()
})
test("can save an entity", () => {
  const entity = area.surface.create_entity({
    name: "inserter",
    position: { x: 12.5, y: 12.5 },
    force: "player",
    direction: defines.direction.east,
  })!
  entity.inserter_stack_size_override = 2
  const [saved, direction] = DefaultEntityHandler.saveEntity(entity)
  assert.same({ name: "inserter", override_stack_size: 2 }, saved)
  assert.equal(defines.direction.east, direction)
})

test("can create an entity", () => {
  const stage: StagePosition = {
    surface: area.surface,
    left_top: { x: 0, y: 0 },
    right_bottom: { x: 1, y: 1 },
    stageNumber: 0,
  }
  const luaEntity = DefaultEntityHandler.createEntity(stage, { position: { x: 0.5, y: 0.5 }, direction: nil }, {
    name: "iron-chest",
    bar: 3,
  } as Entity)!
  assert.not_nil(luaEntity, "entity created")
  assert.equal("iron-chest", luaEntity.name)
  assert.same({ x: 0.5, y: 0.5 }, luaEntity.position)
  assert.equal(3, luaEntity.get_inventory(defines.inventory.chest)!.get_bar() - 1)
})

test("can update an entity", () => {
  const entity = area.surface.create_entity({
    name: "iron-chest",
    position: { x: 12.5, y: 12.5 },
    force: "player",
    bar: 3,
  })!
  const newEntity = DefaultEntityHandler.updateEntity(entity, { name: "iron-chest", bar: 4 } as Entity, nil)
  assert.equal(entity, newEntity)
  assert.equal(4, entity.get_inventory(defines.inventory.chest)!.get_bar() - 1)
})

test("can upgrade an entity", () => {
  const entity = area.surface.create_entity({
    name: "iron-chest",
    position: { x: 12.5, y: 12.5 },
    force: "player",
  })!
  entity.minable = false
  entity.destructible = false
  const newEntity = DefaultEntityHandler.updateEntity(entity, { name: "steel-chest" } as Entity, nil)
  assert.equal("steel-chest", newEntity.name)
  assert.false(entity.valid)
})

test("can rotate entity", () => {
  const entity = area.surface.create_entity({
    name: "inserter",
    position: { x: 12.5, y: 12.5 },
    force: "player",
    direction: defines.direction.east,
  })!
  const newEntity = DefaultEntityHandler.updateEntity(entity, { name: "inserter" } as Entity, defines.direction.south)
  assert.equal(newEntity, entity)
  assert.equal(defines.direction.south, entity.direction)
})

describe.each([false, true])("undergrounds, flipped: %s", (flipped) => {
  const inOut = flipped ? "output" : "input"
  test("saving an underground belt in output direction flips direction", () => {
    const entity = area.surface.create_entity({
      name: "underground-belt",
      position: { x: 12.5, y: 12.5 },
      force: "player",
      direction: defines.direction.south,
      type: inOut,
    })!
    const [saved, direction] = DefaultEntityHandler.saveEntity(entity)
    assert.same({ name: "underground-belt", type: inOut }, saved)
    if (flipped) {
      assert.equal(defines.direction.north, direction)
    } else {
      assert.equal(defines.direction.south, direction)
    }
  })

  test("creating an underground belt in output direction flips direction", () => {
    const stage: StagePosition = {
      surface: area.surface,
      left_top: { x: 0, y: 0 },
      right_bottom: { x: 1, y: 1 },
      stageNumber: 0,
    }
    const luaEntity = DefaultEntityHandler.createEntity(
      stage,
      { position: { x: 0.5, y: 0.5 }, direction: defines.direction.south },
      {
        name: "underground-belt",
        type: inOut,
      } as Entity,
    )!
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
    const stage: StagePosition = {
      surface: area.surface,
      left_top: { x: 0, y: 0 },
      right_bottom: { x: 1, y: 1 },
      stageNumber: 0,
    }
    // create underground, tunneling east, at 0.5, 0.5
    const westUnderground = area.surface.create_entity({
      name: "underground-belt",
      position: { x: 0.5, y: 0.5 },
      force: "player",
      direction: !flipped ? defines.direction.east : defines.direction.west,
      type: inOut,
    })
    assert.not_nil(westUnderground, "entity created")
    // try pasting east output underground at 1.5, 0.5
    // if west underground is output, the created entity will be flipped
    const eastUnderground = DefaultEntityHandler.createEntity(
      stage,
      {
        position: { x: 1.5, y: 0.5 },
        direction: defines.direction.west,
      },
      {
        name: "underground-belt",
        type: "output",
      } as Entity,
    )!
    if (flipped) {
      assert.nil(eastUnderground)
      assert.nil(area.surface.find_entity("underground-belt", { x: 1.5, y: 0.5 }))
    } else {
      assert.not_nil(eastUnderground)
      assert.equal("underground-belt", eastUnderground.name)
      assert.equal(defines.direction.east, eastUnderground.direction) // flipped as is output
    }
  })

  test("can flip underground", () => {
    const entity = area.surface.create_entity({
      name: "underground-belt",
      position: { x: 12.5, y: 12.5 },
      force: "player",
      direction: !flipped ? defines.direction.east : defines.direction.west,
      type: inOut,
    })!
    const otherDir = flipped ? "input" : "output"
    const updated = DefaultEntityHandler.updateEntity(
      entity,
      {
        name: "underground-belt",
        type: otherDir,
      } as Entity,
      defines.direction.east,
    )
    assert.equal(entity, updated)
    assert.equal(otherDir, updated.belt_to_ground_type)
  })

  test("can upgrade underground", () => {
    const entity = area.surface.create_entity({
      name: "underground-belt",
      position: { x: 12.5, y: 12.5 },
      force: "player",
      type: inOut,
      direction: !flipped ? defines.direction.west : defines.direction.east, // actual is west
    })!
    assert.not_nil(entity, "entity created")
    const updated = DefaultEntityHandler.updateEntity(
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

test("can flip loader", () => {
  const entity = area.surface.create_entity({
    name: "loader",
    position: { x: 12.5, y: 12 },
    force: "player",
    direction: defines.direction.east,
  })!
  entity.loader_type = "input"
  const updated = DefaultEntityHandler.updateEntity(
    entity,
    {
      name: "loader",
      type: "output",
    } as Entity,
    defines.direction.east,
  )
  assert.equal(entity, updated)
  assert.equal("output", updated.loader_type)
})

test("can handle item changes", () => {
  const oldContents = { "productivity-module": 1, "productivity-module-2": 2 }
  const newContents = { "productivity-module-2": 2, "speed-module": 1 }

  const entity = area.surface.create_entity({
    name: "assembling-machine-3",
    position: { x: 12.5, y: 12.5 },
    force: "player",
  })!
  for (const [item, count] of pairs(oldContents)) entity.get_module_inventory()!.insert({ name: item, count })

  const newEntity = DefaultEntityHandler.updateEntity(
    entity,
    {
      name: "assembling-machine-3",
      items: newContents,
    } as Entity,
    nil,
  )
  assert.equal(newEntity, entity)
  assert.same(newContents, entity.get_module_inventory()!.get_contents())
})
