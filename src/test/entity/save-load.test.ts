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

import { BlueprintEntity, LuaSurface, ScriptRaisedBuiltEvent, TrainScheduleRecord } from "factorio:runtime"
import expect from "tstl-expect"
import { oppositedirection } from "util"
import { Prototypes } from "../../constants"
import { Entity } from "../../entity/Entity"
import { isPreviewEntity } from "../../entity/entity-prototype-info"
import { createProjectEntityNoCopy } from "../../entity/ProjectEntity"
import {
  canBeAnyDirection,
  checkUndergroundPairFlippable,
  createEntity,
  createPreviewEntity,
  saveEntity,
  updateEntity,
} from "../../entity/save-load"
import { assert, Events } from "../../lib"
import { UserProject } from "../../project/ProjectDef"
import { _deleteAllProjects, createUserProject } from "../../project/UserProject"
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
  expect(saved).toEqual({ name: "inserter", override_stack_size: 2 })
  expect(entity.direction).toBe(defines.direction.east)
})

test("saving an entity with knownValue", () => {
  const entity = surface.create_entity({
    name: "inserter",
    position: { x: 12.5, y: 12.5 },
    force: "player",
    direction: defines.direction.east,
  })!
  const knownValue: BlueprintEntity = {
    entity_number: 1,
    direction: 0,
    tags: { foo: "bar" },
    position: { x: 0, y: 0 },
    neighbours: [],
    connections: {},

    name: "inserter",
    override_stack_size: 2,
  }
  const saved = saveEntity(entity, knownValue)
  expect(saved).toEqual({ name: "inserter", override_stack_size: 2 })
})

const directions = Object.values(defines.direction) as defines.direction[]
test.each(directions)("can saved a curved rail in all directions", (direction) => {
  const entity = surface.create_entity({
    name: "curved-rail",
    position: { x: 12.5, y: 12.5 },
    force: "player",
    direction,
  })!
  expect(entity.direction).toBe(direction)

  const saved = saveEntity(entity)
  expect(saved).toEqual({ name: "curved-rail" })
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
  expect(entity.direction).toBe(direction)
  expect(saved).toEqual({ name: "straight-rail" })
})
let events: ScriptRaisedBuiltEvent[] = []
let running = false
let destroyOnBuilt = false
before_each(() => {
  events = []
  running = true
})
after_each(() => {
  running = false
  destroyOnBuilt = false
})
Events.script_raised_built((e) => {
  if (running) {
    events.push(e)
    if (destroyOnBuilt) {
      destroyOnBuilt = false
      e.entity.destroy()
    }
  }
})

test("can create an entity", () => {
  const luaEntity = createEntity(surface, { x: 0.5, y: 0.5 }, defines.direction.north, {
    name: "iron-chest",
    bar: 3,
  } as Entity)!
  expect(luaEntity).toBeAny()
  expect(luaEntity.name).toBe("iron-chest")
  expect(luaEntity.position).toEqual({ x: 0.5, y: 0.5 })
  expect(luaEntity.get_inventory(defines.inventory.chest)!.get_bar() - 1).toBe(3)
  expect(events).toHaveLength(1)
  expect(events[0]).toMatchTable({
    entity: luaEntity,
    mod_name: script.mod_name,
  } satisfies Partial<ScriptRaisedBuiltEvent>)
})

test("returns nil if entity becomes invalid via script", () => {
  destroyOnBuilt = true
  const luaEntity = createEntity(surface, { x: 0.5, y: 0.5 }, defines.direction.north, {
    name: "iron-chest",
    bar: 3,
  } as Entity)
  expect(luaEntity).toBeNil()
})

test("can create an offshore pump anywhere", () => {
  const luaEntity = createEntity(surface, { x: 0.5, y: 0.5 }, defines.direction.north, {
    name: "offshore-pump",
  })!
  expect(luaEntity).toBeAny()
  expect(luaEntity.name).toBe("offshore-pump")
  expect(luaEntity.position).toEqual({ x: 0.5, y: 0.5 })
})

