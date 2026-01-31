// Copyright (c) 2022-2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import {
  AssemblingMachineBlueprintEntity,
  BlueprintEntity,
  InserterBlueprintEntity,
  LoaderBlueprintEntity,
  LuaEntity,
  LuaSurface,
  SurfaceCreateEntity,
  UndergroundBeltSurfaceCreateEntity,
} from "factorio:runtime"
import expect, { mock } from "tstl-expect"
import { Entity, InserterEntity, UndergroundBeltEntity } from "../../entity/Entity"
import {
  MovableProjectEntity,
  newProjectEntity,
  ProjectEntity,
  StageDiffsInternal,
  StageNumber,
} from "../../entity/ProjectEntity"
import { findUndergroundPair } from "../../entity/underground-belt"
import { StageInfoExport } from "../../import-export/entity"
import { Pos } from "../../lib/geometry"
import { EntityUpdateResult, ProjectUpdates, StageMoveResult } from "../../project/project-updates"
import { ProjectBase } from "../../project/Project"
import { WorldUpdates } from "../../project/world-updates"
import { createRollingStock, createRollingStocks } from "../entity/createRollingStock"
import { fMock } from "../f-mock"
import { moduleMock } from "../module-mock"
import { createMockProject, setupTestSurfaces } from "./Project-mock"
import _wireHandler = require("../../entity/wires")
import direction = defines.direction

const pos = Pos(10.5, 10.5)

let project: ProjectBase
const surfaces: LuaSurface[] = setupTestSurfaces(6)
function wp() {
  return project.worldPresentation
}

const worldUpdates = fMock<WorldUpdates>()
const wireSaver = moduleMock(_wireHandler, true)

let projectUpdates: ProjectUpdates
before_each(() => {
  project = createMockProject(surfaces)
  project.worldUpdates = worldUpdates
  project.updates = projectUpdates = ProjectUpdates(project, project.worldUpdates)
})

let expectedWuCalls: number
before_each(() => {
  expectedWuCalls = 0

  wireSaver.saveWireConnections.returns(false as any)

  game.surfaces[1].find_entities().forEach((e) => e.destroy())
})

function numWuCalls(): number {
  let worldUpdaterCalls = 0
  for (const [, mock] of pairs(worldUpdates)) {
    worldUpdaterCalls += mock.numCalls
  }
  return worldUpdaterCalls
}
after_each(() => {
  const worldUpdaterCalls = numWuCalls()
  if (expectedWuCalls == worldUpdaterCalls) return

  let message = `expected ${expectedWuCalls} calls to worldUpdater, got ${worldUpdaterCalls}\n`
  for (const [key, fn] of pairs(worldUpdates)) {
    if (fn.calls.length > 0) {
      message += `  ${key} called ${fn.calls.length} times\n`
    }
  }
  error(message)
})

function clearMocks(): void {
  mock.clear(worldUpdates)
  mock.clear(wireSaver)
  expectedWuCalls = 0
}

function assertWUNotCalled() {
  for (const [, spy] of pairs(worldUpdates)) {
    expect(spy).not.toHaveBeenCalled()
  }
}
function assertUpdateCalled(
  entity: ProjectEntity,
  startStage: StageNumber,
  n?: number,
  updateHighlights?: boolean,
): void {
  expectedWuCalls++
  if (n == nil) expect(numWuCalls()).toBe(1)
  expect(worldUpdates.updateWorldEntities).toHaveBeenNthCalledWith(n ?? 1, entity, startStage, updateHighlights)
  if (updateHighlights == false) {
    expect(worldUpdates.updateAllHighlights).toHaveBeenCalledWith(entity)
    expectedWuCalls++
  }
}

function assertUpdateOnLastStageChangedCalled(entity: ProjectEntity, oldLastStage: StageNumber | nil) {
  expectedWuCalls++
  expect(worldUpdates.updateWorldEntitiesOnLastStageChanged).toHaveBeenCalledWith(entity, oldLastStage)
}

function assertRefreshCalled(entity: ProjectEntity, stage: StageNumber) {
  expectedWuCalls++
  expect(worldUpdates.refreshWorldEntityAtStage).toHaveBeenCalledWith(entity, stage)
}
function assertResetUndergroundRotationCalled(entity: ProjectEntity, stage: StageNumber) {
  expectedWuCalls++
  expect(worldUpdates.resetUnderground).toHaveBeenCalledWith(entity, stage)
}
function assertReplaceCalled(entity: ProjectEntity, stage: StageNumber) {
  expectedWuCalls++
  expect(worldUpdates.rebuildWorldEntityAtStage).toHaveBeenCalledWith(entity, stage)
}
function assertDeleteWorldEntityCalled(entity: ProjectEntity) {
  expectedWuCalls++
  expect(numWuCalls()).toBe(1)
  expect(worldUpdates.deleteWorldEntities).toHaveBeenCalledWith(entity)
}
function assertMakeSettingsRemnantCalled(entity: ProjectEntity) {
  expectedWuCalls++
  expect(numWuCalls()).toBe(1)
  expect(worldUpdates.makeSettingsRemnant).toHaveBeenCalledWith(entity)
}
function assertReviveSettingsRemnantCalled(entity: ProjectEntity) {
  expectedWuCalls++
  expect(numWuCalls()).toBe(1)
  expect(worldUpdates.reviveSettingsRemnant).toHaveBeenCalledWith(entity)
}

function assertOneEntity() {
  expect(project.content.countNumEntities()).toBe(1)
}
function assertNEntities(n: number) {
  expect(project.content.countNumEntities()).toBe(n)
}
function assertNoEntities() {
  expect(project.content.countNumEntities()).toEqual(0)
}

function assertStageDiffs(entity: ProjectEntity, changes: StageDiffsInternal<BlueprintEntity>) {
  expect(entity.stageDiffs).toEqual(changes)
}

function createEntity(stageNum: StageNumber, args?: Partial<SurfaceCreateEntity>): LuaEntity {
  const params = {
    name: "fast-inserter",
    position: pos,
    force: "player",
    ...args,
  }
  const entity = assert(surfaces[stageNum - 1].create_entity(params), "created entity")[0]
  const proto = prototypes.entity[params.name as string]
  if (proto.type == "inserter") {
    entity.inserter_stack_size_override = 1
    entity.inserter_filter_mode = "whitelist"
  }
  return entity
}
function assertNewUpdated(entity: ProjectEntity) {
  expect(worldUpdates.updateNewWorldEntitiesWithoutWires).toHaveBeenCalledWith(entity)
  expectedWuCalls = 1
  if (entity.wireConnections) {
    expect(worldUpdates.updateWireConnections).toHaveBeenCalledWith(entity)
    expectedWuCalls++
  }
}

