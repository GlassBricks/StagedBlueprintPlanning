// Copyright (c) 2022-2025 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { BlueprintEntity, BlueprintEntityWrite, LuaEntity, LuaSurface, ScriptRaisedBuiltEvent } from "factorio:runtime"
import expect from "tstl-expect"
import { Prototypes } from "../../constants"
import { Entity } from "../../entity/Entity"
import { newProjectEntity } from "../../entity/ProjectEntity"
import { elevatedRailTypes, isPreviewEntity } from "../../entity/prototype-info"
import {
  canBeAnyDirection,
  checkUndergroundPairFlippable,
  createEntity,
  createPreviewEntity,
  saveEntity,
  updateEntity,
} from "../../entity/save-load"
import { assert, crossProduct, Events } from "../../lib"
import { Pos } from "../../lib/geometry"
import { UserProject } from "../../project/ProjectDef"
import { _deleteAllProjects, createUserProject } from "../../project/UserProject"
import { createRollingStocks } from "./createRollingStock"
import { moduleInsertPlan, simpleInsertPlan } from "./entity-util"

let surface: LuaSurface
let itemRequestProxyExpected = false
before_each(() => {
  surface = game.surfaces[1]
  surface.find_entities().forEach((e) => e.destroy())
})
after_each(() => {
  const requestProxy = surface.find_entities_filtered({ name: "item-request-proxy" })
  if (!itemRequestProxyExpected) {
    expect(requestProxy).toHaveLength(0)
  } else {
    expect(requestProxy).not.toHaveLength(0)
    itemRequestProxyExpected = false
  }
})

test("can save an entity", () => {
  const entity = surface.create_entity({
    name: "inserter",
    position: { x: 12.5, y: 12.5 },
    force: "player",
    direction: defines.direction.east,
  })!
  entity.inserter_stack_size_override = 2
  const [saved] = saveEntity(entity)
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
    name: "inserter",
    override_stack_size: 2,
  }
  const [saved] = saveEntity(entity, knownValue)
  expect(saved).toEqual({ name: "inserter", override_stack_size: 2 })
})

test("saving an entity with higher quality", () => {
  const entity = surface.create_entity({
    name: "inserter",
    quality: "legendary",
    position: { x: 12.5, y: 12.5 },
    force: "player",
    direction: defines.direction.east,
  })
  const [saved] = saveEntity(entity!)
  expect(saved).toEqual({ name: "inserter", quality: "legendary" })
})

const directions8 = (Object.values(defines.direction) as defines.direction[]).filter((a) => a % 2 == 0)
const rails = ["straight-rail", "curved-rail-a", "curved-rail-b", "half-diagonal-rail"]
test.each(crossProduct(rails.concat(Object.keys(elevatedRailTypes)), directions8))(
  "can save %s in direction %s",
  (name, direction) => {
    const entity = surface.create_entity({
      name,
      position: { x: 12.5, y: 12.5 },
      force: "player",
      direction,
    })!
    const expectedDirection =
      name == "straight-rail" ||
      name == "elevated-straight-rail" ||
      name == "half-diagonal-rail" ||
      name == "elevated-half-diagonal-rail"
        ? direction % 8
        : direction

    expect(entity.direction).toBe(expectedDirection)

    const [saved] = saveEntity(entity)
    expect(saved).toEqual({ name })
  },
)

