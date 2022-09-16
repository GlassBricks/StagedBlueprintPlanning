/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of 100% Blueprint Planning.
 *
 * 100% Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * 100% Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with 100% Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { createAssembly } from "../../assembly/Assembly"
import { Assembly } from "../../assembly/AssemblyDef"
import { AssemblyUpdater, DefaultAssemblyUpdater } from "../../assembly/AssemblyUpdater"
import { _assertInValidState } from "../../assembly/world-listener"
import { CustomInputs, Prototypes } from "../../constants"
import { getTempBpItemStack, reviveGhost } from "../../entity/blueprinting"
import { Events, Mutable } from "../../lib"
import { BBox, Pos, PositionClass } from "../../lib/geometry"
import direction = defines.direction

let updater: mock.Stubbed<AssemblyUpdater>
let assembly: Assembly
let surface: LuaSurface
let player: LuaPlayer
const pos = Pos(0, 0)
before_all(() => {
  player = game.players[1]

  updater = mock(DefaultAssemblyUpdater, true)
  assembly = createAssembly("Test", 2)
  surface = assembly.getStage(1)!.surface

  player.teleport(pos, surface)
})
after_all(() => {
  mock.revert(updater)
})

before_each(() => {
  surface.find_entities().forEach((e) => e.destroy())
  mock.clear(updater)
})
after_each(() => {
  _assertInValidState()
  player?.cursor_stack?.clear()
})

describe("add", () => {
  test("player built entity", () => {
    const position = pos
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
    const position = pos
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
    const position = pos
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
    assert.spy(updater.onEntityDied).called_with(match.ref(assembly), match._, match.ref(assembly.getStage(1)!))
  })
})