describe("addNewEntity()", () => {
  test("simple add", () => {
    const luaEntity = createEntity(2)
    const entity = projectUpdates.addNewEntity(luaEntity, 2)!
    expect(entity).toBeAny()
    expect(entity.firstValue.name).toBe("fast-inserter")
    expect(entity.position).toEqual(pos)
    expect(entity.direction).toBe(0)

    const found = project.content.findCompatibleWithLuaEntity(luaEntity, nil, 2) as ProjectEntity<BlueprintEntity>
    expect(found).toBe(entity)

    expect(wp().getWorldEntity(entity, 2)).toBe(luaEntity)

    assertOneEntity()
    assertNewUpdated(entity)
    expect(worldUpdates.updateAllHighlights).toHaveBeenCalledTimes(1)
    expectedWuCalls++
  })

  test.each([false, true])("with stored stage info, having diffs %s", (withDiffs) => {
    const luaEntity = createEntity(2)
    const entityUpgraded = projectUpdates.addNewEntity<InserterEntity>(luaEntity, 2, {
      firstStage: 1,
      lastStage: 5,
      firstValue: withDiffs
        ? {
            name: "inserter",
          }
        : nil,
      stageDiffs: withDiffs
        ? {
            "2": {
              name: "fast-inserter",
              override_stack_size: 2,
            } as Entity,
          }
        : nil,
      unstagedValue: withDiffs ? { 3: { _forTest: "foo" } } : nil,
    })!

    expect(entityUpgraded).toBeAny()
    expect(entityUpgraded.firstValue).toMatchTable({
      name: withDiffs ? "inserter" : "fast-inserter",
    })
    expect(entityUpgraded.firstStage).toBe(1)
    expect(entityUpgraded.lastStage).toBe(5)
    assertNewUpdated(entityUpgraded)
    if (withDiffs) {
      expect(entityUpgraded.stageDiffs).toEqual({
        2: {
          name: "fast-inserter",
          override_stack_size: 2,
        },
      })
      expect(entityUpgraded.getPropertyAllStages("unstagedValue")).toEqual({
        3: {
          _forTest: "foo",
        },
      })
    }
    expect(worldUpdates.updateAllHighlights).toHaveBeenCalledTimes(1)
    expectedWuCalls++
  })
})

function registerNewEntity(luaEntity: LuaEntity, stage: number): ProjectEntity<BlueprintEntity> {
  const entity = projectUpdates.addNewEntity(luaEntity, stage) as ProjectEntity<BlueprintEntity>
  expect(entity).toBeAny()
  clearMocks()
  wp().replaceWorldOrPreviewEntity(entity, stage, luaEntity)
  return entity
}
function addEntity<T extends BlueprintEntity>(
  stage: StageNumber,
  args?: Partial<SurfaceCreateEntity>,
): { entity: ProjectEntity<T>; luaEntity: LuaEntity } {
  const luaEntity = createEntity(stage, args)
  const entity = registerNewEntity(luaEntity, stage) as ProjectEntity<T>
  return { entity, luaEntity }
}

function addRollingStock(stage: StageNumber) {
  const luaEntity = createRollingStock(surfaces[stage - 1])
  const entity = registerNewEntity(luaEntity, stage)
  return { entity, luaEntity }
}

test("moving entity on preview replace", () => {
  const { entity } = addEntity<InserterBlueprintEntity>(2)

  expect(projectUpdates.trySetFirstStage(entity, 1)).toBe(StageMoveResult.Updated)

  expect(entity.firstStage).toEqual(1)
  expect(entity.firstValue.override_stack_size).toBe(1)
  expect(entity.hasStageDiff()).toBe(false)
  assertOneEntity()
  assertUpdateCalled(entity, 1)
})

test("tryReviveSettingsRemnant", () => {
  const { entity } = addEntity(2)
  entity._asMut().isSettingsRemnant = true

  projectUpdates.tryReviveSettingsRemnant(entity, 1)

  expect(entity.isSettingsRemnant).toBeNil()
  expect(entity.firstStage).toEqual(1)
  assertOneEntity()
  assertReviveSettingsRemnantCalled(entity)
})

test("cannot tryReviveSettingsRemnant if not a remnant", () => {
  const { entity } = addEntity(2)

  expect(projectUpdates.tryReviveSettingsRemnant(entity, 1)).toBe(StageMoveResult.NoChange)
  assertOneEntity()
  assertWUNotCalled()
})

describe("deleteEntityOrCreateSettingsRemnant()", () => {
  test("deletes normal entity", () => {
    const { entity } = addEntity(1)

    projectUpdates.deleteEntityOrCreateSettingsRemnant(entity)
    assertNoEntities()
    assertDeleteWorldEntityCalled(entity)
  })

  test("creates settings remnant if entity has stage diffs", () => {
    const { entity } = addEntity(1)
    entity._asMut()._applyDiffAtStage(2, { override_stack_size: 2 })

    projectUpdates.deleteEntityOrCreateSettingsRemnant(entity)

    expect(entity.isSettingsRemnant).toBe(true)
    assertOneEntity()
    assertMakeSettingsRemnantCalled(entity)
  })

  test("creates settings remnant if entity has circuit connections", () => {
    const { entity } = addEntity(1)
    const otherEntity = newProjectEntity({ name: "fast-inserter" }, Pos(0, 0), 0, 1)
    project.content.addEntity(otherEntity)
    project.content.addWireConnection({
      fromEntity: otherEntity,
      toEntity: entity,
      fromId: defines.wire_connector_id.circuit_green,
      toId: defines.wire_connector_id.circuit_green,
    })

    projectUpdates.deleteEntityOrCreateSettingsRemnant(entity)
    expect(entity.isSettingsRemnant).toBe(true)
    assertNEntities(2)
    assertMakeSettingsRemnantCalled(entity)
  })

  test("deletes if entity has with circuit connections, but connections have world entity", () => {
    const { entity } = addEntity(1)
    const otherEntity = newProjectEntity({ name: "fast-inserter" }, Pos(0, 0), 0, 1)
    project.content.addEntity(otherEntity)
    project.content.addWireConnection({
      fromEntity: otherEntity,
      toEntity: entity,
      fromId: defines.wire_connector_id.circuit_green,
      toId: defines.wire_connector_id.circuit_green,
    })
    wp().replaceWorldOrPreviewEntity(
      otherEntity,
      1,
      createEntity(1, {
        position: Pos.plus(entity.position, { x: 0, y: 1 }),
      }),
    )

    projectUpdates.deleteEntityOrCreateSettingsRemnant(entity)
    expect(entity.isSettingsRemnant).toBeNil()
    assertOneEntity()
    assertDeleteWorldEntityCalled(entity)
  })
})

