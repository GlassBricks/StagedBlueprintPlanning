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

import { MutableEntityMap, newEntityMap } from "../../assembly/EntityMap"
import { AssemblyEntity, createAssemblyEntity } from "../../entity/AssemblyEntity"
import { AssemblyWireConnection } from "../../entity/AssemblyWireConnection"
import { BasicEntityInfo } from "../../entity/Entity"

let content: MutableEntityMap
before_each(() => {
  content = newEntityMap()
})

test("has", () => {
  const entity = createAssemblyEntity({ name: "foo" }, { x: 0, y: 0 }, nil, 1)
  assert.false(content.has(entity))
  content.add(entity)
  assert.true(content.has(entity))
  content.delete(entity)
  assert.false(content.has(entity))
})

test("countNumEntities", () => {
  const entity = createAssemblyEntity({ name: "foo" }, { x: 0, y: 0 }, nil, 1)
  assert.equal(0, content.countNumEntities())
  content.add(entity)
  assert.equal(1, content.countNumEntities())
  content.delete(entity)
  assert.equal(0, content.countNumEntities())
})

describe("findCompatible", () => {
  test("finds compatible if same name and direction", () => {
    const entity: AssemblyEntity = createAssemblyEntity({ name: "foo" }, { x: 0, y: 0 }, 0, 1)
    content.add(entity)

    assert.equal(entity, content.findCompatibleBasic("foo", { x: 0, y: 0 }, nil))
  })

  test("finds compatible if same category", () => {
    const entity: AssemblyEntity = createAssemblyEntity({ name: "assembling-machine-1" }, { x: 0, y: 0 }, 0, 1)
    content.add(entity)

    assert.equal(entity, content.findCompatibleBasic("assembling-machine-2", { x: 0, y: 0 }, nil))
  })

  test("not compatible", () => {
    const entity: AssemblyEntity = createAssemblyEntity({ name: "foo" }, { x: 0, y: 0 }, 0, 1)
    assert.nil(content.findCompatibleBasic("test2", entity.position, nil))
    assert.nil(content.findCompatibleBasic("foo", entity.position, defines.direction.south))
  })

  test("find compatible not basic returns same entity if is flipped underground", () => {
    const same: BasicEntityInfo = {
      name: "underground-belt",
      type: "underground-belt",
      belt_to_ground_type: "input",
      position: { x: 0, y: 0 },
      direction: defines.direction.west,
      surface: nil!,
    }
    const flipped: BasicEntityInfo = {
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

    assert.equal(assemblyEntity, content.findCompatible(same, { x: 0, y: 0 }, nil))
    assert.equal(assemblyEntity, content.findCompatible(flipped, { x: 0, y: 0 }, nil))
  })
})

describe("wire connections", () => {
  let entity1: AssemblyEntity
  let entity2: AssemblyEntity
  before_each(() => {
    entity1 = createAssemblyEntity({ name: "foo" }, { x: 0, y: 0 }, 0, 1)
    entity2 = createAssemblyEntity({ name: "foo" }, { x: 1, y: 0 }, 0, 1)
    content.add(entity1)
    content.add(entity2)
  })
  function createWireConnection(
    fromEntity: AssemblyEntity,
    toEntity: AssemblyEntity,
    wireType: defines.wire_type = defines.wire_type.red,
  ): AssemblyWireConnection {
    return {
      fromEntity,
      toEntity,
      wire: wireType,
      fromId: 0,
      toId: 0,
    }
  }

  test("getWireConnections initially empty", () => {
    assert.nil(content.getWireConnections(entity1))
  })
  test("addWireConnection shows up in getWireConnections", () => {
    const connection = createWireConnection(entity1, entity2)
    content.addWireConnection(connection)
    assert.same(newLuaSet(connection), content.getWireConnections(entity1)!.get(entity2))
    assert.same(newLuaSet(connection), content.getWireConnections(entity2)!.get(entity1))
    const connection2 = createWireConnection(entity1, entity2, defines.wire_type.green)
    content.addWireConnection(connection2)
    assert.same(newLuaSet(connection, connection2), content.getWireConnections(entity1)!.get(entity2))
    assert.same(newLuaSet(connection, connection2), content.getWireConnections(entity2)!.get(entity1))
  })
  test("does not add if identical connection is already present", () => {
    const connection = createWireConnection(entity1, entity2)
    const connection2 = createWireConnection(entity2, entity1)
    content.addWireConnection(connection)
    content.addWireConnection(connection2)
    assert.same(newLuaSet(connection), content.getWireConnections(entity1)!.get(entity2))
    assert.same(newLuaSet(connection), content.getWireConnections(entity2)!.get(entity1))
  })
  test("deleting entity removes its connections", () => {
    content.addWireConnection(createWireConnection(entity1, entity2))
    content.delete(entity1)
    assert.same(nil, content.getWireConnections(entity2) ?? nil)
  })
})
