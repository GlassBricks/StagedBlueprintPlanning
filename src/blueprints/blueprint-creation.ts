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

import { BlueprintEntity, LocalisedString, LuaInventory, LuaItemStack, LuaPlayer, UnitNumber } from "factorio:runtime"
import { Entity } from "../entity/Entity"
import { ProjectEntity, StageNumber } from "../entity/ProjectEntity"
import { assertNever, getKeySet, Mutable, RegisterClass } from "../lib"
import { BBox, Pos, Position } from "../lib/geometry"
import { EnumeratedItemsTask, runEntireTask, submitTask } from "../lib/task"
import { L_GuiBlueprintBookTask } from "../locale"
import { Stage, UserProject } from "../project/ProjectDef"
import { setTilesAndCheckerboardForStage } from "../project/set-tiles"
import { getCurrentValues } from "../utils/properties-obj"
import {
  getDefaultBlueprintSettings,
  OverrideableBlueprintSettings,
  StageBlueprintSettings,
} from "./blueprint-settings"
import { showBlueprintString } from "./ShowBlueprintString"
import { getReferencedStage } from "./stage-reference"
import { BlueprintTakeResult, takeSingleBlueprint } from "./take-single-blueprint"
import max = math.max

class Ref<T extends AnyNotNil> {
  private value?: T
  set(value: T) {
    assert(!this.value, "value already set")
    this.value = value
  }

  get(): T {
    return assert(this.value, "value not set")[0]
  }
}

interface ProjectBlueprintPlan {
  project: UserProject
  // other stuff will go here eventually
  stagePlans: LuaMap<StageNumber, StageBlueprintPlan>

  changedEntities?: Ref<LuaMap<StageNumber, LuaSet<ProjectEntity>>>
  moduleOverrides?: Ref<LuaMap<UnitNumber, Record<string, number>>>
}

interface StageBlueprintPlan {
  stage: Stage

  projectPlan: ProjectBlueprintPlan

  stack: LuaItemStack | nil
  additionalBpStacks?: LuaItemStack[]

  bbox: BBox
  settings: StageBlueprintSettings

  result: BlueprintTakeResult | nil

  unitNumberFilter?: LuaSet<UnitNumber> | nil
}

function getCurrentBpSettings(stage: Stage): StageBlueprintSettings {
  return getCurrentValues(stage.getBlueprintSettingsView())
}

type BlueprintMethod<A extends any[]> = (this: void, ...args: A) => void

