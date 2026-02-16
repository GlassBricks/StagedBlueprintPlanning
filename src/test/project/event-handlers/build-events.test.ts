import { LuaEntity, PlayerIndex } from "factorio:runtime"
import expect, { mock } from "tstl-expect"
import { oppositedirection } from "util"
import { Events } from "../../../lib"
import { Pos } from "../../../lib/geometry"
import { _simulateUndo } from "../../../project/actions/undo"
import { pos, setupEventHandlerTests } from "./_test-setup"
import direction = defines.direction

const ctx = setupEventHandlerTests()

describe("add", () => {
  test("player built entity", () => {
    const player = ctx.getPlayer()
    const surface = ctx.getSurface()
    ctx
      .getProject()
      .actions.onEntityCreated.invokes((_a, _b, byPlayer) =>
        byPlayer != nil ? ctx.TestUndo.createAction({ value: "overbuild preview" }) : nil,
      )
    player.cursor_stack!.set_stack("iron-chest")
    player.build_from_cursor({ position: pos })

    player.cursor_stack!.clear()
    const entity = surface.find_entities_filtered({
      position: pos,
      radius: 1,
      limit: 1,
      name: "iron-chest",
    })[0]
    expect(entity).toBeAny()
    expect(ctx.getProject().actions.onEntityCreated).toHaveBeenCalledWith(entity, 1, 1)

    _simulateUndo(player)
    expect(ctx.getUndoFn()).toHaveBeenCalledWith("overbuild preview")
  })
})

describe("delete", () => {
  let entity: LuaEntity
  before_each(() => {
    entity = ctx.getSurface().create_entity({
      name: "iron-chest",
      position: pos,
      raise_built: true,
      force: "player",
    })!
    mock.clear(ctx.getProject().actions)
  })
  test("player mined entity", () => {
    ctx.getPlayer().mine_entity(entity, true)
    expect(ctx.getProject().actions.onEntityDeleted).toHaveBeenCalledWith(expect._, 1)
  })
})

test.each([
  [false, true],
  [true, false],
  [true, true],
])("fast replace, rotate: %s, upgrade: %s", (rotate, upgrade) => {
  const surface = ctx.getSurface()
  const player = ctx.getPlayer()
  const entity: LuaEntity = surface.create_entity({
    name: "inserter",
    position: pos,
    raise_built: true,
    force: "player",
  })!
  mock.clear(ctx.getProject().actions)
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
  expect(ctx.getProject().actions.onEntityPossiblyUpdated).toHaveBeenCalledWith(newEntity, 1, expect._, 1)
})

test("fast replace an underground runs onEntityPossiblyUpdate on both", () => {
  const surface = ctx.getSurface()
  const player = ctx.getPlayer()
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

  expect(ctx.getProject().actions.onEntityCreated).not.toHaveBeenCalled()
  expect(ctx.getProject().actions.onEntityDeleted).not.toHaveBeenCalled()

  expect(ctx.getProject().actions.onEntityPossiblyUpdated).toHaveBeenCalledWith(newU1, 1, expect._, 1)
  expect(ctx.getProject().actions.onEntityPossiblyUpdated).toHaveBeenCalledWith(newU2, 1, expect._, 1)
  ctx.setExpectedNumCalls(2)
})

describe("upgrade", () => {
  let entity: LuaEntity
  before_each(() => {
    entity = ctx.getSurface().create_entity({
      name: "inserter",
      position: pos,
      raise_built: true,
      force: "player",
    })!
    mock.clear(ctx.getProject().actions)
  })

  test("instant upgrade planner", () => {
    Events.raiseFakeEventNamed("on_player_mined_entity", {
      player_index: 1 as PlayerIndex,
      entity,
      buffer: nil!,
    })
    const { position, direction: oldDirection } = entity
    entity.destroy()
    const newEntity = ctx.getSurface().create_entity({
      name: "fast-inserter",
      position,
      force: "player",
    })!
    Events.raiseFakeEventNamed("on_built_entity", {
      player_index: 1 as PlayerIndex,
      entity: newEntity,
      consumed_items: nil!,
    })
    expect(ctx.getProject().actions.onEntityPossiblyUpdated).toHaveBeenCalledWith(newEntity, 1, oldDirection, 1)
    expect(ctx.getProject().actions.onEntityDeleted).not.toHaveBeenCalled()
  })
})

