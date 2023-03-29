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

import expect, { mock } from "tstl-expect"
import { oppositedirection } from "util"
import { Assembly } from "../../assembly/AssemblyDef"
import {
  AssemblyEntity,
  createAssemblyEntity,
  RollingStockAssemblyEntity,
  StageDiffsInternal,
  StageNumber,
} from "../../entity/AssemblyEntity"
import { UndergroundBeltEntity } from "../../entity/Entity"
import { findUndergroundPair } from "../../entity/underground-belt"
import { ContextualFun } from "../../lib"
import { Pos } from "../../lib/geometry"
import { createRollingStock, createRollingStocks } from "../entity/createRollingStock"
import { moduleMock } from "../module-mock"
import { createMockAssembly, setupTestSurfaces } from "./Assembly-mock"
import asmUpdates = require("../../assembly/assembly-updates")
import _worldListener = require("../../assembly/on-world-event")
import _worldUpdater = require("../../assembly/world-entities")
import _wireHandler = require("../../entity/wires")
import direction = defines.direction
import wire_type = defines.wire_type

const pos = Pos(10.5, 10.5)

let assembly: Assembly
const surfaces: LuaSurface[] = setupTestSurfaces(6)

const worldUpdater = moduleMock(_worldUpdater, true)
const wireSaver = moduleMock(_wireHandler, true)

let worldUpdaterCalls: number
let expectedWuCalls: number
before_each(() => {
  assembly = createMockAssembly(surfaces)
  worldUpdaterCalls = 0
  expectedWuCalls = 0
  for (const [, v] of pairs(worldUpdater)) {
    if (v != true)
      v.invokes((() => {
        worldUpdaterCalls++
      }) as ContextualFun)
  }
  wireSaver.saveWireConnections.returns(false as any)

  game.surfaces[1].find_entities().forEach((e) => e.destroy())
})

after_each(() => {
  if (expectedWuCalls == worldUpdaterCalls) return

  let message = `expected ${expectedWuCalls} calls to worldUpdater, got ${worldUpdaterCalls}\n`
  for (const [key, fn] of pairs(worldUpdater)) {
    if (fn != true)
      if (fn.calls.length > 0) {
        message += `  ${key} called ${fn.calls.length} times\n`
      }
  }
  error(message)
})

function clearMocks(): void {
  mock.clear(worldUpdater)
  mock.clear(wireSaver)
  worldUpdaterCalls = 0
  expectedWuCalls = 0
}

function assertWUNotCalled() {
  if (worldUpdaterCalls != 0) {
    for (const [, spy] of pairs(worldUpdater)) {
      expect(spy as any).not.called()
    }
  }
}
function assertUpdateCalled(entity: AssemblyEntity, startStage: StageNumber, endStage: StageNumber | nil, n?: number) {
  expectedWuCalls++
  if (n == nil) expect(worldUpdaterCalls).to.be(1)
  const spy = worldUpdater.updateWorldEntities
  expect(spy).nthCalledWith(n ?? 1, assembly, entity, startStage, endStage)
}

function assertRefreshCalled(entity: AssemblyEntity, stage: StageNumber) {
  expectedWuCalls++
  expect(worldUpdater.refreshWorldEntityAtStage).calledWith(assembly, entity, stage)
}
function assertReplaceCalled(entity: AssemblyEntity, stage: StageNumber) {
  expectedWuCalls++
  expect(worldUpdater.rebuildWorldEntityAtStage).calledWith(assembly, entity, stage)
}
function assertDeleteAllEntitiesCalled(entity: AssemblyEntity) {
  expectedWuCalls++
  expect(worldUpdaterCalls).to.be(1)
  expect(worldUpdater.deleteAllEntities).calledWith(entity)
}
function assertMakeSettingsRemnantCalled(entity: AssemblyEntity) {
  expectedWuCalls++
  expect(worldUpdaterCalls).to.be(1)
  expect(worldUpdater.makeSettingsRemnant).calledWith(assembly, entity)
}
function assertReviveSettingsRemnantCalled(entity: AssemblyEntity) {
  expectedWuCalls++
  expect(worldUpdaterCalls).to.be(1)
  expect(worldUpdater.updateEntitiesOnSettingsRemnantRevived).calledWith(assembly, entity)
}

function assertOneEntity() {
  expect(assembly.content.countNumEntities()).to.be(1)
}
function assertNEntities(n: number) {
  expect(assembly.content.countNumEntities()).to.be(n)
}
function assertNoEntities() {
  expect(assembly.content.countNumEntities()).to.equal(0)
}

function assertStageDiffs(entity: AssemblyEntity, changes: StageDiffsInternal<BlueprintEntity>) {
  expect(entity.getStageDiffs()).to.equal(changes)
}

