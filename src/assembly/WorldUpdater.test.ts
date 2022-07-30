/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of BBPP3.
 *
 * BBPP3 is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * BBPP3 is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with Foobar. If not, see <https://www.gnu.org/licenses/>.
 */

import {
  createAssemblyEntity,
  destroyWorldEntity,
  Entity,
  getValueAtLayer,
  getWorldEntity,
  LayerNumber,
  MutableAssemblyEntity,
  replaceOrDestroyWorldEntity,
} from "../entity/AssemblyEntity"
import { createEntity } from "../entity/world-entity"
import { Pos, Position } from "../lib/geometry"
import { clearTestArea, testArea } from "../test-util/area"
import { LayerPosition } from "./Assembly"
import { WorldUpdater, WorldUpdaterParams } from "./WorldUpdater"

let assembly: WorldUpdaterParams
const pos = Pos(10.5, 10.5)
let entity: MutableAssemblyEntity<InserterEntity>
before_each(() => {
  const layers: LayerPosition[] = []
  for (const i of $range(1, 3)) {
    const area = clearTestArea(i - 1)
    layers.push({
      ...area.bbox,
      surface: area.surface,
      layerNumber: i,
      assembly: nil!,
      valid: true,
    })
  }
  assembly = { layers }
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

function assertEntityNotPresent(i: LayerNumber): void {
  const luaEntity = findEntity(i)
  assert.nil(luaEntity)
  assert.is_nil(getWorldEntity(entity, i))
}

function assertEntityPresent(i: LayerNumber): void {
  const luaEntity = findEntity(i)!
  const valueAtLayer = getValueAtLayer(entity, i)!
  assert.not_nil(entity, `not found at layer ${i}`)
  assert.equal("filter-inserter", luaEntity.name)
  assert.equal(valueAtLayer.override_stack_size, luaEntity.inserter_stack_size_override)
  assert.equal(entity.direction, luaEntity.direction)
  assert.equal(luaEntity, getWorldEntity(entity, i) ?? "nil")
}

function findHighlight(layerNumber: LayerNumber, position: Position = entity.position): HighlightBoxEntity | nil {
  const { surface, bbox } = testArea(layerNumber - 1)
  const actualPos = Pos.plus(bbox.left_top, position)
  return surface.find_entities_filtered({
    name: "highlight-box",
    position: actualPos,
    radius: 0,
    limit: 1,
  })[0]
}

function assertHighlightPresent(i: LayerNumber): void {
  const highlight = findHighlight(i)!
  assert.not_nil(highlight)
  assert.equal("not-allowed", highlight.highlight_box_type)
}

function assertHighlightNotPresent(i: LayerNumber): void {
  const highlight = findHighlight(i)
  assert.nil(highlight)
}

function createAt(layerNumber: LayerNumber): LuaEntity | nil {
  return createEntity(assembly.layers[layerNumber], entity, entity.baseEntity)
}

function addAt(layerNumber: LayerNumber, stopLayer?: LayerNumber): LuaEntity | nil {
  entity.layerNumber = layerNumber
  const created = createAt(layerNumber)
  replaceOrDestroyWorldEntity(entity, created, layerNumber)
  WorldUpdater.createLaterEntities(assembly, entity, stopLayer)
  return getWorldEntity(entity, layerNumber)
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
      assert.equal(oldEntity, getWorldEntity(entity, 3), "entity replaced")
    } else {
      assert.nil(getWorldEntity(entity, 3), "entity replaced")
    }
  },
)

test("refresh", () => {
  addAt(1)
  getWorldEntity(entity, 2)!.destroy()
  const replaced = createEntity(assembly.layers[2], entity, { name: "filter-inserter" })!
  assert.not_nil(replaced)
  // refresh at layer 2
  WorldUpdater.refreshEntity(assembly, entity, 2, replaced)
  assertEntityPresent(2)
  assert.equal(replaced, getWorldEntity(entity, 2))
})

test.each([false, true], "revive at same layer, with changes: %s", (withChanges) => {
  addAt(1)
  if (withChanges) makeEntityWithChanges()
  for (let i = 1; i <= 3; i++) destroyWorldEntity(entity, i)
  WorldUpdater.reviveEntities(assembly, entity, nil)
  for (let i = 1; i <= 3; i++) assertEntityPresent(i)
})

test("delete", () => {
  addAt(1)
  WorldUpdater.deleteAllEntities(assembly, entity)
  for (let i = 1; i <= 3; i++) assertEntityNotPresent(i)
})

test("deletion forbidden", () => {
  addAt(1)
  const layer2Entity = getWorldEntity(entity, 2)
  layer2Entity!.destroy()
  WorldUpdater.forbidDeletion(assembly, entity, 2)
  assertEntityPresent(2)
})

test("rotate", () => {
  const luaEntity = addAt(1)!
  luaEntity.direction = entity.direction = defines.direction.west
  WorldUpdater.rotateEntities(assembly, entity)
  for (let i = 1; i <= 3; i++) assertEntityPresent(i)
})

test("rotation forbidden", () => {
  addAt(1)
  findEntity(2)!.direction = defines.direction.west
  WorldUpdater.forbidRotation(assembly, entity, 2)
  for (let i = 1; i <= 3; i++) assertEntityPresent(i)
})

describe("error highlight", () => {
  test("creates error highlight if entity cannot be created", () => {
    createAt(3)
    addAt(2)
    assertHighlightPresent(3)
  })

  test("removes error highlight after entity removed", () => {
    createAt(3)
    addAt(2)
    WorldUpdater.deleteAllEntities(assembly, entity)
    for (let i = 1; i <= 3; i++) {
      assertHighlightNotPresent(i)
    }
  })
})
