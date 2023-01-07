import {
  getDefaultBlueprintSettings,
  OverrideableBlueprintSettings,
  StageBlueprintSettings,
} from "./blueprint-settings"
import { Assembly, Stage } from "../assembly/AssemblyDef"
import { AssemblyEntity, StageNumber } from "../entity/AssemblyEntity"
import { BBox, Pos, Position } from "../lib/geometry"
import { getCurrentValues } from "../utils/properties-obj"
import { BlueprintTakeResult, takeSingleBlueprint } from "./take-single-blueprint"
import { AutoSetTilesType } from "../assembly/tiles"
import { Mutable } from "../lib"
import max = math.max

interface AssemblyBlueprintPlan {
  assembly: Assembly
  // other stuff will go here eventually
  stagePlans: LuaMap<StageNumber, StageBlueprintPlan>

  changedEntities?: LuaMap<StageNumber, LuaSet<AssemblyEntity>>
}

interface StageBlueprintPlan {
  stage: Stage

  stack: LuaItemStack | nil
  bbox: BBox
  settings: StageBlueprintSettings

  result: BlueprintTakeResult | nil
}

function getCurrentBpSettings(stage: Stage): StageBlueprintSettings {
  return getCurrentValues(stage.getBlueprintSettingsView())
}

/**
 * Facilitates the creation of multiple blueprints efficiently.
 */
export class BlueprintCreation {
  private inventory?: LuaInventory
  private assemblyPlans = new LuaMap<Assembly, AssemblyBlueprintPlan>()

  private getPlanForAssembly(assembly: Assembly): AssemblyBlueprintPlan {
    if (!this.assemblyPlans.has(assembly)) {
      this.assemblyPlans.set(assembly, { assembly, stagePlans: new LuaMap() })
    }
    return this.assemblyPlans.get(assembly)!
  }

  private getChangedEntities(assemblyInfo: AssemblyBlueprintPlan): LuaMap<StageNumber, LuaSet<AssemblyEntity>> {
    return (assemblyInfo.changedEntities ??= this.computeChangedEntities(assemblyInfo.assembly))
  }

  private computeChangedEntities(assembly: Assembly): LuaMap<StageNumber, LuaSet<AssemblyEntity>> {
    const result = new LuaMap<StageNumber, LuaSet<AssemblyEntity>>()
    for (const i of $range(1, assembly.maxStage())) {
      result.set(i, new LuaSet())
    }
    for (const entity of assembly.content.iterateAllEntities()) {
      result.get(entity.firstStage)!.add(entity)

      const diffs = entity.getStageDiffs()
      if (!diffs) continue
      for (const [stage] of pairs(diffs)) {
        result.get(stage)!.add(entity)
      }
    }

    return result
  }

  private addNewPlan(
    assemblyInfo: AssemblyBlueprintPlan,
    stack: LuaItemStack | nil,
    stage: Stage,
    settings: StageBlueprintSettings,
  ): StageBlueprintPlan {
    const plan: StageBlueprintPlan = {
      stack,
      stage,
      bbox: stage.getBlueprintBBox(),
      settings,
      result: nil,
    }
    assemblyInfo.stagePlans.set(stage.stageNumber, plan)
    return plan
  }

  private ensureTilesTaken(assemblyInfo: AssemblyBlueprintPlan, stage: Stage) {
    const stagePlan = assemblyInfo.stagePlans.get(stage.stageNumber)
    if (!stagePlan) {
      this.addNewPlan(assemblyInfo, nil, stage, getCurrentBpSettings(stage))
    }
  }

  public addBlueprint(
    stage: Stage,
    stack: LuaItemStack,
  ):
    | {
        result: BlueprintTakeResult | nil
      }
    | nil {
    const assemblyPlan = this.getPlanForAssembly(stage.assembly)
    const existingStagePlan = assemblyPlan.stagePlans.get(stage.stageNumber)
    if (existingStagePlan) {
      if (existingStagePlan.stack) return nil
      existingStagePlan.stack = stack
    }

    const settings = existingStagePlan?.settings ?? getCurrentBpSettings(stage)
    if (settings.useNextStageTiles) {
      const nextStage = stage.assembly.getStage(stage.stageNumber + 1)
      if (nextStage) this.ensureTilesTaken(assemblyPlan, nextStage)
    }

    return existingStagePlan ?? this.addNewPlan(assemblyPlan, stack, stage, settings)
  }

