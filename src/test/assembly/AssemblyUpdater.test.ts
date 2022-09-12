/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of 100% Blueprint Planning.
 *
 * 100% Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * 100% Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with 100% Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { keys } from "ts-transformer-keys"
import { findUndergroundPair } from "../../assembly/assembly-undergrounds"
import { AssemblyContent, StagePosition } from "../../assembly/AssemblyContent"
import {
  AssemblyUpdater,
  createAssemblyUpdater,
  DefaultAssemblyUpdater,
  WorldNotifier,
} from "../../assembly/AssemblyUpdater"
import { WireSaver } from "../../assembly/WireHandler"
import { WorldUpdater } from "../../assembly/WorldUpdater"
import { L_Game, Prototypes } from "../../constants"
import { AssemblyEntity, StageDiffsInternal, StageNumber } from "../../entity/AssemblyEntity"
import { Entity } from "../../entity/Entity"
import { _overrideEntityCategory } from "../../entity/entity-info"
import { UndergroundBeltEntity } from "../../entity/special-entities"
import { ContextualFun, Mutable } from "../../lib"
import { Pos } from "../../lib/geometry"
import { L_Interaction } from "../../locale"
import { createRollingStock } from "../entity/createRollingStock"
import { createMockEntitySaver } from "../entity/EntityHandler-mock"
import { entityMock, simpleMock } from "../simple-mock"
import { createMockAssemblyContent } from "./Assembly-mock"
import direction = defines.direction

const pos = Pos(10.5, 10.5)

let assembly: AssemblyContent
let stage: Mutable<StagePosition>

let assemblyUpdater: AssemblyUpdater
let worldUpdater: mock.Stubbed<WorldUpdater>
let wireSaver: mock.Stubbed<WireSaver>
let worldNotifier: mock.Mocked<WorldNotifier>

let totalCalls: number
before_each(() => {
  assembly = createMockAssemblyContent(1)
  stage = assembly.getStage(1)!
  totalCalls = 0
  function spyFn<F extends ContextualFun>(): F {
    return stub<F>().invokes((() => {
      totalCalls++
    }) as F)
  }
  const k = keys<WorldUpdater>()
  worldUpdater = {} as any
  for (const key of k) {
    worldUpdater[key] = spyFn()
  }
  wireSaver = {
    saveWireConnections: stub(),
  }
  wireSaver.saveWireConnections.returns(false)
  worldNotifier = {
    createNotification: spy(),
  }
  assemblyUpdater = createAssemblyUpdater(worldUpdater, createMockEntitySaver(), wireSaver, worldNotifier)
})

interface TestEntity extends Entity {
  readonly name: string
  prop1?: number
  prop2?: string
}
function createEntity(args?: Partial<LuaEntity>): LuaEntity & TestEntity {
  return entityMock<LuaEntity & TestEntity>({
    name: "test",
    position: pos,
    prop1: 2,
    prop2: "val1",
    ...args,
  })
}
const playerIndex = 1 as PlayerIndex

function addEntity(args?: Partial<LuaEntity>) {
  const entity = createEntity(args)
  assemblyUpdater.onEntityCreated(assembly, entity, stage, playerIndex)
  const found = assembly.content.findCompatible(entity, nil) as AssemblyEntity<TestEntity> | nil
  assert(found, "found new entity")
  return { luaEntity: entity, added: found! }
}

function resetMocks(): void {
  mock.clear(worldUpdater)
  mock.clear(wireSaver)
  totalCalls = 0
}
function addAndReset(addedNum: StageNumber = stage.stageNumber, setNum = stage.stageNumber, args?: Partial<LuaEntity>) {
  stage.stageNumber = addedNum
  const ret = addEntity(args)
  stage.stageNumber = setNum
  resetMocks()
  return ret
}

function createRealEntity(args: SurfaceCreateEntity) {
  return stage.surface.create_entity(args)
}

function addRealEntity(args: SurfaceCreateEntity) {
  const entity = createRealEntity(args)!
  assert.not_nil(entity, "created entity")
  assemblyUpdater.onEntityCreated(assembly, entity, stage, playerIndex)
  const found = assembly.content.findCompatible(entity, nil) as AssemblyEntity<BlueprintEntity> | nil
  assert(found)
  return { luaEntity: entity, added: found! }
}

function addAndResetRealEntity(
  args: SurfaceCreateEntity,
  addedNum: StageNumber = stage.stageNumber,
  setNum = stage.stageNumber,
) {
  stage.stageNumber = addedNum
  const ret = addRealEntity(args)
  stage.stageNumber = setNum
  mock.clear(worldUpdater)
  totalCalls = 0
  return ret
}

let worldUpdaterAsserted = false
let entitiesAsserted = false
let notificationsAsserted = false
before_each(() => {
  worldUpdaterAsserted = false
  entitiesAsserted = false
  notificationsAsserted = false
})
after_each(() => {
  assert(worldUpdaterAsserted, "events not asserted")
  assert(entitiesAsserted, "entities not asserted")
  if (!notificationsAsserted)
    assert.message("unexpected notification").spy(worldNotifier.createNotification).not_called()
})

function assertNoCalls() {
  if (totalCalls !== 0) {
    for (const [key, spy] of pairs(worldUpdater)) {
      assert
        .message(`${key} called`)
        .spy(spy as any)
        .not_called()
    }
  }
  worldUpdaterAsserted = true
}

