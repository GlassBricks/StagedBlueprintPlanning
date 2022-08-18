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

import { Assembly, Layer } from "../../assembly/Assembly"
import { AssemblyUpdater, DefaultAssemblyUpdater } from "../../assembly/AssemblyUpdater"
import { _mockAssembly } from "../../assembly/UserAssembly"
import { _inValidState } from "../../assembly/world-listener"
import { deleteAssembly, registerAssembly } from "../../assembly/world-register"
import { Prototypes } from "../../constants"
import { LayerNumber } from "../../entity/AssemblyEntity"
import { getTempBpItemStack, reviveGhost } from "../../entity/blueprinting"
import { Events } from "../../lib"
import { BBox, Pos, PositionClass } from "../../lib/geometry"
import { testArea } from "../area"

let updater: mock.Stubbed<AssemblyUpdater>
let assembly: Assembly
let layers: Record<number, Layer>
let surface: LuaSurface
let player: LuaPlayer
before_all(() => {
  surface = game.surfaces[1]
  player = game.players[1]

  updater = mock(DefaultAssemblyUpdater, true)

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

after_each(() => {
  assert.true(_inValidState())
  player?.cursor_stack?.clear()
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
      force: "player",
    })!
  })
  test("gui", () => {
    player.opened = entity
    player.opened = nil
    assert.spy(updater.onEntityPotentiallyUpdated).called_with(assembly, entity, layers[1], match.nil())
  })
  test("settings copy paste", () => {
    Events.raiseFakeEventNamed("on_entity_settings_pasted", {
      source: entity,
      destination: entity,
      player_index: 1 as PlayerIndex,
    })
    assert.spy(updater.onEntityPotentiallyUpdated).called_with(assembly, entity, layers[1], match.nil())
  })

  test("rotate", () => {
    const oldDirection = entity.direction
    entity.rotate({ by_player: 1 as PlayerIndex })
    assert.spy(updater.onEntityPotentiallyUpdated).called_with(assembly, entity, layers[1], oldDirection)
  })
})

describe("fast replace", () => {
  let entity: LuaEntity
  before_each(() => {
    const position = getLayerCenter(1)
    entity = surface.create_entity({
      name: "inserter",
      position,
      raise_built: true,
      force: "player",
    })!
  })
  test("to upgrade", () => {
    assert(
      surface.can_fast_replace({
        name: "fast-inserter",
        position: entity.position,
        force: "player",
      }),
      "can fast replace",
    )
    const { position } = entity
    player.cursor_stack!.set_stack("fast-inserter")
    player.build_from_cursor({ position })
    const newEntity = surface.find_entity("fast-inserter", position)
    assert.not_nil(newEntity)

    assert.false(entity.valid, "entity replaced")
    assert.spy(updater.onEntityPotentiallyUpdated).called_with(assembly, newEntity, layers[1], match._)
  })

  test("to rotate", () => {
    assert(
      surface.can_fast_replace({
        name: "inserter",
        position: entity.position,
        direction: defines.direction.east,
        force: "player",
      }),
      "can fast replace",
    )
    const { position, direction: oldDirection } = entity
    player.cursor_stack!.set_stack("inserter")
    player.build_from_cursor({ position, direction: defines.direction.east })

    assert.false(entity.valid, "entity replaced")
    assert.spy(updater.onEntityPotentiallyUpdated).called_with(assembly, match._, layers[1], oldDirection)
  })
})

describe("upgrade", () => {
  let entity: LuaEntity
  before_each(() => {
    const position = getLayerCenter(1)
    entity = surface.create_entity({
      name: "inserter",
      position,
      raise_built: true,
      force: "player",
    })!
  })

  test("marked for upgrade", () => {
    entity.order_upgrade({
      force: "player",
      target: "fast-inserter",
    })
    assert.spy(updater.onEntityMarkedForUpgrade).called_with(assembly, entity, layers[1])
  })
  test("marked to rotate", () => {
    entity.order_upgrade({
      force: "player",
      target: "inserter",
      direction: defines.direction.east,
    })
    assert.spy(updater.onEntityMarkedForUpgrade).called_with(assembly, entity, layers[1])
  })

  test("instant upgrade planner", () => {
    Events.raiseFakeEventNamed("on_player_mined_entity", {
      player_index: 1 as PlayerIndex,
      entity,
      buffer: nil!,
    })
    const { position, direction: oldDirection } = entity
    entity.destroy()
    const newEntity = surface.create_entity({
      name: "fast-inserter",
      position,
      force: "player",
    })!
    Events.raiseFakeEventNamed("on_built_entity", {
      player_index: 1 as PlayerIndex,
      created_entity: newEntity,
      stack: nil!,
    })
    assert.spy(updater.onEntityPotentiallyUpdated).called_with(assembly, newEntity, layers[1], oldDirection)
  })
})

