// Copyright (c) 2022-2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import expect, { mock } from "tstl-expect"
import { LuaEntityInfo } from "../../entity/Entity"
import { _assertCorrect, MutableProjectContent, newProjectContent } from "../../entity/ProjectContent"
import { newProjectEntity, ProjectEntity } from "../../entity/ProjectEntity"
import { createProjectTile } from "../../tiles/ProjectTile"
import { getPrototypeRotationType, RotationType } from "../../entity/prototype-info"
import { setupTestSurfaces } from "../project/Project-mock"
import { createRollingStocks } from "./createRollingStock"

let content: MutableProjectContent
before_each(() => {
  content = newProjectContent()
})
after_each(() => {
  _assertCorrect(content)
})
const surfaces = setupTestSurfaces(1)

test("counts number of entities correctly", () => {
  const entity = newProjectEntity({ name: "foo" }, { x: 0, y: 0 }, 0, 1)
  expect(content.countNumEntities()).toBe(0)
  content.addEntity(entity)
  expect(content.countNumEntities()).toBe(1)
  content.deleteEntity(entity)
  expect(content.countNumEntities()).toBe(0)
})

describe("findCompatible", () => {
  test("matches name and direction", () => {
    const entity: ProjectEntity = newProjectEntity({ name: "foo" }, { x: 0, y: 0 }, 0, 1)
    content.addEntity(entity)

    expect(content.findCompatibleEntity("foo", { x: 0, y: 0 }, defines.direction.north, 1)).toBe(entity)
  })

  test("does not match if passed stage is higher than entity's last stage", () => {
    const entity = newProjectEntity({ name: "foo" }, { x: 0, y: 0 }, 0, 1)
    content.addEntity(entity)
    entity.setLastStageUnchecked(2)

    expect(content.findCompatibleEntity("foo", { x: 0, y: 0 }, defines.direction.north, 3)).toBeNil()
  })

  test.each(["12", "21"])("if multiple matches, finds one with smallest firstStage, order %s", (o) => {
    const e1 = newProjectEntity({ name: "foo" }, { x: 0, y: 0 }, 0, 1)
    e1.setLastStageUnchecked(2)
    const e2 = newProjectEntity({ name: "foo" }, { x: 0, y: 0 }, 0, 3)
    e2.setLastStageUnchecked(4)

    if (o == "21") {
      content.addEntity(e2)
      content.addEntity(e1)
    } else {
      content.addEntity(e1)
      content.addEntity(e2)
    }

    expect(content.findCompatibleEntity("foo", { x: 0, y: 0 }, defines.direction.north, 2)).toBe(e1)
    expect(content.findCompatibleEntity("foo", { x: 0, y: 0 }, defines.direction.north, 3)).toBe(e2)
  })

  test("if direction is nil, matches any direction", () => {
    const entity: ProjectEntity = newProjectEntity({ name: "foo" }, { x: 0, y: 0 }, defines.direction.east, 1)
    content.addEntity(entity)

    expect(content.findCompatibleEntity("foo", { x: 0, y: 0 }, nil, 1)).toBe(entity)
  })

  test("matches if different name in same category", () => {
    const entity: ProjectEntity = newProjectEntity({ name: "assembling-machine-1" }, { x: 0, y: 0 }, 0, 1)
    content.addEntity(entity)

    expect(content.findCompatibleEntity("assembling-machine-2", { x: 0, y: 0 }, defines.direction.north, 1)).toBe(
      entity,
    )
  })

  test("if direction is nil, matches same category and any direction", () => {
    const entity: ProjectEntity = newProjectEntity(
      { name: "assembling-machine-1" },
      { x: 0, y: 0 },
      defines.direction.east,
      1,
    )
    content.addEntity(entity)

    expect(content.findCompatibleEntity("assembling-machine-2", { x: 0, y: 0 }, nil, 1)).toBe(entity)
  })

  test("not compatible", () => {
    const entity: ProjectEntity = newProjectEntity({ name: "foo" }, { x: 0, y: 0 }, 0, 1)
    entity.setLastStageUnchecked(2)
    expect(content.findCompatibleEntity("test2", entity.position, defines.direction.north, 2)).toBeNil()
    expect(content.findCompatibleEntity("foo", entity.position, defines.direction.south, 2)).toBeNil()
    expect(content.findCompatibleEntity("foo", { x: 1, y: 0 }, defines.direction.north, 2)).toBeNil()
    expect(content.findCompatibleEntity("foo", { x: 1, y: 0 }, defines.direction.north, 3)).toBeNil()
  })
})

test("finds exact entity match by lua entity and position", () => {
  const entity: ProjectEntity = newProjectEntity({ name: "stone-furnace" }, { x: 0, y: 0 }, 0, 1)
  const luaEntity = assert(surfaces[0].create_entity({ name: "stone-furnace", position: { x: 0, y: 0 } }))
  content.addEntity(entity)
  entity.replaceWorldEntity(2, luaEntity)
  expect(content.findEntityExact(luaEntity, luaEntity.position, 2)).toBe(entity)
  luaEntity.teleport(1, 1)
  expect(content.findEntityExact(luaEntity, { x: 0, y: 0 }, 2)).toBe(entity)
})

