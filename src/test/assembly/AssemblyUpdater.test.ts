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

import { AssemblyContent, LayerPosition } from "../../assembly/Assembly"
import { AssemblyUpdater, createAssemblyUpdater } from "../../assembly/AssemblyUpdater"
import { MutableEntityMap, newEntityMap } from "../../assembly/EntityMap"
import { WireSaver } from "../../assembly/WireHandler"
import { WorldUpdater } from "../../assembly/WorldUpdater"
import { AssemblyEntity, LayerChanges, LayerNumber } from "../../entity/AssemblyEntity"
import { AssemblyWireConnection, wireConnectionEquals } from "../../entity/AssemblyWireConnection"
import { Entity } from "../../entity/Entity"
import { _overrideEntityCategory } from "../../entity/entity-info"
import { createMockEntitySaver } from "../../entity/EntityHandler-mock"
import { ContextualFun, Mutable } from "../../lib"
import { BBox, Pos } from "../../lib/geometry"
import { entityMock, simpleMock } from "../simple-mock"
import direction = defines.direction
import wire_type = defines.wire_type

const pos = Pos(10.5, 10.5)

let layer: Mutable<LayerPosition>
let content: MutableEntityMap
let assembly: AssemblyContent

let assemblyUpdater: AssemblyUpdater
let worldUpdater: WorldUpdater
let wireSaver: mock.Stubbed<WireSaver>
before_all(() => {
  _overrideEntityCategory("test", "test")
  _overrideEntityCategory("test2", "test")
})

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
    updateWorldEntities: spyFn(),
    deleteAllWorldEntities: spyFn(),
  }
  wireSaver = {
    getWireConnectionDiff: stub<WireSaver["getWireConnectionDiff"]>().invokes(() => $multi([], [])),
  }
  assemblyUpdater = createAssemblyUpdater(worldUpdater, createMockEntitySaver(), wireSaver)
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
  const found = content.findCompatible({ name: entity.name }, entity.position, nil) as AssemblyEntity<TestEntity> | nil
  assert(found)
  return { luaEntity: entity, added: found! }
}

