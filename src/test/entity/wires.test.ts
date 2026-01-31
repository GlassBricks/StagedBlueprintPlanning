// Copyright (c) 2022-2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { LuaEntity, LuaSurface } from "factorio:runtime"
import expect from "tstl-expect"
import { MutableProjectContent, newProjectContent } from "../../entity/ProjectContent"
import { newProjectEntity, ProjectEntity, StageNumber } from "../../entity/ProjectEntity"
import { ProjectWireConnection, wireConnectionEquals } from "../../entity/wire-connection"
import { WorldEntityLookup } from "../../project/WorldPresentation"
import { shallowCompare } from "../../lib"

let content: MutableProjectContent
let surface: LuaSurface
let worldEntities: LuaMap<ProjectEntity, LuaMap<StageNumber, LuaEntity>>

function setWorldEntity(entity: ProjectEntity, stage: StageNumber, luaEntity: LuaEntity | nil): void {
  if (luaEntity == nil) {
    worldEntities.get(entity)?.delete(stage)
    return
  }
  let byStage = worldEntities.get(entity)
  if (!byStage) {
    byStage = new LuaMap()
    worldEntities.set(entity, byStage)
  }
  byStage.set(stage, luaEntity)
}

const mockWorldEntityLookup: WorldEntityLookup = {
  getWorldEntity: (entity, stage) => worldEntities.get(entity)?.get(stage) ?? nil,
  getWorldOrPreviewEntity: (entity, stage) => worldEntities.get(entity)?.get(stage) ?? nil,
  hasErrorAt: () => false,
}