const BlueprintMethods = {
  computeChangedEntities(projectPlan: ProjectBlueprintPlan): void {
    const project = projectPlan.project
    const result = new LuaMap<StageNumber, LuaSet<ProjectEntity>>()
    for (const i of $range(1, project.numStages())) {
      result.set(i, new LuaSet())
    }
    const content = project.content
    for (const entity of content.allEntities()) {
      const firstStageMap = result.get(entity.firstStage)!
      firstStageMap.add(entity)

      const diffs = entity.stageDiffs
      if (diffs) {
        for (const [stage] of pairs(diffs)) {
          result.get(stage)!.add(entity)
        }
      }
      const circuitConnections = entity.circuitConnections
      if (circuitConnections) {
        for (const [otherEntity] of circuitConnections) {
          firstStageMap.add(otherEntity)
        }
      }
    }

    projectPlan.changedEntities!.set(result)
  },

  computeUnitNumberFilter(projectPlan: ProjectBlueprintPlan, stagePlan: StageBlueprintPlan, stageLimit: number): void {
    const stageNumber = stagePlan.stage.stageNumber
    const minStage = max(1, stageNumber - stageLimit + 1)
    const maxStage = stageNumber

    const changedEntities = projectPlan.changedEntities!.get()

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
  },
  computeModuleOverrides(projectPlan: ProjectBlueprintPlan): void {
    const project = projectPlan.project
    const assemblingMachineNames = getKeySet(
      game.get_filtered_entity_prototypes([
        {
          filter: "type",
          type: "assembling-machine",
        },
      ]),
    )
    const result = new LuaMap<UnitNumber, Record<string, number>>()
    for (const entity of project.content.allEntities()) {
      const firstValue = entity.firstValue
      if (firstValue.items || !assemblingMachineNames.has(firstValue.name)) continue
      const [firstDiffStage, newItems] = entity.getFirstStageDiffForProp("items")
      if (!firstDiffStage) continue
      for (const stage of $range(entity.firstStage, firstDiffStage - 1)) {
        const worldEntity = entity.getWorldEntity(stage)
        if (!worldEntity) continue
        const un = worldEntity.unit_number
        if (!un) continue
        result.set(un, newItems!)
      }
    }
    projectPlan.moduleOverrides!.set(result)
  },

  setLandfill: setTilesAndCheckerboardForStage,

  takeStageBlueprint(
    stagePlan: StageBlueprintPlan,
    actualStack: LuaItemStack,
    settings: OverrideableBlueprintSettings,
  ): void {
    const { stage, bbox } = stagePlan
    const stageName = stage.name.get()
    const result = takeSingleBlueprint({
      stack: actualStack,
      settings,
      surface: stage.surface,
      bbox,
      unitNumberFilter: stagePlan.unitNumberFilter,
      stageName,
    })
    stagePlan.result = result
    actualStack.label = stageName

    if (result && settings.useModulePreloading) {
      const moduleOverrides = stagePlan.projectPlan.moduleOverrides!.get()
      const { entities, bpMapping } = result
      for (const [entityNumber, luaEntity] of pairs(bpMapping)) {
        const un = luaEntity.unit_number
        if (!un) continue
        const overrides = moduleOverrides.get(un)
        if (!overrides) continue
        const entity = entities[entityNumber]
        if (!entity) continue
        ;(entity as Mutable<Entity>).items = overrides
      }
      actualStack.set_blueprint_entities(entities as BlueprintEntity[])
    }

    if (stagePlan.additionalBpStacks) {
      for (const stack of stagePlan.additionalBpStacks) {
        stack.set_stack(actualStack)
      }
    }
  },
  setNextStageTiles(curStage: StageBlueprintPlan, nextStage: StageBlueprintPlan): void {
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
  },
  exportBlueprintBookToFile(stack: LuaItemStack, fileName: string, player: LuaPlayer): void {
    const [projectFileName] = string.gsub(fileName, "[^%w%-%_%.]", "_")
    const filename = `staged-builds/${projectFileName}.txt`
    const data = stack.export_stack()
    game.write_file(filename, data, false, player.index)
  },
  showBlueprintBookString(stack: LuaItemStack, player: LuaPlayer): void {
    const title = stack.label ?? "<unnamed>"
    const blueprintString = stack.export_stack()
    stack.export_stack()
    showBlueprintString(player, title, blueprintString)
  },
} satisfies Record<string, BlueprintMethod<any>>

type BlueprintStep = {
  [K in keyof typeof BlueprintMethods]: {
    name: K
    args: Parameters<(typeof BlueprintMethods)[K]>
  }
}[keyof typeof BlueprintMethods]

function getStepTitle(task: BlueprintStep): LocalisedString {
  switch (task.name) {
    case "takeStageBlueprint": {
      const stagePlan = task.args[0]
      return [L_GuiBlueprintBookTask.TakeStageBlueprint, stagePlan.stage.name.get()]
    }
    case "computeChangedEntities":
    case "computeModuleOverrides": {
      const projectPlan = task.args[0]
      return [L_GuiBlueprintBookTask.PreparingProject, projectPlan.project.displayName().get()]
    }
    case "computeUnitNumberFilter": {
      const stagePlan = task.args[1]
      return [L_GuiBlueprintBookTask.PreparingStage, stagePlan.stage.name.get()]
    }
    case "setLandfill": {
      const stage = task.args[0]
      return [L_GuiBlueprintBookTask.SetLandfillTiles, stage.name.get()]
    }
    case "setNextStageTiles": {
      const curStage = task.args[0]
      return [L_GuiBlueprintBookTask.SetNextStageTiles, curStage.stage.name.get()]
    }
    case "exportBlueprintBookToFile":
    case "showBlueprintBookString": {
      return [L_GuiBlueprintBookTask.ExportBlueprintBook]
    }
    default:
      assertNever(task)
  }
}
@RegisterClass("BlueprintCreationTask")
class BlueprintCreationTask extends EnumeratedItemsTask<BlueprintStep> {
  constructor(
    steps: BlueprintStep[],
    private inventory?: LuaInventory,
    private title?: LocalisedString,
  ) {
    super(steps)
  }
  override getTitle(): LocalisedString {
    return this.title
  }

