/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of BBPP3.
 *
 * BBPP3 is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * BBPP3 is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with BBPP3. If not, see <https://www.gnu.org/licenses/>.
 */

import { LayerNumber, MutableAssemblyEntity } from "../entity/AssemblyEntity"
import { createMockEntitySaver } from "../entity/EntityHandler-mock"
import { AnyFunction, ContextualFun, Mutable } from "../lib"
import { BBox, Pos } from "../lib/geometry"
import { map2dSize } from "../lib/map2d"
import { entityMock } from "../test-util/simple-mock"
import { AssemblyContent, LayerPosition } from "./Assembly"
import { AssemblyUpdater, createAssemblyUpdater } from "./AssemblyUpdater"
import { MutableEntityMap, newEntityMap } from "./EntityMap"
import { WorldUpdater } from "./WorldUpdater"
import direction = defines.direction

const pos = Pos(10.5, 10.5)

let layer: Mutable<LayerPosition>
let content: MutableEntityMap
let assembly: AssemblyContent

let assemblyUpdater: AssemblyUpdater
let worldUpdater: WorldUpdater
let totalCalls: number

before_each(() => {
  layer = { surface: nil!, ...BBox.coords(0, 0, 32, 32), layerNumber: 1 }
  content = newEntityMap()
  assembly = { content, layers: [] }
  totalCalls = 0
  function spyFn<F extends ContextualFun>(): F {
    return stub<F>().invokes((() => {
      totalCalls++
    }) as F)
  }
  worldUpdater = {
    createLaterEntities: spyFn(),
    refreshEntity: spyFn(),
    deleteAllEntities: spyFn(),
    reviveEntities: spyFn(),
    forbidDeletion: spyFn(),
    updateEntities: spyFn(),
    rotateEntities: spyFn(),
    forbidRotation: spyFn(),
  }
  assemblyUpdater = createAssemblyUpdater(worldUpdater, createMockEntitySaver())
})

interface TestEntity {
  readonly name: "test"
  prop1?: number
  prop2?: string
}

let eventsAsserted = false
let entitiesAsserted = false
before_each(() => {
  eventsAsserted = false
  entitiesAsserted = false
})
after_each(() => {
  assert(eventsAsserted, "events not asserted")
  assert(entitiesAsserted, "entities not asserted")
})

function assertNoCalls() {
  // assert.equal(0, totalCalls)
  if (totalCalls !== 0) {
    for (const [key, spy] of pairs(worldUpdater)) {
      assert
        .message(`${key} called`)
        .spy(spy as any)
        .not_called()
    }
  }
  eventsAsserted = true
}

type RemoveParameters<F extends AnyFunction> = F extends (_: any, ...args: infer A) => any ? A : never

function assertSingleCall<K extends keyof WorldUpdater>(key: K, ...args: RemoveParameters<WorldUpdater[K]>) {
  assert.equal(1, totalCalls)
  assert.spy(worldUpdater[key] as any).called_with(match.not_nil(), ...args)
  eventsAsserted = true
}

function assertOneEntity() {
  assert.equal(1, map2dSize(content.entities))
  entitiesAsserted = true
}

function assertNoEntities() {
  assert.same({}, content.entities)
  entitiesAsserted = true
}

let luaEntity: LuaEntity & TestEntity

function createEntity(): LuaEntity & TestEntity {
  luaEntity = entityMock<LuaEntity & TestEntity>({
    name: "test",
    position: pos,
    prop1: 2,
    prop2: "val1",
  })
  return luaEntity
}

function doAdd() {
  const entity = createEntity()
  const added = assemblyUpdater.onEntityCreated(assembly, entity, layer) as MutableAssemblyEntity<TestEntity>
  return { luaEntity: entity, added }
}

function doVirtualAdd(addedNum: LayerNumber = layer.layerNumber, setNum = layer.layerNumber) {
  layer.layerNumber = addedNum
  const ret = doAdd()
  layer.layerNumber = setNum
  mock.clear(worldUpdater)
  totalCalls = 0
  return ret
}

function assertAdded(): MutableAssemblyEntity {
  const found = content.findCompatible({ name: "test" }, pos, nil)!
  assert.not_nil(found)
  assert.equal("test", found.baseEntity.name)
  assert.same(pos, found.position)
  assert.nil(found.direction)

  assertOneEntity()
  assertSingleCall("createLaterEntities", found, nil)
  return found
}

