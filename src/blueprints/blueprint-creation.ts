import { StageBlueprintSettings } from "./blueprint-settings"
import { Assembly, Stage } from "../assembly/AssemblyDef"
import { StageNumber } from "../entity/AssemblyEntity"
import { BBox } from "../lib/geometry"
import { getCurrentValues } from "../utils/properties-obj"
import { tryTakeSingleBlueprint } from "./take-single-blueprint"
import { AutoSetTilesType } from "../assembly/tiles"

/*
Old
code:


public makeBlueprintBook(stack
:
LuaItemStack
):
boolean
{
  const bbox = this.content.computeBoundingBox()
  if (!bbox) return false

  log(["", "Making blueprint book for assembly: ", this.displayName.get()])

  stack.clear()
  stack.set_stack("blueprint-book")
  const { useNextStageTiles, emptyBlueprintBookName } = this.assemblyBlueprintSettings
  if (emptyBlueprintBookName.get()) {
    stack.label = ""
  } else {
    stack.label = this.name.get()
  }

  const inventory = stack.get_inventory(defines.inventory.item_main)!
  assert(inventory, "Failed to get blueprint book inventory")

  for (const [, stage] of ipairs(this.stages)) {
    const nInserted = inventory.insert("blueprint")
    assert(nInserted == 1, "Failed to insert blueprint into blueprint book")
    const stack = inventory[inventory.length - 1]!
    if (!stage.doTakeBlueprint(stack, bbox)) stack.clear()
  }

  if (useNextStageTiles.get()) {
    log("Shifting blueprint tiles")
    for (const i of $range(1, inventory.length - 1)) {
      const blueprint = inventory[i - 1]
      const nextBlueprint = inventory[i]
      blueprint.set_blueprint_tiles(nextBlueprint.get_blueprint_tiles()!)
    }
  }

  return true
}


takeBlueprint(stack
:
LuaItemStack
):
boolean
{
  const bbox = this.assembly.content.computeBoundingBox()
  if (!bbox) return false
  return this.doTakeBlueprint(stack, bbox)
}

doTakeBlueprint(stack
:
LuaItemStack, bbox
:
BBox
):
boolean
{
  todo
  log("Taking blueprint for stage: " + this.name.get())
  if (this.assembly.assemblyBlueprintSettings.autoLandfill.get()) {
    log("  Setting landfill")
    this.autoSetTiles(AutoSetTilesType.LandfillAndLabTiles)
    log("  Done setting landfill")
  }
  const took = tryTakeBlueprintWithSettings(
    stack,
    this.getBlueprintSettings(),

    this.assembly.assemblyBlueprintSettings,
    this.surface,
    bbox,
  )
  if (took) {
    const emptyBlueprintNames = this.assembly.assemblyBlueprintSettings.emptyBlueprintNames.get()
    if (emptyBlueprintNames) {
      stack.label = ""
    } else {
      stack.label = this.name.get()
    }
  }
  return took
  return false
}

editBlueprint(player
:
LuaPlayer
):
boolean
{
  const bbox = this.assembly.content.computeBoundingBox()
  if (!bbox) return false
  return (
    editBlueprintSettings(
      player,
      this.getBlueprintSettings(),
      this.assembly.assemblyBlueprintSettings,
      this.surface,
      bbox,
    ) != nil
  )
}
*/

// The following is meant to replace the above code.
// It also supports taking blueprints from multiple different assemblies (instead of just one), for
// more flexible blueprint books.
// it also uses old settings.

// todo
// /**
//  * Nil stage number means edit default settings
//  */
// export function editAssemblyBlueprintSettings(
//   player: LuaPlayer,
//   assembly: UserAssembly,
//   stageNumber: StageNumber | nil,
// ): boolean {
//   const bbox = assembly.getBlueprintBBox()
//   if (!bbox) return false
//   const stage = assembly.getStage(stageNumber ?? assembly.maxStage())!
//   if (!stage) return false
//   const settings = stageNumber ? stage.getBlueprintSettingsView() : assembly.defaultBlueprintSettings
//   return editInItemBlueprintSettings(player, settings, stage.surface, bbox) != nil
// }

interface AssemblyBlueprintPlan {
  // other stuff will go here eventually
  stagePlans: LuaMap<StageNumber, StageBlueprintPlan>
}

interface StageBlueprintPlan {
  stage: Stage

  stack: LuaItemStack
  // isTempStack: boolean

  bbox: BBox
  settings: StageBlueprintSettings

  successfullyTaken: boolean
}

/**
 * Orchestrates the creation of multiple blueprints efficiently.
 */
export class BlueprintCreator {
  // private inventory: LuaInventory = game.create_inventory(16)
  private assemblyPlans = new LuaMap<Assembly, AssemblyBlueprintPlan>()

  private getPlanForAssembly(assembly: Assembly): AssemblyBlueprintPlan {
    if (!this.assemblyPlans.has(assembly)) {
      this.assemblyPlans.set(assembly, { stagePlans: new LuaMap() })
    }
    return this.assemblyPlans.get(assembly)!
  }

  private addStagePlan(stage: Stage, stack: LuaItemStack): StageBlueprintPlan {
    const assemblyPlan = this.getPlanForAssembly(stage.assembly)
    const existingStagePlan = assemblyPlan.stagePlans.get(stage.stageNumber)
    if (existingStagePlan) {
      return existingStagePlan
    }

    const bbox = stage.assembly.getBlueprintBBox()

    const plan: StageBlueprintPlan = {
      stack,
      stage,
      bbox,
      settings: getCurrentValues(stage.getBlueprintSettingsView()),
      successfullyTaken: false,
    }
    assemblyPlan.stagePlans.set(stage.stageNumber, plan)

    return plan
  }

  public addBlueprint(
    stage: Stage,
    stack: LuaItemStack,
  ): {
    successfullyTaken: boolean
  } {
    return this.addStagePlan(stage, stack)
  }

  public takeAllBlueprints(): void {
    for (const [, assemblyPlan] of this.assemblyPlans) {
      for (const [, stagePlan] of assemblyPlan.stagePlans) {
        this.takeBlueprint(stagePlan)
      }
    }
  }

  private takeBlueprint(stagePlan: StageBlueprintPlan): void {
    const { stack, stage, bbox, settings } = stagePlan
    stack.set_stack("blueprint")

    if (settings.autoLandfill) {
      stage.autoSetTiles(AutoSetTilesType.LandfillAndLabTiles)
    }

    stagePlan.successfullyTaken = tryTakeSingleBlueprint(stack, settings, stage.surface, bbox)
  }

  // private getNewStack(): LuaItemStack {
  //   let [stack] = this.inventory.find_empty_stack()
  //   if (stack) {
  //     stack.set_stack("blueprint")
  //     return stack
  //   }
  //   this.inventory.resize(this.inventory.length * 2)
  //   ;[stack] = this.inventory.find_empty_stack()
  //   if (!stack) {
  //     error("Could not find empty stack after resizing inventory")
  //   }
  //   return stack
  // }
  //
  // cleanup(): void {
  //   this.inventory.destroy()
  // }
}

export function withBlueprintCreator<T>(action: (creator: BlueprintCreator) => T): T {
  const creator = new BlueprintCreator()
  try {
    return action(creator)
  } finally {
    // creator.cleanup()
  }
}

export function takeSingleStageBlueprint(stage: Stage, stack: LuaItemStack): boolean {
  return withBlueprintCreator((creator) => {
    const plan = creator.addBlueprint(stage, stack)
    creator.takeAllBlueprints()
    return plan.successfullyTaken
  })
}
