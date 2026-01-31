// Copyright (c) 2022-2026 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later
import { LuaEntity, LuaSurface, nil, SurfaceIndex } from "factorio:runtime"
import { remove_from_list } from "util"
import { newProjectContent } from "../entity/ProjectContent"
import { StageNumber } from "../entity/ProjectEntity"
import { StagedValue } from "../entity/StagedValue"
import { Events, globalEvent, ibind, Mutable, RegisterClass, SimpleEvent, Subscription } from "../lib"
import { BBox } from "../lib/geometry"
import { LazyLoadClass } from "../lib/LazyLoad"
import { getStageAtSurface } from "./project-refs"
import { ProjectUpdates } from "./project-updates"
import { GlobalProjectEvent, LocalProjectEvent, ProjectId, Stage, StageId, UserProject } from "./ProjectDef"
import { ProjectSettings, StageSettingsData } from "./ProjectSettings"
import {
  createStageSurface,
  destroySurface,
  getDefaultSurfaceSettings,
  SurfaceSettings,
  updateStageSurfaceName,
} from "./surfaces"
import { UserActions } from "./user-actions"
import { WorldUpdates } from "./world-updates"
import { WorldPresentation } from "./WorldPresentation"
import min = math.min

declare const storage: {
  nextProjectId: ProjectId
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
  readonly settings: ProjectSettings

  content = newProjectContent()
  localEvents = new SimpleEvent<LocalProjectEvent>()

  valid = true
  private readonly stages: Record<number, StageImpl> = {}

  actions = UserActionsClass({ project: this })
  updates = ProjectUpdatesClass({ project: this })
  private _worldPresentation = new WorldPresentation(this)
  get worldPresentation(): WorldPresentation {
    return this._worldPresentation
  }
  get worldUpdates(): WorldUpdates {
    return this._worldPresentation.getWorldUpdates()
  }

  constructor(
    readonly id: ProjectId,
    name: string,
    initialNumStages: number,
    surfaceSettings: SurfaceSettings = getDefaultSurfaceSettings(),
  ) {
    this.settings = new ProjectSettings(name, surfaceSettings)
    for (const i of $range(1, initialNumStages)) {
      this.settings.insertStageSettings(i, `Stage ${i}`)
      const [stage] = StageImpl.create(this, i)
      this.stages[i] = stage
    }
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
  registerEvents(): void {
    if (this.subscription) return
    this.subscription = new Subscription()

    this.settings.projectName.subscribe(this.subscription, ibind(this.onNameChange))
  }

  private onNameChange(newValue: string, oldValue: string): void {
    this.settings.blueprintBookTemplate.onProjectNameChanged(newValue, oldValue)

    for (const [, stage] of pairs(this.stages)) {
      updateStageSurfaceName(stage.surface, newValue, stage.getSettings().name.get())
    }
  }

  getSurface(stageNum: StageNumber): LuaSurface | nil {
    const stage = this.stages[stageNum]
    return stage && stage.surface
  }
  getStage(stageNumber: StageNumber): Stage | nil {
    return this.stages[stageNumber]
  }
  lastStageFor(value: StagedValue<any, any>): StageNumber {
    const numStages = this.settings.stageCount()
    if (value.lastStage != nil) return min(value.lastStage, numStages)
    return numStages
  }

  getAllStages(): readonly StageImpl[] {
    return this.stages as unknown as readonly StageImpl[]
  }
  getStageById(stageId: StageId): Stage | nil {
    for (const [, stage] of pairs(this.stages)) {
      if (stage.id == stageId) return stage
    }
    return nil
  }

  insertStage(stageNumber: StageNumber): Stage {
    this.assertValid()
    assert(stageNumber >= 1 && stageNumber <= this.settings.stageCount() + 1, "Invalid new stage number")

    this.content.insertStage(stageNumber)
    this.worldPresentation.onStageInserted(stageNumber)

    const name = this.settings.getNewStageName(stageNumber)
    this.settings.insertStageSettings(stageNumber, name)
    const [newStage, hub] = StageImpl.create(this, stageNumber)

    table.insert(this.stages as unknown as Stage[], stageNumber, newStage)
    for (const i of $range(stageNumber, luaLength(this.stages))) {
      this.stages[i].stageNumber = i
    }

    this.settings.blueprintBookTemplate.onStageInserted(stageNumber, this)
    this.raiseEvent({ type: "stage-added", project: this, stage: newStage, spacePlatformHub: hub })
    return newStage
  }

  private deleteStage(index: StageNumber, isMerge: boolean): void {
    this.assertValid()
    const stage = this.stages[index]
    assert(stage != nil, "invalid stage number")
    if (this.settings.stageCount() == 1) {
      this.delete()
      return
    }

    this.raiseEvent({ type: "pre-stage-deleted", project: this, stage })

    stage._doDelete()
    table.remove(this.stages as unknown as Stage[], index)
    this.settings.removeStageSettings(index)
    for (const i of $range(index, this.settings.stageCount())) {
      this.stages[i].stageNumber = i
    }

    this.worldPresentation.onStageDeleted(index)
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

  delete(): void {
    if (!this.valid) return
    remove_from_list(storage.projects, this)
    this.settings.blueprintBookTemplate.destroy()
    this.valid = false
    for (const [, stage] of pairs(this.stages)) {
      stage._doDelete()
    }
    this.raiseEvent({ type: "project-deleted", project: this })
    this.localEvents.closeAll()
    this.subscription?.close()
    delete this.subscription
  }

  private raiseEvent(event: LocalProjectEvent): void {
    this.localEvents.raise(event)
    GlobalProjectEvents.raise(event)
  }
  private assertValid(): void {
    if (!this.valid) error("Project is invalid")
  }

  __tostring(): string {
    return `<Project ${this.id} "${this.settings.projectName.get()}">`
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
  const index = storage.projects.indexOf(project as UserProjectImpl)
  if (index <= 0) return false
  swapProjects(index - 1, index)
  return true
}

export function moveProjectDown(project: UserProject): boolean {
  const index = storage.projects.indexOf(project as UserProjectImpl)
  if (index < 0 || index >= storage.projects.length - 1) return false
  swapProjects(index, index + 1)
  return true
}

export interface StageInternal extends Stage {
  registerEvents(): void
}

@RegisterClass("Stage")
class StageImpl implements StageInternal {
  readonly valid = true

  readonly surfaceIndex: SurfaceIndex

  actions: UserActions

  id?: StageId

  private subscription?: Subscription

  constructor(
    public project: UserProjectImpl,
    readonly surface: LuaSurface,
    public stageNumber: StageNumber,
  ) {
    this.surfaceIndex = surface.index
    if (project.id != 0) storage.surfaceIndexToStage.set(this.surfaceIndex, this)
    this.actions = project.actions
  }

  registerEvents(): void {
    if (this.subscription) return
    this.subscription = new Subscription()

    this.getSettings().name.subscribe(this.subscription, ibind(this.onNameChange))
  }

  private onNameChange(newName: string): void {
    updateStageSurfaceName(this.surface, this.project.settings.projectName.get(), newName)
  }

  static create(project: UserProjectImpl, stageNumber: StageNumber): [StageImpl, entities?: LuaEntity] {
    const area = project.content.computeBoundingBox()
    const stageName = project.settings.getStageName(stageNumber) as string
    const [surface, hub] = createStageSurface(
      project.settings.surfaceSettings,
      project.settings.projectName.get(),
      stageName,
      area,
    )
    const stage = new StageImpl(project, surface, stageNumber)
    stage.registerEvents()
    return [stage, hub]
  }

  getSettings(): StageSettingsData {
    return this.project.settings.getStageSettings(this.stageNumber)
  }

  getBlueprintSettingsView(): import("../blueprints/blueprint-settings").BlueprintSettingsTable {
    return this.project.settings.getBlueprintSettingsView(this.stageNumber)
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

  __tostring(): string {
    return `<Stage ${this.stageNumber} "${this.getSettings().name.get()}" of "${this.project.settings.projectName.get()}">`
  }
}

Events.on_pre_surface_deleted((e) => {
  const stage = getStageAtSurface(e.surface_index)
  if (stage != nil) stage.deleteByMerging()
})