test.each(["rail-signal", "rail-chain-signal"])("can save and load elevated %s", (signalType) => {
  const supportRail = surface.create_entity({
    name: "elevated-straight-rail",
    position: { x: 13, y: 12 },
    direction: defines.direction.north,
    force: "player",
  })
  assert(supportRail)
  const entity = surface.create_entity({
    name: signalType,
    position: { x: 11.5, y: 12.5 },
    force: "player",
    rail_layer: defines.rail_layer.elevated,
  })!
  const [saved] = saveEntity(entity)
  expect(saved!).toEqual({ name: signalType, rail_layer: "elevated" })

  entity.destroy()
  const loaded = createEntity(surface, Pos(11.5, 12.5), 0, saved!, nil)
  expect(loaded).toMatchTable({
    name: signalType,
    rail_layer: defines.rail_layer.elevated,
  })
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
  const luaEntity = createEntity(
    surface,
    { x: 0.5, y: 0.5 },
    defines.direction.north,
    {
      name: "iron-chest",
      bar: 3,
    } as Entity,
    nil,
  )!
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

test("can create an entity with different quality", () => {
  const luaEntity = createEntity(
    surface,
    { x: 0.5, y: 0.5 },
    defines.direction.north,
    {
      name: "iron-chest",
      quality: "legendary",
    },
    nil,
  )!
  expect(luaEntity).toBeAny()
  expect(luaEntity.name).toBe("iron-chest")
  expect(luaEntity.position).toEqual({ x: 0.5, y: 0.5 })

  expect(luaEntity.quality.name).toBe("legendary")
})

test("can create an rotated assembler", () => {
  const luaEntity = createEntity(
    surface,
    { x: 0.5, y: 0.5 },
    defines.direction.east,
    {
      name: "assembling-machine-3",
      recipe: "rocket-fuel",
    } as Entity,
    nil,
  )!
  expect(luaEntity).toBeAny()
  expect(luaEntity.name).toBe("assembling-machine-3")
  expect(luaEntity.position).toEqual({ x: 0.5, y: 0.5 })
  expect(luaEntity.direction).toBe(defines.direction.east)
})

test("can set recipe of assembling machine even if not researched", () => {
  game.forces.player.recipes["rocket-fuel"].enabled = false
  after_test(() => (game.forces.player.recipes["rocket-fuel"].enabled = true))
  const luaEntity = createEntity(
    surface,
    { x: 0.5, y: 0.5 },
    defines.direction.north,
    {
      name: "assembling-machine-3",
      recipe: "rocket-fuel",
    } as Entity,
    nil,
  )!

  expect(luaEntity).toBeAny()
  expect(luaEntity.get_recipe()[0]?.name).toBe("rocket-fuel")
})

test("doesn't crash if setting to non-existent recipe", () => {
  const luaEntity = createEntity(
    surface,
    { x: 0.5, y: 0.5 },
    defines.direction.north,
    {
      name: "assembling-machine-3",
      recipe: "foobar@",
    } as Entity,
    nil,
  )!
  expect(luaEntity).toBeAny()
  expect(luaEntity.get_recipe()[0]).toBeNil()
})

test("returns nil if entity becomes invalid via script", () => {
  destroyOnBuilt = true
  const luaEntity = createEntity(
    surface,
    { x: 0.5, y: 0.5 },
    defines.direction.north,
    {
      name: "iron-chest",
      bar: 3,
    } as Entity,
    nil,
  )
  expect(luaEntity).toBeNil()
})

test("can create an offshore pump anywhere", () => {
  const luaEntity = createEntity(
    surface,
    { x: 0.5, y: 0.5 },
    defines.direction.north,
    {
      name: "offshore-pump",
    },
    nil,
  )!
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

  const luaEntity = createEntity(
    surface,
    { x: 0.5, y: 0.5 },
    defines.direction.north,
    {
      name: "assembling-machine-1",
    },
    nil,
  )!
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
    nil,
    defines.direction.north,
  )[0]
  expect(newEntity).toBe(entity)
  expect(entity.get_inventory(defines.inventory.chest)!.get_bar() - 1).toBe(4)
})

test("can set recipe of assembling machine even if not researched", () => {
  game.forces.player.recipes["rocket-fuel"].enabled = false
  after_test(() => (game.forces.player.recipes["rocket-fuel"].enabled = true))
  const entity = surface.create_entity({
    name: "assembling-machine-3",
    position: { x: 12.5, y: 12.5 },
    force: "player",
  })!
  const newEntity = updateEntity(
    entity,
    {
      name: "assembling-machine-3",
      recipe: "rocket-fuel",
    } as Entity,
    nil,
    defines.direction.north,
  )[0]
  expect(newEntity).toBe(entity)
  expect(entity.get_recipe()[0]?.name).toBe("rocket-fuel")
})

test("can set recipe with different quality than normal", () => {
  game.forces.player.recipes["rocket-fuel"].enabled = false
  after_test(() => (game.forces.player.recipes["rocket-fuel"].enabled = true))
  const entity = surface.create_entity({
    name: "assembling-machine-3",
    position: { x: 12.5, y: 12.5 },
    force: "player",
  })!
  const newEntity = updateEntity(
    entity,
    {
      name: "assembling-machine-3",
      recipe: "rocket-fuel",
      recipe_quality: "legendary",
    } as Entity,
    nil,
    defines.direction.north,
  )[0]
  expect(newEntity).toBe(entity)
  const [recipe, quality] = entity.get_recipe()
  expect(recipe?.name).toBe("rocket-fuel")
  expect(quality?.name).toBe("legendary")
})

test("can upgrade an entity", () => {
  const entity = surface.create_entity({
    name: "iron-chest",
    position: { x: 12.5, y: 12.5 },
    force: "player",
  })!
  entity.minable = false
  entity.destructible = false
  const newEntity = updateEntity(entity, { name: "steel-chest" } as Entity, nil, defines.direction.north)[0]!
  expect(newEntity.name).toBe("steel-chest")
  expect(entity.valid).toBe(false)
})

test("can upgrade an entity to a different quality", () => {
  const entity = surface.create_entity({
    name: "iron-chest",
    position: { x: 12.5, y: 12.5 },
    force: "player",
  })!
  const newEntity = updateEntity(entity, { name: "iron-chest", quality: "legendary" }, nil, defines.direction.north)[0]!
  expect(newEntity).toMatchTable({
    name: "iron-chest",
    quality: { name: "legendary" },
  })
})

test("can rotate entity", () => {
  const entity = surface.create_entity({
    name: "inserter",
    position: { x: 12.5, y: 12.5 },
    force: "player",
    direction: defines.direction.east,
  })!
  const newEntity = updateEntity(entity, { name: "inserter" } as Entity, nil, defines.direction.south)[0]
  expect(entity).toBe(newEntity)
  expect(entity.direction).toBe(defines.direction.south)
})

test("can delete tree in the way", () => {
  const tree = surface.create_entity({
    name: "tree-01",
    position: { x: 0.5, y: 0.5 },
  })!
  expect(tree).toBeAny()
  const newEntity = createEntity(
    surface,
    { x: 0.5, y: 0.5 },
    defines.direction.north,
    {
      name: "assembling-machine-1",
    },
    nil,
  )!
  expect(newEntity).toBeAny()
  expect(tree.valid).toBe(false)
})

test("can delete rocks in the way", () => {
  const rock = surface.create_entity({
    name: "huge-rock",
    position: { x: 0.5, y: 0.5 },
  })!
  expect(rock).toBeAny()
  const newEntity = createEntity(
    surface,
    { x: 0.5, y: 0.5 },
    defines.direction.north,
    {
      name: "assembling-machine-1",
    },
    nil,
  )!
  expect(newEntity).toBeAny()
  expect(rock.valid).toBe(false)
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

    const [saved] = saveEntity(entity)
    expect(saved).toEqual({ name: "underground-belt", type })
  })

  test("creating an underground belt in output direction KEEPS direction", () => {
    const luaEntity = createEntity(
      surface,
      { x: 0.5, y: 0.5 },
      defines.direction.south,
      {
        name: "underground-belt",
        type,
      } as Entity,
      nil,
    )!
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
      nil,
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
      nil,
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
      nil,
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
      const projectEntity = newProjectEntity(
        {
          name: "underground-belt",
          type,
        },
        pos,
        defines.direction.south,
        1,
      )
      project.content.addEntity(projectEntity)

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
      const projectEntity = newProjectEntity(
        {
          name: "underground-belt",
          type,
        },
        pos,
        defines.direction.south,
        1,
      )
      project.content.addEntity(projectEntity)

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
    const rightEntity = newProjectEntity(
      {
        name: "underground-belt",
        type: rightUnderground.belt_to_ground_type,
      },
      rightUnderground.position,
      rightUnderground.direction,
      1,
    )
    project.content.addEntity(rightEntity)

    expect(checkUndergroundPairFlippable(rightUnderground)).toMatchTable([expect.anything(), false])

    const [updated, updatedNeighbor] = updateEntity(
      leftUnderground,
      {
        name: "underground-belt",
        type: otherType,
      } as Entity,
      nil,
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
      nil,
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
      nil,
      defines.direction.south,
    )[0]!
    expect(updated).toBeAny()
    expect(updated.name).toBe("underground-belt")
    expect(updated.direction).toBe(defines.direction.south)
  })
})

