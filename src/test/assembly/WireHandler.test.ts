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

import { createMockAssemblyContent } from "../../assembly/Assembly-mock"
import { AssemblyContent } from "../../assembly/AssemblyContent"
import { DefaultWireHandler, WireHandler } from "../../assembly/WireHandler"
import { AssemblyEntity, createAssemblyEntity } from "../../entity/AssemblyEntity"
import { AssemblyWireConnection } from "../../entity/AssemblyWireConnection"
import { clearTestArea } from "../area"

let assembly: AssemblyContent
let luaEntity1: LuaEntity
let luaEntity2: LuaEntity
let entity1: AssemblyEntity
let entity2: AssemblyEntity

const handler: WireHandler = DefaultWireHandler

before_each(() => {
  assembly = createMockAssemblyContent(3)
  const area = clearTestArea()
  luaEntity1 = area.surface.create_entity({ name: "arithmetic-combinator", position: { x: 5.5, y: 6 } })!
  luaEntity2 = area.surface.create_entity({ name: "arithmetic-combinator", position: { x: 7.5, y: 6 } })!
  entity1 = createAssemblyEntity({ name: "arithmetic-combinator" }, { x: 5.5, y: 6 }, nil, 1)
  entity2 = createAssemblyEntity({ name: "arithmetic-combinator" }, { x: 7.5, y: 6 }, nil, 1)
  entity1.replaceWorldEntity(1, luaEntity1)
  entity2.replaceWorldEntity(1, luaEntity2)
  assembly.content.add(entity1)
  assembly.content.add(entity2)
})

function addWire1(): void {
  luaEntity1.connect_neighbour({
    target_entity: luaEntity2,
    wire: defines.wire_type.red,
    source_circuit_id: defines.circuit_connector_id.combinator_input,
    target_circuit_id: defines.circuit_connector_id.combinator_output,
  })
}
function getExpectedWire1(): AssemblyWireConnection {
  return {
    fromEntity: entity1,
    toEntity: entity2,
    wire: defines.wire_type.red,
    fromId: defines.circuit_connector_id.combinator_input,
    toId: defines.circuit_connector_id.combinator_output,
  }
}
function addWire2(): void {
  luaEntity2.connect_neighbour({
    target_entity: luaEntity1,
    wire: defines.wire_type.green,
    source_circuit_id: defines.circuit_connector_id.combinator_input,
    target_circuit_id: defines.circuit_connector_id.combinator_output,
  })
}
function getExpectedWire2(): AssemblyWireConnection {
  return {
    fromEntity: entity1,
    toEntity: entity2,
    wire: defines.wire_type.green,
    fromId: defines.circuit_connector_id.combinator_output,
    toId: defines.circuit_connector_id.combinator_input,
  }
}
function addWire3(): void {
  // same as wire 1, but green
  luaEntity1.connect_neighbour({
    target_entity: luaEntity2,
    wire: defines.wire_type.green,
    source_circuit_id: defines.circuit_connector_id.combinator_input,
    target_circuit_id: defines.circuit_connector_id.combinator_output,
  })
}
function getExpectedWire3(): AssemblyWireConnection {
  return {
    fromEntity: entity1,
    toEntity: entity2,
    wire: defines.wire_type.green,
    fromId: defines.circuit_connector_id.combinator_input,
    toId: defines.circuit_connector_id.combinator_output,
  }
}

describe("update wire connections", () => {
  test("can remove wires", () => {
    addWire1()
    addWire2()
    handler.updateWireConnections(assembly, entity1, 1, luaEntity1)
    assert.same([], luaEntity1.circuit_connection_definitions ?? [])
    assert.same([], luaEntity2.circuit_connection_definitions ?? [])
  })
  function assertWire1Matches(): void {
    assert.same(
      [
        {
          target_entity: luaEntity2,
          wire: defines.wire_type.red,
          source_circuit_id: defines.circuit_connector_id.combinator_input,
          target_circuit_id: defines.circuit_connector_id.combinator_output,
        } as CircuitConnectionDefinition,
      ],
      luaEntity1.circuit_connection_definitions,
    )
  }
  test("can add wires", () => {
    assembly.content.addWireConnection(getExpectedWire1())
    handler.updateWireConnections(assembly, entity1, 1, luaEntity1)
    assertWire1Matches()
  })
  test("can update wires", () => {
    addWire1()
    addWire2()
    assembly.content.addWireConnection(getExpectedWire1())
    handler.updateWireConnections(assembly, entity1, 1, luaEntity1)
    assertWire1Matches()
  })
})

describe("getWireConnectionDiff", () => {
  test.each<[number[], number[], string]>([
    [[1, 2], [1, 2], "no change"],
    [[1], [1, 2], "add"],
    [[1, 2], [1], "remove"],
    [[1], [2], "add and remove"],
    [[1, 2], [], "remove 2"],
    [[1], [1, 3], "add different"],
    [[1, 2], [1, 3], "mixed"],
  ])("diff: %s -> %s: %s", (existing, world) => {
    for (const number of existing)
      assembly.content.addWireConnection([getExpectedWire1, getExpectedWire2, getExpectedWire3][number - 1]())
    for (const number of world) [addWire1, addWire2, addWire3][number - 1]()
    const diff = handler.getWireConnectionDiff(assembly, entity1, 1, luaEntity1)

    const wires = [getExpectedWire1(), getExpectedWire2(), getExpectedWire3()]
    const added = world.filter((n) => !existing.includes(n)).map((n) => wires[n - 1])
    const removed = existing.filter((n) => !world.includes(n)).map((n) => wires[n - 1])
    assert.same(added, diff[0])
    assert.same(removed, diff[1])
  })
})
