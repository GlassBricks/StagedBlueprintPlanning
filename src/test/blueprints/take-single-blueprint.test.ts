/*
 * Copyright (c) 2023 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { BlueprintControlBehavior, LuaPlayer, LuaSurface, UnitNumber } from "factorio:runtime"
import expect from "tstl-expect"
import { getDefaultBlueprintSettings, StageBlueprintSettings } from "../../blueprints/blueprint-settings"
import { FirstEntityOriginalPositionTag, takeSingleBlueprint } from "../../blueprints/take-single-blueprint"
import { BBox, Pos } from "../../lib/geometry"

let surface: LuaSurface
let player: LuaPlayer
const bbox = BBox.around(Pos(0, 0), 10)
before_all(() => {
  surface = game.surfaces[1]
  player = game.players[1]
})
before_each(() => {
  surface.find_entities().forEach((e) => e.destroy())
})

function createSampleEntities() {
  const chest = surface.create_entity({
    name: "iron-chest",
    position: [0.5, 0.5],
    force: "player",
  })!
  assert(chest)
  const belt = surface.create_entity({
    name: "transport-belt",
    position: [1.5, 1.5],
    force: "player",
  })!
  return { chest, belt }
}

test("can take blueprint and settings applied", () => {
  const settings = {
    ...getDefaultBlueprintSettings(),
    icons: [{ signal: { type: "item", name: "iron-plate" }, index: 1 }],
    snapToGrid: { x: 2, y: 3 },
    absoluteSnapping: true,
    positionOffset: { x: 1, y: 2 },
    positionRelativeToGrid: { x: 4, y: 5 },
  } satisfies StageBlueprintSettings

  const { chest, belt } = createSampleEntities()
  surface.set_tiles([{ name: "landfill", position: [0, 0] }])

  const stack = player.cursor_stack!
  stack.set_stack("blueprint")

  const ret = takeSingleBlueprint(stack, settings, surface, bbox, nil, true)
  expect(ret).toBeTruthy()

  expect(stack.blueprint_icons).to.equal(settings.icons)
  expect(stack.blueprint_snap_to_grid).to.equal(settings.snapToGrid)
  expect(stack.blueprint_absolute_snapping).to.be(settings.absoluteSnapping)
  expect(stack.blueprint_position_relative_to_grid).to.equal(settings.positionRelativeToGrid)
  const entities = stack.get_blueprint_entities()!
  expect(entities.length).to.be(2)
  expect(entities[0]).toMatchTable({
    name: belt.name,
    tags: { [FirstEntityOriginalPositionTag]: belt.position },
  })
  expect(entities[1]).toMatchTable({
    name: chest.name,
  })

  const tiles = stack.get_blueprint_tiles()!
  expect(tiles).to.be.any()
  expect(tiles).toHaveLength(1)
  expect(tiles[0].position).to.equal(settings.positionOffset)
})

test("forEdit position offset still works when first entity is blacklisted", () => {
  const settings = {
    ...getDefaultBlueprintSettings(),
    icons: [{ signal: { type: "item", name: "iron-plate" }, index: 1 }],
    snapToGrid: { x: 2, y: 3 },
    absoluteSnapping: true,
    positionOffset: { x: 1, y: 2 },
    positionRelativeToGrid: { x: 4, y: 5 },
    blacklist: newLuaSet("transport-belt"),
  } satisfies StageBlueprintSettings

  const { chest } = createSampleEntities()
  surface.set_tiles([{ name: "landfill", position: [0, 0] }])

  const stack = player.cursor_stack!
  stack.set_stack("blueprint")

  const ret = takeSingleBlueprint(stack, settings, surface, bbox, nil, true)
  expect(ret).toBeTruthy()

  expect(stack.blueprint_snap_to_grid).to.equal(settings.snapToGrid)
  expect(stack.blueprint_absolute_snapping).to.be(settings.absoluteSnapping)
  expect(stack.blueprint_position_relative_to_grid).to.equal(settings.positionRelativeToGrid)

  const entities = stack.get_blueprint_entities()!
  expect(entities.length).to.be(1)
  expect(entities[0]).toMatchTable({
    name: chest.name,
    tags: { [FirstEntityOriginalPositionTag]: chest.position },
  })

  const tiles = stack.get_blueprint_tiles()!
  expect(tiles).to.be.any()
  expect(tiles).toHaveLength(1)
  expect(tiles[0].position).to.equal(settings.positionOffset)
})

test("applies blacklist", () => {
  const settings = {
    ...getDefaultBlueprintSettings(),
    icons: nil,
    blacklist: newLuaSet("iron-chest"),
  } satisfies StageBlueprintSettings

  const { belt } = createSampleEntities()
  surface.set_tiles([{ name: "landfill", position: [0, 0] }])

  const stack = player.cursor_stack!
  stack.set_stack("blueprint")

  const ret = takeSingleBlueprint(stack, settings, surface, bbox, nil, false)
  expect(ret).toBeTruthy()

  const entities = stack.get_blueprint_entities()!
  expect(entities.length).to.be(1)
  expect(entities[0]).toMatchTable({ name: belt.name })
  expect(entities[0]).not.toHaveKey("tags")
})

test("applies unit number filter", () => {
  const { chest } = createSampleEntities()
  const filter = newLuaSet(chest.unit_number!)

  const settings: StageBlueprintSettings = {
    ...getDefaultBlueprintSettings(),
    icons: nil,
  }

  const stack = player.cursor_stack!
  stack.set_stack("blueprint")

  const ret = takeSingleBlueprint(stack, settings, surface, bbox, filter, false)
  expect(ret).toBeTruthy()

  const entities = stack.get_blueprint_entities()!
  expect(entities.length).to.be(1)
  expect(entities[0].name).to.equal(chest.name)
})

test("applies unit number filter as well as whitelist", () => {
  const { belt } = createSampleEntities()
  const filter = newLuaSet(-1 as UnitNumber)

  const settings: StageBlueprintSettings = {
    ...getDefaultBlueprintSettings(),
    icons: nil,
    additionalWhitelist: newLuaSet(belt.name),
  }

  const stack = player.cursor_stack!
  stack.set_stack("blueprint")

  const ret = takeSingleBlueprint(stack, settings, surface, bbox, filter, false)
  expect(ret).toBeTruthy()

  const entities = stack.get_blueprint_entities()!
  expect(entities.length).to.be(1)
  expect(entities[0].name).to.equal(belt.name)
})

test("replace infinity entities with constant combinators", () => {
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

  const settings = {
    ...getDefaultBlueprintSettings(),
    icons: nil,
    replaceInfinityEntitiesWithCombinators: true,
  } satisfies StageBlueprintSettings

  const stack = player.cursor_stack!
  stack.set_stack("blueprint")

  const res = takeSingleBlueprint(stack, settings, surface, BBox.around({ x: 0, y: 0 }, 10), nil, false)
  expect(res).toBeTruthy()

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
  expect(entities[2].connections!["1"]).to.equal({
    red: [{ entity_id: 2 }],
  })
})