test("forceDeleteEntity always deletes", () => {
  const { entity } = addEntity(1)
  entity._asMut().isSettingsRemnant = true

  projectUpdates.forceDeleteEntity(entity)

  assertNoEntities()
  assertDeleteWorldEntityCalled(entity)
})

describe("tryUpdateEntityFromWorld()", () => {
  test('with no changes returns "no-change"', () => {
    const { entity } = addEntity(2)
    const ret = projectUpdates.tryUpdateEntityFromWorld(entity, 2)
    expect(ret).toBe("no-change")
    assertOneEntity()
    assertWUNotCalled()
  })

  test('with change in first stage returns "updated" and updates all entities', () => {
    const { entity, luaEntity } = addEntity<InserterBlueprintEntity>(2)
    luaEntity.inserter_stack_size_override = 3
    const ret = projectUpdates.tryUpdateEntityFromWorld(entity, 2)
    expect(ret).toBe("updated")

    expect(entity.firstValue.override_stack_size).toBe(3)

    assertOneEntity()
    assertUpdateCalled(entity, 2)
  })

  test("can detect rotate by pasting", () => {
    const { luaEntity, entity } = addEntity(2, {
      name: "assembling-machine-2",
      recipe: "express-transport-belt",
    })
    luaEntity.direction = defines.direction.east
    const ret = projectUpdates.tryUpdateEntityFromWorld(entity, 2)
    expect(ret).toBe("updated")

    expect(entity.direction).toBe(defines.direction.east)
    assertOneEntity()
    assertUpdateCalled(entity, 2)
  })

  test("forbids rotate if in higher stage than first", () => {
    const { luaEntity, entity } = addEntity(2)
    luaEntity.direction = defines.direction.east

    wp().replaceWorldOrPreviewEntity(entity, 3, luaEntity)
    const ret = projectUpdates.tryUpdateEntityFromWorld(entity, 3)
    expect(ret).toBe("cannot-rotate")
    expect(entity.direction).toBe(defines.direction.north)

    assertOneEntity()
    assertRefreshCalled(entity, 3)
  })

  test.each([false, true])("integration: in higher stage, with changes: %s", (withExistingChanges) => {
    const { luaEntity, entity } = addEntity<InserterBlueprintEntity>(1)
    if (withExistingChanges) {
      entity._asMut()._applyDiffAtStage(2, { override_stack_size: 2, filter_mode: "blacklist" })
      luaEntity.inserter_filter_mode = "blacklist"
    }

    luaEntity.inserter_stack_size_override = 3
    wp().replaceWorldOrPreviewEntity(entity, 2, luaEntity)
    const ret = projectUpdates.tryUpdateEntityFromWorld(entity, 2)
    expect(ret).toBe("updated")

    expect(entity.firstValue.override_stack_size).toBe(1)
    if (withExistingChanges) {
      assertStageDiffs(entity, { 2: { override_stack_size: 3, filter_mode: "blacklist" } })
    } else {
      assertStageDiffs(entity, { 2: { override_stack_size: 3 } })
    }

    assertOneEntity()
    assertUpdateCalled(entity, 2)
  })

  test("integration: updating to match removes stage diff", () => {
    const { luaEntity, entity } = addEntity(1)
    entity._asMut()._applyDiffAtStage(2, { override_stack_size: 2 })
    expect(entity.hasStageDiff()).toBe(true)
    luaEntity.inserter_stack_size_override = 1

    wp().replaceWorldOrPreviewEntity(entity, 2, luaEntity)
    const ret = projectUpdates.tryUpdateEntityFromWorld(entity, 2)
    expect(ret).toBe("updated")
    expect(entity.hasStageDiff()).toBe(false)

    assertOneEntity()
    assertUpdateCalled(entity, 2)
  })
})

describe("tryRotateEntityFromWorld()", () => {
  test("in first stage rotates all entities", () => {
    const { luaEntity, entity } = addEntity(2)
    luaEntity.direction = direction.west
    const ret = projectUpdates.tryRotateEntityFromWorld(entity, 2)
    expect(ret).toBe("updated")
    expect(entity.direction).toBe(direction.west)
    assertOneEntity()
    assertUpdateCalled(entity, 2)
  })

  test("in higher stage forbids rotation", () => {
    const { luaEntity, entity } = addEntity(1)
    const oldDirection = luaEntity.direction
    luaEntity.direction = direction.west
    wp().replaceWorldOrPreviewEntity(entity, 2, luaEntity)
    const ret = projectUpdates.tryRotateEntityFromWorld(entity, 2)
    expect(ret).toBe("cannot-rotate")
    expect(entity.direction).toBe(oldDirection)
    assertOneEntity()
    assertRefreshCalled(entity, 2)
  })

  test("rotating loader also sets loader type", () => {
    const { luaEntity, entity } = addEntity<LoaderBlueprintEntity>(1, {
      name: "loader",
      direction: direction.north,
      type: "input",
    })
    luaEntity.rotate()
    const ret = projectUpdates.tryRotateEntityFromWorld(entity, 1)
    expect(ret).toBe("updated")
    expect(entity.direction).toBe(direction.south)
    expect(entity.firstValue.type).toBe("output")
    assertOneEntity()
    assertUpdateCalled(entity, 1)
  })
})

describe("ignores assembling machine rotation if no fluid inputs", () => {
  let luaEntity: LuaEntity, entity: ProjectEntity<AssemblingMachineBlueprintEntity>
  before_each(() => {
    ;({ luaEntity, entity } = addEntity<AssemblingMachineBlueprintEntity>(2, {
      name: "assembling-machine-2",
      direction: defines.direction.east,
    }))

    wp().replaceWorldOrPreviewEntity(entity, 3, luaEntity)
    // hacky way to rotate
    luaEntity.set_recipe("express-transport-belt")
    luaEntity.direction = defines.direction.south
    luaEntity.set_recipe(nil)
    expect(luaEntity.direction).toBe(defines.direction.south)
  })
  test("using update", () => {
    const ret = projectUpdates.tryUpdateEntityFromWorld(entity, 3)
    expect(ret).toBe("no-change")
    expect(entity.direction).toBe(0)

    assertOneEntity()
    assertWUNotCalled()
  })
  test("using rotate", () => {
    const ret = projectUpdates.tryRotateEntityFromWorld(entity, 3)
    expect(ret).toBe("no-change")
    expect(entity.direction).toBe(0)

    assertOneEntity()
    assertWUNotCalled()
  })
  test("can change recipe and rotate", () => {
    luaEntity.set_recipe("iron-gear-wheel")
    const ret = projectUpdates.tryUpdateEntityFromWorld(entity, 3)
    expect(ret).toBe("updated")
    expect(entity.getValueAtStage(3)!.recipe).toBe("iron-gear-wheel")

    assertOneEntity()
    assertUpdateCalled(entity, 3)
  })
  test("disallows if has fluid inputs", () => {
    luaEntity.set_recipe("express-transport-belt")
    const ret = projectUpdates.tryUpdateEntityFromWorld(entity, 3)
    expect(ret).toBe("cannot-rotate")

    assertOneEntity()
    assertRefreshCalled(entity, 3)
  })
})