function assertUpdateCalled(
  entity: AssemblyEntity<TestEntity>,
  startStage: StageNumber,
  endStage: StageNumber | nil,
  replace: boolean,
  n?: number,
) {
  worldUpdaterAsserted = true
  if (n === nil) assert.equal(1, totalCalls, "called once")
  const spy = worldUpdater.updateWorldEntities
  if (n) assert.spy(spy).called_at_least(n + 1)
  else assert.spy(spy).called(1)
  const refs = spy.calls[n ?? 0].refs as any[]
  const [cAssembly, cEntity, cStartStage, cEndStage, cReplace] = table.unpack(refs, 1, 5)
  assert.equal(assembly, cAssembly)
  assert.equal(entity, cEntity)
  assert.equal(startStage, cStartStage, "start stage")
  assert.equal(endStage, cEndStage, "end stage")
  if (replace) assert.true(cReplace, "replace")
  else assert.falsy(cReplace, "replace")
}
function assertDeleteAllEntitiesCalled(entity: AssemblyEntity<TestEntity>) {
  worldUpdaterAsserted = true
  assert.equal(1, totalCalls)
  assert.spy(worldUpdater.deleteAllEntities).called_with(match.ref(entity))
}
function assertClearWorldEntityCalled(entity: AssemblyEntity<TestEntity>, stage: StageNumber) {
  worldUpdaterAsserted = true
  assert.equal(1, totalCalls)
  assert.spy(worldUpdater.clearWorldEntity).called_with(match.ref(assembly), match.ref(entity), stage)
}
function assertMakeSettingsRemnantCalled(entity: AssemblyEntity<TestEntity>) {
  worldUpdaterAsserted = true
  assert.equal(1, totalCalls)
  assert.spy(worldUpdater.makeSettingsRemnant).called_with(assembly, entity)
}
function assertReviveSettingsRemnantCalled(entity: AssemblyEntity<TestEntity>) {
  worldUpdaterAsserted = true
  assert.equal(1, totalCalls)
  assert.spy(worldUpdater.reviveSettingsRemnant).called_with(assembly, entity)
}

function assertOneEntity() {
  assert.equal(1, assembly.content.countNumEntities(), "has one entity")
  entitiesAsserted = true
}
function assertNEntities(n: number) {
  assert.equal(n, assembly.content.countNumEntities(), `has ${n} entities`)
  entitiesAsserted = true
}

function assertNoEntities() {
  assert.same(0, assembly.content.countNumEntities(), "has no entities")
  entitiesAsserted = true
}

function assertNotified(entity: LuaEntity, message: LocalisedString, errorSound: boolean) {
  assert.spy(worldNotifier.createNotification).called(1)
  // assert.spy(worldNotifier.createNotification).called_with(match.ref(entity), playerIndex, message, errorSound)
  const [cEntity, cPlayerIndex, cMessage, cErrorSound] = table.unpack(
    worldNotifier.createNotification.calls[0]!.refs as any[],
  )
  assert.same(cEntity.position, entity.position, "notified position")
  assert.same(cPlayerIndex, playerIndex, "notified player")
  assert.same(cMessage, message, "notified message")
  assert.same(cErrorSound, errorSound, "notified error sound")
  notificationsAsserted = true
}

function assertStageDiffs(entity: AssemblyEntity, changes: StageDiffsInternal<TestEntity>) {
  assert.same(changes, entity._getStageDiffs())
}

function assertAdded(added: AssemblyEntity<TestEntity>, luaEntity: LuaEntity): void {
  assert.not_nil(added)
  assert.equal("test", added.getFirstValue().name)
  assert.same(pos, added.position)
  assert.equal(0, added.getDirection())

  assert.equal(luaEntity, added.getWorldEntity(stage.stageNumber))

  assertOneEntity()
  assertUpdateCalled(added, 1, nil, false)
  assert.spy(wireSaver.saveWireConnections).called(1)
}

describe("add", () => {
  test("updates all stages", () => {
    const { added, luaEntity } = addEntity()
    assertAdded(added, luaEntity)
  })

  test.each([1, 2])("at same or higher stage updates the newly added entity, added stage: %d", (stageNumber) => {
    const { luaEntity, added } = addAndReset(1, stageNumber)
    assemblyUpdater.onEntityCreated(assembly, luaEntity, stage, playerIndex)
    assertOneEntity()
    assertUpdateCalled(added, stageNumber, stageNumber, false)
  })

  test.each([false, true])("at below stage does all behaviors, with stage diffs: %s", (withChanges) => {
    const { added } = addAndReset(3, 1)
    const newEntity = createEntity()
    if (withChanges) {
      newEntity.prop1 = 3
      newEntity.direction = defines.direction.east
    }
    assemblyUpdater.onEntityCreated(assembly, newEntity, stage, playerIndex) // again
    // updates entity
    assert.equal(newEntity, added.getWorldEntity(1))
    assert.same(1, added.getFirstStage())
    // does not create stage diffs
    assert.equal(2, added.getFirstValue().prop1)
    assert.false(added.hasStageDiff())
    // calls updateWorldEntities
    assertOneEntity()
    assertUpdateCalled(added, 1, 3, false)
    // records old stage
    assert.equal(3, added.getOldStage())
    // creates notification
    assertNotified(newEntity, [L_Interaction.EntityMovedFromStage, "mock stage 3"], false)
  })

  test("if can overlap with self, adding below with new direction creates new instead of updating old", () => {
    const { added } = addAndReset(1, 1, {
      name: "straight-rail",
      direction: defines.direction.east,
    })
    const { added: newAdded, luaEntity: newEntity } = addEntity({
      name: "straight-rail",
      direction: defines.direction.west,
    })
    assert.not_equal(added, newAdded)
    assert.equal(newEntity, newAdded.getWorldEntity(1))
    assert.equal(1, newAdded.getFirstStage())

    assertNEntities(2)
    assertUpdateCalled(newAdded, 1, nil, false)
  })
})