test("can still place if there are items on the ground", () => {
  const item = surface.create_entity({
    name: "item-on-ground",
    position: { x: 0.5, y: 0.5 },
    stack: "iron-plate",
  })
  expect(item).toBeAny()

  const luaEntity = createEntity(surface, { x: 0.5, y: 0.5 }, defines.direction.north, {
    name: "assembling-machine-1",
  })!
  expect(luaEntity).toBeAny()
  expect(luaEntity.name).toBe("assembling-machine-1")
  expect(luaEntity.position).toEqual({ x: 0.5, y: 0.5 })
})

test("can update an entity", () => {
  const entity = surface.create_entity({
    name: "iron-chest",
    position: { x: 12.5, y: 12.5 },
    force: "player",
    bar: 3,
  })!
  const newEntity = updateEntity(
    entity,
    {
      name: "iron-chest",
      bar: 4,
    } as Entity,
    defines.direction.north,
  )[0]
  expect(newEntity).toBe(entity)
  expect(entity.get_inventory(defines.inventory.chest)!.get_bar() - 1).toBe(4)
})

test("can upgrade an entity", () => {
  const entity = surface.create_entity({
    name: "iron-chest",
    position: { x: 12.5, y: 12.5 },
    force: "player",
  })!
  entity.minable = false
  entity.destructible = false
  const newEntity = updateEntity(entity, { name: "steel-chest" } as Entity, defines.direction.north)[0]!
  expect(newEntity.name).toBe("steel-chest")
  expect(entity.valid).toBe(false)
})

test("can rotate entity", () => {
  const entity = surface.create_entity({
    name: "inserter",
    position: { x: 12.5, y: 12.5 },
    force: "player",
    direction: defines.direction.east,
  })!
  const newEntity = updateEntity(entity, { name: "inserter" } as Entity, defines.direction.south)[0]
  expect(entity).toBe(newEntity)
  expect(entity.direction).toBe(defines.direction.south)
})

test("can rotate an assembler with no fluid recipe", () => {
  const entity = surface.create_entity({
    name: "assembling-machine-1",
    position: { x: 12.5, y: 12.5 },
    force: "player",
    direction: defines.direction.east,
  })!
  const newEntity = updateEntity(entity, { name: "assembling-machine-1" } as Entity, defines.direction.south)[0]
  expect(entity).toBe(newEntity)
  expect(entity.direction).toBe(defines.direction.south)
})