describe("tryUpgradeEntityFromWorld()", () => {
  test("can apply upgrade", () => {
    const { luaEntity, entity } = addEntity(1)
    luaEntity.order_upgrade({
      force: luaEntity.force,
      target: "bulk-inserter",
    })
    const direction = luaEntity.direction
    const ret = projectUpdates.tryUpgradeEntityFromWorld(entity, 1)
    expect(ret).toBe("updated")
    expect(entity.firstValue.name).toBe("bulk-inserter")
    expect(entity.direction).toBe(direction)
    assertOneEntity()
    assertUpdateCalled(entity, 1)
  })
})

describe("updateWiresFromWorld()", () => {
  test("if saved, calls update", () => {
    const { entity } = addEntity(1)
    wireSaver.saveWireConnections.returnsOnce(true as any)
    const ret = projectUpdates.updateWiresFromWorld(entity, 1)
    expect(ret).toBe("updated")

    assertOneEntity()
    assertUpdateCalled(entity, 1)
  })
  test("if no changes, does not call update", () => {
    const { entity } = addEntity(1)
    wireSaver.saveWireConnections.returnsOnce(false as any)
    const ret = projectUpdates.updateWiresFromWorld(entity, 1)
    expect(ret).toBe("no-change")

    assertOneEntity()
    assertWUNotCalled()
  })
  test("doesn't crash if neighbor in previous stage doesn't exist", () => {
    const { entity: entity1 } = addEntity(2)
    const { entity: entity2, luaEntity: luaEntity2 } = addEntity(1, {
      position: pos.plus({ x: 1, y: 0 }),
    })
    project.content.addWireConnection({
      fromEntity: entity1,
      toEntity: entity2,
      fromId: defines.wire_connector_id.circuit_green,
      toId: defines.wire_connector_id.circuit_green,
    })
    wireSaver.saveWireConnections.returnsOnce(true)
    luaEntity2.destroy()

    const ret = projectUpdates.updateWiresFromWorld(entity1, 2)
    expect(ret).toBe("updated")

    assertNEntities(2)
    assertUpdateCalled(entity1, 2)
  })
})

describe("setValueFromStagedInfo()", () => {
  test("can update from bp info", () => {
    const { entity, luaEntity } = addEntity(1)
    const info: StageInfoExport = {
      firstStage: 2,
      lastStage: 5,
      firstValue: { name: "fast-inserter" },
      stageDiffs: { "3": { name: "fast-inserter" } },
      unstagedValue: { "2": { _forTest: "foo" } },
    }
    const ret = projectUpdates.setValueFromStagedInfo(entity, info, nil, luaEntity)
    expect(ret).toBe(StageMoveResult.Updated)

    expect(entity.firstStage).toBe(2)
    expect(entity.lastStage).toBe(5)
    expect(entity.firstValue.name).toBe("fast-inserter")
    expect(entity.stageDiffs).toEqual({
      3: { name: "fast-inserter" },
    })
    expect(entity.getPropertyAllStages("unstagedValue")).toEqual({
      2: { _forTest: "foo" },
    })
    assertOneEntity()
    assertUpdateOnLastStageChangedCalled(entity, nil)
    assertUpdateCalled(entity, 1, 1)
  })

  test("clears stage diff if info has no diffs", () => {
    const { entity, luaEntity } = addEntity(1)
    entity._asMut()._applyDiffAtStage(2, { name: "fast-inserter" })
    const info: StageInfoExport = { firstStage: 2, lastStage: 5 }
    const ret = projectUpdates.setValueFromStagedInfo(entity, info, nil, luaEntity)
    expect(ret).toBe(StageMoveResult.Updated)

    expect(entity.firstStage).toBe(2)
    expect(entity.lastStage).toBe(5)
    expect(entity.firstValue.name).toBe("fast-inserter")
    expect(entity.stageDiffs).toBeNil()
    assertOneEntity()
    assertUpdateOnLastStageChangedCalled(entity, nil)
    assertUpdateCalled(entity, 1, 1)
  })
})

describe("trySetFirstStage()", () => {
  test("can move up", () => {
    const { entity } = addEntity(1)
    const result = projectUpdates.trySetFirstStage(entity, 2)
    expect(result).toBe("updated")
    expect(entity.firstStage).toBe(2)
    assertOneEntity()
    assertUpdateCalled(entity, 1)
  })

  test("can move down to preview", () => {
    const { entity } = addEntity(4)
    const result = projectUpdates.trySetFirstStage(entity, 3)
    expect(result).toBe("updated")
    expect(entity.firstStage).toBe(3)
    assertOneEntity()
    assertUpdateCalled(entity, 3)
  })

  test("ignores settings remnants", () => {
    const { entity } = addEntity(1)
    entity._asMut().isSettingsRemnant = true
    const result = projectUpdates.trySetFirstStage(entity, 2)
    expect(result).toBe(StageMoveResult.NoChange)
    expect(entity.firstStage).toBe(1)
    assertOneEntity()
    assertWUNotCalled()
  })

  test("returns no-change if already at stage", () => {
    const { entity } = addEntity(1)
    const result = projectUpdates.trySetFirstStage(entity, 1)
    expect(result).toBe(StageMoveResult.NoChange)
  })

  test("cannot move down if will intersect another entity", () => {
    const { entity: entity1 } = addEntity(1)
    entity1._asMut().setLastStageUnchecked(2)
    const { entity: entity2 } = addEntity(3) // prevents moving up

    const result = projectUpdates.trySetFirstStage(entity2, 2)
    expect(result).toBe(StageMoveResult.IntersectsAnotherEntity)
  })

  test("cannot move past last stage", () => {
    const { entity } = addEntity(1)
    entity._asMut().setLastStageUnchecked(2)
    const result = projectUpdates.trySetFirstStage(entity, 5)
    expect(result).toBe(StageMoveResult.CannotMovePastLastStage)
  })

  test("moving a rolling stock to higher stage also sets last stage", () => {
    const { entity } = addRollingStock(1)
    const result = projectUpdates.trySetFirstStage(entity, 3)
    expect(result).toBe("updated")
    expect(entity.firstStage).toBe(3)
    expect(entity.lastStage).toBe(3)
    assertOneEntity()
    assertUpdateCalled(entity, 1)
  })

  test("moving a rolling stock to lower stage also sets last stage, and calls onLastStageChanged", () => {
    const { entity } = addRollingStock(3)
    const result = projectUpdates.trySetFirstStage(entity, 1)
    expect(result).toBe("updated")
    expect(entity.firstStage).toBe(1)
    expect(entity.lastStage).toBe(1)
    assertOneEntity()
    assertUpdateOnLastStageChangedCalled(entity, 3)
    assertUpdateCalled(entity, 1, 1)
  })
})

