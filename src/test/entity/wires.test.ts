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

import { LuaEntity, LuaSurface } from "factorio:runtime"
import expect from "tstl-expect"
import { circuitConnectionEquals, ProjectCircuitConnection } from "../../entity/circuit-connection"
import { MutableProjectContent, newProjectContent } from "../../entity/ProjectContent"
import {
  addCircuitConnection,
  CableAddResult,
  createProjectEntityNoCopy,
  ProjectEntity,
} from "../../entity/ProjectEntity"
import { shallowCompare } from "../../lib"
import { setupTestSurfaces } from "../project/Project-mock"

let content: MutableProjectContent
let surface: LuaSurface
const extraSurfaces = setupTestSurfaces(1)

before_each(() => {
  content = newProjectContent()
  surface = game.surfaces[1]
  surface.find_entities().forEach((e) => e.destroy())
})

import Wires = require("../../entity/wires")

describe("circuit wires", () => {
  let luaEntity1: LuaEntity
  let luaEntity2: LuaEntity
  let entity1: ProjectEntity
  let entity2: ProjectEntity
  before_each(() => {
    luaEntity1 = surface.create_entity({ name: "arithmetic-combinator", position: { x: 5.5, y: 6 } })!
    luaEntity2 = surface.create_entity({ name: "arithmetic-combinator", position: { x: 7.5, y: 6 } })!
    entity1 = createProjectEntityNoCopy({ name: "arithmetic-combinator" }, { x: 5.5, y: 6 }, nil, 1)
    entity2 = createProjectEntityNoCopy({ name: "arithmetic-combinator" }, { x: 7.5, y: 6 }, nil, 1)
    entity1.replaceWorldEntity(1, luaEntity1)
    entity2.replaceWorldEntity(1, luaEntity2)
    content.addEntity(entity1)
    content.addEntity(entity2)
  })

  function addWire1(): void {
    // luaEntity1.connect_neighbour({
    //   target_entity: luaEntity2,
    //   wire: defines.wire_type.red,
    //   source_circuit_id: defines.circuit_connector_id.combinator_input,
    //   target_circuit_id: defines.circuit_connector_id.combinator_output,
    // })
    luaEntity1
      .get_wire_connector(defines.wire_connector_id.combinator_input_red, true)
      .connect_to(luaEntity2.get_wire_connector(defines.wire_connector_id.combinator_output_red, true))
  }
  function getExpectedWire1(): ProjectCircuitConnection {
    return {
      fromEntity: entity1,
      toEntity: entity2,
      fromId: defines.wire_connector_id.combinator_input_red,
      toId: defines.wire_connector_id.combinator_output_red,
    }
  }
  function addWire2(): void {
    // luaEntity2.connect_neighbour({
    //   target_entity: luaEntity1,
    //   wire: defines.wire_type.green,
    //   source_circuit_id: defines.circuit_connector_id.combinator_input,
    //   target_circuit_id: defines.circuit_connector_id.combinator_output,
    // })
    luaEntity2
      .get_wire_connector(defines.wire_connector_id.combinator_input_green, true)
      .connect_to(luaEntity1.get_wire_connector(defines.wire_connector_id.combinator_output_green, true))
  }
  function getExpectedWire2(): ProjectCircuitConnection {
    return {
      fromEntity: entity1,
      toEntity: entity2,
      fromId: defines.wire_connector_id.combinator_output_green,
      toId: defines.wire_connector_id.combinator_input_green,
    }
  }
  function addWire3(): void {
    // same as wire 1, but green
    // luaEntity1.connect_neighbour({
    //   target_entity: luaEntity2,
    //   wire: defines.wire_type.green,
    //   source_circuit_id: defines.circuit_connector_id.combinator_input,
    //   target_circuit_id: defines.circuit_connector_id.combinator_output,
    // })
    luaEntity1
      .get_wire_connector(defines.wire_connector_id.combinator_input_green, true)
      .connect_to(luaEntity2.get_wire_connector(defines.wire_connector_id.combinator_output_green, true))
  }
  function getExpectedWire3(): ProjectCircuitConnection {
    return {
      fromEntity: entity1,
      toEntity: entity2,
      fromId: defines.wire_connector_id.combinator_input_green,
      toId: defines.wire_connector_id.combinator_output_green,
    }
  }

  describe("update circuit connections", () => {
    test("can remove wires", () => {
      addWire1()
      addWire2()
      Wires.updateWireConnectionsAtStage(content, entity1, 1)
      // expect(luaEntity1.circuit_connection_definitions ?? []).toEqual([])
      // expect(luaEntity2.circuit_connection_definitions ?? []).toEqual([])
      // expect(luaEntity1.get_wire_connectors(false)).toEqual({})
      for (const [, connector] of pairs(luaEntity1.get_wire_connectors(false))) {
        expect(connector.connection_count).toEqual(0)
      }
    })
    function assertWire1Matches(): void {
      // expect(luaEntity1.circuit_connection_definitions).toEqual([
      //   {
      //     target_entity: luaEntity2,
      //     wire: defines.wire_type.red,
      //     source_circuit_id: defines.circuit_connector_id.combinator_input,
      //     target_circuit_id: defines.circuit_connector_id.combinator_output,
      //   } as CircuitConnectionDefinition,
      // ])
      expect(
        luaEntity1.get_wire_connector(defines.wire_connector_id.combinator_input_red, true).connections[0].target,
      ).toEqual(luaEntity2.get_wire_connector(defines.wire_connector_id.combinator_output_red, true))
    }
    test("can add wires", () => {
      addCircuitConnection(getExpectedWire1())
      Wires.updateWireConnectionsAtStage(content, entity1, 1)
      assertWire1Matches()
    })
    test("can update wires", () => {
      addWire1()
      addWire2()
      addCircuitConnection(getExpectedWire1())
      Wires.updateWireConnectionsAtStage(content, entity1, 1)
      assertWire1Matches()
    })
    test("ignores entities not in the project", () => {
      addWire1() // entity1 -> entity2
      content.deleteEntity(entity2)
      Wires.updateWireConnectionsAtStage(content, entity1, 1)
      // wire should still be there
      assertWire1Matches()
    })

    test("can update wire connected to itself", () => {
      const wire1 = {
        fromEntity: entity1,
        toEntity: entity1,
        // wire: defines.wire_type.red,
        fromId: defines.wire_connector_id.combinator_input_red,
        toId: defines.wire_connector_id.combinator_output_red,
      }
      addCircuitConnection(wire1)
      Wires.updateWireConnectionsAtStage(content, entity1, 1)

      expect(
        luaEntity1.get_wire_connector(defines.wire_connector_id.combinator_input_red, true).connections[0].target,
      ).toEqual(luaEntity1.get_wire_connector(defines.wire_connector_id.combinator_output_red, true))
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
      for (const number of existing) addCircuitConnection(wires[number - 1])
      for (const number of world) [addWire1, addWire2, addWire3][number - 1]()

      const [hasDiff, maxConnectionsReached] = Wires.saveWireConnections(content, entity1, 1)
      expect(hasDiff).toBe(!shallowCompare(existing, world))
      expect(maxConnectionsReached).toBeNil() // not relevant for circuit wires

      const connections = entity1.circuitConnections?.get(entity2)
      expect(Object.keys(connections ?? {})).toEqual(world.map((number) => wires[number - 1]))

      expect(entity2.circuitConnections?.get(entity1)).toEqual(connections)
    })
  })
})