describe.each([false, true])("undergrounds, flipped: %s", (flipped) => {
  const type = flipped ? "output" : "input"
  const otherType = flipped ? "input" : "output"
  let project: UserProject
  before_each(() => {
    project = createUserProject("Test", 2)
    surface = project.getSurface(1)!
  })
  after_each(() => {
    _deleteAllProjects()
  })

  test("saving an underground belt in output direction KEEPS direction", () => {
    const entity = surface.create_entity({
      name: "underground-belt",
      position: { x: 12.5, y: 12.5 },
      force: "player",
      direction: defines.direction.south,
      type,
    })!
    expect(entity.direction).toBe(defines.direction.south)

    const saved = saveEntity(entity)
    expect(saved).toEqual({ name: "underground-belt", type })
  })

  test("creating an underground belt in output direction KEEPS direction", () => {
    const luaEntity = createEntity(surface, { x: 0.5, y: 0.5 }, defines.direction.south, {
      name: "underground-belt",
      type,
    } as Entity)!
    expect(luaEntity).toBeAny()
    expect(luaEntity.name).toBe("underground-belt")
    expect(luaEntity.position).toEqual({ x: 0.5, y: 0.5 })
    expect(luaEntity.direction).toBe(defines.direction.south)
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
    expect(westUnderground).toBeAny()
    // try pasting east output underground at 1.5, 0.5
    // if west underground is output, the created entity will be flipped
    const eastUnderground = createEntity(
      surface,
      {
        x: 1.5,
        y: 0.5,
      },
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
      type,
    })!
    entity.rotatable = false // should not matter
    const otherDir = flipped ? "input" : "output"
    const [updated, updateNeighbor] = updateEntity(
      entity,
      {
        name: "underground-belt",
        type: otherDir,
      } as Entity,
      defines.direction.east,
    )
    assert(updated)
    expect(updated).toBe(entity)
    expect(updated).toMatchTable({
      belt_to_ground_type: otherDir,
      direction: defines.direction.east,
      rotatable: false,
    })
    expect(updateNeighbor).toBeNil()
  })

  test("can flip underground with pair", () => {
    const westUnderground = surface.create_entity({
      name: "underground-belt",
      position: { x: 0.5, y: 0.5 },
      force: "player",
      direction: flipped ? defines.direction.west : defines.direction.east,
      type: flipped ? "output" : "input",
    })
    assert(westUnderground)
    const eastUnderground = surface.create_entity({
      name: "underground-belt",
      position: { x: 1.5, y: 0.5 },
      force: "player",
      direction: flipped ? defines.direction.west : defines.direction.east,
      type: flipped ? "input" : "output",
    })
    assert(eastUnderground)

    expect(westUnderground.neighbours).toEqual(eastUnderground)

    const updated = updateEntity(
      westUnderground,
      {
        name: "underground-belt",
        type: flipped ? "input" : "output",
      } as Entity,
      flipped ? defines.direction.east : defines.direction.west,
    )[0]
    assert(updated)

    expect(updated).toBeAny()
    expect(updated.name).toBe("underground-belt")
    expect(updated.direction).toBe(flipped ? defines.direction.east : defines.direction.west)
  })

  describe("canFlipUnderground", () => {
    const pos = { x: 12.5, y: 12.5 }
    test("returns true if entity not in project", () => {
      const entity = surface.create_entity({
        name: "underground-belt",
        position: pos,
        force: "player",
        direction: defines.direction.south,
        type,
      })
      assert(entity)
      expect(checkUndergroundPairFlippable(entity)).toEqual([nil, true])
    })
    test("returns false if entity in correct direction", () => {
      const entity = surface.create_entity({
        name: "underground-belt",
        position: pos,
        force: "player",
        direction: defines.direction.south,
        type,
      })
      assert(entity)
      const projectEntity = createProjectEntityNoCopy(
        {
          name: "underground-belt",
          type,
        },
        pos,
        defines.direction.south,
        1,
      )
      project.content.add(projectEntity)

      expect(checkUndergroundPairFlippable(entity)).toEqual([projectEntity, false])
    })
    test("returns true if entity in wrong direction", () => {
      const entity = surface.create_entity({
        name: "underground-belt",
        position: pos,
        force: "player",
        direction: defines.direction.north,
        type: otherType,
      })
      assert(entity)
      const projectEntity = createProjectEntityNoCopy(
        {
          name: "underground-belt",
          type,
        },
        pos,
        defines.direction.south,
        1,
      )
      project.content.add(projectEntity)

      expect(checkUndergroundPairFlippable(entity)).toEqual([projectEntity, true])
    })
  })

  test("won't flip underground if checkUndergroundPairFlippable on pair is false", () => {
    const leftUnderground = surface.create_entity({
      name: "underground-belt",
      position: { x: 0.5, y: 0.5 },
      force: "player",
      direction: flipped ? defines.direction.west : defines.direction.east,
      type,
    })
    assert(leftUnderground)
    const rightUnderground = surface.create_entity({
      name: "underground-belt",
      position: { x: 1.5, y: 0.5 },
      force: "player",
      direction: flipped ? defines.direction.west : defines.direction.east,
      type: otherType,
    })
    assert(rightUnderground)
    expect(leftUnderground.neighbours).toEqual(rightUnderground)
    const rightEntity = createProjectEntityNoCopy(
      {
        name: "underground-belt",
        type: rightUnderground.belt_to_ground_type,
      },
      rightUnderground.position,
      rightUnderground.direction,
      1,
    )
    project.content.add(rightEntity)

    expect(checkUndergroundPairFlippable(rightUnderground)).toMatchTable([expect.anything(), false])

    const [updated, updatedNeighbor] = updateEntity(
      leftUnderground,
      {
        name: "underground-belt",
        type: otherType,
      } as Entity,
      flipped ? defines.direction.east : defines.direction.west,
    )
    expect(updated).toBe(leftUnderground)
    expect(updatedNeighbor).toBeNil()

    // not flipped
    expect(leftUnderground).toMatchTable({
      belt_to_ground_type: type,
      direction: flipped ? defines.direction.west : defines.direction.east,
    })
    expect(rightUnderground).toMatchTable({
      belt_to_ground_type: otherType,
      direction: flipped ? defines.direction.west : defines.direction.east,
    })
  })

  test("can upgrade underground", () => {
    const entity = surface.create_entity({
      name: "underground-belt",
      position: { x: 12.5, y: 12.5 },
      force: "player",
      type,
      direction: defines.direction.west,
    })!
    expect(entity).toBeAny()
    const updated = updateEntity(
      entity,
      {
        name: "fast-underground-belt",
        type,
      } as Entity,
      defines.direction.west,
    )[0]!
    expect(updated).toBeAny()
    expect(updated.name).toBe("fast-underground-belt")
    expect(updated.direction).toBe(defines.direction.west)
    expect(updated.belt_to_ground_type).toBe(type)
  })

  test("can rotate underground", () => {
    const entity = surface.create_entity({
      name: "underground-belt",
      position: { x: 12.5, y: 12.5 },
      force: "player",
      type,
      direction: defines.direction.west,
    })!
    expect(entity).toBeAny()
    const updated = updateEntity(
      entity,
      {
        name: "underground-belt",
        type,
      } as Entity,
      defines.direction.south,
    )[0]!
    expect(updated).toBeAny()
    expect(updated.name).toBe("underground-belt")
    expect(updated.direction).toBe(defines.direction.south)
  })
})

