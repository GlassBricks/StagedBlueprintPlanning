import { BlueprintEntity, LuaEntity } from "factorio:runtime"
import expect from "tstl-expect"
import { Mutable } from "../../../lib"
import { Pos, Position, PositionClass } from "../../../lib/geometry"
import { setupEventHandlerTests } from "./_test-setup"
import direction = defines.direction

const ctx = setupEventHandlerTests()

// Blueprint paste uses the native engine: new entities raise on_built_entity (-> onEntityCreated),
// existing entities pasted over raise on_blueprint_settings_pasted (-> onEntityPossiblyUpdated, then
// onWiresPossiblyUpdated). The mod no longer intercepts the paste itself.
describe("blueprint paste", () => {
  const player = () => ctx.getPlayer()
  const surface = () => ctx.getSurface()

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

  // An entity pasted over an existing one (on_blueprint_settings_pasted): updated, then wires saved.
  function assertUpdated(entity: LuaEntity, position: Position = bpPos): void {
    expect(entity).toBeAny()
    expect(entity.position).toEqual(position)
    expect(ctx.getProject().actions.onEntityPossiblyUpdated).toHaveBeenCalledWith(entity, 1, expect._, 1, nil, nil)
    expect(ctx.getProject().actions.onWiresPossiblyUpdated).toHaveBeenCalledWith(entity, 1, 1)
  }
  // An entity newly created by the paste (on_built_entity).
  function assertCreated(entity: LuaEntity, position: Position): void {
    expect(entity).toBeAny()
    expect(entity.position).toEqual(position)
    expect(ctx.getProject().actions.onEntityCreated).toHaveBeenCalledWith(entity, 1, 1)
  }

  test("create entity", () => {
    player().build_from_cursor({ position: bpPos })
    const inserter = surface().find_entities_filtered({ name: "inserter", limit: 1 })[0]
    assertCreated(inserter, bpPos)
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
    assertUpdated(inserter)
    ctx.setExpectedNumCalls(2)
  })

  test("update existing entity, new entity with wires", () => {
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

    player().build_from_cursor({ position: bpPos })

    const inserter2 = surface().find_entities_filtered({
      name: "inserter",
      direction: direction.east,
      limit: 1,
    })[0]
    expect(inserter2).toBeAny()

    assertUpdated(inserter1)
    assertCreated(inserter2, bpPos.plus(Pos(1, 0)))
    ctx.setExpectedNumCalls(3)
  })

  test("existing and new pole with cable", () => {
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

    player().build_from_cursor({ position: bpPos })

    const pole2 = surface().find_entity("small-electric-pole", bpPos.plus(Pos(1, 0)))!
    expect(pole2).toBeAny()

    assertUpdated(pole1)
    assertCreated(pole2, bpPos.plus(Pos(1, 0)))
    ctx.setExpectedNumCalls(3)
  })

  test("tank has correct direction when not flipped", () => {
    player().cursor_stack!.set_blueprint_entities([{ entity_number: 1, name: "storage-tank", position: Pos(0.5, 0.5) }])

    const tank = surface().create_entity({
      name: "storage-tank",
      position: Pos(0.5, 0.5),
      force: "player",
      direction: 0,
    })!
    expect(tank).toBeAny()

    player().build_from_cursor({ position: Pos(0.5, 0.5) })

    expect(ctx.getProject().actions.onEntityCreated).not.toHaveBeenCalled()
    assertUpdated(tank, Pos(0.5, 0.5))
    ctx.setExpectedNumCalls(2)
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
    ctx.setExpectedNumCalls(0)
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
    expect._,
    player.index,
    nil,
    nil,
  )
  expect(ctx.getProject().actions.onWiresPossiblyUpdated).toHaveBeenCalledWith(splitter, 1, player.index)
  ctx.setExpectedNumCalls(2)
})
