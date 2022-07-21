import { AssemblyEntity, Entity, LayerNumber, MutableAssemblyEntity } from "../entity/AssemblyEntity"
import { Mutable } from "../lib"
import { Pos } from "../lib/geometry"
import { map2dSize } from "../lib/map2d"
import { clearTestArea } from "../test-util/area"
import { WorldArea } from "../utils/world-location"
import { Layer } from "./Assembly"
import { WorldAssembly } from "./WorldAssembly"
import { WorldUpdater } from "./WorldUpdater"

interface WorldUpdateEvent {
  type: keyof WorldUpdater
  entity: AssemblyEntity
  layer?: LayerNumber
  data?: unknown
}
let area: WorldArea
let layer: Mutable<Layer>
let events: WorldUpdateEvent[]
const worldUpdater: WorldUpdater = setmetatable<any, any>(
  {},
  {
    __index(key: keyof WorldUpdater) {
      return (self: any, entity: AssemblyEntity, layer: LayerNumber, data: unknown) => {
        events.push({ type: key, entity, layer, data })
      }
    },
  },
)

let assembly: WorldAssembly
const pos = Pos(10.5, 10.5)

before_each(() => {
  area = clearTestArea()
  layer = {
    ...area,
    layerNumber: 1,
  }
  events = []
  assembly = new WorldAssembly()
  assembly.worldUpdater = worldUpdater
})

