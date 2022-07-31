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

import { LayerNumber } from "../entity/AssemblyEntity"
import { Events } from "../lib"
import { BBox, Pos, PositionClass } from "../lib/geometry"
import { Assembly, Layer } from "./Assembly"
import { AssemblyUpdater } from "./AssemblyUpdater"
import { _mockAssembly } from "./UserAssembly"
import { deleteAssembly, registerAssembly } from "./world-register"

let updater: mock.Stubbed<AssemblyUpdater>
let assembly: Assembly
let layers: Record<number, Layer>
let surface: LuaSurface
let player: LuaPlayer
before_all(() => {
  surface = game.surfaces[1]
  player = game.players[1]

  updater = mock(AssemblyUpdater, true)

  assembly = _mockAssembly(Pos(1, 1))
  for (let i = 0; i < 2; i++) {
    assembly.pushLayer({
      surface,
      position: Pos(i * 32, 0),
    })
  }
  layers = assembly.layers
  registerAssembly(assembly)
})

before_each(() => {
  surface
    .find_entities_filtered({
      area: BBox.coords(0, 0, 5 * 32, 32),
    })
    .forEach((e) => e.destroy())

  mock.clear(updater)
})
after_all(() => {
  mock.revert(updater)
  deleteAssembly(assembly)
})

function getLayerCenter(layer: LayerNumber): PositionClass {
  return BBox.center(layers[layer])
}

describe("add", () => {
  test("player built entity", () => {
    const position = getLayerCenter(1)
    player.cursor_stack!.set_stack("iron-chest")
    player.build_from_cursor({ position })
    player.cursor_stack!.clear()
    const entity = surface.find_entities_filtered({
      position,
      radius: 1,
      limit: 1,
      name: "iron-chest",
    })[0]
    assert.spy(updater.onEntityCreated).called_with(assembly, entity, layers[1])
  })

  test("script raise built", () => {
    const position = getLayerCenter(1)
    const entity = surface.create_entity({
      name: "iron-chest",
      position,
      raise_built: true,
    })
    assert.not_nil(entity)
    assert.spy(updater.onEntityCreated).called_with(assembly, entity, layers[1])
  })
})
describe("delete", () => {
  let entity: LuaEntity
  before_each(() => {
    const position = getLayerCenter(1)
    entity = surface.create_entity({
      name: "iron-chest",
      position,
      raise_built: true,
    })!
  })
  test("player mined entity", () => {
    player.mine_entity(entity, true)
    assert.spy(updater.onEntityDeleted).called_with(assembly, match._, layers[1])
  })
  test("script raised destroy", () => {
    entity.destroy({ raise_destroy: true })
    assert.spy(updater.onEntityDeleted).called_with(assembly, match._, layers[1])
  })
  test("die", () => {
    entity.die()
    assert.spy(updater.onEntityDeleted).called_with(assembly, match._, layers[1])
  })
})
describe("update", () => {
  let entity: LuaEntity
  before_each(() => {
    const position = getLayerCenter(1)
    entity = surface.create_entity({
      name: "inserter",
      position,
      raise_built: true,
    })!
  })
  test("gui", () => {
    player.opened = entity
    player.opened = nil
    assert.spy(updater.onEntityPotentiallyUpdated).called_with(assembly, entity, layers[1])
  })
  test("settings copy paste", () => {
    Events.raiseFakeEventNamed("on_entity_settings_pasted", {
      source: entity,
      destination: entity,
      player_index: 1 as PlayerIndex,
      name: defines.events.on_entity_settings_pasted,
      tick: game.tick,
    })
    assert.spy(updater.onEntityPotentiallyUpdated).called_with(assembly, entity, layers[1])
  })

  test("rotate", () => {
    const oldDirection = entity.direction
    entity.rotate({ by_player: 1 as PlayerIndex })
    assert.spy(updater.onEntityRotated).called_with(assembly, entity, layers[1], oldDirection)
  })
})
