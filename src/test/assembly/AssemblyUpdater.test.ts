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
import { AssemblyData } from "../../assembly/AssemblyDef"
import { createAssemblyUpdater2 } from "../../assembly/AssemblyUpdater"
import { createAssemblyUpdater, WorldListener, WorldNotifier } from "../../assembly/WorldListener"
import { WorldUpdater } from "../../assembly/WorldUpdater"
import { L_Game, Prototypes } from "../../constants"
import { AssemblyEntity, createAssemblyEntity, StageDiffsInternal, StageNumber } from "../../entity/AssemblyEntity"
import { EntityHandler } from "../../entity/EntityHandler"
import { UndergroundBeltEntity } from "../../entity/special-entities"
import { findUndergroundPair } from "../../entity/special-entity-treatment"
import { WireSaver } from "../../entity/WireHandler"
import { ContextualFun } from "../../lib"
import { Pos } from "../../lib/geometry"
import { L_Interaction } from "../../locale"
import { createRollingStock } from "../entity/createRollingStock"
import { makeStubbed, simpleMock } from "../simple-mock"
import { createMockAssemblyContent, setupTestSurfaces } from "./Assembly-mock"
import direction = defines.direction
import wire_type = defines.wire_type

// note: the actual surface of the lua entity passed does not matter, only the stage number (surface)
const pos = Pos(10.5, 10.5)

let assembly: AssemblyData
const surfaces: LuaSurface[] = setupTestSurfaces(6)

let assemblyUpdater: WorldListener
let worldUpdater: mock.Stubbed<WorldUpdater>
let wireSaver: mock.Stubbed<WireSaver>
let worldNotifier: mock.Mocked<WorldNotifier>

let worldUpdaterCalls: number
before_each(() => {
  assembly = createMockAssemblyContent(surfaces)
  worldUpdaterCalls = 0
  worldUpdater = makeStubbed(keys<WorldUpdater>())
  for (const [, v] of pairs(worldUpdater)) {
    v.invokes((() => {
      worldUpdaterCalls++
    }) as ContextualFun)
  }
  wireSaver = { saveWireConnections: stub() }
  wireSaver.saveWireConnections.returns(false)
  worldNotifier = { createNotification: spy() }
  assemblyUpdater = createAssemblyUpdater(createAssemblyUpdater2(worldUpdater, EntityHandler, wireSaver), worldNotifier)

  game.surfaces[1].find_entities().forEach((e) => e.destroy())
})

function createEntity(stageNum: StageNumber, args?: Partial<SurfaceCreateEntity>): LuaEntity {
  const params = {
    name: "filter-inserter",
    position: pos,
    force: "player",
    ...args,
  }
  const entity = assert(surfaces[stageNum - 1].create_entity(params), "created entity")[0]
  const proto = game.entity_prototypes[params.name]
  if (proto.type === "inserter") {
    entity.inserter_stack_size_override = 1
    entity.inserter_filter_mode = "whitelist"
  }
  return entity
}
const playerIndex = 1 as PlayerIndex

function addEntity(stageNum: StageNumber, args?: Partial<SurfaceCreateEntity>) {
  const entity = createEntity(stageNum, args)
  assemblyUpdater.onEntityCreated(assembly, stageNum, entity, playerIndex)
  const found = assembly.content.findCompatible(entity, nil) as AssemblyEntity<BlueprintEntity>
  assert(found, "found new entity")
  return { luaEntity: entity, asmEntity: found }
}