function createEntity(stageNum: StageNumber, args?: Partial<SurfaceCreateEntity>): LuaEntity {
  const params = {
    name: "filter-inserter",
    position: pos,
    force: "player",
    ...args,
  }
  const entity = assert(surfaces[stageNum - 1].create_entity(params), "created entity")[0]
  const proto = game.entity_prototypes[params.name]
  if (proto.type == "inserter") {
    entity.inserter_stack_size_override = 1
    entity.inserter_filter_mode = "whitelist"
  }
  return entity
}
function assertNewUpdated(entity: AssemblyEntity) {
  expect(worldUpdater.updateNewWorldEntitiesWithoutWires).calledWith(assembly, entity)
  expect(worldUpdater.updateWireConnections).calledWith(assembly, entity)
  expectedWuCalls = 2
}

test("addNewEntity", () => {
  const luaEntity = createEntity(2)
  const entity = asmUpdates.addNewEntity(assembly, luaEntity, 2)!
  expect(entity).to.be.any()
  expect(entity.firstValue.name).to.be("filter-inserter")
  expect(entity.position).to.equal(pos)
  expect(entity.getDirection()).to.be(0)

  const found = assembly.content.findCompatibleWithLuaEntity(luaEntity, nil, 2) as AssemblyEntity<BlueprintEntity>
  expect(found).to.be(entity)

  expect(entity.getWorldEntity(2)).to.be(luaEntity)

  assertOneEntity()
  assertNewUpdated(entity)
})

test("addNewEntity with known value", () => {
  const luaEntity = createEntity(2)
  const entity = asmUpdates.addNewEntity(assembly, luaEntity, 2, {
    entity_number: 1,
    direction: 0,
    position: { x: 0, y: 0 },
    name: "filter-inserter",
    neighbours: [2],
  })!
  expect(entity).to.be.any()
  expect(entity.firstValue).toEqual({
    name: "filter-inserter",
  })
  expect(entity.position).to.equal(pos)
  expect(entity.getDirection()).to.be(0)

  const found = assembly.content.findCompatibleWithLuaEntity(luaEntity, nil, 2) as AssemblyEntity<BlueprintEntity>
  expect(found).to.be(entity)

  expect(entity.getWorldEntity(2)).to.be(luaEntity)

  assertOneEntity()
  assertNewUpdated(entity)
})

function addEntity(stage: StageNumber, args?: Partial<SurfaceCreateEntity>) {
  const luaEntity = createEntity(stage, args)
  const entity = asmUpdates.addNewEntity(assembly, luaEntity, stage) as AssemblyEntity<BlueprintEntity>
  expect(entity).to.be.any()
  clearMocks()
  entity.replaceWorldEntity(stage, luaEntity)
  return { entity, luaEntity }
}

test("moveEntityOnPreviewReplace", () => {
  const { entity } = addEntity(2)

  assert(asmUpdates.moveEntityOnPreviewReplaced(assembly, entity, 1))

  expect(entity.firstStage).to.equal(1)
  expect((entity.firstValue as BlueprintEntity).override_stack_size).to.be(1)
  expect(entity.hasStageDiff()).to.be(false)
  assertOneEntity()
  assertUpdateCalled(entity, 1, 2)
})

test("cannot moveEntityOnPreviewReplace to a higher stage", () => {
  const { entity } = addEntity(2)

  expect(asmUpdates.moveEntityOnPreviewReplaced(assembly, entity, 3)).to.be(false)
  assertOneEntity()
  assertWUNotCalled()
})

test("reviveSettingsRemnant", () => {
  const { entity } = addEntity(2)
  entity.isSettingsRemnant = true

  asmUpdates.reviveSettingsRemnant(assembly, entity, 1)

  expect(entity.isSettingsRemnant).to.be.nil()
  expect(entity.firstStage).to.equal(1)
  assertOneEntity()
  assertReviveSettingsRemnantCalled(entity)
})

test("cannot reviveSettingsRemnant if still not a remnant", () => {
  const { entity } = addEntity(2)

  expect(asmUpdates.reviveSettingsRemnant(assembly, entity, 1)).to.be(false)
  assertOneEntity()
  assertWUNotCalled()
})

