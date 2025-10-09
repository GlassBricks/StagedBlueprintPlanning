// Copyright (c) 2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { LocalisedString, LuaInventory, LuaItemStack, LuaPlayer, UnitNumber } from "factorio:runtime"
import { UnstagedEntityProps } from "../entity/Entity"
import { ProjectEntity, StageNumber } from "../entity/ProjectEntity"
import { isEmpty, RegisterClass } from "../lib"
import { BBox } from "../lib/geometry"
import { EnumeratedItemsTask, runEntireTask, submitTask } from "../lib/task"
import { L_GuiBlueprintBookTask, L_GuiProjectSettings } from "../locale"
import { Stage, UserProject } from "../project/ProjectDef"
import { showBlueprintString } from "../ui/blueprint-string"
import { getCurrentValues } from "../utils/properties-obj"
import {
  BlueprintTakeSettings,
  getDefaultBlueprintSettings,
  OverrideableBlueprintSettings,
  StageBlueprintSettings,
} from "./blueprint-settings"
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
  stagePlans: LuaMap<StageNumber, StageBlueprintPlan>

  excludeFromFutureBlueprintStages: LuaSet<StageNumber>

  firstStageEntities?: Ref<LuaMap<StageNumber, LuaSet<ProjectEntity>>>
  changedEntities?: Ref<LuaMap<StageNumber, LuaSet<ProjectEntity>>>
}

interface StageBlueprintPlan {
  stage: Stage

  projectPlan: ProjectBlueprintPlan

  stack: LuaItemStack | nil
  additionalBpStacks?: LuaItemStack[]

  bbox: BBox
  overridableSettings: OverrideableBlueprintSettings
  stageSettings: StageBlueprintSettings

  result: BlueprintTakeResult | nil

  unitNumberFilter?: LuaSet<UnitNumber> | nil
  additionalSettings?: LuaMap<UnitNumber, UnstagedEntityProps> | nil
}

function getCurrentOverridableBpSettings(stage: Stage): OverrideableBlueprintSettings {
  return getCurrentValues(stage.getBlueprintSettingsView())
}

function getCurrentBpStageSettings(stage: Stage): StageBlueprintSettings {
  return getCurrentValues(stage.stageBlueprintSettings)
}

interface BlueprintStep {
  run(): void
  title(): LocalisedString
}

class ComputeChangedEntitiesStep implements BlueprintStep {
  constructor(readonly projectPlan: ProjectBlueprintPlan) {}

  run(): void {
    const project = this.projectPlan.project
    const changedEntities = new LuaMap<StageNumber, LuaSet<ProjectEntity>>()
    const firstStageEntities = new LuaMap<StageNumber, LuaSet<ProjectEntity>>()
    for (const i of $range(1, project.numStages())) {
      changedEntities.set(i, new LuaSet())
      firstStageEntities.set(i, new LuaSet())
    }
    const content = project.content
    for (const entity of content.allEntities()) {
      const firstStageMap = firstStageEntities.get(entity.firstStage)!
      firstStageMap.add(entity)

      const wireConnections = entity.wireConnections
      if (wireConnections) {
        for (const [otherEntity] of wireConnections) {
          firstStageMap.add(otherEntity)
        }
      }

      const diffs = entity.stageDiffs
      if (diffs) {
        for (const [stage] of pairs(diffs)) {
          changedEntities.get(stage)!.add(entity)
        }
      }
    }

    this.projectPlan.changedEntities!.set(changedEntities)
    this.projectPlan.firstStageEntities!.set(firstStageEntities)
  }

  title(): LocalisedString {
    return [L_GuiBlueprintBookTask.PreparingProject, this.projectPlan.project.displayName().get()]
  }
}

class ComputeUnitNumberFilterStep implements BlueprintStep {
  constructor(
    readonly projectPlan: ProjectBlueprintPlan,
    readonly stagePlan: StageBlueprintPlan,
    readonly stageLimit: number | nil,
  ) {}

