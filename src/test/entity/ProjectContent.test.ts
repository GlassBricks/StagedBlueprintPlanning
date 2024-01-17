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

import expect from "tstl-expect"
import { ProjectCircuitConnection } from "../../entity/circuit-connection"
import { LuaEntityInfo } from "../../entity/Entity"
import { getPrototypeRotationType, RotationType } from "../../entity/entity-prototype-info"
import { _assertCorrect, CableAddResult, MutableProjectContent, newProjectContent } from "../../entity/ProjectContent"
import { createProjectEntityNoCopy, ProjectEntity } from "../../entity/ProjectEntity"
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

test("countNumEntities", () => {
  const entity = createProjectEntityNoCopy({ name: "foo" }, { x: 0, y: 0 }, nil, 1)
  expect(content.countNumEntities()).toBe(0)
  content.add(entity)
  expect(content.countNumEntities()).toBe(1)
  content.delete(entity)
  expect(content.countNumEntities()).toBe(0)
})

describe("findCompatible", () => {
  test("matches name and direction", () => {
    const entity: ProjectEntity = createProjectEntityNoCopy({ name: "foo" }, { x: 0, y: 0 }, nil, 1)
    content.add(entity)

    expect(content.findCompatibleByProps("foo", { x: 0, y: 0 }, defines.direction.north, 1)).toBe(entity)
  })

  test("does not match if passed stage is higher than entity's last stage", () => {
    const entity = createProjectEntityNoCopy({ name: "foo" }, { x: 0, y: 0 }, nil, 1)
    content.add(entity)
    entity.setLastStageUnchecked(2)

    expect(content.findCompatibleByProps("foo", { x: 0, y: 0 }, defines.direction.north, 3)).toBeNil()
  })

  test.each(["12", "21"])("if multiple matches, finds one with smallest firstStage, order %s", (o) => {
    const e1 = createProjectEntityNoCopy({ name: "foo" }, { x: 0, y: 0 }, nil, 1)
    e1.setLastStageUnchecked(2)
    const e2 = createProjectEntityNoCopy({ name: "foo" }, { x: 0, y: 0 }, nil, 3)
    e2.setLastStageUnchecked(4)

    if (o == "21") {
      content.add(e2)
      content.add(e1)
    } else {
      content.add(e1)
      content.add(e2)
    }

    expect(content.findCompatibleByProps("foo", { x: 0, y: 0 }, defines.direction.north, 2)).toBe(e1)
    expect(content.findCompatibleByProps("foo", { x: 0, y: 0 }, defines.direction.north, 3)).toBe(e2)
  })

  test("if direction is nil, matches any direction", () => {
    const entity: ProjectEntity = createProjectEntityNoCopy({ name: "foo" }, { x: 0, y: 0 }, defines.direction.east, 1)
    content.add(entity)

    expect(content.findCompatibleByProps("foo", { x: 0, y: 0 }, nil, 1)).toBe(entity)
  })

  test("matches if different name in same category", () => {
    const entity: ProjectEntity = createProjectEntityNoCopy({ name: "assembling-machine-1" }, { x: 0, y: 0 }, nil, 1)
    content.add(entity)

    expect(content.findCompatibleByProps("assembling-machine-2", { x: 0, y: 0 }, defines.direction.north, 1)).toBe(
      entity,
    )
  })

  test("if direction is nil, matches same category and any direction", () => {
    const entity: ProjectEntity = createProjectEntityNoCopy(
      { name: "assembling-machine-1" },
      { x: 0, y: 0 },
      defines.direction.east,
      1,
    )
    content.add(entity)

    expect(content.findCompatibleByProps("assembling-machine-2", { x: 0, y: 0 }, nil, 1)).toBe(entity)
  })

  test("not compatible", () => {
    const entity: ProjectEntity = createProjectEntityNoCopy({ name: "foo" }, { x: 0, y: 0 }, nil, 1)
    entity.setLastStageUnchecked(2)
    expect(content.findCompatibleByProps("test2", entity.position, defines.direction.north, 2)).toBeNil()
    expect(content.findCompatibleByProps("foo", entity.position, defines.direction.south, 2)).toBeNil()
    expect(content.findCompatibleByProps("foo", { x: 1, y: 0 }, defines.direction.north, 2)).toBeNil()
    expect(content.findCompatibleByProps("foo", { x: 1, y: 0 }, defines.direction.north, 3)).toBeNil()
  })
})