describe("deleteEntityOrCreateSettingsRemnant", () => {
  test("deletes normal entity", () => {
    const { entity } = addEntity(1)

    asmUpdates.deleteEntityOrCreateSettingsRemnant(assembly, entity)
    assertNoEntities()
    assertDeleteAllEntitiesCalled(entity)
  })

  test("creates settings remnant if entity has stage diffs", () => {
    const { entity } = addEntity(1)
    entity._applyDiffAtStage(2, { override_stack_size: 2 })

    asmUpdates.deleteEntityOrCreateSettingsRemnant(assembly, entity)

    expect(entity.isSettingsRemnant).to.be(true)
    assertOneEntity()
    assertMakeSettingsRemnantCalled(entity)
  })

  test("creates settings remnant if entity has circuit connections", () => {
    const { entity } = addEntity(1)
    const otherEntity = createAssemblyEntity({ name: "filter-inserter" }, Pos(0, 0), nil, 1)
    assembly.content.add(otherEntity)
    assembly.content.addCircuitConnection({
      fromEntity: otherEntity,
      toEntity: entity,
      fromId: 1,
      toId: 1,
      wire: wire_type.green,
    })

    asmUpdates.deleteEntityOrCreateSettingsRemnant(assembly, entity)
    expect(entity.isSettingsRemnant).to.be(true)
    assertNEntities(2)
    assertMakeSettingsRemnantCalled(entity)
  })

  test("deletes if entity has with circuit connections, but connections have world entity", () => {
    const { entity } = addEntity(1)
    const otherEntity = createAssemblyEntity({ name: "filter-inserter" }, Pos(0, 0), nil, 1)
    assembly.content.add(otherEntity)
    assembly.content.addCircuitConnection({
      fromEntity: otherEntity,
      toEntity: entity,
      fromId: 1,
      toId: 1,
      wire: wire_type.green,
    })
    otherEntity.replaceWorldEntity(
      1,
      createEntity(1, {
        position: Pos.plus(entity.position, { x: 0, y: 1 }),
      }),
    )

    asmUpdates.deleteEntityOrCreateSettingsRemnant(assembly, entity)
    expect(entity.isSettingsRemnant).to.be.nil()
    assertOneEntity()
    assertDeleteAllEntitiesCalled(entity)
  })
})

test("forceDeleteEntity always deletes", () => {
  const { entity } = addEntity(1)
  entity.isSettingsRemnant = true

  asmUpdates.forceDeleteEntity(assembly, entity)

  assertNoEntities()
  assertDeleteAllEntitiesCalled(entity)
})

describe("tryUpdateEntityFromWorld", () => {
  test('with no changes returns "no-change"', () => {
    const { entity } = addEntity(2)
    const ret = asmUpdates.tryUpdateEntityFromWorld(assembly, entity, 2)
    expect(ret).to.be("no-change")
    assertOneEntity()
    assertWUNotCalled()
  })

  test('with change in first stage returns "updated" and updates all entities', () => {
    const { entity, luaEntity } = addEntity(2)
    luaEntity.inserter_stack_size_override = 3
    const ret = asmUpdates.tryUpdateEntityFromWorld(assembly, entity, 2)
    expect(ret).to.be("updated")

    expect(entity.firstValue.override_stack_size).to.be(3)

    assertOneEntity()
    assertUpdateCalled(entity, 2, nil)
  })
  test('with change in first stage and known value returns "updated" and updates all entities', () => {
    const { entity } = addEntity(2)
    const knownValue = {
      name: "filter-inserter",
      override_stack_size: 3,
    }
    const ret = asmUpdates.tryUpdateEntityFromWorld(assembly, entity, 2, knownValue as BlueprintEntity)
    expect(ret).to.be("updated")

    expect(entity.firstValue.override_stack_size).to.be(3)

    assertOneEntity()
    assertUpdateCalled(entity, 2, nil)
  })

  test("can detect rotate by pasting", () => {
    const { luaEntity, entity } = addEntity(2, {
      name: "assembling-machine-2",
      recipe: "express-transport-belt",
    })
    luaEntity.direction = defines.direction.east
    const ret = asmUpdates.tryUpdateEntityFromWorld(assembly, entity, 2)
    expect(ret).to.be("updated")

    expect(entity.getDirection()).to.be(defines.direction.east)
    assertOneEntity()
    assertUpdateCalled(entity, 2, nil)
  })

  test("forbids rotate if in higher stage than first", () => {
    const { luaEntity, entity } = addEntity(2)
    luaEntity.direction = defines.direction.east

    entity.replaceWorldEntity(3, luaEntity)
    const ret = asmUpdates.tryUpdateEntityFromWorld(assembly, entity, 3)
    expect(ret).to.be("cannot-rotate")
    expect(entity.getDirection()).to.be(defines.direction.north)

    assertOneEntity()
    assertRefreshCalled(entity, 3)
  })

  test.each([false, true])("integration: in higher stage, with changes: %s", (withExistingChanges) => {
    const { luaEntity, entity } = addEntity(1)
    if (withExistingChanges) {
      entity._applyDiffAtStage(2, { override_stack_size: 2, filter_mode: "blacklist" })
      luaEntity.inserter_filter_mode = "blacklist"
    }

    luaEntity.inserter_stack_size_override = 3
    entity.replaceWorldEntity(2, luaEntity)
    const ret = asmUpdates.tryUpdateEntityFromWorld(assembly, entity, 2)
    expect(ret).to.be("updated")

    expect(entity.firstValue.override_stack_size).to.be(1)
    if (withExistingChanges) {
      assertStageDiffs(entity, { 2: { override_stack_size: 3, filter_mode: "blacklist" } })
    } else {
      assertStageDiffs(entity, { 2: { override_stack_size: 3 } })
    }

    assertOneEntity()
    assertUpdateCalled(entity, 2, nil)
  })

  test("integration: updating to match removes stage diff", () => {
    const { luaEntity, entity } = addEntity(1)
    entity._applyDiffAtStage(2, { override_stack_size: 2 })
    expect(entity.hasStageDiff()).to.be(true)
    luaEntity.inserter_stack_size_override = 1

    entity.replaceWorldEntity(2, luaEntity)
    const ret = asmUpdates.tryUpdateEntityFromWorld(assembly, entity, 2)
    expect(ret).to.be("updated")
    expect(entity.hasStageDiff()).to.be(false)

    assertOneEntity()
    assertUpdateCalled(entity, 2, nil)
  })
})

