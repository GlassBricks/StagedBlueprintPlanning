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

import { LuaPlayer, LuaSurface, SignalID, UnitNumber } from "factorio:runtime"
import expect from "tstl-expect"
import { BlueprintTakeSettings, getDefaultBlueprintSettings } from "../../blueprints/blueprint-settings"
import { FirstEntityOriginalPositionTag, takeSingleBlueprint } from "../../blueprints/take-single-blueprint"
import { UnstagedEntityProps } from "../../entity/Entity"
import { BBox, Pos } from "../../lib/geometry"
import { simpleInsertPlan } from "../entity/entity-util"

let surface: LuaSurface
let player: LuaPlayer
const bbox = BBox.around(Pos(0, 0), 10)
before_all(() => {
  surface = game.surfaces[1]
  player = game.players[1]
})
before_each(() => {
  surface.find_entities().forEach((e) => e.destroy())
  surface.build_checkerboard(bbox.expand(20))
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

test("can take blueprint with settings applied", () => {
  const settings = {
    ...getDefaultBlueprintSettings(),
    icon3: { type: "item", name: "iron-plate" },
    snapToGrid: { x: 2, y: 3 },
    absoluteSnapping: true,
    positionOffset: { x: 1, y: 2 },
    positionRelativeToGrid: { x: 4, y: 5 },
    appendStageNumbersToIcons: true,
  } satisfies BlueprintTakeSettings

  const { chest, belt } = createSampleEntities()
  surface.set_tiles([{ name: "landfill", position: [0, 0] }])

  const stack = player.cursor_stack!
  stack.set_stack("blueprint")

  const ret = takeSingleBlueprint({
    stack,
    settings,
    surface,
    bbox,
    unitNumberFilter: nil,
    setOrigPositionTag: true,
    stageName: "foo bar 1.0",
  })
  expect(ret).toBeTruthy()

  expect(stack.preview_icons).toEqual([
    {
      index: 3,
      signal: { name: "iron-plate" },
    },
    {
      index: 4,
      signal: { type: "virtual", name: "signal-1" } as SignalID,
    },
  ])
  expect(stack.blueprint_snap_to_grid).toEqual(settings.snapToGrid)
  expect(stack.blueprint_absolute_snapping).toBe(settings.absoluteSnapping)
  expect(stack.blueprint_position_relative_to_grid).toEqual(settings.positionRelativeToGrid)
  const entities = stack.get_blueprint_entities()!
  expect(entities.length).toBe(2)
  expect(entities[0]).toMatchTable({
    name: belt.name,
    tags: { [FirstEntityOriginalPositionTag]: belt.position },
  })
  expect(entities[1]).toMatchTable({
    name: chest.name,
  })

  delete (entities[0] as any).tags
  expect(ret?.entities).toEqual(entities)

  expect(ret?.bpMapping).toEqual({
    1: belt,
    2: chest,
  })

  const tiles = stack.get_blueprint_tiles()!
  expect(tiles).toBeAny()
  expect(tiles).toHaveLength(1)
  expect(tiles[0].position).toEqual(settings.positionOffset)
})

test("forEdit position offset still works when first entity is blacklisted", () => {
  const settings = {
    ...getDefaultBlueprintSettings(),
    icon1: { type: "item", name: "iron-plate" },
    snapToGrid: { x: 2, y: 3 },
    absoluteSnapping: true,
    positionOffset: { x: 1, y: 2 },
    positionRelativeToGrid: { x: 4, y: 5 },
    blacklist: newLuaSet("transport-belt"),
  } satisfies BlueprintTakeSettings

  const { chest } = createSampleEntities()
  surface.set_tiles([{ name: "landfill", position: [0, 0] }])

  const stack = player.cursor_stack!
  stack.set_stack("blueprint")

  const ret = takeSingleBlueprint({ stack, settings, surface, bbox, unitNumberFilter: nil, setOrigPositionTag: true })
  expect(ret).toBeTruthy()

  expect(stack.blueprint_snap_to_grid).toEqual(settings.snapToGrid)
  expect(stack.blueprint_absolute_snapping).toBe(settings.absoluteSnapping)
  expect(stack.blueprint_position_relative_to_grid).toEqual(settings.positionRelativeToGrid)

  const entities = stack.get_blueprint_entities()!
  expect(entities.length).toBe(1)
  expect(entities[0]).toMatchTable({
    name: chest.name,
    tags: { [FirstEntityOriginalPositionTag]: chest.position },
  })

  const tiles = stack.get_blueprint_tiles()!
  expect(tiles).toBeAny()
  expect(tiles).toHaveLength(1)
  expect(tiles[0].position).toEqual(settings.positionOffset)
})

test("default icons used when no icons are set", () => {
  const settings = getDefaultBlueprintSettings() satisfies BlueprintTakeSettings

  createSampleEntities()
  surface.set_tiles([{ name: "landfill", position: [0, 0] }])

  const stack = player.cursor_stack!
  stack.set_stack("blueprint")

  const ret = takeSingleBlueprint({ stack, settings, surface, bbox, unitNumberFilter: nil })
  expect(ret).toBeTruthy()

  expect(stack.preview_icons).toEqual(stack.default_icons)
})

test("applies blacklist", () => {
  const settings = {
    ...getDefaultBlueprintSettings(),
    blacklist: newLuaSet("iron-chest"),
  } satisfies BlueprintTakeSettings

  const { belt } = createSampleEntities()
  surface.set_tiles([{ name: "landfill", position: [0, 0] }])

  const stack = player.cursor_stack!
  stack.set_stack("blueprint")

  const ret = takeSingleBlueprint({ stack, settings, surface, bbox, unitNumberFilter: nil })
  expect(ret).toBeTruthy()

  const entities = stack.get_blueprint_entities()!
  expect(entities.length).toBe(1)
  expect(entities[0]).toMatchTable({ name: belt.name })
  expect(entities[0]).not.toHaveKey("tags")
})

test("applies unit number filter", () => {
  const { chest } = createSampleEntities()
  const filter = newLuaSet(chest.unit_number!)

  const settings: BlueprintTakeSettings = getDefaultBlueprintSettings()

  const stack = player.cursor_stack!
  stack.set_stack("blueprint")

  const ret = takeSingleBlueprint({ stack, settings, surface, bbox, unitNumberFilter: filter })
  expect(ret).toBeTruthy()

  const entities = stack.get_blueprint_entities()!
  expect(entities.length).toBe(1)
  expect(entities[0].name).toEqual(chest.name)
})

test("applies item requests", () => {
  const { chest } = createSampleEntities()
  const request = simpleInsertPlan(defines.inventory.chest, "iron-plate", 1, 10)
  const settings = getDefaultBlueprintSettings()

  const itemRequests = new LuaMap<UnitNumber, UnstagedEntityProps>()
  itemRequests.set(chest.unit_number!, { items: [request] })

  const stack = player.cursor_stack!
  stack.set_stack("blueprint")
  const ret = takeSingleBlueprint({
    stack,
    settings,
    surface,
    bbox,
    additionalSettings: itemRequests,
    unitNumberFilter: nil,
  })
  expect(ret).toBeTruthy()

  const entities = stack.get_blueprint_entities()!
  expect(entities.length).toBe(2)
  const chestEntity = entities.find((entity) => entity.name == chest.name)
  expect(chestEntity).toBeAny()
  expect(chestEntity!.items).toEqual([request])
})

test("applies unit number filter as well as whitelist", () => {
  const { belt } = createSampleEntities()
  const filter = newLuaSet(-1 as UnitNumber)

  const settings: BlueprintTakeSettings = {
    ...getDefaultBlueprintSettings(),
    additionalWhitelist: newLuaSet(belt.name),
  }

  const stack = player.cursor_stack!
  stack.set_stack("blueprint")

  const ret = takeSingleBlueprint({ stack, settings, surface, bbox, unitNumberFilter: filter })
  expect(ret).toBeTruthy()

  const entities = stack.get_blueprint_entities()!
  expect(entities.length).toBe(1)
  expect(entities[0].name).toEqual(belt.name)
})

test("always includes ghosts", () => {
  const ghost = surface.create_entity({
    name: "entity-ghost",
    inner_name: "transport-belt",
    position: [0.5, 0.5],
    force: "player",
  })!
  expect(ghost).toBeAny()
  expect(ghost.name).toEqual("entity-ghost")

  const settings: BlueprintTakeSettings = getDefaultBlueprintSettings()
  const unitNumberFilter = newLuaSet(ghost.unit_number!)

  const stack = player.cursor_stack!
  stack.set_stack("blueprint")

  const ret = takeSingleBlueprint({ stack, settings, surface, bbox, unitNumberFilter })
  expect(ret).toBeTruthy()

  const entities = stack.get_blueprint_entities()!
  expect(entities.length).toBe(1)
  expect(entities[0].name).toEqual("transport-belt")
})
