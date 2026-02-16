import { LuaEntity } from "factorio:runtime"
import expect from "tstl-expect"
import { CustomInputs, Prototypes } from "../../../constants"
import { Events } from "../../../lib"
import { BBox, Pos } from "../../../lib/geometry"
import { getProjectPlayerData } from "../../../project/player-project-data"
import { _simulateUndo } from "../../../project/actions/undo"
import { pos, setupEventHandlerTests } from "./_test-setup"

const ctx = setupEventHandlerTests()

describe("Cleanup tool", () => {
  test("revive error entity", () => {
    const surface = ctx.getSurface()
    const entity = surface.create_entity({
      name: Prototypes.PreviewEntityPrefix + "iron-chest",
      position: pos,
      force: "player",
    })!
    Events.raiseFakeEventNamed("on_player_selected_area", {
      player_index: ctx.getPlayer().index,
      item: Prototypes.CleanupTool,
      surface,
      area: BBox.around(pos, 10),
      entities: [entity],
      tiles: [],
    })
    expect(ctx.getProject().actions.onCleanupToolUsed).toHaveBeenCalledWith(entity, 1)
  })
  test("delete settings remnant", () => {
    const surface = ctx.getSurface()
    const entity = surface.create_entity({
      name: Prototypes.PreviewEntityPrefix + "iron-chest",
      position: pos,
      force: "player",
    })!
    Events.raiseFakeEventNamed("on_player_alt_selected_area", {
      player_index: ctx.getPlayer().index,
      item: Prototypes.CleanupTool,
      surface,
      area: BBox.around(pos, 10),
      entities: [entity],
      tiles: [],
    })
    expect(ctx.getProject().actions.onCleanupToolUsed).toHaveBeenCalledWith(entity, 1)
  })
  test("force delete", () => {
    const surface = ctx.getSurface()
    const player = ctx.getPlayer()
    const entity = surface.create_entity({
      name: "iron-chest",
      position: pos,
      force: "player",
    })!
    ctx.getProject().actions.onEntityForceDeleteUsed.invokes(() => ctx.TestUndo.createAction({ value: "force delete" }))
    Events.raiseFakeEventNamed("on_player_reverse_selected_area", {
      player_index: player.index,
      item: Prototypes.CleanupTool,
      surface,
      area: BBox.around(pos, 10),
      entities: [entity],
      tiles: [],
    })
    expect(ctx.getProject().actions.onEntityForceDeleteUsed).toHaveBeenCalledWith(entity, 1, 1)

    _simulateUndo(player)
    expect(ctx.getUndoFn()).toHaveBeenCalledWith("force delete")
  })
})

describe("move to this stage", () => {
  before_each(() => {
    ctx
      .getProject()
      .actions.onMoveEntityToStageCustomInput.invokes(() => ctx.TestUndo.createAction({ value: "move to this stage" }))
  })
  function testOnEntity(entity: LuaEntity | nil): void {
    const player = ctx.getPlayer()
    expect(entity).not.toBeNil()
    player.selected = entity
    expect(player.selected).toEqual(entity)
    Events.raiseFakeEvent(CustomInputs.MoveToThisStage, {
      player_index: player.index,
      cursor_position: player.position,
    })
    expect(ctx.getProject().actions.onMoveEntityToStageCustomInput).toHaveBeenCalledWith(entity!, 1, 1)

    _simulateUndo(player)
    expect(ctx.getUndoFn()).toHaveBeenCalledWith("move to this stage")
  }
  test("on normal entity", () => {
    const entity = ctx.getSurface().create_entity({
      name: "inserter",
      position: pos,
      force: "player",
    })
    testOnEntity(entity)
  })
  test("on preview entity", () => {
    const entity = ctx.getSurface().create_entity({
      name: Prototypes.PreviewEntityPrefix + "inserter",
      position: pos,
      force: "player",
    })
    testOnEntity(entity)
  })
})