  run(): void {
    const stageNumber = this.stagePlan.stage.stageNumber
    const stageLimit = this.stageLimit ?? Infinity
    const minStage = max(1, stageNumber - stageLimit + 1)
    const maxStage = stageNumber

    const changedEntities = this.projectPlan.changedEntities!.get()
    const firstStageEntities = this.projectPlan.firstStageEntities!.get()

    const result = new LuaSet<UnitNumber>()
    for (const stage of $range(minStage, maxStage)) {
      for (const entity of changedEntities.get(stage)!) {
        const luaEntity = entity.getWorldOrPreviewEntity(stageNumber)
        if (!luaEntity) continue
        const unitNumber = luaEntity.unit_number
        if (unitNumber) result.add(unitNumber)
      }
      if (stage == stageNumber || !this.projectPlan.excludeFromFutureBlueprintStages.has(stage)) {
        for (const entity of firstStageEntities.get(stage)!) {
          const luaEntity = entity.getWorldOrPreviewEntity(stageNumber)
          if (!luaEntity) continue
          const unitNumber = luaEntity.unit_number
          if (unitNumber) result.add(unitNumber)
        }
      }
    }

    this.stagePlan.unitNumberFilter = result
  }

  title(): LocalisedString {
    return [L_GuiBlueprintBookTask.PreparingStage, this.stagePlan.stage.name.get()]
  }
}

class TakeStageBlueprintStep implements BlueprintStep {
  constructor(
    readonly stagePlan: StageBlueprintPlan,
    readonly actualStack: LuaItemStack,
    readonly overrideableSettings: OverrideableBlueprintSettings,
    readonly stageSettings: StageBlueprintSettings,
  ) {}

  run(): void {
    const { stage, bbox } = this.stagePlan
    const stageName = stage.name.get()
    const result = takeSingleBlueprint({
      stack: this.actualStack,
      settings: this.overrideableSettings satisfies BlueprintTakeSettings,
      surface: stage.surface,
      bbox,
      unitNumberFilter: this.stagePlan.unitNumberFilter,
      additionalSettings: this.stagePlan.additionalSettings,
      stageName,
    })
    this.stagePlan.result = result
    if (this.actualStack.is_blueprint && this.actualStack.is_blueprint_setup()) {
      this.actualStack.label = stageName
      this.actualStack.blueprint_description = this.stageSettings.description
    }

    if (this.stagePlan.additionalBpStacks) {
      for (const stack of this.stagePlan.additionalBpStacks) {
        stack.set_stack(this.actualStack)
      }
    }
  }

  title(): LocalisedString {
    return [L_GuiBlueprintBookTask.TakeStageBlueprint, this.stagePlan.stage.name.get()]
  }
}

class ExportBlueprintBookToFileStep implements BlueprintStep {
  constructor(
    readonly stack: LuaItemStack,
    readonly fileName: string,
    readonly player: LuaPlayer,
  ) {}

  run(): void {
    const [projectFileName] = string.gsub(this.fileName, "[^%w%-%_%.]", "_")
    const filename = `staged-builds/${projectFileName}.txt`
    const data = this.stack.export_stack()
    helpers.write_file(filename, data, false, this.player.index)
  }

  title(): LocalisedString {
    return [L_GuiBlueprintBookTask.ExportBlueprintBook]
  }
}

class ComputeAdditionalSettingsStep implements BlueprintStep {
  constructor(readonly stagePlan: StageBlueprintPlan) {}

  run(): void {
    const stage = this.stagePlan.stage
    const stageNumber = stage.stageNumber
    const project = stage.project
    const content = project.content

    const additionalSettings = new LuaMap<UnitNumber, UnstagedEntityProps>()
    for (const entity of content.allEntities()) {
      if (entity.firstStage > stageNumber || (entity.lastStage && entity.lastStage < stageNumber)) continue

      const unstagedValue = entity.getUnstagedValue(stageNumber)
      if (unstagedValue) {
        const luaEntity = entity.getWorldOrPreviewEntity(stageNumber)
        if (luaEntity && luaEntity.unit_number) {
          additionalSettings.set(luaEntity.unit_number, unstagedValue)
        }
      }
    }

    this.stagePlan.additionalSettings = isEmpty(additionalSettings) ? nil : additionalSettings
  }

  title(): LocalisedString {
    return [L_GuiBlueprintBookTask.PreparingStage, this.stagePlan.stage.name.get()]
  }
}

class ShowBlueprintBookStringStep implements BlueprintStep {
  constructor(
    readonly stack: LuaItemStack,
    readonly player: LuaPlayer,
  ) {}

  run(): void {
    const title = this.stack.label ?? "<unnamed>"
    const blueprintString = this.stack.export_stack()
    showBlueprintString(this.player, L_GuiProjectSettings.BlueprintStringFor, title, blueprintString)
  }

