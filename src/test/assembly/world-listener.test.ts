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

import { _mockAssembly } from "../../assembly/Assembly"
import { Assembly } from "../../assembly/AssemblyDef"
import { AssemblyUpdater, DefaultAssemblyUpdater } from "../../assembly/AssemblyUpdater"
import { _inValidState } from "../../assembly/world-listener"
import { registerAssemblyLocation, unregisterAssemblyLocation } from "../../assembly/world-register"
import { CustomInputs, Prototypes } from "../../constants"
import { StageNumber } from "../../entity/AssemblyEntity"
import { getTempBpItemStack, reviveGhost } from "../../entity/blueprinting"
import { Events } from "../../lib"
import { BBox, Pos, PositionClass } from "../../lib/geometry"
import { testArea } from "../area"
import direction = defines.direction

let updater: mock.Stubbed<AssemblyUpdater>
let assembly: Assembly
let surface: LuaSurface
let player: LuaPlayer
before_all(() => {
  surface = game.surfaces[1]
  player = game.players[1]

  updater = mock(DefaultAssemblyUpdater, true)

  assembly = _mockAssembly(2)
  registerAssemblyLocation(assembly)

  player.teleport(getStageCenter(1), surface)
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
  unregisterAssemblyLocation(assembly)
})

after_each(() => {
  assert.true(_inValidState())
  player?.cursor_stack?.clear()
})

function getStageCenter(stage: StageNumber): PositionClass {
  return BBox.center(assembly.getStage(stage)!)
}

describe("add", () => {
  test("player built entity", () => {
    const position = getStageCenter(1)
    player.cursor_stack!.set_stack("iron-chest")
    player.build_from_cursor({ position })
    player.cursor_stack!.clear()
    const entity = surface.find_entities_filtered({
      position,
      radius: 1,
      limit: 1,
      name: "iron-chest",
    })[0]
    assert.not_nil(entity)
    assert
      .spy(updater.onEntityCreated)
      .called_with(match.ref(assembly), match.ref(entity), match.ref(assembly.getStage(1)!), 1)
  })

  test("script raise built", () => {
    const position = getStageCenter(1)
    const entity = surface.create_entity({
      name: "iron-chest",
      position,
      raise_built: true,
    })!
    assert.not_nil(entity)
    assert
      .spy(updater.onEntityCreated)
      .called_with(match.ref(assembly), match.ref(entity), match.ref(assembly.getStage(1)!), nil)
  })
})

describe("delete", () => {
  let entity: LuaEntity
  before_each(() => {
    const position = getStageCenter(1)
    entity = surface.create_entity({
      name: "iron-chest",
      position,
      raise_built: true,
    })!
  })
  test("player mined entity", () => {
    player.mine_entity(entity, true)
    assert.spy(updater.onEntityDeleted).called_with(match.ref(assembly), match._, match.ref(assembly.getStage(1)!), 1)
  })
  test("script raised destroy", () => {
    entity.destroy({ raise_destroy: true })
    assert.spy(updater.onEntityDeleted).called_with(match.ref(assembly), match._, match.ref(assembly.getStage(1)!), nil)
  })
  test("die", () => {
    entity.die()
    assert.spy(updater.onEntityForceDeleted).called_with(match.ref(assembly), match._, match.ref(assembly.getStage(1)!))
  })
})

describe("update", () => {
  let entity: LuaEntity
  before_each(() => {
    const position = getStageCenter(1)
    entity = surface.create_entity({
      name: "inserter",
      position,
      raise_built: true,
      force: "player",
    })!
  })
  test("gui", () => {
    player.opened = nil
    player.opened = entity
    player.opened = nil
    assert
      .spy(updater.onEntityPotentiallyUpdated)
      .called_with(match.ref(assembly), match.ref(entity), match.ref(assembly.getStage(1)!), 1)
  })
  test("settings copy paste", () => {
    Events.raiseFakeEventNamed("on_entity_settings_pasted", {
      source: entity,
      destination: entity,
      player_index: 1 as PlayerIndex,
    })
    assert
      .spy(updater.onEntityPotentiallyUpdated)
      .called_with(match.ref(assembly), match.ref(entity), match.ref(assembly.getStage(1)!), 1)
  })

  test("rotate", () => {
    const oldDirection = entity.direction
    entity.rotate({ by_player: 1 as PlayerIndex })
    assert
      .spy(updater.onEntityRotated)
      .called_with(match.ref(assembly), match.ref(entity), match.ref(assembly.getStage(1)!), 1, oldDirection)
  })
})

test.each([
  [false, true],
  [true, false],
  [true, true],
])("fast replace, rotate: %s, upgrade: %s", (rotate, upgrade) => {
  const entity: LuaEntity = surface.create_entity({
    name: "inserter",
    position: getStageCenter(1),
    raise_built: true,
    force: "player",
  })!
  const newType = upgrade ? "fast-inserter" : "inserter"
  assert(
    surface.can_fast_replace({
      name: newType,
      position: entity.position,
      force: "player",
      direction: rotate ? direction.east : nil,
    }),
    "can fast replace",
  )
  const { position } = entity
  player.cursor_stack!.set_stack(newType)
  player.build_from_cursor({ position, direction: rotate ? direction.east : nil })
  const newEntity = surface.find_entity(newType, position)!
  assert.not_nil(newEntity)

  assert.false(entity.valid, "entity replaced")
  assert
    .spy(updater.onEntityPotentiallyUpdated)
    .called_with(match.ref(assembly), newEntity, match.ref(assembly.getStage(1)!), 1, match._)
})

