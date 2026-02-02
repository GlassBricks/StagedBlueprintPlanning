import { BlueprintEntity } from "factorio:runtime"
import expect from "tstl-expect"
import { Prototypes, Settings } from "../../../constants"
import { Events, Mutable } from "../../../lib"
import { Pos, Position, PositionClass } from "../../../lib/geometry"
import { setupEventHandlerTests } from "./_test-setup"
import direction = defines.direction

const ctx = setupEventHandlerTests()

describe.each<[boolean, string]>([
  [false, "entity markers"],
  [true, "bplib"],
])("blueprint paste (using %s)", (useBplib) => {
  const player = () => ctx.getPlayer()
  const surface = () => ctx.getSurface()

  before_each(() => {
    player().mod_settings[Settings.UseBplibForBlueprintPaste] = { value: useBplib }
  })

  after_each(() => {
    player().mod_settings[Settings.UseBplibForBlueprintPaste] = { value: false }
  })

  const bpPos: PositionClass = Pos(4.5, 0.5)
  const bpEntity: BlueprintEntity = {
    entity_number: 1,
    name: "inserter",
    position: Pos(0.5, 0.5),
    direction: direction.west,
    override_stack_size: 1,
  }
  function setBlueprint(): void {
    const cursor = player().cursor_stack!
    cursor.clear()
    cursor.set_stack("blueprint")
    cursor.set_blueprint_entities([bpEntity])
  }
  before_each(setBlueprint)
  function assertCorrect(entity: import("factorio:runtime").LuaEntity, position: Position = bpPos): void {
    expect(entity).toBeAny()
    expect(entity.position).toEqual(position)

    expect(ctx.getProject().actions.onEntityPossiblyUpdated).toHaveBeenCalledWith(entity, 1, expect._, 1, nil, nil)
  }

  function waitForPaste(fn: () => void): void {
    if (useBplib) {
      after_ticks(1, fn)
    } else {
      fn()
    }
  }

  test("create entity", () => {
    player().build_from_cursor({ position: bpPos })
    waitForPaste(() => {
      const inserter = surface().find_entities_filtered({
        name: "inserter",
        limit: 1,
      })[0]
      expect(inserter).toBeAny()
      assertCorrect(inserter)
      if (useBplib) {
        expect(ctx.getProject().actions.onWiresPossiblyUpdated).toHaveBeenCalledWith(inserter, 1, 1)
        ctx.setExpectedNumCalls(2)
      }
    })
  })

  test("update existing entity", () => {
    const inserter = surface().create_entity({
      name: "inserter",
      position: bpPos,
      force: "player",
      direction: direction.west,
    })!
    assert(inserter)
    player().build_from_cursor({ position: bpPos })
    waitForPaste(() => {
      assertCorrect(inserter)
      if (useBplib) {
        expect(ctx.getProject().actions.onWiresPossiblyUpdated).toHaveBeenCalledWith(inserter, 1, 1)
        ctx.setExpectedNumCalls(2)
      }
    })
  })
  test.each([true, false])("update existing entity with wires, already present %s", (alreadyPresent) => {
    const entities = player().cursor_stack!.get_blueprint_entities()!
    const bpEntity1 = entities[0] as Mutable<BlueprintEntity>
    const bpEntity2: BlueprintEntity = {
      ...bpEntity1,
      entity_number: 2,
      name: "inserter",
      position: Pos(1.5, 0.5),
      direction: direction.east,
      wires: [[2, defines.wire_connector_id.circuit_red, 1, defines.wire_connector_id.circuit_red]],
    }
    bpEntity1.wires = [[1, defines.wire_connector_id.circuit_red, 2, defines.wire_connector_id.circuit_red]]
    player().cursor_stack!.set_blueprint_entities([bpEntity1, bpEntity2])

    const inserter1 = surface().create_entity({
      name: "inserter",
      position: bpPos,
      force: "player",
      direction: direction.west,
    })!

    ctx.getProject().actions.onEntityPossiblyUpdated.returns(alreadyPresent ? ({} as any) : nil)
    player().build_from_cursor({ position: bpPos })

    waitForPaste(() => {
      const inserter2 = surface().find_entities_filtered({
        name: "inserter",
        direction: direction.east,
        limit: 1,
      })[0]
      expect(inserter2).toBeAny()

      assertCorrect(inserter1, nil)
      assertCorrect(inserter2, bpPos.plus(Pos(1, 0)))
      if (alreadyPresent || useBplib) {
        expect(ctx.getProject().actions.onWiresPossiblyUpdated).toHaveBeenCalledWith(inserter1, 1, 1)
        expect(ctx.getProject().actions.onWiresPossiblyUpdated).toHaveBeenCalledWith(inserter2, 1, 1)
        ctx.setExpectedNumCalls(4)
      } else {
        expect(ctx.getProject().actions.onWiresPossiblyUpdated).not.toHaveBeenCalled()
        ctx.setExpectedNumCalls(2)
      }
    })
  })

  test.each([true, false])("new entity with cable, with already present %s", (alreadyPresent) => {
    const entity1: BlueprintEntity = {
      entity_number: 1,
      name: "small-electric-pole",
      position: Pos(0.5, 0.5),
      wires: [[1, defines.wire_connector_id.pole_copper, 2, defines.wire_connector_id.pole_copper]],
    }
    const entity2: BlueprintEntity = {
      entity_number: 2,
      name: "small-electric-pole",
      position: Pos(1.5, 0.5),
      wires: [[2, defines.wire_connector_id.pole_copper, 1, defines.wire_connector_id.pole_copper]],
    }
    player().cursor_stack!.set_blueprint_entities([entity1, entity2])

    const pole1 = surface().create_entity({
      name: "small-electric-pole",
      position: bpPos,
      force: "player",
    })!

    ctx.getProject().actions.onEntityPossiblyUpdated.returns(alreadyPresent ? ({} as any) : nil)
    player().build_from_cursor({ position: bpPos })

    waitForPaste(() => {
      const pole2 = surface().find_entity("small-electric-pole", bpPos.plus(Pos(1, 0)))!
      expect(pole2).toBeAny()

      assertCorrect(pole1, nil)
      assertCorrect(pole2, bpPos.plus(Pos(1, 0)))
      if (alreadyPresent || useBplib) {
        expect(ctx.getProject().actions.onWiresPossiblyUpdated).toHaveBeenCalledWith(pole1, 1, 1)
        expect(ctx.getProject().actions.onWiresPossiblyUpdated).toHaveBeenCalledWith(pole2, 1, 1)
        ctx.setExpectedNumCalls(4)
      } else {
        expect(ctx.getProject().actions.onWiresPossiblyUpdated).not.toHaveBeenCalled()
        ctx.setExpectedNumCalls(2)
      }
    })
  })

  test("tank has correct direction when not flipped ", () => {
    const entity: BlueprintEntity = {
      entity_number: 1,
      name: "storage-tank",
      position: Pos(0.5, 0.5),
    }
    player().cursor_stack!.set_blueprint_entities([entity])

    const tank = surface().create_entity({
      name: "storage-tank",
      position: Pos(0.5, 0.5),
      force: "player",
      direction: 0,
    })
    expect(tank).toBeAny()

    player().build_from_cursor({ position: Pos(0.5, 0.5) })

    waitForPaste(() => {
      expect(ctx.getProject().actions.onEntityCreated).not.toHaveBeenCalled()
      expect(ctx.getProject().actions.onEntityPossiblyUpdated).toHaveBeenCalledWith(
        tank,
        1,
        nil,
        player().index,
        nil,
        nil,
      )
      if (useBplib) {
        expect(ctx.getProject().actions.onWiresPossiblyUpdated).toHaveBeenCalledWith(tank, 1, 1)
        ctx.setExpectedNumCalls(2)
      }
    })
  })

  function fakeFlippedPaste(pastePos: Position) {
    Events.raiseFakeEventNamed("on_pre_build", {
      player_index: player().index,
      position: pastePos,
      direction: 0,
      created_by_moving: false,
      flip_vertical: false,
      flip_horizontal: true,
      mirror: false,
      build_mode: defines.build_mode.normal,
    })

    expect(player().cursor_stack!.cost_to_build).toContainEqual(
      expect.tableContaining({ name: Prototypes.EntityMarker }),
    )

    const marker = player()
      .cursor_stack!.get_blueprint_entities()!
      .find((e) => e.name == Prototypes.EntityMarker)!

    Events.raiseFakeEventNamed("on_built_entity", {
      player_index: player().index,
      entity: surface().create_entity({
        name: marker.name,
        position: pastePos,
        direction: marker.direction,
      })!,
      tags: marker.tags,
      consumed_items: nil!,
    })
  }

  test("tank has correct direction when flipped ", () => {
    if (useBplib) {
      ctx.setExpectedNumCalls(0)
      return
    }
    const entity: BlueprintEntity = {
      entity_number: 1,
      name: "storage-tank",
      position: Pos(0.5, 0.5),
    }
    player().cursor_stack!.set_blueprint_entities([entity])

    const tank = surface().create_entity({
      name: "storage-tank",
      position: Pos(0.5, 0.5),
      force: "player",
      direction: 4,
    })
    expect(tank).toBeAny()

    fakeFlippedPaste(Pos(0.5, 0.5))

    expect(ctx.getProject().actions.onEntityCreated).not.toHaveBeenCalled()
    expect(ctx.getProject().actions.onEntityPossiblyUpdated).toHaveBeenCalledWith(
      tank,
      1,
      nil,
      player().index,
      nil,
      nil,
    )
  })

  test("doesn't break when creating ghost entity", () => {
    player().set_controller({ type: defines.controllers.god })
    after_test(() => {
      player().set_controller({ type: defines.controllers.editor })
      player().clear_cursor()
    })
    setBlueprint()
    player().build_from_cursor({ position: bpPos, build_mode: defines.build_mode.forced })
    player().clear_cursor()
    waitForPaste(() => {
      ctx.setExpectedNumCalls(0)
    })
  })
})

test("splitter has correct values when not flipped", () => {
  const player = ctx.getPlayer()
  const surface = ctx.getSurface()
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

  expect(ctx.getProject().actions.onEntityCreated).not.toHaveBeenCalled()
  expect(ctx.getProject().actions.onEntityPossiblyUpdated).toHaveBeenCalledWith(
    splitter,
    1,
    nil,
    player.index,
    nil,
    nil,
  )
})