  public takeAllBlueprints(): void {
    for (const [, assemblyPlan] of this.assemblyPlans) {
      for (const [, stagePlan] of assemblyPlan.stagePlans) {
        this.takeBlueprint(assemblyPlan, stagePlan)
      }
      this.setNextStageTiles(assemblyPlan.stagePlans)
    }
  }

  private setNextStageTiles(stagePlans: LuaMap<StageNumber, StageBlueprintPlan>): void {
    for (const [stageNumber, curStage] of stagePlans) {
      // factorio guarantees this loop is done in ascending stageNumber order (if <= 1024 stages)
      if (!(curStage.result && curStage.settings.useNextStageTiles)) continue

      const nextStagePlan = stagePlans.get(stageNumber + 1)!
      assert(nextStagePlan, "Next stage plan should exist if useNextStageTiles is true")
      if (!nextStagePlan.result) continue

      const nextStageTiles = nextStagePlan.stack!.get_blueprint_tiles()
      if (!nextStageTiles) {
        curStage.stack!.set_blueprint_tiles([])
        continue
      }
      const shift = Pos.minus(curStage.result.effectivePositionOffset, nextStagePlan.result.effectivePositionOffset)
      if (!Pos.isZero(shift)) {
        const { x, y } = shift
        for (const i of $range(1, nextStageTiles.length)) {
          const pos = nextStageTiles[i - 1].position as Mutable<Position>
          pos.x += x
          pos.y += y
        }
      }
      curStage.stack!.set_blueprint_tiles(nextStageTiles)
    }
  }

  private takeBlueprint(assemblyPlan: AssemblyBlueprintPlan, stagePlan: StageBlueprintPlan): void {
    const { stack, stage, bbox } = stagePlan
    let settings: OverrideableBlueprintSettings = stagePlan.settings

    let actualStack: LuaItemStack

    if (!stack) {
      stagePlan.stack = actualStack = this.getNewTempStack()
      settings = getDefaultBlueprintSettings()
    } else {
      actualStack = stack
    }
    if (settings.autoLandfill) {
      stage.autoSetTiles(AutoSetTilesType.LandfillAndLabTiles)
    }

    let unitNumberFilter: LuaSet<UnitNumber> | nil
    if (settings.stageLimit != nil) {
      unitNumberFilter = this.getUnitNumberFilter(assemblyPlan, stage, settings.stageLimit)
    }

    stagePlan.result = takeSingleBlueprint(actualStack, settings, stage.surface, bbox, unitNumberFilter, false)
    actualStack.label = stage.name.get()
  }

  private getUnitNumberFilter(
    assemblyPlan: AssemblyBlueprintPlan,
    stage: Stage,
    stageLimit: number,
  ): LuaSet<UnitNumber> {
    const result = new LuaSet<UnitNumber>()
    const stageNumber = stage.stageNumber
    const minStage = max(stageNumber - stageLimit + 1)
    const maxStage = stageNumber
    const changedEntities = this.getChangedEntities(assemblyPlan)
    for (const stage of $range(minStage, maxStage)) {
      for (const entity of changedEntities.get(stage)!) {
        const luaEntity = entity.getWorldOrPreviewEntity(stageNumber)
        if (!luaEntity) continue
        const unitNumber = luaEntity.unit_number
        if (unitNumber) result.add(unitNumber)
      }
    }
    return result
  }

  private getNewTempStack(): LuaItemStack {
    const inventory = (this.inventory ??= game.create_inventory(4))
    let [stack] = inventory.find_empty_stack()
    if (stack) {
      stack.set_stack("blueprint")
      return stack
    }
    inventory.resize(inventory.length * 2)
    ;[stack] = inventory.find_empty_stack()
    if (!stack) {
      error("Could not find empty stack after resizing inventory")
    }
    stack.set_stack("blueprint")
    return stack
  }

  cleanup(): void {
    if (this.inventory && this.inventory.valid) this.inventory.destroy()
  }
}

export function withBlueprintCreator<T>(action: (creator: BlueprintCreation) => T): T {
  const creator = new BlueprintCreation()
  const [success, result] = pcall(action, creator)
  creator.cleanup()
  if (success) return result
  error(result)
}

export function takeSingleStageBlueprint(stage: Stage, stack: LuaItemStack): boolean {
  return withBlueprintCreator((creator) => {
    const plan = creator.addBlueprint(stage, stack)!
    creator.takeAllBlueprints()
    return plan.result != nil
  })
}
