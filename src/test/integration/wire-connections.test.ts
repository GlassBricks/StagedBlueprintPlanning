// Copyright (c) 2022-2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { BlueprintEntity, InserterBlueprintEntity, LuaEntity, SurfaceCreateEntity } from "factorio:runtime"
import expect from "tstl-expect"
import { Settings } from "../../constants"
import { StageNumber } from "../../entity/ProjectEntity"
import { saveEntity } from "../../entity/save-load"
import { ProjectWireConnection, wireConnectionEquals } from "../../entity/wire-connection"
import { Mutable } from "../../lib"
import { Pos } from "../../lib/geometry"
import { debugPrint } from "../../lib/test/misc"
import { setupEntityIntegrationTest, waitForPaste } from "./integration-test-util"

const ctx = setupEntityIntegrationTest()
const pos = Pos(10.5, 10.5)

describe("poles and wire connections", () => {
  function setupPole(stage: StageNumber, args: Partial<SurfaceCreateEntity> = {}) {
    return ctx.buildEntity(stage, { name: "medium-electric-pole", position: pos.minus(Pos(0, 1)), ...args })
  }
  function setupPole2(stage: StageNumber) {
    return setupPole(stage, {
      position: pos.minus(Pos(0, 2)),
    })
  }

  test("saves initial cable connections", () => {
    const pole1 = setupPole(3)
    const pole2 = setupPole2(3)
    expect(pole1.wireConnections?.get(pole2)).toBeAny()
    expect(pole2.wireConnections?.get(pole1)).toBeAny()
    ctx.assertEntityCorrect(pole1, false)
    ctx.assertEntityCorrect(pole2, false)
  })

  test("saves initial cable connections to a pole in higher stage", () => {
    const pole1 = setupPole(4)
    const pole2 = setupPole2(3)
    expect(pole1.wireConnections?.get(pole2)).toBeAny()
    expect(pole2.wireConnections?.get(pole1)).toBeAny()
    ctx.assertEntityCorrect(pole1, false)
    ctx.assertEntityCorrect(pole2, false)
  })

  function disconnectPole(pole1: LuaEntity, pole2: LuaEntity) {
    pole1
      .get_wire_connector(defines.wire_connector_id.pole_copper, false)
      .disconnect_from(pole2.get_wire_connector(defines.wire_connector_id.pole_copper, false))
  }
  function connectPole(pole1: LuaEntity, pole2: LuaEntity) {
    pole1
      .get_wire_connector(defines.wire_connector_id.pole_copper, true)
      .connect_to(pole2.get_wire_connector(defines.wire_connector_id.pole_copper, true))
  }

  test("disconnect and connect cables", () => {
    const pole1 = setupPole(3)
    const pole2 = setupPole2(3)
    disconnectPole(pole1.getWorldEntity(3)!, pole2.getWorldEntity(3)!)
    ctx.project.updates.updateWiresFromWorld(pole1, 3)

    expect(pole1.wireConnections?.get(pole2)).toBeNil()
    expect(pole2.wireConnections?.get(pole1)).toBeNil()
    ctx.assertEntityCorrect(pole1, false)
    ctx.assertEntityCorrect(pole2, false)

    connectPole(pole1.getWorldEntity(3)!, pole2.getWorldEntity(3)!)
    ctx.project.updates.updateWiresFromWorld(pole1, 3)

    expect(pole1.wireConnections?.get(pole2)).toBeAny()
    expect(pole2.wireConnections?.get(pole1)).toBeAny()
    ctx.assertEntityCorrect(pole1, false)
    ctx.assertEntityCorrect(pole2, false)
  })

  test("connect and disconnect circuit wires", () => {
    const inserter = ctx.buildEntity(3)
    const pole = setupPole(3)
    const poleConnector = pole.getWorldEntity(3)!.get_wire_connector(defines.wire_connector_id.circuit_red, true)
    const inserterConnector = inserter
      .getWorldEntity(3)!
      .get_wire_connector(defines.wire_connector_id.circuit_red, true)
    poleConnector.connect_to(inserterConnector)
    ctx.project.updates.updateWiresFromWorld(pole, 3)

    const expectedConnection = next(inserter.wireConnections!.get(pole)!)[0] as ProjectWireConnection
    expect(expectedConnection).toBeAny()
    expect(
      wireConnectionEquals(
        {
          fromEntity: pole,
          toEntity: inserter,
          fromId: defines.wire_connector_id.circuit_red,
          toId: defines.wire_connector_id.circuit_red,
        },
        expectedConnection,
      ),
    ).toBe(true)

    const worldEntity = inserter.getWorldEntity(3)!
    const inserterValue = saveEntity(worldEntity)[0]! as Mutable<InserterBlueprintEntity>
    if (inserterValue.control_behavior) {
      inserter._applyDiffAtStage(3, {
        control_behavior: inserterValue.control_behavior,
      })
    } else {
      debugPrint("Workaround no longer needed")
    }

    ctx.assertEntityCorrect(inserter, false)
    ctx.assertEntityCorrect(pole, false)
  })
})

