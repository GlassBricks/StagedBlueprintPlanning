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
  getDefaultBlueprintSettings,
  makeSimpleBlueprintTransformations,
  tryTakeBlueprintWithSettings,
} from "../../assembly/take-blueprint"
import { Prototypes } from "../../constants"
import { BBox, Pos } from "../../lib/geometry"
import { getPlayer } from "../../lib/test/misc"
import expect from "tstl-expect"
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
  expect(theEntity).to.be.any()

  const stack = editBlueprintSettings(
    player,
    settings,
    makeSimpleBlueprintTransformations(),
    surface,
    BBox.around(
      {
        x: 0,
        y: 0,
      },
      10,
    ),
  )!
  expect(stack).to.be.any()
  expect(stack.valid_for_read && stack.is_blueprint).to.be(true)

  stack.label = "test"
  const icons: BlueprintSignalIcon[] = [{ signal: { type: "item", name: "iron-plate" }, index: 1 }]
  stack.blueprint_icons = icons
  stack.blueprint_snap_to_grid = [2, 3]
  stack.blueprint_absolute_snapping = true
  stack.blueprint_position_relative_to_grid = [4, 5]
  const entities = stack.get_blueprint_entities()!
  expect(entities).to.be.any()
  expect(entities.length).to.be(1)

  const entity = entities[0]
  expect(entity.name).to.be(theEntity.name)
  expect(entity.position).to.equal(theEntity.position)

  stack.set_blueprint_entities([
    {
      ...entity,
      position: Pos.plus(entity.position, { x: 1, y: 2 }),
    },
  ])

  player.opened = nil

  expect(stack.valid).to.be(false)

  expect(settings.name).to.be("test")
  expect(settings.icons).to.equal(icons)

  expect(settings.snapToGrid).to.equal({ x: 2, y: 3 })
  expect(settings.absoluteSnapping).to.be(true)
  expect(settings.positionRelativeToGrid).to.equal({ x: 4, y: 5 })
  expect(settings.positionOffset).to.equal({ x: 1, y: 2 })
})

test("can edit blueprint filters", () => {
  const transform = makeSimpleBlueprintTransformations()
  const stack = editBlueprintFilters(player, transform)!
  expect(stack).to.be.any()
  expect(stack.valid_for_read).to.be(true)
  expect(stack.name).to.be(Prototypes.BlueprintFilters)

  stack.entity_filters = ["iron-chest", "steel-chest"]
  stack.entity_filter_mode = entity_filter_mode.blacklist

  player.opened = nil
  expect(transform.entityFilters.get()).to.equal(newLuaSet("iron-chest", "steel-chest"))
  expect(transform.entityFilterMode.get()).to.be(entity_filter_mode.blacklist)
})

test("can clear blueprint filters", () => {
  const transform = makeSimpleBlueprintTransformations(
    newLuaSet("iron-chest", "steel-chest"),
    entity_filter_mode.whitelist,
  )
  const stack = editBlueprintFilters(player, transform)!
  expect(stack).to.be.any()
  expect(stack.valid_for_read).to.be(true)
  expect(stack.name).to.be(Prototypes.BlueprintFilters)

  stack.set_entity_filter(1, nil)
  stack.set_entity_filter(2, nil)
  stack.entity_filter_mode = entity_filter_mode.whitelist

  player.opened = nil

  expect(transform.entityFilters.get()).to.be.nil()
  expect(transform.entityFilterMode.get()).to.be(nil)
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
  expect(chest).to.be.any()
  const other = surface.create_entity({
    name: "transport-belt",
    position: [0.5, 1.5],
    force: "player",
  })!
  expect(other).to.be.any()

  const stack = player.cursor_stack!
  stack.clear()
  stack.set_stack("blueprint")

  const whitelist = mode == "whitelist"
  const transform = makeSimpleBlueprintTransformations(
    whitelist ? newLuaSet("iron-chest") : newLuaSet("transport-belt"),
    whitelist ? entity_filter_mode.whitelist : entity_filter_mode.blacklist,
  )
  const res = tryTakeBlueprintWithSettings(stack, settings, transform, surface, BBox.around({ x: 0, y: 0 }, 10))
  expect(res).to.be(true)

  expect(stack.label).to.be("test")
  expect(stack.blueprint_icons).to.equal(settings.icons)
  expect(stack.blueprint_snap_to_grid).to.equal(settings.snapToGrid)
  expect(stack.blueprint_absolute_snapping).to.be(settings.absoluteSnapping)
  expect(stack.blueprint_position_relative_to_grid).to.equal(settings.positionRelativeToGrid)
  const entities = stack.get_blueprint_entities()!
  expect(entities.length).to.be(1)
  expect(entities[0].position).to.equal(Pos.plus(chest.position, settings.positionOffset))
  expect(entities[0].name).to.equal(chest.name)

  const tiles = stack.get_blueprint_tiles()!
  expect(tiles).to.be.any()
  expect(tiles.length).to.be(1)
  expect(tiles[0].position).to.equal(settings.positionOffset)
})

test("Replace infinity entities with constant combinators", () => {
  // chest
  const chest = surface.create_entity({
    name: "infinity-chest",
    position: [0.5, 0.5],
    force: "player",
  })!
  expect(chest).to.be.any()
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
  expect(belt).to.be.any()
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

  const transform = makeSimpleBlueprintTransformations(nil, nil, true)

  const res = tryTakeBlueprintWithSettings(
    stack,
    getDefaultBlueprintSettings(),
    transform,
    surface,
    BBox.around({ x: 0, y: 0 }, 10),
  )
  expect(res).to.be(true)

  const entities = stack.get_blueprint_entities()!
  expect(entities.length).to.be(3)

  expect(entities[0].position).to.equal(pipe.position)
  expect(entities[0].name).to.equal("constant-combinator")
  expect(entities[0].control_behavior).to.equal({
    filters: [
      {
        index: 1,
        count: 40,
        signal: { type: "fluid", name: "water" },
      },
    ],
  })

  expect(entities[1].position).to.equal(belt.position)
  expect(entities[1].name).to.equal("transport-belt")

  expect(entities[2].position).to.equal(chest.position)
  expect(entities[2].name).to.equal("constant-combinator")
  expect(entities[2].control_behavior).to.equal({
    filters: [
      { index: 1, count: 60, signal: { type: "item", name: "iron-plate" } },
      { index: 2, count: 80, signal: { type: "item", name: "copper-plate" } },
    ],
  } as BlueprintControlBehavior)
  // assert.same(
  //   {
  //     "1": { red: [{ entity_id: 1, circuit_id: 1 }] },
  //   } as BlueprintCircuitConnection,
  //   entities[2].connections,
  // )
  expect(entities[2].connections!["1"]).to.equal({
    red: [{ entity_id: 2 }],
  })
})