test("findExact", () => {
  const entity: ProjectEntity = createProjectEntityNoCopy({ name: "stone-furnace" }, { x: 0, y: 0 }, nil, 1)
  const luaEntity = assert(surfaces[0].create_entity({ name: "stone-furnace", position: { x: 0, y: 0 } }))
  content.add(entity)
  entity.replaceWorldEntity(2, luaEntity)
  expect(content.findExact(luaEntity, luaEntity.position, 2)).toBe(entity)
  luaEntity.teleport(1, 1)
  expect(content.findExact(luaEntity, { x: 0, y: 0 }, 2)).toBe(entity)
})

describe("findCompatibleWithLuaEntity", () => {
  test("matches simple", () => {
    const entity = createProjectEntityNoCopy({ name: "stone-furnace" }, { x: 0, y: 0 }, nil, 1)
    const luaEntity = assert(surfaces[0].create_entity({ name: "stone-furnace", position: { x: 0, y: 0 } }))
    content.add(entity)

    expect(content.findCompatibleWithLuaEntity(luaEntity, nil, 1)).toBe(entity)
  })

  test("matches if is compatible", () => {
    const entity = createProjectEntityNoCopy({ name: "stone-furnace" }, { x: 0, y: 0 }, nil, 1)
    const luaEntity = assert(surfaces[0].create_entity({ name: "steel-furnace", position: { x: 0, y: 0 } }))
    content.add(entity)

    expect(content.findCompatibleWithLuaEntity(luaEntity, nil, 1)).toBe(entity)
  })

  test("matches opposite direction if pasteRotatableType is rectangular", () => {
    assert(getPrototypeRotationType("boiler") == RotationType.Flippable)
    const entity = createProjectEntityNoCopy({ name: "boiler" }, { x: 0.5, y: 0 }, defines.direction.north, 1)

    const luaEntity = assert(
      surfaces[0].create_entity({ name: "boiler", position: { x: 0.5, y: 0 }, direction: defines.direction.south }),
    )
    content.add(entity)

    expect(content.findCompatibleWithLuaEntity(luaEntity, nil, 1)).toBe(entity)
  })

  test("matches any direction if pasteRotatableType is square", () => {
    assert(getPrototypeRotationType("assembling-machine-1") == RotationType.AnyDirection)

    const entity = createProjectEntityNoCopy(
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
    content.add(entity)

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
    const projectEntity = createProjectEntityNoCopy(
      { name: "underground-belt", type: "input" },
      {
        x: 0,
        y: 0,
      },
      defines.direction.west,
      1,
    )
    content.add(projectEntity)

    expect(content.findCompatibleWithLuaEntity(same, nil, 1)).toBe(projectEntity)
    expect(content.findCompatibleWithLuaEntity(flipped, nil, 1)).toBe(projectEntity)
  })

  test("rolling stock only matches if is exact same entity", () => {
    const entity = createProjectEntityNoCopy({ name: "locomotive" }, { x: 0, y: 0 }, nil, 1)
    const [a1, a2] = createRollingStocks(surfaces[0], "locomotive", "locomotive")
    content.add(entity)
    entity.replaceWorldEntity(1, a1)

    expect(content.findCompatibleWithLuaEntity(a1, nil, 1)).toBe(entity)
    expect(content.findCompatibleWithLuaEntity(a2, nil, 1)).toBeNil()
    expect(content.findCompatibleWithLuaEntity(a1, nil, 2)).toBe(entity)
  })

  test("rails at same position but opposite direction are treated different only if diagonal", () => {
    const entity1: ProjectEntity = createProjectEntityNoCopy(
      { name: "straight-rail" },
      { x: 1, y: 1 },
      defines.direction.northeast,
      1,
    )
    const entity2: ProjectEntity = createProjectEntityNoCopy(
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
    content.add(entity1)
    content.add(entity2)
    // diagonal, so should have no match
    expect(content.findCompatibleWithLuaEntity(luaEntity1, nil, 1)).toBe(nil)
    // orthogonal, so should have a match
    expect(content.findCompatibleWithLuaEntity(luaEntity2, nil, 1)).toBe(entity2)
  })
})

test("changePosition", () => {
  const entity: ProjectEntity = createProjectEntityNoCopy({ name: "foo" }, { x: 0, y: 0 }, nil, 1)
  content.add(entity)
  content.changePosition(entity, { x: 1, y: 1 })
  expect(entity.position.x).toBe(1)
  expect(entity.position.y).toBe(1)
  expect(content.findCompatibleByProps("foo", { x: 1, y: 1 }, defines.direction.north, 1)).toBe(entity)
})

describe("connections", () => {
  let entity1: ProjectEntity
  let entity2: ProjectEntity
  function makeProjectEntity(n: number): ProjectEntity {
    return createProjectEntityNoCopy({ name: "foo" }, { x: n, y: 0 }, nil, 1)
  }
  before_each(() => {
    entity1 = makeProjectEntity(1)
    entity2 = makeProjectEntity(2)
    content.add(entity1)
    content.add(entity2)
  })
  describe("circuit connections", () => {
    function createCircuitConnection(
      fromEntity: ProjectEntity,
      toEntity: ProjectEntity,
      wireType: defines.wire_type = defines.wire_type.red,
    ): ProjectCircuitConnection {
      return {
        fromEntity,
        toEntity,
        wire: wireType,
        fromId: 0,
        toId: 0,
      }
    }

    test("getCircuitConnections initially empty", () => {
      expect(content.getCircuitConnections(entity1)).toBeNil()
    })

    test("addCircuitConnection shows up in getCircuitConnections", () => {
      const connection = createCircuitConnection(entity1, entity2)
      content.addCircuitConnection(connection)
      expect(content.getCircuitConnections(entity1)!.get(entity2)).toEqual(newLuaSet(connection))
      expect(content.getCircuitConnections(entity2)!.get(entity1)).toEqual(newLuaSet(connection))
      const connection2 = createCircuitConnection(entity1, entity2, defines.wire_type.green)
      content.addCircuitConnection(connection2)
      expect(content.getCircuitConnections(entity1)!.get(entity2)).toEqual(newLuaSet(connection, connection2))
      expect(content.getCircuitConnections(entity2)!.get(entity1)).toEqual(newLuaSet(connection, connection2))
    })

    test("does not add if identical connection is already present", () => {
      const connection = createCircuitConnection(entity1, entity2)
      const connection2 = createCircuitConnection(entity2, entity1)
      content.addCircuitConnection(connection)
      content.addCircuitConnection(connection2)
      expect(content.getCircuitConnections(entity1)!.get(entity2)).toEqual(newLuaSet(connection))
      expect(content.getCircuitConnections(entity2)!.get(entity1)).toEqual(newLuaSet(connection))
    })

    test("removeCircuitConnection removes connection", () => {
      const connection = createCircuitConnection(entity1, entity2)
      content.addCircuitConnection(connection)
      content.removeCircuitConnection(connection)

      expect(content.getCircuitConnections(entity1)).toBeNil()
      expect(content.getCircuitConnections(entity2)).toBeNil()
    })

    test("deleting entity removes its connections", () => {
      content.addCircuitConnection(createCircuitConnection(entity1, entity2))
      content.delete(entity1)
      expect(content.getCircuitConnections(entity1) ?? nil).toEqual(nil)
      expect(content.getCircuitConnections(entity2) ?? nil).toEqual(nil)
    })
  })

  describe("cable connections", () => {
    test("getCableConnections initially empty", () => {
      expect(content.getCableConnections(entity1)).toBeNil()
    })

    test("addCableConnection shows up in getCableConnections", () => {
      expect(content.addCableConnection(entity1, entity2)).toBe(CableAddResult.Added)
      expect(content.getCableConnections(entity1)!).toEqual(newLuaSet(entity2))
      expect(content.getCableConnections(entity2)!).toEqual(newLuaSet(entity1))
    })

    test("removeCableConnection removes connection", () => {
      content.addCableConnection(entity1, entity2)
      content.removeCableConnection(entity2, entity1)

      expect(content.getCableConnections(entity1) ?? nil).toEqual(nil)
      expect(content.getCableConnections(entity2) ?? nil).toEqual(nil)
    })

    test("deleting entity removes its connections", () => {
      content.addCableConnection(entity1, entity2)
      content.delete(entity1)
      expect(content.getCableConnections(entity1) ?? nil).toEqual(nil)
      expect(content.getCableConnections(entity2) ?? nil).toEqual(nil)
    })

    test("can't add cable to itself", () => {
      expect(content.addCableConnection(entity1, entity1)).toBe(CableAddResult.Error)
    })

    test("adding same cable twice does nothing", () => {
      expect(content.addCableConnection(entity1, entity2)).toBe(CableAddResult.Added)
      expect(content.addCableConnection(entity1, entity2)).toBe(CableAddResult.AlreadyExists)
    })

    test("won't add if max connections is reached", () => {
      for (let i = 3; i < 3 + 5; i++) {
        const entity = makeProjectEntity(i)
        content.add(entity)
        expect(content.addCableConnection(entity1, entity)).toBe(CableAddResult.Added)
      }
      expect(content.addCableConnection(entity1, entity2)).toBe(CableAddResult.MaxConnectionsReached)
    })
  })
})
