import { LuaEntity, LuaSurface, nil } from "factorio:runtime"
import { StageNumber } from "../entity/ProjectEntity"
import { bind, ibind, RegisterClass, Subscription } from "../lib"
import { BBox } from "../lib/geometry"
import { ProjectSettings } from "./ProjectSettings"
import { createStageSurface, destroySurface, updateStageSurfaceName } from "./surfaces"

declare const luaLength: LuaLength<Record<number, any>, number>

@RegisterClass("ProjectSurfaces")
export class ProjectSurfaces {
  private surfaces: Record<StageNumber, LuaSurface>
  private settings: ProjectSettings
  private subscription?: Subscription

  constructor(settings: ProjectSettings) {
    this.surfaces = {}
    this.settings = settings
  }

  registerEvents(): void {
    this.rebuildSubscriptions()
  }

  private rebuildSubscriptions(): void {
    this.subscription?.close()
    this.subscription = new Subscription()
    this.settings.projectName.subscribe(this.subscription, ibind(this.onProjectNameChanged))
    for (const i of $range(1, this.surfaceCount())) {
      this.subscribeToStageName(i)
    }
  }

  private onProjectNameChanged(newName: string): void {
    for (const i of $range(1, this.surfaceCount())) {
      const surface = this.surfaces[i]
      if (surface?.valid) {
        const stageName = this.settings.getStageName(i) as string
        updateStageSurfaceName(surface, newName, stageName)
      }
    }
  }

  private subscribeToStageName(stageNumber: StageNumber): void {
    const stageSettings = this.settings.getStageSettings(stageNumber)
    stageSettings.name.subscribe(this.subscription!, bind(ibind(this.onStageNameChanged), stageNumber))
  }

  private onStageNameChanged(stageNumber: StageNumber, newName: string): void {
    const surface = this.surfaces[stageNumber]
    if (surface?.valid) {
      updateStageSurfaceName(surface, this.settings.projectName.get(), newName)
    }
  }

  surfaceCount(): number {
    return luaLength(this.surfaces)
  }

  getSurface(stage: StageNumber): LuaSurface | nil {
    return this.surfaces[stage]
  }

  getAllSurfaces(): readonly LuaSurface[] {
    return this.surfaces as unknown as readonly LuaSurface[]
  }

  createSurface(stage: StageNumber, area: BBox | nil): [LuaSurface, hub?: LuaEntity] {
    const stageName = this.settings.getStageName(stage) as string
    const projectName = this.settings.projectName.get()
    const [surface, hub] = createStageSurface(this.settings.surfaceSettings, projectName, stageName, area ?? undefined)
    this.surfaces[stage] = surface
    return [surface, hub]
  }

  insertSurface(stage: StageNumber, area: BBox | nil): [LuaSurface, hub?: LuaEntity] {
    const count = this.surfaceCount()
    for (let i = count; i >= stage; i--) {
      this.surfaces[i + 1] = this.surfaces[i]
    }
    delete (this.surfaces as any)[stage]

    const result = this.createSurface(stage, area)

    if (this.subscription) {
      this.rebuildSubscriptions()
    }

    return result
  }

  deleteSurface(stage: StageNumber): void {
    const surface = this.surfaces[stage]
    if (surface?.valid) destroySurface(surface)

    const count = this.surfaceCount()
    for (let i = stage; i < count; i++) {
      this.surfaces[i] = this.surfaces[i + 1]
    }
    delete (this.surfaces as any)[count]

    if (this.subscription) {
      this.rebuildSubscriptions()
    }
  }

  destroyAll(): void {
    for (const [, surface] of pairs(this.surfaces)) {
      if (surface.valid) destroySurface(surface)
    }
    this.surfaces = {}
  }

  close(): void {
    this.subscription?.close()
    delete this.subscription
  }

  static _fromExisting(surfaces: LuaSurface[], settings: ProjectSettings): ProjectSurfaces {
    const instance = new ProjectSurfaces(settings)
    for (const i of $range(1, surfaces.length)) {
      instance.surfaces[i] = surfaces[i - 1]
    }
    return instance
  }
}