function resetMocks(): void {
  mock.clear(worldUpdater)
  mock.clear(wireSaver)
  worldUpdaterCalls = 0
}
function addAndReset(addStage: StageNumber = 1, args?: Partial<SurfaceCreateEntity>) {
  const ret = addEntity(addStage, args)
  resetMocks()
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

function assertWUNotCalled() {
  if (worldUpdaterCalls !== 0) {
    for (const [key, spy] of pairs(worldUpdater)) {
      assert
        .message(`${key} called`)
        .spy(spy as any)
        .not_called()
    }
  }
  worldUpdaterAsserted = true
}

function assertWUCalled(
  entity: AssemblyEntity,
  startStage: StageNumber,
  endStage: StageNumber | nil,
  replace: boolean,
  n?: number,
) {
  worldUpdaterAsserted = true
  if (n === nil) assert.equal(1, worldUpdaterCalls, "called once")
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
function assertDeleteAllEntitiesCalled(entity: AssemblyEntity) {
  worldUpdaterAsserted = true
  assert.equal(1, worldUpdaterCalls)
  assert.spy(worldUpdater.deleteAllEntities).called_with(match.ref(entity))
}
function assertClearWorldEntityCalled(entity: AssemblyEntity, stage: StageNumber) {
  worldUpdaterAsserted = true
  assert.equal(1, worldUpdaterCalls)
  assert.spy(worldUpdater.clearWorldEntity).called_with(match.ref(assembly), stage, match.ref(entity))
}
function assertMakeSettingsRemnantCalled(entity: AssemblyEntity) {
  worldUpdaterAsserted = true
  assert.equal(1, worldUpdaterCalls)
  assert.spy(worldUpdater.makeSettingsRemnant).called_with(assembly, entity)
}
function assertReviveSettingsRemnantCalled(entity: AssemblyEntity) {
  worldUpdaterAsserted = true
  assert.equal(1, worldUpdaterCalls)
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

function assertStageDiffs(entity: AssemblyEntity, changes: StageDiffsInternal<BlueprintEntity>) {
  assert.same(changes, entity.getStageDiffs())
}

function assertAdded(added: AssemblyEntity, luaEntity: LuaEntity, stageNum: StageNumber): void {
  assert.not_nil(added)
  assert.equal("filter-inserter", added.firstValue.name)
  assert.same(pos, added.position)
  assert.equal(0, added.getDirection())

  assert.equal(luaEntity, added.getWorldEntity(stageNum))

  assertOneEntity()
  assertWUCalled(added, 1, nil, false)
  assert.spy(wireSaver.saveWireConnections).called(1)
}

describe("add", () => {
  test("updates all stages", () => {
    const { asmEntity, luaEntity } = addEntity(1)
    assertAdded(asmEntity, luaEntity, 1)
  })

  test.each([1, 2])("at same or higher stage updates the newly added entity, added stage: %d", (stageNumber) => {
    const { luaEntity, asmEntity } = addAndReset(1)
    assemblyUpdater.onEntityCreated(assembly, stageNumber, luaEntity, playerIndex)
    assertOneEntity()
    assertWUCalled(asmEntity, stageNumber, stageNumber, false)
  })

  test.each([false, true])("at below stage does all behaviors, with stage diffs: %s", (withChanges) => {
    const { asmEntity } = addAndReset(3)
    const newEntity = createEntity(1)
    if (withChanges) {
      newEntity.inserter_stack_size_override = 3
      newEntity.direction = defines.direction.east
    }
    assemblyUpdater.onEntityCreated(assembly, 1, newEntity, playerIndex) // again
    // updates entity
    assert.equal(newEntity, asmEntity.getWorldEntity(1))
    assert.same(1, asmEntity.firstStage)
    // does not create stage diffs
    assert.equal(1, (asmEntity.firstValue as BlueprintEntity).override_stack_size)
    assert.false(asmEntity.hasStageDiff())
    // calls updateWorldEntities
    assertOneEntity()
    assertWUCalled(asmEntity, 1, 3, false)
    // records old stage
    assert.equal(3, asmEntity.getOldStage())
    // creates notification
    assertNotified(newEntity, [L_Interaction.EntityMovedFromStage, "mock stage 3"], false)
  })

  test("if can overlap, adding lower new direction creates new entity instead of updating old", () => {
    const { asmEntity } = addAndReset(1, {
      name: "straight-rail",
      direction: defines.direction.east,
    })
    const { asmEntity: newAsmEntity, luaEntity: newEntity } = addEntity(1, {
      name: "straight-rail",
      direction: defines.direction.north,
    })
    assert.not_equal(asmEntity, newAsmEntity)
    assert.equal(newEntity, newAsmEntity.getWorldEntity(1))
    assert.equal(1, newAsmEntity.firstStage)

    assertNEntities(2)
    assertWUCalled(newAsmEntity, 1, nil, false)
  })
})

describe("delete", () => {
  test("not in assembly does nothing", () => {
    const entity = createEntity(1)
    assemblyUpdater.onEntityDeleted(assembly, 1, entity, playerIndex)
    assertNoEntities()
    assertWUNotCalled()
  })

  test("in stage below base does nothing (bug)", () => {
    const { luaEntity } = addAndReset(2)
    assemblyUpdater.onEntityDeleted(assembly, 1, luaEntity, playerIndex)
    assertOneEntity()
    assertWUNotCalled()
  })

  test("in stage above base forbids deletion", () => {
    const { luaEntity, asmEntity } = addAndReset(1)
    assemblyUpdater.onEntityDeleted(assembly, 2, luaEntity, playerIndex)
    assertOneEntity()
    assertWUCalled(asmEntity, 2, 2, true)
  })

  test("in first stage deletes entity", () => {
    const { luaEntity, asmEntity } = addAndReset()
    assemblyUpdater.onEntityDeleted(assembly, 1, luaEntity, playerIndex)
    assert.falsy(asmEntity.isSettingsRemnant)
    assertNoEntities()
    assertDeleteAllEntitiesCalled(asmEntity)
  })

  test("in first stage with oldStage moves back to old stage", () => {
    const { luaEntity, asmEntity } = addAndReset(3)
    asmEntity.moveToStage(2, true)
    assemblyUpdater.onEntityDeleted(assembly, 2, luaEntity, playerIndex)
    assert.falsy(asmEntity.isSettingsRemnant)
    assertOneEntity()
    assertWUCalled(asmEntity, 2, 3, false)
    assert.nil(asmEntity.getOldStage())
    assertNotified(luaEntity, [L_Interaction.EntityMovedBackToStage, "mock stage 3"], false)
  })

  test("in first stage with updates creates settings remnant", () => {
    const { luaEntity, asmEntity } = addAndReset()
    asmEntity._applyDiffAtStage(2, { override_stack_size: 3 })
    assemblyUpdater.onEntityDeleted(assembly, 1, luaEntity, playerIndex)
    assertOneEntity()
    assert.true(asmEntity.isSettingsRemnant)
    assertMakeSettingsRemnantCalled(asmEntity)
  })

  test("in first stage with circuit connections creates settings remnant", () => {
    const { luaEntity, asmEntity } = addAndReset()
    const otherEntity = createAssemblyEntity({ name: "filter-inserter" }, Pos(0, 0), nil, 1)
    assembly.content.add(otherEntity)
    assembly.content.addCircuitConnection({
      fromEntity: otherEntity,
      toEntity: asmEntity,
      fromId: 1,
      toId: 1,
      wire: wire_type.green,
    })

    assemblyUpdater.onEntityDeleted(assembly, 1, luaEntity, playerIndex)
    assert.true(asmEntity.isSettingsRemnant)
    assertNEntities(2)
    assertMakeSettingsRemnantCalled(asmEntity)
  })

  test("in first stage, with circuit connections, but other has world entity, does not create remnant", () => {
    const { luaEntity, asmEntity } = addAndReset()
    const otherEntity = createAssemblyEntity({ name: "filter-inserter" }, Pos(0, 0), nil, 1)
    assembly.content.add(otherEntity)
    assembly.content.addCircuitConnection({
      fromEntity: otherEntity,
      toEntity: asmEntity,
      fromId: 1,
      toId: 1,
      wire: wire_type.green,
    })
    otherEntity.replaceWorldEntity(
      1,
      createEntity(1, {
        position: Pos.plus(asmEntity.position, { x: 0, y: 1 }),
      }),
    )

    assemblyUpdater.onEntityDeleted(assembly, 1, luaEntity, playerIndex)
    assert.falsy(asmEntity.isSettingsRemnant)
    assertOneEntity()
    assertDeleteAllEntitiesCalled(asmEntity)
  })
})

test("onEntityDied", () => {
  const { luaEntity, asmEntity } = addAndReset(1)
  assemblyUpdater.onEntityDied(assembly, 2, luaEntity)
  assertOneEntity()
  assertClearWorldEntityCalled(asmEntity, 2)
})

describe("revive", () => {
  test.each([1, 2, 3, 4, 5, 6])("settings remnant 1->3->5, revive at stage %d", (reviveStage) => {
    const { luaEntity, asmEntity } = addAndReset(1)
    asmEntity._applyDiffAtStage(3, { override_stack_size: 2 })
    asmEntity._applyDiffAtStage(5, { override_stack_size: 3 })
    asmEntity.isSettingsRemnant = true

    assemblyUpdater.onEntityCreated(assembly, reviveStage, luaEntity, playerIndex)
    assert.equal(luaEntity, asmEntity.getWorldEntity(reviveStage))
    assert.falsy(asmEntity.isSettingsRemnant)
    assert.equal(asmEntity.firstStage, reviveStage)

    if (reviveStage >= 5) {
      assert.equal(3, asmEntity.firstValue.override_stack_size)
      assert.false(asmEntity.hasStageDiff())
    } else if (reviveStage >= 3) {
      assert.equal(2, asmEntity.firstValue.override_stack_size)
      assertStageDiffs(asmEntity, { 5: { override_stack_size: 3 } })
    } else {
      assert.equal(1, asmEntity.firstValue.override_stack_size)
      assertStageDiffs(asmEntity, { 3: { override_stack_size: 2 }, 5: { override_stack_size: 3 } })
    }

    assertOneEntity()
    assertReviveSettingsRemnantCalled(asmEntity)
  })

  test.each([false, true])("settings remnant 2->3, revive at stage 1, with changes: %s", (withChanges) => {
    const { luaEntity, asmEntity } = addAndReset(2)
    asmEntity._applyDiffAtStage(3, { override_stack_size: 3 })
    asmEntity.isSettingsRemnant = true

    if (withChanges) luaEntity.inserter_stack_size_override = 2

    assemblyUpdater.onEntityCreated(assembly, 1, luaEntity, playerIndex)
    assert.falsy(asmEntity.isSettingsRemnant)
    assert.equal(asmEntity.firstStage, 1)

    assert.equal(1, asmEntity.firstValue.override_stack_size)
    assertStageDiffs(asmEntity, { 3: { override_stack_size: 3 } })

    assertOneEntity()
    assertReviveSettingsRemnantCalled(asmEntity)
  })
})

describe("update", () => {
  test("non-existent defaults to add behavior (bug)", () => {
    const entity = createEntity(1)
    const ret = assemblyUpdater.onEntityPotentiallyUpdated(assembly, 1, entity, nil, playerIndex)
    assert.false(ret)
    const asmEntity = assembly.content.findCompatibleByName("filter-inserter", pos, nil) as AssemblyEntity
    assertAdded(asmEntity, entity, 1)
  })

  test("with no changes does nothing", () => {
    const { luaEntity } = addAndReset()
    const ret = assemblyUpdater.onEntityPotentiallyUpdated(assembly, 1, luaEntity, nil, playerIndex)
    assert.nil(ret)
    assertOneEntity()
    assertWUNotCalled()
  })

  test("in lower than first stage defaults to add below behavior (bug)", () => {
    const { luaEntity, asmEntity } = addAndReset(3)
    const ret = assemblyUpdater.onEntityPotentiallyUpdated(assembly, 1, luaEntity, nil, playerIndex)
    assert.false(ret)
    assert.equal(luaEntity, asmEntity.getWorldEntity(1))
    assertOneEntity()
    assertWUCalled(asmEntity, 1, 3, false)
    notificationsAsserted = true // skip
  })

  test("in first stage updates all entities", () => {
    const { luaEntity, asmEntity } = addAndReset(2)
    luaEntity.inserter_stack_size_override = 3
    const ret = assemblyUpdater.onEntityPotentiallyUpdated(assembly, 2, luaEntity, nil, playerIndex)
    assert.nil(ret)

    assert.equal(3, asmEntity.firstValue.override_stack_size)

    assertOneEntity()
    assertWUCalled(asmEntity, 2, nil, false)
  })

  test("can detect rotate by pasting", () => {
    const { luaEntity, asmEntity } = addAndReset(2, {
      name: "assembling-machine-2",
      recipe: "express-transport-belt",
    })
    luaEntity.direction = defines.direction.east
    const ret = assemblyUpdater.onEntityPotentiallyUpdated(assembly, 2, luaEntity, nil, playerIndex)
    assert.nil(ret)

    assert.equal(defines.direction.east, asmEntity.getDirection())
    assertOneEntity()
    assertWUCalled(asmEntity, 2, nil, false)
  })

  test("forbids rotate if in higher stage", () => {
    const { luaEntity, asmEntity } = addAndReset(2)
    luaEntity.direction = defines.direction.east

    const ret = assemblyUpdater.onEntityPotentiallyUpdated(assembly, 3, luaEntity, defines.direction.north, playerIndex)
    assert.nil(ret)
    assert.equal(defines.direction.north, asmEntity.getDirection())

    assertOneEntity()
    assertWUCalled(asmEntity, 3, 3, false)
    assertNotified(luaEntity, [L_Game.CantBeRotated], true)
  })

  test.each([false, true])(
    "in higher stage updates assembly.content and entities, with existing changes: %s",
    (withExistingChanges) => {
      const { luaEntity, asmEntity } = addAndReset(1)
      if (withExistingChanges) {
        asmEntity._applyDiffAtStage(2, { override_stack_size: 2, filter_mode: "blacklist" })
        luaEntity.inserter_filter_mode = "blacklist"
      }

      luaEntity.inserter_stack_size_override = 3 // changed
      const ret = assemblyUpdater.onEntityPotentiallyUpdated(assembly, 2, luaEntity, nil, playerIndex)
      assert.nil(ret)
      assert.equal(1, asmEntity.firstValue.override_stack_size)
      if (withExistingChanges) {
        assertStageDiffs(asmEntity, { 2: { override_stack_size: 3, filter_mode: "blacklist" } })
      } else {
        assertStageDiffs(asmEntity, { 2: { override_stack_size: 3 } })
      }

      assertOneEntity()
      assertWUCalled(asmEntity, 2, nil, false)
    },
  )

  test("updating matching previous stage removes stage diffs", () => {
    const { luaEntity, asmEntity } = addAndReset(1)
    asmEntity._applyDiffAtStage(2, { override_stack_size: 2 })
    assert.true(asmEntity.hasStageDiff())
    luaEntity.inserter_stack_size_override = 1
    const ret = assemblyUpdater.onEntityPotentiallyUpdated(assembly, 2, luaEntity, nil, playerIndex)
    assert.nil(ret)
    assert.false(asmEntity.hasStageDiff())

    assertOneEntity()
    assertWUCalled(asmEntity, 2, nil, false)
  })
})

describe("rotate", () => {
  test("in first stage rotates all entities", () => {
    const { luaEntity, asmEntity } = addAndReset(2)
    const oldDirection = luaEntity.direction
    luaEntity.direction = direction.west
    assemblyUpdater.onEntityRotated(assembly, 2, luaEntity, oldDirection, playerIndex)
    assert.equal(direction.west, asmEntity.getDirection())
    assertOneEntity()
    assertWUCalled(asmEntity, 2, nil, false)
  })

  test("in higher stage forbids rotation", () => {
    const { luaEntity, asmEntity } = addAndReset(1)
    const oldDirection = luaEntity.direction
    luaEntity.direction = direction.west
    assemblyUpdater.onEntityRotated(assembly, 2, luaEntity, oldDirection, playerIndex)
    assert.equal(oldDirection, asmEntity.getDirection())
    assertOneEntity()
    assertWUCalled(asmEntity, 2, 2, false)
    assertNotified(luaEntity, [L_Game.CantBeRotated], true)
  })
})

describe("fast replace", () => {
  test("sets world entity and calls update", () => {
    const { luaEntity, asmEntity } = addAndReset()
    luaEntity.destroy()
    const newEntity = createEntity(1, { name: "stack-filter-inserter" })
    const ret = assemblyUpdater.onEntityPotentiallyUpdated(assembly, 1, newEntity, nil, playerIndex)
    assert.nil(ret)
    assert.equal(newEntity, asmEntity.getWorldEntity(1))
    assertOneEntity()
    assertWUCalled(asmEntity, 1, nil, false)
  })
  test("with new direction sets world entity and calls update", () => {
    const { luaEntity, asmEntity } = addAndReset()
    const oldDirection = luaEntity.direction
    const newEntity = createEntity(1, { name: "stack-filter-inserter", direction: direction.west })
    luaEntity.destroy()
    const ret = assemblyUpdater.onEntityPotentiallyUpdated(assembly, 1, newEntity, oldDirection, playerIndex)
    assert.nil(ret)
    assert.equal(newEntity, asmEntity.getWorldEntity(1))
    assertOneEntity()
    assertWUCalled(asmEntity, 1, nil, false)
  })
  test("with forbidden rotation", () => {
    const { luaEntity, asmEntity } = addAndReset(1)
    const oldDirection = luaEntity.direction
    const newEntity = createEntity(2, { name: "stack-filter-inserter", direction: direction.west })
    luaEntity.destroy()
    const ret = assemblyUpdater.onEntityPotentiallyUpdated(assembly, 2, newEntity, oldDirection, playerIndex)
    assert.nil(ret)
    assert.equal(oldDirection, asmEntity.getDirection())
    assertOneEntity()
    assertWUCalled(asmEntity, 2, 2, false)
    assertNotified(newEntity, [L_Game.CantBeRotated], true)
  })
})

describe("circuitWiresPotentiallyUpdated", () => {
  test("if saved, calls update", () => {
    const { luaEntity, asmEntity } = addAndReset()
    wireSaver.saveWireConnections.on_call_with(match._, asmEntity, 1).returns(true)
    assemblyUpdater.onCircuitWiresPotentiallyUpdated(assembly, 1, luaEntity, playerIndex)

    assertOneEntity()
    assertWUCalled(asmEntity, 1, nil, false)
  })
  test("if no changes, does not call update", () => {
    const { luaEntity } = addAndReset()
    wireSaver.saveWireConnections.returns(false)
    assemblyUpdater.onCircuitWiresPotentiallyUpdated(assembly, 1, luaEntity, playerIndex)

    assertOneEntity()
    assertWUNotCalled()
  })
  test("if max connections exceeded, notifies and calls update", () => {
    const { luaEntity, asmEntity } = addAndReset()
    wireSaver.saveWireConnections.on_call_with(match._, asmEntity, 1).returns(true, true)
    assemblyUpdater.onCircuitWiresPotentiallyUpdated(assembly, 1, luaEntity, playerIndex)

    assertOneEntity()
    assertWUCalled(asmEntity, 1, nil, false)
    assertNotified(luaEntity, [L_Interaction.MaxConnectionsReachedInAnotherStage], true)
  })
})

describe("mark for upgrade", () => {
  test("upgrade to new value", () => {
    const { luaEntity, asmEntity } = addAndReset()
    rawset(luaEntity, "get_upgrade_target", () => simpleMock<LuaEntityPrototype>({ name: "stack-filter-inserter" }))
    rawset(luaEntity, "get_upgrade_direction", () => nil)
    rawset(luaEntity, "cancel_upgrade", () => true)
    assemblyUpdater.onEntityMarkedForUpgrade(assembly, 1, luaEntity, playerIndex)
    assert.equal("stack-filter-inserter", asmEntity.firstValue.name)
    assertOneEntity()
    assertWUCalled(asmEntity, 1, nil, false)
  })
  test("upgrade to rotated", () => {
    const { luaEntity, asmEntity } = addAndReset()
    rawset(luaEntity, "get_upgrade_target", () => nil)
    rawset(luaEntity, "get_upgrade_direction", () => direction.west)
    rawset(luaEntity, "cancel_upgrade", () => true)
    assemblyUpdater.onEntityMarkedForUpgrade(assembly, 1, luaEntity, playerIndex)
    assert.equal(direction.west, asmEntity.getDirection())
    assertOneEntity()
    assertWUCalled(asmEntity, 1, nil, false)
  })
  test("upgrade to rotate forbidden", () => {
    const { luaEntity, asmEntity } = addAndReset(1)
    rawset(luaEntity, "get_upgrade_target", () => simpleMock<LuaEntityPrototype>({ name: "stack-filter-inserter" }))
    rawset(luaEntity, "get_upgrade_direction", () => direction.west)
    rawset(luaEntity, "cancel_upgrade", () => true)
    assemblyUpdater.onEntityMarkedForUpgrade(assembly, 2, luaEntity, playerIndex)
    assert.equal(0, asmEntity.getDirection())
    assertOneEntity()
    assertWUCalled(asmEntity, 2, 2, false)
    assertNotified(luaEntity, [L_Game.CantBeRotated], true)
  })
})

describe("move to current stage", () => {
  test("normal entity", () => {
    const { luaEntity, asmEntity } = addAndReset(1)
    assemblyUpdater.onMoveEntityToStage(assembly, 3, luaEntity, playerIndex)
    assert.equal(3, asmEntity.firstStage)
    assertOneEntity()
    assertWUCalled(asmEntity, 1, nil, false)
    assertNotified(luaEntity, [L_Interaction.EntityMovedFromStage, "mock stage 1"], false)
    assert.nil(asmEntity.getOldStage())
  })

  test("preview entity", () => {
    const { luaEntity, asmEntity } = addAndReset(1)
    const preview = createEntity(3, { name: Prototypes.PreviewEntityPrefix + luaEntity.name })
    luaEntity.destroy()
    assemblyUpdater.onMoveEntityToStage(assembly, 3, preview, playerIndex)
    assert.equal(3, asmEntity.firstStage)
    assertOneEntity()
    assertWUCalled(asmEntity, 1, nil, false)
    assertNotified(preview, [L_Interaction.EntityMovedFromStage, "mock stage 1"], false)
    assert.nil(asmEntity.getOldStage())
  })

  test("settings remnant", () => {
    // with preview again
    const { luaEntity, asmEntity } = addAndReset(1)
    const preview = createEntity(3, { name: Prototypes.PreviewEntityPrefix + luaEntity.name })
    luaEntity.destroy()
    asmEntity.isSettingsRemnant = true
    assemblyUpdater.onMoveEntityToStage(assembly, 3, preview, playerIndex)
    assert.equal(3, asmEntity.firstStage)
    assertOneEntity()
    assertReviveSettingsRemnantCalled(asmEntity)
    assert.nil(asmEntity.getOldStage())
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
    const { luaEntity, asmEntity } = addAndReset(firstStage, {
      name: "underground-belt",
      position: pos,
      direction: direction.west,
      ...args,
    })

    return { luaEntity, asmEntity: asmEntity as AssemblyEntity<UndergroundBeltEntity> }
  }

  test("creating underground automatically sets to correct direction", () => {
    const { luaEntity: entity1 } = createUndergroundBelt(1, 2)
    entity1.destroy()
    const { asmEntity } = addEntity(1, {
      name: "underground-belt",
      position: Pos.plus(pos, { x: -3, y: 0 }),
      direction: direction.east,
      type: "input",
    })

    assert.equal("output", asmEntity.firstValue.type)
    assertNEntities(2)
    assertWUCalled(asmEntity, 1, nil, false)
  })

  function createUndergroundBeltPair(
    firstStage: StageNumber,
    endStage: StageNumber,
    otherStage: StageNumber = firstStage,
  ): {
    entity1: LuaEntity
    entity2: LuaEntity
    asmEntity1: AssemblyEntity<UndergroundBeltEntity>
    asmEntity2: AssemblyEntity<UndergroundBeltEntity>
  } {
    const { luaEntity: entity1, asmEntity: asmEntity1 } = createUndergroundBelt(firstStage, otherStage)
    const { luaEntity: entity2, asmEntity: asmEntity2 } = createUndergroundBelt(otherStage, endStage, {
      position: Pos.plus(pos, { x: -3, y: 0 }),
      type: "output",
    })
    return { entity1, entity2, asmEntity1, asmEntity2 }
  }

  test("lone underground belt in first stage rotates all entities", () => {
    const { luaEntity, asmEntity } = createUndergroundBelt(1, 1)

    const [rotated] = luaEntity.rotate()
    assert(rotated)

    assemblyUpdater.onEntityRotated(assembly, 1, luaEntity, direction.west, playerIndex)

    assert.equal("output", asmEntity.firstValue.type)
    assert.equal(direction.west, asmEntity.getDirection())

    assertOneEntity()
    assertWUCalled(asmEntity, 1, nil, false)
  })

  test("lone underground belt in higher stage forbids rotation", () => {
    const { luaEntity, asmEntity } = createUndergroundBelt(1, 2)

    const [rotated] = luaEntity.rotate()
    assert(rotated)

    assemblyUpdater.onEntityRotated(assembly, 2, luaEntity, direction.west, playerIndex)

    assert.equal("input", asmEntity.firstValue.type)
    assert.equal(direction.west, asmEntity.getDirection())

    assertOneEntity()
    assertWUCalled(asmEntity, 2, 2, false)
    assertNotified(luaEntity, [L_Game.CantBeRotated], true)
  })

  test.each(["lower", "higher"])("rotating %s underground in first stage rotates pair", (which) => {
    const { entity1, entity2, asmEntity1, asmEntity2 } = createUndergroundBeltPair(1, 2, 2)

    const toRotate = which === "lower" ? entity1 : entity2
    const [rotated1] = toRotate.rotate()
    assert(rotated1)

    assemblyUpdater.onEntityRotated(assembly, 2, toRotate, direction.west, playerIndex)

    assert.equal("output", asmEntity1.firstValue.type)
    assert.equal(direction.west, asmEntity1.getDirection())
    assert.equal("input", asmEntity2.firstValue.type)
    assert.equal(direction.east, asmEntity2.getDirection())

    assertNEntities(2)
    assertWUCalled(asmEntity1, 1, nil, false, which === "lower" ? 0 : 1)
    assertWUCalled(asmEntity2, 2, nil, false, which === "lower" ? 1 : 0)
  })

  test("cannot rotate underground if not in first stage", () => {
    const { entity1, asmEntity1, asmEntity2 } = createUndergroundBeltPair(2, 3, 1)

    const [rotated1] = entity1.rotate()
    assert(rotated1)

    assemblyUpdater.onEntityRotated(assembly, 3, entity1, direction.west, playerIndex)

    assert.equal("input", asmEntity1.firstValue.type)
    assert.equal(direction.west, asmEntity1.getDirection())
    assert.equal("output", asmEntity2.firstValue.type)
    assert.equal(direction.east, asmEntity2.getDirection())

    assertNEntities(2)
    assertWUCalled(asmEntity1, 3, 3, false)
    assertNotified(entity1, [L_Game.CantBeRotated], true)
  })

  test("cannot rotate underground with multiple pairs", () => {
    const { entity1, entity2, asmEntity1, asmEntity2 } = createUndergroundBeltPair(1, 1)
    const { luaEntity: entity3, asmEntity: asmEntity3 } = createUndergroundBelt(1, 1, {
      position: Pos.plus(pos, { x: -2, y: 0 }),
    })

    const asmEntities = [asmEntity1, asmEntity2, asmEntity3]
    for (const [i, tryRotate] of ipairs([entity1, entity2, entity3])) {
      const [rotated] = tryRotate.rotate()
      assert(rotated)

      const [, hasMultiple] = findUndergroundPair(assembly.content, asmEntities[i - 1])
      assert.true(hasMultiple)

      assemblyUpdater.onEntityRotated(assembly, 1, tryRotate, direction.west, playerIndex)

      assert.equal("input", asmEntity1.firstValue.type)
      assert.equal(direction.west, asmEntity1.getDirection())
      assert.equal("output", asmEntity2.firstValue.type)
      assert.equal(direction.east, asmEntity2.getDirection())
      assert.equal("input", asmEntity3.firstValue.type)
      assert.equal(direction.west, asmEntity3.getDirection())

      assertNEntities(3)
      assertWUCalled(asmEntities[i - 1], 1, 1, false, 0)
      assertNotified(tryRotate, [L_Interaction.CannotFlipUndergroundDueToMultiplePairs], true)
      worldUpdater.updateWorldEntities.clear()
      worldNotifier.createNotification.clear()

      const [rotatedBack] = tryRotate.rotate()
      assert.true(rotatedBack, "rotated back")
    }
  })

  describe("upgrading undergrounds", () => {
    before_each(() => {
      mock(WorldListener, true)
    })
    after_each(() => {
      mock.revert(WorldListener)
    })

    test("can upgrade underground in first stage", () => {
      const { luaEntity, asmEntity } = createUndergroundBelt(1, 1)
      luaEntity.order_upgrade({
        target: "fast-underground-belt",
        force: luaEntity.force,
      })
      assemblyUpdater.onEntityMarkedForUpgrade(assembly, 1, luaEntity, playerIndex)

      assert.equal("fast-underground-belt", asmEntity.firstValue.name)
      assert.equal("input", asmEntity.firstValue.type)
      assert.equal(direction.west, asmEntity.getDirection())
      assertOneEntity()
      assertWUCalled(asmEntity, 1, nil, false)
    })

    test("can upgrade underground in higher stage", () => {
      const { luaEntity, asmEntity } = createUndergroundBelt(1, 2)
      luaEntity.order_upgrade({
        target: "fast-underground-belt",
        force: luaEntity.force,
      })
      assemblyUpdater.onEntityMarkedForUpgrade(assembly, 2, luaEntity, playerIndex)

      assert.equal("fast-underground-belt", asmEntity.getValueAtStage(2)?.name)
      assert.equal("input", asmEntity.firstValue.type)

      assertOneEntity()
      assertWUCalled(asmEntity, 2, nil, false)
    })

    test.each(["lower", "pair in higher", "self in higher"])(
      "upgrading %s underground in first stage upgrades pair",
      (which) => {
        const endStage = which === "lower" ? 1 : 2
        const { entity1, entity2, asmEntity1, asmEntity2 } = createUndergroundBeltPair(1, endStage, 2)
        const toUpgrade = which === "pair in higher" ? entity2 : entity1
        toUpgrade.order_upgrade({
          target: "fast-underground-belt",
          force: toUpgrade.force,
        })
        assemblyUpdater.onEntityMarkedForUpgrade(assembly, endStage, toUpgrade, playerIndex)

        assert.equal("fast-underground-belt", asmEntity1.firstValue.name)
        assert.equal("input", asmEntity1.firstValue.type)
        assert.equal(direction.west, asmEntity1.getDirection())
        assert.equal("fast-underground-belt", asmEntity2.firstValue.name)
        assert.equal("output", asmEntity2.firstValue.type)
        assert.equal(direction.east, asmEntity2.getDirection())

        assertNEntities(2)
        assertWUCalled(asmEntity1, 1, nil, false, toUpgrade === entity1 ? 0 : 1)
        assertWUCalled(asmEntity2, 2, nil, false, toUpgrade === entity1 ? 1 : 0)
      },
    )

    test("cannot upgrade underground with multiple pairs", () => {
      const { entity1, entity2, asmEntity1, asmEntity2 } = createUndergroundBeltPair(1, 1)
      const { luaEntity: entity3, asmEntity: asmEntity3 } = createUndergroundBelt(1, 1, {
        position: Pos.plus(pos, { x: -2, y: 0 }),
      })

      for (const tryUpgrade of [entity1, entity2, entity3]) {
        tryUpgrade.order_upgrade({
          target: "fast-underground-belt",
          force: tryUpgrade.force,
        })
        assemblyUpdater.onEntityMarkedForUpgrade(assembly, 1, tryUpgrade, playerIndex)

        assert.equal("underground-belt", asmEntity1.firstValue.name)
        assert.equal("underground-belt", asmEntity2.firstValue.name)
        assert.equal("underground-belt", asmEntity3.firstValue.name)

        assertNEntities(3)
        assertWUNotCalled()
        assertNotified(tryUpgrade, [L_Interaction.CannotUpgradeUndergroundDueToMultiplePairs], true)
        worldNotifier.createNotification.clear()

        assert.nil(tryUpgrade.get_upgrade_target())
      }
    })

    test("cannot upgrade underground in higher stage if pair in different stages", () => {
      const { entity1, asmEntity1, asmEntity2 } = createUndergroundBeltPair(1, 3, 2)
      entity1.order_upgrade({
        target: "fast-underground-belt",
        force: entity1.force,
      })

      assemblyUpdater.onEntityMarkedForUpgrade(assembly, 3, entity1, playerIndex)

      assert.equal("underground-belt", asmEntity1.firstValue.name)
      assert.equal("underground-belt", asmEntity2.firstValue.name)

      assertNEntities(2)
      assertWUNotCalled()
      assertNotified(entity1, [L_Interaction.CannotCreateUndergroundUpgradeIfNotInSameStage], true)
    })

    test("cannot upgrade underground if it would change pair", () => {
      const { entity1, asmEntity1, asmEntity2 } = createUndergroundBeltPair(1, 1)
      const { asmEntity: asmEntity3 } = createUndergroundBelt(1, 1, {
        position: Pos.plus(pos, { x: -2, y: 0 }),
        name: "fast-underground-belt",
      })
      entity1.order_upgrade({
        target: "fast-underground-belt",
        force: entity1.force,
      })

      assemblyUpdater.onEntityMarkedForUpgrade(assembly, 1, entity1, playerIndex)

      assert.equal("underground-belt", asmEntity1.firstValue.name)
      assert.equal("underground-belt", asmEntity2.firstValue.name)
      assert.equal("fast-underground-belt", asmEntity3.firstValue.name)

      assertNEntities(3)
      assertWUNotCalled()
      assertNotified(entity1, [L_Interaction.CannotUpgradeUndergroundChangedPair], true)
    })
  })
  test("fast replace to upgrade also upgrades pair", () => {
    const { entity1, asmEntity1, asmEntity2 } = createUndergroundBeltPair(1, 1)
    const newEntity = entity1.surface.create_entity({
      name: "fast-underground-belt",
      direction: entity1.direction,
      position: entity1.position,
      force: entity1.force,
      type: entity1.belt_to_ground_type,
      fast_replace: true,
    })!
    assert.not_nil(newEntity)

    assemblyUpdater.onEntityPotentiallyUpdated(assembly, 1, newEntity, nil, playerIndex)
    assert.equal("fast-underground-belt", asmEntity1.firstValue.name)
    assert.equal("input", asmEntity1.firstValue.type)
    assert.equal(direction.west, asmEntity1.getDirection())

    assert.equal("fast-underground-belt", asmEntity2.firstValue.name)
    assert.equal("output", asmEntity2.firstValue.type)
    assert.equal(direction.east, asmEntity2.getDirection())

    assertNEntities(2)
    assertWUCalled(asmEntity1, 1, nil, false, 0)
    assertWUCalled(asmEntity2, 1, nil, false, 1)
  })

  test("cannot move underground if it would also upgrade", () => {
    const { entity1, asmEntity1, asmEntity2 } = createUndergroundBeltPair(1, 2)
    asmEntity1.applyUpgradeAtStage(2, "fast-underground-belt")
    asmEntity2.applyUpgradeAtStage(2, "fast-underground-belt")

    assemblyUpdater.onMoveEntityToStage(assembly, 2, entity1, playerIndex)
    assert.equal(1, asmEntity1.firstStage)
    assert.equal(1, asmEntity2.firstStage)

    assertNEntities(2)
    assertWUNotCalled()
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
    assemblyUpdater.onEntityCreated(assembly, 1, rollingStock, playerIndex)
    resetMocks()
    const found = assembly.content.findCompatibleAnyDirection(rollingStock.name, rollingStock.position)!
    return found
  }
  test("can save rolling stock", () => {
    assemblyUpdater.onEntityCreated(assembly, 1, rollingStock, playerIndex)
    assertNEntities(1)

    const found = assembly.content.findCompatibleAnyDirection(rollingStock.name, rollingStock.position)!
    assert.not_nil(found, "found any direction")

    const foundDirectly = assembly.content.findCompatible(rollingStock, nil)
    assert.not_nil(foundDirectly, "found directly")
    assert.equal(found, foundDirectly, "found same entity")

    assertWUCalled(found, 1, nil, false)
  })

  test("no update on rolling stock", () => {
    addAndReset()

    assemblyUpdater.onEntityPotentiallyUpdated(assembly, 1, rollingStock, nil, playerIndex)

    assertNEntities(1)
    assertWUNotCalled()
  })
})

describe("cleanup tool", () => {
  function setupWithSelectablePreview() {
    const { luaEntity, asmEntity } = addAndReset()
    const preview = createEntity(1, { name: Prototypes.PreviewEntityPrefix + luaEntity.name })
    luaEntity.destroy()
    return { asmEntity, proxy: preview }
  }
  test("revive error entity", () => {
    const { asmEntity, proxy } = setupWithSelectablePreview()
    assemblyUpdater.onCleanupToolUsed(assembly, 1, proxy)
    assert.nil(asmEntity.getWorldEntity(1))
    assertOneEntity()
    assertWUCalled(asmEntity, 1, nil, false)
  })

  test("clear settings remnant", () => {
    const { asmEntity, proxy } = setupWithSelectablePreview()
    asmEntity.isSettingsRemnant = true
    assemblyUpdater.onCleanupToolUsed(assembly, 1, proxy)
    assert.nil(asmEntity.getWorldEntity(1))
    assertNoEntities()
    assertDeleteAllEntitiesCalled(asmEntity)
  })

  test("onEntityForceDeleted", () => {
    const { asmEntity, proxy } = setupWithSelectablePreview()
    assemblyUpdater.onEntityForceDeleted(assembly, 1, proxy)
    assert.nil(asmEntity.getWorldEntity(1))
    assertNoEntities()
    assertDeleteAllEntitiesCalled(asmEntity)
  })
})
