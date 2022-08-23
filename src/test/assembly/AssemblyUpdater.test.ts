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

import { createMockAssemblyContent } from "../../assembly/Assembly-mock"
import { AssemblyContent, LayerPosition } from "../../assembly/AssemblyContent"
import { AssemblyUpdater, createAssemblyUpdater, WorldNotifier } from "../../assembly/AssemblyUpdater"
import { WireSaver } from "../../assembly/WireHandler"
import { WorldUpdater } from "../../assembly/WorldUpdater"
import { Prototypes } from "../../constants"
import { AssemblyEntity, LayerChanges, LayerNumber } from "../../entity/AssemblyEntity"
import { AssemblyWireConnection, wireConnectionEquals } from "../../entity/AssemblyWireConnection"
import { Entity } from "../../entity/Entity"
import { _overrideEntityCategory } from "../../entity/entity-info"
import { createMockEntitySaver } from "../../entity/EntityHandler-mock"
import { ContextualFun, Mutable } from "../../lib"
import { Pos } from "../../lib/geometry"
import { L_Interaction } from "../../locale"
import { entityMock, simpleMock } from "../simple-mock"
import direction = defines.direction
import wire_type = defines.wire_type

const pos = Pos(10.5, 10.5)

let assembly: AssemblyContent
let layer: Mutable<LayerPosition>

let assemblyUpdater: AssemblyUpdater
let worldUpdater: mock.Stubbed<WorldUpdater>
let wireSaver: mock.Stubbed<WireSaver>
let worldNotifier: mock.Mocked<WorldNotifier>
before_all(() => {
  _overrideEntityCategory("test", "test")
  _overrideEntityCategory("test2", "test")
})