test("add", () => {
  const { added } = doAdd()
  const found = assertAdded()
  assert.equal(added, found)
})

test.each([1, 2], "existing at layer 1, added at layer %d", (layerNumber) => {
  const { luaEntity, added } = doVirtualAdd(1, layerNumber)
  const added2 = assemblyUpdater.onEntityCreated(assembly, luaEntity, layer) // again

  assert.equal(added, added2)

  assertOneEntity()
  assertSingleCall("refreshEntity", added, layerNumber, luaEntity)
})

test.each([false, true], "existing at layer 2, added at layer 1, with layer changes: %s", (withChanges) => {
  const { luaEntity, added: oldAdded } = doVirtualAdd(2, 1)

  if (withChanges) {
    luaEntity.prop1 = 3
  }
  const added = assemblyUpdater.onEntityCreated<TestEntity>(assembly, luaEntity, layer)! // again
  assert.equal(oldAdded, added)

  assert.same(1, added.layerNumber)
  if (!withChanges) {
    assert.equal(2, added.baseEntity.prop1)
    assert.nil(added.layerChanges)
  } else {
    assert.equal(3, added.baseEntity.prop1)
    assert.same({ 2: { prop1: 2 } }, added.layerChanges)
  }

  assertOneEntity()
  // assertSingleEvent({ type: "createLaterEntities", entity: added, layer: 2 })
  assertSingleCall("createLaterEntities", added, 2)
})

test("delete non-existent", () => {
  const entity = createEntity()
  assemblyUpdater.onEntityDeleted(assembly, entity, layer)
  assertNoEntities()
  assertNoCalls()
})

test("delete existing at higher layer (bug)", () => {
  const { luaEntity } = doVirtualAdd(2, 1)
  assemblyUpdater.onEntityDeleted(assembly, luaEntity, layer)
  assertOneEntity()
  assertNoCalls()
})

test("delete existing at lower layer", () => {
  const { luaEntity, added } = doVirtualAdd(1, 2)
  assemblyUpdater.onEntityDeleted(assembly, luaEntity, layer)
  assertOneEntity()
  // assertSingleEvent({ type: "forbidDeletion", entity: added, layer: layer.layerNumber })
  assertSingleCall("forbidDeletion", added, layer.layerNumber)
})

test("delete existing at same layer", () => {
  const { luaEntity, added } = doVirtualAdd()
  assemblyUpdater.onEntityDeleted(assembly, luaEntity, layer) // simulated
  assertNoEntities()
  // assertSingleEvent({ type: "deleteAllEntities", entity: added })
  assertSingleCall("deleteAllEntities", added)
})

test("delete entity with updates", () => {
  const { luaEntity, added } = doVirtualAdd()
  added.layerChanges = { 2: { prop1: 3 } }
  assemblyUpdater.onEntityDeleted(assembly, luaEntity, layer)
  assertOneEntity()
  assert.true(added.isLostReference)
  // assertSingleEvent({ type: "deleteAllEntities", entity: added })
  assertSingleCall("deleteAllEntities", added)
})

test.each([1, 2, 3, 4, 5, 6], "lost reference 1->3->5, revive at layer %d", (reviveLayer) => {
  const { luaEntity, added } = doVirtualAdd(1, reviveLayer)
  added.layerChanges = { 3: { prop1: 3 }, 5: { prop1: 4 } }
  added.isLostReference = true

  const revived = assemblyUpdater.onEntityCreated<TestEntity>(assembly, luaEntity, layer)!
  assert.falsy(revived.isLostReference)
  assert.equal(revived.layerNumber, reviveLayer)

  if (reviveLayer >= 5) {
    assert.nil(revived.layerChanges)
    assert.equal(4, revived.baseEntity.prop1)
  } else if (reviveLayer >= 3) {
    assert.same({ 5: { prop1: 4 } }, revived.layerChanges)
    assert.equal(3, revived.baseEntity.prop1)
  } else {
    assert.same({ 3: { prop1: 3 }, 5: { prop1: 4 } }, revived.layerChanges)
    assert.equal(2, revived.baseEntity.prop1)
  }

  assertOneEntity()
  // assertSingleEvent({ type: "reviveEntities", entity: revived, layer: luaEntity as any })
  assertSingleCall("reviveEntities", revived, luaEntity as any)
})