describe("power switch connections", () => {
  let pole: LuaEntity
  let powerSwitch: LuaEntity
  let poleEntity: ProjectEntity<{
    name: string
  }>
  let powerSwitchEntity: ProjectEntity<{
    name: string
  }>
  before_each(() => {
    pole = surface.create_entity({ name: "medium-electric-pole", position: { x: 5.5, y: 5.5 } })!
    powerSwitch = surface.create_entity({ name: "power-switch", position: { x: 6, y: 7 } })!
    poleEntity = createProjectEntityNoCopy({ name: "medium-electric-pole" }, pole.position, nil, 1)
    powerSwitchEntity = createProjectEntityNoCopy({ name: "power-switch" }, powerSwitch.position, nil, 1)
    poleEntity.replaceWorldEntity(1, pole)
    powerSwitchEntity.replaceWorldEntity(1, powerSwitch)
    content.addEntity(poleEntity)
    content.addEntity(powerSwitchEntity)
  })

  describe.each(["pole", "power switch"])("from %s", (from) => {
    // test.skip("modding api broken?", () => {
    //   pole.connect_neighbour({
    //     target_entity: powerSwitch,
    //     wire: defines.wire_type.copper,
    //     target_wire_id: defines.wire_connection_id.power_switch_right,
    //   })
    //   expect((pole.neighbours as any).copper).toEqual([powerSwitch])
    //   pole.disconnect_neighbour({
    //     target_entity: powerSwitch,
    //     wire: defines.wire_type.copper,
    //     target_wire_id: defines.wire_connection_id.power_switch_right,
    //   })
    //   expect((pole.neighbours as any).copper).toEqual([powerSwitch])
    //   // ^ is a bug?
    // })
    //
    test("can remove wires", () => {
      // pole.connect_neighbour({
      //   target_entity: powerSwitch,
      //   wire: defines.wire_type.copper,
      //   target_wire_id: defines.wire_connection_id.power_switch_right,
      // })
      pole
        .get_wire_connector(defines.wire_connector_id.pole_copper, true)
        .connect_to(powerSwitch.get_wire_connector(defines.wire_connector_id.power_switch_right_copper, true))
      Wires.updateWireConnectionsAtStage(content, from == "pole" ? poleEntity : powerSwitchEntity, 1)
      expect((pole.neighbours as any).copper).toEqual([])
      expect((powerSwitch.neighbours as any).copper).toEqual([])
    })

    test("can add wires", () => {
      addCircuitConnection({
        fromEntity: poleEntity,
        toEntity: powerSwitchEntity,
        fromId: defines.wire_connector_id.pole_copper,
        toId: defines.wire_connector_id.power_switch_right_copper,
      })

      Wires.updateWireConnectionsAtStage(content, from == "pole" ? poleEntity : powerSwitchEntity, 1)
      expect((pole.neighbours as any).copper).toEqual([powerSwitch])
      expect((powerSwitch.neighbours as any).copper).toEqual([pole])
      expect(pole.get_wire_connector(defines.wire_connector_id.pole_copper, true).connections[0].target).toEqual(
        powerSwitch.get_wire_connector(defines.wire_connector_id.power_switch_right_copper, true),
      )
    })

    test("can update wires", () => {
      // "world" is left, "saved" is right
      // pole.connect_neighbour({
      //   target_entity: powerSwitch,
      //   wire: defines.wire_type.copper,
      //   target_wire_id: defines.wire_connection_id.power_switch_left,
      // })
      pole
        .get_wire_connector(defines.wire_connector_id.pole_copper, true)
        .connect_to(powerSwitch.get_wire_connector(defines.wire_connector_id.power_switch_left_copper, true))

      addCircuitConnection({
        fromEntity: powerSwitchEntity,
        toEntity: poleEntity,
        fromId: defines.wire_connector_id.power_switch_right_copper,
        toId: defines.wire_connector_id.pole_copper,
      })

      Wires.updateWireConnectionsAtStage(content, from == "pole" ? poleEntity : powerSwitchEntity, 1)
      expect((pole.neighbours as any).copper).toEqual([powerSwitch])
      expect((powerSwitch.neighbours as any).copper).toEqual([pole])
      // const side2 = pole.copper_connection_definitions.find(
      //   (c) => c.target_entity == powerSwitch,
      // )!.target_wire_connector
      // expect(side2).toEqual(defines.wire_connection_id.power_switch_right)
      expect(pole.get_wire_connector(defines.wire_connector_id.pole_copper, true).connections[0].target).toEqual(
        powerSwitch.get_wire_connector(defines.wire_connector_id.power_switch_right_copper, true),
      )
    })
    test("can save a connection", () => {
      // pole.connect_neighbour({
      //   target_entity: powerSwitch,
      //   wire: defines.wire_type.copper,
      //   target_wire_id: defines.wire_connection_id.power_switch_right,
      // })
      pole
        .get_wire_connector(defines.wire_connector_id.pole_copper, true)
        .connect_to(powerSwitch.get_wire_connector(defines.wire_connector_id.power_switch_right_copper, true))

      const [hasDiff, maxConnectionsReached] = Wires.saveWireConnections(
        content,
        from == "pole" ? poleEntity : powerSwitchEntity,
        1,
      )
      expect(hasDiff).toBe(true)
      expect(maxConnectionsReached).toBeFalsy()
      const connections = poleEntity.circuitConnections?.get(powerSwitchEntity)
      const connection = Object.keys(connections ?? newLuaSet())
      expect(connection).toHaveLength(1)

      if (
        !circuitConnectionEquals(connection[0] as any, {
          fromEntity: poleEntity,
          toEntity: powerSwitchEntity,
          fromId: defines.wire_connector_id.pole_copper,
          toId: defines.wire_connector_id.power_switch_right_copper,
        })
      ) {
        expect(connection[0]).toEqual("does not match")
      }
      expect(powerSwitchEntity.circuitConnections?.get(poleEntity)).toEqual(connections)
    })
  })

  test("can remove connection if connected to different but not existing pole", () => {
    const pole2 = surface.create_entity({ name: "medium-electric-pole", position: { x: 5.5, y: 6.5 } })!
    const pole2Entity = createProjectEntityNoCopy({ name: "medium-electric-pole" }, pole2.position, nil, 1)
    pole2Entity.replaceWorldEntity(1, pole2)
    content.addEntity(pole2Entity)

    pole2
      .get_wire_connector(defines.wire_connector_id.pole_copper, true)
      .connect_to(powerSwitch.get_wire_connector(defines.wire_connector_id.power_switch_right_copper, true))

    addCircuitConnection({
      fromEntity: poleEntity,
      toEntity: powerSwitchEntity,
      fromId: defines.wire_connector_id.pole_copper,
      toId: defines.wire_connector_id.power_switch_right_copper,
    })
    poleEntity.destroyWorldOrPreviewEntity(1)

    Wires.updateWireConnectionsAtStage(content, powerSwitchEntity, 1)
    expect((pole2.neighbours as any).copper).toEqual([])
  })
})

