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
import { AssemblyUpdater, createAssemblyUpdater, StageMoveResult } from "../../assembly/AssemblyUpdater"
import { WorldListener } from "../../assembly/WorldListener"
import { WorldUpdater } from "../../assembly/WorldUpdater"
import {
  AssemblyEntity,
  createAssemblyEntity,
  RollingStockAssemblyEntity,
  StageDiffsInternal,
  StageNumber,
} from "../../entity/AssemblyEntity"
import { EntityHandler } from "../../entity/EntityHandler"
import { UndergroundBeltEntity } from "../../entity/special-entities"
import { findUndergroundPair } from "../../entity/special-entity-treatment"
import { WireSaver } from "../../entity/WireHandler"
import { ContextualFun } from "../../lib"
import { Pos } from "../../lib/geometry"
import { createRollingStock, createRollingStocks } from "../entity/createRollingStock"
import { makeStubbed } from "../simple-mock"
import { createMockAssembly, setupTestSurfaces } from "./Assembly-mock"
import direction = defines.direction
import wire_type = defines.wire_type

const pos = Pos(10.5, 10.5)

let assembly: AssemblyData
const surfaces: LuaSurface[] = setupTestSurfaces(6)

let assemblyUpdater: AssemblyUpdater
let worldUpdater: mock.Stubbed<WorldUpdater>
let wireSaver: mock.Stubbed<WireSaver>