test("can create loader", () => {
  const entity = createEntity(
    surface,
    { x: 12.5, y: 12 },
    defines.direction.east,
    {
      name: "loader",
      type: "output",
    } as Entity,
    nil,
  )!
  expect(entity.name).toBe("loader")
  expect(entity.direction).toBe(defines.direction.east)
  expect(entity.loader_type).toBe("output")

  const entity2 = createEntity(
    surface,
    { x: 14.5, y: 12 },
    defines.direction.east,
    {
      name: "loader",
      type: "input",
    } as Entity,
    nil,
  )!
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
    nil,
    defines.direction.east,
  )[0]!
  expect(updated).toBe(entity)
  expect(updated.loader_type).toBe("output")
  expect(updated.rotatable).toBe(false)
})

test("can mirror machine", () => {
  const entity = surface.create_entity({
    name: "electromagnetic-plant",
    position: { x: 12.5, y: 12.5 },
    force: "player",
    direction: defines.direction.north,
  })!
  entity.set_recipe("electrolyte")
  expect(entity.mirroring).toBe(false)

  const updated = updateEntity(
    entity,
    {
      name: "electromagnetic-plant",
      recipe: "electrolyte",
      mirror: true,
    } as Entity,
    nil,
    defines.direction.north,
    true, // mirrored
  )[0]!

  expect(updated).toBe(entity)
  expect(updated.direction).toBe(defines.direction.north)
  expect(updated.mirroring).toBe(true)
  expect(updated.get_recipe()[0]?.name).toBe("electrolyte")
})