describe("delete", () => {
  test("not in assembly does nothing", () => {
    const entity = createEntity()
    assemblyUpdater.onEntityDeleted(assembly, entity, stage, playerIndex)
    assertNoEntities()
    assertNoCalls()
  })

  test("in stage below base does nothing (bug)", () => {
    const { luaEntity } = addAndReset(2, 1)
    assemblyUpdater.onEntityDeleted(assembly, luaEntity, stage, playerIndex)
    assertOneEntity()
    assertNoCalls()
  })

  test("in stage above base forbids deletion", () => {
    const { luaEntity, added } = addAndReset(1, 2)
    assemblyUpdater.onEntityDeleted(assembly, luaEntity, stage, playerIndex)
    assertOneEntity()
    assertUpdateCalled(added, 2, 2, true)
  })

  test("in first stage deletes entity", () => {
    const { luaEntity, added } = addAndReset()
    assemblyUpdater.onEntityDeleted(assembly, luaEntity, stage, playerIndex)
    assert.falsy(added.isSettingsRemnant)
    assertNoEntities()
    assertDeleteAllEntitiesCalled(added)
  })

  test("in first stage with oldStage moves back to old stage", () => {
    const { luaEntity, added } = addAndReset(3, 2)
    added.moveToStage(2, true)
    assemblyUpdater.onEntityDeleted(assembly, luaEntity, stage, playerIndex)
    assert.falsy(added.isSettingsRemnant)
    assertOneEntity()
    assertUpdateCalled(added, 2, 3, false)
    assert.nil(added.getOldStage())
    assertNotified(luaEntity, [L_Interaction.EntityMovedBackToStage, "mock stage 3"], false)
  })

  test("in first stage with updates creates settings remnant", () => {
    const { luaEntity, added } = addAndReset()
    added._applyDiffAtStage(2, { prop1: 3 })
    assemblyUpdater.onEntityDeleted(assembly, luaEntity, stage, playerIndex)
    assertOneEntity()
    assert.true(added.isSettingsRemnant)
    assertMakeSettingsRemnantCalled(added)
  })
})

test("onEntityDied", () => {
  const { luaEntity, added } = addAndReset(1, 2)
  assemblyUpdater.onEntityDied(assembly, luaEntity, stage)
  assertOneEntity()
  assertClearWorldEntityCalled(added, 2)
})

describe("revive", () => {
  test.each([1, 2, 3, 4, 5, 6])("settings remnant 1->3->5, revive at stage %d", (reviveStage) => {
    const { luaEntity, added } = addAndReset(1, reviveStage)
    added._applyDiffAtStage(3, { prop1: 3 })
    added._applyDiffAtStage(5, { prop1: 4 })
    added.isSettingsRemnant = true

    assemblyUpdater.onEntityCreated(assembly, luaEntity, stage, playerIndex)
    assert.equal(luaEntity, added.getWorldEntity(reviveStage))
    assert.falsy(added.isSettingsRemnant)
    assert.equal(added.getFirstStage(), reviveStage)

    if (reviveStage >= 5) {
      assert.equal(4, added.getFirstValue().prop1)
      assert.false(added.hasStageDiff())
    } else if (reviveStage >= 3) {
      assert.equal(3, added.getFirstValue().prop1)
      assertStageDiffs(added, { 5: { prop1: 4 } })
    } else {
      assert.equal(2, added.getFirstValue().prop1)
      assertStageDiffs(added, { 3: { prop1: 3 }, 5: { prop1: 4 } })
    }

    assertOneEntity()
    assertReviveSettingsRemnantCalled(added)
  })

  test.each([false, true])("settings remnant 2->3, revive at stage 1, with changes: %s", (withChanges) => {
    const { luaEntity, added } = addAndReset(2, 1)
    added._applyDiffAtStage(3, { prop1: 3 })
    added.isSettingsRemnant = true

    if (withChanges) luaEntity.prop1 = 1

    assemblyUpdater.onEntityCreated(assembly, luaEntity, stage, playerIndex)
    assert.falsy(added.isSettingsRemnant)
    assert.equal(added.getFirstStage(), 1)

    assert.equal(2, added.getFirstValue().prop1)
    assertStageDiffs(added, { 3: { prop1: 3 } })

    assertOneEntity()
    assertReviveSettingsRemnantCalled(added)
  })
})