describe("robot actions", () => {
  const setupBlueprint =
    "0eNqF0e9qxCAMAPB3yWc9rv/o6quMcVgv7QSronasK777aY/J4Arzi0SSXyTZYVQrWid1ALaDFEZ7YO87eDlrrvJb2CwCAxlwAQKaLzlyZjTWuACRgNR3/AZWxQ8CqIMMEp/GEWw3vS4jupTwWk3AGp8KjM6dMpKSNmC0usZIXoS6CH7hSlFUKIKTglqj8ARrLt0vd+nOwKaAyszSh0SJT/SB+mAcn8/M9j+zLWb5Hmp080bTkNFNXJyyT3RI8xzXaUJ38/InIdW1nDzfYwvsz9IIfKHzB1S/VW0/1H03NH26Y3wA6bmb8w=="
  before_each(() => {
    const area = testArea(0)
    const stack = getTempBpItemStack()
    stack.import_stack(setupBlueprint)
    const ghosts = stack.build_blueprint({
      surface,
      position: getLayerCenter(1),
      force: "player",
    })
    assert(ghosts[0], "blueprint pasted")
    ghosts.forEach((x) => reviveGhost(x))
    const roboport = surface.find_entities_filtered({
      area: area.bbox,
      type: "roboport",
      limit: 1,
    })[0]
    roboport.insert("construction-robot")
    const storageChest = surface.find_entities_filtered({
      area: area.bbox,
      name: "logistic-chest-storage",
      limit: 1,
    })[0]
    storageChest.insert("iron-chest")
  })
  test("build", () => {
    const pos = getLayerCenter(1).plus(Pos(4.5, 0.5))
    const ghost = surface.create_entity({
      name: "entity-ghost",
      inner_name: "iron-chest",
      position: pos,
      force: "player",
    })
    assert(ghost, "ghost created")
    async()
    after_ticks(120, () => {
      done()
      const chest = surface.find_entities_filtered({
        area: testArea(0).bbox,
        name: "iron-chest",
        limit: 1,
      })[0]
      assert.not_nil(chest, "chest created")
      assert.spy(updater.onEntityCreated).called_with(assembly, chest, layers[1])
    })
  })

  test("mine", () => {
    const pos = getLayerCenter(1).plus(Pos(4.5, 0.5))
    const chest = surface.create_entity({
      name: "iron-chest",
      position: pos,
      force: "player",
    })!
    assert(chest, "chest created")
    chest.order_deconstruction("player")
    async()
    after_ticks(120, () => {
      done()
      assert.spy(updater.onEntityDeleted).called_with(assembly, match._, layers[1])
    })
  })
})

describe("Cleanup tool", () => {
  test("revive error entity", () => {
    const entity = surface.create_entity({
      name: Prototypes.SelectionProxyPrefix + "iron-chest",
      position: getLayerCenter(1),
      force: "player",
    })!
    Events.raiseFakeEventNamed("on_player_selected_area", {
      player_index: 1 as PlayerIndex,
      item: Prototypes.CleanupTool,
      surface,
      area: testArea(0).bbox,
      entities: [entity],
      tiles: [],
    })
    assert.spy(updater.onErrorEntityRevived).called_with(assembly, entity, layers[1])
  })
  test("delete lost reference", () => {
    const entity = surface.create_entity({
      name: Prototypes.SelectionProxyPrefix + "iron-chest",
      position: getLayerCenter(1),
      force: "player",
    })!
    // alt select
    Events.raiseFakeEventNamed("on_player_alt_selected_area", {
      player_index: 1 as PlayerIndex,
      item: Prototypes.CleanupTool,
      surface,
      area: testArea(0).bbox,
      entities: [entity],
      tiles: [],
    })
    assert.spy(updater.onLostReferenceDeleted).called_with(assembly, entity, layers[1])
  })
})
