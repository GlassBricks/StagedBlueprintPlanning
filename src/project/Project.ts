// Copyright (c) 2022-2026 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later
import { LocalisedString, LuaSurface, nil, SurfaceIndex } from "factorio:runtime"
import { BlueprintSettingsTable } from "../blueprints/blueprint-settings"
import { MutableProjectContent, newProjectContent } from "../entity/ProjectContent"
import { isWorldEntityProjectEntity, StageNumber } from "../entity/ProjectEntity"
import { Events, Mutable, RegisterClass, SimpleEvent, SimpleSubscribable } from "../lib"
import { BBox } from "../lib/geometry"
import { LoopTask, submitTask } from "../lib/task"
import { L_GuiTasks } from "../locale"
import { getStageAtSurface } from "./project-refs"
import { ProjectActions } from "./actions"
import { addProject, stageDeleted as globalStageDeleted, removeProject } from "./ProjectList"
import { ProjectSettings, StageSettingsData } from "./ProjectSettings"
import { ProjectSurfaces } from "./ProjectSurfaces"
import { getDefaultSurfaceSettings, SurfaceSettings } from "./surfaces"
import { _setWorldUpdatesBlocked, WorldPresentation } from "./WorldPresentation"

export type ProjectId = number & {
  _projectIdBrand: never
}
export type StageId = number & {
  _stageIdBrand: never
}

export interface Project {
  readonly id: ProjectId

  readonly settings: ProjectSettings
  readonly surfaces: ProjectSurfaces
  readonly content: MutableProjectContent

  readonly valid: boolean

  actions: ProjectActions
  worldPresentation: WorldPresentation

  readonly stageAdded: SimpleSubscribable<Stage>
  readonly preStageDeleted: SimpleSubscribable<Stage>
  readonly stageDeleted: SimpleSubscribable<Stage>

  getStage(stageNumber: StageNumber): Stage | nil
  getAllStages(): readonly Stage[]
  getStageById(stageId: StageId): Stage | nil

  insertStage(index: StageNumber): Stage
  mergeStage(index: StageNumber): void
  discardStage(index: StageNumber): void

  resyncWithWorld(): void

  delete(): void
}

export interface StageSettings {
  name: string
}

export interface Stage {
  readonly stageNumber: StageNumber

  readonly project: Project

  getSurface(): LuaSurface

  getID(): StageId

  readonly actions: ProjectActions

  getSettings(): StageSettingsData
  getBlueprintSettingsView(): BlueprintSettingsTable
  getBlueprintBBox(): BBox
  readonly valid: boolean
  deleteByMerging(): void
  discardInProject(): void
}

declare const storage: {
  nextProjectId: ProjectId
  projects: ProjectImpl[]
  surfaceIndexToStage: LuaMap<SurfaceIndex, StageImpl>
  nextStageId?: StageId
}
Events.on_init(() => {
  storage.nextProjectId = 1 as ProjectId
  storage.projects = []
  storage.surfaceIndexToStage = new LuaMap()
})

export { getAllProjects, moveProjectDown, moveProjectUp } from "./ProjectList"

@RegisterClass("ResyncWithWorldTask")
class ResyncWithWorldTask extends LoopTask {
  constructor(private project: Project) {
    super(project.settings.stageCount() * 2)
  }

  override getTitle(): LocalisedString {
    return [L_GuiTasks.ResyncWithWorld]
  }

  protected override doStep(i: number): void {
    const numStages = this.project.settings.stageCount()
    if (i < numStages) {
      this.doReadStep(i + 1)
    } else {
      const rebuildStage = i - numStages + 1
      if (rebuildStage == 1) _setWorldUpdatesBlocked(false)
      this.project.worldPresentation.rebuildStage(rebuildStage)
    }
  }

  private doReadStep(stage: StageNumber): void {
    if (stage == 1) _setWorldUpdatesBlocked(true)
    const surface = this.project.surfaces.getSurface(stage)
    if (!surface) return
    for (const entity of surface.find_entities()) {
      if (isWorldEntityProjectEntity(entity)) {
        this.project.actions.onEntityPossiblyUpdated(entity, stage, nil, nil)
      }
    }
  }

  protected getTitleForStep(step: number): LocalisedString {
    const numStages = this.project.settings.stageCount()
    if (step < numStages) {
      return [L_GuiTasks.ReadingStage, this.project.settings.getStageName(step + 1)]
    }
    return [L_GuiTasks.RebuildingStage, this.project.settings.getStageName(step - numStages + 1)]
  }

  override cancel(): void {
    _setWorldUpdatesBlocked(false)
  }
}

declare const luaLength: LuaLength<Record<number, any>, number>

@RegisterClass("Assembly") // named differently for legacy reasons
class ProjectImpl implements Project {
  readonly settings: ProjectSettings
  readonly surfaces: ProjectSurfaces

  content: MutableProjectContent