describe("update", () => {
  test("non-existent defaults to add behavior (bug)", () => {
    const entity = createEntity()
    assemblyUpdater.onEntityPotentiallyUpdated(assembly, entity, stage, playerIndex)
    const added = assembly.content.findCompatibleBasic("test", pos, nil) as AssemblyEntity<TestEntity>
    assertAdded(added, entity)
  })

  test("with no changes does nothing", () => {
    const { luaEntity } = addAndReset()
    assemblyUpdater.onEntityPotentiallyUpdated(assembly, luaEntity, stage, playerIndex)
    assertOneEntity()
    assertNoCalls()
  })

  test("in lower than first stage defaults to add below behavior (bug)", () => {
    const { luaEntity, added } = addAndReset(3, 1)
    assemblyUpdater.onEntityPotentiallyUpdated(assembly, luaEntity, stage, playerIndex)
    assert.equal(luaEntity, added.getWorldEntity(1))
    assertOneEntity()
    assertUpdateCalled(added, 1, 3, false)
    notificationsAsserted = true // skip
  })

  test("in first stage updates all entities", () => {
    const { luaEntity, added } = addAndReset(2, 2)
    luaEntity.prop1 = 3
    assemblyUpdater.onEntityPotentiallyUpdated(assembly, luaEntity, stage, playerIndex)
    assert.equal(3, added.getFirstValue().prop1)

    assertOneEntity()
    assertUpdateCalled(added, 2, nil, false)
  })

  test("can detect rotate by pasting", () => {
    const { luaEntity, added } = addAndReset(2, 2, {
      name: "assembling-machine-1",
    })
    luaEntity.direction = defines.direction.east
    assemblyUpdater.onEntityPotentiallyUpdated(assembly, luaEntity, stage, playerIndex)

    assert.equal(defines.direction.east, added.getDirection())
    assertOneEntity()
    assertUpdateCalled(added, 2, nil, false)
  })

  test("forbids rotate if in higher layer", () => {
    const { luaEntity, added } = addAndReset(2, 3)
    luaEntity.direction = defines.direction.east

    assemblyUpdater.onEntityPotentiallyUpdated(assembly, luaEntity, stage, playerIndex, defines.direction.north)
    assert.equal(defines.direction.north, added.getDirection())

    assertOneEntity()
    assertUpdateCalled(added, 3, 3, false)
    assertNotified(luaEntity, [L_Game.CantBeRotated], true)
  })

  test.each([false, true])(
    "in higher stage updates assembly.content and entities, with existing changes: %s",
    (withExistingChanges) => {
      const { luaEntity, added } = addAndReset(1, 2)
      if (withExistingChanges) {
        added._applyDiffAtStage(2, { prop1: 5, prop2: "val2" })
        luaEntity.prop2 = "val2" // not changed
      }

      luaEntity.prop1 = 3 // changed
      assemblyUpdater.onEntityPotentiallyUpdated(assembly, luaEntity, stage, playerIndex)
      assert.equal(2, added.getFirstValue().prop1)
      if (withExistingChanges) {
        assertStageDiffs(added, { 2: { prop1: 3, prop2: "val2" } })
      } else {
        assertStageDiffs(added, { 2: { prop1: 3 } })
      }

      assertOneEntity()
      assertUpdateCalled(added, 2, nil, false)
    },
  )

  test("updating match previous stage removes stage diffs", () => {
    const { luaEntity, added } = addAndReset(1, 2)
    added._applyDiffAtStage(2, { prop1: 5 })
    assert.true(added.hasStageDiff())
    luaEntity.prop1 = 2
    assemblyUpdater.onEntityPotentiallyUpdated(assembly, luaEntity, stage, playerIndex)

    assertOneEntity()
    assertUpdateCalled(added, 2, nil, false)
  })
})

describe("rotate", () => {
  test("in first stage rotates all entities", () => {
    const { luaEntity, added } = addAndReset(2, 2)
    const oldDirection = luaEntity.direction
    luaEntity.direction = direction.west
    assemblyUpdater.onEntityRotated(assembly, luaEntity, stage, playerIndex, oldDirection)
    assert.equal(direction.west, added.getDirection())
    assertOneEntity()
    assertUpdateCalled(added, 1, nil, false)
  })

  test("in higher stage forbids rotation", () => {
    const { luaEntity, added } = addAndReset(1, 2)
    const oldDirection = luaEntity.direction
    luaEntity.direction = direction.west
    assemblyUpdater.onEntityRotated(assembly, luaEntity, stage, playerIndex, oldDirection)
    assert.equal(oldDirection, added.getDirection())
    assertOneEntity()
    assertUpdateCalled(added, 2, 2, false)
    assertNotified(luaEntity, [L_Game.CantBeRotated], true)
  })
})

before_all(() => {
  _overrideEntityCategory("test", "test")
  _overrideEntityCategory("test2", "test")
})