describe("circuit connections", () => {
  describe.each([false, true])("paste a chain of circuit wires (using bplib %s)", (useBplib) => {
    before_each(() => {
      ctx.player.mod_settings[Settings.UseBplibForBlueprintPaste] = { value: useBplib }
    })

    after_each(() => {
      ctx.player.mod_settings[Settings.UseBplibForBlueprintPaste] = { value: false }
    })

    test.each([1, 2])("paste a chain of circuit wires over existing power poles, stage %s", (stage) => {
      const pole1 = ctx.buildEntity(stage, { name: "small-electric-pole", position: pos })
      const pole2 = ctx.buildEntity(stage, { name: "small-electric-pole", position: pos.plus(Pos(4, 0)) })
      const pole3 = ctx.buildEntity(stage, { name: "small-electric-pole", position: pos.plus(Pos(8, 0)) })

      const bpEntities: BlueprintEntity[] = [
        {
          entity_number: 1,
          name: "small-electric-pole",
          position: pos,
          wires: [[1, defines.wire_connector_id.circuit_red, 2, defines.wire_connector_id.circuit_red]],
        },
        {
          entity_number: 2,
          name: "small-electric-pole",
          position: pos.plus(Pos(4, 0)),
          wires: [
            [1, defines.wire_connector_id.circuit_red, 1, defines.wire_connector_id.circuit_red],
            [1, defines.wire_connector_id.circuit_red, 3, defines.wire_connector_id.circuit_red],
          ],
        },
        {
          entity_number: 3,
          name: "small-electric-pole",
          position: pos.plus(Pos(8, 0)),
          wires: [[1, defines.wire_connector_id.circuit_red, 2, defines.wire_connector_id.circuit_red]],
        },
      ]
      const stack = ctx.player.cursor_stack!
      stack.set_stack("blueprint")
      stack.set_blueprint_entities(bpEntities)

      ctx.player.teleport([0, 0], ctx.surfaces[stage - 1])
      ctx.player.build_from_cursor({ position: pos.plus(Pos(4, 0)) })

      waitForPaste(useBplib, () => {
        const connection1 = pole1.wireConnections?.get(pole2)
        expect(connection1).not.toBeNil()
        const connection21 = pole2.wireConnections?.get(pole1)
        expect(connection21).not.toBeNil()
        const connection23 = pole2.wireConnections?.get(pole3)
        expect(connection23).not.toBeNil()
        const connection3 = pole3.wireConnections?.get(pole2)
        expect(connection3).not.toBeNil()

        ctx.assertEntityCorrect(pole1, false)
        ctx.assertEntityCorrect(pole2, false)
        ctx.assertEntityCorrect(pole3, false)
      })
    })
  })
})
