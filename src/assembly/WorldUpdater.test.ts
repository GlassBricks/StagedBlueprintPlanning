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
  Entity,
  getValueAtLayer,
  LayerNumber,
  MutableAssemblyEntity,
} from "../entity/AssemblyEntity"
import { createEntity } from "../entity/diff"
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
  WorldUpdater.add(assembly, entity, stopLayer, nil)
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
  const replaced = createEntity(assembly.layers[2], entity, { name: "filter-inserter" })!
  assert.not_nil(replaced)
  // refresh at layer 2
  WorldUpdater.refresh(assembly, entity, 2, replaced)
  assertEntityPresent(2)
  assert.equal(replaced, entity.worldEntities[2])
})

test.each([false, true], "revive at same layer, with changes: %s", (withChanges) => {
  addAt(1)
  if (withChanges) makeEntityWithChanges()
  for (let i = 1; i <= 3; i++) entity.worldEntities[i]!.destroy()
  WorldUpdater.revive(assembly, entity, nil)
  for (let i = 1; i <= 3; i++) assertEntityPresent(i)
})

test("delete", () => {
  addAt(1)
  WorldUpdater.delete(assembly, entity)
  for (let i = 1; i <= 3; i++) assertEntityNotPresent(i)
})

test("deletion forbidden", () => {
  addAt(1)
  const layer2Entity = entity.worldEntities[2]
  layer2Entity!.destroy()
  WorldUpdater.deletionForbidden(assembly, entity, 2)
  assertEntityPresent(2)
})
