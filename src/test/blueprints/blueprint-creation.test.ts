import { Stage, UserAssembly } from "../../assembly/AssemblyDef"
import { _deleteAllAssemblies, createUserAssembly } from "../../assembly/UserAssembly"
import { Pos } from "../../lib/geometry"
import { exportBlueprintBookToFile, makeBlueprintBook, takeStageBlueprint } from "../../blueprints/blueprint-creation"
import expect, { mock } from "tstl-expect"
import { AutoSetTilesType } from "../../assembly/tiles"
import { entityPossiblyUpdated } from "../../assembly/event-listener"

let assembly: UserAssembly
let player: LuaPlayer
before_each(() => {
  assembly = createUserAssembly("test", 4)
  player = game.players[1]
})

after_each(() => {
  _deleteAllAssemblies()
  player.cursor_stack?.clear()
})

function createEntity(stage: Stage, pos: MapPositionArray = [0.5, 0.5], name: string = "iron-chest"): LuaEntity {
  return assert(
    stage.surface.create_entity({
      name,
      position: pos,
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

  const ret = takeStageBlueprint(stage, stack)
  expect(ret).toBe(false)

  createEntity(stage)

  const ret2 = takeStageBlueprint(stage, stack)
  expect(ret2).toBe(true)

  expect(stack.blueprint_snap_to_grid).toEqual(Pos(2, 3))
  expect(stack.blueprint_position_relative_to_grid).toEqual(Pos(4, 5))

  expect(stack.label).toEqual(stage.name.get())

  const entities = stack.get_blueprint_entities()!
  expect(entities).toHaveLength(1)
  expect(entities[0].name).toBe("iron-chest")
})

test("calls setTiles if autoLandfill is true", () => {
  const stage = assembly.getStage(1)!
  mock.on(stage, "autoSetTiles", true).returns(true)

  const stack = player.cursor_stack!
  createEntity(stage)

  let ret = takeStageBlueprint(stage, stack)
  expect(ret).toBe(true)
  expect(stage.autoSetTiles).not.toHaveBeenCalled()

  stage.stageBlueprintSettings.autoLandfill.set(true)

  ret = takeStageBlueprint(stage, stack)
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

  const ret = takeStageBlueprint(stage1, stack)
  expect(ret).toBe(true)

  const tiles = stack.get_blueprint_tiles()!
  expect(tiles).to.matchTable([
    {
      name: "landfill",
      position: Pos(4, 5).plus(Pos(1, 1)),
    },
  ])
})

test("stageLimit: only entities present in last x stages or in additionalWhitelist", () => {
  const [stage1, stage2, stage3, stage4] = assembly.getAllStages()

  createEntity(stage1) // not included
  const e1 = createEntity(stage1, [1.5, 1.5]) // included, as has change in stage 3
  const e1Stage2 = assembly.content.findCompatibleWithLuaEntity(e1, nil)!.getWorldEntity(2)!
  e1Stage2.get_inventory(defines.inventory.chest)!.set_bar(3)
  entityPossiblyUpdated(e1Stage2, nil)
  const e2 = createEntity(stage2, [2.5, 2.5]) // included
  const e3 = createEntity(stage3, [3.5, 3.5]) // included
  createEntity(stage4, [4.5, 4.5]) // not included

  const e4 = createEntity(stage1, [5.5, 5.5], "steel-chest") // included, in additional whitelist

  const includedEntities = [e1, e2, e3, e4]

  const stack = player.cursor_stack!
  const stageBlueprintSettings = stage3.stageBlueprintSettings
  stageBlueprintSettings.stageLimit.set(2)
  stageBlueprintSettings.snapToGrid.set(Pos(2, 2))
  stageBlueprintSettings.positionOffset.set(Pos(0, 0))
  stageBlueprintSettings.additionalWhitelist.set(newLuaSet("steel-chest"))

  const ret = takeStageBlueprint(stage3, stack)
  expect(ret).toBe(true)

  const entities = stack.get_blueprint_entities()!
  expect(entities).toHaveLength(includedEntities.length)
  expect(entities.map((e) => e.position).sort((a, b) => a.x - b.x)).toEqual(
    includedEntities.map((e) => e.position).sort((a, b) => a.x - b.x),
  )
})

test("make blueprint book", () => {
  for (const i of $range(1, assembly.maxStage())) {
    createEntity(assembly.getStage(i)!, [i + 0.5, i + 0.5])
  }

  const stack = player.cursor_stack!
  const ret = makeBlueprintBook(assembly, stack)
  expect(ret).toBe(true)
  expect(stack.is_blueprint_book).toBe(true)
  expect(stack.label).toBe(assembly.name.get())
  const inventory = stack.get_inventory(defines.inventory.item_main)!
  expect(inventory).toHaveLength(4)
  for (const i of $range(1, assembly.maxStage())) {
    expect(inventory[i - 1].is_blueprint).toBe(true)
    expect(inventory[i - 1].label).toBe(assembly.getStage(i)!.name.get())
    const entities = inventory[i - 1].get_blueprint_entities()!
    expect(entities).toHaveLength(i)
    expect(entities[0].name).toBe("iron-chest")
  }

  const fileName = exportBlueprintBookToFile(player, assembly) // just check no errors
  expect(fileName).to.equal("staged-builds/test.txt")
})