describe("fast replace", () => {
  test("sets world entity and calls update", () => {
    const { luaEntity, added } = addAndReset()
    const newEntity = createEntity({ name: "test2" })
    luaEntity.destroy()
    assemblyUpdater.onEntityPotentiallyUpdated(assembly, newEntity, stage, playerIndex)
    assert.equal(newEntity, added.getWorldEntity(1))
    assertOneEntity()
    assertUpdateCalled(added, 1, nil, false)
  })
  test("with new direction sets world entity and calls update", () => {
    const { luaEntity, added } = addAndReset()
    const oldDirection = luaEntity.direction
    const newEntity = createEntity({ name: "test2", direction: direction.west })
    luaEntity.destroy()
    assemblyUpdater.onEntityPotentiallyUpdated(assembly, newEntity, stage, playerIndex, oldDirection)
    assert.equal(newEntity, added.getWorldEntity(1))
    assertOneEntity()
    assertUpdateCalled(added, 1, nil, false)
  })
  test("with forbidden rotation", () => {
    const { luaEntity, added } = addAndReset(1, 2)
    const oldDirection = luaEntity.direction
    const newEntity = createEntity({ name: "test2", direction: direction.west })
    luaEntity.destroy()
    assemblyUpdater.onEntityPotentiallyUpdated(assembly, newEntity, stage, playerIndex, oldDirection)
    assert.equal(oldDirection, added.getDirection())
    assertOneEntity()
    assertUpdateCalled(added, 2, 2, false)
    assertNotified(newEntity, [L_Game.CantBeRotated], true)
  })
})

describe("circuitWiresPotentiallyUpdated", () => {
  test("if saved, calls update", () => {
    const { luaEntity, added } = addAndReset()
    wireSaver.saveWireConnections.on_call_with(match._, added, stage.stageNumber).returns(true)
    assemblyUpdater.onCircuitWiresPotentiallyUpdated(assembly, luaEntity, stage, playerIndex)

    assertOneEntity()
    assertUpdateCalled(added, 1, nil, false)
  })
  test("if no changes, does not call update", () => {
    const { luaEntity } = addAndReset()
    wireSaver.saveWireConnections.returns(false)
    assemblyUpdater.onCircuitWiresPotentiallyUpdated(assembly, luaEntity, stage, playerIndex)

    assertOneEntity()
    assertNoCalls()
  })
  test("if max connections exceeded, notifies and calls update", () => {
    const { luaEntity, added } = addAndReset()
    wireSaver.saveWireConnections.on_call_with(match._, added, stage.stageNumber).returns(true, true)
    assemblyUpdater.onCircuitWiresPotentiallyUpdated(assembly, luaEntity, stage, playerIndex)

    assertOneEntity()
    assertUpdateCalled(added, 1, nil, false)
    assertNotified(luaEntity, [L_Interaction.MaxConnectionsReachedInAnotherStage], true)
  })
})

describe("mark for upgrade", () => {
  test("upgrade to new value", () => {
    const { luaEntity, added } = addAndReset()
    rawset(luaEntity, "get_upgrade_target", () => simpleMock<LuaEntityPrototype>({ name: "test2" }))
    rawset(luaEntity, "get_upgrade_direction", () => nil)
    rawset(luaEntity, "cancel_upgrade", () => true)
    assemblyUpdater.onEntityMarkedForUpgrade(assembly, luaEntity, stage, playerIndex)
    assert.equal("test2", added.getFirstValue().name)
    assertOneEntity()
    assertUpdateCalled(added, 1, nil, false)
  })
  test("upgrade to rotated", () => {
    const { luaEntity, added } = addAndReset()
    rawset(luaEntity, "get_upgrade_target", () => nil)
    rawset(luaEntity, "get_upgrade_direction", () => direction.west)
    rawset(luaEntity, "cancel_upgrade", () => true)
    assemblyUpdater.onEntityMarkedForUpgrade(assembly, luaEntity, stage, playerIndex)
    assert.equal(direction.west, added.getDirection())
    assertOneEntity()
    assertUpdateCalled(added, 1, nil, false)
  })
  test("upgrade to rotate forbidden", () => {
    const { luaEntity, added } = addAndReset(1, 2)
    rawset(luaEntity, "get_upgrade_target", () => simpleMock<LuaEntityPrototype>({ name: "test2" }))
    rawset(luaEntity, "get_upgrade_direction", () => direction.west)
    rawset(luaEntity, "cancel_upgrade", () => true)
    assemblyUpdater.onEntityMarkedForUpgrade(assembly, luaEntity, stage, playerIndex)
    assert.equal(0, added.getDirection())
    assertOneEntity()
    assertUpdateCalled(added, 2, 2, false)
    assertNotified(luaEntity, [L_Game.CantBeRotated], true)
  })
})

describe("move to current stage", () => {
  test("normal entity", () => {
    const { luaEntity, added } = addAndReset(1, 3)
    assemblyUpdater.onMoveEntityToStage(assembly, luaEntity, stage, playerIndex)
    assert.equal(3, added.getFirstStage())
    assertOneEntity()
    assertUpdateCalled(added, 1, nil, false)
    assertNotified(luaEntity, [L_Interaction.EntityMovedFromStage, "mock stage 1"], false)
  })

  test("preview entity", () => {
    const { luaEntity, added } = addAndReset(1, 3)
    luaEntity.destroy()
    const preview = createEntity({ name: Prototypes.PreviewEntityPrefix + "test" })
    assemblyUpdater.onMoveEntityToStage(assembly, preview, stage, playerIndex)
    assert.equal(3, added.getFirstStage())
    assertOneEntity()
    assertUpdateCalled(added, 1, nil, false)
    assertNotified(preview, [L_Interaction.EntityMovedFromStage, "mock stage 1"], false)
  })

  test("settings remnant", () => {
    // with preview again
    const { luaEntity, added } = addAndReset(1, 3)
    luaEntity.destroy()
    const preview = createEntity({ name: Prototypes.PreviewEntityPrefix + "test" })
    added.isSettingsRemnant = true
    assemblyUpdater.onMoveEntityToStage(assembly, preview, stage, playerIndex)
    assert.equal(3, added.getFirstStage())
    assertOneEntity()
    assertReviveSettingsRemnantCalled(added)
  })
})