describe("trySetLastStage()", () => {
  test("can move down", () => {
    const { entity } = addEntity(2)
    entity._asMut().setLastStageUnchecked(3)
    const result = projectUpdates.trySetLastStage(entity, 2)
    expect(result).toBe("updated")
    expect(entity.lastStage).toBe(2)
    assertOneEntity()
    assertUpdateOnLastStageChangedCalled(entity, 3)
  })
  test("can move up", () => {
    const { entity } = addEntity(2)
    entity._asMut().setLastStageUnchecked(3)
    const result = projectUpdates.trySetLastStage(entity, 4)
    expect(result).toBe("updated")
    expect(entity.lastStage).toBe(4)
    assertOneEntity()
    assertUpdateOnLastStageChangedCalled(entity, 3)
  })

  test("can set to nil", () => {
    const { entity } = addEntity(2)
    entity._asMut().setLastStageUnchecked(3)
    const result = projectUpdates.trySetLastStage(entity, nil)
    expect(result).toBe("updated")
    expect(entity.lastStage).toBe(nil)
    assertOneEntity()
    assertUpdateOnLastStageChangedCalled(entity, 3)
  })

  test("ignores settings remnants", () => {
    const { entity } = addEntity(1)
    entity._asMut().isSettingsRemnant = true
    const result = projectUpdates.trySetLastStage(entity, 2)
    expect(result).toBe(StageMoveResult.NoChange)
    expect(entity.lastStage).toBe(nil)
    assertOneEntity()
    assertWUNotCalled()
  })

  test("ignores rolling stock", () => {
    const { entity } = addRollingStock(1)
    const result = projectUpdates.trySetLastStage(entity, 3)
    expect(result).toBe(StageMoveResult.NoChange)
    expect(entity.lastStage).toBe(1)
    assertOneEntity()
    assertWUNotCalled()
  })

  test("returns no-change if already at stage", () => {
    const { entity } = addEntity(1)
    entity._asMut().setLastStageUnchecked(2)
    const result = projectUpdates.trySetLastStage(entity, 2)
    expect(result).toBe(StageMoveResult.NoChange)
  })

  test("cannot move up if will intersect another entity", () => {
    const { entity: entity1 } = addEntity(1)
    entity1._asMut().setLastStageUnchecked(2)
    addEntity(3) // prevents moving down

    const result = projectUpdates.trySetLastStage(entity1, 3)
    expect(result).toBe(StageMoveResult.IntersectsAnotherEntity)
  })

  test("cannot move before first stage", () => {
    const { entity } = addEntity(1)
    entity._asMut().setLastStageUnchecked(2)
    const result = projectUpdates.trySetLastStage(entity, 0)
    expect(result).toBe(StageMoveResult.CannotMoveBeforeFirstStage)
  })
})

