// Copyright (c) 2022-2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { CarBlueprintEntity } from "factorio:runtime"
import expect from "tstl-expect"
import { MovableProjectEntity, ProjectEntity } from "../../entity/ProjectEntity"
import { isPreviewEntity } from "../../entity/prototype-info"
import { assert } from "../../lib"
import { Pos } from "../../lib/geometry"
import { checkForEntityUpdates } from "../../project/event-handlers"
import { createRollingStock } from "../entity/createRollingStock"
import { setupEntityIntegrationTest } from "./integration-test-util"

const ctx = setupEntityIntegrationTest()
const pos = Pos(10.5, 10.5)

describe("train entities", () => {
  function assertTrainEntityCorrect(entity: MovableProjectEntity, expectedHasError: number | false) {
    expect(entity.lastStage).toBe(entity.firstStage)
    ctx.assertEntityCorrect(entity, expectedHasError)
  }

  test("create train entity", () => {
    const train = createRollingStock(ctx.surfaces[3 - 1])
    const entity = ctx.project.actions.addNewEntity(train, 3)!
    expect(entity).toBeAny()
    assertTrainEntityCorrect(entity, false)
  })
  test("train entity error", () => {
    const train = createRollingStock(ctx.surfaces[3 - 1])
    const entity = ctx.project.actions.addNewEntity(train, 3)!
    train.destroy()
    ctx.surfaces[3 - 1].find_entities().forEach((e) => e.destroy())

    ctx.wp.refreshAllEntities(entity)
    assertTrainEntityCorrect(entity, 3)
  })
  test("inserting a stage keeps train in same stage", () => {
    const train = createRollingStock(ctx.surfaces[3 - 1])
    const entity = ctx.project.actions.addNewEntity(train, 3)!
    expect(entity).toBeAny()
    expect(entity.lastStage).toBe(3)
    ctx.project.insertStage(4)
    expect(entity.firstStage).toBe(3)
    expect(entity.lastStage).toBe(3)
    assertTrainEntityCorrect(entity, false)
  })
  test("Moving a train also sets its last stage", () => {
    const train = createRollingStock(ctx.surfaces[3 - 1])
    const entity = ctx.project.actions.addNewEntity(train, 3)!
    ctx.project.actions.trySetFirstStage(entity, 2)
    expect(entity.firstStage).toBe(2)
    expect(entity.lastStage).toBe(2)
    assertTrainEntityCorrect(entity, 2)
  })
  test("resetVehicleLocation preserves preview entities at earlier stages", () => {
    const trainLuaEntity = createRollingStock(ctx.surfaces[3 - 1])
    const entity = ctx.project.actions.addNewEntity(trainLuaEntity, 3)!
    assertTrainEntityCorrect(entity, false)

    for (const stage of $range(1, 2)) {
      const preview = ctx.wp.getWorldOrPreviewEntity(entity, stage)
      assert(preview, `preview must exist at stage ${stage} before reset`)
      assert(isPreviewEntity(preview), `entity at stage ${stage} must be preview`)
    }

    ctx.project.actions.resetVehicleLocation(entity)

    for (const stage of $range(1, 2)) {
      const preview = ctx.wp.getWorldOrPreviewEntity(entity, stage)
      assert(preview, `preview must exist at stage ${stage} after reset`)
      assert(isPreviewEntity(preview), `entity at stage ${stage} must be preview after reset`)
    }
    assertTrainEntityCorrect(entity, false)
  })
})

describe("vehicles", () => {
  test("can create a vehicle", () => {
    const carEntity = ctx.buildEntity(1, { name: "car", orientation: 0.25 })
    expect(carEntity.isMovable()).toBe(true)
    expect(carEntity.lastStage).toBe(1)
    ctx.assertEntityCorrect(carEntity, false)
  })

  test("can save a vehicle with grid", () => {
    const projectEntity = ctx.buildEntity<CarBlueprintEntity>(1, { name: "tank", orientation: 0.25 })
    const worldEntity = ctx.wp.getWorldEntity(projectEntity, 1)!
    expect(worldEntity.name).toBe("tank")

    worldEntity.grid!.put({ name: "solar-panel-equipment" })

    checkForEntityUpdates(worldEntity, nil)
    checkProjectEntityCorrect(projectEntity)

    ctx.wp.rebuildStage(1)

    checkProjectEntityCorrect(projectEntity)

    const newWorldEntity = ctx.wp.getWorldEntity(projectEntity, 1)!
    checkForEntityUpdates(newWorldEntity, nil)
    checkProjectEntityCorrect(projectEntity)

    function checkProjectEntityCorrect(projectEntity: ProjectEntity<CarBlueprintEntity>) {
      expect(projectEntity.getUnstagedValue(1)).toBeNil()
      expect(projectEntity.getValueAtStage(1)?.grid).toEqual([
        {
          equipment: { name: "solar-panel-equipment" },
          position: { x: 0, y: 0 },
        },
      ])
      expect(projectEntity.getValueAtStage(1)?.items).toBe(nil)
      ctx.assertEntityCorrect(projectEntity, false)
    }
  })
})

