// Copyright (c) 2022-2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { BlueprintEntity, InserterBlueprintEntity, LuaEntity } from "factorio:runtime"
import expect from "tstl-expect"
import { Prototypes } from "../../constants"
import { StageNumber } from "../../entity/ProjectEntity"
import { isPreviewEntity } from "../../entity/prototype-info"
import { canBeAnyDirection } from "../../entity/save-load"
import { Events } from "../../lib"
import { Pos } from "../../lib/geometry"
import { runEntireCurrentTask } from "../../lib/task"
import { EntityUpdateResult } from "../../project/project-updates"
import { _simulateUndo } from "../../project/undo"
import { setupEntityIntegrationTest } from "./integration-test-util"
import direction = defines.direction

const ctx = setupEntityIntegrationTest()
const pos = Pos(10.5, 10.5)

describe.each([
  ["transport-belt", "fast-transport-belt", false, false],
  ["underground-belt", "fast-underground-belt", false, false],
  [
    "fast-inserter",
    "bulk-inserter",
    { override_stack_size: 2 },
    (e: LuaEntity): any => (e.inserter_stack_size_override = 2),
  ],
  [
    "assembling-machine-1",
    "assembling-machine-2",
    {
      recipe: "iron-gear-wheel",
      recipe_quality: "normal" as any,
    },
    (e: LuaEntity) => e.set_recipe("iron-gear-wheel"),
  ],
  [
    "wooden-chest",
    "iron-chest",
    { bar: 5 },
    (e: LuaEntity) => e.get_inventory(defines.inventory.chest)!.set_bar(5 + 1),
  ],
])("using %s, upgrade to %s", (name, upgradeName, diff, applyToEntity) => {
  let defaultName: string
  before_each(() => {
    defaultName = name
  })

  function createEntity(stage: StageNumber, args?: Partial<import("factorio:runtime").SurfaceCreateEntity>) {
    return ctx.createEntity(stage, { name: defaultName, ...args })
  }

  function buildEntity<T extends BlueprintEntity = BlueprintEntity>(
    stage: StageNumber,
    args?: Partial<import("factorio:runtime").SurfaceCreateEntity>,
  ) {
    return ctx.buildEntity<T>(stage, { name: defaultName, ...args })
  }

  test("can add a new entity", () => {
    const entity = buildEntity(3)
    ctx.assertEntityCorrect(entity, false)
  })

  test("is correct when entity dies", () => {
    const entity = buildEntity(3)
    const worldEntity = entity.getWorldEntity(4)!
    worldEntity.destructible = true
    worldEntity.die()
    ctx.assertEntityCorrect(entity, 4)
  })

  test("has error when entity cannot be placed at some stage", () => {
    createEntity(4, { name: "stone-wall" })
    const entity = buildEntity(3)
    expect(isPreviewEntity(entity.getWorldOrPreviewEntity(4)!)).toBe(true)
    ctx.assertEntityCorrect(entity, 4)
  })

  test("can fix missing entity via onTryFixEntity", () => {
    const blocker = createEntity(4, { name: "stone-wall" })
    const entity = buildEntity(3)
    blocker.destroy()
    ctx.project.actions.onTryFixEntity(entity.getWorldOrPreviewEntity(4)!, 4)
    ctx.assertEntityCorrect(entity, false)
  })

  test("refreshWorldEntityAtStage will fix incorrect direction", () => {
    const entity = buildEntity(3)
    entity.getWorldOrPreviewEntity(4)!.direction = direction.north

    ctx.project.worldUpdates.refreshWorldEntityAtStage(entity, 4)
    ctx.assertEntityCorrect(entity, false)
  })

  test("can move entity by replacing preview", () => {
    const entity = buildEntity(3)
    const newEntity = buildEntity(2)
    expect(newEntity).toBe(entity)
    expect(entity.firstStage).toBe(2)
    ctx.assertEntityCorrect(entity, false)
  })

  test("will disallow entity deletion at a higher stage", () => {
    const entity = buildEntity(3)
    const worldEntity = entity.getWorldEntity(4)!
    worldEntity.mine({
      force: true,
      ignore_minable: true,
      raise_destroyed: true,
    })
    expect(worldEntity.valid).toBe(false)
    ctx.assertEntityCorrect(entity, false)
  })

  test("can delete entity at first stage", () => {
    const entity = buildEntity(3)
    const worldEntity = entity.getWorldEntity(3)!
    ctx.player.mine_entity(worldEntity, true)
    expect(worldEntity.valid).toBe(false)
    ctx.assertEntityNotPresent(entity)
  })

  test("deleting entity may create settings remnant", () => {
    const entity = buildEntity(3)
    entity._applyDiffAtStage(4, { override_stack_size: 2 })
    const worldEntity = entity.getWorldEntity(3)!
    ctx.player.mine_entity(worldEntity, true)
    expect(worldEntity.valid).toBe(false)
    ctx.assertIsSettingsRemnant(entity)
  })

  if (name.includes("inserter")) {
    describe("reviving settings remnants", () => {
      test.each([1, 2, 3, 4, 5, 6])("settings remnant 1->3->5, revive at stage %d", (reviveStage) => {
        const entity = buildEntity<InserterBlueprintEntity>(1)
        entity._applyDiffAtStage(3, { override_stack_size: 2 })
        entity._applyDiffAtStage(5, { override_stack_size: 3 })
        ctx.project.updates.deleteEntityOrCreateSettingsRemnant(entity)
        ctx.assertIsSettingsRemnant(entity)

        assert(ctx.project.updates.tryReviveSettingsRemnant(entity, reviveStage))
        expect(entity.isSettingsRemnant).toBeFalsy()
        expect(reviveStage).toBe(entity.firstStage)

        if (reviveStage >= 5) {
          expect(entity.firstValue.override_stack_size).toBe(3)
          expect(entity.hasStageDiff()).toBe(false)
        } else if (reviveStage >= 3) {
          expect(entity.firstValue.override_stack_size).toBe(2)
          expect(entity.stageDiffs).toEqual({ 5: { override_stack_size: 3 } })
        } else {
          expect(entity.firstValue.override_stack_size).toBe(1)
          expect(entity.stageDiffs).toEqual({ 3: { override_stack_size: 2 }, 5: { override_stack_size: 3 } })
        }

        ctx.assertEntityCorrect(entity, false)
      })

      test("settings remnant 2->3, revive at stage 1", () => {
        const entity = buildEntity<InserterBlueprintEntity>(2)
        entity._applyDiffAtStage(3, { override_stack_size: 3 })
        ctx.project.updates.deleteEntityOrCreateSettingsRemnant(entity)
        ctx.assertIsSettingsRemnant(entity)

        ctx.project.updates.tryReviveSettingsRemnant(entity, 1)
        expect(entity.isSettingsRemnant).toBeFalsy()
        expect(1).toBe(entity.firstStage)

        expect(entity.firstValue.override_stack_size).toBe(1)
        expect(entity.stageDiffs).toEqual({ 3: { override_stack_size: 3 } })

        ctx.assertEntityCorrect(entity, false)
      })
    })
  }

  test("can force delete an entity at any stage", () => {
    const entity = buildEntity(3)
    entity._applyDiffAtStage(4, { override_stack_size: 2 })
    ctx.project.actions.onEntityForceDeleteUsed(entity.getWorldEntity(4)!, 4, ctx.player.index)
    ctx.assertEntityNotPresent(entity)
  })

  test("can rotate in the first stage", () => {
    const entity = buildEntity(3)
    const worldEntity = entity.getWorldEntity(3)!
    if (
      worldEntity.type == "underground-belt" ||
      !worldEntity.supports_direction ||
      worldEntity.direction == direction.north
    )
      return
    assert(worldEntity.rotate({ by_player: ctx.player }))

    if (!canBeAnyDirection(worldEntity)) {
      expect(entity.direction).toBe(defines.direction.south)
    }
    ctx.assertEntityCorrect(entity, false)
  })

  test("rotation forbidden at higher stage", () => {
    const entity = buildEntity(3)
    const worldEntity = entity.getWorldEntity(4)!
    if (!worldEntity.supports_direction || worldEntity.direction == direction.north) return
    worldEntity.rotatable = true
    worldEntity.rotate({ by_player: ctx.player })
    expect(entity.direction).toBe(direction.east)
    ctx.assertEntityCorrect(entity, false)
  })

  test("can upgrade at first stage via fast replace", () => {
    const dir = direction.east
    const entity = buildEntity(3)
    ctx.player.teleport(ctx.player.position, ctx.project.getSurface(3))
    ctx.player.cursor_stack!.set_stack(upgradeName)
    ctx.player.build_from_cursor({ position: pos, direction: dir })

    expect(entity.firstValue.name).toBe(upgradeName)
    expect(entity.hasStageDiff()).toBe(false)

    ctx.assertEntityCorrect(entity, false)
  })

  test("can create upgrade", () => {
    const entity = buildEntity(3)
    const worldEntity = entity.getWorldEntity(4)!
    worldEntity.order_upgrade({
      force: worldEntity.force,
      target: upgradeName,
      player: ctx.player,
    })

    expect(entity.firstValue.name).toBe(name)
    expect(entity.getStageDiff(4)).toEqual({ name: upgradeName })
    expect(entity.getWorldEntity(4)!.name).toBe(upgradeName)
    expect(entity.getWorldEntity(5)!.name).toBe(upgradeName)
    ctx.assertEntityCorrect(entity, false)
  })

  test("upgrading entities still updates error entity previews", () => {
    createEntity(5, { name: "stone-wall" })
    const entity = buildEntity(3)

    let preview = entity.getWorldOrPreviewEntity(5)!
    expect(isPreviewEntity(preview)).toBe(true)
    expect(preview.name).toBe(Prototypes.PreviewEntityPrefix + name)

    ctx.assertEntityCorrect(entity, 5)

    entity.getWorldOrPreviewEntity(4)!.order_upgrade({
      force: "player",
      target: upgradeName,
      player: ctx.player,
    })

    preview = entity.getWorldOrPreviewEntity(5)!
    expect(isPreviewEntity(preview)).toBe(true)
    expect(preview.name).toBe(Prototypes.PreviewEntityPrefix + upgradeName)

    ctx.assertEntityCorrect(entity, 5)
  })

  test("can move entity up", () => {
    const entity = buildEntity(3)
    ctx.project.actions.onMoveEntityToStageCustomInput(entity.getWorldOrPreviewEntity(4)!, 4, ctx.player.index)
    expect(entity.firstStage).toBe(4)
    ctx.assertEntityCorrect(entity, false)
  })

  test("can move entity down", () => {
    const entity = buildEntity(3)
    ctx.project.actions.onMoveEntityToStageCustomInput(entity.getWorldOrPreviewEntity(2)!, 2, ctx.player.index)
    expect(entity.firstStage).toBe(2)
    ctx.assertEntityCorrect(entity, false)
  })

  if (diff) {
    if (!applyToEntity) error("applyToEntity not set")
    const keys = Object.keys(diff)

    test("can update value at first stage from world", () => {
      const entity = buildEntity(3)
      const worldEntity = entity.getWorldEntity(3)!
      applyToEntity(worldEntity)
      const ret = ctx.project.updates.tryUpdateEntityFromWorld(entity, 3)
      expect(ret).toBe(EntityUpdateResult.Updated)
      expect(entity.firstValue).toMatchTable(diff)
      ctx.assertEntityCorrect(entity, false)
    })

    test("updating higher value from world", () => {
      const entity = buildEntity(3)
      const worldEntity = entity.getWorldEntity(4)!
      applyToEntity(worldEntity)
      const ret = ctx.project.updates.tryUpdateEntityFromWorld(entity, 4)
      expect(ret).toBe(EntityUpdateResult.Updated)
      expect(entity.firstValue).not.toMatchTable(diff)
      expect(entity.hasStageDiff(4)).toBe(true)
      expect(entity.getStageDiff(4)).toEqual(diff)

      ctx.assertEntityCorrect(entity, false)
    })

    test("refreshing and rebuilding an entity with diffs", () => {
      const entity = buildEntity(2)
      entity._applyDiffAtStage(5, { name: upgradeName })
      entity._applyDiffAtStage(3, diff)
      ctx.project.worldUpdates.refreshAllWorldEntities(entity)
      for (const stage of $range(1, 6)) {
        ctx.project.worldUpdates.refreshWorldEntityAtStage(entity, stage)
        ctx.assertEntityCorrect(entity, false)
      }
      for (const stage of $range(1, 6)) {
        ctx.project.worldUpdates.rebuildWorldEntityAtStage(entity, stage)
        ctx.assertEntityCorrect(entity, false)
      }
      for (const stage of $range(1, 6)) {
        ctx.project.worldUpdates.rebuildStage(stage)
        ctx.assertEntityCorrect(entity, false)
      }
      ctx.project.worldUpdates.rebuildAllStages()
      runEntireCurrentTask()
      ctx.assertEntityCorrect(entity, false)
    })

    test("resetProp", () => {
      const entity = buildEntity(3)
      entity._applyDiffAtStage(4, diff)
      for (const key of keys) {
        ctx.project.updates.resetProp(entity, 4, key as keyof BlueprintEntity)
      }
      expect(entity.hasStageDiff()).toBe(false)
      expect(entity.firstValue).not.toMatchTable(diff)
      expect(entity.hasStageDiff()).toBe(false)
      ctx.assertEntityCorrect(entity, false)
    })

    test("movePropDown", () => {
      const entity = buildEntity(3)
      entity._applyDiffAtStage(4, diff)
      for (const key of keys) {
        ctx.project.updates.movePropDown(entity, 4, key as keyof BlueprintEntity)
      }
      expect(entity.hasStageDiff()).toBe(false)
      expect(entity.firstValue).toMatchTable(diff)
      ctx.assertEntityCorrect(entity, false)
    })

    test("resetAllProps", () => {
      const entity = buildEntity(3)
      entity._applyDiffAtStage(4, diff)
      ctx.project.updates.resetAllProps(entity, 4)
      expect(entity.hasStageDiff()).toBe(false)
      expect(entity.firstValue).not.toMatchTable(diff)
      ctx.assertEntityCorrect(entity, false)
    })

    test("moveAllPropsDown", () => {
      const entity = buildEntity(3)
      entity._applyDiffAtStage(4, diff)
      ctx.project.updates.moveAllPropsDown(entity, 4)
      expect(entity.hasStageDiff()).toBe(false)
      expect(entity.firstValue).toMatchTable(diff)
      ctx.assertEntityCorrect(entity, false)
    })
  }

  test("using stage delete tool", () => {
    const entity = ctx.buildEntity(1, { name: "inserter", position: pos, direction: direction.west })
    Events.raiseFakeEventNamed("on_player_selected_area", {
      player_index: ctx.player.index,
      item: Prototypes.StageDeconstructTool,
      entities: [entity.getWorldEntity(3)!],
      tiles: [],
      surface: ctx.surfaces[2],
      area: { left_top: pos, right_bottom: pos },
    })

    expect(entity.lastStage).toBe(2)
    ctx.assertEntityCorrect(entity, false)
  })

  test("using stage delete tool alt select", () => {
    const entity = ctx.buildEntity(1, { name: "inserter", position: pos, direction: direction.west })
    ctx.project.actions.userSetLastStageWithUndo(entity, 3, ctx.player.index)

    Events.raiseFakeEventNamed("on_player_alt_selected_area", {
      player_index: ctx.player.index,
      item: Prototypes.StageDeconstructTool,
      entities: [entity.getWorldEntity(3)!],
      tiles: [],
      surface: ctx.surfaces[2],
      area: { left_top: pos, right_bottom: pos },
    })

    expect(entity.lastStage).toBe(nil)
    ctx.assertEntityCorrect(entity, false)

    _simulateUndo(ctx.player)

    expect(entity.lastStage).toBe(3)
  })
})