let totalCalls: number
before_each(() => {
  assembly = createMockAssemblyContent(1)
  layer = assembly.getLayer(1)!
  totalCalls = 0
  function spyFn<F extends ContextualFun>(): F {
    return stub<F>().invokes((() => {
      totalCalls++
    }) as F)
  }
  worldUpdater = {
    updateWorldEntities: spyFn(),
    deleteWorldEntities: spyFn(),
    deleteWorldEntitiesInLayer: spyFn(),
    deleteExtraEntitiesOnly: spyFn(),
    makeSettingsRemnant: spyFn(),
    reviveSettingsRemnant: spyFn(),
  }
  wireSaver = {
    getWireConnectionDiff: stub<WireSaver["getWireConnectionDiff"]>().invokes(() => $multi([], [])),
  }
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

function addEntity(args?: Partial<LuaEntity>) {
  const entity = createEntity(args)
  assemblyUpdater.onEntityCreated(assembly, entity, layer)
  const found = assembly.content.findCompatible(entity.name, entity.position, nil) as AssemblyEntity<TestEntity> | nil
  assert(found)
  return { luaEntity: entity, added: found! }
}

function addAndReset(addedNum: LayerNumber = layer.layerNumber, setNum = layer.layerNumber, args?: Partial<LuaEntity>) {
  layer.layerNumber = addedNum
  const ret = addEntity(args)
  layer.layerNumber = setNum
  mock.clear(worldUpdater)
  totalCalls = 0
  return ret
}

let eventsAsserted = false
let entitiesAsserted = false
let notificationsAsserted = false
before_each(() => {
  eventsAsserted = false
  entitiesAsserted = false
  notificationsAsserted = false
})
after_each(() => {
  assert(eventsAsserted, "events not asserted")
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
  eventsAsserted = true
}

function assertUpdateCalled(
  entity: AssemblyEntity<TestEntity>,
  startLayer: LayerNumber,
  endLayer: LayerNumber | nil,
  replace: boolean,
) {
  eventsAsserted = true
  assert.equal(1, totalCalls, "called once")
  const spy = worldUpdater.updateWorldEntities as spy.Spy<WorldUpdater["updateWorldEntities"]>
  assert.spy(spy).called(1)
  const refs = spy.calls[0].refs as any[]
  const [cAssembly, cEntity, cStartLayer, cEndLayer, cReplace] = table.unpack(refs, 1, 5)
  assert.equal(assembly, cAssembly)
  assert.equal(entity, cEntity)
  assert.equal(startLayer, cStartLayer, "start layer")
  assert.equal(endLayer, cEndLayer, "end layer")
  if (replace) assert.true(cReplace, "replace")
  else assert.falsy(cReplace, "replace")
}
function assertDeleteAllEntitiesCalled(entity: AssemblyEntity<TestEntity>) {
  eventsAsserted = true
  assert.equal(1, totalCalls)
  assert.spy(worldUpdater.deleteWorldEntities).called_with(match.ref(entity))
}
function assertMakeSettingsRemnantCalled(entity: AssemblyEntity<TestEntity>) {
  eventsAsserted = true
  assert.equal(1, totalCalls)
  assert.spy(worldUpdater.makeSettingsRemnant).called_with(assembly, entity)
}
function assertReviveSettingsRemnantCalled(entity: AssemblyEntity<TestEntity>) {
  eventsAsserted = true
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

function assertNotified(entity: LuaEntity, message: LocalisedString) {
  assert.false(notificationsAsserted, "notifications already asserted")
  assert.spy(worldNotifier.createNotification).called(1)
  assert.spy(worldNotifier.createNotification).called_with(match.ref(entity), message)
  notificationsAsserted = true
}

function assertLayerChanges(entity: AssemblyEntity, changes: LayerChanges<TestEntity>) {
  assert.same(changes, entity._getLayerChanges())
}

function assertAdded(added: AssemblyEntity<TestEntity>, luaEntity: LuaEntity): void {
  assert.not_nil(added)
  assert.equal("test", added.getBaseValue().name)
  assert.same(pos, added.position)
  assert.nil(added.direction)

  assert.equal(luaEntity, added.getWorldEntity(layer.layerNumber))

  assertOneEntity()
  assertUpdateCalled(added, 1, nil, false)
}

describe("add", () => {
  test("updates all layers", () => {
    const { added, luaEntity } = addEntity()
    assertAdded(added, luaEntity)
  })

  test.each([1, 2], "at same or higher layer updates the newly added entity, added layer: %d", (layerNumber) => {
    const { luaEntity, added } = addAndReset(1, layerNumber)
    assemblyUpdater.onEntityCreated(assembly, luaEntity, layer)
    assertOneEntity()
    assertUpdateCalled(added, layerNumber, layerNumber, false)
  })

  test.each([false, true])("add at lower layer does all behaviors, with layer changes: %s", (withChanges) => {
    const { added } = addAndReset(3, 1)
    const newEntity = createEntity()
    if (withChanges) newEntity.prop1 = 3
    assemblyUpdater.onEntityCreated(assembly, newEntity, layer) // again
    // updates entity
    assert.equal(newEntity, added.getWorldEntity(1))
    assert.same(1, added.getBaseLayer())
    // does not create layer changes
    assert.equal(2, added.getBaseValue().prop1)
    assert.false(added.hasLayerChange())
    // calls updateWorldEntities
    assertOneEntity()
    assertUpdateCalled(added, 1, 3, true)
    // records old layer
    assert.equal(3, added.getOldLayer())
    // creates notification
    assertNotified(newEntity, [L_Interaction.EntityMovedFromLayer, "mock layer 3"])
  })
})

describe("delete", () => {
  test("not in assembly does nothing", () => {
    const entity = createEntity()
    assemblyUpdater.onEntityDeleted(assembly, entity, layer)
    assertNoEntities()
    assertNoCalls()
  })

  test("in layer below base does nothing (bug)", () => {
    const { luaEntity } = addAndReset(2, 1)
    assemblyUpdater.onEntityDeleted(assembly, luaEntity, layer)
    assertOneEntity()
    assertNoCalls()
  })

  test("in layer above base forbids deletion", () => {
    const { luaEntity, added } = addAndReset(1, 2)
    assemblyUpdater.onEntityDeleted(assembly, luaEntity, layer)
    assertOneEntity()
    assertUpdateCalled(added, 2, 2, true)
  })

  test("in base layer deletes entity", () => {
    const { luaEntity, added } = addAndReset()
    assemblyUpdater.onEntityDeleted(assembly, luaEntity, layer)
    assert.falsy(added.isSettingsRemnant)
    assertNoEntities()
    assertDeleteAllEntitiesCalled(added)
  })

  test("in base layer with oldLayer moves back to old layer", () => {
    const { luaEntity, added } = addAndReset(3, 2)
    added.moveToLayer(2, true)
    assemblyUpdater.onEntityDeleted(assembly, luaEntity, layer)
    assert.falsy(added.isSettingsRemnant)
    assertOneEntity()
    assertUpdateCalled(added, 2, 3, false)
    assert.nil(added.getOldLayer())
    assertNotified(luaEntity, [L_Interaction.EntityMovedBackToLayer, "mock layer 3"])
  })

  test("in base layer with updates creates settings remnant", () => {
    const { luaEntity, added } = addAndReset()
    added._applyDiffAtLayer(2, { prop1: 3 })
    assemblyUpdater.onEntityDeleted(assembly, luaEntity, layer)
    assertOneEntity()
    assert.true(added.isSettingsRemnant)
    assertMakeSettingsRemnantCalled(added)
  })
})

describe("revive", () => {
  test.each([1, 2, 3, 4, 5, 6], "settings remnant 1->3->5, revive at layer %d", (reviveLayer) => {
    const { luaEntity, added } = addAndReset(1, reviveLayer)
    added._applyDiffAtLayer(3, { prop1: 3 })
    added._applyDiffAtLayer(5, { prop1: 4 })
    added.isSettingsRemnant = true

    assemblyUpdater.onEntityCreated(assembly, luaEntity, layer)
    assert.equal(luaEntity, added.getWorldEntity(reviveLayer))
    assert.falsy(added.isSettingsRemnant)
    assert.equal(added.getBaseLayer(), reviveLayer)

    if (reviveLayer >= 5) {
      assert.equal(4, added.getBaseValue().prop1)
      assert.false(added.hasLayerChange())
    } else if (reviveLayer >= 3) {
      assert.equal(3, added.getBaseValue().prop1)
      assertLayerChanges(added, { 5: { prop1: 4 } })
    } else {
      assert.equal(2, added.getBaseValue().prop1)
      assertLayerChanges(added, { 3: { prop1: 3 }, 5: { prop1: 4 } })
    }

    assertOneEntity()
    assertReviveSettingsRemnantCalled(added)
  })

  test.each([false, true], "settings remnant 2->3, revive at layer 1, with changes: %s", (withChanges) => {
    const { luaEntity, added } = addAndReset(2, 1)
    added._applyDiffAtLayer(3, { prop1: 3 })
    added.isSettingsRemnant = true

    if (withChanges) luaEntity.prop1 = 1

    assemblyUpdater.onEntityCreated(assembly, luaEntity, layer)
    assert.falsy(added.isSettingsRemnant)
    assert.equal(added.getBaseLayer(), 1)

    assert.equal(2, added.getBaseValue().prop1)
    assertLayerChanges(added, { 3: { prop1: 3 } })

    assertOneEntity()
    assertReviveSettingsRemnantCalled(added)
  })
})

describe("update", () => {
  test("non-existent defaults to add behavior (bug)", () => {
    const entity = createEntity()
    assemblyUpdater.onEntityPotentiallyUpdated(assembly, entity, layer)
    const added = assembly.content.findCompatible("test", pos, nil) as AssemblyEntity<TestEntity>
    assertAdded(added, entity)
  })

  test("with no changes does nothing", () => {
    const { luaEntity } = addAndReset()
    assemblyUpdater.onEntityPotentiallyUpdated(assembly, luaEntity, layer)
    assertOneEntity()
    assertNoCalls()
  })

  test("in lower than base layer defaults to add below behavior (bug)", () => {
    const { luaEntity, added } = addAndReset(3, 1)
    assemblyUpdater.onEntityPotentiallyUpdated(assembly, luaEntity, layer)
    assert.equal(luaEntity, added.getWorldEntity(1))
    assertOneEntity()
    assertUpdateCalled(added, 1, 3, true)
    notificationsAsserted = true // skip
  })

  test("in base layer updates all entities", () => {
    const { luaEntity, added } = addAndReset(2, 2)
    luaEntity.prop1 = 3
    assemblyUpdater.onEntityPotentiallyUpdated(assembly, luaEntity, layer)
    assert.equal(3, added.getBaseValue().prop1)

    assertOneEntity()
    assertUpdateCalled(added, 1, nil, false)
  })

  test.each([false, true])(
    "in higher layer updates assembly.content and entities, with existing changes: %s",
    (withExistingChanges) => {
      const { luaEntity, added } = addAndReset(1, 2)
      if (withExistingChanges) {
        added._applyDiffAtLayer(2, { prop1: 5, prop2: "val2" })
        luaEntity.prop2 = "val2" // not changed
      }

      luaEntity.prop1 = 3 // changed
      assemblyUpdater.onEntityPotentiallyUpdated(assembly, luaEntity, layer)
      assert.equal(2, added.getBaseValue().prop1)
      if (withExistingChanges) {
        assertLayerChanges(added, { 2: { prop1: 3, prop2: "val2" } })
      } else {
        assertLayerChanges(added, { 2: { prop1: 3 } })
      }

      assertOneEntity()
      assertUpdateCalled(added, 2, nil, false)
    },
  )

  test("updating match previous layer removes layer changes", () => {
    const { luaEntity, added } = addAndReset(1, 2)
    added._applyDiffAtLayer(2, { prop1: 5 })
    assert.true(added.hasLayerChange())
    luaEntity.prop1 = 2
    assemblyUpdater.onEntityPotentiallyUpdated(assembly, luaEntity, layer)

    assertOneEntity()
    assertUpdateCalled(added, 2, nil, false)
  })
})

describe("rotate", () => {
  test("in base layer rotates all entities", () => {
    const { luaEntity, added } = addAndReset(2, 2)
    const oldDirection = luaEntity.direction
    luaEntity.direction = direction.west
    assemblyUpdater.onEntityPotentiallyUpdated(assembly, luaEntity, layer, oldDirection)
    assert.equal(direction.west, added.direction)
    assertOneEntity()
    assertUpdateCalled(added, 1, nil, false)
  })

  test("in higher layer forbids rotation", () => {
    const { luaEntity, added } = addAndReset(1, 2)
    const oldDirection = luaEntity.direction
    luaEntity.direction = direction.west
    assemblyUpdater.onEntityPotentiallyUpdated(assembly, luaEntity, layer, oldDirection)
    assert.equal(oldDirection, added.direction ?? 0)
    assertOneEntity()
    assertUpdateCalled(added, 2, 2, false)
  })
})

describe("fast replace", () => {
  test("fast replace sets world entity and calls update", () => {
    const { luaEntity, added } = addAndReset()
    const newEntity = createEntity({ name: "test2" })
    luaEntity.destroy()
    assemblyUpdater.onEntityPotentiallyUpdated(assembly, newEntity, layer)
    assert.equal(newEntity, added.getWorldEntity(1))
    assertOneEntity()
    assertUpdateCalled(added, 1, nil, false)
  })
  test("fast replace with new direction sets world entity and calls update", () => {
    const { luaEntity, added } = addAndReset()
    const oldDirection = luaEntity.direction
    const newEntity = createEntity({ name: "test2", direction: direction.west })
    luaEntity.destroy()
    assemblyUpdater.onEntityPotentiallyUpdated(assembly, newEntity, layer, oldDirection)
    assert.equal(newEntity, added.getWorldEntity(1))
    assertOneEntity()
    assertUpdateCalled(added, 1, nil, false)
  })
})

describe("mark for upgrade", () => {
  test("upgrade to new value", () => {
    const { luaEntity, added } = addAndReset()
    rawset(luaEntity, "get_upgrade_target", () => simpleMock<LuaEntityPrototype>({ name: "test2" }))
    rawset(luaEntity, "get_upgrade_direction", () => nil)
    rawset(luaEntity, "cancel_upgrade", () => true)
    assemblyUpdater.onEntityMarkedForUpgrade(assembly, luaEntity, layer)
    assert.equal("test2", added.getBaseValue().name)
    assertOneEntity()
    assertUpdateCalled(added, 1, nil, false)
  })
  test("upgrade to rotated", () => {
    const { luaEntity, added } = addAndReset()
    rawset(luaEntity, "get_upgrade_target", () => nil)
    rawset(luaEntity, "get_upgrade_direction", () => direction.west)
    rawset(luaEntity, "cancel_upgrade", () => true)
    assemblyUpdater.onEntityMarkedForUpgrade(assembly, luaEntity, layer)
    assert.equal(direction.west, added.direction)
    assertOneEntity()
    assertUpdateCalled(added, 1, nil, false)
  })
})

describe("cleanup tool", () => {
  function setupWithProxy() {
    const { luaEntity, added } = addAndReset()
    luaEntity.destroy()
    const proxy = createEntity({ name: Prototypes.SelectionProxyPrefix + "test" })
    return { added, proxy }
  }
  test("onErrorEntityRevived", () => {
    const { added, proxy } = setupWithProxy()
    assemblyUpdater.onErrorEntityRevived(assembly, proxy, layer)
    assert.nil(added.getWorldEntity(1))
    assertOneEntity()
    assertUpdateCalled(added, 1, 1, false)
  })

  test("onErrorEntityRevived ignored if settings remnant", () => {
    const { added, proxy } = setupWithProxy()
    added.isSettingsRemnant = true
    assemblyUpdater.onErrorEntityRevived(assembly, proxy, layer)
    assert.nil(added.getWorldEntity(1))
    assertOneEntity()
    assertNoCalls()
  })

  test("onSettingsRemnantRemoved", () => {
    const { added, proxy } = setupWithProxy()
    added.isSettingsRemnant = true
    assemblyUpdater.onSettingsRemnantDeleted(assembly, proxy, layer)
    assert.nil(added.getWorldEntity(1))
    assertNoEntities()
    assertDeleteAllEntitiesCalled(added)
  })

  test("onSettingsRemnantRemoved ignored if not settings remnant", () => {
    const { added, proxy } = setupWithProxy()
    assemblyUpdater.onSettingsRemnantDeleted(assembly, proxy, layer)
    assert.nil(added.getWorldEntity(1))
    assertOneEntity()
    assertNoCalls()
  })
})

describe("circuit wires", () => {
  function setupNewWire(luaEntity1: LuaEntity, entity1: AssemblyEntity<TestEntity>): void {
    wireSaver.getWireConnectionDiff.invokes((_, entity2) => {
      wireSaver.getWireConnectionDiff.invokes(() => false as any)
      return $multi(
        [
          {
            wire: wire_type.red,
            fromEntity: entity1,
            toEntity: entity2,
            fromId: 1,
            toId: 0,
          } as AssemblyWireConnection,
        ],
        [],
      )
    })
  }
  function assertSingleWireMatches(entity2: AssemblyEntity<TestEntity>, entity1: AssemblyEntity<TestEntity>): void {
    const expectedConnection: AssemblyWireConnection = {
      wire: defines.wire_type.red,
      fromEntity: entity2,
      toEntity: entity1,
      fromId: 0,
      toId: 1,
    }
    function assertConnectionsMatch(connections: LuaSet<AssemblyWireConnection> | nil) {
      if (!connections) error("no connections")
      assert.equal(1, table_size(connections))
      const value = next(connections)[0] as AssemblyWireConnection
      assert.true(wireConnectionEquals(value, expectedConnection), "connections do not match")
    }
    assertConnectionsMatch(assembly.content.getWireConnections(entity1)?.get(entity2))
    assertConnectionsMatch(assembly.content.getWireConnections(entity1)?.get(entity2))
  }

  test("added circuit wires when entity added", () => {
    const { luaEntity: luaEntity1, added: entity1 } = addAndReset(nil, nil, {
      name: "test2",
      position: pos.plus(Pos(0, 1)),
    })
    setupNewWire(luaEntity1, entity1)
    const { added: entity2 } = addEntity()
    assertSingleWireMatches(entity2, entity1)

    assertUpdateCalled(entity2, 1, nil, false)
    assertNEntities(2)
  })

  describe("onCircuitWiresPotentiallyUpdated", () => {
    test("adds wire", () => {
      const { luaEntity: luaEntity1, added: entity1 } = addAndReset(nil, nil, {
        name: "test2",
        position: pos.plus(Pos(0, 1)),
      })
      addAndReset()
      setupNewWire(luaEntity1, entity1)

      assemblyUpdater.onCircuitWiresPotentiallyUpdated(assembly, luaEntity1, layer)

      assertUpdateCalled(entity1, 1, nil, false)
      assertNEntities(2)
    })

    test("deletes wire", () => {
      const { luaEntity: luaEntity1, added: entity1 } = addAndReset(nil, nil, {
        name: "test2",
        position: pos.plus(Pos(0, 1)),
      })
      setupNewWire(luaEntity1, entity1)
      const { added: entity2 } = addAndReset()

      const connection = next(assembly.content.getWireConnections(entity1)!.get(entity2)!)[0] as AssemblyWireConnection

      wireSaver.getWireConnectionDiff.invokes(() => {
        wireSaver.getWireConnectionDiff.invokes(() => false as any)
        return $multi([], [connection])
      })
      assemblyUpdater.onCircuitWiresPotentiallyUpdated(assembly, luaEntity1, layer)
      assert.falsy(assembly.content.getWireConnections(entity1)?.get(entity2))
      assert.falsy(assembly.content.getWireConnections(entity2)?.get(entity1))
      assertUpdateCalled(entity1, 1, nil, false)
      assertNEntities(2)
    })

    test("does nothing if no change", () => {
      const { luaEntity: luaEntity1, added: entity1 } = addAndReset(nil, nil, {
        name: "test2",
        position: pos.plus(Pos(0, 1)),
      })
      setupNewWire(luaEntity1, entity1)
      addAndReset()

      assemblyUpdater.onCircuitWiresPotentiallyUpdated(assembly, luaEntity1, layer)
      assertNoCalls()
      assertNEntities(2)
    })
  })
})