describe("undergrounds", () => {
  before_each(() => {
    game.surfaces[1].find_entities().forEach((e) => e.destroy())
  })
  function createUndergroundBelt(
    firstStage: StageNumber,
    endStage: StageNumber,
    args?: Partial<UndergroundBeltSurfaceCreateEntity>,
  ) {
    const { luaEntity, added } = addAndResetRealEntity(
      {
        name: "underground-belt",
        position: pos,
        direction: direction.west,
        ...args,
      },
      firstStage,
      endStage,
    )

    return { luaEntity, added: added as AssemblyEntity<UndergroundBeltEntity> }
  }

  test("creating underground automatically sets to correct direction", () => {
    const { luaEntity: entity1 } = createUndergroundBelt(1, 2)
    entity1.destroy()
    const { added: added2 } = addRealEntity({
      name: "underground-belt",
      position: Pos.plus(pos, { x: -3, y: 0 }),
      direction: direction.east,
      type: "input",
    })

    assert.equal("output", added2.getFirstValue().type)
    assertNEntities(2)
    assertUpdateCalled(added2, 1, nil, false)
  })

  function createUndergroundBeltPair(
    firstStage: StageNumber,
    endStage: StageNumber,
    otherStage: StageNumber = firstStage,
  ): {
    entity1: LuaEntity
    entity2: LuaEntity
    added1: AssemblyEntity<UndergroundBeltEntity>
    added2: AssemblyEntity<UndergroundBeltEntity>
  } {
    const { luaEntity: entity1, added: added1 } = createUndergroundBelt(firstStage, otherStage)
    const { luaEntity: entity2, added: added2 } = createUndergroundBelt(otherStage, endStage, {
      position: Pos.plus(pos, { x: -3, y: 0 }),
      type: "output",
    })
    return { entity1, entity2, added1, added2 }
  }

  test("lone underground belt in first stage rotates all entities", () => {
    const { luaEntity, added } = createUndergroundBelt(1, 1)

    const [rotated] = luaEntity.rotate()
    assert(rotated)

    assemblyUpdater.onEntityRotated(assembly, luaEntity, stage, playerIndex, direction.west)

    assert.equal("output", added.getFirstValue().type)
    assert.equal(direction.west, added.getDirection())

    assertOneEntity()
    assertUpdateCalled(added, 1, nil, false)
  })

  test("lone underground belt in higher stage forbids rotation", () => {
    const { luaEntity, added } = createUndergroundBelt(1, 2)

    const [rotated] = luaEntity.rotate()
    assert(rotated)

    assemblyUpdater.onEntityRotated(assembly, luaEntity, stage, playerIndex, direction.west)

    assert.equal("input", added.getFirstValue().type)
    assert.equal(direction.west, added.getDirection())

    assertOneEntity()
    assertUpdateCalled(added, 2, 2, false)
    assertNotified(luaEntity, [L_Game.CantBeRotated], true)
  })

  test.each(["lower", "higher"])("rotating %s underground in first stage rotates pair", (which) => {
    const { entity1, entity2, added1, added2 } = createUndergroundBeltPair(1, 2, 2)

    const toRotate = which === "lower" ? entity1 : entity2
    const [rotated1] = toRotate.rotate()
    assert(rotated1)

    assemblyUpdater.onEntityRotated(assembly, toRotate, stage, playerIndex, direction.west)

    assert.equal("output", added1.getFirstValue().type)
    assert.equal(direction.west, added1.getDirection())
    assert.equal("input", added2.getFirstValue().type)
    assert.equal(direction.east, added2.getDirection())

    assertNEntities(2)
    assertUpdateCalled(added1, 1, nil, false, which === "lower" ? 0 : 1)
    assertUpdateCalled(added2, 2, nil, false, which === "lower" ? 1 : 0)
  })

  test("cannot rotate underground if not in first stage", () => {
    const { entity1, added1, added2 } = createUndergroundBeltPair(2, 3, 1)

    const [rotated1] = entity1.rotate()
    assert(rotated1)

    assemblyUpdater.onEntityRotated(assembly, entity1, stage, playerIndex, direction.west)

    assert.equal("input", added1.getFirstValue().type)
    assert.equal(direction.west, added1.getDirection())
    assert.equal("output", added2.getFirstValue().type)
    assert.equal(direction.east, added2.getDirection())

    assertNEntities(2)
    assertUpdateCalled(added1, 3, 3, false)
    assertNotified(entity1, [L_Game.CantBeRotated], true)
  })

  test("cannot rotate underground with multiple pairs", () => {
    const { entity1, entity2, added1, added2 } = createUndergroundBeltPair(1, 1)
    const { luaEntity: entity3, added: added3 } = createUndergroundBelt(1, 1, {
      position: Pos.plus(pos, { x: -2, y: 0 }),
    })

    const added = [added1, added2, added3]
    for (const [i, tryRotate] of ipairs([entity1, entity2, entity3])) {
      const [rotated] = tryRotate.rotate()
      assert(rotated)

      const [, hasMultiple] = findUndergroundPair(assembly.content, added[i - 1])
      assert.true(hasMultiple)

      assemblyUpdater.onEntityRotated(assembly, tryRotate, stage, playerIndex, direction.west)

      assert.equal("input", added1.getFirstValue().type)
      assert.equal(direction.west, added1.getDirection())
      assert.equal("output", added2.getFirstValue().type)
      assert.equal(direction.east, added2.getDirection())
      assert.equal("input", added3.getFirstValue().type)
      assert.equal(direction.west, added3.getDirection())

      assertNEntities(3)
      assertUpdateCalled(added[i - 1], 1, 1, false, 0)
      assertNotified(tryRotate, [L_Interaction.CannotFlipUndergroundDueToMultiplePairs], true)
      worldUpdater.updateWorldEntities.clear()
      worldNotifier.createNotification.clear()

      const [rotatedBack] = tryRotate.rotate()
      assert.true(rotatedBack, "rotated back")
    }
  })

  describe("upgrading undergrounds", () => {
    before_each(() => {
      mock(DefaultAssemblyUpdater, true)
    })
    after_each(() => {
      mock.revert(DefaultAssemblyUpdater)
    })

    test("can upgrade underground in first layer", () => {
      const { luaEntity, added } = createUndergroundBelt(1, 1)
      luaEntity.order_upgrade({
        target: "fast-underground-belt",
        force: luaEntity.force,
      })
      assemblyUpdater.onEntityMarkedForUpgrade(assembly, luaEntity, stage, playerIndex)

      assert.equal("fast-underground-belt", added.getFirstValue().name)
      assert.equal("input", added.getFirstValue().type)
      assert.equal(direction.west, added.getDirection())
      assertOneEntity()
      assertUpdateCalled(added, 1, nil, false)
    })

    test("can upgrade underground in higher layer", () => {
      const { luaEntity, added } = createUndergroundBelt(1, 2)
      luaEntity.order_upgrade({
        target: "fast-underground-belt",
        force: luaEntity.force,
      })
      assemblyUpdater.onEntityMarkedForUpgrade(assembly, luaEntity, stage, playerIndex)

      assert.equal("fast-underground-belt", added.getValueAtStage(2)?.name)
      assert.equal("input", added.getFirstValue().type)

      assertOneEntity()
      assertUpdateCalled(added, 2, nil, false)
    })

    test.each(["lower", "pair in higher", "self in higher"])(
      "upgrading %s underground in first stage upgrades pair",
      (which) => {
        const { entity1, entity2, added1, added2 } = createUndergroundBeltPair(1, which === "lower" ? 1 : 2, 2)
        const toUpgrade = which === "pair in higher" ? entity2 : entity1
        toUpgrade.order_upgrade({
          target: "fast-underground-belt",
          force: toUpgrade.force,
        })
        assemblyUpdater.onEntityMarkedForUpgrade(assembly, toUpgrade, stage, playerIndex)

        assert.equal("fast-underground-belt", added1.getFirstValue().name)
        assert.equal("input", added1.getFirstValue().type)
        assert.equal(direction.west, added1.getDirection())
        assert.equal("fast-underground-belt", added2.getFirstValue().name)
        assert.equal("output", added2.getFirstValue().type)
        assert.equal(direction.east, added2.getDirection())

        assertNEntities(2)
        assertUpdateCalled(added1, 1, nil, false, toUpgrade === entity1 ? 0 : 1)
        assertUpdateCalled(added2, 2, nil, false, toUpgrade === entity1 ? 1 : 0)
      },
    )

    test("cannot upgrade underground with multiple pairs", () => {
      const { entity1, entity2, added1, added2 } = createUndergroundBeltPair(1, 1)
      const { luaEntity: entity3, added: added3 } = createUndergroundBelt(1, 1, {
        position: Pos.plus(pos, { x: -2, y: 0 }),
      })

      for (const tryUpgrade of [entity1, entity2, entity3]) {
        tryUpgrade.order_upgrade({
          target: "fast-underground-belt",
          force: tryUpgrade.force,
        })
        assemblyUpdater.onEntityMarkedForUpgrade(assembly, tryUpgrade, stage, playerIndex)

        assert.equal("underground-belt", added1.getFirstValue().name)
        assert.equal("underground-belt", added2.getFirstValue().name)
        assert.equal("underground-belt", added3.getFirstValue().name)

        assertNEntities(3)
        assertNoCalls()
        assertNotified(tryUpgrade, [L_Interaction.CannotUpgradeUndergroundDueToMultiplePairs], true)
        worldNotifier.createNotification.clear()

        assert.nil(tryUpgrade.get_upgrade_target())
      }
    })

    test("cannot upgrade underground in higher layer if pair in different layers", () => {
      const { entity1, added1, added2 } = createUndergroundBeltPair(1, 3, 2)
      entity1.order_upgrade({
        target: "fast-underground-belt",
        force: entity1.force,
      })

      assemblyUpdater.onEntityMarkedForUpgrade(assembly, entity1, stage, playerIndex)

      assert.equal("underground-belt", added1.getFirstValue().name)
      assert.equal("underground-belt", added2.getFirstValue().name)

      assertNEntities(2)
      assertNoCalls()
      assertNotified(entity1, [L_Interaction.CannotCreateUndergroundUpgradeIfNotInSameStage], true)
    })

    test("cannot upgrade underground if it would change pair", () => {
      const { entity1, added1, added2 } = createUndergroundBeltPair(1, 1)
      const { added: added3 } = createUndergroundBelt(1, 1, {
        position: Pos.plus(pos, { x: -2, y: 0 }),
        name: "fast-underground-belt",
      })
      entity1.order_upgrade({
        target: "fast-underground-belt",
        force: entity1.force,
      })

      assemblyUpdater.onEntityMarkedForUpgrade(assembly, entity1, stage, playerIndex)

      assert.equal("underground-belt", added1.getFirstValue().name)
      assert.equal("underground-belt", added2.getFirstValue().name)
      assert.equal("fast-underground-belt", added3.getFirstValue().name)

      assertNEntities(3)
      assertNoCalls()
      assertNotified(entity1, [L_Interaction.CannotUpgradeUndergroundChangedPair], true)
    })
  })
  test("fast replace to upgrade also upgrades pair", () => {
    const { entity1, added1, added2 } = createUndergroundBeltPair(1, 1)
    const newEntity = entity1.surface.create_entity({
      name: "fast-underground-belt",
      direction: entity1.direction,
      position: entity1.position,
      force: entity1.force,
      type: entity1.belt_to_ground_type,
      fast_replace: true,
    })!
    assert.not_nil(newEntity)

    assemblyUpdater.onEntityPotentiallyUpdated(assembly, newEntity, stage, playerIndex)
    assert.equal("fast-underground-belt", added1.getFirstValue().name)
    assert.equal("input", added1.getFirstValue().type)
    assert.equal(direction.west, added1.getDirection())

    assert.equal("fast-underground-belt", added2.getFirstValue().name)
    assert.equal("output", added2.getFirstValue().type)
    assert.equal(direction.east, added2.getDirection())

    assertNEntities(2)
    assertUpdateCalled(added1, 1, nil, false, 0)
    assertUpdateCalled(added2, 1, nil, false, 1)
  })

  test("cannot move underground if it would also upgrade", () => {
    const { entity1, added1, added2 } = createUndergroundBeltPair(1, 2)
    added1.applyUpgradeAtStage(2, "fast-underground-belt")
    added2.applyUpgradeAtStage(2, "fast-underground-belt")

    assemblyUpdater.onMoveEntityToStage(assembly, entity1, stage, playerIndex)
    assert.equal(1, added1.getFirstStage())
    assert.equal(1, added2.getFirstStage())

    assertNEntities(2)
    assertNoCalls()
    assertNotified(entity1, [L_Interaction.CannotMoveUndergroundBeltWithUpgrade], true)
  })
})