describe("item-requests", () => {
  const moduleInsertPlan1 = [moduleInsertPlan(defines.inventory.crafter_modules, 4, 0, "productivity-module")]
  const moduleInsertPlan2 = [
    moduleInsertPlan(defines.inventory.crafter_modules, 2, 0, "speed-module"),
    moduleInsertPlan(defines.inventory.crafter_modules, 2, 2, "speed-module-2"),
  ]
  const itemInsertPlan1 = [simpleInsertPlan(defines.inventory.crafter_input, "iron-plate", 0, 2)]
  const itemInsertPlan2 = [simpleInsertPlan(defines.inventory.crafter_input, "copper-cable", 1, 2)]

  const moduleInsertPlans = [moduleInsertPlan1, moduleInsertPlan2] as const
  const itemInsertPlans = [itemInsertPlan1, itemInsertPlan2] as const

  type TestCase = [modules: false | 0 | 1, itemRequests: false | 0 | 1]

  function checkModuleRequests(entity: LuaEntity, selected: false | 0 | 1) {
    const inventory = entity.get_module_inventory()!
    if (selected == false) {
      expect(inventory.get_contents()).toEqual({})
    } else if (selected == 0) {
      expect(inventory.get_item_count()).toBe(4)
      expect(inventory.get_item_count("productivity-module")).toBe(4)
    } else {
      expect(inventory.get_item_count()).toBe(4)
      expect(inventory.get_item_count("speed-module")).toBe(2)
      expect(inventory.get_item_count("speed-module-2")).toBe(2)
    }
  }

  function checkItemRequests(entity: LuaEntity, selected: false | 0 | 1) {
    const proxy = entity.item_request_proxy
    if (selected == false) {
      expect(proxy).toBeNil()
    } else {
      const plan = itemInsertPlans[selected]
      expect(proxy?.insert_plan).toEqual(plan)

      itemRequestProxyExpected = true
    }
  }

  test.each<TestCase>([
    [false, 0],
    [0, false],
    [0, 0],
  ])("creating entity with modules: %s, itemsRequests %s", (modules, itemRequests) => {
    const luaEntity = createEntity(
      surface,
      { x: 0.5, y: 0.5 },
      defines.direction.north,
      {
        name: "assembling-machine-3",
        recipe: "electronic-circuit",
        items: modules != false ? moduleInsertPlans[modules] : nil,
      } as Entity,
      itemRequests != false ? { items: itemInsertPlans[itemRequests] } : nil,
    )!

    expect(luaEntity).toBeAny()
    checkItemRequests(luaEntity, itemRequests)
    checkModuleRequests(luaEntity, modules)
  })

  test("creating entity with only item requests and no settings", () => {
    const luaEntity = createEntity(
      surface,
      { x: 0.5, y: 0.5 },
      defines.direction.north,
      {
        name: "iron-chest",
      } as Entity,
      { items: itemInsertPlans[0] },
    )!

    expect(luaEntity).toBeAny()
    checkItemRequests(luaEntity, 0)
  })

  // lots of cases since lots of bugs...
  test.each<[...TestCase, ...TestCase]>([
    // creation
    [false, false, false, 0],
    [false, false, 0, false],
    [false, false, 0, 0],
    // deletion
    [0, 0, false, false],
    [0, false, false, false],
    [false, 0, false, false],
    // changing
    [0, 0, 1, 1],
    [0, false, 1, false],
    [false, 0, false, 1],
    [0, 0, 0, 1],
    [0, 0, 1, 0],
    // combination
    [0, 0, false, 1],
    [0, false, false, 1],
    [false, 0, 1, false],
    [false, false, 1, 1],
  ])(
    "changing from (modules: %s, itemRequests: %s) to (modules: %s, itemRequests: %s)",
    (oldModules, oldItemRequests, newModules, newItemRequests) => {
      const entity = createEntity(
        surface,
        { x: 0.5, y: 0.5 },
        defines.direction.north,
        {
          name: "assembling-machine-3",
          recipe: "electronic-circuit",
          items: oldModules ? moduleInsertPlans[oldModules] : nil,
        } as Entity,
        oldItemRequests ? { items: itemInsertPlans[oldItemRequests] } : nil,
      )!
      const newEntity = updateEntity(
        entity,
        {
          name: "assembling-machine-3",
          items: newModules ? moduleInsertPlans[newModules] : nil,
        } as Entity,
        newItemRequests ? { items: itemInsertPlans[newItemRequests] } : nil,
        defines.direction.north,
      )[0]!

      expect(newEntity).toBeAny()
      checkItemRequests(newEntity, newItemRequests)
      checkModuleRequests(newEntity, newModules)
    },
  )

  test("Updating an entity removes items if it matches requests exactly", () => {
    const chest = surface.create_entity({
      name: "iron-chest",
      position: { x: 0.5, y: 0.5 },
      force: "player",
    })!
    const slot = 2
    const itemCount = 2
    chest.get_inventory(defines.inventory.chest)![slot].set_stack({ name: "iron-plate", count: itemCount })
    chest.get_inventory(defines.inventory.chest)![slot + 1].set_stack({ name: "copper-plate", count: itemCount })
    const insertPlan = simpleInsertPlan(defines.inventory.chest, "iron-plate", slot, itemCount)

    const newEntity = updateEntity(
      chest,
      { name: "iron-chest" } as Entity,
      { items: [insertPlan] },
      defines.direction.north,
    )[0]!

    expect(newEntity).toBe(chest)
    expect(chest.get_inventory(defines.inventory.chest)!.get_item_count("iron-plate")).toBe(0)
    expect(chest.get_inventory(defines.inventory.chest)!.get_item_count("copper-plate")).toBe(itemCount)
    expect(chest.item_request_proxy?.insert_plan).toEqual([insertPlan])

    itemRequestProxyExpected = true
  })
})

