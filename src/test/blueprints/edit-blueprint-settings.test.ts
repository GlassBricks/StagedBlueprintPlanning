/*
 * Copyright (c) 2022-2023 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { LuaEntity, LuaPlayer, LuaSurface, SurfaceIndex } from "factorio:runtime"
import expect from "tstl-expect"
import { BlueprintSettingsTable, getDefaultBlueprintSettings } from "../../blueprints/blueprint-settings"
import { editInItemBlueprintSettings } from "../../blueprints/edit-blueprint-settings"
import { BBox, Pos } from "../../lib/geometry"
import { getPlayer } from "../../lib/test/misc"
import { createPropertiesTable, getCurrentValues } from "../../utils/properties-obj"

let player: LuaPlayer
let surface: LuaSurface
before_all(() => {
  player = getPlayer()
  surface = game.surfaces[1]
})
before_each(() => {
  surface.find_entities().forEach((e) => e.destroy())
})

function createStageBlueprintSettings(): BlueprintSettingsTable {
  return createPropertiesTable(keys<BlueprintSettingsTable>(), getDefaultBlueprintSettings())
}

describe("in-item blueprint settings", () => {
  let settings: BlueprintSettingsTable
  let entity1: LuaEntity
  let entity2: LuaEntity
  before_each(() => {
    settings = createStageBlueprintSettings()
    player.teleport({ x: 0, y: 0 }, 1 as SurfaceIndex)
    entity1 = surface.create_entity({
      name: "iron-chest",
      position: [0.5, 0.5],
      force: "player",
    })!
    assert(entity1)
    entity2 = surface.create_entity({
      name: "steel-chest",
      position: [1.5, 0.5],
      force: "player",
    })!
    assert(entity2)
  })

  test("can edit settings", () => {
    const stack = editInItemBlueprintSettings(player, settings, surface, BBox.around({ x: 0, y: 0 }, 10), "Test")!
    expect(stack).toBeAny()
    expect(stack.valid_for_read && stack.is_blueprint).toBe(true)

    stack.blueprint_snap_to_grid = [2, 3]
    stack.blueprint_absolute_snapping = true
    stack.blueprint_position_relative_to_grid = [4, 5]
    const entities = stack.get_blueprint_entities()!
    expect(entities).toHaveLength(2)

    expect(entities[1]).toMatchTable({
      name: entity1.name,
      position: entity1.position,
    })
    expect(entities[0]).toMatchTable({
      name: entity2.name,
      position: entity2.position,
    })

    stack.set_blueprint_entities(entities.map((e) => ({ ...e, position: Pos.plus(e.position, { x: 1, y: 2 }) })))

    player.opened = nil

    expect(stack.valid).toBe(false)

    const newSettings = getCurrentValues(settings)
    expect(newSettings).toMatchTable({
      snapToGrid: { x: 2, y: 3 },
      absoluteSnapping: true,
      positionRelativeToGrid: { x: 4, y: 5 },
      positionOffset: { x: 1, y: 2 },
    })
  })

  test("doesn't update grid settings if entities removed", () => {
    const stack = editInItemBlueprintSettings(player, settings, surface, BBox.around({ x: 0, y: 0 }, 10), "Test")!
    expect(stack).toMatchTable({
      valid_for_read: true,
      is_blueprint: true,
    })

    stack.blueprint_snap_to_grid = [2, 3]
    stack.blueprint_absolute_snapping = true
    stack.blueprint_position_relative_to_grid = [4, 5]
    stack.set_blueprint_entities([stack.get_blueprint_entities()![0]])

    player.opened = nil

    expect(stack.valid).toBe(false)

    const newSettings = getCurrentValues(settings)
    expect(newSettings).toMatchTable({
      snapToGrid: nil,
      absoluteSnapping: true,
      positionRelativeToGrid: nil,
    })
  })
})