let worldUpdaterCalls: number
before_each(() => {
  assembly = createMockAssembly(surfaces)
  worldUpdaterCalls = 0
  worldUpdater = makeStubbed(keys<WorldUpdater>())
  for (const [, v] of pairs(worldUpdater)) {
    v.invokes((() => {
      worldUpdaterCalls++
    }) as ContextualFun)
  }
  wireSaver = { saveWireConnections: stub() }
  wireSaver.saveWireConnections.returns(false)
  assemblyUpdater = createAssemblyUpdater(worldUpdater, EntityHandler, wireSaver)

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

function clearMocks(): void {
  mock.clear(worldUpdater)
  mock.clear(wireSaver)
  worldUpdaterCalls = 0
}

let worldUpdaterAsserted = false
let entitiesAsserted = false
before_each(() => {
  worldUpdaterAsserted = false
  entitiesAsserted = false
})
after_each(() => {
  assert(worldUpdaterAsserted, "events not asserted")
  assert(entitiesAsserted, "entities not asserted")
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
  if (n === nil) assert.equal(1, worldUpdaterCalls, "wu called once")
  const spy = worldUpdater.updateAllWorldEntities
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

function assertStageDiffs(entity: AssemblyEntity, changes: StageDiffsInternal<BlueprintEntity>) {
  assert.same(changes, entity.getStageDiffs())
}

test("addNewEntity", () => {
  const luaEntity = createEntity(2)
  const entity = assemblyUpdater.addNewEntity(assembly, 2, luaEntity)!
  assert.not_nil(entity)
  assert.equal("filter-inserter", entity.firstValue.name)
  assert.same(pos, entity.position)
  assert.equal(0, entity.getDirection())

  const found = assembly.content.findCompatible(luaEntity, nil) as AssemblyEntity<BlueprintEntity>
  assert.equal(entity, found, "added to content")

  assert.equal(luaEntity, entity.getWorldEntity(2))

  assertOneEntity()
  assertWUCalled(entity, 1, nil, false)
  assert.spy(wireSaver.saveWireConnections).called_with(assembly.content, entity, 2)
})

function addEntity(stage: StageNumber, args?: Partial<SurfaceCreateEntity>) {
  const luaEntity = createEntity(stage, args)
  const entity = assemblyUpdater.addNewEntity<BlueprintEntity>(assembly, stage, luaEntity)!
  assert.not_nil(entity)
  clearMocks()
  entity.replaceWorldEntity(stage, luaEntity)
  return { entity, luaEntity }
}

test("refreshEntityAtStage calls worldUpdater at one stage", () => {
  const { entity } = addEntity(2)

  assemblyUpdater.refreshEntityAtStage(assembly, 2, entity)

  assertOneEntity()
  assertWUCalled(entity, 2, 2, false)
})

test("refreshEntityAllStages calls worldUpdater at all stages", () => {
  const { entity } = addEntity(2)

  assemblyUpdater.refreshEntityAllStages(assembly, entity)

  assertOneEntity()
  assertWUCalled(entity, 1, nil, false)
})

test("moveEntityOnPreviewReplace", () => {
  const { entity } = addEntity(2)

  assemblyUpdater.moveEntityOnPreviewReplace(assembly, 1, entity)

  assert.same(1, entity.firstStage)
  assert.equal(1, (entity.firstValue as BlueprintEntity).override_stack_size)
  assert.false(entity.hasStageDiff())
  assertOneEntity()
  assertWUCalled(entity, 1, 2, false)
})

test("reviveSettingsRemnant", () => {
  const { entity } = addEntity(2)
  entity.isSettingsRemnant = true

  assemblyUpdater.reviveSettingsRemnant(assembly, 1, entity)

  assert.nil(entity.isSettingsRemnant)
  assert.same(1, entity.firstStage)
  assertOneEntity()
  assertReviveSettingsRemnantCalled(entity)
})

test("disallowEntityDeletion", () => {
  const { entity } = addEntity(1)

  assemblyUpdater.disallowEntityDeletion(assembly, 2, entity)

  assertWUCalled(entity, 2, 2, true)
  assertOneEntity()
})

describe("deleteEntityOrCreateSettingsRemnant", () => {
  test("deletes normal entity", () => {
    const { entity } = addEntity(1)

    assemblyUpdater.deleteEntityOrCreateSettingsRemnant(assembly, entity)
    assertNoEntities()
    assertDeleteAllEntitiesCalled(entity)
  })

  test("creates settings remnant if entity has stage diffs", () => {
    const { entity } = addEntity(1)
    entity._applyDiffAtStage(2, { override_stack_size: 2 })

    assemblyUpdater.deleteEntityOrCreateSettingsRemnant(assembly, entity)

    assert.true(entity.isSettingsRemnant)
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

    assemblyUpdater.deleteEntityOrCreateSettingsRemnant(assembly, entity)
    assert.true(entity.isSettingsRemnant)
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

    assemblyUpdater.deleteEntityOrCreateSettingsRemnant(assembly, entity)
    assert.nil(entity.isSettingsRemnant)
    assertOneEntity()
    assertDeleteAllEntitiesCalled(entity)
  })
})

test("forceDeleteEntity always deletes", () => {
  const { entity } = addEntity(1)
  entity.isSettingsRemnant = true

  assemblyUpdater.forceDeleteEntity(assembly, entity)

  assertNoEntities()
  assertDeleteAllEntitiesCalled(entity)
})

test("clearEntityAtStage", () => {
  assert.equal(assemblyUpdater.clearEntityAtStage, worldUpdater.clearWorldEntity)

  entitiesAsserted = true
  worldUpdaterAsserted = true
})

describe("revive integration test", () => {
  test.each([1, 2, 3, 4, 5, 6])("settings remnant 1->3->5, revive at stage %d", (reviveStage) => {
    const { entity } = addEntity(1)
    entity._applyDiffAtStage(3, { override_stack_size: 2 })
    entity._applyDiffAtStage(5, { override_stack_size: 3 })
    entity.isSettingsRemnant = true

    assemblyUpdater.reviveSettingsRemnant(assembly, reviveStage, entity)
    assert.falsy(entity.isSettingsRemnant)
    assert.equal(entity.firstStage, reviveStage)

    if (reviveStage >= 5) {
      assert.equal(3, entity.firstValue.override_stack_size)
      assert.false(entity.hasStageDiff())
    } else if (reviveStage >= 3) {
      assert.equal(2, entity.firstValue.override_stack_size)
      assertStageDiffs(entity, { 5: { override_stack_size: 3 } })
    } else {
      assert.equal(1, entity.firstValue.override_stack_size)
      assertStageDiffs(entity, { 3: { override_stack_size: 2 }, 5: { override_stack_size: 3 } })
    }

    assertOneEntity()
    assertReviveSettingsRemnantCalled(entity)
  })

  test("settings remnant 2->3, revive at stage 1", () => {
    const { entity } = addEntity(1)
    entity._applyDiffAtStage(3, { override_stack_size: 3 })
    entity.isSettingsRemnant = true

    assemblyUpdater.reviveSettingsRemnant(assembly, 1, entity)
    assert.falsy(entity.isSettingsRemnant)
    assert.equal(entity.firstStage, 1)

    assert.equal(1, entity.firstValue.override_stack_size)
    assertStageDiffs(entity, { 3: { override_stack_size: 3 } })

    assertOneEntity()
    assertReviveSettingsRemnantCalled(entity)
  })
})

describe("tryUpdateEntityFromWorld", () => {
  test('with no changes returns "no-change"', () => {
    const { entity } = addEntity(2)
    const ret = assemblyUpdater.tryUpdateEntityFromWorld(assembly, 2, entity)
    assert.equal("no-change", ret)
    assertOneEntity()
    assertWUNotCalled()
  })

  test('with change in first stage returns "updated" and updates all entities', () => {
    const { entity, luaEntity } = addEntity(2)
    luaEntity.inserter_stack_size_override = 3
    const ret = assemblyUpdater.tryUpdateEntityFromWorld(assembly, 2, entity)
    assert.equal("updated", ret)

    assert.equal(3, entity.firstValue.override_stack_size)

    assertOneEntity()
    assertWUCalled(entity, 2, nil, false)
  })

  test("can detect rotate by pasting", () => {
    const { luaEntity, entity } = addEntity(2, {
      name: "assembling-machine-2",
      recipe: "express-transport-belt",
    })
    luaEntity.direction = defines.direction.east
    const ret = assemblyUpdater.tryUpdateEntityFromWorld(assembly, 2, entity)
    assert.equal("updated", ret)

    assert.equal(defines.direction.east, entity.getDirection())
    assertOneEntity()
    assertWUCalled(entity, 2, nil, false)
  })

  test("forbids rotate if in higher stage than first", () => {
    const { luaEntity, entity } = addEntity(2)
    luaEntity.direction = defines.direction.east

    entity.replaceWorldEntity(3, luaEntity)
    const ret = assemblyUpdater.tryUpdateEntityFromWorld(assembly, 3, entity)
    assert.equal("cannot-rotate", ret)
    assert.equal(defines.direction.north, entity.getDirection())

    assertOneEntity()
    assertWUCalled(entity, 3, 3, false)
  })

  test.each([false, true])("integration: in higher stage, with changes: %s", (withExistingChanges) => {
    const { luaEntity, entity } = addEntity(1)
    if (withExistingChanges) {
      entity._applyDiffAtStage(2, { override_stack_size: 2, filter_mode: "blacklist" })
      luaEntity.inserter_filter_mode = "blacklist"
    }

    luaEntity.inserter_stack_size_override = 3
    entity.replaceWorldEntity(2, luaEntity)
    const ret = assemblyUpdater.tryUpdateEntityFromWorld(assembly, 2, entity)
    assert.equal("updated", ret)

    assert.equal(1, entity.firstValue.override_stack_size)
    if (withExistingChanges) {
      assertStageDiffs(entity, { 2: { override_stack_size: 3, filter_mode: "blacklist" } })
    } else {
      assertStageDiffs(entity, { 2: { override_stack_size: 3 } })
    }

    assertOneEntity()
    assertWUCalled(entity, 2, nil, false)
  })

  test("integration: updating to match removes stage diff", () => {
    const { luaEntity, entity } = addEntity(1)
    entity._applyDiffAtStage(2, { override_stack_size: 2 })
    assert.true(entity.hasStageDiff())
    luaEntity.inserter_stack_size_override = 1

    entity.replaceWorldEntity(2, luaEntity)
    const ret = assemblyUpdater.tryUpdateEntityFromWorld(assembly, 2, entity)
    assert.equal("updated", ret)
    assert.false(entity.hasStageDiff())

    assertOneEntity()
    assertWUCalled(entity, 2, nil, false)
  })
})

describe("tryRotateEntityToMatchWorld", () => {
  test("in first stage rotates all entities", () => {
    const { luaEntity, entity } = addEntity(2)
    luaEntity.direction = direction.west
    const ret = assemblyUpdater.tryUpdateEntityFromWorld(assembly, 2, entity)
    assert.equal("updated", ret)
    assert.equal(direction.west, entity.getDirection())
    assertOneEntity()
    assertWUCalled(entity, 2, nil, false)
  })

  test("in higher stage forbids rotation", () => {
    const { luaEntity, entity } = addEntity(1)
    const oldDirection = luaEntity.direction
    luaEntity.direction = direction.west
    entity.replaceWorldEntity(2, luaEntity)
    const ret = assemblyUpdater.tryUpdateEntityFromWorld(assembly, 2, entity)
    assert.equal("cannot-rotate", ret)
    assert.equal(oldDirection, entity.getDirection())
    assertOneEntity()
    assertWUCalled(entity, 2, 2, false)
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
    const ret = assemblyUpdater.tryApplyUpgradeTarget(assembly, 1, entity)
    assert.equal("updated", ret)
    assert.equal("stack-filter-inserter", entity.firstValue.name)
    assert.equal(direction, entity.getDirection())
    assertOneEntity()
    assertWUCalled(entity, 1, nil, false)
  })
  test("can apply rotation", () => {
    const { luaEntity, entity } = addEntity(1)
    luaEntity.order_upgrade({
      force: luaEntity.force,
      target: luaEntity.name,
      direction: direction.west,
    })

    const ret = assemblyUpdater.tryApplyUpgradeTarget(assembly, 1, entity)
    assert.equal("updated", ret)
    assert.equal("filter-inserter", entity.firstValue.name)
    assert.equal(direction.west, entity.getDirection())
    assertOneEntity()
    assertWUCalled(entity, 1, nil, false)
  })
  test("upgrade to rotate forbidden", () => {
    const { luaEntity, entity } = addEntity(1)
    luaEntity.order_upgrade({
      force: luaEntity.force,
      target: luaEntity.name,
      direction: direction.west,
    })
    entity.replaceWorldEntity(2, luaEntity)
    const ret = assemblyUpdater.tryApplyUpgradeTarget(assembly, 2, entity)
    assert.equal("cannot-rotate", ret)
    assert.equal(0, entity.getDirection())
    assertOneEntity()
    assertWUCalled(entity, 2, 2, false)
  })
})

describe("updateWiresFromWorld", () => {
  test("if saved, calls update", () => {
    const { entity } = addEntity(1)
    wireSaver.saveWireConnections.on_call_with(match._, entity, 1).returns(true)
    const ret = assemblyUpdater.updateWiresFromWorld(assembly, 1, entity)
    assert.equal("updated", ret)

    assertOneEntity()
    assertWUCalled(entity, 1, nil, false)
  })
  test("if no changes, does not call update", () => {
    const { entity } = addEntity(1)
    wireSaver.saveWireConnections.returns(false)
    const ret = assemblyUpdater.updateWiresFromWorld(assembly, 1, entity)
    assert.equal("no-change", ret)

    assertOneEntity()
    assertWUNotCalled()
  })
  test("if max connections exceeded, notifies and calls update", () => {
    const { entity } = addEntity(1)
    wireSaver.saveWireConnections.on_call_with(match._, entity, 1).returns(true, true)
    const ret = assemblyUpdater.updateWiresFromWorld(assembly, 1, entity)
    assert.equal("max-connections-exceeded", ret)

    assertOneEntity()
    assertWUCalled(entity, 1, nil, false)
  })
})

describe("moveEntityToStage", () => {
  test("can move up", () => {
    const { entity } = addEntity(1)
    const result = assemblyUpdater.moveEntityToStage(assembly, 2, entity)
    assert.equal("updated", result)
    assert.equal(2, entity.firstStage)
    assertOneEntity()
    assertWUCalled(entity, 1, nil, false)
  })

  test("can move down to preview", () => {
    const { entity } = addEntity(4)
    assemblyUpdater.moveEntityToStage(assembly, 3, entity)
    assert.equal(3, entity.firstStage)
    assertOneEntity()
    assertWUCalled(entity, 3, nil, false)
  })

  test("can revive settings remnant", () => {
    const { entity } = addEntity(1)
    entity.isSettingsRemnant = true
    assemblyUpdater.moveEntityToStage(assembly, 2, entity)
    assert.equal(2, entity.firstStage)
    assertOneEntity()
    assertReviveSettingsRemnantCalled(entity)
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
    const entity = assemblyUpdater.addNewEntity<BlueprintEntity>(assembly, 2, luaEntity2)!
    assert.not_nil(entity)

    assert.equal("output", entity.firstValue.type)
    assertNEntities(2)
    assertWUCalled(entity, 1, nil, false)
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

      const ret = assemblyUpdater.tryRotateEntityToMatchWorld(assembly, 1, entity)
      assert.equal("updated", ret)

      assert.equal("output", entity.firstValue.type)
      assert.equal(direction.west, entity.getDirection())

      assertOneEntity()
      assertWUCalled(entity, 1, nil, false)
    })

    test("lone underground belt in higher stage forbids rotation", () => {
      const { luaEntity, entity } = createUndergroundBelt(1)

      const [rotated] = luaEntity.rotate()
      assert(rotated)

      entity.replaceWorldEntity(2, luaEntity)
      const ret = assemblyUpdater.tryRotateEntityToMatchWorld(assembly, 2, entity)
      assert.equal("cannot-rotate", ret)

      assert.equal("input", entity.firstValue.type)
      assert.equal(direction.west, entity.getDirection())

      assertOneEntity()
      assertWUCalled(entity, 2, 2, false)
    })

    test.each(["lower", "higher"])("%s underground in first stage rotates pair", (which) => {
      const { entity1, entity2 } = createUndergroundBeltPair(1, 2)

      const entity = which === "lower" ? entity1 : entity2
      const [rotated] = entity.getWorldEntity(entity.firstStage)!.rotate()
      assert(rotated)

      const ret = assemblyUpdater.tryRotateEntityToMatchWorld(assembly, entity.firstStage, entity)
      assert.equal("updated", ret)

      assert.equal("output", entity1.firstValue.type)
      assert.equal(direction.west, entity1.getDirection())
      assert.equal("input", entity2.firstValue.type)
      assert.equal(direction.east, entity2.getDirection())

      assertNEntities(2)
      assertWUCalled(entity1, 1, nil, false, which === "lower" ? 0 : 1)
      assertWUCalled(entity2, 2, nil, false, which === "lower" ? 1 : 0)
    })

    test("cannot rotate if not in first stage", () => {
      const { entity1, entity2, luaEntity1 } = createUndergroundBeltPair(2, 1)

      const [rotated1] = luaEntity1.rotate()
      assert(rotated1)

      entity1.replaceWorldEntity(3, luaEntity1)
      const ret = assemblyUpdater.tryRotateEntityToMatchWorld(assembly, 3, entity1)
      assert.equal("cannot-rotate", ret)

      assert.equal("input", entity1.firstValue.type)
      assert.equal(direction.west, entity1.getDirection())
      assert.equal("output", entity2.firstValue.type)
      assert.equal(direction.east, entity2.getDirection())

      assertNEntities(2)
      assertWUCalled(entity1, 3, 3, false)
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
        assert.true(hasMultiple)

        const ret = assemblyUpdater.tryRotateEntityToMatchWorld(assembly, 1, entity)
        assert.equal("cannot-flip-multi-pair-underground", ret)

        assert.equal("input", entity1.firstValue.type)
        assert.equal(direction.west, entity1.getDirection())
        assert.equal("output", entity2.firstValue.type)
        assert.equal(direction.east, entity2.getDirection())
        assert.equal("input", entity3.firstValue.type)
        assert.equal(direction.west, entity3.getDirection())

        assertNEntities(3)
        assertWUCalled(entity, 1, 1, false, 0)
        worldUpdater.updateAllWorldEntities.clear()

        const [rotatedBack] = luaEntity.rotate()
        assert.true(rotatedBack, "rotated back")
      }
    })
  })

  describe("upgrading", () => {
    before_each(() => {
      mock(WorldListener, true)
    })
    after_each(() => {
      mock.revert(WorldListener)
    })

    test("can upgrade underground in first stage", () => {
      const { luaEntity, entity } = createUndergroundBelt(1)
      luaEntity.order_upgrade({
        target: "fast-underground-belt",
        force: luaEntity.force,
      })
      const ret = assemblyUpdater.tryApplyUpgradeTarget(assembly, 1, entity)
      assert.equal("updated", ret)

      assert.equal("fast-underground-belt", entity.firstValue.name)
      assert.equal("input", entity.firstValue.type)
      assert.equal(direction.west, entity.getDirection())
      assertOneEntity()
      assertWUCalled(entity, 1, nil, false)
    })

    test("can upgrade underground in higher stage", () => {
      const { luaEntity, entity } = createUndergroundBelt(1)
      luaEntity.order_upgrade({
        target: "fast-underground-belt",
        force: luaEntity.force,
      })
      entity.replaceWorldEntity(2, luaEntity)
      const ret = assemblyUpdater.tryApplyUpgradeTarget(assembly, 2, entity)
      assert.equal("updated", ret)

      assert.equal("fast-underground-belt", entity.getValueAtStage(2)?.name)
      assert.equal("input", entity.firstValue.type)

      assertOneEntity()
      assertWUCalled(entity, 2, nil, false)
    })

    test.each(["lower", "pair in higher", "self in higher"])(
      "upgrading %s underground in first stage upgrades pair",
      (which) => {
        const endStage = which === "lower" ? 1 : 2
        const { entity1, entity2, luaEntity1, luaEntity2 } = createUndergroundBeltPair(1, 2)
        const entity = which === "pair in higher" ? entity2 : entity1
        const luaEntity = which === "pair in higher" ? luaEntity2 : luaEntity1
        luaEntity.order_upgrade({
          target: "fast-underground-belt",
          force: luaEntity.force,
        })
        entity.replaceWorldEntity(endStage, luaEntity)
        const ret = assemblyUpdater.tryApplyUpgradeTarget(assembly, endStage, entity)
        assert.equal("updated", ret)

        assert.equal("fast-underground-belt", entity1.firstValue.name)
        assert.equal("input", entity1.firstValue.type)
        assert.equal(direction.west, entity1.getDirection())
        assert.equal("fast-underground-belt", entity2.firstValue.name)
        assert.equal("output", entity2.firstValue.type)
        assert.equal(direction.east, entity2.getDirection())

        assertNEntities(2)
        assertWUCalled(entity1, 1, nil, false, luaEntity === luaEntity1 ? 0 : 1)
        assertWUCalled(entity2, 2, nil, false, luaEntity === luaEntity1 ? 1 : 0)
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
        const ret = assemblyUpdater.tryApplyUpgradeTarget(assembly, 1, entity)
        assert.equal("cannot-upgrade-multi-pair-underground", ret)

        assert.equal("underground-belt", entity1.firstValue.name)
        assert.equal("underground-belt", entity2.firstValue.name)
        assert.equal("underground-belt", entity3.firstValue.name)

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
      const ret = assemblyUpdater.tryApplyUpgradeTarget(assembly, 3, entity1)
      assert.equal("cannot-create-pair-upgrade", ret)

      assert.equal("underground-belt", entity1.firstValue.name)
      assert.equal("underground-belt", entity2.firstValue.name)

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

      const ret = assemblyUpdater.tryApplyUpgradeTarget(assembly, 1, entity1)
      assert.equal("cannot-upgrade-changed-pair", ret)

      assert.equal("underground-belt", entity1.firstValue.name)
      assert.equal("underground-belt", entity2.firstValue.name)
      assert.equal("fast-underground-belt", entity3.firstValue.name)

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
    assert.not_nil(newEntity)
    entity1.replaceWorldEntity(1, newEntity)

    const ret = assemblyUpdater.tryUpdateEntityFromWorld(assembly, 1, entity1)
    assert.equal("updated", ret)

    assert.equal("fast-underground-belt", entity1.firstValue.name)
    assert.equal("input", entity1.firstValue.type)
    assert.equal(direction.west, entity1.getDirection())

    assert.equal("fast-underground-belt", entity2.firstValue.name)
    assert.equal("output", entity2.firstValue.type)
    assert.equal(direction.east, entity2.getDirection())

    assertNEntities(2)
    assertWUCalled(entity1, 1, nil, false, 0)
    assertWUCalled(entity2, 1, nil, false, 1)
  })

  test("cannot move underground if it would also upgrade", () => {
    const { entity1, entity2 } = createUndergroundBeltPair(1)
    entity1.applyUpgradeAtStage(2, "fast-underground-belt")
    entity2.applyUpgradeAtStage(2, "fast-underground-belt")

    const ret = assemblyUpdater.moveEntityToStage(assembly, 2, entity1)
    assert.equal(<StageMoveResult>"cannot-move-upgraded-underground", ret)

    assert.equal(1, entity1.firstStage)
    assert.equal(1, entity2.firstStage)

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
    const result = assemblyUpdater.addNewEntity(assembly, 1, rollingStock)
    clearMocks()
    return result
  }
  test("can save rolling stock", () => {
    const result = assemblyUpdater.addNewEntity(assembly, 1, rollingStock)
    assert.not_nil(result)
    assert.equal("locomotive", result!.firstValue.name)

    assertNEntities(1)

    const found = assembly.content.findCompatibleAnyDirection(rollingStock.name, rollingStock.position)!
    assert.not_nil(found, "found any direction")
    assert.equal(result, found)

    const foundDirectly = assembly.content.findCompatible(rollingStock, nil)
    assert.not_nil(foundDirectly, "found directly")
    assert.equal(found, foundDirectly, "found same entity")

    assertWUCalled(found, 1, nil, false)
  })

  test("no update on rolling stock", () => {
    const entity = addEntity()!

    assemblyUpdater.tryUpdateEntityFromWorld(assembly, 1, entity)

    assertNEntities(1)
    assertWUNotCalled()
  })
})

test("resetStage", () => {
  const entity1 = createAssemblyEntity({ name: "test" }, Pos(0, 0), nil, 1)
  const entity2 = createAssemblyEntity({ name: "test2" }, Pos(0, 0), nil, 2)
  assembly.content.add(entity1)
  assembly.content.add(entity2)

  const stage = assembly.getStage(2)!
  assemblyUpdater.resetStage(assembly, 2)

  assert.spy(worldUpdater.clearStage).called_with(match.ref(stage))

  assertWUCalled(entity1, 2, 2, false, 0)
  assertWUCalled(entity2, 2, 2, false, 1)
  assertNEntities(2)
})

describe("trains", () => {
  let entities: LuaEntity[]
  let assemblyEntities: RollingStockAssemblyEntity[]
  before_each(() => {
    game.surfaces[1].find_entities().forEach((e) => e.destroy())
    entities = createRollingStocks("locomotive", "cargo-wagon", "fluid-wagon")
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
    assemblyUpdater.resetTrain(assembly, anEntity)

    assertWUCalled(assemblyEntities[2], 1, 1, true, 0)
    assertWUCalled(assemblyEntities[1], 1, 1, true, 1)
    assertWUCalled(assemblyEntities[0], 1, 1, true, 2)
    assertNEntities(3)
  })
  test("setTrainLocationToCurrent", () => {
    entities[0].train!.speed = 10
    after_ticks(10, () => {
      const anEntity = assemblyEntities[1]
      assemblyUpdater.setTrainLocationToCurrent(assembly, anEntity)

      for (let i = 0; i < 3; i++) {
        assert.same(entities[i].position, assemblyEntities[i].position)
      }
      assertWUCalled(assemblyEntities[2], 1, 1, false, 0)
      assertWUCalled(assemblyEntities[1], 1, 1, false, 1)
      assertWUCalled(assemblyEntities[0], 1, 1, false, 2)
      assertNEntities(3)
    })
  })
})
