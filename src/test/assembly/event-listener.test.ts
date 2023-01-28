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

import expect, { mock } from "tstl-expect"
import { oppositedirection } from "util"
import { UserAssembly } from "../../assembly/AssemblyDef"
import { _assertInValidState } from "../../assembly/event-listener"
import { getAssemblyPlayerData } from "../../assembly/player-assembly-data"
import { _deleteAllAssemblies, createUserAssembly } from "../../assembly/UserAssembly"
import { CustomInputs, Prototypes } from "../../constants"
import { getTempBpItemStack } from "../../entity/save-load"
import { Events, Mutable } from "../../lib"
import { BBox, Pos, Position, PositionClass } from "../../lib/geometry"
import { moduleMock } from "../module-mock"
import { reviveGhost } from "../reviveGhost"
import _worldListener = require("../../assembly/on-world-event")
import direction = defines.direction

const WorldListener = moduleMock(_worldListener, true)
let assembly: UserAssembly
let surface: LuaSurface
let player: LuaPlayer
const pos = Pos(0.5, 0.5)

before_all(() => {
  player = game.players[1]

  assembly = createUserAssembly("Test", 2)
  surface = assembly.getStage(1)!.surface

  player.teleport(pos, surface)
})
after_all(() => {
  _deleteAllAssemblies()
})

let expectedNumCalls = 1
before_each(() => {
  expectedNumCalls = 1
  surface.find_entities().forEach((e) => e.destroy())
})
after_each(() => {
  _assertInValidState()
  player?.cursor_stack?.clear()

  let totalCalls = 0
  const calls = new LuaMap<string, number>()
  for (const [key, value] of pairs(WorldListener)) {
    if (value != true) {
      totalCalls += value.calls.length
      calls.set(key, value.calls.length)
    }
  }
  if (totalCalls != expectedNumCalls) {
    error(
      `Expected ${expectedNumCalls} calls, got ${totalCalls} calls.\n` +
        Object.entries(calls)
          .filter(([, v]) => v > 0)
          .map(([k, v]) => `${k}: ${v}`)
          .join("\n"),
    )
  }
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
    expect(entity).to.be.any()
    expect(WorldListener.onEntityCreated).calledWith(assembly, entity, 1, 1)
  })

  test("script raise built", () => {
    const position = pos
    const entity = surface.create_entity({
      name: "iron-chest",
      position,
      raise_built: true,
    })!
    expect(entity).to.be.any()
    expect(WorldListener.onEntityCreated).calledWith(assembly, entity, 1, nil)
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
      force: "player",
    })!
    mock.clear(WorldListener)
  })
  test("player mined entity", () => {
    player.mine_entity(entity, true)
    expect(WorldListener.onEntityDeleted).calledWith(assembly, expect._, 1, 1)
  })
  test("script raised destroy", () => {
    entity.destroy({ raise_destroy: true })
    expect(WorldListener.onEntityDeleted).calledWith(assembly, expect._, 1, nil)
  })
  test("die", () => {
    entity.die()
    expect(WorldListener.onEntityDied).calledWith(assembly, expect._, 1)
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
    mock.clear(WorldListener)
  })
  test("gui", () => {
    player.opened = nil
    player.opened = entity
    player.opened = nil
    expect(WorldListener.onEntityPossiblyUpdated).calledWith(assembly, entity, 1, nil, 1)
  })
  test("settings copy paste", () => {
    Events.raiseFakeEventNamed("on_entity_settings_pasted", {
      source: entity,
      destination: entity,
      player_index: 1 as PlayerIndex,
    })

    expect(WorldListener.onEntityPossiblyUpdated).calledWith(assembly, entity, 1, nil, 1)
  })

  test("rotate", () => {
    const oldDirection = entity.direction
    entity.rotate({ by_player: 1 as PlayerIndex })
    expect(WorldListener.onEntityRotated).calledWith(assembly, entity, 1, oldDirection, 1)
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
  mock.clear(WorldListener)
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
  expect(newEntity).to.be.any()

  expect(entity.valid).to.be(false)
  expect(WorldListener.onEntityPossiblyUpdated).calledWith(assembly, newEntity, 1, expect._, 1)
})

