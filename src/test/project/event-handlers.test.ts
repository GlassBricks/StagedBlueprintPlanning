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

import { BlueprintEntity, CustomEventId, LuaEntity, LuaPlayer, LuaSurface, PlayerIndex } from "factorio:runtime"
import expect, { mock } from "tstl-expect"
import { oppositedirection } from "util"
import { CustomInputs, Prototypes } from "../../constants"
import * as _createBpWithStageInfo from "../../copy-paste/create-blueprint-with-stage-info"
import { BobInserterChangedPositionEvent, DollyMovedEntityEvent } from "../../declarations/mods"
import { getTempBpItemStack } from "../../entity/save-load"
import { Events, Mutable } from "../../lib"
import { BBox, Pos, Position, PositionClass } from "../../lib/geometry"
import { _assertInValidState } from "../../project/event-handlers"
import { getProjectPlayerData } from "../../project/player-project-data"
import { ProjectActions } from "../../project/project-actions"
import { UserProject } from "../../project/ProjectDef"
import { _simulateUndo, UndoHandler } from "../../project/undo"
import { _deleteAllProjects, createUserProject } from "../../project/UserProject"
import { fStub } from "../f-mock"
import { moduleMock } from "../module-mock"
import { reviveGhost } from "../reviveGhost"
import direction = defines.direction

let project: UserProject & {
  actions: mock.MockedObjectNoSelf<ProjectActions>
}
const CreateBpWithStageInfo = moduleMock(_createBpWithStageInfo, false)
let surface: LuaSurface
let player: LuaPlayer
const pos = Pos(0.5, 0.5)

before_all(() => {
  player = game.players[1]

  project = createUserProject("Test", 2) as any
  fStub(project.actions)
  surface = project.getStage(1)!.surface

  player.teleport(pos, surface)
})
before_each(() => {
  mock.clear(project.actions)
})
after_all(() => {
  _deleteAllProjects()
})

