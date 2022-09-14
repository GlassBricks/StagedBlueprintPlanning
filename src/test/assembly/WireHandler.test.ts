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

import { AssemblyContent } from "../../assembly/AssemblyContent"
import { CableAddResult } from "../../assembly/EntityMap"
import { DefaultWireHandler, WireHandler } from "../../assembly/WireHandler"
import { AsmCircuitConnection } from "../../entity/AsmCircuitConnection"
import { AssemblyEntity, createAssemblyEntity } from "../../entity/AssemblyEntity"
import { shallowCompare } from "../../lib"
import { createMockAssemblyContent } from "./Assembly-mock"

let assembly: AssemblyContent
let surface: LuaSurface

before_each(() => {
  assembly = createMockAssemblyContent(3)
  surface = game.surfaces[1]
  surface.find_entities().forEach((e) => e.destroy())
})

const handler: WireHandler = DefaultWireHandler

describe("circuit wires", () => {
  let luaEntity1: LuaEntity
  let luaEntity2: LuaEntity
  let entity1: AssemblyEntity
  let entity2: AssemblyEntity
  before_each(() => {
    luaEntity1 = surface.create_entity({ name: "arithmetic-combinator", position: { x: 5.5, y: 6 } })!
    luaEntity2 = surface.create_entity({ name: "arithmetic-combinator", position: { x: 7.5, y: 6 } })!
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
  function getExpectedWire1(): AsmCircuitConnection {
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
  function getExpectedWire2(): AsmCircuitConnection {
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
  function getExpectedWire3(): AsmCircuitConnection {
    return {
      fromEntity: entity1,
      toEntity: entity2,
      wire: defines.wire_type.green,
      fromId: defines.circuit_connector_id.combinator_input,
      toId: defines.circuit_connector_id.combinator_output,
    }
  }

  describe("update circuit connections", () => {
    test("can remove wires", () => {
      addWire1()
      addWire2()
      handler.updateWireConnections(assembly, entity1, 1)
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
      assembly.content.addCircuitConnection(getExpectedWire1())
      handler.updateWireConnections(assembly, entity1, 1)
      assertWire1Matches()
    })
    test("can update wires", () => {
      addWire1()
      addWire2()
      assembly.content.addCircuitConnection(getExpectedWire1())
      handler.updateWireConnections(assembly, entity1, 1)
      assertWire1Matches()
    })
    test("ignores entities not in the assembly", () => {
      addWire1() // entity1 -> entity2
      assembly.content.delete(entity2)
      handler.updateWireConnections(assembly, entity1, 1)
      // wire should still be there
      assertWire1Matches()
    })
  })

  describe("saving wire connections", () => {
    test.each<[number[], number[], string]>([
      [[1, 2], [1, 2], "no change"],
      [[1], [1, 2], "add"],
      [[], [1, 2], "add2"],
      [[1, 2], [1], "remove"],
      [[1], [2], "add and remove"],
      [[1, 2], [], "remove 2"],
      [[1], [1, 3], "add different"],
      [[1, 2], [1, 3], "mixed"],
    ])("diff: %s -> %s: %s", (existing, world) => {
      const wires = [getExpectedWire1(), getExpectedWire2(), getExpectedWire3()]
      for (const number of existing) assembly.content.addCircuitConnection(wires[number - 1])
      for (const number of world) [addWire1, addWire2, addWire3][number - 1]()

      const [hasDiff, maxConnectionsReached] = handler.saveWireConnections(assembly, entity1, 1)
      assert.equal(!shallowCompare(existing, world), hasDiff)
      assert.nil(maxConnectionsReached) // not relevant for circuit wires

      const connections = assembly.content.getCircuitConnections(entity1)?.get(entity2)
      assert.same(
        world.map((number) => wires[number - 1]),
        Object.keys(connections ?? {}),
      )
    })
  })
})

describe("cable connections", () => {
  let luaEntity1: LuaEntity
  let luaEntity2: LuaEntity
  let entity1: AssemblyEntity
  let entity2: AssemblyEntity
  let luaEntity3: LuaEntity
  let entity3: AssemblyEntity
  function setup(n: number) {
    const pos = { x: 5.5 + n, y: 5.5 + n }
    const luaEntity = surface.create_entity({ name: "medium-electric-pole", position: pos })!
    luaEntity.disconnect_neighbour()
    const entity = createAssemblyEntity({ name: "medium-electric-pole" }, pos, nil, 1)
    entity.replaceWorldEntity(1, luaEntity)
    assembly.content.add(entity)
    return { luaEntity, entity }
  }
  before_each(() => {
    ;({ luaEntity: luaEntity1, entity: entity1 } = setup(1))
    ;({ luaEntity: luaEntity2, entity: entity2 } = setup(2))
    ;({ luaEntity: luaEntity3, entity: entity3 } = setup(3))
  })

  test("can add cables", () => {
    assembly.content.addCableConnection(entity1, entity2)
    handler.updateWireConnections(assembly, entity1, 1)
    assert.same([luaEntity2], (luaEntity1.neighbours as { copper: LuaEntity[] }).copper)
    assert.same([luaEntity1], (luaEntity2.neighbours as { copper: LuaEntity[] }).copper)
  })

  test("can remove cables", () => {
    luaEntity1.connect_neighbour(luaEntity2)
    handler.updateWireConnections(assembly, entity1, 1)
    assert.same([], (luaEntity1.neighbours as { copper: LuaEntity[] }).copper)
    assert.same([], (luaEntity2.neighbours as { copper: LuaEntity[] }).copper)
  })

  test("can update cables", () => {
    assembly.content.addCableConnection(entity1, entity2) // 1-2
    luaEntity2.connect_neighbour(luaEntity3)
    handler.updateWireConnections(assembly, entity2, 1)
    // should now only have 1-2
    assert.same([luaEntity2], (luaEntity1.neighbours as { copper: LuaEntity[] }).copper)
    assert.same([luaEntity1], (luaEntity2.neighbours as { copper: LuaEntity[] }).copper)
    assert.same([], (luaEntity3.neighbours as { copper: LuaEntity[] }).copper)
  })

  test("ignores entities not in the assembly", () => {
    luaEntity1.connect_neighbour(luaEntity2)
    assembly.content.delete(entity2)
    handler.updateWireConnections(assembly, entity1, 1)
    // cable should still be there
    assert.same([luaEntity2], (luaEntity1.neighbours as { copper: LuaEntity[] }).copper)
  })

  describe("saving cables", () => {
    test.each<[number[], number[], string]>([
      [[1, 2], [1, 2], "no change"],
      [[1], [1, 2], "add"],
      [[], [1, 2], "add2"],
      [[1, 2], [1], "remove"],
      [[1], [2], "add and remove"],
      [[1, 2], [], "remove 2"],
    ])("diff: %s -> %s: %s", (existing, world) => {
      if (existing.includes(1)) assembly.content.addCableConnection(entity1, entity2)
      if (existing.includes(2)) assembly.content.addCableConnection(entity2, entity3)
      if (world.includes(1)) luaEntity1.connect_neighbour(luaEntity2)
      if (world.includes(2)) luaEntity2.connect_neighbour(luaEntity3)

      const [hasDiff, maxConnectionsReached] = handler.saveWireConnections(assembly, entity2, 1)
      assert.equal(!shallowCompare(existing, world), hasDiff)
      assert.nil(maxConnectionsReached)

      const connections = assembly.content.getCableConnections(entity2)
      assert.same(
        world.map((number) => [entity1, entity3][number - 1]),
        Object.keys(connections ?? {}),
      )
    })

    test("max connections reached", () => {
      // max connections is 5
      for (let i = 0; i < 5; i++) {
        const entity = createAssemblyEntity(
          { name: "medium-electric-pole" },
          {
            x: 5.5 + i,
            y: 5.5 + i,
          },
          nil,
          1,
        )
        // no lua entity
        assembly.content.add(entity)
        const result = assembly.content.addCableConnection(entity1, entity)
        assert.equal(CableAddResult.Added, result)
      }
      luaEntity1.connect_neighbour(luaEntity2)
      // saving should fail
      {
        const [hasDiff, maxConnectionsReached] = handler.saveWireConnections(assembly, entity1, 1)
        assert.true(hasDiff)
        assert.true(maxConnectionsReached)
        assert.nil(assembly.content.getCableConnections(entity2))
        assert.false(assembly.content.getCableConnections(entity1)!.has(entity2))
      }
      {
        const [hasDiff, maxConnectionsReached] = handler.saveWireConnections(assembly, entity2, 1)
        assert.true(hasDiff)
        assert.true(maxConnectionsReached)
        assert.nil(assembly.content.getCableConnections(entity2))
        assert.false(assembly.content.getCableConnections(entity1)!.has(entity2))
      }
    })
  })
})