describe("tryRotateEntityToMatchWorld", () => {
  test("in first stage rotates all entities", () => {
    const { luaEntity, entity } = addEntity(2)
    luaEntity.direction = direction.west
    const ret = asmUpdates.tryRotateEntityToMatchWorld(assembly, entity, 2)
    expect(ret).to.be("updated")
    expect(entity.getDirection()).to.be(direction.west)
    assertOneEntity()
    assertUpdateCalled(entity, 2, nil)
  })

  test("in higher stage forbids rotation", () => {
    const { luaEntity, entity } = addEntity(1)
    const oldDirection = luaEntity.direction
    luaEntity.direction = direction.west
    entity.replaceWorldEntity(2, luaEntity)
    const ret = asmUpdates.tryRotateEntityToMatchWorld(assembly, entity, 2)
    expect(ret).to.be("cannot-rotate")
    expect(entity.getDirection()).to.be(oldDirection)
    assertOneEntity()
    assertRefreshCalled(entity, 2)
  })

  test("rotating loader also sets loader type", () => {
    const { luaEntity, entity } = addEntity(1, { name: "loader", direction: direction.north, type: "input" })
    luaEntity.rotate()
    const ret = asmUpdates.tryRotateEntityToMatchWorld(assembly, entity, 1)
    expect(ret).to.be("updated")
    expect(entity.getDirection()).to.be(direction.south)
    expect(entity.firstValue.type).to.be("output")
    assertOneEntity()
    assertUpdateCalled(entity, 1, nil)
  })
})

describe("ignores assembling machine rotation if no fluid inputs", () => {
  let luaEntity: LuaEntity, entity: AssemblyEntity<BlueprintEntity>
  before_each(() => {
    ;({ luaEntity, entity } = addEntity(2, {
      name: "assembling-machine-2",
      direction: defines.direction.east,
    }))

    entity.replaceWorldEntity(3, luaEntity)
    // hacky way to rotate
    luaEntity.set_recipe("express-transport-belt")
    luaEntity.direction = defines.direction.south
    luaEntity.set_recipe(nil)
    expect(luaEntity.direction).to.be(defines.direction.south)
  })
  test("using update", () => {
    const ret = asmUpdates.tryUpdateEntityFromWorld(assembly, entity, 3)
    expect(ret).to.be("no-change")
    expect(entity.getDirection()).to.be(0)

    assertOneEntity()
    assertWUNotCalled()
  })
  test("using rotate", () => {
    const ret = asmUpdates.tryRotateEntityToMatchWorld(assembly, entity, 3)
    expect(ret).to.be("no-change")
    expect(entity.getDirection()).to.be(0)

    assertOneEntity()
    assertWUNotCalled()
  })
  test("can change recipe and rotate", () => {
    luaEntity.set_recipe("iron-gear-wheel")
    const ret = asmUpdates.tryUpdateEntityFromWorld(assembly, entity, 3)
    expect(ret).to.be("updated")
    expect(entity.getValueAtStage(3)!.recipe).to.be("iron-gear-wheel")

    assertOneEntity()
    assertUpdateCalled(entity, 3, nil)
  })
  test("disallows if has fluid inputs", () => {
    luaEntity.set_recipe("express-transport-belt")
    const ret = asmUpdates.tryUpdateEntityFromWorld(assembly, entity, 3)
    expect(ret).to.be("cannot-rotate")

    assertOneEntity()
    assertRefreshCalled(entity, 3)
  })
})

