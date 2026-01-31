// Copyright (c) 2022-2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { BlueprintInsertPlan, MapPositionArray } from "factorio:runtime"
import expect from "tstl-expect"
import { Settings } from "../../constants"
import { ProjectEntity } from "../../entity/ProjectEntity"
import { updateEntity } from "../../entity/save-load"
import { assert } from "../../lib"
import { checkForEntityUpdates } from "../../project/event-handlers"
import { simpleInsertPlan } from "../entity/entity-util"
import { setupEntityIntegrationTest, waitForPaste } from "./integration-test-util"

const ctx = setupEntityIntegrationTest()

describe("item-requests", () => {
  const slot = 2
  const count = 2
  const chestPlateInsertPlan = simpleInsertPlan(defines.inventory.chest, "iron-plate", slot, count)
  function buildChest(): ProjectEntity {
    const chest = ctx.buildEntity(1, {
      position: [0.5, 0.5],
      name: "iron-chest",
    })
    assert(chest)

    return chest
  }
  function buildFurnaceWithBlueprintEntity(): [ProjectEntity, BlueprintInsertPlan] {
    const projectEntity = ctx.buildEntity(1, {
      position: [0.5, 0.5],
      name: "steel-furnace",
    })
    assert(projectEntity)

    const worldEntity = ctx.worldQueries.getWorldEntity(projectEntity, 1)!
    const insertPlan: BlueprintInsertPlan = {
      id: { name: "coal" },
      items: {
        in_inventory: [
          {
            inventory: defines.inventory.fuel,
            stack: 0,
            count: 2,
          },
        ],
      },
    }
    worldEntity.surface.create_entity({
      name: "item-request-proxy",
      target: worldEntity,
      force: worldEntity.force,
      position: projectEntity.position,
      modules: [insertPlan],
    })

    return [projectEntity, insertPlan]
  }

  test("can save an entity with item requests", () => {
    const projectChest = buildChest()
    const chest = ctx.worldQueries.getWorldEntity(projectChest, 2)!
    updateEntity(
      chest,
      { name: "iron-chest" },
      {
        items: [chestPlateInsertPlan],
      },
      0,
    )
    assert(chest.item_request_proxy)

    checkForEntityUpdates(chest, nil)

    expect(projectChest.getPropertyAllStages("unstagedValue")).toEqual({ 2: { items: [chestPlateInsertPlan] } })
    expect(chest.item_request_proxy?.insert_plan).toEqual([chestPlateInsertPlan])

    ctx.assertEntityCorrect(projectChest, false)
  })

  describe.each([false, true])("blueprint paste with item requests (using bplib %s)", (useBplib) => {
    before_each(() => {
      ctx.player.mod_settings[Settings.UseBplibForBlueprintPaste] = { value: useBplib }
    })

    after_each(() => {
      ctx.player.mod_settings[Settings.UseBplibForBlueprintPaste] = { value: false }
    })

    test("paste a chest with item request, saved as unstaged value", () => {
      const pos: MapPositionArray = [0.5, 0.5]
      const stack = ctx.player.cursor_stack!
      stack.set_stack("blueprint")
      stack.set_blueprint_entities([
        {
          entity_number: 1,
          name: "iron-chest",
          position: pos,
          items: [chestPlateInsertPlan],
        },
      ])
      ctx.player.teleport([0, 0], ctx.surfaces[0])
      ctx.player.build_from_cursor({ position: pos })

      waitForPaste(useBplib, () => {
        const chest = ctx.surfaces[0].find_entity("iron-chest", pos)!
        expect(chest).not.toBeNil()
        expect(chest.item_request_proxy?.insert_plan).toEqual([chestPlateInsertPlan])

        const projectChest = ctx.project.content.findCompatibleWithLuaEntity(chest, nil, 1)!
        expect(projectChest).not.toBeNil()
        expect(projectChest.getUnstagedValue(1)).toEqual({ items: [chestPlateInsertPlan] })

        ctx.assertEntityCorrect(projectChest, false)
      })
    })

    test("paste assembling-machine-2 with prod module item requests, saved as value", () => {
      const pos: MapPositionArray = [0.5, 0.5]
      const moduleInsertPlan: BlueprintInsertPlan = simpleInsertPlan(
        defines.inventory.crafter_modules,
        "productivity-module",
        0,
      )
      const stack = ctx.player.cursor_stack!
      stack.set_stack("blueprint")
      stack.set_blueprint_entities([
        {
          entity_number: 1,
          name: "assembling-machine-2",
          position: pos,
          recipe: "iron-gear-wheel",
          items: [moduleInsertPlan],
        },
      ])
      ctx.player.teleport([0, 0], ctx.surfaces[0])
      ctx.player.build_from_cursor({ position: pos })

      waitForPaste(useBplib, () => {
        const assembler = ctx.surfaces[0].find_entity("assembling-machine-2", pos)!
        expect(assembler).not.toBeNil()
        expect(assembler.item_request_proxy?.insert_plan).toBeNil()

        const projectAssembler = ctx.project.content.findCompatibleWithLuaEntity(assembler, nil, 1)!
        expect(projectAssembler).not.toBeNil()
        expect(projectAssembler.getUnstagedValue(1)).toBe(nil)
        expect(projectAssembler.getValueAtStage(1)!.items).toEqual([moduleInsertPlan])

        ctx.assertEntityCorrect(projectAssembler, false)
      })
    })
    test("pasting identical item requests onto a furnace", () => {
      const [projectEntity, insertPlan] = buildFurnaceWithBlueprintEntity()

      const worldEntity = ctx.worldQueries.getWorldEntity(projectEntity, 1)!
      worldEntity.item_request_proxy?.destroy()

      const stack = ctx.player.cursor_stack!
      stack.set_stack("blueprint")
      stack.set_blueprint_entities([
        {
          entity_number: 1,
          name: "steel-furnace",
          position: [0.5, 0.5],
          items: [insertPlan],
        },
      ])

      ctx.player.teleport([5, 5], ctx.surfaces[0])
      ctx.player.build_from_cursor({ position: [0.5, 0.5], build_mode: defines.build_mode.forced })

      waitForPaste(useBplib, () => {
        checkForEntityUpdates(worldEntity, nil)

        expect(projectEntity.getUnstagedValue(1)).toEqual({
          items: [insertPlan],
        })
        expect(worldEntity.item_request_proxy?.insert_plan).toEqual([insertPlan])

        ctx.assertEntityCorrect(projectEntity, false)
      })
    })
  })

  test("rebuilding an entity with item requests", () => {
    const projectChest = buildChest()
    projectChest._asMut().setUnstagedValue(2, { items: [chestPlateInsertPlan] })
    ctx.worldOps.updateWorldEntities(projectChest, 2)

    const chest = ctx.worldQueries.getWorldEntity(projectChest, 2)!
    expect(chest.item_request_proxy?.insert_plan).toEqual([chestPlateInsertPlan])

    ctx.worldOps.rebuildStage(2)

    const newChest = ctx.worldQueries.getWorldEntity(projectChest, 2)!
    expect(newChest.item_request_proxy?.insert_plan).toEqual([chestPlateInsertPlan])
    expect(projectChest.getUnstagedValue(2)).toEqual({ items: [chestPlateInsertPlan] })

    ctx.assertEntityCorrect(projectChest, false)
  })

  test("save a furnace with fuel requests", () => {
    const [projectEntity, insertPlan] = buildFurnaceWithBlueprintEntity()
    const worldEntity = ctx.worldQueries.getWorldEntity(projectEntity, 1)!

    checkForEntityUpdates(worldEntity, nil)
    expect(projectEntity.getUnstagedValue(1)).toEqual({
      items: [insertPlan],
    })
    expect(projectEntity.firstValue.items).toBeNil()

    ctx.assertEntityCorrect(projectEntity, false)

    worldEntity.item_request_proxy!.destroy()
    checkForEntityUpdates(worldEntity, nil)

    expect(projectEntity.getUnstagedValue(1)).toBeNil()
    expect(projectEntity.firstValue.items).toBeNil()

    ctx.assertEntityCorrect(projectEntity, false)
  })
})