test("fast replace an underground runs onEntityPossiblyUpdate on both", () => {
  const u1 = surface.create_entity({
    name: "underground-belt",
    direction: direction.east,
    type: "input",
    position: pos,
    force: "player",
  })!
  expect(u1).to.be.any()
  const u2 = surface.create_entity({
    name: "underground-belt",
    direction: direction.east,
    type: "output",
    position: Pos.plus(u1.position, Pos(1, 0)),
    force: "player",
  })!
  expect(u2).to.be.any()
  const pos1 = u1.position
  const pos2 = u2.position

  player.cursor_stack!.set_stack("fast-underground-belt")

  player.build_from_cursor({
    position: pos1,
    direction: direction.east,
  })

  const newU1 = surface.find_entity("fast-underground-belt", pos1)!
  expect(newU1).to.be.any()
  const newU2 = surface.find_entity("fast-underground-belt", pos2)!
  expect(newU2).to.be.any()

  expect(WorldListener.onEntityCreated).not.called()
  expect(WorldListener.onEntityDeleted).not.called()

  expect(WorldListener.onEntityPossiblyUpdated).calledWith(assembly, newU1, 1, expect._, 1)
  expect(WorldListener.onEntityPossiblyUpdated).calledWith(assembly, newU2, 1, expect._, 1)
  expectedNumCalls = 2
})

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
    mock.clear(WorldListener)
  })

  test("marked for upgrade", () => {
    entity.order_upgrade({
      force: "player",
      target: "fast-inserter",
    })
    expect(WorldListener.onEntityMarkedForUpgrade).calledWith(assembly, entity, 1, nil)
  })
  test("marked to rotate", () => {
    entity.order_upgrade({
      force: "player",
      target: "inserter",
      direction: defines.direction.east,
    })
    expect(WorldListener.onEntityMarkedForUpgrade).calledWith(assembly, entity, 1, nil)
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
    expect(WorldListener.onEntityPossiblyUpdated).calledWith(assembly, newEntity, 1, oldDirection, 1)
    expect(WorldListener.onEntityDeleted).not.called()
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
    ghosts.forEach((x) => reviveGhost(x))
    const roboport = surface.find_entities_filtered({
      type: "roboport",
      limit: 1,
    })[0]
    expect(roboport).to.be.any()
    roboport.insert("construction-robot")
    const storageChest = surface.find_entities_filtered({
      name: "logistic-chest-storage",
      limit: 1,
    })[0]
    expect(storageChest).to.be.any()
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
    after_ticks(120, () => {
      const chest = surface.find_entities_filtered({
        name: "iron-chest",
        limit: 1,
      })[0]
      expect(chest).to.be.any()
      expect(WorldListener.onEntityCreated).calledWith(assembly, chest, 1, nil)
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
    after_ticks(120, () => {
      expect(WorldListener.onEntityDeleted).calledWith(assembly, expect._, 1, nil)
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
    expect(WorldListener.onCleanupToolUsed).calledWith(assembly, entity, 1)
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
    expect(WorldListener.onCleanupToolUsed).calledWith(assembly, entity, 1)
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
    expect(WorldListener.onEntityForceDeleteUsed).calledWith(assembly, entity)
  })
})

describe("move to this stage", () => {
  function testOnEntity(entity: LuaEntity | nil): void {
    expect(entity).not.toBeNil()
    player.selected = entity
    expect(player.selected).to.equal(entity)
    Events.raiseFakeEvent(CustomInputs.MoveToThisStage, {
      player_index: player.index,
      input_name: CustomInputs.MoveToThisStage,
      cursor_position: player.position,
    })
    expect(WorldListener.onMoveEntityToStageCustomInput).calledWith(assembly, entity!, 1, 1)
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

describe("stage move tool", () => {
  test("send to stage", () => {
    const entity = surface.create_entity({
      name: "inserter",
      position: pos,
      force: "player",
    })!
    expect(entity).to.be.any()
    player.cursor_stack!.set_stack(Prototypes.StageMoveTool)
    getAssemblyPlayerData(player.index, assembly)!.moveTargetStage = 2
    Events.raiseFakeEventNamed("on_player_selected_area", {
      player_index: 1 as PlayerIndex,
      item: Prototypes.StageMoveTool,
      surface,
      area: BBox.around(pos, 10),
      entities: [entity],
      tiles: [],
    })
    expect(WorldListener.onSendToStageUsed).calledWith(assembly, entity, 1, 2, 1)
  })
  test("bring to this stage (alt)", () => {
    const entity = surface.create_entity({
      name: "inserter",
      position: pos,
      force: "player",
    })!
    expect(entity).to.be.any()
    player.cursor_stack!.set_stack(Prototypes.StageMoveTool)
    Events.raiseFakeEventNamed("on_player_alt_selected_area", {
      player_index: 1 as PlayerIndex,
      item: Prototypes.StageMoveTool,
      surface,
      area: BBox.around(pos, 10),
      entities: [entity],
      tiles: [],
    })
    expect(WorldListener.onBringToStageUsed).calledWith(assembly, entity, 1, 1)
  })
  test("bring to this stage (reverse)", () => {
    const entity = surface.create_entity({
      name: "inserter",
      position: pos,
      force: "player",
    })!
    expect(entity).to.be.any()
    player.cursor_stack!.set_stack(Prototypes.StageMoveTool)
    Events.raiseFakeEventNamed("on_player_reverse_selected_area", {
      player_index: 1 as PlayerIndex,
      item: Prototypes.StageMoveTool,
      surface,
      area: BBox.around(pos, 10),
      entities: [entity],
      tiles: [],
    })
    expect(WorldListener.onBringToStageUsed).calledWith(assembly, entity, 1, 1)
  })

  test("filtered stage move tool, send to stage", () => {
    // requires instant deconstruction to be FALSE
    const entity = surface.create_entity({
      name: "inserter",
      position: pos,
      force: "player",
    })!
    expect(entity).to.be.any()
    player.cursor_stack!.set_stack(Prototypes.FilteredStageMoveTool)
    getAssemblyPlayerData(player.index, assembly)!.moveTargetStage = 2
    Events.raiseFakeEventNamed("on_marked_for_deconstruction", {
      entity,
      player_index: player.index,
    })

    expect(WorldListener.onSendToStageUsed).calledWith(assembly, entity, 1, 2, 1)
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
    expect(underground).to.be.any()
    expect(underground.position).to.equal(pos)
    const ghosts = surface.find_entities_filtered({
      type: "entity-ghost",
      limit: 1,
    })[0]
    expect(ghosts).to.be.nil()

    expect(WorldListener.onEntityCreated).calledWith(assembly, underground, 1, 1)
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
    expect(undergroundGhost?.valid).to.be.falsy()
    const underground = surface.find_entities_filtered({
      name: "underground-belt",
      limit: 1,
    })[0]
    expect(underground).to.be.any()
    expect(underground.position).to.equal(pos)
    expect(WorldListener.onEntityCreated).calledWith(assembly, underground, 1, nil)
  })
})

describe("blueprint paste", () => {
  // note: this currently relies on editor mode, instant blueprint paste enabled
  const pos: PositionClass = Pos(4.5, 0.5)
  const bpEntity: BlueprintEntity = {
    entity_number: 1,
    name: "inserter",
    position: Pos(0.5, 0.5),
    direction: direction.west,
  }
  function setBlueprint(): void {
    const cursor = player.cursor_stack!
    cursor.clear()
    cursor.set_stack("blueprint")
    cursor.set_blueprint_entities([bpEntity])
  }
  before_each(setBlueprint)
  function assertCorrect(entity: LuaEntity, position: Position = pos, bpValue = bpEntity): void {
    expect(entity).to.be.any()
    expect(entity.position).to.equal(position)

    expect(WorldListener.onEntityPossiblyUpdated).calledWith(assembly, entity, 1, expect._, 1, bpValue)
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
    expectedNumCalls = 0
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
    const bpEntity1 = entities[0] as Mutable<BlueprintEntity>
    const bpEntity2: BlueprintEntity = {
      ...bpEntity1,
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
    bpEntity1.connections = {
      "1": {
        red: [{ entity_id: 2 }],
      },
    }
    player.cursor_stack!.set_blueprint_entities([bpEntity1, bpEntity2])

    const inserter1 = surface.create_entity({
      name: "inserter",
      position: pos,
      force: "player",
      direction: direction.west,
    })!

    WorldListener.onEntityPossiblyUpdated.returns(alreadyPresent ? nil : false)
    player.build_from_cursor({ position: pos })

    const inserter2 = surface.find_entities_filtered({
      name: "inserter",
      direction: direction.east,
      limit: 1,
    })[0]
    expect(inserter2).to.be.any()

    assertCorrect(inserter1, nil, bpEntity1)
    assertCorrect(inserter2, pos.plus(Pos(1, 0)), bpEntity2)
    if (alreadyPresent) {
      expect(WorldListener.onCircuitWiresPossiblyUpdated).calledWith(assembly, inserter1, 1, 1)
      expect(WorldListener.onCircuitWiresPossiblyUpdated).calledWith(assembly, inserter2, 1, 1)
      expectedNumCalls = 4
    } else {
      expect(WorldListener.onCircuitWiresPossiblyUpdated).not.called()
      expectedNumCalls = 2
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

    WorldListener.onEntityPossiblyUpdated.returns(alreadyPresent ? nil : false)
    player.build_from_cursor({ position: pos })

    const pole2 = surface.find_entity("small-electric-pole", pos.plus(Pos(1, 0)))!
    expect(pole2).to.be.any()

    assertCorrect(pole1, nil, entity1)
    assertCorrect(pole2, pos.plus(Pos(1, 0)), entity2)
    if (alreadyPresent) {
      expect(WorldListener.onCircuitWiresPossiblyUpdated).calledWith(assembly, pole1, 1, 1)
      expect(WorldListener.onCircuitWiresPossiblyUpdated).calledWith(assembly, pole2, 1, 1)
      expectedNumCalls = 4
    } else {
      expect(WorldListener.onCircuitWiresPossiblyUpdated).not.called()
      expectedNumCalls = 2
    }
  })
})

// picker dollies only tested up to WorldUpdater

test("Q-building", () => {
  // this is technically a bug in the base game, but we are supporting it anyway
  player.cursor_stack!.set_stack("transport-belt")
  Events.raiseFakeEventNamed("on_pre_build", {
    player_index: player.index,
    position: Pos(0, 0),
    shift_build: false,
    direction: 0,
    created_by_moving: false,
    flip_vertical: false,
    flip_horizontal: false,
  })
  Events.raiseFakeEventNamed("on_player_cursor_stack_changed", {
    player_index: player.index,
  })
  expectedNumCalls = 0
  _assertInValidState()
})

describe("belt dragging", () => {
  function fakeNoopDrag(belt: LuaEntity): void {
    Events.raiseFakeEventNamed("on_pre_build", {
      player_index: player.index,
      position: belt.position,
      created_by_moving: true,
      direction: belt.direction,
      shift_build: false,
      flip_vertical: false,
      flip_horizontal: false,
    })
  }
  test("building over existing belt does not call anything", () => {
    const belt = surface.create_entity({
      name: "transport-belt",
      position: pos,
      force: "player",
    })!
    player.cursor_stack!.set_stack("transport-belt")
    const pos2 = Pos.plus(belt.position, Pos(0, 1))

    fakeNoopDrag(belt)

    expect(WorldListener.onEntityPossiblyUpdated).not.called()
    expect(WorldListener.onCircuitWiresPossiblyUpdated).not.called()
    expect(WorldListener.onEntityCreated).not.called()

    player.build_from_cursor({ position: pos2, direction: belt.direction })
    const newBelt = surface.find_entity("transport-belt", pos2)!
    expect(newBelt).to.be.any()

    expect(WorldListener.onEntityCreated).calledWith(assembly, newBelt, 1, 1)
  })

  test("build in different direction calls onEntityPossiblyUpdated", () => {
    const belt = surface.create_entity({
      name: "transport-belt",
      position: pos,
      force: "player",
    })!
    expect(belt).to.be.any()
    player.cursor_stack!.set_stack("transport-belt")

    player.build_from_cursor({ position: pos, direction: direction.east })
    const newBelt = surface.find_entity("transport-belt", pos)!
    expect(newBelt).to.be.any()

    expect(WorldListener.onEntityPossiblyUpdated).calledWith(assembly, newBelt, 1, 0, 1)
  })

  test("drag over existing followed by mine", () => {
    const belt = surface.create_entity({
      name: "transport-belt",
      position: pos,
      force: "player",
    })!
    player.cursor_stack!.set_stack("transport-belt")

    fakeNoopDrag(belt)
    player.mine_entity(belt)

    expect(WorldListener.onEntityPossiblyUpdated).not.called()
    expect(WorldListener.onCircuitWiresPossiblyUpdated).not.called()
    expect(WorldListener.onEntityCreated).not.called()
    expect(WorldListener.onEntityDeleted).calledWith(assembly, expect._, 1, 1)
  })

  test("drag over existing followed by fast replace on same belt", () => {
    const belt = surface.create_entity({
      name: "transport-belt",
      position: pos,
      force: "player",
    })!
    const pos1 = belt.position
    player.cursor_stack!.set_stack("transport-belt")
    fakeNoopDrag(belt)
    player.cursor_stack!.set_stack("fast-transport-belt")
    player.build_from_cursor({ position: pos1, direction: belt.direction })
    const newBelt = surface.find_entity("fast-transport-belt", pos1)!
    expect(newBelt).to.be.any()

    expect(WorldListener.onEntityDeleted).not.called()
    expect(WorldListener.onEntityCreated).not.called()
    expect(WorldListener.onEntityPossiblyUpdated).calledWith(assembly, newBelt, 1, expect._, 1)
  })

  test("drag over existing followed by fast replace on different belt", () => {
    const belt = surface.create_entity({
      name: "transport-belt",
      position: pos,
      force: "player",
    })!
    const pos1 = belt.position
    const pos2 = Pos.plus(pos1, Pos(0, 1))
    surface.create_entity({
      name: "fast-transport-belt",
      position: pos2,
      force: "player",
    })
    player.cursor_stack!.set_stack("transport-belt")
    fakeNoopDrag(belt)
    player.build_from_cursor({ position: pos2, direction: belt.direction })
    const newBelt = surface.find_entity("transport-belt", pos2)!

    expect(WorldListener.onEntityDeleted).not.called()
    expect(WorldListener.onEntityCreated).not.called()
    expect(WorldListener.onEntityPossiblyUpdated).calledWith(assembly, newBelt, 1, expect._, 1)
  })

  test("fast replacing with underground belt", () => {
    for (const i of $range(1, 5)) {
      surface.create_entity({
        name: "transport-belt",
        position: Pos(0, i),
        force: "player",
      })
    }
    const u1 = surface.create_entity({
      name: "underground-belt",
      position: Pos(0.5, 0.5),
      direction: defines.direction.north,
      type: "output",
      force: "player",
      fast_replace: true,
    })
    expect(u1).to.be.any()
    player.cursor_stack!.set_stack("underground-belt")
    // build at 5th belt
    player.build_from_cursor({ position: Pos(0.5, 5.5), direction: defines.direction.north })

    const underground = surface.find_entity("underground-belt", Pos(0.5, 5.5))!

    expect(WorldListener.onEntityPossiblyUpdated).not.called()
    expect(WorldListener.onEntityCreated).calledWith(assembly, underground, 1, 1)
    expect(WorldListener.onEntityDeleted).calledTimes(5)
    expectedNumCalls = 6
  })

  function fakeUndergroundDrag(u1: LuaEntity, direction: defines.direction) {
    Events.raiseFakeEventNamed("on_pre_build", {
      player_index: player.index,
      position: u1.position,
      created_by_moving: true,
      direction,
      shift_build: false,
      flip_vertical: false,
      flip_horizontal: false,
    })
  }
  describe("rotate underground by dragging calls onUndergroundBeltDragRotated", () => {
    let belt: LuaEntity
    let u1: LuaEntity

    before_each(() => {
      belt = surface.create_entity({
        name: "transport-belt",
        position: Pos(0, 0.5),
        force: "player",
      })!
      expect(belt).to.be.any()

      u1 = surface.create_entity({
        name: "underground-belt",
        position: Pos(0.5, 1.5),
        direction: defines.direction.south,
        type: "output",
        force: "player",
      })!
      expect(u1).to.be.any()
      player.cursor_stack!.set_stack("transport-belt")
    })

    test("can rotate underground by dragging", () => {
      fakeNoopDrag(belt)
      fakeUndergroundDrag(u1, belt.direction)

      expect(WorldListener.onUndergroundBeltDragRotated).calledWith(assembly, u1, 1, 1)
    })

    test("does not count if wrong direction", () => {
      fakeNoopDrag(belt)
      fakeUndergroundDrag(u1, oppositedirection(belt.direction))

      expect(WorldListener.onUndergroundBeltDragRotated).not.called()
      expectedNumCalls = 0
    })
    test("does not count if replaced", () => {
      const position = u1.position
      player.build_from_cursor({
        position,
        direction: u1.direction,
      })
      expect(WorldListener.onUndergroundBeltDragRotated).not.called()
      expect(WorldListener.onEntityDeleted).calledWith(assembly, expect._, 1, 1)
      const newBelt = surface.find_entity("transport-belt", position)!
      expect(WorldListener.onEntityCreated).calledWith(assembly, newBelt, 1, 1)
      expectedNumCalls = 2
    })
    test("does not count if replaced sideways", () => {
      const position = u1.position
      player.build_from_cursor({
        position,
        direction: belt.direction + 2,
      })
      expect(WorldListener.onUndergroundBeltDragRotated).not.called()
      expect(WorldListener.onEntityDeleted).calledWith(assembly, expect._, 1, 1)
      const newBelt = surface.find_entity("transport-belt", position)!
      expect(WorldListener.onEntityCreated).calledWith(assembly, newBelt, 1, 1)
      expectedNumCalls = 2
    })
  })
})