  readonly stageAdded = new SimpleEvent<Stage>()
  readonly preStageDeleted = new SimpleEvent<Stage>()
  readonly stageDeleted = new SimpleEvent<Stage>()

  valid = true
  private readonly stages: Record<number, StageImpl> = {}

  worldPresentation: WorldPresentation
  actions: ProjectActions

  constructor(
    readonly id: ProjectId,
    name: string,
    initialNumStages: number,
    surfaceSettings: SurfaceSettings | nil = getDefaultSurfaceSettings(),
    content: MutableProjectContent = newProjectContent(),
  ) {
    this.content = content
    this.settings = new ProjectSettings(name, surfaceSettings)
    this.surfaces = new ProjectSurfaces(this.settings)
    this.worldPresentation = new WorldPresentation(this.settings, this.surfaces, this.content)
    this.actions = new ProjectActions(this.content, this.worldPresentation, this.settings, this.surfaces)
    this.content.setObserver(this.worldPresentation)
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
    surfaceSettings: SurfaceSettings | nil = getDefaultSurfaceSettings(),
    content?: MutableProjectContent,
  ): ProjectImpl {
    const project = new ProjectImpl(
      storage.nextProjectId++ as ProjectId,
      name,
      initialNumStages,
      surfaceSettings,
      content,
    )
    addProject(project)
    project.registerEvents()
    if (project.settings.isSpacePlatform()) {
      initSpacePlatform(project)
    }
    return project
  }

  registerEvents(): void {
    this.surfaces.registerEvents()
  }

  getStage(stageNumber: StageNumber): Stage | nil {
    return this.stages[stageNumber]
  }
  resyncWithWorld(): void {
    submitTask(new ResyncWithWorldTask(this))
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

    if (hub) {
      this.actions.rebuildEntity(hub, stageNumber)
    }
    this.worldPresentation.rebuildStage(stageNumber)
    this.stageAdded.raise(newStage)
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

    this.preStageDeleted.raise(stage)

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
    } else {
      this.content.discardStage(index)
    }
    const adjacentStage = index == 1 ? 1 : index - 1
    this.worldPresentation.rebuildStage(adjacentStage)

    this.stageDeleted.raise(stage)
    globalStageDeleted.raise(this, stage)
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
    this.actions.valid = false
    for (const [, stage] of pairs(this.stages)) {
      this.unregisterStageFromSurfaceMap(stage)
      ;(stage as Mutable<Stage>).valid = false
    }
    this.surfaces.destroyAll()
    removeProject(this)
    this.stageAdded.closeAll()
    this.preStageDeleted.closeAll()
    this.stageDeleted.closeAll()
    this.surfaces.close()
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

  private assertValid(): void {
    if (!this.valid) error("Project is invalid")
  }

  __tostring(): string {
    return `<Project ${this.id} "${this.settings.projectName.get()}">`
  }
}

function initSpacePlatform(project: ProjectImpl): void {
  for (const stage of project.getAllStages()) {
    const surface = stage.getSurface()
    for (const hub of surface.find_entities_filtered({ type: "space-platform-hub" })) {
      project.actions.rebuildEntity(hub, stage.stageNumber)
    }
  }

  const firstStage = project.getStage(1)!
  const tiles = firstStage.getSurface().find_tiles_filtered({ name: "space-platform-foundation" })
  for (const tile of tiles) {
    project.actions.onTileBuilt(tile.position, tile.name, 1)
  }
}

export function createProject(
  name: string,
  initialNumStages: number,
  surfaceSettings: SurfaceSettings | nil = getDefaultSurfaceSettings(),
  content?: MutableProjectContent,
): Project {
  return ProjectImpl.create(name, initialNumStages, surfaceSettings, content)
}

export function _deleteAllProjects(): void {
  while (storage.projects.length > 0) {
    storage.projects[0].delete()
  }
  assert(storage.projects.length == 0)
  storage.nextStageId = nil
  storage.nextProjectId = 1 as ProjectId
}

@RegisterClass("Stage")
class StageImpl implements Stage {
  readonly valid = true

  actions: ProjectActions

  id?: StageId

  constructor(
    public project: ProjectImpl,
    public stageNumber: StageNumber,
  ) {
    this.actions = project.actions
  }

  getSurface(): LuaSurface {
    return this.project.surfaces.getSurface(this.stageNumber)!
  }

  getSettings(): StageSettingsData {
    return this.project.settings.getStageSettings(this.stageNumber)
  }

  getBlueprintSettingsView(): BlueprintSettingsTable {
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
    if (!this.valid) return `<Stage ${this.stageNumber} (invalid)>`
    return `<Stage ${this.stageNumber} "${this.getSettings().name.get()}" of "${this.project.settings.projectName.get()}">`
  }
}

Events.on_pre_surface_deleted((e) => {
  const stage = getStageAtSurface(e.surface_index)
  if (stage != nil) stage.deleteByMerging()
})
