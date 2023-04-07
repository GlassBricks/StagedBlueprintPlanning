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
import { AsmCircuitConnection } from "../../entity/AsmCircuitConnection"
import { CableAddResult, MutableAssemblyContent, newAssemblyContent } from "../../entity/AssemblyContent"
import { AssemblyEntity, createAssemblyEntity } from "../../entity/AssemblyEntity"
import { LuaEntityInfo } from "../../entity/Entity"
import { getPasteRotatableType, PasteRotatableType } from "../../entity/entity-info"
import { setupTestSurfaces } from "../assembly/Assembly-mock"
import { createRollingStocks } from "./createRollingStock"

let content: MutableAssemblyContent
before_each(() => {
  content = newAssemblyContent()
})
const surfaces = setupTestSurfaces(1)

test("countNumEntities", () => {
  const entity = createAssemblyEntity({ name: "foo" }, { x: 0, y: 0 }, nil, 1)
  expect(content.countNumEntities()).to.be(0)
  content.add(entity)
  expect(content.countNumEntities()).to.be(1)
  content.delete(entity)
  expect(content.countNumEntities()).to.be(0)
})

describe("findCompatible", () => {
  test("matches name and direction", () => {
    const entity: AssemblyEntity = createAssemblyEntity({ name: "foo" }, { x: 0, y: 0 }, nil, 1)
    content.add(entity)

    expect(content.findCompatibleByProps("foo", { x: 0, y: 0 }, defines.direction.north, 1)).to.be(entity)
  })

  test("does not match if passed stage is higher than entity's last stage", () => {
    const entity = createAssemblyEntity({ name: "foo" }, { x: 0, y: 0 }, nil, 1)
    content.add(entity)
    entity.setLastStageUnchecked(2)

    expect(content.findCompatibleByProps("foo", { x: 0, y: 0 }, defines.direction.north, 3)).to.be.nil()
  })

  test.each(["12", "21"])("if multiple matches, finds one with smallest firstStage, order %s", (o) => {
    const e1 = createAssemblyEntity({ name: "foo" }, { x: 0, y: 0 }, nil, 1)
    e1.setLastStageUnchecked(2)
    const e2 = createAssemblyEntity({ name: "foo" }, { x: 0, y: 0 }, nil, 3)
    e2.setLastStageUnchecked(4)

    if (o == "21") {
      content.add(e2)
      content.add(e1)
    } else {
      content.add(e1)
      content.add(e2)
    }

    expect(content.findCompatibleByProps("foo", { x: 0, y: 0 }, defines.direction.north, 2)).to.be(e1)
    expect(content.findCompatibleByProps("foo", { x: 0, y: 0 }, defines.direction.north, 3)).to.be(e2)
  })

  test("if direction is nil, matches any direction", () => {
    const entity: AssemblyEntity = createAssemblyEntity({ name: "foo" }, { x: 0, y: 0 }, defines.direction.east, 1)
    content.add(entity)

    expect(content.findCompatibleByProps("foo", { x: 0, y: 0 }, nil, 1)).to.be(entity)
  })

  test("matches if different name in same category", () => {
    const entity: AssemblyEntity = createAssemblyEntity({ name: "assembling-machine-1" }, { x: 0, y: 0 }, nil, 1)
    content.add(entity)

    expect(content.findCompatibleByProps("assembling-machine-2", { x: 0, y: 0 }, defines.direction.north, 1)).to.be(
      entity,
    )
  })

  test("if direction is nil, matches same category and any direction", () => {
    const entity: AssemblyEntity = createAssemblyEntity(
      { name: "assembling-machine-1" },
      { x: 0, y: 0 },
      defines.direction.east,
      1,
    )
    content.add(entity)

    expect(content.findCompatibleByProps("assembling-machine-2", { x: 0, y: 0 }, nil, 1)).to.be(entity)
  })

  test("not compatible", () => {
    const entity: AssemblyEntity = createAssemblyEntity({ name: "foo" }, { x: 0, y: 0 }, nil, 1)
    entity.setLastStageUnchecked(2)
    expect(content.findCompatibleByProps("test2", entity.position, defines.direction.north, 2)).to.be.nil()
    expect(content.findCompatibleByProps("foo", entity.position, defines.direction.south, 2)).to.be.nil()
    expect(content.findCompatibleByProps("foo", { x: 1, y: 0 }, defines.direction.north, 2)).to.be.nil()
    expect(content.findCompatibleByProps("foo", { x: 1, y: 0 }, defines.direction.north, 3)).to.be.nil()
  })
})