describe("undergrounds", () => {
  before_each(() => {
    game.surfaces[1].find_entities().forEach((e) => e.destroy())
  })
  function createUndergroundBelt(firstStage: StageNumber, args?: Partial<UndergroundBeltSurfaceCreateEntity>) {
    const { luaEntity, entity } = addEntity(firstStage, {
      name: "underground-belt",
      position: pos,
      direction: direction.west,
      ...args,
    })

    return { luaEntity, entity: entity as ProjectEntity<UndergroundBeltEntity> }
  }

  test("creating underground automatically sets to correct direction", () => {
    const { luaEntity } = createUndergroundBelt(1)
    luaEntity.destroy()
    const luaEntity2 = createEntity(1, {
      name: "underground-belt",
      position: Pos.plus(pos, { x: -3, y: 0 }),
      direction: direction.east,
      type: "input",
    })
    const entity = projectUpdates.addNewEntity(luaEntity2, 2) as ProjectEntity<UndergroundBeltEntity>
    expect(entity).toBeAny()

    expect(entity.firstValue.type).toBe("output")
    assertNEntities(2)

    assertNewUpdated(entity)
    expect(worldUpdates.updateAllHighlights).toHaveBeenCalled()
    expectedWuCalls++
  })

  function createUndergroundBeltPair(
    firstStage: StageNumber,
    otherStage: StageNumber = firstStage,
  ): {
    luaEntity1: LuaEntity
    luaEntity2: LuaEntity
    entity1: ProjectEntity<UndergroundBeltEntity>
    entity2: ProjectEntity<UndergroundBeltEntity>
  } {
    const { luaEntity: luaEntity1, entity: entity1 } = createUndergroundBelt(firstStage)
    const { luaEntity: luaEntity2, entity: entity2 } = createUndergroundBelt(otherStage, {
      position: Pos.plus(pos, { x: -3, y: 0 }),
      type: "output",
    })
    return { luaEntity1, luaEntity2, entity1, entity2 }
  }

  describe("rotating", () => {
    test("lone underground belt in first stage rotates all entities", () => {
      const { luaEntity, entity } = createUndergroundBelt(1)

      const rotated = luaEntity.rotate()
      assert(rotated)

      const ret = projectUpdates.tryRotateEntityFromWorld(entity, 1)
      expect(ret).toBe("updated")

      expect(entity.firstValue.type).toBe("output")
      expect(entity.direction).toBe(direction.east)

      assertOneEntity()
      assertUpdateCalled(entity, 1)
    })

    test("lone underground belt in higher stage forbids rotation", () => {
      const { luaEntity, entity } = createUndergroundBelt(1)

      const rotated = luaEntity.rotate()
      assert(rotated)

      wp().replaceWorldOrPreviewEntity(entity, 2, luaEntity)
      const ret = projectUpdates.tryRotateEntityFromWorld(entity, 2)
      expect(ret).toBe("cannot-rotate")

      expect(entity.firstValue.type).toBe("input")
      expect(entity.direction).toBe(direction.west)

      assertOneEntity()
      assertResetUndergroundRotationCalled(entity, 2)
    })

    test.each(["lower", "higher"])("%s underground in first stage rotates pair", (which) => {
      const { entity1, entity2 } = createUndergroundBeltPair(1, 2)

      const entity = which == "lower" ? entity1 : entity2
      const rotated = wp().getWorldEntity(entity, entity.firstStage)!.rotate()
      assert(rotated)

      const ret = projectUpdates.tryRotateEntityFromWorld(entity, entity.firstStage)
      expect(ret).toBe("updated")

      expect(entity1).toMatchTable({
        firstValue: { type: "output" },
        direction: direction.east,
      })
      expect(entity2).toMatchTable({
        firstValue: { type: "input" },
        direction: direction.east,
      })

      assertNEntities(2)
      assertUpdateCalled(entity1, 1, which == "lower" ? 1 : 2, false)
      assertUpdateCalled(entity2, 2, which == "lower" ? 2 : 1, false)
    })

    test("cannot rotate if not in first stage", () => {
      const { entity1, entity2, luaEntity1 } = createUndergroundBeltPair(2, 1)

      const rotated1 = luaEntity1.rotate()
      assert(rotated1)

      wp().replaceWorldOrPreviewEntity(entity1, 3, luaEntity1)
      const ret = projectUpdates.tryRotateEntityFromWorld(entity1, 3)
      expect(ret).toBe("cannot-rotate")

      expect(entity1).toMatchTable({
        firstValue: { type: "input" },
        direction: direction.west,
      })
      expect(entity2).toMatchTable({
        firstValue: { type: "output" },
        direction: direction.west,
      })

      assertNEntities(2)
      assertResetUndergroundRotationCalled(entity1, 3)
    })
  })

  describe("upgrading", () => {
    test("can upgrade underground in first stage", () => {
      const { luaEntity, entity } = createUndergroundBelt(1)
      luaEntity.order_upgrade({
        target: "fast-underground-belt",
        force: luaEntity.force,
      })
      const ret = projectUpdates.tryUpgradeEntityFromWorld(entity, 1)
      expect(ret).toBe("updated")

      expect(entity.firstValue.name).toBe("fast-underground-belt")
      expect(entity.firstValue.type).toBe("input")
      expect(entity.direction).toBe(direction.west)
      assertOneEntity()
      assertUpdateCalled(entity, 1)
    })

    test("can upgrade underground in higher stage", () => {
      const { luaEntity, entity } = createUndergroundBelt(1)
      luaEntity.order_upgrade({
        target: "fast-underground-belt",
        force: luaEntity.force,
      })
      wp().replaceWorldOrPreviewEntity(entity, 2, luaEntity)
      const ret = projectUpdates.tryUpgradeEntityFromWorld(entity, 2)
      expect(ret).toBe("updated")

      expect(entity.getValueAtStage(2)?.name).toBe("fast-underground-belt")
      expect(entity.firstValue.type).toBe("input")

      assertOneEntity()
      assertUpdateCalled(entity, 2)
    })

    test.each(["lower", "pair in higher", "self in higher"])(
      "upgrading underground %s stage upgrades pair",
      (which) => {
        const endStage = which == "lower" ? 1 : 2
        const { entity1, entity2, luaEntity1, luaEntity2 } = createUndergroundBeltPair(1, 2)
        const entity = which == "pair in higher" ? entity2 : entity1
        const luaEntity = which == "pair in higher" ? luaEntity2 : luaEntity1
        luaEntity.order_upgrade({
          target: "fast-underground-belt",
          force: luaEntity.force,
        })
        wp().replaceWorldOrPreviewEntity(entity, endStage, luaEntity)
        const ret = projectUpdates.tryUpgradeEntityFromWorld(entity, endStage)
        expect(ret).toBe("updated")

        expect(entity1).toMatchTable({
          firstValue: { name: "fast-underground-belt", type: "input" },
          direction: direction.west,
        })
        expect(entity2).toMatchTable({
          firstValue: { name: "fast-underground-belt", type: "output" },
          direction: direction.west,
        })

        assertNEntities(2)
        assertUpdateCalled(entity1, 1, luaEntity == luaEntity1 ? 1 : 2, false)
        assertUpdateCalled(entity2, 2, luaEntity == luaEntity1 ? 2 : 1, false)
      },
    )

    test("cannot upgrade underground if it would change pair", () => {
      const { luaEntity1, entity1, entity2 } = createUndergroundBeltPair(1, 1)
      const { entity: entity3 } = createUndergroundBelt(1, {
        position: Pos.plus(pos, { x: -2, y: 0 }),
        name: "fast-underground-belt",
        type: "output",
      })
      luaEntity1.order_upgrade({
        target: "fast-underground-belt",
        force: luaEntity1.force,
      })

      const ret = projectUpdates.tryUpgradeEntityFromWorld(entity1, 1)
      expect(ret).toBe("cannot-upgrade-changed-pair")

      expect(entity1.firstValue.name).toBe("underground-belt")
      expect(entity2.firstValue.name).toBe("underground-belt")
      expect(entity3.firstValue.name).toBe("fast-underground-belt")

      assertNEntities(3)
      assertRefreshCalled(entity1, 1)
      assertRefreshCalled(entity2, 1)
    })

    test("cannot upgrade underground if it would break existing pair", () => {
      const { entity1, entity2 } = createUndergroundBeltPair(1, 1)
      const { entity: entity3, luaEntity: luaEntity3 } = createUndergroundBelt(1, {
        position: Pos.plus(pos, { x: -2, y: 0 }),
        name: "fast-underground-belt",
      })
      // downgrading entity3 would cut the pair
      luaEntity3.order_upgrade({
        target: "underground-belt",
        force: luaEntity3.force,
      })
      const ret = projectUpdates.tryUpgradeEntityFromWorld(entity3, 1)
      expect(ret).toBe("cannot-upgrade-changed-pair")

      expect(entity1.firstValue.name).toBe("underground-belt")
      expect(entity2.firstValue.name).toBe("underground-belt")
      expect(entity3.firstValue.name).toBe("fast-underground-belt")

      assertNEntities(3)
      assertRefreshCalled(entity3, 1)
    })

    test("can upgrade to connect underground without pair", () => {
      const { entity: entity1, luaEntity: luaEntity1 } = createUndergroundBelt(1)
      const { entity: entity2 } = createUndergroundBelt(1, {
        position: Pos.plus(pos, { x: -6, y: 0 }),
        type: "output",
        name: "fast-underground-belt",
      })
      const oldPair = findUndergroundPair(project.content, entity1, 1)
      expect(oldPair).toBe(nil)
      luaEntity1.order_upgrade({
        target: "fast-underground-belt",
        force: luaEntity1.force,
      })
      const ret = projectUpdates.tryUpgradeEntityFromWorld(entity1, 1)
      expect(ret).toBe("updated")
      const pair = findUndergroundPair(project.content, entity1, 1)
      expect(pair).toBe(entity2)
      assertUpdateCalled(entity1, 1)
    })

    test("can upgrade to disconnect underground pair", () => {
      const { entity: entity1, luaEntity: luaEntity1 } = createUndergroundBelt(1, {
        name: "fast-underground-belt",
      })
      const { entity: entity2 } = createUndergroundBelt(1, {
        position: Pos.plus(pos, { x: -6, y: 0 }),
        type: "output",
        name: "fast-underground-belt",
      })
      const oldPair = findUndergroundPair(project.content, entity1, 1)
      expect(oldPair).toBe(entity2)
      luaEntity1.order_upgrade({
        target: "underground-belt",
        force: luaEntity1.force,
      })
      const ret = projectUpdates.tryUpgradeEntityFromWorld(entity1, 1)
      expect(ret).toBe("updated")
      const pair = findUndergroundPair(project.content, entity1, 1)
      expect(pair).toBe(nil)
      expect(entity2.getPropAtStage(1, "name")[0]).toBe("fast-underground-belt")

      assertUpdateCalled(entity1, 1)
    })
  })

  test("fast replace to upgrade also upgrades pair", () => {
    const { luaEntity1, entity1, entity2 } = createUndergroundBeltPair(1, 1)
    const newEntity = luaEntity1.surface.create_entity({
      name: "fast-underground-belt",
      direction: luaEntity1.direction,
      position: luaEntity1.position,
      force: luaEntity1.force,
      type: luaEntity1.belt_to_ground_type,
      fast_replace: true,
    })!
    expect(newEntity).toBeAny()
    wp().replaceWorldOrPreviewEntity(entity1, 1, newEntity)

    const ret = projectUpdates.tryUpdateEntityFromWorld(entity1, 1)
    expect(ret).toBe("updated")

    expect(entity1).toMatchTable({
      firstValue: { name: "fast-underground-belt", type: "input" },
      direction: direction.west,
    })
    expect(entity2).toMatchTable({
      firstValue: { name: "fast-underground-belt", type: "output" },
      direction: direction.west,
    })

    assertNEntities(2)
    assertUpdateCalled(entity1, 1, 1, false)
    assertUpdateCalled(entity2, 1, 2, false)
  })

  test("rotating to fix direction updates all entities", () => {
    const { luaEntity, entity } = createUndergroundBelt(1)
    luaEntity.rotate()
    expect(wp().hasErrorAt(entity, 1)).toBe(true)
    luaEntity.rotate()
    expect(wp().hasErrorAt(entity, 1)).toBe(false)
    const ret = projectUpdates.tryRotateEntityFromWorld(entity, 1)
    expect(ret).toBe(EntityUpdateResult.NoChange)

    assertOneEntity()
    assertUpdateCalled(entity, 1)
  })
  test("updating to fix direction updates all entities", () => {
    const { luaEntity, entity } = createUndergroundBelt(1)
    luaEntity.rotate()
    expect(wp().hasErrorAt(entity, 1)).toBe(true)
    luaEntity.rotate()
    expect(wp().hasErrorAt(entity, 1)).toBe(false)
    const ret = projectUpdates.tryUpdateEntityFromWorld(entity, 1)
    expect(ret).toBe(EntityUpdateResult.NoChange)

    assertOneEntity()
    assertUpdateCalled(entity, 1)
  })

  test("rotate a broken underground at higher stage fixes underground, if pair is correct", () => {
    const { luaEntity1, entity1, luaEntity2, entity2 } = createUndergroundBeltPair(1, 1)
    wp().replaceWorldOrPreviewEntity(entity1, 2, luaEntity1)
    wp().replaceWorldOrPreviewEntity(entity2, 2, luaEntity2)

    luaEntity2.rotate()
    expect(wp().hasErrorAt(entity2, 2)).toBe(true)
    luaEntity2.rotate()
    expect(wp().hasErrorAt(entity2, 2)).toBe(false)

    const ret = projectUpdates.tryRotateEntityFromWorld(entity2, 2)
    expect(ret).toBe(EntityUpdateResult.NoChange)
    assertUpdateCalled(entity2, 1, 1, false)
    assertUpdateCalled(entity1, 1, 2, false)

    assertNEntities(2)
  })
  test.each(["self", "pair"])("rotating a broken underground fixes pair if %s in first stage", (which) => {
    const { luaEntity1, entity1, luaEntity2, entity2 } = createUndergroundBeltPair(
      which == "pair" ? 2 : 1,
      which == "pair" ? 1 : 2,
    )
    wp().replaceWorldOrPreviewEntity(entity1, 2, luaEntity1)
    wp().replaceWorldOrPreviewEntity(entity2, 2, luaEntity2)
    // break entity2
    const mut2 = entity2._asMut()
    mut2.direction = direction.east
    mut2.setTypeProperty("input")
    expect(wp().hasErrorAt(entity2, 2)).toBe(true)

    assert(luaEntity2.rotate())

    const ret = projectUpdates.tryRotateEntityFromWorld(entity2, 2)
    expect(ret).toBe(EntityUpdateResult.Updated)

    expect(entity1).toMatchTable({
      direction: direction.east,
      firstValue: { type: "output" },
    })
    expect(entity2).toMatchTable({
      direction: direction.east,
      firstValue: { type: "input" },
    })

    assertUpdateCalled(entity2, entity2.firstStage, 1, false)
    assertUpdateCalled(entity1, entity1.firstStage, 2, false)

    assertNEntities(2)
  })
  test("rotating a broken underground that changes pair disallowed if not first stage", () => {
    const { luaEntity1, entity1, luaEntity2, entity2 } = createUndergroundBeltPair(1, 1)
    wp().replaceWorldOrPreviewEntity(entity1, 2, luaEntity1)
    wp().replaceWorldOrPreviewEntity(entity2, 2, luaEntity2)
    // break entity2
    const mut2 = entity2._asMut()
    mut2.direction = direction.east
    mut2.setTypeProperty("input")
    expect(wp().hasErrorAt(entity2, 2)).toBe(true)

    assert(luaEntity2.rotate())

    const ret = projectUpdates.tryRotateEntityFromWorld(entity2, 2)
    expect(ret).toBe(EntityUpdateResult.CannotRotate)
    // assert rotated back
    expect(luaEntity2).toMatchTable({
      direction: direction.west,
      belt_to_ground_type: "output",
    })

    assertNEntities(2)
    assertWUNotCalled()
  })
})