  protected override doTask(task: BlueprintStep): void {
    const method = BlueprintMethods[task.name]
    ;(method as (this: void, ...args: any) => void)(...task.args)
  }

  protected override getTitleForTask(task: BlueprintStep): LocalisedString {
    return getStepTitle(task)
  }
  protected override done(): void {
    if (this.inventory?.valid) this.inventory.destroy()
  }
  override cancel(): void {
    this.done()
  }
}

class BlueprintingTaskBuilder {
  private inventory?: LuaInventory
  private projectPlans = new LuaMap<UserProject, ProjectBlueprintPlan>()
  private tasks: BlueprintStep[] = []

  private getPlanForProject(project: UserProject): ProjectBlueprintPlan {
    if (!this.projectPlans.has(project)) {
      this.projectPlans.set(project, { project, stagePlans: new LuaMap() })
    }
    return this.projectPlans.get(project)!
  }

  private addNewStagePlan(
    projectPlan: ProjectBlueprintPlan,
    stack: LuaItemStack | nil,
    stage: Stage,
    settings: StageBlueprintSettings,
  ): StageBlueprintPlan {
    const plan: StageBlueprintPlan = {
      stack,
      stage,
      bbox: stage.getBlueprintBBox(),
      projectPlan,
      settings,
      result: nil,
    }
    projectPlan.stagePlans.set(stage.stageNumber, plan)
    return plan
  }

  private ensureTilesTaken(projectInfo: ProjectBlueprintPlan, stage: Stage) {
    const stagePlan = projectInfo.stagePlans.get(stage.stageNumber)
    if (!stagePlan) {
      this.addNewStagePlan(projectInfo, nil, stage, getCurrentBpSettings(stage))
    }
  }

  queueBlueprintTask(
    stage: Stage,
    stack: LuaItemStack,
  ):
    | {
        result: BlueprintTakeResult | nil
      }
    | nil {
    const projectPlan = this.getPlanForProject(stage.project)
    const existingStagePlan = projectPlan.stagePlans.get(stage.stageNumber)
    if (existingStagePlan) {
      if (!existingStagePlan.stack) {
        existingStagePlan.stack = stack
      } else {
        ;(existingStagePlan.additionalBpStacks ??= []).push(stack)
        return nil
      }
    }

    const settings = existingStagePlan?.settings ?? getCurrentBpSettings(stage)
    if (settings.useNextStageTiles) {
      const nextStage = stage.project.getStage(stage.stageNumber + 1)
      if (nextStage) this.ensureTilesTaken(projectPlan, nextStage)
    }

    const plan = existingStagePlan ?? this.addNewStagePlan(projectPlan, stack, stage, settings)
    return plan
  }

  addAllBpTasks(): this {
    for (const [, projectPlan] of this.projectPlans) {
      for (const [, stagePlan] of projectPlan.stagePlans) {
        this.addTakeBlueprintTasks(projectPlan, stagePlan)
      }
      this.addSetNextStageTilesTask(projectPlan.stagePlans)
    }
    return this
  }

  addTask(task: BlueprintStep): this {
    this.tasks.push(task)
    return this
  }

  build(taskTitle: (LocalisedString & object) | nil): BlueprintCreationTask {
    return new BlueprintCreationTask(this.tasks, this.inventory, taskTitle)
  }

  private addSetNextStageTilesTask(stagePlans: LuaMap<StageNumber, StageBlueprintPlan>): void {
    for (const [stageNumber, curStage] of stagePlans) {
      // factorio guarantees this loop is done in ascending stageNumber order (if <= 1024 stages)
      if (curStage.settings.useNextStageTiles) {
        const nextStagePlan = stagePlans.get(stageNumber + 1)!
        if (!nextStagePlan) continue
        this.tasks.push({ name: "setNextStageTiles", args: [curStage, nextStagePlan] })
      }
    }
  }

  private addTakeBlueprintTasks(projectPlan: ProjectBlueprintPlan, stagePlan: StageBlueprintPlan): void {
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
      this.tasks.push({ name: "setLandfill", args: [stage] })
    }