let expectedNumCalls = 1
before_each(() => {
  expectedNumCalls = 1
  surface.find_entities().forEach((e) => e.destroy())
  project.actions.onEntityPossiblyUpdated.returns({} as any)
})
after_each(() => {
  _assertInValidState()
  player?.cursor_stack?.clear()

  let totalCalls = 0
  const calls = new LuaMap<string, number>()
  for (const [key, value] of pairs(project.actions)) {
    if (!mock.isMock(value)) continue
    totalCalls += value.calls.length
    calls.set(key, value.calls.length)
  }
  for (const [key, value] of pairs(CreateBpWithStageInfo)) {
    if (!mock.isMock(value)) continue
    totalCalls += value.calls.length
    calls.set(key, value.calls.length)
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

let undoFn: (name: string) => void
before_each(() => {
  undoFn = mock.fnNoSelf()
})
const TestUndo = UndoHandler("event listener test undo", (_, data: string) => undoFn(data))

describe("add", () => {
  test("player built entity", () => {
    project.actions.onEntityCreated.invokes(
      (_a, _b, byPlayer) => byPlayer && TestUndo.createAction(byPlayer, "overbuild preview"),
    )
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
    expect(entity).toBeAny()
    expect(project.actions.onEntityCreated).toHaveBeenCalledWith(entity, 1, 1)

    after_ticks(1, () => {
      _simulateUndo(player)
      expect(undoFn).toHaveBeenCalledWith("overbuild preview")
    })
  })

  test("script raise built", () => {
    const entity = surface.create_entity({
      name: "iron-chest",
      position: pos,
      raise_built: true,
    })!
    expect(entity).toBeAny()
    expect(project.actions.onEntityCreated).toHaveBeenCalledWith(entity, 1, nil)
  })
  test("does not run create if raised by this mod", () => {
    const entity = surface.create_entity({
      name: "iron-chest",
      position: pos,
      raise_built: false,
    })!
    script.raise_script_built({ entity })
    expect(project.actions.onEntityCreated).not.toHaveBeenCalled()
    expectedNumCalls = 0
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
    mock.clear(project.actions)
  })
  test("player mined entity", () => {
    player.mine_entity(entity, true)
    expect(project.actions.onEntityDeleted).toHaveBeenCalledWith(expect._, 1, 1)
  })
  test("script raised destroy", () => {
    // entity.destroy({ raise_destroy: true })
    Events.raiseFakeEventNamed("script_raised_destroy", { entity })
    expect(project.actions.onEntityDeleted).toHaveBeenCalledWith(expect._, 1, nil)
  })
  test("does not run delete if raised by this mod", () => {
    script.raise_script_destroy({ entity })
    expect(project.actions.onEntityDeleted).not.toHaveBeenCalled()
    expectedNumCalls = 0
  })
  test("die", () => {
    entity.die()
    expect(project.actions.onEntityDied).toHaveBeenCalledWith(expect._, 1)
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
    mock.clear(project.actions)
  })
  test("gui", () => {
    player.opened = nil
    player.opened = entity
    player.opened = nil
    expect(project.actions.onEntityPossiblyUpdated).toHaveBeenCalledWith(entity, 1, nil, 1)
  })
  test("settings copy paste", () => {
    Events.raiseFakeEventNamed("on_entity_settings_pasted", {
      source: entity,
      destination: entity,
      player_index: 1 as PlayerIndex,
    })

    expect(project.actions.onEntityPossiblyUpdated).toHaveBeenCalledWith(entity, 1, nil, 1)
  })

  test("rotate", () => {
    const oldDirection = entity.direction
    entity.rotate({ by_player: 1 as PlayerIndex })
    expect(project.actions.onEntityRotated).toHaveBeenCalledWith(entity, 1, oldDirection, 1)
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
  mock.clear(project.actions)
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
  expect(newEntity).toBeAny()

  expect(entity.valid).toBe(false)
  expect(project.actions.onEntityPossiblyUpdated).toHaveBeenCalledWith(newEntity, 1, expect._, 1)
})

test("fast replace an underground runs onEntityPossiblyUpdate on both", () => {
  const u1 = surface.create_entity({
    name: "underground-belt",
    direction: direction.east,
    type: "input",
    position: pos,
    force: "player",
  })!
  expect(u1).toBeAny()
  const u2 = surface.create_entity({
    name: "underground-belt",
    direction: direction.east,
    type: "output",
    position: Pos.plus(u1.position, Pos(1, 0)),
    force: "player",
  })!
  expect(u2).toBeAny()
  const pos1 = u1.position
  const pos2 = u2.position

  player.cursor_stack!.set_stack("fast-underground-belt")

  player.build_from_cursor({
    position: pos1,
    direction: direction.east,
  })

  const newU1 = surface.find_entity("fast-underground-belt", pos1)!
  expect(newU1).toBeAny()
  const newU2 = surface.find_entity("fast-underground-belt", pos2)!
  expect(newU2).toBeAny()

  expect(project.actions.onEntityCreated).not.toHaveBeenCalled()
  expect(project.actions.onEntityDeleted).not.toHaveBeenCalled()

  expect(project.actions.onEntityPossiblyUpdated).toHaveBeenCalledWith(newU1, 1, expect._, 1)
  expect(project.actions.onEntityPossiblyUpdated).toHaveBeenCalledWith(newU2, 1, expect._, 1)
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
    mock.clear(project.actions)
  })

  test("marked for upgrade", () => {
    entity.order_upgrade({
      force: "player",
      target: "fast-inserter",
    })
    expect(project.actions.onEntityMarkedForUpgrade).toHaveBeenCalledWith(entity, 1, nil)
  })
  test("marked to rotate", () => {
    entity.order_upgrade({
      force: "player",
      target: "inserter",
      direction: defines.direction.east,
    })
    expect(project.actions.onEntityMarkedForUpgrade).toHaveBeenCalledWith(entity, 1, nil)
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
    expect(project.actions.onEntityPossiblyUpdated).toHaveBeenCalledWith(newEntity, 1, oldDirection, 1)
    expect(project.actions.onEntityDeleted).not.toHaveBeenCalled()
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
    expect(roboport).toBeAny()
    roboport.insert("construction-robot")
    const storageChest = surface.find_entities_filtered({
      name: "logistic-chest-storage",
      limit: 1,
    })[0]
    expect(storageChest).toBeAny()
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
      expect(chest).toBeAny()
      expect(project.actions.onEntityCreated).toHaveBeenCalledWith(chest, 1, nil)
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
      expect(project.actions.onEntityDeleted).toHaveBeenCalledWith(expect._, 1, nil)
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
    expect(project.actions.onCleanupToolUsed).toHaveBeenCalledWith(entity, 1)
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
    expect(project.actions.onCleanupToolUsed).toHaveBeenCalledWith(entity, 1)
  })
  test("force delete", () => {
    const entity = surface.create_entity({
      name: "iron-chest",
      position: pos,
      force: "player",
    })!
    project.actions.onEntityForceDeleteUsed.invokes(() => TestUndo.createAction(player.index, "force delete"))
    Events.raiseFakeEventNamed("on_player_reverse_selected_area", {
      player_index: 1 as PlayerIndex,
      item: Prototypes.CleanupTool,
      surface,
      area: BBox.around(pos, 10),
      entities: [entity],
      tiles: [],
    })
    expect(project.actions.onEntityForceDeleteUsed).toHaveBeenCalledWith(entity, 1, 1)

    _simulateUndo(player)
    expect(undoFn).toHaveBeenCalledWith("force delete")
  })
})

describe("move to this stage", () => {
  before_each(() => {
    project.actions.onMoveEntityToStageCustomInput.invokes(() =>
      TestUndo.createAction(player.index, "move to this stage"),
    )
  })
  function testOnEntity(entity: LuaEntity | nil): void {
    expect(entity).not.toBeNil()
    player.selected = entity
    expect(player.selected).toEqual(entity)
    Events.raiseFakeEvent(CustomInputs.MoveToThisStage, {
      player_index: player.index,
      cursor_position: player.position,
    })
    expect(project.actions.onMoveEntityToStageCustomInput).toHaveBeenCalledWith(entity!, 1, 1)

    _simulateUndo(player)
    expect(undoFn).toHaveBeenCalledWith("move to this stage")
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

test("force delete custom input", () => {
  const entity = surface.create_entity({
    name: "inserter",
    position: pos,
    force: "player",
  })
  expect(entity).toBeAny()
  player.selected = entity
  Events.raiseFakeEvent(CustomInputs.ForceDelete, {
    player_index: player.index,
    cursor_position: player.position,
  })
  project.actions.onEntityForceDeleteUsed.invokes(() => TestUndo.createAction(player.index, "force delete"))
  expect(project.actions.onEntityForceDeleteUsed).toHaveBeenCalledWith(entity!, 1, 1)

  _simulateUndo(player)
  expect(undoFn).toHaveBeenCalledWith("force delete")
})

describe("stage move tool", () => {
  before_each(() => {
    let i = 1
    project.actions.onSendToStageUsed.invokes(() => TestUndo.createAction(player.index, "send to stage " + i++))
    project.actions.onBringToStageUsed.invokes(() => TestUndo.createAction(player.index, "bring to stage " + i++))
    project.actions.onBringDownToStageUsed.invokes(() =>
      TestUndo.createAction(player.index, "bring down to stage " + i++),
    )
  })
  let entity: LuaEntity
  let entity2: LuaEntity
  before_each(() => {
    entity = surface.create_entity({ name: "inserter", position: pos, force: "player" })!
    expect(entity).toBeAny()
    entity2 = surface.create_entity({ name: "inserter", position: pos.plus(Pos(1, 0)), force: "player" })!
    expect(entity2).toBeAny()
  })
  test("send to stage", () => {
    player.cursor_stack!.set_stack(Prototypes.StageMoveTool)
    getProjectPlayerData(player.index, project)!.moveTargetStage = 2

    Events.raiseFakeEventNamed("on_player_selected_area", {
      player_index: 1 as PlayerIndex,
      item: Prototypes.StageMoveTool,
      surface,
      area: BBox.around(pos, 10),
      entities: [entity, entity2],
      tiles: [],
    })
    expect(project.actions.onSendToStageUsed).toHaveBeenCalledWith(entity, 1, 2, 1)
    expect(project.actions.onSendToStageUsed).toHaveBeenCalledWith(entity2, 1, 2, 1)

    _simulateUndo(player)
    expect(undoFn).toHaveBeenCalledWith("send to stage 1")
    expect(undoFn).toHaveBeenCalledWith("send to stage 2")

    expectedNumCalls = 2
  })
  test("bring to this stage (alt)", () => {
    player.cursor_stack!.set_stack(Prototypes.StageMoveTool)
    Events.raiseFakeEventNamed("on_player_alt_selected_area", {
      player_index: 1 as PlayerIndex,
      item: Prototypes.StageMoveTool,
      surface,
      area: BBox.around(pos, 10),
      entities: [entity, entity2],
      tiles: [],
    })

    expect(project.actions.onBringToStageUsed).toHaveBeenCalledWith(entity, 1, 1)

    _simulateUndo(player)
    expect(undoFn).toHaveBeenCalledWith("bring to stage 1")
    expect(undoFn).toHaveBeenCalledWith("bring to stage 2")
    expectedNumCalls = 2
  })
  test("bring to this stage (reverse)", () => {
    player.cursor_stack!.set_stack(Prototypes.StageMoveTool)
    Events.raiseFakeEventNamed("on_player_reverse_selected_area", {
      player_index: 1 as PlayerIndex,
      item: Prototypes.StageMoveTool,
      surface,
      area: BBox.around(pos, 10),
      entities: [entity, entity2],
      tiles: [],
    })
    expect(project.actions.onBringToStageUsed).toHaveBeenCalledWith(entity, 1, 1)

    _simulateUndo(player)
    expect(undoFn).toHaveBeenCalledWith("bring to stage 1")
    expect(undoFn).toHaveBeenCalledWith("bring to stage 2")
    expectedNumCalls = 2
  })

  test("bring down to this stage (alt reverse)", () => {
    player.cursor_stack!.set_stack(Prototypes.StageMoveTool)
    Events.raiseFakeEventNamed("on_player_alt_reverse_selected_area", {
      player_index: 1 as PlayerIndex,
      item: Prototypes.StageMoveTool,
      surface,
      area: BBox.around(pos, 10),
      entities: [entity, entity2],
      tiles: [],
    })

    expect(project.actions.onBringDownToStageUsed).toHaveBeenCalledWith(entity, 1, 1)

    _simulateUndo(player)
    expect(undoFn).toHaveBeenCalledWith("bring down to stage 1")
    expect(undoFn).toHaveBeenCalledWith("bring down to stage 2")
    expectedNumCalls = 2
  })

  test("filtered stage move tool, send to stage", () => {
    // requires instant deconstruction to be FALSE
    player.cursor_stack!.set_stack(Prototypes.FilteredStageMoveTool)
    getProjectPlayerData(player.index, project)!.moveTargetStage = 2
    Events.raiseFakeEventNamed("on_marked_for_deconstruction", { entity, player_index: player.index })
    Events.raiseFakeEventNamed("on_marked_for_deconstruction", { entity: entity2, player_index: player.index })
    Events.raiseFakeEventNamed("on_player_deconstructed_area", {
      player_index: player.index,
      surface,
      area: BBox.around(pos, 10),
      item: Prototypes.FilteredStageMoveTool,
      alt: false,
    })

    expect(project.actions.onSendToStageUsed).toHaveBeenCalledWith(entity, 1, 2, 1)

    _simulateUndo(player)

    expect(undoFn).toHaveBeenCalledWith("send to stage 1")
    expect(undoFn).toHaveBeenCalledWith("send to stage 2")

    expectedNumCalls = 2
  })
})

describe("staged copy, delete, cut", () => {
  let entity: LuaEntity
  before_each(() => {
    // copy followed by delete
    entity = surface.create_entity({
      name: "inserter",
      position: pos,
      force: "player",
    })!
    expect(entity).toBeAny()
  })
  test("staged copy", () => {
    Events.raiseFakeEventNamed("on_player_selected_area", {
      surface,
      area: BBox.around(pos, 10),
      entities: [],
      tiles: [],
      item: Prototypes.StagedCopyTool,
      player_index: player.index,
    })

    expect(CreateBpWithStageInfo.createBlueprintWithStageInfo).toHaveBeenCalledWith(
      player,
      project.getStage(1)!,
      BBox.around(pos, 10),
    )
    expect(player.is_cursor_blueprint()).toBe(true)
    const entities = player.get_blueprint_entities()!
    expect(entities).toHaveLength(1)
    expect(entities[0].name).toBe("inserter")

    expect(player.blueprint_to_setup.is_blueprint).toBe(false)
  })
  test("staged copy, alt select", () => {
    Events.raiseFakeEventNamed("on_player_alt_selected_area", {
      surface,
      area: BBox.around(pos, 10),
      entities: [],
      tiles: [],
      item: Prototypes.StagedCopyTool,
      player_index: player.index,
    })
    expect(CreateBpWithStageInfo.createBlueprintWithStageInfo).toHaveBeenCalledWith(
      player,
      project.getStage(1)!,
      BBox.around(pos, 10),
    )

    expect(player.cursor_stack?.valid_for_read).toBe(false)

    player.opened = nil

    expect(player.is_cursor_blueprint()).toBe(true)
    const entities = player.get_blueprint_entities()!
    expect(entities).toHaveLength(1)
    expect(entities[0].name).toBe("inserter")
  })

  test("force delete", () => {
    Events.raiseFakeEventNamed("on_player_selected_area", {
      surface,
      area: BBox.around(pos, 10),
      entities: [entity],
      tiles: [],
      item: Prototypes.ForceDeleteTool,
      player_index: player.index,
    })
    project.actions.onEntityForceDeleteUsed.invokes(() => TestUndo.createAction(player.index, "force delete"))
    expect(project.actions.onEntityForceDeleteUsed).toHaveBeenCalledWith(entity, 1, 1)

    _simulateUndo(player)
    expect(undoFn).toHaveBeenCalledWith("force delete")
  })

  test("staged cut", () => {
    Events.raiseFakeEventNamed("on_player_selected_area", {
      surface,
      area: BBox.around(pos, 10),
      entities: [entity],
      tiles: [],
      item: Prototypes.StagedCutTool,
      player_index: player.index,
    })

    expect(CreateBpWithStageInfo.createBlueprintWithStageInfo).toHaveBeenCalledWith(
      player,
      project.getStage(1)!,
      BBox.around(pos, 10),
    )

    project.actions.onEntityForceDeleteUsed.invokes(() => TestUndo.createAction(player.index, "force delete"))
    expect(project.actions.onEntityForceDeleteUsed).toHaveBeenCalledWith(entity, 1, 1)

    expect(player.is_cursor_blueprint()).toBe(true)
    const entities = player.get_blueprint_entities()!
    expect(entities).toHaveLength(1)
    expect(entities[0].name).toBe("inserter")

    _simulateUndo(player)
    expect(undoFn).toHaveBeenCalledWith("force delete")

    expectedNumCalls = 2
  })
})

describe("stage delete tool", () => {
  let entity: LuaEntity
  let entity2: LuaEntity
  before_each(() => {
    entity = surface.create_entity({
      name: "inserter",
      position: pos,
      force: "player",
    })!
    expect(entity).toBeAny()
    entity2 = surface.create_entity({ name: "inserter", position: pos.plus(Pos(1, 0)), force: "player" })!
    expect(entity2).toBeAny()

    let i = 1
    project.actions.onStageDeleteUsed.invokes(() => TestUndo.createAction(player.index, "delete " + i++))
    project.actions.onStageDeleteCancelUsed.invokes(() => TestUndo.createAction(player.index, "delete cancel " + i++))
  })
  test("delete", () => {
    player.cursor_stack!.set_stack(Prototypes.StageDeconstructTool)
    Events.raiseFakeEventNamed("on_player_selected_area", {
      player_index: 1 as PlayerIndex,
      item: Prototypes.StageDeconstructTool,
      surface,
      area: BBox.around(pos, 10),
      entities: [entity, entity2],
      tiles: [],
    })
    expect(project.actions.onStageDeleteUsed).toHaveBeenCalledWith(entity, 1, 1)
    expect(project.actions.onStageDeleteUsed).toHaveBeenCalledWith(entity2, 1, 1)
    expectedNumCalls = 2

    _simulateUndo(player)
    expect(undoFn).toHaveBeenCalledWith("delete 1")
    expect(undoFn).toHaveBeenCalledWith("delete 2")
  })
  test("cancel", () => {
    player.cursor_stack!.set_stack(Prototypes.StageDeconstructTool)
    Events.raiseFakeEventNamed("on_player_alt_selected_area", {
      player_index: 1 as PlayerIndex,
      item: Prototypes.StageDeconstructTool,
      surface,
      area: BBox.around(pos, 10),
      entities: [entity, entity2],
      tiles: [],
    })
    expect(project.actions.onStageDeleteCancelUsed).toHaveBeenCalledWith(entity, 1, 1)
    expectedNumCalls = 2

    _simulateUndo(player)
    expect(undoFn).toHaveBeenCalledWith("delete cancel 1")
    expect(undoFn).toHaveBeenCalledWith("delete cancel 2")
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
    override_stack_size: 1,
  }
  function setBlueprint(): void {
    const cursor = player.cursor_stack!
    cursor.clear()
    cursor.set_stack("blueprint")
    cursor.set_blueprint_entities([bpEntity])
  }
  before_each(setBlueprint)
  function assertCorrect(entity: LuaEntity, position: Position = pos, bpValue = bpEntity): void {
    expect(entity).toBeAny()
    expect(entity.position).toEqual(position)

    expect(project.actions.onEntityPossiblyUpdated).toHaveBeenCalledWith(entity, 1, expect._, 1, bpValue)
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

    project.actions.onEntityPossiblyUpdated.returns(alreadyPresent ? ({} as any) : nil)
    player.build_from_cursor({ position: pos })

    const inserter2 = surface.find_entities_filtered({
      name: "inserter",
      direction: direction.east,
      limit: 1,
    })[0]
    expect(inserter2).toBeAny()

    assertCorrect(inserter1, nil, bpEntity1)
    assertCorrect(inserter2, pos.plus(Pos(1, 0)), bpEntity2)
    if (alreadyPresent) {
      expect(project.actions.onWiresPossiblyUpdated).toHaveBeenCalledWith(inserter1, 1, 1)
      expect(project.actions.onWiresPossiblyUpdated).toHaveBeenCalledWith(inserter2, 1, 1)
      expectedNumCalls = 4
    } else {
      expect(project.actions.onWiresPossiblyUpdated).not.toHaveBeenCalled()
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

    project.actions.onEntityPossiblyUpdated.returns(alreadyPresent ? ({} as any) : nil)
    player.build_from_cursor({ position: pos })

    const pole2 = surface.find_entity("small-electric-pole", pos.plus(Pos(1, 0)))!
    expect(pole2).toBeAny()

    assertCorrect(pole1, nil, entity1)
    assertCorrect(pole2, pos.plus(Pos(1, 0)), entity2)
    if (alreadyPresent) {
      expect(project.actions.onWiresPossiblyUpdated).toHaveBeenCalledWith(pole1, 1, 1)
      expect(project.actions.onWiresPossiblyUpdated).toHaveBeenCalledWith(pole2, 1, 1)
      expectedNumCalls = 4
    } else {
      expect(project.actions.onWiresPossiblyUpdated).not.toHaveBeenCalled()
      expectedNumCalls = 2
    }
  })

  function fakeFlippedPaste(pos: Position) {
    // fake the paste event, since no api for it yet
    Events.raiseFakeEventNamed("on_pre_build", {
      player_index: player.index,
      position: pos,
      shift_build: true,
      direction: 0,
      created_by_moving: false,
      flip_vertical: false,
      flip_horizontal: true,
    })

    expect(player.cursor_stack!.cost_to_build).toHaveKey(Prototypes.EntityMarker)

    const entity = player.cursor_stack!.get_blueprint_entities()!.find((e) => e.name == Prototypes.EntityMarker)!

    Events.raiseFakeEventNamed("on_built_entity", {
      player_index: player.index,
      created_entity: surface.create_entity({
        name: entity.name,
        position: pos,
        direction: entity.direction,
      })!,
      stack: player.cursor_stack!,
      tags: entity.tags,
    })
  }

  test("tank has correct direction when not flipped ", () => {
    const entity: BlueprintEntity = {
      entity_number: 1,
      name: "storage-tank",
      position: Pos(0.5, 0.5),
    }
    player.cursor_stack!.set_blueprint_entities([entity])

    const tank = surface.create_entity({
      name: "storage-tank",
      position: Pos(0.5, 0.5),
      force: "player",
      direction: 0,
    })
    expect(tank).toBeAny()

    player.build_from_cursor({ position: Pos(0.5, 0.5) })

    expect(project.actions.onEntityCreated).not.toHaveBeenCalled()
    expect(project.actions.onEntityPossiblyUpdated).toHaveBeenCalledWith(tank, 1, nil, player.index, entity)
  })

  test("tank has correct direction when flipped ", () => {
    const entity: BlueprintEntity = {
      entity_number: 1,
      name: "storage-tank",
      position: Pos(0.5, 0.5),
    }
    player.cursor_stack!.set_blueprint_entities([entity])

    const tank = surface.create_entity({
      name: "storage-tank",
      position: Pos(0.5, 0.5),
      force: "player",
      direction: 2,
    })
    expect(tank).toBeAny()

    fakeFlippedPaste(Pos(0.5, 0.5))

    expect(project.actions.onEntityCreated).not.toHaveBeenCalled()
    expect(project.actions.onEntityPossiblyUpdated).toHaveBeenCalledWith(tank, 1, nil, player.index, entity)
  })

  test("splitter has flipped priorities when flipped", () => {
    const entity: BlueprintEntity = {
      entity_number: 1,
      name: "splitter",
      position: Pos(0, 0.5),
      input_priority: "right",
      output_priority: "left",
    }
    player.cursor_stack!.set_blueprint_entities([entity])

    const splitter = surface.create_entity({
      name: "splitter",
      position: Pos(0, 0.5),
      force: "player",
    })
    expect(splitter).toBeAny()

    fakeFlippedPaste(Pos(0, 0.5))

    expect(project.actions.onEntityCreated).not.toHaveBeenCalled()
    expect(project.actions.onEntityPossiblyUpdated).toHaveBeenCalledWith(splitter, 1, nil, player.index, {
      ...entity,
      input_priority: "left",
      output_priority: "right",
    })
  })

  // some more tricky cases handled in entity-update-integration.test.ts
})

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

    expect(project.actions.onEntityPossiblyUpdated).not.toHaveBeenCalled()
    expect(project.actions.onWiresPossiblyUpdated).not.toHaveBeenCalled()
    expect(project.actions.onEntityCreated).not.toHaveBeenCalled()

    player.build_from_cursor({ position: pos2, direction: belt.direction })
    const newBelt = surface.find_entity("transport-belt", pos2)!
    expect(newBelt).toBeAny()

    expect(project.actions.onEntityCreated).toHaveBeenCalledWith(newBelt, 1, 1)
  })

  test("build in different direction calls onEntityPossiblyUpdated", () => {
    const belt = surface.create_entity({
      name: "transport-belt",
      position: pos,
      force: "player",
    })!
    expect(belt).toBeAny()
    player.cursor_stack!.set_stack("transport-belt")

    player.build_from_cursor({ position: pos, direction: direction.east })
    const newBelt = surface.find_entity("transport-belt", pos)!
    expect(newBelt).toBeAny()

    expect(project.actions.onEntityPossiblyUpdated).toHaveBeenCalledWith(newBelt, 1, 0, 1)
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

    expect(project.actions.onEntityPossiblyUpdated).not.toHaveBeenCalled()
    expect(project.actions.onWiresPossiblyUpdated).not.toHaveBeenCalled()
    expect(project.actions.onEntityCreated).not.toHaveBeenCalled()
    expect(project.actions.onEntityDeleted).toHaveBeenCalledWith(expect._, 1, 1)
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
    expect(newBelt).toBeAny()

    expect(project.actions.onEntityDeleted).not.toHaveBeenCalled()
    expect(project.actions.onEntityCreated).not.toHaveBeenCalled()
    expect(project.actions.onEntityPossiblyUpdated).toHaveBeenCalledWith(newBelt, 1, expect._, 1)
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

    expect(project.actions.onEntityDeleted).not.toHaveBeenCalled()
    expect(project.actions.onEntityCreated).not.toHaveBeenCalled()
    expect(project.actions.onEntityPossiblyUpdated).toHaveBeenCalledWith(newBelt, 1, expect._, 1)
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
    expect(u1).toBeAny()
    player.cursor_stack!.set_stack("underground-belt")
    // build at 5th belt
    player.build_from_cursor({ position: Pos(0.5, 5.5), direction: defines.direction.north })

    const underground = surface.find_entity("underground-belt", Pos(0.5, 5.5))!

    expect(project.actions.onEntityPossiblyUpdated).not.toHaveBeenCalled()
    expect(project.actions.onEntityCreated).toHaveBeenCalledWith(underground, 1, 1)
    expect(project.actions.onEntityDeleted).toHaveBeenCalledTimes(5)
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
      expect(belt).toBeAny()

      u1 = surface.create_entity({
        name: "underground-belt",
        position: Pos(0.5, 1.5),
        direction: defines.direction.south,
        type: "output",
        force: "player",
      })!
      expect(u1).toBeAny()
      player.cursor_stack!.set_stack("transport-belt")
    })

    test("can rotate underground by dragging", () => {
      fakeNoopDrag(belt)
      fakeUndergroundDrag(u1, belt.direction)

      expect(project.actions.onUndergroundBeltDragRotated).toHaveBeenCalledWith(u1, 1, 1)
    })

    test("does not count if wrong direction", () => {
      fakeNoopDrag(belt)
      fakeUndergroundDrag(u1, oppositedirection(belt.direction))

      expect(project.actions.onUndergroundBeltDragRotated).not.toHaveBeenCalled()
      expectedNumCalls = 0
    })
    test("does not count if replaced", () => {
      const position = u1.position
      player.build_from_cursor({
        position,
        direction: u1.direction,
      })
      expect(project.actions.onUndergroundBeltDragRotated).not.toHaveBeenCalled()
      expect(project.actions.onEntityDeleted).toHaveBeenCalledWith(expect._, 1, 1)
      const newBelt = surface.find_entity("transport-belt", position)!
      expect(project.actions.onEntityCreated).toHaveBeenCalledWith(newBelt, 1, 1)
      expectedNumCalls = 2
    })
    test("does not count if replaced sideways", () => {
      const position = u1.position
      player.build_from_cursor({
        position,
        direction: belt.direction + 2,
      })
      expect(project.actions.onUndergroundBeltDragRotated).not.toHaveBeenCalled()
      expect(project.actions.onEntityDeleted).toHaveBeenCalledWith(expect._, 1, 1)
      const newBelt = surface.find_entity("transport-belt", position)!
      expect(project.actions.onEntityCreated).toHaveBeenCalledWith(newBelt, 1, 1)
      expectedNumCalls = 2
    })
  })
})

test("splitter has correct values when not flipped", () => {
  const entity: BlueprintEntity = {
    entity_number: 1,
    name: "splitter",
    position: Pos(0, 0.5),
    input_priority: "right",
    output_priority: "left",
  }
  player.cursor_stack!.set_stack("blueprint")
  player.cursor_stack!.set_blueprint_entities([entity])

  const splitter = surface.create_entity({
    name: "splitter",
    position: Pos(0, 0.5),
    force: "player",
    direction: 0,
  })
  expect(splitter).toBeAny()

  player.build_from_cursor({ position: Pos(0, 0.5) })

  expect(project.actions.onEntityCreated).not.toHaveBeenCalled()
  expect(project.actions.onEntityPossiblyUpdated).toHaveBeenCalledWith(splitter, 1, nil, player.index, entity)
})

// mod support
if (remote.interfaces.PickerDollies && remote.interfaces.PickerDollies.dolly_moved_entity_id) {
  test("when dollied, calls onEntityDollied", () => {
    const eventId = remote.call("PickerDollies", "dolly_moved_entity_id") as CustomEventId<DollyMovedEntityEvent>
    const entity = surface.create_entity({
      name: "iron-chest",
      position: pos,
      force: "player",
    })!

    entity.teleport(Pos(1.5, 0))
    Events.raiseFakeEvent(eventId, {
      player_index: player.index,
      start_pos: pos,
      moved_entity: entity,
    })

    expect(project.actions.onEntityDollied).toHaveBeenCalledWith(entity, 1, pos, 1)
  })
}

if (remote.interfaces.bobinserters && remote.interfaces.bobinserters.get_changed_position_event_id) {
  test("when inserter changed position, calls onEntityPossiblyUpdated", () => {
    const eventId = remote.call(
      "bobinserters",
      "get_changed_position_event_id",
    ) as CustomEventId<BobInserterChangedPositionEvent>
    const entity = surface.create_entity({
      name: "inserter",
      position: pos,
      force: "player",
    })!
    entity.teleport(Pos(1.5, 0))
    Events.raiseFakeEvent(eventId, { entity })

    expect(project.actions.onEntityPossiblyUpdated).toHaveBeenCalledWith(entity, 1, nil, nil, nil)
  })
}