function addAndReset(addedNum: LayerNumber = layer.layerNumber, setNum = layer.layerNumber) {
  layer.layerNumber = addedNum
  const ret = addEntity()
  layer.layerNumber = setNum
  mock.clear(worldUpdater)
  totalCalls = 0
  return ret
}
describe("on a single entity", () => {
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
    assert.spy(worldUpdater.deleteAllWorldEntities as any).called_with(match.not_nil(), entity)
  }

  function assertOneEntity() {
    assert.equal(1, content.countNumEntities())
    entitiesAsserted = true
  }

  function assertNoEntities() {
    assert.same(0, content.countNumEntities())
    entitiesAsserted = true
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
    assertUpdateCalled(added, layer.layerNumber + 1, nil, false)
  }

  describe("add", () => {
    test("updates later layers", () => {
      const { added, luaEntity } = addEntity()
      assertAdded(added, luaEntity)
    })

    test.each([1, 2], "at same or higher layer updates the newly added entity, added layer: %d", (layerNumber) => {
      const { luaEntity, added } = addAndReset(1, layerNumber)
      assemblyUpdater.onEntityCreated(assembly, luaEntity, layer)
      assertOneEntity()
      assertUpdateCalled(added, layerNumber, layerNumber, false)
    })

    test.each([false, true])(
      "again at lower layer updates content and all world entities, with layer changes: %s",
      (withChanges) => {
        const { added } = addAndReset(3, 1)
        const newEntity = createEntity()
        if (withChanges) newEntity.prop1 = 3
        assemblyUpdater.onEntityCreated(assembly, newEntity, layer) // again
        assert.equal(newEntity, added.getWorldEntity(1))
        assert.same(1, added.getBaseLayer())
        if (!withChanges) {
          assert.equal(2, added.getBaseValue().prop1)
          assert.false(added.hasLayerChanges())
        } else {
          assert.equal(3, added.getBaseValue().prop1)
          assertLayerChanges(added, { 3: { prop1: 2 } })
        }

        assertOneEntity()
        assertUpdateCalled(added, 1, 2, true)
      },
    )
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
      assemblyUpdater.onEntityDeleted(assembly, luaEntity, layer) // simulated
      assert.falsy(added.isLostReference)
      assertNoEntities()
      assertDeleteAllEntitiesCalled(added)
    })

    test("in base layer with updates also creates lost reference", () => {
      const { luaEntity, added } = addAndReset()
      added._applyDiffAtLayer(2, { prop1: 3 })
      assemblyUpdater.onEntityDeleted(assembly, luaEntity, layer)
      assertOneEntity()
      assert.true(added.isLostReference)
      assertDeleteAllEntitiesCalled(added)
    })
  })

  describe("revive", () => {
    test.each([1, 2, 3, 4, 5, 6], "lost reference 1->3->5, revive at layer %d", (reviveLayer) => {
      const { luaEntity, added } = addAndReset(1, reviveLayer)
      added._applyDiffAtLayer(3, { prop1: 3 })
      added._applyDiffAtLayer(5, { prop1: 4 })
      added.isLostReference = true

      assemblyUpdater.onEntityCreated(assembly, luaEntity, layer)
      assert.equal(luaEntity, added.getWorldEntity(reviveLayer))
      assert.falsy(added.isLostReference)
      assert.equal(added.getBaseLayer(), reviveLayer)

      if (reviveLayer >= 5) {
        assert.equal(4, added.getBaseValue().prop1)
        assert.false(added.hasLayerChanges())
      } else if (reviveLayer >= 3) {
        assert.equal(3, added.getBaseValue().prop1)
        assertLayerChanges(added, { 5: { prop1: 4 } })
      } else {
        assert.equal(2, added.getBaseValue().prop1)
        assertLayerChanges(added, { 3: { prop1: 3 }, 5: { prop1: 4 } })
      }

      assertOneEntity()
      assertUpdateCalled(added, reviveLayer, nil, true)
    })

    test.each([false, true], "lost reference 2->3, revive at layer 1, with changes: %s", (withChanges) => {
      const { luaEntity, added } = addAndReset(2, 1)
      added._applyDiffAtLayer(3, { prop1: 3 })
      added.isLostReference = true

      if (withChanges) luaEntity.prop1 = 1

      assemblyUpdater.onEntityCreated(assembly, luaEntity, layer)
      assert.falsy(added.isLostReference)
      assert.equal(added.getBaseLayer(), 1)

      if (!withChanges) {
        assert.equal(2, added.getBaseValue().prop1)
        assertLayerChanges(added, { 3: { prop1: 3 } })
      } else {
        assert.equal(1, added.getBaseValue().prop1)
        assertLayerChanges(added, { 2: { prop1: 2 }, 3: { prop1: 3 } })
      }

      assertOneEntity()
      assertUpdateCalled(added, 1, nil, true)
    })
  })

  describe("update", () => {
    test("non-existent defaults to add behavior (bug)", () => {
      const entity = createEntity()
      assemblyUpdater.onEntityPotentiallyUpdated(assembly, entity, layer)
      const added = content.findCompatible({ name: "test" }, pos, nil) as AssemblyEntity<TestEntity>
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
      assertUpdateCalled(added, 1, 2, true)
    })

    test("in base layer updates all entities", () => {
      const { luaEntity, added } = addAndReset()
      luaEntity.prop1 = 3
      assemblyUpdater.onEntityPotentiallyUpdated(assembly, luaEntity, layer)
      assert.equal(3, added.getBaseValue().prop1)

      assertOneEntity()
      assertUpdateCalled(added, 1, nil, false)
    })

    test.each(
      [false, true],
      "in higher layer updates content and entities, with existing changes: %s",
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
      assert.true(added.hasLayerChanges())
      luaEntity.prop1 = 2
      assemblyUpdater.onEntityPotentiallyUpdated(assembly, luaEntity, layer)

      assertOneEntity()
      assertUpdateCalled(added, 2, nil, false)
    })
  })

  describe("rotate", () => {
    test("in base layer rotates all entities", () => {
      const { luaEntity, added } = addAndReset()
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
})

describe("circuit wires", () => {
  test("added circuit wires when entity added", () => {
    const { luaEntity: luaEntity1, added: entity1 } = addEntity({ name: "test2", position: pos.plus(Pos(0, 1)) })

    wireSaver.getWireConnectionDiff.invokes(() => {
      const addedConnection = {
        wire: wire_type.red,
        target_entity: luaEntity1,
        source_circuit_id: 0,
        target_circuit_id: 1,
      }
      return $multi(
        [
          {
            definition: addedConnection,
            otherEntity: entity1,
          },
        ],
        [],
      )
    })

    // will add connection
    const { added: entity2 } = addAndReset()

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
    assertConnectionsMatch(content.getWireConnections(entity1)?.get(entity2))
    assertConnectionsMatch(content.getWireConnections(entity1)?.get(entity2))
  })
})
