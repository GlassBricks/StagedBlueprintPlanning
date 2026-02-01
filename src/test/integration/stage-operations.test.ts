// Copyright (c) 2022-2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { InserterBlueprintEntity } from "factorio:runtime"
import expect from "tstl-expect"
import { Prototypes } from "../../constants"
import { isPreviewEntity } from "../../entity/prototype-info"
import { assert, Events } from "../../lib"
import { Pos } from "../../lib/geometry"
import { runEntireCurrentTask } from "../../lib/task"
import { checkForEntityUpdates } from "../../project/event-handlers"
import { StageMoveResult } from "../../project/ProjectActions"
import { NormalSurfaceSettings, syncMapGenSettings } from "../../project/surfaces"
import { applyDiffViaWorld, setupEntityIntegrationTest } from "./integration-test-util"
import direction = defines.direction

const ctx = setupEntityIntegrationTest()
const pos = Pos(10.5, 10.5)

test.each([
  "straight-rail",
  "half-diagonal-rail",
  "curved-rail-a",
  "curved-rail-b",
  "legacy-curved-rail",
  "legacy-straight-rail",
])("can create %s with correct previews", (name) => {
  const pos = Pos(10.5, 10.5)
  const entity = ctx.buildEntity(3, { name, position: pos })
  const worldEntity = ctx.wp.getWorldEntity(entity, 3)!
  expect(entity.position).toEqual(worldEntity.position)
  ctx.assertEntityCorrect(entity, false)
})

test("rebuildStage", () => {
  const entityPresent = ctx.buildEntity(2, { name: "inserter", position: pos.add(1, 0), direction: direction.west })
  const entityPreview = ctx.buildEntity(3, { name: "inserter", position: pos.add(2, 0), direction: direction.west })
  const entityPastLastStage = ctx.buildEntity(1, {
    name: "inserter",
    position: pos.add(3, 0),
    direction: direction.west,
  })
  expect(ctx.project.actions.trySetLastStage(entityPastLastStage, 1)).toEqual(StageMoveResult.Updated)
  entityPresent._asMut()._applyDiffAtStage(4, { name: "bulk-inserter" })
  ctx.wp.refreshAllEntities(entityPresent)
  ctx.assertEntityCorrect(entityPresent, false)

  for (const stage of $range(1, 6)) {
    ctx.wp.rebuildStage(stage)

    ctx.assertEntityCorrect(entityPresent, false)
    ctx.assertEntityCorrect(entityPreview, false)
    ctx.assertEntityCorrect(entityPastLastStage, false)
  }
})

test("can update an infinity accumulator", () => {
  assert("EditorExtensions" in script.active_mods)
  const entity = ctx.buildEntity(1, { name: "ee-infinity-accumulator-primary-input", position: pos })
  expect(ctx.wp.getWorldOrPreviewEntity(entity, 2)?.name).toEqual("ee-infinity-accumulator-primary-input")

  const oldLuaEntity = ctx.wp.getWorldEntity(entity, 1)!
  const newLuaEntity = ctx.createEntity(1, {
    name: "ee-infinity-accumulator-primary-output",
    position: pos,
  })
  oldLuaEntity.destroy()
  checkForEntityUpdates(newLuaEntity, nil)

  expect(entity).toMatchTable({
    firstValue: { name: "ee-infinity-accumulator-primary-output" },
  })
  expect(ctx.wp.getWorldOrPreviewEntity(entity, 1)?.name).toEqual("ee-infinity-accumulator-primary-output")
  expect(ctx.wp.getWorldOrPreviewEntity(entity, 2)?.name).toEqual("ee-infinity-accumulator-primary-output")
})

describe.skip("map gen settings", () => {
  // Skip due to causing hanging process for some reason
  after_each(() => {
    ctx.surfaces.forEach((s) => {
      s.generate_with_lab_tiles = true
      s.clear()
    })
  })
  test("rebuild stage after sync map gen settings", () => {
    const entity = ctx.buildEntity(1, { name: "inserter", position: pos, direction: direction.west })
    assert(ctx.project.settings.surfaceSettings.type == "normal")
    ctx.project.settings.surfaceSettings = { ...ctx.project.settings.surfaceSettings, planet: "vulcanus" }
    ctx.assertEntityCorrect(entity, false)
    ctx.surfaces[0].generate_with_lab_tiles = false
    ctx.player.teleport(pos, ctx.surfaces[0])
    syncMapGenSettings(ctx.project.getStage(1)!)
    after_ticks(60, () => {
      expect((ctx.project.settings.surfaceSettings as NormalSurfaceSettings).planet).toBe("vulcanus")
      ctx.assertEntityCorrect(entity, false)
    })
  })
  test("adding a new stage gets map settings from project", () => {
    ctx.surfaces[2].map_gen_settings = {
      ...ctx.surfaces[2].map_gen_settings,
      seed: 42,
    }
    ctx.surfaces[2].generate_with_lab_tiles = false
    syncMapGenSettings(ctx.project.getStage(3)!)
    ctx.project.insertStage(4)
    expect(ctx.project.surfaces.getSurface(4)).toMatchTable({
      map_gen_settings: { seed: 42 },
      generate_with_lab_tiles: false,
    })
  })
})

