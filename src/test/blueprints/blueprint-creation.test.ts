import { Stage, UserAssembly } from "../../assembly/AssemblyDef"
import { _deleteAllAssemblies, createUserAssembly } from "../../assembly/UserAssembly"
import { Pos } from "../../lib/geometry"
import { takeSingleStageBlueprint } from "../../blueprints/blueprint-creation"
import expect, { mock } from "tstl-expect"
import { AutoSetTilesType } from "../../assembly/tiles"

let assembly: UserAssembly
let player: LuaPlayer
before_each(() => {
  assembly = createUserAssembly("test", 3)
  player = game.players[1]
})

after_each(() => {
  _deleteAllAssemblies()
  player.cursor_stack?.clear()
})

function createEntity(stage: Stage): LuaEntity {
  return assert(
    stage.surface.create_entity({
      name: "iron-chest",
      position: [0.5, 0.5],
      force: "player",
      raise_built: true,
    }),
  )
}

test("can take single blueprint using stage settings", () => {
  assembly.defaultBlueprintSettings.snapToGrid.set(Pos(2, 3))
  assembly.defaultBlueprintSettings.positionRelativeToGrid.set(Pos(4, 5))

  const stage = assembly.getStage(1)!
  const stack = player.cursor_stack!

  const ret = takeSingleStageBlueprint(stage, stack)
  expect(ret).toBe(false)

  createEntity(stage)

  const ret2 = takeSingleStageBlueprint(stage, stack)
  expect(ret2).toBe(true)

  expect(stack.blueprint_snap_to_grid).toEqual(Pos(2, 3))
  expect(stack.blueprint_position_relative_to_grid).toEqual(Pos(4, 5))

  const entities = stack.get_blueprint_entities()!
  expect(entities).toHaveLength(1)
  expect(entities[0].name).toBe("iron-chest")
})

test("calls setTiles if autoLandfill is true", () => {
  const stage = assembly.getStage(1)!
  mock.on(stage, "autoSetTiles", true).returns(true)

  const stack = player.cursor_stack!
  createEntity(stage)

  let ret = takeSingleStageBlueprint(stage, stack)
  expect(ret).toBe(true)
  expect(stage.autoSetTiles).not.toHaveBeenCalled()

  stage.stageBlueprintSettings.autoLandfill.set(true)

  ret = takeSingleStageBlueprint(stage, stack)
  expect(ret).toBe(true)
  expect(stage.autoSetTiles).toHaveBeenCalledWith(AutoSetTilesType.LandfillAndLabTiles)
})