describe("rolling stock", () => {
  let rollingStock: LuaEntity
  before_each(() => {
    game.surfaces[1].find_entities().forEach((e) => e.destroy())
    rollingStock = createRollingStock()
  })
  function addAndReset() {
    assemblyUpdater.onEntityCreated(assembly, rollingStock, stage, playerIndex)
    resetMocks()
    const found = assembly.content.findCompatibleAnyDirection(rollingStock.name, rollingStock.position)!
    return found!
  }
  test("can save rolling stock", () => {
    assemblyUpdater.onEntityCreated(assembly, rollingStock, stage, playerIndex)
    assertNEntities(1)

    const found = assembly.content.findCompatibleAnyDirection(rollingStock.name, rollingStock.position)!
    assert.not_nil(found, "found any direction")

    const foundDirectly = assembly.content.findCompatible(rollingStock, nil)
    assert.not_nil(foundDirectly, "found directly")
    assert.equal(found, foundDirectly, "found same entity")

    assertUpdateCalled(found, 1, nil, false)
  })

  test("no update on rolling stock", () => {
    addAndReset()

    assemblyUpdater.onEntityPotentiallyUpdated(assembly, rollingStock, stage, playerIndex)

    assertNEntities(1)
    assertNoCalls()
  })
})

describe("cleanup tool", () => {
  function setupWithProxy() {
    const { luaEntity, added } = addAndReset()
    luaEntity.destroy()
    const proxy = createEntity({ name: Prototypes.SelectionProxyPrefix + "test" })
    return { added, proxy }
  }
  test("revive error entity", () => {
    const { added, proxy } = setupWithProxy()
    assemblyUpdater.onCleanupToolUsed(assembly, proxy, stage)
    assert.nil(added.getWorldEntity(1))
    assertOneEntity()
    assertUpdateCalled(added, 1, 1, false)
  })

  test("clear settings remnant", () => {
    const { added, proxy } = setupWithProxy()
    added.isSettingsRemnant = true
    assemblyUpdater.onCleanupToolUsed(assembly, proxy, stage)
    assert.nil(added.getWorldEntity(1))
    assertNoEntities()
    assertDeleteAllEntitiesCalled(added)
  })

  test("onEntityForceDeleted", () => {
    const { added, proxy } = setupWithProxy()
    assemblyUpdater.onEntityForceDeleted(assembly, proxy, stage)
    assert.nil(added.getWorldEntity(1))
    assertNoEntities()
    assertDeleteAllEntitiesCalled(added)
  })
})