test("force delete custom input", () => {
  const player = ctx.getPlayer()
  const entity = ctx.getSurface().create_entity({
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
  ctx.getProject().actions.onEntityForceDeleteUsed.invokes(() => ctx.TestUndo.createAction({ value: "force delete" }))
  expect(ctx.getProject().actions.onEntityForceDeleteUsed).toHaveBeenCalledWith(entity!, 1, 1)

  _simulateUndo(player)
  expect(ctx.getUndoFn()).toHaveBeenCalledWith("force delete")
})

describe("stage move tool", () => {
  before_each(() => {
    let i = 1
    ctx
      .getProject()
      .actions.onSendToStageUsed.invokes(() => ctx.TestUndo.createAction({ value: "send to stage " + i++ }))
    ctx
      .getProject()
      .actions.onBringToStageUsed.invokes(() => ctx.TestUndo.createAction({ value: "bring to stage " + i++ }))
    ctx
      .getProject()
      .actions.onBringDownToStageUsed.invokes(() => ctx.TestUndo.createAction({ value: "bring down to stage " + i++ }))
  })
  let entity: LuaEntity
  let entity2: LuaEntity
  before_each(() => {
    const surface = ctx.getSurface()
    entity = surface.create_entity({ name: "inserter", position: pos, force: "player" })!
    expect(entity).toBeAny()
    entity2 = surface.create_entity({ name: "inserter", position: pos.plus(Pos(1, 0)), force: "player" })!
    expect(entity2).toBeAny()
  })
  test("send to stage", () => {
    const player = ctx.getPlayer()
    const surface = ctx.getSurface()
    player.cursor_stack!.set_stack(Prototypes.StageMoveTool)
    getProjectPlayerData(player.index, ctx.getProject())!.moveTargetStage = 2

    Events.raiseFakeEventNamed("on_player_selected_area", {
      player_index: player.index,
      item: Prototypes.StageMoveTool,
      surface,
      area: BBox.around(pos, 10),
      entities: [entity, entity2],
      tiles: [],
    })
    expect(ctx.getProject().actions.onSendToStageUsed).toHaveBeenCalledWith(entity, 1, 2, true, 1)
    expect(ctx.getProject().actions.onSendToStageUsed).toHaveBeenCalledWith(entity2, 1, 2, true, 1)

    _simulateUndo(player)
    expect(ctx.getUndoFn()).toHaveBeenCalledWith("send to stage 1")
    expect(ctx.getUndoFn()).toHaveBeenCalledWith("send to stage 2")

    ctx.setExpectedNumCalls(2)
  })
  test("send to stage (alt)", () => {
    const player = ctx.getPlayer()
    const surface = ctx.getSurface()
    player.cursor_stack!.set_stack(Prototypes.StageMoveTool)
    getProjectPlayerData(player.index, ctx.getProject())!.moveTargetStage = 2

    Events.raiseFakeEventNamed("on_player_alt_selected_area", {
      player_index: player.index,
      item: Prototypes.StageMoveTool,
      surface,
      area: BBox.around(pos, 10),
      entities: [entity, entity2],
      tiles: [],
    })

    expect(ctx.getProject().actions.onSendToStageUsed).toHaveBeenCalledWith(entity, 1, 2, false, 1)
    expect(ctx.getProject().actions.onSendToStageUsed).toHaveBeenCalledWith(entity2, 1, 2, false, 1)

    _simulateUndo(player)
    expect(ctx.getUndoFn()).toHaveBeenCalledWith("send to stage 1")
    expect(ctx.getUndoFn()).toHaveBeenCalledWith("send to stage 2")

    ctx.setExpectedNumCalls(2)
  })
  test("bring to this stage (reverse)", () => {
    const player = ctx.getPlayer()
    const surface = ctx.getSurface()
    player.cursor_stack!.set_stack(Prototypes.StageMoveTool)
    Events.raiseFakeEventNamed("on_player_reverse_selected_area", {
      player_index: player.index,
      item: Prototypes.StageMoveTool,
      surface,
      area: BBox.around(pos, 10),
      entities: [entity, entity2],
      tiles: [],
    })
    expect(ctx.getProject().actions.onBringToStageUsed).toHaveBeenCalledWith(entity, 1, 1)

    _simulateUndo(player)
    expect(ctx.getUndoFn()).toHaveBeenCalledWith("bring to stage 1")
    expect(ctx.getUndoFn()).toHaveBeenCalledWith("bring to stage 2")
    ctx.setExpectedNumCalls(2)
  })

  test("bring down to this stage (alt reverse)", () => {
    const player = ctx.getPlayer()
    const surface = ctx.getSurface()
    player.cursor_stack!.set_stack(Prototypes.StageMoveTool)
    Events.raiseFakeEventNamed("on_player_alt_reverse_selected_area", {
      player_index: player.index,
      item: Prototypes.StageMoveTool,
      surface,
      area: BBox.around(pos, 10),
      entities: [entity, entity2],
      tiles: [],
    })

    expect(ctx.getProject().actions.onBringDownToStageUsed).toHaveBeenCalledWith(entity, 1, 1)

    _simulateUndo(player)
    expect(ctx.getUndoFn()).toHaveBeenCalledWith("bring down to stage 1")
    expect(ctx.getUndoFn()).toHaveBeenCalledWith("bring down to stage 2")
    ctx.setExpectedNumCalls(2)
  })

  test("filtered stage move tool, send to stage", () => {
    const player = ctx.getPlayer()
    const surface = ctx.getSurface()
    player.cursor_stack!.set_stack(Prototypes.FilteredStageMoveTool)
    getProjectPlayerData(player.index, ctx.getProject())!.moveTargetStage = 2
    Events.raiseFakeEventNamed("on_marked_for_deconstruction", { entity, player_index: player.index })
    Events.raiseFakeEventNamed("on_marked_for_deconstruction", { entity: entity2, player_index: player.index })
    Events.raiseFakeEventNamed("on_player_deconstructed_area", {
      player_index: player.index,
      surface,
      area: BBox.around(pos, 10),
      item: Prototypes.FilteredStageMoveTool,
      alt: false,
    })

    expect(ctx.getProject().actions.onSendToStageUsed).toHaveBeenCalledWith(entity, 1, 2, true, 1)

    _simulateUndo(player)

    expect(ctx.getUndoFn()).toHaveBeenCalledWith("send to stage 1")
    expect(ctx.getUndoFn()).toHaveBeenCalledWith("send to stage 2")

    ctx.setExpectedNumCalls(2)
  })
})

describe("staged copy, delete, cut", () => {
  let entity: LuaEntity
  before_each(() => {
    entity = ctx.getSurface().create_entity({
      name: "inserter",
      position: pos,
      force: "player",
    })!
    expect(entity).toBeAny()
  })
  test("staged copy", () => {
    const player = ctx.getPlayer()
    const surface = ctx.getSurface()
    Events.raiseFakeEventNamed("on_player_selected_area", {
      surface,
      area: BBox.around(pos, 10),
      entities: [],
      tiles: [],
      item: Prototypes.StagedCopyTool,
      player_index: player.index,
    })

    expect(ctx.CreateBpWithStageInfo.createBlueprintWithStageInfo).toHaveBeenCalledWith(
      player,
      ctx.getProject().getStage(1)!,
      BBox.around(pos, 10),
    )
    expect(player.is_cursor_blueprint()).toBe(true)
    const entities = player.cursor_stack!.get_blueprint_entities()!
    expect(entities).toHaveLength(1)
    expect(entities[0].name).toBe("inserter")

    expect(player.blueprint_to_setup.is_blueprint).toBe(false)
  })
  test("staged copy, alt select", () => {
    const player = ctx.getPlayer()
    const surface = ctx.getSurface()
    Events.raiseFakeEventNamed("on_player_alt_selected_area", {
      surface,
      area: BBox.around(pos, 10),
      entities: [],
      tiles: [],
      item: Prototypes.StagedCopyTool,
      player_index: player.index,
    })
    expect(ctx.CreateBpWithStageInfo.createBlueprintWithStageInfo).toHaveBeenCalledWith(
      player,
      ctx.getProject().getStage(1)!,
      BBox.around(pos, 10),
    )

    expect(player.cursor_stack?.valid_for_read).toBe(false)

    player.opened = nil

    expect(player.is_cursor_blueprint()).toBe(true)
    const entities = player.cursor_stack!.get_blueprint_entities()!
    expect(entities).toHaveLength(1)
    expect(entities[0].name).toBe("inserter")
  })

  test("force delete", () => {
    const player = ctx.getPlayer()
    const surface = ctx.getSurface()
    Events.raiseFakeEventNamed("on_player_selected_area", {
      surface,
      area: BBox.around(pos, 10),
      entities: [entity],
      tiles: [],
      item: Prototypes.ForceDeleteTool,
      player_index: player.index,
    })
    ctx.getProject().actions.onEntityForceDeleteUsed.invokes(() => ctx.TestUndo.createAction({ value: "force delete" }))
    expect(ctx.getProject().actions.onEntityForceDeleteUsed).toHaveBeenCalledWith(entity, 1, 1)

    _simulateUndo(player)
    expect(ctx.getUndoFn()).toHaveBeenCalledWith("force delete")
  })

  test("staged cut", () => {
    const player = ctx.getPlayer()
    const surface = ctx.getSurface()
    Events.raiseFakeEventNamed("on_player_selected_area", {
      surface,
      area: BBox.around(pos, 10),
      entities: [entity],
      tiles: [],
      item: Prototypes.StagedCutTool,
      player_index: player.index,
    })

    expect(ctx.CreateBpWithStageInfo.createBlueprintWithStageInfo).toHaveBeenCalledWith(
      player,
      ctx.getProject().getStage(1)!,
      BBox.around(pos, 10),
    )

    ctx.getProject().actions.onEntityForceDeleteUsed.invokes(() => ctx.TestUndo.createAction({ value: "force delete" }))
    expect(ctx.getProject().actions.onEntityForceDeleteUsed).toHaveBeenCalledWith(entity, 1, 1)

    expect(player.is_cursor_blueprint()).toBe(true)
    const entities = player.cursor_stack!.get_blueprint_entities()!
    expect(entities).toHaveLength(1)
    expect(entities[0].name).toBe("inserter")

    _simulateUndo(player)
    expect(ctx.getUndoFn()).toHaveBeenCalledWith("force delete")

    ctx.setExpectedNumCalls(2)
  })
})

describe("exclude from blueprints tool", () => {
  let entity: LuaEntity
  before_each(() => {
    entity = ctx.getSurface().create_entity({
      name: "inserter",
      position: pos,
      force: "player",
    })!
    expect(entity).toBeAny()
  })
  test("select marks entities as excluded", () => {
    const player = ctx.getPlayer()
    const surface = ctx.getSurface()
    Events.raiseFakeEventNamed("on_player_selected_area", {
      player_index: player.index,
      item: Prototypes.ExcludeFromBlueprintsTool,
      surface,
      area: BBox.around(pos, 10),
      entities: [entity],
      tiles: [],
    })
    expect(ctx.getProject().actions.onExcludeFromBlueprintsUsed).toHaveBeenCalledWith(entity, 1, true)
  })
  test("alt-select unmarks entities", () => {
    const player = ctx.getPlayer()
    const surface = ctx.getSurface()
    Events.raiseFakeEventNamed("on_player_alt_selected_area", {
      player_index: player.index,
      item: Prototypes.ExcludeFromBlueprintsTool,
      surface,
      area: BBox.around(pos, 10),
      entities: [entity],
      tiles: [],
    })
    expect(ctx.getProject().actions.onExcludeFromBlueprintsUsed).toHaveBeenCalledWith(entity, 1, false)
  })
})

describe("stage delete tool", () => {
  let entity: LuaEntity
  let entity2: LuaEntity
  before_each(() => {
    const surface = ctx.getSurface()
    entity = surface.create_entity({
      name: "inserter",
      position: pos,
      force: "player",
    })!
    expect(entity).toBeAny()
    entity2 = surface.create_entity({ name: "inserter", position: pos.plus(Pos(1, 0)), force: "player" })!
    expect(entity2).toBeAny()

    let i = 1
    ctx.getProject().actions.onStageDeleteUsed.invokes(() => ctx.TestUndo.createAction({ value: "delete " + i++ }))
    ctx
      .getProject()
      .actions.onStageDeleteCancelUsed.invokes(() => ctx.TestUndo.createAction({ value: "delete cancel " + i++ }))
  })
  test("delete", () => {
    const player = ctx.getPlayer()
    const surface = ctx.getSurface()
    player.cursor_stack!.set_stack(Prototypes.StageDeconstructTool)
    Events.raiseFakeEventNamed("on_player_selected_area", {
      player_index: player.index,
      item: Prototypes.StageDeconstructTool,
      surface,
      area: BBox.around(pos, 10),
      entities: [entity, entity2],
      tiles: [],
    })
    expect(ctx.getProject().actions.onStageDeleteUsed).toHaveBeenCalledWith(entity, 1, 1)
    expect(ctx.getProject().actions.onStageDeleteUsed).toHaveBeenCalledWith(entity2, 1, 1)
    ctx.setExpectedNumCalls(2)

    _simulateUndo(player)
    expect(ctx.getUndoFn()).toHaveBeenCalledWith("delete 1")
    expect(ctx.getUndoFn()).toHaveBeenCalledWith("delete 2")
  })
  test("cancel", () => {
    const player = ctx.getPlayer()
    const surface = ctx.getSurface()
    player.cursor_stack!.set_stack(Prototypes.StageDeconstructTool)
    Events.raiseFakeEventNamed("on_player_alt_selected_area", {
      player_index: player.index,
      item: Prototypes.StageDeconstructTool,
      surface,
      area: BBox.around(pos, 10),
      entities: [entity, entity2],
      tiles: [],
    })
    expect(ctx.getProject().actions.onStageDeleteCancelUsed).toHaveBeenCalledWith(entity, 1, 1)
    ctx.setExpectedNumCalls(2)

    _simulateUndo(player)
    expect(ctx.getUndoFn()).toHaveBeenCalledWith("delete cancel 1")
    expect(ctx.getUndoFn()).toHaveBeenCalledWith("delete cancel 2")
  })
})