describe("rolling stock", () => {
  let rollingStock: LuaEntity
  before_each(() => {
    game.surfaces[1].find_entities().forEach((e) => e.destroy())
    rollingStock = createRollingStock()
  })
  function addEntity() {
    const result = projectUpdates.addNewEntity(rollingStock, 1)
    clearMocks()
    return result
  }
  test("can save rolling stock", () => {
    const result = projectUpdates.addNewEntity(rollingStock, 1)!
    expect(result).toBeAny()
    expect(result.firstValue.name).toBe("locomotive")

    assertNEntities(1)

    const found = project.content.findCompatibleEntity(rollingStock.name, rollingStock.position, nil, 1)!
    expect(found).toBeAny()
    expect(found).toBe(result)

    const foundDirectly = project.content.findCompatibleWithLuaEntity(rollingStock, nil, 1)
    expect(foundDirectly).toBeAny()
    expect(foundDirectly).toBe(found)

    assertNewUpdated(result)
    expect(worldUpdates.updateAllHighlights).toHaveBeenCalled()
    expectedWuCalls++
  })

  test("no update on rolling stock", () => {
    const entity = addEntity()!

    projectUpdates.tryUpdateEntityFromWorld(entity, 1)

    assertNEntities(1)
    assertWUNotCalled()
  })
})

