// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { AssemblingMachineBlueprintEntity, LuaAssemblingMachineControlBehavior } from "factorio:runtime"
import expect from "tstl-expect"
import { Pos } from "../../lib/geometry"
import { checkForEntityUpdates } from "../../project/event-handlers"
import { setupEntityIntegrationTest } from "./integration-test-util"
import direction = defines.direction

const ctx = setupEntityIntegrationTest()
const pos = Pos(10.5, 10.5)

test("rotated assembler keeps direction after recipe is cleared by 'set recipe from signal'", () => {
  // stage 1: assembling-machine-2 with a fluid recipe, facing east (not north)
  const entity = ctx.buildEntity<AssemblingMachineBlueprintEntity>(1, {
    name: "assembling-machine-2",
    recipe: "rocket-fuel",
    direction: direction.east,
  })
  expect(entity.direction).toBe(direction.east)
  expect(entity.firstValue.recipe).toBe("rocket-fuel")

  // stage 2: connect the assembler to a circuit network and enable "set recipe from signal".
  const worldEntity2 = ctx.wp.getWorldEntity(entity, 2)!
  const combinator = ctx.surfaces[1].create_entity({
    name: "constant-combinator",
    position: pos.plus(Pos(2, 0)),
    force: "player",
  })!
  worldEntity2
    .get_wire_connector(defines.wire_connector_id.circuit_green, true)
    .connect_to(combinator.get_wire_connector(defines.wire_connector_id.circuit_green, true))
  const controlBehavior = worldEntity2.get_or_create_control_behavior() as LuaAssemblingMachineControlBehavior
  controlBehavior.circuit_set_recipe = true

  // the game clears the recipe on the next tick
  after_ticks(1, () => {
    expect(worldEntity2.get_recipe()[0]).toBeNil()

    checkForEntityUpdates(worldEntity2, nil)

    // the recipe is cleared only at stage 2; stage 1 still has it
    expect(entity.firstValue.recipe).toBe("rocket-fuel")
    expect(entity.getValueAtStage(2)?.recipe).toBeNil()
    // the entity's direction should be unchanged
    expect(entity.direction).toBe(direction.east)

    // rebuilding stage 2 must not lose the direction
    ctx.wp.rebuildStage(2)

    const rebuilt = ctx.wp.getWorldEntity(entity, 2)!
    expect(rebuilt.direction).toBe(direction.east)
    expect(entity.direction).toBe(direction.east)
  })
})
