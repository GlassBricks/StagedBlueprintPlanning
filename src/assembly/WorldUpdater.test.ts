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

import { AssemblyEntity, createAssemblyEntity, LayerNumber } from "../entity/AssemblyEntity"
import { Entity } from "../entity/Entity"
import { createMockEntityCreator, MockEntityCreator } from "../entity/EntityHandler-mock"
import { Pos, Position } from "../lib/geometry"
import { testArea } from "../test-util/area"
import { AssemblyPosition } from "./Assembly"
import { createMockAssembly } from "./Assembly-mock"
import { createWorldUpdater, WorldUpdater } from "./WorldUpdater"

interface TestEntity extends Entity {
  prop1: number
  prop2?: string
}
let assembly: AssemblyPosition
let entity: AssemblyEntity<TestEntity>

let mockEntityCreator: MockEntityCreator
let worldUpdater: WorldUpdater

before_each(() => {
  assembly = createMockAssembly(3)
  entity = createAssemblyEntity(
    {
      name: "test",
      prop1: 1,
    },
    { x: 0, y: 0 },
    defines.direction.east,
    1,
  )

  mockEntityCreator = createMockEntityCreator()
  worldUpdater = createWorldUpdater(mockEntityCreator)
})

function assertEntityNotPresent(i: LayerNumber): void {
  assert.falsy(mockEntityCreator.getAt(i) ?? nil)
  assert.is_nil(entity.getWorldEntity(i))
}

function assertEntityPresent(i: LayerNumber): void {
  const entry = mockEntityCreator.getAt(i)!
  assert.not_nil(entry)
  assert.equal(entry.luaEntity, entity.getWorldEntity(i) ?? "nil")
  const valueAtLayer = entity.getValueAtLayer(i)
  assert.same(valueAtLayer, entry.value, `value not equal at layer ${i}`)
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
  return mockEntityCreator.createEntity(assembly.layers[layerNumber], entity, entity.getBaseValue())
}

function addAt(layerNumber: LayerNumber, stopLayer?: LayerNumber): LuaEntity | nil {
  entity.moveEntityTo(layerNumber)
  const created = createAt(layerNumber)
  entity.replaceOrDestroyWorldEntity(layerNumber, created)
  worldUpdater.createLaterEntities(assembly, entity, stopLayer)
  return created
}

test.each([1, 2, 3], "add to layer %d", (layer) => {
  addAt(layer)
  for (let i = 1; i < layer; i++) assertEntityNotPresent(i)
  for (let i = layer; i <= 3; i++) assertEntityPresent(i)
})

function makeEntityWithChanges(): void {
  entity.applyDiffAtLayer(entity.getBaseLayer(), { prop1: 2 })
  entity.applyDiffAtLayer(3, { prop1: 1 })
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
    const oldEntity = addAt(3)!
    if (oldDeleted) oldEntity.destroy()
    if (withChanges) makeEntityWithChanges()
    addAt(1, 3)
    for (let i = 1; i <= 3; i++) {
      if (!(i === 3 && oldDeleted)) assertEntityPresent(i)
    }
    if (oldDeleted) {
      assert.nil(entity.getWorldEntity(3), "entity replaced")
    } else {
      assert.equal(oldEntity, entity.getWorldEntity(3), "entity replaced")
    }
  },
)

test("refresh", () => {
  addAt(1)
  entity.getWorldEntity(2)!.destroy()
  const replaced = mockEntityCreator.createEntity(assembly.layers[2], entity, {
    name: "test",
    prop1: 10,
  } as TestEntity)!
  assert.not_nil(replaced)
  // refresh at layer 2
  worldUpdater.refreshEntity(assembly, entity, 2, replaced)
  assert.equal(replaced, entity.getWorldEntity(2))
  assertEntityPresent(2)
})

test.each([false, true], "revive at same layer, with changes: %s", (withChanges) => {
  addAt(1)
  if (withChanges) makeEntityWithChanges()
  for (let i = 1; i <= 3; i++) entity.destroyWorldEntity(i)
  worldUpdater.reviveEntities(assembly, entity, nil)
  for (let i = 1; i <= 3; i++) assertEntityPresent(i)
})

test("delete", () => {
  addAt(1)
  worldUpdater.deleteAllEntities(assembly, entity)
  for (let i = 1; i <= 3; i++) assertEntityNotPresent(i)
})

test("deletion forbidden", () => {
  addAt(1)
  const layer2Entity = entity.getWorldEntity(2)
  layer2Entity!.destroy()
  worldUpdater.forbidDeletion(assembly, entity, 2)
  assertEntityPresent(2)
})

test("rotate", () => {
  const luaEntity = addAt(1)!
  luaEntity.direction = entity.direction = defines.direction.west
  worldUpdater.rotateEntities(assembly, entity)
  for (let i = 1; i <= 3; i++) assertEntityPresent(i)
})

test("rotation forbidden", () => {
  addAt(1)
  mockEntityCreator.getAt(2)!.luaEntity.direction = defines.direction.west
  worldUpdater.forbidRotation(assembly, entity, 2)
  for (let i = 1; i <= 3; i++) assertEntityPresent(i)
})

describe.skip("error highlight", () => {
  test("creates error highlight if entity cannot be values", () => {
    createAt(3)
    addAt(2)
    assertHighlightPresent(3)
  })

  test("removes error highlight after entity removed", () => {
    createAt(3)
    addAt(2)
    worldUpdater.deleteAllEntities(assembly, entity)
    for (let i = 1; i <= 3; i++) {
      assertHighlightNotPresent(i)
    }
  })
})