test("can save an entity with modules", () => {
  const entity = surface.create_entity({
    name: "lab",
    position: { x: 0.5, y: 0.5 },
    force: "player",
  })!
  assert(entity)
  entity.get_inventory(defines.inventory.lab_modules)!.insert({ name: "speed-module", count: 2 })

  const [saved] = saveEntity(entity)
  expect(saved?.items?.[0]?.items).toEqual({
    in_inventory: [
      { inventory: defines.inventory.lab_modules, stack: 0 },
      { inventory: defines.inventory.lab_modules, stack: 1 },
    ],
  })
  expect(saved).toEqual({
    name: "lab",
    items: [
      {
        id: { name: "speed-module" },
        items: expect.anything(),
      },
    ],
  })

  entity.destroy()

  const newEntity = createEntity(surface, { x: 0.5, y: 0.5 }, defines.direction.north, saved as Entity, nil)!
  expect(newEntity).toBeAny()
  expect(newEntity.get_inventory(defines.inventory.lab_modules)!.get_contents()).toEqual([
    {
      name: "speed-module",
      count: 2,
      quality: "normal",
    },
  ])
})

test("updating rolling stock does nothing", () => {
  const [locomotive] = createRollingStocks(surface, "locomotive", "cargo-wagon")
  const oldLocation = locomotive.position
  const newValue = {
    name: "locomotive",
    orientation: 0,
    position: { x: 0.5, y: 0.5 },
  } as Entity
  const newEntity = updateEntity(locomotive, newValue, nil, defines.direction.north)[0]!
  expect(newEntity).toBe(locomotive)
  expect(locomotive.position).toEqual(oldLocation)
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

describe("EditorExtensions support", () => {
  assert("EditorExtensions" in script.active_mods)

  test("can create and update infinity loader", () => {
    const loader = createEntity(
      surface,
      { x: 12.5, y: 12 },
      defines.direction.east,
      {
        name: "ee-infinity-loader",
        type: "input",
        filters: [{ index: 1, name: "iron-plate" }],
      } satisfies Partial<BlueprintEntityWrite> as Entity,
      nil,
    )!
    expect(loader).toBeAny()
    expect(loader.name).toBe("ee-infinity-loader")
    expect(loader.get_filter(1)).toEqual({ name: "iron-plate" })

    const updated = updateEntity(
      loader,
      {
        name: "ee-infinity-loader",
        type: "output",
        filters: [{ index: 1, name: "copper-plate" }],
      } satisfies Partial<BlueprintEntityWrite> as Entity,
      nil,
      defines.direction.east,
    )[0]!

    expect(updated).toBeAny()
    expect(updated.name).toBe("ee-infinity-loader")
    expect(updated.get_filter(1)).toEqual({ name: "copper-plate" })
  })
})