    if (settings.stageLimit != nil) {
      this.ensureHasComputeChangedEntities(projectPlan)
      this.tasks.push({ name: "computeUnitNumberFilter", args: [projectPlan, stagePlan, settings.stageLimit] })
    }
    if (settings.useModulePreloading) {
      this.ensureHasComputeModuleOverrides(projectPlan)
    }
    this.tasks.push({ name: "takeStageBlueprint", args: [stagePlan, actualStack, settings] })
  }

  private ensureHasComputeChangedEntities(projectInfo: ProjectBlueprintPlan): void {
    if (!projectInfo.changedEntities) {
      projectInfo.changedEntities = new Ref()
      this.tasks.push({ name: "computeChangedEntities", args: [projectInfo] })
    }
  }
  private ensureHasComputeModuleOverrides(projectInfo: ProjectBlueprintPlan): void {
    if (!projectInfo.moduleOverrides) {
      projectInfo.moduleOverrides = new Ref()
      this.tasks.push({ name: "computeModuleOverrides", args: [projectInfo] })
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
  const builder = new BlueprintingTaskBuilder()
  const plan = builder.queueBlueprintTask(stage, stack)
  const task = builder.addAllBpTasks().build(nil)
  runEntireTask(task)
  return plan?.result != nil
}

function addCreateDefaultBookTasks(builder: BlueprintingTaskBuilder, project: UserProject, stack: LuaItemStack) {
  stack.set_stack("blueprint-book")
  stack.label = project.name.get()
  const bookInventory = stack.get_inventory(defines.inventory.item_main)!

  for (const stage of project.getAllStages()) {
    bookInventory.insert("blueprint")
    const bpStack = bookInventory[bookInventory.length - 1]
    builder.queueBlueprintTask(stage, bpStack)
  }
  builder.addAllBpTasks()
}

function addCompileBookTemplateTasks(
  builder: BlueprintingTaskBuilder,
  srcStack: LuaItemStack,
  destStack: LuaItemStack,
): void {
  if (!destStack.set_stack(srcStack)) return

  function visit(book: LuaItemStack) {
    const bookInventory = book.get_inventory(defines.inventory.item_main)!
    for (let i = 0; i < bookInventory.length; i++) {
      const bpStack = bookInventory[i]
      if (!bpStack.valid_for_read) continue

      const stage = getReferencedStage(bpStack)
      if (stage) {
        bpStack.set_stack("blueprint")
        builder.queueBlueprintTask(stage, bpStack)
        continue
      }
      if (bpStack.is_blueprint_book) {
        visit(bpStack)
      }
    }
  }
  visit(destStack)
  builder.addAllBpTasks()
}

function addBlueprintBookTasks(project: UserProject, builder: BlueprintingTaskBuilder, stack: LuaItemStack): void {
  const template = project.getBlueprintBookTemplate()
  if (template) {
    addCompileBookTemplateTasks(builder, template, stack)
  } else {
    addCreateDefaultBookTasks(builder, project, stack)
  }
}

export function submitProjectBlueprintBookTask(project: UserProject, stack: LuaItemStack): void {
  const builder = new BlueprintingTaskBuilder()
  addBlueprintBookTasks(project, builder, stack)
  submitTask(builder.build([L_GuiBlueprintBookTask.AssemblingBlueprintBook]))
}

export function exportBlueprintBookToFile(project: UserProject, player: LuaPlayer): string | nil {
  const builder = new BlueprintingTaskBuilder()
  const stack = builder.getNewTempStack()
  stack.set_stack("blueprint-book")

  addBlueprintBookTasks(project, builder, stack)

  let name = project.name.get()
  if (name == "") name = `Unnamed-build-${project.id}`
  name = string.gsub(name, "[^%w%-%_%.]", "_")[0]
  name = `staged-blueprints/${name}`

  builder.addTask({
    name: "exportBlueprintBookToFile",
    args: [stack, name, player],
  })

  const task = builder.build([L_GuiBlueprintBookTask.AssemblingBlueprintBook])
  submitTask(task)

  return name
}

export function exportBlueprintBookToString(project: UserProject, player: LuaPlayer): void {
  const builder = new BlueprintingTaskBuilder()
  const stack = builder.getNewTempStack()
  stack.set_stack("blueprint-book")

  addBlueprintBookTasks(project, builder, stack)

  builder.addTask({
    name: "showBlueprintBookString",
    args: [stack, player],
  })

  const task = builder.build([L_GuiBlueprintBookTask.AssemblingBlueprintBook])
  submitTask(task)
}