describe("tryApplyUpgradeTarget", () => {
  test("can apply upgrade", () => {
    const { luaEntity, entity } = addEntity(1)
    luaEntity.order_upgrade({
      force: luaEntity.force,
      target: "stack-filter-inserter",
    })
    const direction = luaEntity.direction
    const ret = asmUpdates.tryApplyUpgradeTarget(assembly, entity, 1)
    expect(ret).to.be("updated")
    expect(entity.firstValue.name).to.be("stack-filter-inserter")
    expect(entity.getDirection()).to.be(direction)
    assertOneEntity()
    assertUpdateCalled(entity, 1, nil)
  })
  test("can apply rotation", () => {
    const { luaEntity, entity } = addEntity(1)
    luaEntity.order_upgrade({
      force: luaEntity.force,
      target: luaEntity.name,
      direction: direction.west,
    })

    const ret = asmUpdates.tryApplyUpgradeTarget(assembly, entity, 1)
    expect(ret).to.be("updated")
    expect(entity.firstValue.name).to.be("filter-inserter")
    expect(entity.getDirection()).to.be(direction.west)
    assertOneEntity()
    assertUpdateCalled(entity, 1, nil)
  })
  test("upgrade to rotate forbidden", () => {
    const { luaEntity, entity } = addEntity(1)
    luaEntity.order_upgrade({
      force: luaEntity.force,
      target: luaEntity.name,
      direction: direction.west,
    })
    entity.replaceWorldEntity(2, luaEntity)
    const ret = asmUpdates.tryApplyUpgradeTarget(assembly, entity, 2)
    expect(ret).to.be("cannot-rotate")
    expect(entity.getDirection()).to.be(0)
    assertOneEntity()
    assertRefreshCalled(entity, 2)
  })
  test("upgrade to rotation allowed if is assembling machine with no fluid inputs", () => {
    const { luaEntity, entity } = addEntity(1, {
      name: "assembling-machine-2",
      direction: defines.direction.east,
      recipe: "express-transport-belt",
    })
    luaEntity.set_recipe(nil)
    luaEntity.order_upgrade({
      force: luaEntity.force,
      target: "assembling-machine-3",
      direction: direction.north,
    })
    entity.replaceWorldEntity(2, luaEntity)
    const ret = asmUpdates.tryApplyUpgradeTarget(assembly, entity, 2)
    expect(ret).to.be("updated")
    assertOneEntity()
    assertUpdateCalled(entity, 2, nil)
  })
})

describe("updateWiresFromWorld", () => {
  test("if saved, calls update", () => {
    const { entity } = addEntity(1)
    wireSaver.saveWireConnections.returnsOnce(true as any)
    const ret = asmUpdates.updateWiresFromWorld(assembly, entity, 1)
    expect(ret).to.be("updated")

    assertOneEntity()
    assertUpdateCalled(entity, 1, nil)
  })
  test("if no changes, does not call update", () => {
    const { entity } = addEntity(1)
    wireSaver.saveWireConnections.returnsOnce(false as any)
    const ret = asmUpdates.updateWiresFromWorld(assembly, entity, 1)
    expect(ret).to.be("no-change")

    assertOneEntity()
    assertWUNotCalled()
  })
  test("doesn't crash if neighbor in previous stage doesn't exist", () => {
    const { entity: entity1 } = addEntity(2)
    const { entity: entity2, luaEntity: luaEntity2 } = addEntity(1, {
      position: pos.plus({ x: 1, y: 0 }),
    })
    assembly.content.addCircuitConnection({
      fromEntity: entity1,
      toEntity: entity2,
      fromId: 1,
      toId: 1,
      wire: defines.wire_type.green,
    })
    wireSaver.saveWireConnections.returnsOnce(true as any)
    luaEntity2.destroy()

    const ret = asmUpdates.updateWiresFromWorld(assembly, entity1, 2)
    expect(ret).to.be("updated")

    assertNEntities(2)
    assertUpdateCalled(entity1, 2, nil, 1)
    assertUpdateCalled(entity2, 1, nil, 2)
  })
  // test.todo(
  //   "if max connections exceeded, notifies and calls update",
  //   // , () => {
  //   // const { entity } = addEntity(1)
  //   // wireSaver.saveWireConnections.returnsOnce(true as any)
  //   // const ret = asmUpdates.updateWiresFromWorld(assembly, entity, 2)
  //   // expect(ret).to.be("max-connections-exceeded")
  //   //
  //   // assertOneEntity()
  //   // assertUpdateCalled(entity, 1, nil)
  //   // }
  // )
})