describe("findCompatibleWithLuaEntity", () => {
  test("matches simple", () => {
    const entity = newProjectEntity({ name: "stone-furnace" }, { x: 0, y: 0 }, 0, 1)
    const luaEntity = assert(surfaces[0].create_entity({ name: "stone-furnace", position: { x: 0, y: 0 } }))
    content.addEntity(entity)

    expect(content.findCompatibleWithLuaEntity(luaEntity, nil, 1)).toBe(entity)
  })

  test("matches if is compatible", () => {
    const entity = newProjectEntity({ name: "stone-furnace" }, { x: 0, y: 0 }, 0, 1)
    const luaEntity = assert(surfaces[0].create_entity({ name: "steel-furnace", position: { x: 0, y: 0 } }))
    content.addEntity(entity)

    expect(content.findCompatibleWithLuaEntity(luaEntity, nil, 1)).toBe(entity)
  })

  test("matches opposite direction if pasteRotatableType is rectangular", () => {
    assert(getPrototypeRotationType("boiler") == RotationType.Flippable)
    const entity = newProjectEntity({ name: "boiler" }, { x: 0.5, y: 0 }, defines.direction.north, 1)

    const luaEntity = assert(
      surfaces[0].create_entity({ name: "boiler", position: { x: 0.5, y: 0 }, direction: defines.direction.south }),
    )
    content.addEntity(entity)

    expect(content.findCompatibleWithLuaEntity(luaEntity, nil, 1)).toBe(entity)
  })

  test("matches any direction if pasteRotatableType is square", () => {
    assert(getPrototypeRotationType("assembling-machine-1") == RotationType.AnyDirection)

    const entity = newProjectEntity(
      { name: "assembling-machine-2" },
      {
        x: 0.5,
        y: 0.5,
      },
      defines.direction.north,
      1,
    )
    const luaEntity = assert(
      surfaces[0].create_entity({
        name: "assembling-machine-1",
        position: { x: 0.5, y: 0.5 },
        direction: defines.direction.west,
        recipe: "fast-transport-belt", // fluid, so direction applies
      }),
    )
    content.addEntity(entity)

    expect(content.findCompatibleWithLuaEntity(luaEntity, nil, 1)).toBe(entity)
  })

  test("matches underground both flipped and unflipped", () => {
    const same: LuaEntityInfo = {
      name: "underground-belt",
      type: "underground-belt",
      belt_to_ground_type: "input",
      position: { x: 0, y: 0 },
      direction: defines.direction.west,
      surface: nil!,
    }
    const flipped: LuaEntityInfo = {
      name: "underground-belt",
      type: "underground-belt",
      belt_to_ground_type: "output",
      position: { x: 0, y: 0 },
      direction: defines.direction.east,
      surface: nil!,
    }
    const projectEntity = newProjectEntity(
      { name: "underground-belt", type: "input" },
      {
        x: 0,
        y: 0,
      },
      defines.direction.west,
      1,
    )
    content.addEntity(projectEntity)

    expect(content.findCompatibleWithLuaEntity(same, nil, 1)).toBe(projectEntity)
    expect(content.findCompatibleWithLuaEntity(flipped, nil, 1)).toBe(projectEntity)
  })

  test("rolling stock only matches if is exact same entity", () => {
    const entity = newProjectEntity({ name: "locomotive" }, { x: 0, y: 0 }, 0, 1)
    const [a1, a2] = createRollingStocks(surfaces[0], "locomotive", "locomotive")
    content.addEntity(entity)
    entity.replaceWorldEntity(1, a1)

    expect(content.findCompatibleWithLuaEntity(a1, nil, 1)).toBe(entity)
    expect(content.findCompatibleWithLuaEntity(a2, nil, 1)).toBeNil()
    expect(content.findCompatibleWithLuaEntity(a1, nil, 2)).toBe(entity)
  })

  test("rails at same position but opposite direction are treated different only if diagonal", () => {
    const entity1: ProjectEntity = newProjectEntity(
      { name: "straight-rail" },
      { x: 1, y: 1 },
      defines.direction.northeast,
      1,
    )
    const entity2: ProjectEntity = newProjectEntity(
      { name: "straight-rail" },
      { x: 1, y: 1 },
      defines.direction.north,
      1,
    )
    const luaEntity1 = assert(
      surfaces[0].create_entity({
        name: "straight-rail",
        position: { x: 1, y: 1 },
        direction: defines.direction.southwest,
      }),
    )
    const luaEntity2 = assert(
      surfaces[0].create_entity({
        name: "straight-rail",
        position: { x: 1, y: 1 },
        direction: defines.direction.south,
      }),
    )
    content.addEntity(entity1)
    content.addEntity(entity2)
    // diagonal, so should have no match
    expect(content.findCompatibleWithLuaEntity(luaEntity1, nil, 1)).toBe(nil)
    // orthogonal, so should have a match
    expect(content.findCompatibleWithLuaEntity(luaEntity2, nil, 1)).toBe(entity2)
  })
})