test("can create loader", () => {
  const entity = createEntity(surface, { x: 12.5, y: 12 }, defines.direction.east, {
    name: "loader",
    type: "output",
  } as Entity)!
  expect(entity.name).toBe("loader")
  expect(entity.direction).toBe(defines.direction.east)
  expect(entity.loader_type).toBe("output")

  const entity2 = createEntity(surface, { x: 14.5, y: 12 }, defines.direction.east, {
    name: "loader",
    type: "input",
  } as Entity)!
  expect(entity2.name).toBe("loader")
  expect(entity2.direction).toBe(defines.direction.east)
  expect(entity2.loader_type).toBe("input")
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
  )[0]!
  expect(updated).toBe(entity)
  expect(updated.loader_type).toBe("output")
  expect(updated.rotatable).toBe(false)
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
  )[0]
  expect(entity).toBe(newEntity)
  expect(entity.get_module_inventory()!.get_contents()).toEqual(newContents)
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
  const newEntity = updateEntity(locomotive, newValue as Entity, defines.direction.north)[0]!
  expect(newEntity).toBe(locomotive)
  expect(newEntity.train?.schedule?.current).toEqual(2)
  expect(newEntity.train?.schedule?.records).toEqual(newValue.schedule)
})

test("createPreviewEntity", () => {
  const preview = createPreviewEntity(
    surface,
    {
      x: 12.5,
      y: 12.5,
    },
    defines.direction.east,
    Prototypes.PreviewEntityPrefix + "iron-chest",
  )
  expect(preview).toMatchTable({
    position: { x: 12.5, y: 12.5 },
    name: Prototypes.PreviewEntityPrefix + "iron-chest",
    destructible: false,
    minable: false,
    rotatable: false,
  })
  expect(isPreviewEntity(preview!)).toBe(true)
  // events NOT raised for preview entities
  expect(events).toHaveLength(0)
})

test("canBeAnyDirection", () => {
  // only true if is an assembling machine with no fluid inputs
  const entity = surface.create_entity({
    name: "assembling-machine-3",
    position: { x: 12.5, y: 12.5 },
    force: "player",
  })!
  expect(canBeAnyDirection(entity)).toBe(true)
  entity.set_recipe("rocket-fuel")
  expect(canBeAnyDirection(entity)).toBe(false)

  const entity2 = surface.create_entity({
    name: "iron-chest",
    position: { x: 0.5, y: 0.5 },
    force: "player",
  })!
  expect(canBeAnyDirection(entity2)).toBe(false)
})