describe("cable connections", () => {
  let luaEntity1: LuaEntity
  let luaEntity2: LuaEntity
  let entity1: ProjectEntity
  let entity2: ProjectEntity
  let luaEntity3: LuaEntity
  let entity3: ProjectEntity
  function setup(n: number) {
    const pos = { x: 5.5 + n, y: 5.5 + n }
    const luaEntity = surface.create_entity({ name: "medium-electric-pole", position: pos })!
    luaEntity.get_wire_connector(defines.wire_connector_id.pole_copper, true).disconnect_all()
    const entity = createProjectEntityNoCopy({ name: "medium-electric-pole" }, pos, nil, 1)
    entity.replaceWorldEntity(1, luaEntity)
    content.addEntity(entity)
    return { luaEntity, entity }
  }
  before_each(() => {
    ;({ luaEntity: luaEntity1, entity: entity1 } = setup(1))
    ;({ luaEntity: luaEntity2, entity: entity2 } = setup(2))
    ;({ luaEntity: luaEntity3, entity: entity3 } = setup(3))
  })

  test("can add cables", () => {
    entity1.tryAddDualCableConnection(entity2)
    Wires.updateWireConnectionsAtStage(content, entity1, 1)
    expect(
      (
        luaEntity1.neighbours as {
          copper: LuaEntity[]
        }
      ).copper,
    ).toEqual([luaEntity2])
    expect(
      (
        luaEntity2.neighbours as {
          copper: LuaEntity[]
        }
      ).copper,
    ).toEqual([luaEntity1])
  })

  test("can remove cables", () => {
    luaEntity1
      .get_wire_connector(defines.wire_connector_id.pole_copper, true)
      .connect_to(luaEntity2.get_wire_connector(defines.wire_connector_id.pole_copper, true))
    Wires.updateWireConnectionsAtStage(content, entity1, 1)
    expect(
      (
        luaEntity1.neighbours as {
          copper: LuaEntity[]
        }
      ).copper,
    ).toEqual([])
    expect(
      (
        luaEntity2.neighbours as {
          copper: LuaEntity[]
        }
      ).copper,
    ).toEqual([])
  })

  test("can update cables", () => {
    entity1.tryAddDualCableConnection(entity2) // 1-2
    luaEntity2
      .get_wire_connector(defines.wire_connector_id.pole_copper, true)
      .connect_to(luaEntity3.get_wire_connector(defines.wire_connector_id.pole_copper, true))
    Wires.updateWireConnectionsAtStage(content, entity2, 1)
    // should now only have 1-2
    expect(
      (
        luaEntity1.neighbours as {
          copper: LuaEntity[]
        }
      ).copper,
    ).toEqual([luaEntity2])
    expect(
      (
        luaEntity2.neighbours as {
          copper: LuaEntity[]
        }
      ).copper,
    ).toEqual([luaEntity1])
    expect(
      (
        luaEntity3.neighbours as {
          copper: LuaEntity[]
        }
      ).copper,
    ).toEqual([])
  })

  test("ignores entities not in the project", () => {
    luaEntity1
      .get_wire_connector(defines.wire_connector_id.pole_copper, true)
      .connect_to(luaEntity2.get_wire_connector(defines.wire_connector_id.pole_copper, true))
    content.deleteEntity(entity2)
    Wires.updateWireConnectionsAtStage(content, entity1, 1)
    // cable should still be there
    expect(
      (
        luaEntity1.neighbours as {
          copper: LuaEntity[]
        }
      ).copper,
    ).toEqual([luaEntity2])
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
      if (existing.includes(1)) entity1.tryAddDualCableConnection(entity2)
      if (existing.includes(2)) entity2.tryAddDualCableConnection(entity3)
      if (world.includes(1))
        luaEntity1
          .get_wire_connector(defines.wire_connector_id.pole_copper, true)
          .connect_to(luaEntity2.get_wire_connector(defines.wire_connector_id.pole_copper, true))
      if (world.includes(2))
        luaEntity2
          .get_wire_connector(defines.wire_connector_id.pole_copper, true)
          .connect_to(luaEntity3.get_wire_connector(defines.wire_connector_id.pole_copper, true))

      const [hasDiff, maxConnectionsReached] = Wires.saveWireConnections(content, entity2, 1)
      expect(hasDiff).toBe(!shallowCompare(existing, world))
      expect(maxConnectionsReached).toBeNil()

      const connections = entity2.cableConnections
      expect(Object.keys(connections ?? {})).toEqual(world.map((number) => [entity1, entity3][number - 1]))
    })

    test("can add cables in multiple stages", () => {
      const otherLuaEntity3 = extraSurfaces[0].create_entity({
        name: "medium-electric-pole",
        position: entity3.position,
      })!
      const otherLuaEntity2 = extraSurfaces[0].create_entity({
        name: "medium-electric-pole",
        position: entity2.position,
      })!
      entity2.replaceWorldEntity(2, otherLuaEntity2)
      entity3.replaceWorldEntity(2, otherLuaEntity3)
      entity3.setFirstStageUnchecked(2)
      // otherLuaEntity2.connect_neighbour(otherLuaEntity3)
      // luaEntity2.connect_neighbour(luaEntity1)
      otherLuaEntity2
        .get_wire_connector(defines.wire_connector_id.pole_copper, true)
        .connect_to(otherLuaEntity3.get_wire_connector(defines.wire_connector_id.pole_copper, true))
      luaEntity2
        .get_wire_connector(defines.wire_connector_id.pole_copper, true)
        .connect_to(luaEntity1.get_wire_connector(defines.wire_connector_id.pole_copper, true))
      // should connect both 1-2 and 2-3
      Wires.saveWireConnections(content, entity2, 1, 2)

      const connections = entity2.cableConnections
      expect(Object.keys(connections ?? {})).toEqual([entity1, entity3])
    })

    test("max connections reached", () => {
      // max # of connections is 5
      for (let i = 0; i < 5; i++) {
        const entity = createProjectEntityNoCopy(
          { name: "medium-electric-pole" },
          {
            x: 4.5 + i,
            y: 5.5 + i,
          },
          nil,
          1,
        )
        // no lua entity
        content.addEntity(entity)
        const result = entity1.tryAddDualCableConnection(entity)
        expect(result).toBe(CableAddResult.Added)
      }
      luaEntity1
        .get_wire_connector(defines.wire_connector_id.pole_copper, true)
        .connect_to(luaEntity2.get_wire_connector(defines.wire_connector_id.pole_copper, true))
      // saving should fail
      {
        const [hasDiff, maxConnectionsReached] = Wires.saveWireConnections(content, entity1, 1)
        expect(hasDiff).toBe(true)
        expect(maxConnectionsReached).toBe(true)
        expect(entity2.cableConnections).toBeNil()
        expect(entity1.cableConnections!.has(entity2)).toBe(false)
      }
      {
        const [hasDiff, maxConnectionsReached] = Wires.saveWireConnections(content, entity2, 1)
        expect(hasDiff).toBe(true)
        expect(maxConnectionsReached).toBe(true)
        expect(entity2.cableConnections).toBeNil()
        expect(entity1.cableConnections!.has(entity2)).toBe(false)
      }
    })
  })
})
