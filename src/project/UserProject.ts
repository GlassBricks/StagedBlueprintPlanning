// Copyright (c) 2022-2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { LocalisedString, LuaEntity, LuaInventory, LuaItemStack, LuaSurface, nil, SurfaceIndex } from "factorio:runtime"
import { remove_from_list } from "util"
import {
  BlueprintSettingsOverrideTable,
  BlueprintSettingsTable,
  createBlueprintSettingsTable,
  createStageBlueprintSettingsTable,
  OverrideableBlueprintSettings,
  StageBlueprintSettingsTable,
} from "../blueprints/blueprint-settings"
import { createStageReference, getReferencedStage } from "../blueprints/stage-reference"
import { Prototypes } from "../constants"
import { newProjectContent } from "../entity/ProjectContent"
import { StageNumber } from "../entity/ProjectEntity"
import { StagedValue } from "../entity/StagedValue"
import {
  bind,
  Events,
  globalEvent,
  ibind,
  Mutable,
  MutableProperty,
  property,
  Property,
  RegisterClass,
  SimpleEvent,
  Subscription,
} from "../lib"
import { BBox } from "../lib/geometry"
import { LazyLoadClass } from "../lib/LazyLoad"
import { L_Bp100 } from "../locale"
import { createdDiffedPropertyTableView, createEmptyPropertyOverrideTable } from "../utils/properties-obj"
import { EntityHighlights } from "./entity-highlights"
import { getStageAtSurface } from "./project-refs"
import { ProjectUpdates } from "./project-updates"
import { GlobalProjectEvent, LocalProjectEvent, ProjectId, Stage, StageId, UserProject } from "./ProjectDef"
import {
  createStageSurface,
  destroySurface,
  getDefaultSurfaceSettings,
  SurfaceSettings,
  updateStageSurfaceName,
} from "./surfaces"
import { UserActions } from "./user-actions"
import { WorldUpdates } from "./world-updates"
import min = math.min

declare const storage: {
  nextProjectId: ProjectId
  // projects: LuaMap<ProjectId, UserProjectImpl>
  projects: UserProjectImpl[]
  surfaceIndexToStage: LuaMap<SurfaceIndex, StageImpl>
  nextStageId?: StageId

  allRecipesPromptShown?: never
}
Events.on_init(() => {
  storage.nextProjectId = 1 as ProjectId
  storage.projects = []
  storage.surfaceIndexToStage = new LuaMap()
})

const GlobalProjectEvents = globalEvent<[GlobalProjectEvent]>()
export { GlobalProjectEvents as ProjectEvents }

declare const luaLength: LuaLength<Record<number, any>, number>

export interface UserProjectInternal extends UserProject {
  registerEvents(): void
}

@RegisterClass("Assembly") // named differently for legacy reasons
class UserProjectImpl implements UserProjectInternal {
  name: MutableProperty<string>

  content = newProjectContent()
  localEvents = new SimpleEvent<LocalProjectEvent>()

  defaultBlueprintSettings = createBlueprintSettingsTable()
  surfaceSettings: SurfaceSettings

  landfillTile = property<string | nil>("landfill")
  // disable tiles by default in tests, since its slow
  // the appropriate tests will enable it
  // force enabled for space platforms
  stagedTilesEnabled = property(!("factorio-test" in script.active_mods))

  valid = true
  private readonly stages: Record<number, StageImpl> = {}

  actions = UserActionsClass({ project: this })
  updates = ProjectUpdatesClass({ project: this })
  worldUpdates = WorldUpdatesClass({ project: this })

  private blueprintBookTemplateInv?: LuaInventory

  constructor(
    readonly id: ProjectId,
    name: string,
    initialNumStages: number,
    surfaceSettings: SurfaceSettings = getDefaultSurfaceSettings(),
  ) {
    this.name = property(name)
    this.surfaceSettings = surfaceSettings
    this.stages = {}
    for (const i of $range(1, initialNumStages)) {
      const [stage, hub] = StageImpl.create(this, i, `Stage ${i}`)
      this.stages[i] = stage
      if (hub) {
        this.actions.onEntityCreated(hub, i, nil)
      }
    }

    if (this.isSpacePlatform()) {
      this.stagedTilesEnabled.set(true)
    }
  }
  private static getDisplayName(this: void, id: ProjectId, name: string): LocalisedString {
    return name != "" ? name : [L_Bp100.UnnamedProject, id]
  }
  displayName(): Property<LocalisedString> {
    return this.name.map(bind(UserProjectImpl.getDisplayName, this.id))
  }

  isSpacePlatform(): boolean {
    return this.surfaceSettings.type == "spacePlatform"
  }

