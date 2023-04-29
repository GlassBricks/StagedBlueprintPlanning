/*
 * Copyright (c) 2023 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { Stage, UserAssembly } from "../assembly/AssemblyDef"
import { AutoSetTilesType } from "../assembly/tiles"
import { AssemblyEntity, StageNumber } from "../entity/AssemblyEntity"
import { assertNever, Mutable, RegisterClass } from "../lib"
import { BBox, Pos, Position } from "../lib/geometry"
import { EnumeratedItemsTask, runEntireTask, submitTask } from "../lib/task"
import { L_GuiBlueprintBookTask } from "../locale"
import { getCurrentValues } from "../utils/properties-obj"
import {
  getDefaultBlueprintSettings,
  OverrideableBlueprintSettings,
  StageBlueprintSettings,
} from "./blueprint-settings"
import { BlueprintTakeResult, takeSingleBlueprint } from "./take-single-blueprint"
import max = math.max

interface AssemblyBlueprintPlan {
  assembly: UserAssembly
  // other stuff will go here eventually
  stagePlans: LuaMap<StageNumber, StageBlueprintPlan>

  hasComputeChangedEntitiesTask?: boolean
  changedEntities?: LuaMap<StageNumber, LuaSet<AssemblyEntity>>
}

interface StageBlueprintPlan {
  stage: Stage

  stack: LuaItemStack | nil
  bbox: BBox
  settings: StageBlueprintSettings

  result: BlueprintTakeResult | nil

  unitNumberFilter?: LuaSet<UnitNumber> | nil
}

function getCurrentBpSettings(stage: Stage): StageBlueprintSettings {
  return getCurrentValues(stage.getBlueprintSettingsView())
}

namespace BlueprintMethods {
  export function computeChangedEntities(assemblyPlan: AssemblyBlueprintPlan): void {
    const assembly = assemblyPlan.assembly
    const result = new LuaMap<StageNumber, LuaSet<AssemblyEntity>>()
    for (const i of $range(1, assembly.numStages())) {
      result.set(i, new LuaSet())
    }
    const content = assembly.content
    for (const entity of content.iterateAllEntities()) {
      const firstStageMap = result.get(entity.firstStage)!
      firstStageMap.add(entity)

      const diffs = entity.getStageDiffs()
      if (diffs) {
        for (const [stage] of pairs(diffs)) {
          result.get(stage)!.add(entity)
        }
      }
      const circuitConnections = content.getCircuitConnections(entity)
      if (circuitConnections) {
        for (const [otherEntity] of circuitConnections) {
          firstStageMap.add(otherEntity)
        }
      }
    }

    assemblyPlan.changedEntities = result
  }

  export function computeUnitNumberFilter(
    assemblyPlan: AssemblyBlueprintPlan,
    stagePlan: StageBlueprintPlan,
    stageLimit: number,
  ): void {
    const stageNumber = stagePlan.stage.stageNumber
    const minStage = max(1, stageNumber - stageLimit + 1)
    const maxStage = stageNumber

    const changedEntities = assemblyPlan.changedEntities!

    const result = new LuaSet<UnitNumber>()
    for (const stage of $range(minStage, maxStage)) {
      for (const entity of changedEntities.get(stage)!) {
        const luaEntity = entity.getWorldOrPreviewEntity(stageNumber)
        if (!luaEntity) continue
        const unitNumber = luaEntity.unit_number
        if (unitNumber) result.add(unitNumber)
      }
    }

    stagePlan.unitNumberFilter = result
  }

  export function setLandfillTiles(stage: Stage): void {
    stage.autoSetTiles(AutoSetTilesType.LandfillAndLabTiles)
  }

  export function takeStageBlueprint(
    stagePlan: StageBlueprintPlan,
    actualStack: LuaItemStack,
    settings: OverrideableBlueprintSettings,
  ): void {
    const { stage, bbox } = stagePlan
    stagePlan.result = takeSingleBlueprint(
      actualStack,
      settings,
      stage.surface,
      bbox,
      stagePlan.unitNumberFilter,
      false,
    )
    actualStack.label = stage.name.get()
  }

  export function setNextStageTiles(curStage: StageBlueprintPlan, nextStage: StageBlueprintPlan): void {
    if (!curStage.result || !nextStage.result) return

    const nextStageTiles = nextStage.stack!.get_blueprint_tiles()
    if (!nextStageTiles) {
      curStage.stack!.set_blueprint_tiles([])
      return
    }
    const shift = Pos.minus(curStage.result.effectivePositionOffset, nextStage.result.effectivePositionOffset)
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

  export function finalizeBlueprintBook(bookInventory: LuaInventory): void {
    for (const i of $range(1, bookInventory.length)) {
      const bpStack = bookInventory[i - 1]
      if (!bpStack.is_blueprint_setup()) {
        bpStack.clear()
      }
    }
  }

  export function exportBlueprintBookToFile(stack: LuaItemStack, fileName: string, player: LuaPlayer): void {
    const [assemblyFileName] = string.gsub(fileName, "[^%w%-%_%.]", "_")
    const filename = `staged-builds/${assemblyFileName}.txt`
    const data = stack.export_stack()
    game.write_file(filename, data, false, player.index)
  }
}

type BlueprintStep = {
  [K in keyof typeof BlueprintMethods]: {
    name: K
    args: Parameters<(typeof BlueprintMethods)[K]>
  }
}[keyof typeof BlueprintMethods]

@RegisterClass("BlueprintCreationTask")
class BlueprintCreationTask extends EnumeratedItemsTask<BlueprintStep> {
  constructor(steps: BlueprintStep[], private inventory?: LuaInventory, private title?: LocalisedString) {
    super(steps)
  }
  public override getTitle(): LocalisedString {
    return this.title
  }

  protected override doTask(task: BlueprintStep): void {
    const method = BlueprintMethods[task.name]
    ;(method as (this: void, ...args: any) => void)(...task.args)
  }

  protected override getTitleForTask(task: BlueprintStep): LocalisedString {
    switch (task.name) {
      case "takeStageBlueprint": {
        const stagePlan = task.args[0]
        return [L_GuiBlueprintBookTask.TakeStageBlueprint, stagePlan.stage.name.get()]
      }
      case "computeUnitNumberFilter": {
        const stagePlan = task.args[1]
        return [L_GuiBlueprintBookTask.ComputeUnitNumberFilter, stagePlan.stage.name.get()]
      }
      case "computeChangedEntities": {
        const assemblyPlan = task.args[0]
        return [L_GuiBlueprintBookTask.ComputeChangedEntities, assemblyPlan.assembly.displayName.get()]
      }
      case "setLandfillTiles": {
        const stage = task.args[0]
        return [L_GuiBlueprintBookTask.SetLandfillTiles, stage.name.get()]
      }
      case "finalizeBlueprintBook": {
        return [L_GuiBlueprintBookTask.FinalizeBlueprintBook]
      }
      case "setNextStageTiles": {
        const curStage = task.args[0]
        return [L_GuiBlueprintBookTask.SetNextStageTiles, curStage.stage.name.get()]
      }
      case "exportBlueprintBookToFile": {
        return [L_GuiBlueprintBookTask.ExportBlueprintBookToFile]
      }
      default:
        assertNever(task)
    }

    return "unknown"
  }
  protected override done(): void {
    if (this.inventory?.valid) this.inventory.destroy()
  }
  public override cancel(): void {
    this.done()
  }
}

class BlueprintCreationTaskBuilder {
  private inventory?: LuaInventory
  private assemblyPlans = new LuaMap<UserAssembly, AssemblyBlueprintPlan>()
  private tasks: BlueprintStep[] = []

  private getPlanForAssembly(assembly: UserAssembly): AssemblyBlueprintPlan {
    if (!this.assemblyPlans.has(assembly)) {
      this.assemblyPlans.set(assembly, { assembly, stagePlans: new LuaMap() })
    }
    return this.assemblyPlans.get(assembly)!
  }

  private addNewStagePlan(
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
      this.addNewStagePlan(assemblyInfo, nil, stage, getCurrentBpSettings(stage))
    }
  }

  public queueBlueprintTask(stage: Stage, stack: LuaItemStack): { result: BlueprintTakeResult | nil } | nil {
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

    return existingStagePlan ?? this.addNewStagePlan(assemblyPlan, stack, stage, settings)
  }

  addAllBpTasks(): this {
    for (const [, assemblyPlan] of this.assemblyPlans) {
      for (const [, stagePlan] of assemblyPlan.stagePlans) {
        this.addTakeBlueprintTasks(assemblyPlan, stagePlan)
      }
      this.setNextStageTiles(assemblyPlan.stagePlans)
    }
    return this
  }

  addTask(task: BlueprintStep): this {
    this.tasks.push(task)
    return this
  }

  public build(taskTitle: LocalisedString | nil): BlueprintCreationTask {
    return new BlueprintCreationTask(this.tasks, this.inventory, taskTitle)
  }

  private setNextStageTiles(stagePlans: LuaMap<StageNumber, StageBlueprintPlan>): void {
    for (const [stageNumber, curStage] of stagePlans) {
      // factorio guarantees this loop is done in ascending stageNumber order (if <= 1024 stages)
      if (curStage.settings.useNextStageTiles) {
        const nextStagePlan = stagePlans.get(stageNumber + 1)!
        if (!nextStagePlan) continue
        this.tasks.push({ name: "setNextStageTiles", args: [curStage, nextStagePlan] })
      }
    }
  }

  private addTakeBlueprintTasks(assemblyPlan: AssemblyBlueprintPlan, stagePlan: StageBlueprintPlan): void {
    const { stack, stage } = stagePlan
    let settings: OverrideableBlueprintSettings = stagePlan.settings

    let actualStack: LuaItemStack

    if (!stack) {
      stagePlan.stack = actualStack = this.getNewTempStack()
      settings = getDefaultBlueprintSettings()
    } else {
      actualStack = stack
    }
    if (settings.autoLandfill) {
      this.tasks.push({ name: "setLandfillTiles", args: [stage] })
    }

    // let unitNumberFilter: LuaSet<UnitNumber> | nil
    if (settings.stageLimit != nil) {
      this.ensureHasChangedEntities(assemblyPlan)
      this.tasks.push({ name: "computeUnitNumberFilter", args: [assemblyPlan, stagePlan, settings.stageLimit] })
    }
    this.tasks.push({ name: "takeStageBlueprint", args: [stagePlan, actualStack, settings] })
  }

  private ensureHasChangedEntities(assemblyInfo: AssemblyBlueprintPlan): void {
    if (!assemblyInfo.hasComputeChangedEntitiesTask) {
      assemblyInfo.hasComputeChangedEntitiesTask = true
      this.tasks.push({ name: "computeChangedEntities", args: [assemblyInfo] })
    }
  }
  getNewTempStack(): LuaItemStack {
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

export function takeStageBlueprint(stage: Stage, stack: LuaItemStack): boolean {
  const builder = new BlueprintCreationTaskBuilder()
  const plan = builder.queueBlueprintTask(stage, stack)
  const task = builder.addAllBpTasks().build(nil)
  runEntireTask(task)
  return plan?.result != nil
}

function addBlueprintBookTasks(builder: BlueprintCreationTaskBuilder, assembly: UserAssembly, stack: LuaItemStack) {
  stack.set_stack("blueprint-book")
  stack.label = assembly.name.get()
  const bookInventory = stack.get_inventory(defines.inventory.item_main)!

  for (const stage of assembly.getAllStages()) {
    bookInventory.insert("blueprint")
    const bpStack = bookInventory[bookInventory.length - 1]
    builder.queueBlueprintTask(stage, bpStack)
  }
  builder.addAllBpTasks().addTask({ name: "finalizeBlueprintBook", args: [bookInventory] })
}

export function submitAssemblyBlueprintBookTask(assembly: UserAssembly, stack: LuaItemStack): void {
  const builder = new BlueprintCreationTaskBuilder()
  addBlueprintBookTasks(builder, assembly, stack)
  submitTask(builder.build(L_GuiBlueprintBookTask.AssemblingBlueprintBook))
}

export function exportBlueprintBookToFile(assembly: UserAssembly, player: LuaPlayer): string | nil {
  const builder = new BlueprintCreationTaskBuilder()
  const stack = builder.getNewTempStack()
  stack.set_stack("blueprint-book")

  addBlueprintBookTasks(builder, assembly, stack)

  let name = assembly.name.get()
  if (name == "") name = `Unnamed-build-${assembly.id}`
  ;[name] = string.gsub(name, "[^%w%-%_%.]", "_")
  name = `staged-builds/${name}.txt`

  builder.addTask({
    name: "exportBlueprintBookToFile",
    args: [stack, name, player],
  })

  const task = builder.build(L_GuiBlueprintBookTask.AssemblingBlueprintBook)
  submitTask(task)

  return name
}