test.each([false, true], "lost reference 2->3, revive at layer 1, with changes: %s", (withChanges) => {
  const { luaEntity, added } = doVirtualAdd(2, 1)
  added.layerChanges = { 3: { prop1: 3 } }
  added.isLostReference = true

  if (withChanges) luaEntity.prop1 = 1

  const revived = assemblyUpdater.onEntityCreated<TestEntity>(assembly, luaEntity, layer)!
  assert.falsy(revived.isLostReference)
  assert.equal(revived.layerNumber, 1)

  if (!withChanges) {
    assert.equal(2, revived.baseEntity.prop1)
    assert.same({ 3: { prop1: 3 } }, revived.layerChanges)
  } else {
    assert.equal(1, revived.baseEntity.prop1)
    assert.same({ 2: { prop1: 2 }, 3: { prop1: 3 } }, revived.layerChanges)
  }

  assertOneEntity()
  // assertSingleEvent({ type: "reviveEntities", entity: revived, layer: luaEntity as any })
  assertSingleCall("reviveEntities", revived, luaEntity as any)
})

test("update non-existent", () => {
  const entity = createEntity()
  assemblyUpdater.onEntityPotentiallyUpdated(assembly, entity, layer)
  // same as add
  assertAdded()
})

test("update with no changes", () => {
  const { luaEntity } = doVirtualAdd()
  assemblyUpdater.onEntityPotentiallyUpdated(assembly, luaEntity, layer)
  assertOneEntity()
  assertNoCalls()
})

test("update in previous layer", () => {
  const { luaEntity, added } = doVirtualAdd(2, 1)
  assemblyUpdater.onEntityPotentiallyUpdated(assembly, luaEntity, layer)
  // same as addBelow
  assertOneEntity()
  // assertSingleEvent({ type: "createLaterEntities", entity: added, layer: 2 })
  assertSingleCall("createLaterEntities", added, 2)
})

test("update in same layer", () => {
  const { luaEntity, added } = doVirtualAdd()
  luaEntity.prop1 = 3
  assemblyUpdater.onEntityPotentiallyUpdated(assembly, luaEntity, layer)
  assert.equal(3, added.baseEntity.prop1)

  assertOneEntity()
  // assertSingleEvent({ type: "updateEntities", entity: added, layer: layer.layerNumber })
  assertSingleCall("updateEntities", added, layer.layerNumber)
})

test.each([false, true], "update in next layer, with existing changes: %s", (withExistingChanges) => {
  const { luaEntity, added } = doVirtualAdd(1, 2)
  if (withExistingChanges) {
    added.layerChanges = { 2: { prop1: 5, prop2: "val2" } }
    luaEntity.prop2 = "val2" // not changed
  }

  luaEntity.prop1 = 3 // changed
  assemblyUpdater.onEntityPotentiallyUpdated(assembly, luaEntity, layer)
  assert.equal(2, added.baseEntity.prop1)
  if (withExistingChanges) {
    assert.same({ 2: { prop1: 3, prop2: "val2" } }, added.layerChanges)
  } else {
    assert.same({ 2: { prop1: 3 } }, added.layerChanges)
  }

  assertOneEntity()
  // assertSingleEvent({ type: "updateEntities", entity: added, layer: layer.layerNumber })
  assertSingleCall("updateEntities", added, layer.layerNumber)
})

test("rotate in base layer", () => {
  const { luaEntity, added } = doVirtualAdd()
  const oldDirection = luaEntity.direction
  luaEntity.direction = direction.west
  assemblyUpdater.onEntityRotated(assembly, luaEntity, layer, oldDirection)
  assert.equal(direction.west, added.direction)
  assertOneEntity()
  // assertSingleEvent({ type: "rotateEntities", entity: added })
  assertSingleCall("rotateEntities", added)
})

test("rotate in higher layer", () => {
  const { luaEntity, added } = doVirtualAdd(1, 2)
  const oldDirection = luaEntity.direction
  luaEntity.direction = direction.west
  assemblyUpdater.onEntityRotated(assembly, luaEntity, layer, oldDirection)
  assert.equal(oldDirection, added.direction ?? 0)
  assertOneEntity()
  // assertSingleEvent({ type: "forbidRotation", entity: added, layer: layer.layerNumber })
  assertSingleCall("forbidRotation", added, layer.layerNumber)
})