  static create(
    name: string,
    initialNumStages: number,
    surfaceSettings: SurfaceSettings = getDefaultSurfaceSettings(),
  ): UserProjectImpl {
    const project = new UserProjectImpl(storage.nextProjectId++ as ProjectId, name, initialNumStages, surfaceSettings)
    UserProjectImpl.onProjectCreated(project)
    project.registerEvents()

    return project
  }

  private subscription?: Subscription
  registerEvents() {
    if (this.subscription) return
    this.subscription = new Subscription()

    this.name.subscribe(this.subscription, ibind(this.onNameChange))
  }

  private onNameChange(newValue: string, oldValue: string) {
    const template = this.getBlueprintBookTemplate()
    if (template != nil && template.label == oldValue) {
      template.label = newValue
    }

    for (const [, stage] of pairs(this.stages)) {
      updateStageSurfaceName(stage.surface, newValue, stage.name.get())
    }
  }

  getSurface(stageNum: StageNumber): LuaSurface | nil {
    const stage = this.stages[stageNum]
    return stage && stage.surface
  }
  getStage(stageNumber: StageNumber): Stage | nil {
    return this.stages[stageNumber]
  }
  numStages(): StageNumber {
    return luaLength(this.stages)
  }
  lastStageFor(value: StagedValue<any, any>): StageNumber {
    if (value.lastStage != nil) return min(value.lastStage, this.numStages())
    return this.numStages()
  }

  getAllStages(): readonly StageImpl[] {
    return this.stages as unknown as readonly StageImpl[]
  }
  getStageName(stageNumber: StageNumber): LocalisedString {
    return this.stages[stageNumber].name.get()
  }
  getStageById(stageId: StageId): Stage | nil {
    for (const [, stage] of pairs(this.stages)) {
      if (stage.id == stageId) return stage
    }
    return nil
  }

  insertStage(stage: StageNumber): Stage {
    this.assertValid()
    assert(stage >= 1 && stage <= this.numStages() + 1, "Invalid new stage number")

    const name = this._getNewStageName(stage)
    const [newStage] = StageImpl.create(this, stage, name)
    // hub gets added later

    table.insert(this.stages as unknown as Stage[], stage, newStage)
    // update stages
    for (const i of $range(stage, luaLength(this.stages))) {
      this.stages[i].stageNumber = i
    }
    this.content.insertStage(stage)

    const template = this.getBlueprintBookTemplate()
    if (template) {
      this.addStageToBlueprintBookTemplate(stage, template)
    }

    this.raiseEvent({ type: "stage-added", project: this, stage: newStage })
    return newStage
  }

  private deleteStage(index: StageNumber, isMerge: boolean): void {
    this.assertValid()
    const stage = this.stages[index]
    assert(stage != nil, "invalid stage number")
    if (this.numStages() == 1) {
      this.delete()
      return
    }

    this.raiseEvent({ type: "pre-stage-deleted", project: this, stage })

    stage._doDelete()
    table.remove(this.stages as unknown as Stage[], index)
    for (const i of $range(index, this.numStages())) {
      this.stages[i].stageNumber = i
    }

    if (isMerge) {
      this.content.mergeStage(index)
      const stageToUpdate = index == 1 ? 1 : index - 1
      this.worldUpdates.rebuildStage(stageToUpdate)
    } else {
      this.doDiscard(index)
    }

    this.raiseEvent({ type: "stage-deleted", project: this, stage })
  }

  private doDiscard(stage: StageNumber): void {
    const [deletedEntities, updatedEntities, updatedTiles] = this.content.discardStage(stage)
    for (const entity of deletedEntities) {
      this.updates.forceDeleteEntity(entity)
    }
    for (const entity of updatedEntities) {
      this.worldUpdates.updateWorldEntities(entity, stage)
    }
    for (const tilePosition of updatedTiles) {
      this.worldUpdates.updateTilesInRange(tilePosition, stage, nil)
    }
  }

  mergeStage(index: StageNumber): void {
    this.deleteStage(index, true)
  }

  discardStage(index: StageNumber): void {
    this.deleteStage(index, false)
  }

  getBlueprintBookTemplate(): LuaItemStack | nil {
    if (!this.blueprintBookTemplateInv?.valid) {
      return nil
    }
    const stack = this.blueprintBookTemplateInv[0]
    if (stack.valid_for_read && stack.is_blueprint_book) return stack
  }

  getOrCreateBlueprintBookTemplate(): LuaItemStack {
    if (this.blueprintBookTemplateInv == nil) {
      this.blueprintBookTemplateInv = game.create_inventory(1)
    }
    const stack = this.blueprintBookTemplateInv[0]
    if (!stack.valid_for_read || !stack.is_blueprint_book) {
      this.setInitialBlueprintBookTemplate(stack)
    }
    return stack
  }