before_each(() => {
  content = newProjectContent()
  surface = game.surfaces[1]
  surface.find_entities().forEach((e) => e.destroy())
  worldEntities = new LuaMap()
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
    entity1 = newProjectEntity({ name: "arithmetic-combinator" }, { x: 5.5, y: 6 }, 0, 1)
    entity2 = newProjectEntity({ name: "arithmetic-combinator" }, { x: 7.5, y: 6 }, 0, 1)
    setWorldEntity(entity1, 1, luaEntity1)
    setWorldEntity(entity2, 1, luaEntity2)
    content.addEntity(entity1)
    content.addEntity(entity2)
  })

  function addWire1(): void {
    luaEntity1
      .get_wire_connector(defines.wire_connector_id.combinator_input_red, true)
      .connect_to(luaEntity2.get_wire_connector(defines.wire_connector_id.combinator_output_red, true))
  }
  function getExpectedWire1(): ProjectWireConnection {
    return {
      fromEntity: entity1,
      toEntity: entity2,
      fromId: defines.wire_connector_id.combinator_input_red,
      toId: defines.wire_connector_id.combinator_output_red,
    }
  }
  function addWire2(): void {
    luaEntity2
      .get_wire_connector(defines.wire_connector_id.combinator_input_green, true)
      .connect_to(luaEntity1.get_wire_connector(defines.wire_connector_id.combinator_output_green, true))
  }
  function getExpectedWire2(): ProjectWireConnection {
    return {
      fromEntity: entity1,
      toEntity: entity2,
      fromId: defines.wire_connector_id.combinator_output_green,
      toId: defines.wire_connector_id.combinator_input_green,
    }
  }
  function addWire3(): void {
    // same as wire 1, but green
    luaEntity1
      .get_wire_connector(defines.wire_connector_id.combinator_input_green, true)
      .connect_to(luaEntity2.get_wire_connector(defines.wire_connector_id.combinator_output_green, true))
  }
  function getExpectedWire3(): ProjectWireConnection {
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
      Wires.updateWireConnectionsAtStage(content, entity1, 1, mockWorldEntityLookup)
      for (const [, connector] of pairs(luaEntity1.get_wire_connectors(false))) {
        expect(connector.connection_count).toEqual(0)
      }
    })
    function assertWire1Matches(): void {
      expect(
        luaEntity1.get_wire_connector(defines.wire_connector_id.combinator_input_red, true).connections[0].target,
      ).toEqual(luaEntity2.get_wire_connector(defines.wire_connector_id.combinator_output_red, true))
    }
    test("can add wires", () => {
      content.addWireConnection(getExpectedWire1())
      Wires.updateWireConnectionsAtStage(content, entity1, 1, mockWorldEntityLookup)
      assertWire1Matches()
    })
    test("can update wires", () => {
      addWire1()
      addWire2()
      content.addWireConnection(getExpectedWire1())
      Wires.updateWireConnectionsAtStage(content, entity1, 1, mockWorldEntityLookup)
      assertWire1Matches()
    })
    test("ignores entities not in the project", () => {
      addWire1() // entity1 -> entity2
      content.deleteEntity(entity2)
      Wires.updateWireConnectionsAtStage(content, entity1, 1, mockWorldEntityLookup)
      // wire should still be there
      assertWire1Matches()
    })

    test("can update wire connected to itself", () => {
      const wire1 = {
        fromEntity: entity1,
        toEntity: entity1,
        fromId: defines.wire_connector_id.combinator_input_red,
        toId: defines.wire_connector_id.combinator_output_red,
      }
      content.addWireConnection(wire1)
      Wires.updateWireConnectionsAtStage(content, entity1, 1, mockWorldEntityLookup)

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
      for (const number of existing) content.addWireConnection(wires[number - 1])
      for (const number of world) [addWire1, addWire2, addWire3][number - 1]()

      const hasDiff = Wires.saveWireConnections(content, entity1, 1, nil, mockWorldEntityLookup)
      expect(hasDiff).toBe(!shallowCompare(existing, world))

      const connections = entity1.wireConnections?.get(entity2)
      expect(Object.keys(connections ?? {})).toEqual(world.map((number) => wires[number - 1]))

      expect(entity2.wireConnections?.get(entity1)).toEqual(connections)
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
    poleEntity = newProjectEntity({ name: "medium-electric-pole" }, pole.position, 0, 1)
    powerSwitchEntity = newProjectEntity({ name: "power-switch" }, powerSwitch.position, 0, 1)
    setWorldEntity(poleEntity, 1, pole)
    setWorldEntity(powerSwitchEntity, 1, powerSwitch)
    content.addEntity(poleEntity)
    content.addEntity(powerSwitchEntity)
  })

  describe.each(["pole", "power switch"])("from %s", (from) => {
    test("can remove wires", () => {
      pole
        .get_wire_connector(defines.wire_connector_id.pole_copper, true)
        .connect_to(powerSwitch.get_wire_connector(defines.wire_connector_id.power_switch_right_copper, true))
      Wires.updateWireConnectionsAtStage(
        content,
        from == "pole" ? poleEntity : powerSwitchEntity,
        1,
        mockWorldEntityLookup,
      )
      for (const [, connector] of pairs(pole.get_wire_connectors(false))) {
        expect(connector.connections).toEqual([])
      }
      for (const [, connector] of pairs(powerSwitch.get_wire_connectors(false))) {
        expect(connector.connections).toEqual([])
      }
    })

    test("can add wires", () => {
      content.addWireConnection({
        fromEntity: poleEntity,
        toEntity: powerSwitchEntity,
        fromId: defines.wire_connector_id.pole_copper,
        toId: defines.wire_connector_id.power_switch_right_copper,
      })

      Wires.updateWireConnectionsAtStage(
        content,
        from == "pole" ? poleEntity : powerSwitchEntity,
        1,
        mockWorldEntityLookup,
      )
      expect(pole.get_wire_connector(defines.wire_connector_id.pole_copper, true).connections[0].target).toEqual(
        powerSwitch.get_wire_connector(defines.wire_connector_id.power_switch_right_copper, true),
      )
    })

    test("can update wires", () => {
      pole
        .get_wire_connector(defines.wire_connector_id.pole_copper, true)
        .connect_to(powerSwitch.get_wire_connector(defines.wire_connector_id.power_switch_left_copper, true))

      content.addWireConnection({
        fromEntity: powerSwitchEntity,
        toEntity: poleEntity,
        fromId: defines.wire_connector_id.power_switch_right_copper,
        toId: defines.wire_connector_id.pole_copper,
      })

      Wires.updateWireConnectionsAtStage(
        content,
        from == "pole" ? poleEntity : powerSwitchEntity,
        1,
        mockWorldEntityLookup,
      )
      expect(pole.get_wire_connector(defines.wire_connector_id.pole_copper, true).connections[0].target).toEqual(
        powerSwitch.get_wire_connector(defines.wire_connector_id.power_switch_right_copper, true),
      )
    })
    test("can save a connection", () => {
      pole
        .get_wire_connector(defines.wire_connector_id.pole_copper, true)
        .connect_to(powerSwitch.get_wire_connector(defines.wire_connector_id.power_switch_right_copper, true))

      const hasDiff = Wires.saveWireConnections(
        content,
        from == "pole" ? poleEntity : powerSwitchEntity,
        1,
        nil,
        mockWorldEntityLookup,
      )
      expect(hasDiff).toBe(true)
      const connections = poleEntity.wireConnections?.get(powerSwitchEntity)
      const connection = Object.keys(connections ?? newLuaSet())
      expect(connection).toHaveLength(1)

      if (
        !wireConnectionEquals(connection[0] as any, {
          fromEntity: poleEntity,
          toEntity: powerSwitchEntity,
          fromId: defines.wire_connector_id.pole_copper,
          toId: defines.wire_connector_id.power_switch_right_copper,
        })
      ) {
        expect(connection[0]).toEqual("does not match")
      }
      expect(powerSwitchEntity.wireConnections?.get(poleEntity)).toEqual(connections)
    })
  })

  test("can remove connection if connected to different but not existing pole", () => {
    const pole2 = surface.create_entity({ name: "medium-electric-pole", position: { x: 5.5, y: 6.5 } })!
    const pole2Entity = newProjectEntity({ name: "medium-electric-pole" }, pole2.position, 0, 1)
    setWorldEntity(pole2Entity, 1, pole2)
    content.addEntity(pole2Entity)

    pole2
      .get_wire_connector(defines.wire_connector_id.pole_copper, true)
      .connect_to(powerSwitch.get_wire_connector(defines.wire_connector_id.power_switch_right_copper, true))

    content.addWireConnection({
      fromEntity: poleEntity,
      toEntity: powerSwitchEntity,
      fromId: defines.wire_connector_id.pole_copper,
      toId: defines.wire_connector_id.power_switch_right_copper,
    })
    setWorldEntity(poleEntity, 1, nil)
    pole.destroy()

    Wires.updateWireConnectionsAtStage(content, powerSwitchEntity, 1, mockWorldEntityLookup)
    expect(pole2.get_wire_connector(defines.wire_connector_id.pole_copper, true).connections).toEqual([])
  })
})