test("findExact", () => {
  const entity: AssemblyEntity = createAssemblyEntity({ name: "stone-furnace" }, { x: 0, y: 0 }, nil, 1)
  const luaEntity = assert(surfaces[0].create_entity({ name: "stone-furnace", position: { x: 0, y: 0 } }))
  content.add(entity)
  entity.replaceWorldEntity(2, luaEntity)
  expect(content.findExact(luaEntity, luaEntity.position, 2)).to.be(entity)
  luaEntity.teleport(1, 1)
  expect(content.findExact(luaEntity, { x: 0, y: 0 }, 2)).to.be(entity)
})

describe("findCompatibleWithLuaEntity", () => {
  test("matches simple", () => {
    const entity = createAssemblyEntity({ name: "stone-furnace" }, { x: 0, y: 0 }, nil, 1)
    const luaEntity = assert(surfaces[0].create_entity({ name: "stone-furnace", position: { x: 0, y: 0 } }))
    content.add(entity)

    expect(content.findCompatibleWithLuaEntity(luaEntity, nil, 1)).to.be(entity)
  })

  test("matches if is compatible", () => {
    const entity = createAssemblyEntity({ name: "stone-furnace" }, { x: 0, y: 0 }, nil, 1)
    const luaEntity = assert(surfaces[0].create_entity({ name: "steel-furnace", position: { x: 0, y: 0 } }))
    content.add(entity)

    expect(content.findCompatibleWithLuaEntity(luaEntity, nil, 1)).to.be(entity)
  })

  test("matches opposite direction if pasteRotatableType is rectangular", () => {
    assert(getPasteRotatableType("boiler") == PasteRotatableType.RectangularOrStraightRail)
    const entity = createAssemblyEntity({ name: "boiler" }, { x: 0.5, y: 0 }, defines.direction.north, 1)

    const luaEntity = assert(
      surfaces[0].create_entity({ name: "boiler", position: { x: 0.5, y: 0 }, direction: defines.direction.south }),
    )
    content.add(entity)

    expect(content.findCompatibleWithLuaEntity(luaEntity, nil, 1)).to.be(entity)
  })

  test("matches any direction if pasteRotatableType is square", () => {
    assert(getPasteRotatableType("assembling-machine-1") == PasteRotatableType.AnyDirection)

    const entity = createAssemblyEntity(
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

    expect(content.findCompatibleWithLuaEntity(luaEntity, nil, 1)).to.be(entity)
  })

  test("matches if is flipped underground", () => {
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
    const assemblyEntity = createAssemblyEntity(
      { name: "underground-belt", type: "input" },
      {
        x: 0,
        y: 0,
      },
      defines.direction.west,
      1,
    )
    content.add(assemblyEntity)

    expect(content.findCompatibleWithLuaEntity(same, nil, 1)).to.be(assemblyEntity)
    expect(content.findCompatibleWithLuaEntity(flipped, nil, 1)).to.be(assemblyEntity)
  })

  test("rolling stock only matches if is exact same entity", () => {
    const entity = createAssemblyEntity({ name: "locomotive" }, { x: 0, y: 0 }, nil, 1)
    const [a1, a2] = createRollingStocks(surfaces[0], "locomotive", "locomotive")
    content.add(entity)
    entity.replaceWorldEntity(1, a1)

    expect(content.findCompatibleWithLuaEntity(a1, nil, 1)).to.be(entity)
    expect(content.findCompatibleWithLuaEntity(a2, nil, 1)).to.be.nil()
    expect(content.findCompatibleWithLuaEntity(a1, nil, 2)).to.be(entity)
  })

  test("rails at same position but opposite direction are treated different only if diagonal", () => {
    const entity1: AssemblyEntity = createAssemblyEntity(
      { name: "straight-rail" },
      { x: 1, y: 1 },
      defines.direction.northeast,
      1,
    )
    const entity2: AssemblyEntity = createAssemblyEntity(
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
    // diagonal, should have no match
    expect(content.findCompatibleWithLuaEntity(luaEntity1, nil, 1)).to.be(nil)
    // orthogonal, should have match
    expect(content.findCompatibleWithLuaEntity(luaEntity2, nil, 1)).to.be(entity2)
  })
})

test("changePosition", () => {
  const entity: AssemblyEntity = createAssemblyEntity({ name: "foo" }, { x: 0, y: 0 }, nil, 1)
  content.add(entity)
  content.changePosition(entity, { x: 1, y: 1 })
  expect(entity.position.x).to.be(1)
  expect(entity.position.y).to.be(1)
  expect(content.findCompatibleByProps("foo", { x: 1, y: 1 }, defines.direction.north, 1)).to.be(entity)
})

describe("connections", () => {
  let entity1: AssemblyEntity
  let entity2: AssemblyEntity
  function makeAssemblyEntity(n: number): AssemblyEntity {
    return createAssemblyEntity({ name: "foo" }, { x: n, y: 0 }, nil, 1)
  }
  before_each(() => {
    entity1 = makeAssemblyEntity(1)
    entity2 = makeAssemblyEntity(2)
    content.add(entity1)
    content.add(entity2)
  })
  describe("circuit connections", () => {
    function createCircuitConnection(
      fromEntity: AssemblyEntity,
      toEntity: AssemblyEntity,
      wireType: defines.wire_type = defines.wire_type.red,
    ): AsmCircuitConnection {
      return {
        fromEntity,
        toEntity,
        wire: wireType,
        fromId: 0,
        toId: 0,
      }
    }

    test("getCircuitConnections initially empty", () => {
      expect(content.getCircuitConnections(entity1)).to.be.nil()
    })

    test("addCircuitConnection shows up in getCircuitConnections", () => {
      const connection = createCircuitConnection(entity1, entity2)
      content.addCircuitConnection(connection)
      expect(content.getCircuitConnections(entity1)!.get(entity2)).to.equal(newLuaSet(connection))
      expect(content.getCircuitConnections(entity2)!.get(entity1)).to.equal(newLuaSet(connection))
      const connection2 = createCircuitConnection(entity1, entity2, defines.wire_type.green)
      content.addCircuitConnection(connection2)
      expect(content.getCircuitConnections(entity1)!.get(entity2)).to.equal(newLuaSet(connection, connection2))
      expect(content.getCircuitConnections(entity2)!.get(entity1)).to.equal(newLuaSet(connection, connection2))
    })

    test("does not add if identical connection is already present", () => {
      const connection = createCircuitConnection(entity1, entity2)
      const connection2 = createCircuitConnection(entity2, entity1)
      content.addCircuitConnection(connection)
      content.addCircuitConnection(connection2)
      expect(content.getCircuitConnections(entity1)!.get(entity2)).to.equal(newLuaSet(connection))
      expect(content.getCircuitConnections(entity2)!.get(entity1)).to.equal(newLuaSet(connection))
    })

    test("removeCircuitConnection removes connection", () => {
      const connection = createCircuitConnection(entity1, entity2)
      content.addCircuitConnection(connection)
      content.removeCircuitConnection(connection)

      expect(content.getCircuitConnections(entity1)).to.be.nil()
      expect(content.getCircuitConnections(entity2)).to.be.nil()
    })

    test("deleting entity removes its connections", () => {
      content.addCircuitConnection(createCircuitConnection(entity1, entity2))
      content.delete(entity1)
      expect(content.getCircuitConnections(entity1) ?? nil).to.equal(nil)
      expect(content.getCircuitConnections(entity2) ?? nil).to.equal(nil)
    })
  })

  describe("cable connections", () => {
    test("getCableConnections initially empty", () => {
      expect(content.getCableConnections(entity1)).to.be.nil()
    })

    test("addCableConnection shows up in getCableConnections", () => {
      expect(content.addCableConnection(entity1, entity2)).to.be(CableAddResult.Added)
      expect(content.getCableConnections(entity1)!).to.equal(newLuaSet(entity2))
      expect(content.getCableConnections(entity2)!).to.equal(newLuaSet(entity1))
    })

    test("removeCableConnection removes connection", () => {
      content.addCableConnection(entity1, entity2)
      content.removeCableConnection(entity1, entity2)

      expect(content.getCableConnections(entity1) ?? nil).to.equal(nil)
      expect(content.getCableConnections(entity2) ?? nil).to.equal(nil)
    })

    test("deleting entity removes its connections", () => {
      content.addCableConnection(entity1, entity2)
      content.delete(entity1)
      expect(content.getCableConnections(entity1) ?? nil).to.equal(nil)
      expect(content.getCableConnections(entity2) ?? nil).to.equal(nil)
    })

    test("can't add cable to itself", () => {
      expect(content.addCableConnection(entity1, entity1)).to.be(CableAddResult.Error)
    })

    test("adding same cable twice does nothing", () => {
      expect(content.addCableConnection(entity1, entity2)).to.be(CableAddResult.Added)
      expect(content.addCableConnection(entity1, entity2)).to.be(CableAddResult.AlreadyExists)
    })

    test("won't add if max connections is reached", () => {
      for (let i = 3; i < 3 + 5; i++) {
        const entity = makeAssemblyEntity(i)
        content.add(entity)
        expect(content.addCableConnection(entity1, entity)).to.be(CableAddResult.Added)
      }
      expect(content.addCableConnection(entity1, entity2)).to.be(CableAddResult.MaxConnectionsReached)
    })
  })
})