  resetBlueprintBookTemplate(): void {
    this.blueprintBookTemplateInv?.destroy()
    this.blueprintBookTemplateInv = nil
  }

  private setInitialBlueprintBookTemplate(stack: LuaItemStack): void {
    stack.set_stack("blueprint-book")
    const inventory = stack.get_inventory(defines.inventory.item_main)!
    for (const stage of this.getAllStages()) {
      inventory.insert(Prototypes.StageReference)
      const bpStack = inventory[inventory.length - 1]
      createStageReference(bpStack, stage)
    }
    stack.label = this.name.get()
  }

  private addStageToBlueprintBookTemplate(newStage: StageNumber, stack: LuaItemStack): void {
    if (!stack.valid || !stack.valid_for_read || !stack.is_blueprint_book) return
    const inventory = stack.get_inventory(defines.inventory.item_main)!
    let prevStageIndex = -1
    for (const i of $range(inventory.length, 1, -1)) {
      const bookStack = inventory[i - 1]
      const stage = getReferencedStage(bookStack)
      if (stage != nil && stage.project == this && stage.stageNumber <= newStage) {
        prevStageIndex = i - 1
        break
      }
    }

    this.pushBpBookInventory(inventory, prevStageIndex + 1)
    createStageReference(inventory[prevStageIndex + 1], this.stages[newStage])
  }
  private pushBpBookInventory(inventory: LuaInventory, index: number): void {
    // while there is a stack at index, moves it to the next index
    let nextFreeSlot: number | nil = index
    while (nextFreeSlot < inventory.length && inventory[nextFreeSlot].valid_for_read) nextFreeSlot++
    const needsExpansion = nextFreeSlot == inventory.length
    if (needsExpansion) {
      // do some finagling to expand the book inventory
      const freeSlots = inventory.get_insertable_count(Prototypes.StageReference)
      inventory.insert({
        name: Prototypes.StageReference,
        count: freeSlots + 1,
      })
    }
    for (let i = nextFreeSlot - 1; i >= index; i--) {
      assert(inventory[i].swap_stack(inventory[i + 1]))
    }
    if (needsExpansion) {
      for (const i of $range(1, inventory.length - 1)) {
        const stack = inventory[i - 1]
        if (stack.valid_for_read && stack.name == Prototypes.StageReference && !stack.is_blueprint_setup()) {
          stack.clear()
        }
      }
    }
  }

  delete() {
    if (!this.valid) return
    remove_from_list(storage.projects, this)
    this.blueprintBookTemplateInv?.destroy()
    this.valid = false
    for (const [, stage] of pairs(this.stages)) {
      stage._doDelete()
    }
    this.raiseEvent({ type: "project-deleted", project: this })
    this.localEvents.closeAll()
    this.subscription?.close()
    delete this.subscription
  }

  _getNewStageName(stage: StageNumber): string {
    // try to detect naming convention:
    // (Anything)(number)

    const otherStageNum = stage == 1 ? 1 : stage - 1
    const otherStage = this.stages[otherStageNum]
    const previousName = otherStage.name.get()
    const [name, numStr] = string.match(previousName, "^(.-)(%d+)$")
    const num = tonumber(numStr)

    const foundNumber = name != nil && num != nil
    if (foundNumber) {
      // see if there is a previous number and separator, before the last number
      // follow naming convention
      const newNum = num + (stage == 1 ? -1 : 1)
      if (newNum >= 0) {
        const candidateName = name + newNum
        const nextName = this.stages[stage]?.name.get()
        if (candidateName != nextName) {
          return candidateName
        }
      }
    }

    if (stage == 1) return "New Stage"
    const sep = string.match(previousName, "^.*%d+([^%d]+)%d+$")[0] ?? (foundNumber ? "." : " ")
    return previousName + sep + "1"
  }

  private raiseEvent(event: LocalProjectEvent): void {
    // local first, more useful event order
    this.localEvents.raise(event)
    GlobalProjectEvents.raise(event)
  }
  private assertValid(): void {
    if (!this.valid) error("Project is invalid")
  }

  __tostring(): string {
    return `<Project ${this.id} "${this.name.get()}">`
  }

  static onProjectCreated(project: UserProjectImpl): void {
    storage.projects.push(project)
    GlobalProjectEvents.raise({ type: "project-created", project })
  }
}

interface HasProject {
  project: UserProject
}

const UserActionsClass = LazyLoadClass<HasProject, UserActions>("UserActions", ({ project }) =>
  UserActions(project, project.updates, project.worldUpdates),
)
const ProjectUpdatesClass = LazyLoadClass<HasProject, ProjectUpdates>("ProjectUpdates", ({ project }) =>
  ProjectUpdates(project, project.worldUpdates),
)
const WorldUpdatesClass = LazyLoadClass<HasProject, WorldUpdates>("WorldUpdates", ({ project }) =>
  WorldUpdates(project, EntityHighlights(project)),
)

