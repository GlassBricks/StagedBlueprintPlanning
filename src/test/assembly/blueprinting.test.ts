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

import { editBlueprintFilters, editBlueprintSettings } from "../../assembly/edit-blueprint-settings"
import {
  BlueprintSettings,
  BlueprintTransformations,
  getDefaultBlueprintSettings,
  tryTakeBlueprintWithSettings,
} from "../../assembly/take-blueprint"
import { Prototypes } from "../../constants"
import { BBox, Pos } from "../../lib/geometry"
import { getPlayer } from "../../lib/test/misc"
import entity_filter_mode = defines.deconstruction_item.entity_filter_mode

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

  const stack = editBlueprintSettings(player, settings, {}, surface, BBox.around({ x: 0, y: 0 }, 10))!
  assert.not_nil(stack)
  assert.true(stack.valid_for_read && stack.is_blueprint)

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

test("can edit blueprint filters", () => {
  const transform: BlueprintTransformations = {}
  const stack = editBlueprintFilters(player, transform)!
  assert.not_nil(stack)
  assert.true(stack.valid_for_read)
  assert.equal(Prototypes.BlueprintFilters, stack.name)

  stack.entity_filters = ["iron-chest", "steel-chest"]
  stack.entity_filter_mode = entity_filter_mode.whitelist

  player.opened = nil
  assert.same(newLuaSet("iron-chest", "steel-chest"), transform.entityFilters)
  assert.equal(entity_filter_mode.whitelist, transform.entityFilterMode)
})

test.each(["whitelist", "blacklist"])("blueprint settings and filter applied", (mode) => {
  const settings: BlueprintSettings = {
    name: "test",
    icons: [{ signal: { type: "item", name: "iron-plate" }, index: 1 }],
    snapToGrid: { x: 2, y: 3 },
    absoluteSnapping: true,
    positionOffset: { x: 1, y: 2 },
    positionRelativeToGrid: { x: 4, y: 5 },
  }
  surface.set_tiles([{ name: "landfill", position: [0, 0] }])
  const chest = surface.create_entity({
    name: "iron-chest",
    position: [0.5, 0.5],
    force: "player",
  })!
  assert.not_nil(chest)
  const other = surface.create_entity({
    name: "transport-belt",
    position: [0.5, 1.5],
    force: "player",
  })!
  assert.not_nil(other)

  const stack = player.cursor_stack!
  stack.clear()
  stack.set_stack("blueprint")

  const whitelist = mode == "whitelist"
  const transform: BlueprintTransformations = {
    entityFilters: whitelist ? newLuaSet("iron-chest") : newLuaSet("transport-belt"),
    entityFilterMode: whitelist ? entity_filter_mode.whitelist : entity_filter_mode.blacklist,
  }
  const res = tryTakeBlueprintWithSettings(stack, settings, transform, surface, BBox.around({ x: 0, y: 0 }, 10))
  assert.true(res)

  assert.equal("test", stack.label)
  assert.same(settings.icons, stack.blueprint_icons)
  assert.same(settings.snapToGrid, stack.blueprint_snap_to_grid)
  assert.equal(settings.absoluteSnapping, stack.blueprint_absolute_snapping)
  assert.same(settings.positionRelativeToGrid, stack.blueprint_position_relative_to_grid)
  const entities = stack.get_blueprint_entities()!
  assert.equal(1, entities.length)
  assert.same(Pos.plus(chest.position, settings.positionOffset), entities[0].position)
  assert.same(chest.name, entities[0].name)

  const tiles = stack.get_blueprint_tiles()!
  assert.not_nil(tiles)
  assert.equal(1, tiles.length)
  assert.same(settings.positionOffset, tiles[0].position)
})

test("Replace infinity entities with constant combinators", () => {
  // chest
  const chest = surface.create_entity({
    name: "infinity-chest",
    position: [0.5, 0.5],
    force: "player",
  })!
  assert.not_nil(chest)
  chest.infinity_container_filters = [
    {
      index: 1,
      name: "iron-plate",
      count: 60,
    },
    {
      index: 2,
      name: "copper-plate",
      count: 80,
    },
  ]
  // belt just for circuit connection
  const belt = surface.create_entity({
    name: "transport-belt",
    position: [1.5, 0.5],
    force: "player",
  })!
  assert.not_nil(belt)
  belt.connect_neighbour({ wire: defines.wire_type.red, target_entity: chest })
  // infinity pipe
  const pipe = surface.create_entity({
    name: "infinity-pipe",
    position: [0.5, 1.5],
    force: "player",
  })!
  pipe.set_infinity_pipe_filter({
    name: "water",
    percentage: 0.4,
  })

  const stack = player.cursor_stack!
  stack.clear()
  stack.set_stack("blueprint")

  const transform: BlueprintTransformations = {
    replaceInfinityWithCombinators: true,
  }

  const res = tryTakeBlueprintWithSettings(
    stack,
    getDefaultBlueprintSettings(),
    transform,
    surface,
    BBox.around({ x: 0, y: 0 }, 10),
  )
  assert.true(res)

  const entities = stack.get_blueprint_entities()!
  assert.equal(3, entities.length)

  assert.same(pipe.position, entities[0].position)
  assert.same("constant-combinator", entities[0].name)
  assert.same(
    {
      filters: [
        {
          index: 1,
          count: 40,
          signal: { type: "fluid", name: "water" },
        },
      ],
    },
    entities[0].control_behavior,
  )

  assert.same(belt.position, entities[1].position)
  assert.same("transport-belt", entities[1].name)

  assert.same(chest.position, entities[2].position)
  assert.same("constant-combinator", entities[2].name)
  assert.same(
    {
      filters: [
        { index: 1, count: 60, signal: { type: "item", name: "iron-plate" } },
        { index: 2, count: 80, signal: { type: "item", name: "copper-plate" } },
      ],
    } as BlueprintControlBehavior,
    entities[2].control_behavior,
  )
  // assert.same(
  //   {
  //     "1": { red: [{ entity_id: 1, circuit_id: 1 }] },
  //   } as BlueprintCircuitConnection,
  //   entities[2].connections,
  // )
  assert.same(
    {
      red: [{ entity_id: 2 }],
    },
    entities[2].connections!["1"],
  )
})
