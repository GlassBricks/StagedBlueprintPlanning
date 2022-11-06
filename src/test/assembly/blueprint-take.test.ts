/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import {
  BlueprintSettings,
  editBlueprintSettings,
  getDefaultBlueprintSettings,
  tryTakeBlueprintWithSettings,
} from "../../assembly/blueprint-take"
import { BBox, Pos } from "../../lib/geometry"
import { getPlayer } from "../../lib/test/misc"

let player: LuaPlayer
let surface: LuaSurface
before_all(() => {
  player = getPlayer()
  surface = game.surfaces[1]
})
before_each(() => {
  surface.find_entities().forEach((e) => e.destroy())
})

test("can edit blueprint settings", () => {
  const settings: BlueprintSettings = getDefaultBlueprintSettings()
  player.teleport({ x: 0, y: 0 }, 1 as SurfaceIndex)

  const theEntity = surface.create_entity({
    name: "iron-chest",
    position: [0.5, 0.5],
    force: "player",
  })!
  assert.not_nil(theEntity)

  const stack = editBlueprintSettings(player, settings, surface, BBox.around({ x: 0, y: 0 }, 10))!
  assert.not_nil(stack)

  stack.label = "test"
  const icons: BlueprintSignalIcon[] = [{ signal: { type: "item", name: "iron-plate" }, index: 1 }]
  stack.blueprint_icons = icons
  stack.blueprint_snap_to_grid = [2, 3]
  stack.blueprint_absolute_snapping = true
  stack.blueprint_position_relative_to_grid = [4, 5]
  const entities = stack.get_blueprint_entities()!
  assert.not_nil(entities)
  assert.equal(1, entities.length)

  const entity = entities[0]
  assert.equal(theEntity.name, entity.name)
  assert.same(theEntity.position, entity.position)

  stack.set_blueprint_entities([
    {
      ...entity,
      position: Pos.plus(entity.position, { x: 1, y: 2 }),
    },
  ])

  player.opened = nil

  assert.false(stack.valid)

  assert.equal("test", settings.name)
  assert.same(icons, settings.icons)

  assert.same({ x: 2, y: 3 }, settings.snapToGrid)
  assert.true(settings.absoluteSnapping)
  assert.same({ x: 4, y: 5 }, settings.positionRelativeToGrid)
  assert.same({ x: 1, y: 2 }, settings.positionOffset)
})

test("settings applied", () => {
  const settings: BlueprintSettings = {
    name: "test",
    icons: [{ signal: { type: "item", name: "iron-plate" }, index: 1 }],
    snapToGrid: { x: 2, y: 3 },
    absoluteSnapping: true,
    positionOffset: { x: 1, y: 2 },
    positionRelativeToGrid: { x: 4, y: 5 },
  }
  const theEntity = surface.create_entity({
    name: "iron-chest",
    position: [0.5, 0.5],
    force: "player",
  })!

  const stack = player.cursor_stack!
  stack.clear()
  stack.set_stack("blueprint")

  const res = tryTakeBlueprintWithSettings(stack, settings, surface, BBox.around({ x: 0, y: 0 }, 10))
  assert.true(res)

  assert.equal("test", stack.label)
  assert.same(settings.icons, stack.blueprint_icons)
  assert.same(settings.snapToGrid, stack.blueprint_snap_to_grid)
  assert.equal(settings.absoluteSnapping, stack.blueprint_absolute_snapping)
  assert.same(settings.positionRelativeToGrid, stack.blueprint_position_relative_to_grid)
  const entity = stack.get_blueprint_entities()![0]
  assert.same({ x: 1.5, y: 2.5 }, entity.position)
  assert.equal(theEntity.name, entity.name)
})