export function createUserProject(
  name: string,
  initialNumStages: number,
  surfaceSettings: SurfaceSettings = getDefaultSurfaceSettings(),
): UserProject {
  return UserProjectImpl.create(name, initialNumStages, surfaceSettings)
}

export function _deleteAllProjects(): void {
  while (storage.projects.length > 0) {
    storage.projects[0].delete()
  }
  assert(storage.projects.length == 0)
  storage.nextStageId = nil
  storage.nextProjectId = 1 as ProjectId
}
export function getAllProjects(): readonly UserProject[] {
  return storage.projects
}

function swapProjects(index1: number, index2: number): void {
  const projects = storage.projects
  const temp = projects[index1]
  projects[index1] = projects[index2]
  projects[index2] = temp
  GlobalProjectEvents.raise({
    type: "projects-reordered",
    project1: projects[index1],
    project2: projects[index2],
  })
}
export function moveProjectUp(project: UserProject): boolean {
  // up means lower index
  const index = storage.projects.indexOf(project as UserProjectImpl)
  if (index <= 0) return false
  swapProjects(index - 1, index)
  return true
}

export function moveProjectDown(project: UserProject): boolean {
  // down means higher index
  const index = storage.projects.indexOf(project as UserProjectImpl)
  if (index < 0 || index >= storage.projects.length - 1) return false
  swapProjects(index, index + 1)
  return true
}

function createEmptyBlueprintOverrideSettings(): BlueprintSettingsOverrideTable {
  return createEmptyPropertyOverrideTable<OverrideableBlueprintSettings>(keys<OverrideableBlueprintSettings>())
}

export interface StageInternal extends Stage {
  registerEvents(): void
}

@RegisterClass("Stage")
class StageImpl implements StageInternal {
  name: MutableProperty<string>
  readonly valid = true

  readonly surfaceIndex: SurfaceIndex

  // should be named blueprintOverrideSettings, kept this way for compatibility reasons
  blueprintOverrideSettings: BlueprintSettingsOverrideTable = createEmptyBlueprintOverrideSettings()

  stageBlueprintSettings: StageBlueprintSettingsTable = createStageBlueprintSettingsTable()

  actions: UserActions

  id?: StageId

  private subscription?: Subscription

  constructor(
    public project: UserProjectImpl,
    readonly surface: LuaSurface,
    public stageNumber: StageNumber,
    name: string,
  ) {
    this.name = property(name)
    this.surfaceIndex = surface.index
    if (project.id != 0) storage.surfaceIndexToStage.set(this.surfaceIndex, this)
    this.actions = project.actions
  }

  registerEvents(): void {
    if (this.subscription) return
    this.subscription = new Subscription()

    this.name.subscribe(this.subscription, ibind(this.onNameChange))
  }

  private onNameChange(newName: string): void {
    updateStageSurfaceName(this.surface, this.project.name.get(), newName)
  }

  static create(project: UserProjectImpl, stageNumber: StageNumber, name: string): [StageImpl, entities?: LuaEntity] {
    const area = project.content.computeBoundingBox()
    const [surface, hub] = createStageSurface(project.surfaceSettings, project.name.get(), name, area)
    const stage = new StageImpl(project, surface, stageNumber, name)
    stage.registerEvents()
    return [stage, hub]
  }

  getBlueprintSettingsView(): BlueprintSettingsTable {
    const result = createdDiffedPropertyTableView(
      this.project.defaultBlueprintSettings,
      this.blueprintOverrideSettings,
    ) as BlueprintSettingsTable
    return result
  }

  getBlueprintBBox(): BBox {
    return this.project.content.computeBoundingBox() ?? BBox.coords(-20, -20, 20, 20)
  }

  getID(): StageId {
    if (this.id == nil) {
      this.id = (storage.nextStageId ?? 1) as StageId
      storage.nextStageId = (this.id + 1) as StageId
    }
    return this.id
  }

  deleteByMerging(): void {
    if (!this.valid) return
    this.project.mergeStage(this.stageNumber)
  }

  discardInProject(): void {
    if (!this.valid) return
    this.project.discardStage(this.stageNumber)
  }

  _doDelete(): void {
    if (!this.valid) return
    ;(this as Mutable<Stage>).valid = false
    storage.surfaceIndexToStage.delete(this.surfaceIndex)
    if (this.surface.valid) destroySurface(this.surface)
    this.subscription?.close()
  }

  __tostring() {
    return `<Stage ${this.stageNumber} "${this.name.get()}" of "${this.project.name.get()}">`
  }
}

Events.on_pre_surface_deleted((e) => {
  const stage = getStageAtSurface(e.surface_index)
  if (stage != nil) stage.deleteByMerging()
})
