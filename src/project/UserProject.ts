/*
 * Copyright (c) 2022-2023 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { LocalisedString, LuaInventory, LuaItemStack, LuaSurface, nil, SurfaceIndex } from "factorio:runtime"
import { remove_from_list } from "util"
import {
  BlueprintOverrideSettings,
  BlueprintSettingsTable,
  createNewBlueprintSettings,
  StageBlueprintSettings,
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
import { createStageSurface, destroySurface } from "./surfaces"
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

@RegisterClass("Assembly") // named differently for legacy reasons
class UserProjectImpl implements UserProject {
  name: MutableProperty<string>

  content = newProjectContent()
  localEvents = new SimpleEvent<LocalProjectEvent>()

  defaultBlueprintSettings = createNewBlueprintSettings()

  landfillTile = property<string | nil>("landfill")
  // disable tiles by default in tests, since its slow
  // the appropriate tests will enable it
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
  ) {
    this.name = property(name)
    this.stages = {}
    for (const i of $range(1, initialNumStages)) {
      const stage = StageImpl.create(this, i, `Stage ${i}`, nil)
      this.stages[i] = stage
    }
  }
  private static getDisplayName(this: void, id: ProjectId, name: string): LocalisedString {
    return name != "" ? name : [L_Bp100.UnnamedProject, id]
  }
  displayName(): Property<LocalisedString> {
    return this.name.map(bind(UserProjectImpl.getDisplayName, this.id))
  }

  static create(name: string, initialNumStages: number): UserProjectImpl {
    const project = new UserProjectImpl(storage.nextProjectId++ as ProjectId, name, initialNumStages)
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
    const prevStage = this.stages[stage == 1 ? 1 : stage - 1]
    const newStage = StageImpl.create(this, stage, name, prevStage.surface)
    // copy/update icons

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

  deleteStage(index: StageNumber): void {
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
    // update stages
    for (const i of $range(index, this.numStages())) {
      this.stages[i].stageNumber = i
    }
    this.content.deleteStage(index)

    this.raiseEvent({ type: "stage-deleted", project: this, stage })
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

export function createUserProject(name: string, initialNumStages: number): UserProject {
  return UserProjectImpl.create(name, initialNumStages)
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

function createEmptyStageBlueprintSettings(): BlueprintOverrideSettings {
  return createEmptyPropertyOverrideTable<StageBlueprintSettings>(keys<StageBlueprintSettings>())
}

@RegisterClass("Stage")
class StageImpl implements Stage {
  name: MutableProperty<string>
  readonly valid = true

  readonly surfaceIndex: SurfaceIndex

  stageBlueprintSettings = createEmptyStageBlueprintSettings()

  actions: UserActions

  id?: StageId

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
  static create(
    project: UserProjectImpl,
    stageNumber: StageNumber,
    name: string,
    copySettingsFrom: LuaSurface | nil,
  ): StageImpl {
    const area = project.content.computeBoundingBox()
    const surface = createStageSurface(area, copySettingsFrom)
    return new StageImpl(project, surface, stageNumber, name)
  }

  getBlueprintSettingsView(): BlueprintSettingsTable {
    return createdDiffedPropertyTableView(this.project.defaultBlueprintSettings, this.stageBlueprintSettings)
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

  deleteInProject(): void {
    if (!this.valid) return
    this.project.deleteStage(this.stageNumber)
  }

  _doDelete(): void {
    if (!this.valid) return
    ;(this as Mutable<Stage>).valid = false
    storage.surfaceIndexToStage.delete(this.surfaceIndex)
    if (this.surface.valid) destroySurface(this.surface)
  }

  __tostring() {
    return `<Stage ${this.stageNumber} "${this.name.get()}" of "${this.project.name.get()}">`
  }
}

Events.on_pre_surface_deleted((e) => {
  const stage = getStageAtSurface(e.surface_index)
  if (stage != nil) stage.deleteInProject()
})