interface InserterEntity extends Entity {
  readonly override_stack_size?: number
  readonly filter_mode?: "whitelist" | "blacklist"
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

function assertNoEvents() {
  assert.same([], events)
  eventsAsserted = true
}

function assertSingleEvent(event: WorldUpdateEvent) {
  assert.equal(1, events.length)
  assert.same(event, events[0])
  eventsAsserted = true
}

function assertOneEntity() {
  assert.equal(1, map2dSize(assembly.content.entities))
  entitiesAsserted = true
}

function assertNoEntities() {
  assert.same({}, assembly.content.entities)
  entitiesAsserted = true
}

function createEntity() {
  const entity = area.surface.create_entity({
    name: "filter-inserter",
    position: pos.plus(layer.bbox.left_top),
    force: "player",
  })!
  entity.inserter_stack_size_override = 2
  return assert(entity)
}

function doAdd() {
  const entity = createEntity()
  const added = assembly.onEntityAdded(entity, layer) as MutableAssemblyEntity<InserterEntity>
  return { luaEntity: entity, added }
}

function doVirtualAdd(addedNum: LayerNumber = layer.layerNumber, setNum = layer.layerNumber) {
  layer.layerNumber = addedNum
  const ret = doAdd()
  layer.layerNumber = setNum
  events = []
  return ret
}

function assertAdded(): MutableAssemblyEntity {
  const found = assembly.content.findCompatible({ name: "filter-inserter" }, pos, nil)!
  assert.not_nil(found)
  assert.equal("filter-inserter", found.baseEntity.name)
  assert.same(pos, found.position)
  assert.nil(found.direction)

  assertOneEntity()
  assertSingleEvent({ type: "add", entity: found })
  return found
}

test("new", () => {
  const { added } = doAdd()
  const found = assertAdded()
  assert.equal(added, found)
})

test.each([1, 2], "existing at layer 1, added at layer %d", (layerNumber) => {
  const { luaEntity, added } = doVirtualAdd(1, layerNumber)
  const added2 = assembly.onEntityAdded(luaEntity, layer) // again

  assert.equal(added, added2)

  assertOneEntity()
  assertSingleEvent({ type: "refresh", entity: added, layer: layerNumber })
})

test.each([false, true], "existing at layer 2, added at layer 1, with layer changes: %s", (withChanges) => {
  const { luaEntity, added: oldAdded } = doVirtualAdd(2, 1)

  if (withChanges) {
    luaEntity.inserter_stack_size_override = 3
  }
  const added = assembly.onEntityAdded<InserterEntity>(luaEntity, layer)! // again
  assert.equal(oldAdded, added)

  assert.same(1, added.layerNumber)
  if (!withChanges) {
    assert.equal(2, added.baseEntity.override_stack_size)
    assert.nil(added.layerChanges)
  } else {
    assert.equal(3, added.baseEntity.override_stack_size)
    assert.same({ 2: { override_stack_size: 2 } }, added.layerChanges)
  }

  assertOneEntity()
  assertSingleEvent({ type: "add", entity: added })
})

test("delete non-existent", () => {
  const entity = createEntity()
  assembly.onEntityDeleted(entity, layer)
  assertNoEntities()
  assertNoEvents()
})

test("delete existing at higher layer (bug)", () => {
  const { luaEntity } = doVirtualAdd(2, 1)
  assembly.onEntityDeleted(luaEntity, layer)
  assertOneEntity()
  assertNoEvents()
})

test("delete existing at lower layer", () => {
  const { luaEntity, added } = doVirtualAdd(1, 2)
  assembly.onEntityDeleted(luaEntity, layer)
  assertOneEntity()
  assertSingleEvent({ type: "deletionForbidden", entity: added, layer: layer.layerNumber })
})

test("delete existing at same layer", () => {
  const { luaEntity, added } = doVirtualAdd()
  assembly.onEntityDeleted(luaEntity, layer) // simulated
  assertNoEntities()
  assertSingleEvent({ type: "delete", entity: added })
})

test("delete entity with updates", () => {
  const { luaEntity, added } = doVirtualAdd()
  added.layerChanges = { 2: { override_stack_size: 3 } }
  assembly.onEntityDeleted(luaEntity, layer)
  assertOneEntity()
  assert.true(added.isLostReference)
  assertSingleEvent({ type: "delete", entity: added })
})

test.each([1, 2, 3, 4, 5, 6], "lost reference 1->3->5, revive at layer %d", (reviveLayer) => {
  const { luaEntity, added } = doVirtualAdd(1, reviveLayer)
  added.layerChanges = { 3: { override_stack_size: 3 }, 5: { override_stack_size: 4 } }
  added.isLostReference = true

  const revived = assembly.onEntityAdded<InserterEntity>(luaEntity, layer)!
  assert.falsy(revived.isLostReference)
  assert.equal(revived.layerNumber, reviveLayer)

  if (reviveLayer >= 5) {
    assert.nil(revived.layerChanges)
    assert.equal(4, revived.baseEntity.override_stack_size)
  } else if (reviveLayer >= 3) {
    assert.same({ 5: { override_stack_size: 4 } }, revived.layerChanges)
    assert.equal(3, revived.baseEntity.override_stack_size)
  } else {
    assert.same({ 3: { override_stack_size: 3 }, 5: { override_stack_size: 4 } }, revived.layerChanges)
    assert.equal(2, revived.baseEntity.override_stack_size)
  }

  assertOneEntity()
  assertSingleEvent({ type: "revive", entity: revived })
})

test.each([false, true], "lost reference 2->3, revive at layer 1, with changes: %s", (withChanges) => {
  const { luaEntity, added } = doVirtualAdd(2, 1)
  added.layerChanges = { 3: { override_stack_size: 3 } }
  added.isLostReference = true

  if (withChanges) luaEntity.inserter_stack_size_override = 1

  const revived = assembly.onEntityAdded<InserterEntity>(luaEntity, layer)!
  assert.falsy(revived.isLostReference)
  assert.equal(revived.layerNumber, 1)

  if (!withChanges) {
    assert.equal(2, revived.baseEntity.override_stack_size)
    assert.same({ 3: { override_stack_size: 3 } }, revived.layerChanges)
  } else {
    assert.equal(1, revived.baseEntity.override_stack_size)
    assert.same({ 2: { override_stack_size: 2 }, 3: { override_stack_size: 3 } }, revived.layerChanges)
  }

  assertOneEntity()
  assertSingleEvent({ type: "revive", entity: revived })
})

test("update non-existent", () => {
  const entity = createEntity()
  assembly.onEntityPotentiallyUpdated(entity, layer)
  // same as add
  assertAdded()
})

test("update with no changes", () => {
  const { luaEntity } = doVirtualAdd()
  assembly.onEntityPotentiallyUpdated(luaEntity, layer)
  assertOneEntity()
  assertNoEvents()
})

test("update in previous layer", () => {
  const { luaEntity, added } = doVirtualAdd(2, 1)
  assembly.onEntityPotentiallyUpdated(luaEntity, layer)
  // same as addBelow
  assertOneEntity()
  assertSingleEvent({ type: "add", entity: added })
})

test("update in same layer", () => {
  const { luaEntity, added } = doVirtualAdd()
  luaEntity.inserter_stack_size_override = 3
  assembly.onEntityPotentiallyUpdated(luaEntity, layer)
  assert.equal(3, added.baseEntity.override_stack_size)

  assertOneEntity()
  assertSingleEvent({ type: "update", entity: added, layer: layer.layerNumber, data: { override_stack_size: 3 } })
})

test.each([false, true], "update in next layer, with existing changes: %s", (withExistingChanges) => {
  const { luaEntity, added } = doVirtualAdd(1, 2)
  if (withExistingChanges) {
    added.layerChanges = { 2: { override_stack_size: 5, filter_mode: "blacklist" } }
    luaEntity.inserter_filter_mode = "blacklist" // not changed
  }

  luaEntity.inserter_stack_size_override = 3 // changed
  assembly.onEntityPotentiallyUpdated(luaEntity, layer)
  assert.equal(2, added.baseEntity.override_stack_size)
  if (withExistingChanges) {
    assert.same({ 2: { override_stack_size: 3, filter_mode: "blacklist" } }, added.layerChanges)
  } else {
    assert.same({ 2: { override_stack_size: 3 } }, added.layerChanges)
  }

  assertOneEntity()
  assertSingleEvent({ type: "update", entity: added, layer: layer.layerNumber, data: { override_stack_size: 3 } })
})