describe("stage deletion", () => {
  function createBaseEntities() {
    const entityAtStage = ctx.buildEntity(3, {
      name: "inserter",
      position: pos.add(1, 0),
    })

    const entityAfterStage = ctx.buildEntity(4, {
      name: "inserter",
      position: pos.add(2, 0),
    })

    const entityWithLastStage = ctx.buildEntity(1, {
      name: "inserter",
      position: pos.add(3, 0),
    })
    ctx.project.actions.trySetLastStage(entityWithLastStage, 3)

    return { entityAtStage, entityAfterStage, entityWithLastStage }
  }

  function createTestEntitiesForMerge() {
    const entityBeforeWithDiff = ctx.buildEntity<InserterBlueprintEntity>(2, {
      name: "inserter",
      position: pos.add(0, 0),
    })
    entityBeforeWithDiff._asMut()._applyDiffAtStage(3, { override_stack_size: 3 })
    ctx.wp.updateWorldEntities(entityBeforeWithDiff, 3)

    return { entityBeforeWithDiff, ...createBaseEntities() }
  }

  function createTestEntitiesForDiscard() {
    const entityBeforeWithDiff = ctx.buildEntity<InserterBlueprintEntity>(2, {
      name: "inserter",
      position: pos.add(0, 0),
    })
    entityBeforeWithDiff._asMut()._applyDiffAtStage(3, { override_stack_size: 3 })
    entityBeforeWithDiff._asMut()._applyDiffAtStage(4, { override_stack_size: 4 })
    ctx.wp.updateWorldEntities(entityBeforeWithDiff, 3)
    ctx.wp.updateWorldEntities(entityBeforeWithDiff, 4)

    return { entityBeforeWithDiff, ...createBaseEntities() }
  }

  function assertAllInsertersInProject() {
    for (const stage of $range(1, ctx.project.settings.stageCount())) {
      const entitiesOnSurface = ctx.surfaces[stage - 1].find_entities_filtered({ type: "inserter" })
      for (const worldEntity of entitiesOnSurface) {
        if (isPreviewEntity(worldEntity)) continue
        const projectEntity = ctx.project.content.findCompatibleWithLuaEntity(worldEntity, nil, stage)
        expect(projectEntity)
          .comment(
            `Entity ${worldEntity.name} at ${worldEntity.position.x},${worldEntity.position.y} on stage ${stage}`,
          )
          .not.toBeNil()
      }
    }
  }

  test("merge stage 3 and verify entity updates", () => {
    const { entityBeforeWithDiff, entityAtStage, entityAfterStage, entityWithLastStage } = createTestEntitiesForMerge()

    ctx.project.mergeStage(3)

    expect(entityBeforeWithDiff.getValueAtStage(2)).toEqual({
      name: "inserter",
      override_stack_size: 3,
    })
    expect(entityBeforeWithDiff.hasStageDiff()).toBe(false)

    expect(entityAtStage.firstStage).toBe(2)
    expect(ctx.project.content.hasEntity(entityAtStage)).toBe(true)

    expect(entityAfterStage.firstStage).toBe(3)
    expect(ctx.project.content.hasEntity(entityAfterStage)).toBe(true)

    expect(entityWithLastStage.lastStage).toBe(2)

    ctx.assertEntityCorrect(entityBeforeWithDiff, false)
    ctx.assertEntityCorrect(entityAtStage, false)
    ctx.assertEntityCorrect(entityAfterStage, false)
    ctx.assertEntityCorrect(entityWithLastStage, false)

    assertAllInsertersInProject()
  })

  test("discard stage 3 and verify entity updates", () => {
    const { entityBeforeWithDiff, entityAtStage, entityAfterStage, entityWithLastStage } =
      createTestEntitiesForDiscard()

    ctx.project.discardStage(3)

    expect(entityBeforeWithDiff.getValueAtStage(2)).toEqual({
      name: "inserter",
      override_stack_size: 1,
    })
    expect(entityBeforeWithDiff.getValueAtStage(3)).toEqual({
      name: "inserter",
      override_stack_size: 4,
    })
    expect(entityBeforeWithDiff.stageDiffs).toEqual({
      3: { override_stack_size: 4 },
    })

    expect(ctx.project.content.hasEntity(entityAtStage)).toBe(false)
    expect(ctx.wp.getWorldEntity(entityAtStage, 1)).toBeNil()
    expect(ctx.wp.getWorldEntity(entityAtStage, 2)).toBeNil()

    expect(entityAfterStage.firstStage).toBe(3)
    expect(ctx.project.content.hasEntity(entityAfterStage)).toBe(true)

    expect(entityWithLastStage.lastStage).toBe(2)

    ctx.assertEntityCorrect(entityBeforeWithDiff, false)
    ctx.assertEntityCorrect(entityAfterStage, false)
    ctx.assertEntityCorrect(entityWithLastStage, false)

    assertAllInsertersInProject()
  })
})

