// Copyright (c) 2022-2026 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later
import { LuaSurface, nil, SurfaceIndex } from "factorio:runtime"
import { newProjectContent } from "../entity/ProjectContent"
import { StageNumber } from "../entity/ProjectEntity"
import { ReadonlyStagedValue } from "../entity/StagedValue"
import { Events, globalEvent, ibind, Mutable, RegisterClass, SimpleEvent, Subscription } from "../lib"
import { BBox } from "../lib/geometry"
import { LazyLoadClass } from "../lib/LazyLoad"
import { getStageAtSurface } from "./project-refs"
import { ProjectUpdates } from "./project-updates"
import { GlobalProjectEvent, LocalProjectEvent, ProjectId, Stage, StageId, UserProject } from "./ProjectDef"
import { addProject, removeProject } from "./ProjectList"
import { ProjectSettings, StageSettingsData } from "./ProjectSettings"
import { ProjectSurfaces } from "./ProjectSurfaces"
import { getDefaultSurfaceSettings, SurfaceSettings } from "./surfaces"
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

export { getAllProjects, moveProjectUp, moveProjectDown } from "./ProjectList"

declare const luaLength: LuaLength<Record<number, any>, number>

export interface UserProjectInternal extends UserProject {
  registerEvents(): void
}

@RegisterClass("Assembly") // named differently for legacy reasons
class UserProjectImpl implements UserProjectInternal {
  readonly settings: ProjectSettings
  readonly surfaces: ProjectSurfaces

  content = newProjectContent()
  localEvents = new SimpleEvent<LocalProjectEvent>()

  valid = true
  private readonly stages: Record<number, StageImpl> = {}

  actions = UserActionsClass({ project: this })
  updates = ProjectUpdatesClass({ project: this })
  worldPresentation: WorldPresentation = new WorldPresentation(this)
  get worldUpdates(): WorldUpdates {
    return this.worldPresentation.getWorldUpdates()
  }

  constructor(
    readonly id: ProjectId,
    name: string,
    initialNumStages: number,
    surfaceSettings: SurfaceSettings = getDefaultSurfaceSettings(),
  ) {
    this.settings = new ProjectSettings(name, surfaceSettings)
    this.surfaces = new ProjectSurfaces(this.settings)
    for (const i of $range(1, initialNumStages)) {
      this.settings.insertStageSettings(i, `Stage ${i}`)
      const [surface] = this.surfaces.createSurface(i, this.content.computeBoundingBox())
      const stage = new StageImpl(this, i)
      this.stages[i] = stage
      this.registerStageInSurfaceMap(stage, surface)
    }
  }

  static create(
    name: string,
    initialNumStages: number,
    surfaceSettings: SurfaceSettings = getDefaultSurfaceSettings(),
  ): UserProjectImpl {
    const project = new UserProjectImpl(storage.nextProjectId++ as ProjectId, name, initialNumStages, surfaceSettings)
    addProject(project)
    GlobalProjectEvents.raise({ type: "project-created", project })
    project.registerEvents()

    return project
  }

  private subscription?: Subscription
  registerEvents(): void {
    if (this.subscription) return
    this.subscription = new Subscription()

    this.settings.projectName.subscribe(this.subscription, ibind(this.onNameChange))
    this.surfaces.registerEvents()
  }

  private onNameChange(newValue: string, oldValue: string): void {
    this.settings.blueprintBookTemplate.onProjectNameChanged(newValue, oldValue)
  }

  getStage(stageNumber: StageNumber): Stage | nil {
    return this.stages[stageNumber]
  }
  lastStageFor(value: ReadonlyStagedValue<any, any>): StageNumber {
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

    const [, hub] = this.surfaces.insertSurface(stageNumber, this.content.computeBoundingBox())

    const newStage = new StageImpl(this, stageNumber)
    table.insert(this.stages as unknown as Stage[], stageNumber, newStage)
    for (const i of $range(stageNumber, luaLength(this.stages))) {
      this.stages[i].stageNumber = i
    }

    this.rebuildSurfaceMap()

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

    this.unregisterStageFromSurfaceMap(stage)
    ;(stage as Mutable<Stage>).valid = false
    this.surfaces.deleteSurface(index)

    table.remove(this.stages as unknown as Stage[], index)
    this.settings.removeStageSettings(index)
    for (const i of $range(index, this.settings.stageCount())) {
      this.stages[i].stageNumber = i
    }

    this.rebuildSurfaceMap()

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
    this.settings.blueprintBookTemplate.destroy()
    this.valid = false
    for (const [, stage] of pairs(this.stages)) {
      this.unregisterStageFromSurfaceMap(stage)
      ;(stage as Mutable<Stage>).valid = false
    }
    this.surfaces.destroyAll()
    removeProject(this)
    this.raiseEvent({ type: "project-deleted", project: this })
    this.localEvents.closeAll()
    this.surfaces.close()
    this.subscription?.close()
    delete this.subscription
  }

  private registerStageInSurfaceMap(stage: StageImpl, surface: LuaSurface): void {
    if (this.id != 0) storage.surfaceIndexToStage.set(surface.index, stage)
  }

  private unregisterStageFromSurfaceMap(stage: StageImpl): void {
    const surface = this.surfaces.getSurface(stage.stageNumber)
    if (surface) storage.surfaceIndexToStage.delete(surface.index)
  }

  private rebuildSurfaceMap(): void {
    if (this.id == 0) return
    for (const [, stage] of pairs(this.stages)) {
      const surface = this.surfaces.getSurface(stage.stageNumber)
      if (surface) storage.surfaceIndexToStage.set(surface.index, stage)
    }
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

export interface StageInternal extends Stage {
  registerEvents(): void
}

@RegisterClass("Stage")
class StageImpl implements StageInternal {
  readonly valid = true

  actions: UserActions

  id?: StageId

  constructor(
    public project: UserProjectImpl,
    public stageNumber: StageNumber,
  ) {
    this.actions = project.actions
  }

  registerEvents(): void {}

  getSurface(): LuaSurface {
    return this.project.surfaces.getSurface(this.stageNumber)!
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

  __tostring(): string {
    return `<Stage ${this.stageNumber} "${this.getSettings().name.get()}" of "${this.project.settings.projectName.get()}">`
  }
}

Events.on_pre_surface_deleted((e) => {
  const stage = getStageAtSurface(e.surface_index)
  if (stage != nil) stage.deleteByMerging()
})
