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

import { LayerPosition } from "../../assembly/AssemblyContent"
import { Entity } from "../../entity/Entity"
import { DefaultEntityHandler } from "../../entity/EntityHandler"
import { WorldArea } from "../../utils/world-location"
import { clearTestArea } from "../area"

let area: WorldArea
before_each(() => {
  area = clearTestArea()
})
test("can save an entity", () => {
  const entity = area.surface.create_entity({
    name: "iron-chest",
    position: { x: 12.5, y: 12.5 },
    force: "player",
    bar: 3,
  })!
  const saved = DefaultEntityHandler.saveEntity(entity)
  assert.same({ name: "iron-chest", bar: 3 }, saved)
})

test("can create an entity", () => {
  const layer: LayerPosition = {
    surface: area.surface,
    left_top: { x: 0, y: 0 },
    right_bottom: { x: 1, y: 1 },
    layerNumber: 0,
  }
  const luaEntity = DefaultEntityHandler.createEntity(layer, { position: { x: 0.5, y: 0.5 }, direction: nil }, {
    name: "iron-chest",
    bar: 3,
  } as Entity)!
  assert.not_nil(luaEntity, "entity created")
  assert.equal("iron-chest", luaEntity.name)
  assert.same({ x: 0.5, y: 0.5 }, luaEntity.position)
  assert.equal(3, luaEntity.get_inventory(defines.inventory.chest)!.get_bar() - 1)
})

test("can update an entity", () => {
  const entity = area.surface.create_entity({
    name: "iron-chest",
    position: { x: 12.5, y: 12.5 },
    force: "player",
    bar: 3,
  })!
  const newEntity = DefaultEntityHandler.updateEntity(entity, { name: "iron-chest", bar: 4 } as Entity)
  assert.equal(entity, newEntity)
  assert.equal(4, entity.get_inventory(defines.inventory.chest)!.get_bar() - 1)
})

test("can upgrade an entity", () => {
  const entity = area.surface.create_entity({
    name: "iron-chest",
    position: { x: 12.5, y: 12.5 },
    force: "player",
  })!
  entity.minable = false
  entity.destructible = false
  const newEntity = DefaultEntityHandler.updateEntity(entity, { name: "steel-chest" } as Entity)
  assert.equal("steel-chest", newEntity.name)
  assert.false(entity.valid)
})

test("can handle item changes", () => {
  const oldContents = { "productivity-module": 1, "productivity-module-2": 2 }
  const newContents = { "productivity-module-2": 2, "speed-module": 1 }

  const entity = area.surface.create_entity({
    name: "assembling-machine-3",
    position: { x: 12.5, y: 12.5 },
    force: "player",
  })!
  for (const [item, count] of pairs(oldContents)) entity.get_module_inventory()!.insert({ name: item, count })

  const newEntity = DefaultEntityHandler.updateEntity(entity, {
    name: "assembling-machine-3",
    items: newContents,
  } as Entity)
  assert.equal(newEntity, entity)
  assert.same(newContents, entity.get_module_inventory()!.get_contents())
})