test("changes entity position and updates internal index", () => {
  const entity: ProjectEntity = newProjectEntity({ name: "foo" }, { x: 0, y: 0 }, 0, 1)
  content.addEntity(entity)
  content.changeEntityPosition(entity, { x: 1, y: 1 })
  expect(entity.position.x).toBe(1)
  expect(entity.position.y).toBe(1)
  expect(content.findCompatibleEntity("foo", { x: 1, y: 1 }, defines.direction.north, 1)).toBe(entity)
})

test("sets tile at position", () => {
  const pos = { x: 1, y: 2 }
  const tile = createProjectTile()
  tile.setTileAtStage(1, "foo")
  content.setTile(pos, tile)
  expect(content.tiles.get(1, 2)).toBe(tile)
})

test("deletes tile and returns success status", () => {
  const pos = { x: 1, y: 2 }
  const tile = createProjectTile()
  tile.setTileAtStage(1, "foo")
  content.setTile(pos, tile)
  const ret = content.deleteTile(pos)
  expect(content.tiles.get(1, 2)).toBeNil()
  expect(ret).toBe(true)
  const ret2 = content.deleteTile(pos)
  expect(ret2).toBe(false)
})

test("inserts stage for all entities and tiles", () => {
  const entity: ProjectEntity = newProjectEntity({ name: "foo" }, { x: 0, y: 0 }, 0, 1)
  const pos = { x: 1, y: 2 }
  const tile = createProjectTile()
  tile.setTileAtStage(1, "bar")
  content.addEntity(entity)
  content.setTile(pos, tile)
  entity.insertStage = mock.fn()
  tile.insertStage = mock.fn()
  content.insertStage(2)
  expect(entity.insertStage).toHaveBeenCalledWith(2)
  expect(tile.insertStage).toHaveBeenCalledWith(2)
})

test("deletes stage for all entities and tiles", () => {
  const entity: ProjectEntity = newProjectEntity({ name: "foo" }, { x: 0, y: 0 }, 0, 1)
  const pos = { x: 1, y: 2 }
  const tile = createProjectTile()
  tile.setTileAtStage(1, "bar")
  content.addEntity(entity)
  content.setTile(pos, tile)
  entity.mergeStage = mock.fn()
  tile.mergeStage = mock.fn()
  content.mergeStage(2)
  expect(entity.mergeStage).toHaveBeenCalledWith(2)
  expect(tile.mergeStage).toHaveBeenCalledWith(2)
})

describe("tile support", () => {
  test("sets ProjectTile at position", () => {
    const pos = { x: 1, y: 2 }
    const tile = createProjectTile()
    tile.setTileAtStage(1, "concrete")

    content.setTile(pos, tile)

    expect(content.tiles.get(1, 2)).toBe(tile)
  })

  test("deletes ProjectTile at position", () => {
    const pos = { x: 1, y: 2 }
    const tile = createProjectTile()
    tile.setTileAtStage(1, "concrete")
    content.setTile(pos, tile)

    const result = content.deleteTile(pos)

    expect(content.tiles.get(1, 2)).toBeNil()
    expect(result).toBe(true)
  })

  test("returns false when deleting non-existent tile", () => {
    const pos = { x: 1, y: 2 }
    const result = content.deleteTile(pos)
    expect(result).toBe(false)
  })
})

describe("discardStage()", () => {
  test("removes entities created at discarded stage", () => {
    const entity1 = newProjectEntity({ name: "inserter" }, { x: 0, y: 0 }, 0, 1)
    const entity2 = newProjectEntity({ name: "inserter" }, { x: 1, y: 1 }, 0, 3)
    const entity3 = newProjectEntity({ name: "inserter" }, { x: 2, y: 2 }, 0, 2)
    content.addEntity(entity1)
    content.addEntity(entity2)
    content.addEntity(entity3)

    content.discardStage(3)

    expect(content.countNumEntities()).toEqual(2)
    expect(content.findCompatibleEntity("inserter", entity1.position, 0, 1)).toBe(entity1)
    expect(content.findCompatibleEntity("inserter", entity3.position, 0, 2)).toBe(entity3)
    expect(content.findCompatibleEntity("inserter", entity2.position, 0, 2)).toBeNil()
  })

  test("discards stage for remaining entities", () => {
    const entity = newProjectEntity({ name: "inserter" }, { x: 0, y: 0 }, 0, 1)
    content.addEntity(entity)
    entity.discardStage = mock.fn<typeof entity.discardStage>()

    content.discardStage(2)

    expect(entity.discardStage).toHaveBeenCalledWith(2)
  })

  test("removes empty tiles after discard", () => {
    const tile = createProjectTile()
    tile.values[2] = "concrete"
    const pos = { x: 5, y: 10 }
    content.setTile(pos, tile)

    content.discardStage(2)

    expect(content.tiles.get(pos.x, pos.y)).toBeNil()
  })
})
