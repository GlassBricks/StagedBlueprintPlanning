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

import { AssemblyEntityConnections } from "../../assembly/EntityMap"
import { createWireHandler, WireUpdater } from "../../assembly/WireHandler"
import { AssemblyEntity, createAssemblyEntity } from "../../entity/AssemblyEntity"
import { AssemblyWireConnection } from "../../entity/AssemblyWireConnection"
import { clearTestArea } from "../area"

let luaEntity1: LuaEntity
let luaEntity2: LuaEntity
let entity1: AssemblyEntity
let entity2: AssemblyEntity
let handler: WireUpdater
before_each(() => {
  const area = clearTestArea()
  luaEntity1 = area.surface.create_entity({ name: "arithmetic-combinator", position: { x: 5.5, y: 6 } })!
  luaEntity2 = area.surface.create_entity({ name: "arithmetic-combinator", position: { x: 7.5, y: 6 } })!
  entity1 = createAssemblyEntity({ name: "arithmetic-combinator" }, { x: 5.5, y: 6 }, nil, 1)
  entity2 = createAssemblyEntity({ name: "arithmetic-combinator" }, { x: 7.5, y: 6 }, nil, 1)
  entity1.replaceWorldEntity(1, luaEntity1)
  entity2.replaceWorldEntity(1, luaEntity2)

  handler = createWireHandler()
})

function addExtraWires() {
  luaEntity1.connect_neighbour({
    target_entity: luaEntity2,
    wire: defines.wire_type.red,
    source_circuit_id: defines.circuit_connector_id.combinator_input,
    target_circuit_id: defines.circuit_connector_id.combinator_output,
  })
  luaEntity2.connect_neighbour({
    target_entity: luaEntity1,
    wire: defines.wire_type.green,
    source_circuit_id: defines.circuit_connector_id.combinator_input,
    target_circuit_id: defines.circuit_connector_id.combinator_output,
  })
}
function getConnections(): AssemblyEntityConnections {
  const result = new LuaMap<AssemblyEntity, LuaSet<AssemblyWireConnection>>()
  result.set(
    entity2,
    newLuaSet({
      fromEntity: entity1,
      toEntity: entity2,
      wire: defines.wire_type.red,
      fromId: defines.circuit_connector_id.combinator_input,
      toId: defines.circuit_connector_id.combinator_output,
    }),
  )
  return result
}
function assertWireMatches(): void {
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

function luaEntityToAssemblyEntity(luaEntity: LuaEntity): AssemblyEntity | nil {
  if (luaEntity === luaEntity1) return entity1
  if (luaEntity === luaEntity2) return entity2
  return nil
}

describe("update circuit wires", () => {
  test("can remove wires", () => {
    addExtraWires()
    handler.updateWireConnections(nil, 1, luaEntity1, luaEntityToAssemblyEntity)
    assert.same([], luaEntity1.circuit_connection_definitions ?? [])
    assert.same([], luaEntity2.circuit_connection_definitions ?? [])
  })
  test("can add wires", () => {
    handler.updateWireConnections(getConnections(), 1, luaEntity1, luaEntityToAssemblyEntity)
    assertWireMatches()
  })
  test("can update wires", () => {
    addExtraWires()
    handler.updateWireConnections(getConnections(), 1, luaEntity1, luaEntityToAssemblyEntity)
    assertWireMatches()
  })
})