describe("belt dragging", () => {
  const surface = () => ctx.getSurface()
  const player = () => ctx.getPlayer()

  function fakeNoopDrag(belt: LuaEntity): void {
    Events.raiseFakeEventNamed("on_pre_build", {
      player_index: player().index,
      position: belt.position,
      created_by_moving: true,
      direction: belt.direction,
      build_mode: defines.build_mode.normal,
      mirror: false,
      flip_vertical: false,
      flip_horizontal: false,
    })
  }
  test("building over existing belt does not call anything", () => {
    const belt = surface().create_entity({
      name: "transport-belt",
      position: pos,
      force: "player",
    })!
    player().cursor_stack!.set_stack("transport-belt")

    fakeNoopDrag(belt)

    expect(ctx.getProject().actions.onEntityPossiblyUpdated).not.toHaveBeenCalled()
    expect(ctx.getProject().actions.onWiresPossiblyUpdated).not.toHaveBeenCalled()
    expect(ctx.getProject().actions.onEntityCreated).not.toHaveBeenCalled()

    const pos2 = Pos.add(pos, 0, 1)
    player().build_from_cursor({ position: pos2, direction: belt.direction })
    const newBelt = surface().find_entity("transport-belt", pos2)!
    expect(newBelt).toBeAny()

    expect(ctx.getProject().actions.onEntityCreated).toHaveBeenCalledWith(newBelt, 1, 1)
  })

  test("build in different direction calls onEntityPossiblyUpdated", () => {
    const belt = surface().create_entity({
      name: "transport-belt",
      position: pos,
      force: "player",
    })!
    expect(belt).toBeAny()
    player().cursor_stack!.set_stack("transport-belt")

    player().build_from_cursor({ position: pos, direction: direction.east })
    const newBelt = surface().find_entity("transport-belt", pos)!
    expect(newBelt).toBeAny()

    expect(ctx.getProject().actions.onEntityPossiblyUpdated).toHaveBeenCalledWith(newBelt, 1, 0, 1)
  })

  test("drag over existing followed by mine", () => {
    const belt = surface().create_entity({
      name: "transport-belt",
      position: pos,
      force: "player",
    })!
    player().cursor_stack!.set_stack("transport-belt")

    fakeNoopDrag(belt)
    player().mine_entity(belt)

    expect(ctx.getProject().actions.onEntityPossiblyUpdated).not.toHaveBeenCalled()
    expect(ctx.getProject().actions.onWiresPossiblyUpdated).not.toHaveBeenCalled()
    expect(ctx.getProject().actions.onEntityCreated).not.toHaveBeenCalled()
    expect(ctx.getProject().actions.onEntityDeleted).toHaveBeenCalledWith(expect._, 1)
  })

  test("drag over existing followed by fast replace on same belt", () => {
    const belt = surface().create_entity({
      name: "transport-belt",
      position: pos,
      force: "player",
    })!
    const pos1 = belt.position
    player().cursor_stack!.set_stack("transport-belt")
    fakeNoopDrag(belt)
    player().cursor_stack!.set_stack("fast-transport-belt")
    player().build_from_cursor({ position: pos1, direction: belt.direction })
    const newBelt = surface().find_entity("fast-transport-belt", pos1)!
    expect(newBelt).toBeAny()

    expect(ctx.getProject().actions.onEntityDeleted).not.toHaveBeenCalled()
    expect(ctx.getProject().actions.onEntityCreated).not.toHaveBeenCalled()
    expect(ctx.getProject().actions.onEntityPossiblyUpdated).toHaveBeenCalledWith(newBelt, 1, expect._, 1)
  })

  test("drag over existing followed by fast replace on different belt", () => {
    const belt = surface().create_entity({
      name: "transport-belt",
      position: pos,
      force: "player",
    })!
    const pos1 = belt.position
    const pos2 = Pos.plus(pos1, Pos(0, 1))
    surface().create_entity({
      name: "fast-transport-belt",
      position: pos2,
      force: "player",
    })
    player().cursor_stack!.set_stack("transport-belt")
    fakeNoopDrag(belt)
    player().build_from_cursor({ position: pos2, direction: belt.direction })
    const newBelt = surface().find_entity("transport-belt", pos2)!

    expect(ctx.getProject().actions.onEntityDeleted).not.toHaveBeenCalled()
    expect(ctx.getProject().actions.onEntityCreated).not.toHaveBeenCalled()
    expect(ctx.getProject().actions.onEntityPossiblyUpdated).toHaveBeenCalledWith(newBelt, 1, expect._, 1)
  })

  test("fast replacing with underground belt", () => {
    for (const i of $range(1, 5)) {
      surface().create_entity({
        name: "transport-belt",
        position: Pos(0, i),
        force: "player",
      })
    }
    const u1 = surface().create_entity({
      name: "underground-belt",
      position: Pos(0.5, 0.5),
      direction: defines.direction.north,
      type: "output",
      force: "player",
      fast_replace: true,
    })
    expect(u1).toBeAny()
    player().cursor_stack!.set_stack("underground-belt")
    player().build_from_cursor({ position: Pos(0.5, 5.5), direction: defines.direction.north })

    const underground = surface().find_entity("underground-belt", Pos(0.5, 5.5))!

    expect(ctx.getProject().actions.onEntityPossiblyUpdated).not.toHaveBeenCalled()
    expect(ctx.getProject().actions.onEntityCreated).toHaveBeenCalledWith(underground, 1, 1)
    expect(ctx.getProject().actions.onEntityDeleted).toHaveBeenCalledTimes(5)
    ctx.setExpectedNumCalls(6)
  })

  function fakeUndergroundDrag(u1: LuaEntity, dir: defines.direction) {
    Events.raiseFakeEventNamed("on_pre_build", {
      player_index: player().index,
      position: u1.position,
      created_by_moving: true,
      direction: dir,
      build_mode: defines.build_mode.normal,
      flip_vertical: false,
      flip_horizontal: false,
      mirror: false,
    })
  }
  describe("rotate underground by dragging calls onUndergroundBeltDragRotated", () => {
    let belt: LuaEntity
    let u1: LuaEntity

    before_each(() => {
      belt = surface().create_entity({
        name: "transport-belt",
        position: Pos(0, 0.5),
        force: "player",
      })!
      expect(belt).toBeAny()

      u1 = surface().create_entity({
        name: "underground-belt",
        position: Pos(0.5, 1.5),
        direction: defines.direction.south,
        type: "output",
        force: "player",
      })!
      expect(u1).toBeAny()
      player().cursor_stack!.set_stack("transport-belt")
    })

    test("can rotate underground by dragging", () => {
      fakeNoopDrag(belt)
      fakeUndergroundDrag(u1, belt.direction)

      expect(ctx.getProject().actions.onUndergroundBeltDragRotated).toHaveBeenCalledWith(u1, 1, 1)
    })

    test("does not count if wrong direction", () => {
      fakeNoopDrag(belt)
      fakeUndergroundDrag(u1, oppositedirection(belt.direction))

      expect(ctx.getProject().actions.onUndergroundBeltDragRotated).not.toHaveBeenCalled()
      ctx.setExpectedNumCalls(0)
    })
    test("does not count if replaced", () => {
      const position = u1.position
      player().build_from_cursor({
        position,
        direction: u1.direction,
      })
      expect(ctx.getProject().actions.onUndergroundBeltDragRotated).not.toHaveBeenCalled()
      expect(ctx.getProject().actions.onEntityDeleted).toHaveBeenCalledWith(expect._, 1)
      const newBelt = surface().find_entity("transport-belt", position)!
      expect(ctx.getProject().actions.onEntityCreated).toHaveBeenCalledWith(newBelt, 1, 1)
      ctx.setExpectedNumCalls(2)
    })
    test("does not count if replaced sideways", () => {
      const position = u1.position
      player().build_from_cursor({
        position,
        direction: belt.direction + 2,
      })
      expect(ctx.getProject().actions.onUndergroundBeltDragRotated).not.toHaveBeenCalled()
      expect(ctx.getProject().actions.onEntityDeleted).toHaveBeenCalledWith(expect._, 1)
      const newBelt = surface().find_entity("transport-belt", position)!
      expect(ctx.getProject().actions.onEntityCreated).toHaveBeenCalledWith(newBelt, 1, 1)
      ctx.setExpectedNumCalls(2)
    })
  })
})