describe("stage insertion", () => {
  function assertAllInsertersInProject() {
    for (const stage of $range(1, ctx.project.settings.stageCount())) {
      const entitiesOnSurface = ctx.surfaces[stage - 1].find_entities_filtered({ type: "inserter" })
      for (const worldEntity of entitiesOnSurface) {
        if (isPreviewEntity(worldEntity)) continue
        const projectEntity = ctx.project.content.findCompatibleWithLuaEntity(worldEntity, nil, stage)
        expect(projectEntity)
          .comment(
            `Entity ${worldEntity.name} at ${worldEntity.position.x},${worldEntity.position.y} on stage ${stage}`,
          )
          .not.toBeNil()
      }
    }
  }

  function setLastStageViaDeconstructTool(
    entity: import("../../entity/ProjectEntity").ProjectEntity,
    atStage: import("../../entity/ProjectEntity").StageNumber,
  ) {
    Events.raiseFakeEventNamed("on_player_selected_area", {
      player_index: ctx.player.index,
      item: Prototypes.StageDeconstructTool,
      entities: [ctx.wp.getWorldEntity(entity, atStage)!],
      tiles: [],
      surface: ctx.surfaces[atStage - 1],
      area: { left_top: pos, right_bottom: pos },
    })
  }

  test("insert stage in the middle", () => {
    const entityWithDiff = ctx.buildEntity(2, { position: pos })
    applyDiffViaWorld(ctx.wp, entityWithDiff, 4, (e) => {
      e.inserter_stack_size_override = 2
    })

    const entityAtStage3 = ctx.buildEntity(3, { position: pos.add(1, 0) })

    const entityWithLastStage = ctx.buildEntity(1, { position: pos.add(2, 0) })
    setLastStageViaDeconstructTool(entityWithLastStage, 4)
    expect(entityWithLastStage.lastStage).toBe(3)

    ctx.project.insertStage(3)
    ctx.surfaces = ctx.project.getAllStages().map((stage) => stage.getSurface())

    expect(entityWithDiff.firstStage).toBe(2)
    expect(entityWithDiff.hasStageDiff(5)).toBe(true)
    expect(entityWithDiff.getStageDiff(5)).toEqual({ override_stack_size: 2 })

    expect(entityAtStage3.firstStage).toBe(4)

    expect(entityWithLastStage.lastStage).toBe(4)

    ctx.assertEntityCorrect(entityWithDiff, false)
    ctx.assertEntityCorrect(entityAtStage3, false)
    ctx.assertEntityCorrect(entityWithLastStage, false)
    assertAllInsertersInProject()
  })

  test("insert stage at beginning", () => {
    const entity = ctx.buildEntity(1, { position: pos })

    ctx.project.insertStage(1)
    ctx.surfaces = ctx.project.getAllStages().map((stage) => stage.getSurface())

    expect(entity.firstStage).toBe(2)
    const preview = ctx.wp.getWorldOrPreviewEntity(entity, 1)
    expect(preview).toBeAny()
    expect(isPreviewEntity(preview!)).toBe(true)
    ctx.assertEntityCorrect(entity, false)
  })

  test("insert stage at end", () => {
    const entity = ctx.buildEntity(1, { position: pos })
    setLastStageViaDeconstructTool(entity, 6)
    expect(entity.lastStage).toBe(5)

    ctx.project.insertStage(ctx.project.settings.stageCount() + 1)
    ctx.surfaces = ctx.project.getAllStages().map((stage) => stage.getSurface())

    expect(entity.lastStage).toBe(5)
    ctx.assertEntityCorrect(entity, false)
  })
})

describe("resyncWithWorld", () => {
  test("discovers new entities and reads updates from world", () => {
    const entity1 = ctx.buildEntity(1, { position: Pos(5.5, 5.5) })
    ctx.assertEntityCorrect(entity1, false)

    const entity2Pos = Pos(7.5, 7.5)
    const unregisteredEntity = ctx.surfaces[0].create_entity({
      name: "inserter",
      position: entity2Pos,
      direction: defines.direction.north,
      force: "player",
    })!
    unregisteredEntity.inserter_stack_size_override = 1

    ctx.wp.getWorldEntity(entity1, 3)!.inserter_stack_size_override = 3
    unregisteredEntity.clone({ position: entity2Pos, surface: ctx.surfaces[2] })!.inserter_stack_size_override = 5

    ctx.project.resyncWithWorld()
    runEntireCurrentTask()

    expect(entity1.stageDiffs).toMatchTable({ 3: { override_stack_size: 3 } })

    const entity2 = ctx.project.content.findCompatibleEntity("inserter", entity2Pos, nil, 1)
    expect(entity2).toBeAny()
    expect(entity2!.firstStage).toBe(1)
    expect(entity2!.stageDiffs).toMatchTable({ 3: { override_stack_size: 5 } })

    ctx.assertEntityCorrect(entity1, false)
    ctx.assertEntityCorrect(entity2!, false)
  })
})