describe("moveEntityToStage", () => {
  test("can move up", () => {
    const { entity } = addEntity(1)
    const result = asmUpdates.moveEntityToStage(assembly, entity, 2)
    expect(result).to.be("updated")
    expect(entity.firstStage).to.be(2)
    assertOneEntity()
    assertUpdateCalled(entity, 1, nil)
  })

  test("can move down to preview", () => {
    const { entity } = addEntity(4)
    asmUpdates.moveEntityToStage(assembly, entity, 3)
    expect(entity.firstStage).to.be(3)
    assertOneEntity()
    assertUpdateCalled(entity, 3, nil)
  })

  test("ignores settings remnants", () => {
    const { entity } = addEntity(1)
    entity.isSettingsRemnant = true
    asmUpdates.moveEntityToStage(assembly, entity, 2)
    expect(entity.firstStage).to.be(1)
    assertOneEntity()
    assertWUNotCalled()
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

    return { luaEntity, entity: entity as AssemblyEntity<UndergroundBeltEntity> }
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
    const entity = asmUpdates.addNewEntity(assembly, luaEntity2, 2) as AssemblyEntity<UndergroundBeltEntity>
    expect(entity).to.be.any()

    expect(entity.firstValue.type).to.be("output")
    assertNEntities(2)

    assertNewUpdated(entity)
    // assert.spy(wireSaver.saveWireConnections).calledWith(assembly.content, entity, 1)
  })

  function createUndergroundBeltPair(
    firstStage: StageNumber,
    otherStage: StageNumber = firstStage,
  ): {
    luaEntity1: LuaEntity
    luaEntity2: LuaEntity
    entity1: AssemblyEntity<UndergroundBeltEntity>
    entity2: AssemblyEntity<UndergroundBeltEntity>
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

      const [rotated] = luaEntity.rotate()
      assert(rotated)

      const ret = asmUpdates.tryRotateEntityToMatchWorld(assembly, entity, 1)
      expect(ret).to.be("updated")

      expect(entity.firstValue.type).to.be("output")
      expect(entity.getDirection()).to.be(direction.east)

      assertOneEntity()
      assertUpdateCalled(entity, 1, nil)
    })

    test("lone underground belt in higher stage forbids rotation", () => {
      const { luaEntity, entity } = createUndergroundBelt(1)

      const [rotated] = luaEntity.rotate()
      assert(rotated)

      entity.replaceWorldEntity(2, luaEntity)
      const ret = asmUpdates.tryRotateEntityToMatchWorld(assembly, entity, 2)
      expect(ret).to.be("cannot-rotate")

      expect(entity.firstValue.type).to.be("input")
      expect(entity.getDirection()).to.be(direction.west)

      assertOneEntity()
      assertRefreshCalled(entity, 2)
    })

    test.each(["lower", "higher"])("%s underground in first stage rotates pair", (which) => {
      const { entity1, entity2 } = createUndergroundBeltPair(1, 2)

      const entity = which == "lower" ? entity1 : entity2
      const [rotated] = entity.getWorldEntity(entity.firstStage)!.rotate()
      assert(rotated)

      const ret = asmUpdates.tryRotateEntityToMatchWorld(assembly, entity, entity.firstStage)
      expect(ret).to.be("updated")

      expect(entity1).toMatchTable({
        firstValue: { type: "output" },
        direction: direction.east,
      })
      expect(entity2).toMatchTable({
        firstValue: { type: "input" },
        direction: direction.east,
      })

      assertNEntities(2)
      assertUpdateCalled(entity1, 1, nil, which == "lower" ? 1 : 2)
      assertUpdateCalled(entity2, 2, nil, which == "lower" ? 2 : 1)
    })

    test("cannot rotate if not in first stage", () => {
      const { entity1, entity2, luaEntity1 } = createUndergroundBeltPair(2, 1)

      const [rotated1] = luaEntity1.rotate()
      assert(rotated1)

      entity1.replaceWorldEntity(3, luaEntity1)
      const ret = asmUpdates.tryRotateEntityToMatchWorld(assembly, entity1, 3)
      expect(ret).to.be("cannot-rotate")

      expect(entity1).toMatchTable({
        firstValue: { type: "input" },
        direction: direction.west,
      })
      expect(entity2).toMatchTable({
        firstValue: { type: "output" },
        direction: direction.west,
      })

      assertNEntities(2)
      assertRefreshCalled(entity1, 3)
    })

    test("cannot rotate underground with multiple pairs", () => {
      const { entity1, entity2, luaEntity1, luaEntity2 } = createUndergroundBeltPair(1)
      const { entity: entity3, luaEntity: luaEntity3 } = createUndergroundBelt(1, {
        position: Pos.plus(pos, { x: -2, y: 0 }),
      })

      for (const [entity, luaEntity] of [
        [entity1, luaEntity1],
        [entity2, luaEntity2],
        [entity3, luaEntity3],
      ] as const) {
        const [rotated] = luaEntity.rotate()
        assert(rotated)

        const [, hasMultiple] = findUndergroundPair(assembly.content, entity)
        expect(hasMultiple).to.be(true)

        const ret = asmUpdates.tryRotateEntityToMatchWorld(assembly, entity, 1)
        expect(ret).to.be("cannot-flip-multi-pair-underground")

        expect(entity1).toMatchTable({
          firstValue: { type: "input" },
          direction: direction.west,
        })
        expect(entity2).toMatchTable({
          firstValue: { type: "output" },
          direction: direction.west,
        })
        expect(entity3).toMatchTable({
          firstValue: { type: "input" },
          direction: direction.west,
        })

        assertNEntities(3)
        assertRefreshCalled(entity, 1)
        clearMocks()

        const [rotatedBack] = luaEntity.rotate()
        expect(rotatedBack).to.be(true)
      }
    })
  })

  describe("upgrading", () => {
    moduleMock(_worldListener, true)

    test("can upgrade underground in first stage", () => {
      const { luaEntity, entity } = createUndergroundBelt(1)
      luaEntity.order_upgrade({
        target: "fast-underground-belt",
        force: luaEntity.force,
      })
      const ret = asmUpdates.tryApplyUpgradeTarget(assembly, entity, 1)
      expect(ret).to.be("updated")

      expect(entity.firstValue.name).to.be("fast-underground-belt")
      expect(entity.firstValue.type).to.be("input")
      expect(entity.getDirection()).to.be(direction.west)
      assertOneEntity()
      assertUpdateCalled(entity, 1, nil)
    })

    test("can upgrade underground in higher stage", () => {
      const { luaEntity, entity } = createUndergroundBelt(1)
      luaEntity.order_upgrade({
        target: "fast-underground-belt",
        force: luaEntity.force,
      })
      entity.replaceWorldEntity(2, luaEntity)
      const ret = asmUpdates.tryApplyUpgradeTarget(assembly, entity, 2)
      expect(ret).to.be("updated")

      expect(entity.getValueAtStage(2)?.name).to.be("fast-underground-belt")
      expect(entity.firstValue.type).to.be("input")

      assertOneEntity()
      assertUpdateCalled(entity, 2, nil)
    })

    test("cannot apply rotate upgrade to underground belt (not expected)", () => {
      const { luaEntity, entity } = createUndergroundBelt(1)
      luaEntity.order_upgrade({
        target: "underground-belt",
        force: luaEntity.force,
        direction: oppositedirection(luaEntity.direction),
      })
      const ret = asmUpdates.tryApplyUpgradeTarget(assembly, entity, 1)
      expect(ret).to.be("no-change")

      expect(entity).toMatchTable({
        firstValue: {
          name: "underground-belt",
          type: "input",
        },
        direction: direction.west,
      })
      assertOneEntity()
      assertWUNotCalled()
    })

    test.each(["lower", "pair in higher", "self in higher"])(
      "upgrading %s underground in first stage upgrades pair",
      (which) => {
        const endStage = which == "lower" ? 1 : 2
        const { entity1, entity2, luaEntity1, luaEntity2 } = createUndergroundBeltPair(1, 2)
        const entity = which == "pair in higher" ? entity2 : entity1
        const luaEntity = which == "pair in higher" ? luaEntity2 : luaEntity1
        luaEntity.order_upgrade({
          target: "fast-underground-belt",
          force: luaEntity.force,
        })
        entity.replaceWorldEntity(endStage, luaEntity)
        const ret = asmUpdates.tryApplyUpgradeTarget(assembly, entity, endStage)
        expect(ret).to.be("updated")

        expect(entity1).toMatchTable({
          firstValue: { name: "fast-underground-belt", type: "input" },
          direction: direction.west,
        })
        expect(entity2).toMatchTable({
          firstValue: { name: "fast-underground-belt", type: "output" },
          direction: direction.west,
        })

        assertNEntities(2)
        assertUpdateCalled(entity1, 1, nil, luaEntity == luaEntity1 ? 1 : 2)
        assertUpdateCalled(entity2, 2, nil, luaEntity == luaEntity1 ? 2 : 1)
      },
    )

    test("cannot upgrade underground with multiple pairs", () => {
      const { entity1, entity2, luaEntity1, luaEntity2 } = createUndergroundBeltPair(1, 1)
      const { entity: entity3, luaEntity: luaEntity3 } = createUndergroundBelt(1, {
        position: Pos.plus(pos, { x: -2, y: 0 }),
      })

      for (const [entity, luaEntity] of [
        [entity1, luaEntity1],
        [entity2, luaEntity2],
        [entity3, luaEntity3],
      ] as const) {
        luaEntity.order_upgrade({
          target: "fast-underground-belt",
          force: luaEntity.force,
        })
        const ret = asmUpdates.tryApplyUpgradeTarget(assembly, entity, 1)
        expect(ret).to.be("cannot-upgrade-multi-pair-underground")

        expect(entity1.firstValue.name).to.be("underground-belt")
        expect(entity2.firstValue.name).to.be("underground-belt")
        expect(entity3.firstValue.name).to.be("underground-belt")

        assertNEntities(3)
        assertWUNotCalled()
      }
    })

    test("cannot upgrade in higher stage if pairs are in different stages", () => {
      const { luaEntity1, entity1, entity2 } = createUndergroundBeltPair(1, 2)
      luaEntity1.order_upgrade({
        target: "fast-underground-belt",
        force: luaEntity1.force,
      })

      entity1.replaceWorldEntity(3, luaEntity1)
      const ret = asmUpdates.tryApplyUpgradeTarget(assembly, entity1, 3)
      expect(ret).to.be("cannot-create-pair-upgrade")

      expect(entity1.firstValue.name).to.be("underground-belt")
      expect(entity2.firstValue.name).to.be("underground-belt")

      assertNEntities(2)
      assertWUNotCalled()
    })

    test("cannot upgrade underground if it would change pair", () => {
      const { luaEntity1, entity1, entity2 } = createUndergroundBeltPair(1, 1)
      const { entity: entity3 } = createUndergroundBelt(1, {
        position: Pos.plus(pos, { x: -2, y: 0 }),
        name: "fast-underground-belt",
      })
      luaEntity1.order_upgrade({
        target: "fast-underground-belt",
        force: luaEntity1.force,
      })

      const ret = asmUpdates.tryApplyUpgradeTarget(assembly, entity1, 1)
      expect(ret).to.be("cannot-upgrade-changed-pair")

      expect(entity1.firstValue.name).to.be("underground-belt")
      expect(entity2.firstValue.name).to.be("underground-belt")
      expect(entity3.firstValue.name).to.be("fast-underground-belt")

      assertNEntities(3)
      assertWUNotCalled()
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
    expect(newEntity).to.be.any()
    entity1.replaceWorldEntity(1, newEntity)

    const ret = asmUpdates.tryUpdateEntityFromWorld(assembly, entity1, 1)
    expect(ret).to.be("updated")

    expect(entity1).toMatchTable({
      firstValue: { name: "fast-underground-belt", type: "input" },
      direction: direction.west,
    })
    expect(entity2).toMatchTable({
      firstValue: { name: "fast-underground-belt", type: "output" },
      direction: direction.west,
    })

    assertNEntities(2)
    assertUpdateCalled(entity1, 1, nil, 1)
    assertUpdateCalled(entity2, 1, nil, 2)
  })

  test("cannot move underground if it would also upgrade", () => {
    const { entity1, entity2 } = createUndergroundBeltPair(1)
    entity1.applyUpgradeAtStage(2, "fast-underground-belt")
    entity2.applyUpgradeAtStage(2, "fast-underground-belt")

    const ret = asmUpdates.moveEntityToStage(assembly, entity1, 2)
    expect(ret).to.be("cannot-move-upgraded-underground")

    expect(entity1.firstStage).to.be(1)
    expect(entity2.firstStage).to.be(1)

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
    const result = asmUpdates.addNewEntity(assembly, rollingStock, 1)
    clearMocks()
    return result
  }
  test("can save rolling stock", () => {
    const result = asmUpdates.addNewEntity(assembly, rollingStock, 1)!
    expect(result).to.be.any()
    expect(result.firstValue.name).to.be("locomotive")

    assertNEntities(1)

    const found = assembly.content.findCompatible(rollingStock.name, rollingStock.position, nil, 1)!
    expect(found).to.be.any()
    expect(found).to.be(result)

    const foundDirectly = assembly.content.findCompatibleWithLuaEntity(rollingStock, nil, 1)
    expect(foundDirectly).to.be.any()
    expect(foundDirectly).to.be(found)

    assertNewUpdated(result)
  })

  test("no update on rolling stock", () => {
    const entity = addEntity()!

    asmUpdates.tryUpdateEntityFromWorld(assembly, entity, 1)

    assertNEntities(1)
    assertWUNotCalled()
  })
})

describe("trains", () => {
  let entities: LuaEntity[]
  let assemblyEntities: RollingStockAssemblyEntity[]
  before_each(() => {
    game.surfaces[1].find_entities().forEach((e) => e.destroy())
    entities = createRollingStocks(game.surfaces[1], "locomotive", "cargo-wagon", "fluid-wagon")
    assemblyEntities = entities.map((e) => {
      const aEntity = createAssemblyEntity(
        {
          name: e.name,
          orientation: e.orientation,
        },
        e.position,
        nil,
        1,
      )
      aEntity.replaceWorldEntity(1, e)
      assembly.content.add(aEntity)
      e.connect_rolling_stock(defines.rail_direction.front)
      return aEntity
    })
  })
  test("resetTrainLocation", () => {
    const anEntity = assemblyEntities[1]
    asmUpdates.resetTrain(assembly, anEntity)

    assertReplaceCalled(assemblyEntities[0], 1)
    assertReplaceCalled(assemblyEntities[1], 1)
    assertReplaceCalled(assemblyEntities[2], 1)
    assertNEntities(3)
  })
  test("setTrainLocationToCurrent", () => {
    entities[0].train!.speed = 10
    after_ticks(10, () => {
      const anEntity = assemblyEntities[1]
      asmUpdates.setTrainLocationToCurrent(assembly, anEntity)

      for (let i = 0; i < 3; i++) {
        expect(assemblyEntities[i].position).to.equal(entities[i].position)
      }
      assertReplaceCalled(assemblyEntities[0], 1)
      assertReplaceCalled(assemblyEntities[1], 1)
      assertReplaceCalled(assemblyEntities[2], 1)
      assertNEntities(3)
    })
  })
})
