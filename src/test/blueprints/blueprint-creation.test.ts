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

test.each([false, true])("can use next stage tiles, with next staging having grid %s", (stage2HasGrid) => {
  const stage2 = assembly.getStage(2)!
  const stage1 = assembly.getStage(1)!

  stage1.stageBlueprintSettings.positionOffset.set(Pos(1, 1))
  stage1.stageBlueprintSettings.snapToGrid.set(Pos(2, 2))
  stage1.stageBlueprintSettings.useNextStageTiles.set(true)

  if (stage2HasGrid) {
    stage1.stageBlueprintSettings.snapToGrid.set(Pos(1, 5))
    stage2.stageBlueprintSettings.positionOffset.set(Pos(2, 3))
  }

  stage2.surface.set_tiles([{ name: "landfill", position: [4, 5] }])

  const stack = player.cursor_stack!
  createEntity(stage1)

  const ret = takeSingleStageBlueprint(stage1, stack)
  expect(ret).toBe(true)

  const tiles = stack.get_blueprint_tiles()!
  expect(tiles).to.matchTable([
    {
      name: "landfill",
      position: Pos(4, 5).plus(Pos(1, 1)),
    },
  ])
})