test("deleting train by removing rail under it", () => {
  const trainEntity = createRollingStock(ctx.surfaces[0], nil, true)
  let train: ProjectEntity | nil
  for (const entity of ctx.project.content.allEntities()) {
    if (entity.firstValue.name == "locomotive") {
      train = entity
      break
    }
  }
  assert(train)
  assert(trainEntity.destroy({ raise_destroy: false }))
  expect(trainEntity.valid).toBe(false)
  after_ticks(1, () => {
    expect(ctx.project.content.hasEntity(train)).toBe(false)
  })
})

test("rebuilding stage does not delete train", () => {
  const trainEntity = createRollingStock(ctx.surfaces[0], nil, true)
  let train: ProjectEntity | nil
  for (const entity of ctx.project.content.allEntities()) {
    if (entity.firstValue.name == "locomotive") {
      train = entity
      break
    }
  }
  assert(train)
  ctx.wp.rebuildStage(1)
  expect(trainEntity.valid).toBe(false)
  expect(ctx.project.content.hasEntity(train)).toBe(true)
  const newTrain = ctx.surfaces[0].find_entities_filtered({ name: "locomotive" })[0]
  expect(newTrain).not.toBeNil()
})

test("rebuilding stage places wagon and elevated rails correctly", () => {
  const bp =
    "0eNqVk+FugyAUhd+F39oIilZfZVkM6p0jQzCAdk3ju++iXdt0Ltl+kQsn3zlcLhfSqAlGK7Un1YU4LcbYm7i3sgv1J6loFpEzqbIlIqJxRk0e4iAbpe5J5e0EERmNk14aHVtQwssZnhjHFcEQIVujHale0Er2Wqgg0GIAUhErpCJBojsIvkv0iyh20zga6x/EbHmNCGiPKWDDr8W51tPQgEVa9E1ohe1NfBK90eSe/Bq0ONCSp5TxNTA90IIXRyyXQBeNglqZXjovW1ef3iXWg5nXRrwJ5bATxkp0FhsyObAsSZIckVlRHHmZlUVSJBtf6hmVxqKPnpQKt33KzG6ZQcEsPHRxO9kZl7UL4mf8fIuNaTtpod1OKNthp/9m02QPnu+ws2j3tX4Q09tUPADTHSD/I5DuEnmYDedN+1Hj8Olt+zqDYTfcCRXSw4AO9+8QkRms2xA5w7crOWc8Txldli/P6xAi"
  const stack = ctx.player.cursor_stack!
  stack.set_stack("blueprint")
  stack.import_stack(bp)

  const wagon = ctx.surfaces[0].find_entities_filtered({ name: "cargo-wagon" })[0]
  expect(wagon).toBeNil()

  ctx.player.teleport([0, 0], ctx.surfaces[0])
  ctx.player.build_from_cursor({ position: pos, direction: 0, build_mode: defines.build_mode.forced })

  ctx.wp.rebuildAllStages()

  const rail = ctx.surfaces[0].find_entities_filtered({ name: "elevated-curved-rail-a" })[0]
  expect(rail).not.toBeNil()

  const wagon2 = ctx.surfaces[0].find_entities_filtered({ name: "cargo-wagon" })[0]
  expect(wagon2).not.toBeNil()
})

test("newly created train does not get set to automatic", () => {
  const bp =
    "0eNqtlNtuwyAMht/F16QqTUiavMpURTRlKRqBCkgPqvLugyRtt7WVfLE7bOzvx4B9ha3qxcFK7aG6gmyMdlB9XMHJVnMVfZp3AiqwXCoYCEi9E2eo6LAhILSXXoopYzQute67rbAhgNwyfUjVifPmAAQOxoUUoyM5YJKCwCXSCOykFc20RVcEnOeTAefGch2knyRWdwkXNdq9T8ZTvlNJf6tkL5ApGsmwyAyNTLFIhkZSLDK/I5VpTGe8PIpn3nJRpsWjcqH5VolamVY6LxtXn/Yy2J05St1C9cmVEwSMlUFsfs3lomAv5AtsReiC1lgi+tZLLBH9Nejyjmy4bU1y4m2IfQIW/3DtKxZ79xhcxgaO7pV6dSKKLRLdUhTdpiUaiW5T+ua/hOHlmr3Y9WqeXo9fH+38x34khUxjd/Nk/DuYNsOI86b5qsP81JPKLTh4x+7a8rigy1jO7I3PP7nzSJBedIH6GMgEjsK6UYvlqzIrS8YYXWd5NgzfVMfqjA=="
  const stack = ctx.player.cursor_stack!
  stack.set_stack("blueprint")
  stack.import_stack(bp)

  ctx.player.teleport([0, 0], ctx.surfaces[0])
  ctx.player.build_from_cursor({ position: pos, direction: 0 })

  const train = ctx.surfaces[0].find_entities_filtered({ name: "locomotive" })[0]
  train.train!.manual_mode = false
  expect(train).toBeAny()
  after_ticks(2, () => {
    expect(train.train?.manual_mode).toBe(true)
    expect(train.train?.speed).toBe(0)
  })
})