// this test doesn't work because build_from_cursor doesn't fast replace both undergrounds?
// test.only("fast replace an underground runs onEntityPotentiallyUpdate on both", () => {
//   const u1 = surface.create_entity({
//     name: "underground-belt",
//     direction: direction.east,
//     type: "input",
//     position: getStageCenter(1),
//     force: "player",
//   })!
//   assert.not_nil(u1)
//   const u2 = surface.create_entity({
//     name: "underground-belt",
//     direction: direction.east,
//     type: "output",
//     position: Pos.plus(u1.position, Pos(1, 0)),
//   })!
//   assert.not_nil(u2)
//   const pos1 = u1.position
//   const pos2 = u2.position
//
//   player.cursor_stack!.set_stack("fast-underground-belt")
//   player.build_from_cursor({ position: u1.position, direction: direction.east })
//   const newU1 = surface.find_entity("fast-underground-belt", pos1)!
//   assert.not_nil(newU1)
//   const newU2 = surface.find_entity("fast-underground-belt", pos2)!
//   assert.not_nil(newU2)
//
//   assert
//     .spy(updater.onEntityPotentiallyUpdated)
//     .called_with(match.ref(assembly), match.ref(newU1), match.ref(assembly.getStage(1)!), match._)
//   assert
//     .spy(updater.onEntityPotentiallyUpdated)
//     .called_with(match.ref(assembly), match.ref(newU2), match.ref(assembly.getStage(1)!), match._)
//
//   assert.spy(updater.onEntityCreated).not_called()
//   assert.spy(updater.onEntityDeleted).not_called()
// })

describe("upgrade", () => {
  let entity: LuaEntity
  before_each(() => {
    const position = getStageCenter(1)
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
    assert
      .spy(updater.onEntityMarkedForUpgrade)
      .called_with(match.ref(assembly), match.ref(entity), match.ref(assembly.getStage(1)!), match._)
  })
  test("marked to rotate", () => {
    entity.order_upgrade({
      force: "player",
      target: "inserter",
      direction: defines.direction.east,
    })
    assert
      .spy(updater.onEntityMarkedForUpgrade)
      .called_with(match.ref(assembly), match.ref(entity), match.ref(assembly.getStage(1)!), match._)
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
    assert
      .spy(updater.onEntityPotentiallyUpdated)
      .called_with(match.ref(assembly), match.ref(newEntity!), match.ref(assembly.getStage(1)!), 1, oldDirection)
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
      position: getStageCenter(1),
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
    const pos = getStageCenter(1).plus(Pos(4.5, 0.5))
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
      assert
        .spy(updater.onEntityCreated)
        .called_with(match.ref(assembly), match.ref(chest), match.ref(assembly.getStage(1)!), nil)
    })
  })

  test("mine", () => {
    const pos = getStageCenter(1).plus(Pos(4.5, 0.5))
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
      assert
        .spy(updater.onEntityDeleted)
        .called_with(match.ref(assembly), match._, match.ref(assembly.getStage(1)!), nil)
    })
  })
})

describe("Cleanup tool", () => {
  test("revive error entity", () => {
    const entity = surface.create_entity({
      name: Prototypes.SelectionProxyPrefix + "iron-chest",
      position: getStageCenter(1),
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
    assert
      .spy(updater.onCleanupToolUsed)
      .called_with(match.ref(assembly), match.ref(entity), match.ref(assembly.getStage(1)!))
  })
  test("delete settings remnant", () => {
    const entity = surface.create_entity({
      name: Prototypes.SelectionProxyPrefix + "iron-chest",
      position: getStageCenter(1),
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
    assert
      .spy(updater.onCleanupToolUsed)
      .called_with(match.ref(assembly), match.ref(entity), match.ref(assembly.getStage(1)!))
  })
  test("force-delete", () => {
    const entity = surface.create_entity({
      name: "iron-chest",
      position: getStageCenter(1),
      force: "player",
    })!
    // alt select
    Events.raiseFakeEventNamed("on_player_reverse_selected_area", {
      player_index: 1 as PlayerIndex,
      item: Prototypes.CleanupTool,
      surface,
      area: testArea(0).bbox,
      entities: [entity],
      tiles: [],
    })
    assert
      .spy(updater.onEntityForceDeleted)
      .called_with(match.ref(assembly), match.ref(entity), match.ref(assembly.getStage(1)!))
  })
})

describe("move to this stage", () => {
  function testOnEntity(entity: LuaEntity | nil): void {
    assert.not_nil(entity, "entity found")
    player.selected = entity
    assert.equal(entity, player.selected)
    Events.raiseFakeEvent(CustomInputs.MoveToThisStage, {
      player_index: player.index,
      input_name: CustomInputs.MoveToThisStage,
      cursor_position: player.position,
    })
    assert
      .spy(updater.onMoveEntityToStage)
      .called_with(match.ref(assembly), match.ref(entity!), match.ref(assembly.getStage(1)!), 1)
  }
  test("on normal entity", () => {
    const entity = surface.create_entity({
      name: "inserter",
      position: getStageCenter(1),
      force: "player",
    })
    testOnEntity(entity)
  })
  test("on preview entity", () => {
    const entity = surface.create_entity({
      name: Prototypes.PreviewEntityPrefix + "inserter",
      position: getStageCenter(1),
      force: "player",
    })
    testOnEntity(entity)
  })
})