describe("train", () => {
  let entities: LuaEntity[]
  let projectEntities: MovableProjectEntity[]
  before_each(() => {
    game.surfaces[1].find_entities().forEach((e) => e.destroy())
    entities = createRollingStocks(game.surfaces[1], "locomotive", "cargo-wagon", "fluid-wagon")
    projectEntities = entities.map((e) => {
      const aEntity = newProjectEntity(
        {
          name: e.name,
          orientation: e.orientation,
        },
        e.position,
        0,
        1,
      )
      wp().replaceWorldOrPreviewEntity(aEntity, 1, e)
      project.content.addEntity(aEntity)
      e.connect_rolling_stock(defines.rail_direction.front)
      return aEntity
    })
  })
  test("resetVehicleLocation", () => {
    const anEntity = projectEntities[1]
    projectUpdates.resetVehicleLocation(anEntity)

    assertReplaceCalled(projectEntities[0], 1)
    assertReplaceCalled(projectEntities[1], 1)
    assertReplaceCalled(projectEntities[2], 1)
    assertNEntities(3)
  })
  test("setVehicleLocationHere", () => {
    entities[0].train!.speed = 10
    after_ticks(10, () => {
      const anEntity = projectEntities[1]
      projectUpdates.setVehicleLocationHere(anEntity)

      for (let i = 0; i < 3; i++) {
        expect(projectEntities[i].position).toEqual(entities[i].position)
      }
      assertReplaceCalled(projectEntities[0], 1)
      assertReplaceCalled(projectEntities[1], 1)
      assertReplaceCalled(projectEntities[2], 1)
      assertNEntities(3)
    })
  })
})

describe("car", () => {
  let carEntity: LuaEntity
  let carProjectEntity: MovableProjectEntity
  before_each(() => {
    game.surfaces[1].find_entities().forEach((e) => e.destroy())
    carEntity = game.surfaces[1].create_entity({
      name: "car",
      position: pos,
      force: "player",
    })!
    carProjectEntity = newProjectEntity(
      {
        name: carEntity.name,
        orientation: carEntity.orientation,
      },
      carEntity.position,
      0,
      1,
    )
    wp().replaceWorldOrPreviewEntity(carProjectEntity, 1, carEntity)
    project.content.addEntity(carProjectEntity)
  })
  test("resetVehicleLocation", () => {
    projectUpdates.resetVehicleLocation(carProjectEntity)

    assertReplaceCalled(carProjectEntity, 1)
    assertNEntities(1)
  })
  test("setVehicleLocationHere", () => {
    carEntity.teleport(pos.plus({ x: 5, y: 5 }))
    after_ticks(10, () => {
      projectUpdates.setVehicleLocationHere(carProjectEntity)

      expect(carProjectEntity.position).toEqual(carEntity.position)
      assertReplaceCalled(carProjectEntity, 1)
      assertNEntities(1)
    })
  })

  describe("setTileAtStage", () => {
    const position = { x: 1, y: 2 }

    test("creates new tile when none exists", () => {
      projectUpdates.setTileAtStage(position, 2, "concrete")

      const tile = project.content.tiles.get(1, 2)
      expect(tile).not.toBeNil()
      expect(worldUpdates.updateTilesInRange).toHaveBeenCalledWith(position, 2, nil)

      expectedWuCalls = 1
    })

    test("updates existing tile", () => {
      projectUpdates.setTileAtStage(position, 2, "concrete")
      mock.clear(worldUpdates)

      projectUpdates.setTileAtStage(position, 4, "stone-path")

      expect(worldUpdates.updateTilesInRange).toHaveBeenCalledWith(position, 4, nil)

      expectedWuCalls = 1
    })

    test("sets nil value", () => {
      projectUpdates.setTileAtStage(position, 2, "concrete")
      mock.clear(worldUpdates)

      projectUpdates.setTileAtStage(position, 4, nil)

      expect(worldUpdates.updateTilesInRange).toHaveBeenCalledWith(position, 4, nil)

      expectedWuCalls = 1
    })

    test("deletes tile when it becomes empty", () => {
      projectUpdates.setTileAtStage(position, 2, "concrete")
      mock.clear(worldUpdates)

      projectUpdates.setTileAtStage(position, 2, nil)

      expect(project.content.tiles.get(1, 2)).toBeNil()
      expect(worldUpdates.updateTilesInRange).toHaveBeenCalledWith(position, 2, nil)

      expectedWuCalls = 1
    })

    test("calls updateTilesInRange with correct parameters", () => {
      projectUpdates.setTileAtStage(position, 2, "concrete")

      expect(worldUpdates.updateTilesInRange).toHaveBeenCalledWith(position, 2, nil)

      expectedWuCalls = 1
    })

    test("passes next stage to updateTilesInRange", () => {
      projectUpdates.setTileAtStage(position, 2, "concrete")
      projectUpdates.setTileAtStage(position, 5, "stone-path")
      mock.clear(worldUpdates)

      projectUpdates.setTileAtStage(position, 3, "landfill")

      expect(worldUpdates.updateTilesInRange).toHaveBeenCalledWith(position, 3, 5)

      expectedWuCalls = 1
    })

    test("records collision value when updateTilesInRange returns collision", () => {
      projectUpdates.setTileAtStage(position, 2, "concrete")
      mock.clear(worldUpdates)

      worldUpdates.updateTilesInRange.invokes(() => ({ stage: 4, actualValue: "stone-path" }))

      projectUpdates.setTileAtStage(position, 2, "water")

      const tile = project.content.tiles.get(1, 2)!
      expect(tile.getTileAtStage(4)).toBe("stone-path")

      expectedWuCalls = 1
    })

    test("recreates tile when collision occurs after tile was deleted", () => {
      projectUpdates.setTileAtStage(position, 2, "concrete")
      mock.clear(worldUpdates)

      worldUpdates.updateTilesInRange.invokes(() => ({ stage: 3, actualValue: "concrete" }))

      projectUpdates.setTileAtStage(position, 2, nil)

      const tile = project.content.tiles.get(1, 2)
      expect(tile).not.toBeNil()
      expect(tile!.getTileAtStage(3)).toBe("concrete")

      expectedWuCalls = 1
    })
  })
})
