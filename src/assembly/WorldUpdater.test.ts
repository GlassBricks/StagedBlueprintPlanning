import {
  createAssemblyEntity,
  Entity,
  getValueAtLayer,
  LayerNumber,
  MutableAssemblyEntity,
} from "../entity/AssemblyEntity"
import { createEntity } from "../entity/diff"
import { Pos, Position } from "../lib/geometry"
import { clearTestArea, testArea } from "../test-util/area"
import { Layer } from "./Assembly"
import { newWorldUpdater, WorldUpdater } from "./WorldUpdater"

let layers: Layer[]

let worldUpdater: WorldUpdater
const pos = Pos(10.5, 10.5)
let entity: MutableAssemblyEntity<InserterEntity>
before_each(() => {
  layers = []
  for (const i of $range(1, 3)) {
    const area = clearTestArea(i - 1)
    layers.push({
      ...area,
      layerNumber: i,
    })
  }
  worldUpdater = newWorldUpdater({ layers })
  entity = createAssemblyEntity(
    {
      name: "filter-inserter",
      override_stack_size: 1,
    },
    pos,
    defines.direction.east,
    1,
  )
})

interface InserterEntity extends Entity {
  override_stack_size?: number
  filter_mode?: "whitelist" | "blacklist"
}

function findEntity(
  layerNumber: LayerNumber,
  entityName: string = entity.baseEntity.name,
  position: Position = entity.position,
  direction: defines.direction | nil = entity.direction,
): LuaEntity | nil {
  const { surface, bbox } = testArea(layerNumber - 1)
  const actualPos = Pos.plus(bbox.left_top, position)
  return surface.find_entities_filtered({
    name: entityName,
    position: actualPos,
    radius: 0,
    direction,
    limit: 1,
  })[0]
}

function assertEntityNotPresent(i: number): void {
  const luaEntity = findEntity(i)
  assert.nil(luaEntity)
  assert.is_nil(entity.worldEntities[i])
}

function assertEntityPresent(i: LayerNumber): void {
  const LuaEntity = findEntity(i)!
  const valueAtLayer = getValueAtLayer(entity, i)!
  assert.not_nil(entity, `not found at layer ${i}`)
  assert.equal("filter-inserter", LuaEntity.name)
  assert.equal(valueAtLayer.override_stack_size, LuaEntity.inserter_stack_size_override)
  assert.equal(defines.direction.east, entity.direction)
  assert.equal(LuaEntity, entity.worldEntities[i])
}

function addAt(layerNumber: LayerNumber, stopLayer?: LayerNumber): LuaEntity | nil {
  entity.layerNumber = layerNumber
  worldUpdater.add(entity, stopLayer)
  return entity.worldEntities[layerNumber]
}

test.each([1, 2, 3], "add to layer %d", (layer) => {
  addAt(layer)
  for (let i = 1; i < layer; i++) assertEntityNotPresent(i)
  for (let i = layer; i <= 3; i++) assertEntityPresent(i)
})

function makeEntityWithChanges(): void {
  entity.baseEntity.override_stack_size = 2
  entity.layerChanges = { 3: { override_stack_size: 1 } }
}
test.each(
  [
    [false, false],
    [false, true],
    [true, false],
    [true, true],
  ],
  "add below, with deleted %s, with changes %s",
  (oldDeleted, withChanges) => {
    const oldEntity = addAt(3)
    if (withChanges) makeEntityWithChanges()
    if (oldDeleted) oldEntity!.destroy()
    addAt(1, 3)
    for (let i = 1; i <= 3; i++) {
      if (!(i === 3 && oldDeleted)) assertEntityPresent(i)
    }
    if (!oldDeleted) {
      assert.equal(oldEntity, entity.worldEntities[3], "entity replaced")
    } else {
      assert.false(entity.worldEntities[3]?.valid, "entity replaced")
    }
  },
)

test("refresh", () => {
  addAt(1)
  entity.worldEntities[2]!.destroy()
  const replaced = createEntity(layers[2 - 1], entity, { name: "filter-inserter" })!
  // refresh at layer 2
  worldUpdater.refresh(entity, 2, replaced)
  assertEntityPresent(2)
  assert.equal(replaced, entity.worldEntities[2])
})

test.each([false, true], "revive at same layer, with changes: %s", (withChanges) => {
  addAt(1)
  if (withChanges) makeEntityWithChanges()
  for (let i = 1; i <= 3; i++) entity.worldEntities[i]!.destroy()
  worldUpdater.revive(entity)
  for (let i = 1; i <= 3; i++) assertEntityPresent(i)
})

test("delete", () => {
  addAt(1)
  worldUpdater.delete(entity)
  for (let i = 1; i <= 3; i++) assertEntityNotPresent(i)
})

test("deletion forbidden", () => {
  addAt(1)
  const layer2Entity = entity.worldEntities[2]
  layer2Entity!.destroy()
  worldUpdater.deletionForbidden(entity, 2)
  assertEntityPresent(2)
})