describe("update", () => {
  let entity: LuaEntity
  before_each(() => {
    const position = pos
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
    position: pos,
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
    const position = pos
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
  // noinspection SpellCheckingInspection
  const setupBlueprint =
    "0eNqF0e9qxCAMAPB3yWc9rv/o6quMcVgv7QSronasK777aY/J4Arzi0SSXyTZYVQrWid1ALaDFEZ7YO87eDlrrvJb2CwCAxlwAQKaLzlyZjTWuACRgNR3/AZWxQ8CqIMMEp/GEWw3vS4jupTwWk3AGp8KjM6dMpKSNmC0usZIXoS6CH7hSlFUKIKTglqj8ARrLt0vd+nOwKaAyszSh0SJT/SB+mAcn8/M9j+zLWb5Hmp080bTkNFNXJyyT3RI8xzXaUJ38/InIdW1nDzfYwvsz9IIfKHzB1S/VW0/1H03NH26Y3wA6bmb8w=="
  before_each(() => {
    surface.find_entities().forEach((e) => e.destroy())
    const stack = getTempBpItemStack()
    stack.import_stack(setupBlueprint)
    const ghosts = stack.build_blueprint({
      surface,
      position: pos,
      force: "player",
    })
    assert(ghosts[0], "blueprint pasted")
    ghosts.forEach((x) => reviveGhost(x))
    const roboport = surface.find_entities_filtered({
      type: "roboport",
      limit: 1,
    })[0]
    assert.not_nil(roboport, "roboport found")
    roboport.insert("construction-robot")
    const storageChest = surface.find_entities_filtered({
      name: "logistic-chest-storage",
      limit: 1,
    })[0]
    assert.not_nil(storageChest, "storage chest found")
    storageChest.insert("iron-chest")
  })
  test("build", () => {
    const ghost = surface.create_entity({
      name: "entity-ghost",
      inner_name: "iron-chest",
      position: Pos(4.5, 0.5),
      force: "player",
    })
    assert(ghost, "ghost created")
    async()
    after_ticks(120, () => {
      done()
      const chest = surface.find_entities_filtered({
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
    const pos = Pos(4.5, 0.5)
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
      name: Prototypes.PreviewEntityPrefix + "iron-chest",
      position: pos,
      force: "player",
    })!
    Events.raiseFakeEventNamed("on_player_selected_area", {
      player_index: 1 as PlayerIndex,
      item: Prototypes.CleanupTool,
      surface,
      area: BBox.around(pos, 10),
      entities: [entity],
      tiles: [],
    })
    assert
      .spy(updater.onCleanupToolUsed)
      .called_with(match.ref(assembly), match.ref(entity), match.ref(assembly.getStage(1)!))
  })
  test("delete settings remnant", () => {
    const entity = surface.create_entity({
      name: Prototypes.PreviewEntityPrefix + "iron-chest",
      position: pos,
      force: "player",
    })!
    // alt select
    Events.raiseFakeEventNamed("on_player_alt_selected_area", {
      player_index: 1 as PlayerIndex,
      item: Prototypes.CleanupTool,
      surface,
      area: BBox.around(pos, 10),
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
      position: pos,
      force: "player",
    })!
    // alt select
    Events.raiseFakeEventNamed("on_player_reverse_selected_area", {
      player_index: 1 as PlayerIndex,
      item: Prototypes.CleanupTool,
      surface,
      area: BBox.around(pos, 10),
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
      position: pos,
      force: "player",
    })
    testOnEntity(entity)
  })
  test("on preview entity", () => {
    const entity = surface.create_entity({
      name: Prototypes.PreviewEntityPrefix + "inserter",
      position: pos,
      force: "player",
    })
    testOnEntity(entity)
  })
})

describe("revives ghost undergrounds", () => {
  test("by player", () => {
    const pos = Pos(4.5, 0.5)
    player.cursor_stack!.set_stack("underground-belt")
    player.build_from_cursor({
      position: pos,
      alt: true,
    })
    const underground = surface.find_entities_filtered({
      name: "underground-belt",
      limit: 1,
    })[0]
    assert.not_nil(underground, "underground found")
    assert.same(pos, underground.position)
    const ghosts = surface.find_entities_filtered({
      type: "entity-ghost",
      limit: 1,
    })[0]
    assert.nil(ghosts, "no ghosts found")

    assert
      .spy(updater.onEntityCreated)
      .called_with(match.ref(assembly), match.ref(underground), match.ref(assembly.getStage(1)!), 1)
  })
  test("by script", () => {
    const pos = Pos(4.5, 0.5)
    const undergroundGhost = surface.create_entity({
      name: "entity-ghost",
      inner_name: "underground-belt",
      position: pos,
      force: "player",
      raise_built: true,
    })
    assert.falsy(undergroundGhost?.valid, "ghost replaced")
    const underground = surface.find_entities_filtered({
      name: "underground-belt",
      limit: 1,
    })[0]
    assert.not_nil(underground, "underground found")
    assert.same(pos, underground.position)
    assert
      .spy(updater.onEntityCreated)
      .called_with(match.ref(assembly), match.ref(underground), match.ref(assembly.getStage(1)!), nil)
  })
})

describe("blueprint paste", () => {
  // note: this currently relies on editor mode, instant blueprint paste enabled
  const pos: PositionClass = Pos(4.5, 0.5)
  function setBlueprint(): void {
    const entity: BlueprintEntity = {
      entity_number: 1,
      name: "inserter",
      position: Pos(0.5, 0.5),
      direction: direction.west,
    }
    const cursor = player.cursor_stack!
    cursor.clear()
    cursor.set_stack("blueprint")
    cursor.set_blueprint_entities([entity])
  }
  before_each(setBlueprint)
  function assertCorrect(entity: LuaEntity): void {
    assert.not_nil(entity, "entity found")
    assert.same(pos, entity.position)

    assert
      .spy(updater.onEntityPotentiallyUpdated)
      .called_with(match.ref(assembly), entity, match.ref(assembly.getStage(1)!), 1)
  }

  test("create entity", () => {
    player.build_from_cursor({ position: pos })
    const inserter = surface.find_entities_filtered({
      name: "inserter",
      limit: 1,
    })[0]
    assertCorrect(inserter)
  })

  test("doesn't break when creating ghost entity", () => {
    player.toggle_map_editor()
    after_test(() => player.toggle_map_editor())
    setBlueprint()
    player.build_from_cursor({ position: pos, alt: true })
  })

  test("update existing entity", () => {
    const inserter = surface.create_entity({
      name: "inserter",
      position: pos,
      force: "player",
      direction: direction.west,
    })!
    player.build_from_cursor({ position: pos })
    assertCorrect(inserter)
  })
  test.each([true, false])("update existing entity with wires, already present %s", (alreadyPresent) => {
    const entities = player.cursor_stack!.get_blueprint_entities()!
    const firstEntity = entities[0] as Mutable<BlueprintEntity>
    const entity2: BlueprintEntity = {
      ...firstEntity,
      entity_number: 2,
      name: "inserter",
      position: Pos(1.5, 0.5),
      direction: direction.east,
      connections: {
        "1": {
          red: [{ entity_id: 1 }],
        },
      },
    }
    firstEntity.connections = {
      "1": {
        red: [{ entity_id: 2 }],
      },
    }
    player.cursor_stack!.set_blueprint_entities([firstEntity, entity2])

    const inserter1 = surface.create_entity({
      name: "inserter",
      position: pos,
      force: "player",
      direction: direction.west,
    })!
    // ignore second inserter

    updater.onEntityPotentiallyUpdated.returns((alreadyPresent ? nil : false) as any)
    player.build_from_cursor({ position: pos })
    assertCorrect(inserter1)
    if (alreadyPresent) {
      assert
        .spy(updater.onCircuitWiresPotentiallyUpdated)
        .called_with(match.ref(assembly), match.ref(inserter1), match.ref(assembly.getStage(1)!), 1)
    } else {
      assert.spy(updater.onCircuitWiresPotentiallyUpdated).was_not_called()
    }
  })

  test.each([true, false])("new entity with cable, with already present %s", (alreadyPresent) => {
    const entity1: BlueprintEntity = {
      entity_number: 1,
      name: "small-electric-pole",
      position: Pos(0.5, 0.5),
      neighbours: [2],
    }
    const entity2: BlueprintEntity = {
      entity_number: 2,
      name: "small-electric-pole",
      position: Pos(1.5, 0.5),
      neighbours: [1],
    }
    player.cursor_stack!.set_blueprint_entities([entity1, entity2])

    const pole1 = surface.create_entity({
      name: "small-electric-pole",
      position: pos,
      force: "player",
    })!
    // ignore second pole

    updater.onEntityPotentiallyUpdated.returns((alreadyPresent ? nil : false) as any)
    player.build_from_cursor({ position: pos })
    assertCorrect(pole1)
    if (alreadyPresent) {
      assert
        .spy(updater.onCircuitWiresPotentiallyUpdated)
        .called_with(match.ref(assembly), match.ref(pole1), match.ref(assembly.getStage(1)!), 1)
    } else {
      assert.spy(updater.onCircuitWiresPotentiallyUpdated).was_not_called()
    }
  })
})

// picker dollies only tested up to worldupdater