  title(): LocalisedString {
    return [L_GuiBlueprintBookTask.ExportBlueprintBook]
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
    task.run()
  }

  protected override getTitleForTask(task: BlueprintStep): LocalisedString {
    return task.title()
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
      const plan: ProjectBlueprintPlan = {
        project,
        stagePlans: new LuaMap(),
        excludeFromFutureBlueprintStages: new LuaSet(),
      }
      for (const stage of project.getAllStages()) {
        if (stage.getBlueprintSettingsView().excludeFromFutureBlueprints.get())
          plan.excludeFromFutureBlueprintStages.add(stage.stageNumber)
      }
      this.projectPlans.set(project, plan)
    }
    return this.projectPlans.get(project)!
  }

  private addNewStagePlan(
    projectPlan: ProjectBlueprintPlan,
    stack: LuaItemStack | nil,
    stage: Stage,
    overridableSettings: OverrideableBlueprintSettings,
    stageSettings: StageBlueprintSettings,
  ): StageBlueprintPlan {
    const plan: StageBlueprintPlan = {
      stack,
      stage,
      bbox: stage.getBlueprintBBox(),
      projectPlan,
      overridableSettings,
      stageSettings,
      result: nil,
    }
    projectPlan.stagePlans.set(stage.stageNumber, plan)
    return plan
  }

  private ensureTilesTaken(projectInfo: ProjectBlueprintPlan, stage: Stage) {
    const stagePlan = projectInfo.stagePlans.get(stage.stageNumber)
    if (!stagePlan) {
      this.addNewStagePlan(
        projectInfo,
        nil,
        stage,
        getCurrentOverridableBpSettings(stage),
        getCurrentBpStageSettings(stage),
      )
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

    const settings = existingStagePlan?.overridableSettings ?? getCurrentOverridableBpSettings(stage)
    const stageSettings = existingStagePlan?.stageSettings ?? getCurrentBpStageSettings(stage)
    const plan = existingStagePlan ?? this.addNewStagePlan(projectPlan, stack, stage, settings, stageSettings)
    return plan
  }

  addAllBpTasks(): this {
    for (const [, projectPlan] of this.projectPlans) {
      for (const [, stagePlan] of projectPlan.stagePlans) {
        this.addTakeBlueprintTasks(projectPlan, stagePlan)
      }
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

  private addTakeBlueprintTasks(projectPlan: ProjectBlueprintPlan, stagePlan: StageBlueprintPlan): void {
    const { stack } = stagePlan
    let blueprintTakeSettings: BlueprintTakeSettings = stagePlan.overridableSettings

    let actualStack: LuaItemStack

    if (!stack) {
      stagePlan.stack = actualStack = this.getNewTempStack()
      blueprintTakeSettings = getDefaultBlueprintSettings()
    } else {
      actualStack = stack
    }
    if (blueprintTakeSettings.stageLimit != nil || !projectPlan.excludeFromFutureBlueprintStages.isEmpty()) {
      this.ensureHasComputeChangedEntities(projectPlan)
      this.tasks.push(new ComputeUnitNumberFilterStep(projectPlan, stagePlan, blueprintTakeSettings.stageLimit))
    }
    this.tasks.push(new ComputeAdditionalSettingsStep(stagePlan))
    this.tasks.push(new TakeStageBlueprintStep(stagePlan, actualStack, blueprintTakeSettings, stagePlan.stageSettings))
  }

  private ensureHasComputeChangedEntities(projectInfo: ProjectBlueprintPlan): void {
    if (!projectInfo.changedEntities) {
      projectInfo.changedEntities = new Ref()
      projectInfo.firstStageEntities = new Ref()
      this.tasks.push(new ComputeChangedEntitiesStep(projectInfo))
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

  builder.addTask(new ExportBlueprintBookToFileStep(stack, name, player))

  const task = builder.build([L_GuiBlueprintBookTask.AssemblingBlueprintBook])
  submitTask(task)

  return name
}

export function exportBlueprintBookToString(project: UserProject, player: LuaPlayer): void {
  const builder = new BlueprintingTaskBuilder()
  const stack = builder.getNewTempStack()
  stack.set_stack("blueprint-book")

  addBlueprintBookTasks(project, builder, stack)

  builder.addTask(new ShowBlueprintBookStringStep(stack, player))

  const task = builder.build([L_GuiBlueprintBookTask.AssemblingBlueprintBook])
  submitTask(task)
}
