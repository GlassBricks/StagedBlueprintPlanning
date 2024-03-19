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

import { BlueprintSignalIcon, LocalisedString, LuaSurface, SignalID, SurfaceIndex } from "factorio:runtime"
import { remove_from_list } from "util"
import {
  BlueprintOverrideSettings,
  BlueprintSettingsTable,
  BlueprintTakeSettings,
  createNewBlueprintSettings,
  getIconsAsCompactArray,
  OverrideableBlueprintSettings,
  setIconsInSettings,
  StageBlueprintSettings,
} from "../blueprints/blueprint-settings"
import { newProjectContent } from "../entity/ProjectContent"
import { StageNumber } from "../entity/ProjectEntity"
import { StagedValue } from "../entity/StagedValue"
import {
  asMutable,
  bind,
  deepCompare,
  deepCopy,
  Events,
  globalEvent,
  Mutable,
  MutableProperty,
  property,
  Property,
  RegisterClass,
  SimpleEvent,
} from "../lib"
import { BBox, Position } from "../lib/geometry"
import { LazyLoadClass } from "../lib/LazyLoad"
import { Migrations } from "../lib/migration"
import { L_Bp100 } from "../locale"
import {
  createdDiffedPropertyTableView,
  createEmptyPropertyOverrideTable,
  PropertiesTable,
} from "../utils/properties-obj"
import { EntityHighlights } from "./entity-highlights"
import { ProjectUpdates } from "./project-updates"
import { GlobalProjectEvent, LocalProjectEvent, ProjectId, Stage, UserProject } from "./ProjectDef"
import { getStageAtSurface } from "./stage-surface"
import { createStageSurface, destroySurface } from "./surfaces"
import { UserActions } from "./user-actions"
import { WorldUpdates } from "./world-updates"
import entity_filter_mode = defines.deconstruction_item.entity_filter_mode
import min = math.min

declare const global: {
  nextProjectId: ProjectId
  // projects: LuaMap<ProjectId, UserProjectImpl>
  projects: UserProjectImpl[]
  surfaceIndexToStage: LuaMap<SurfaceIndex, StageImpl>
}
Events.on_init(() => {
  global.nextProjectId = 1 as ProjectId
  global.projects = []
  global.surfaceIndexToStage = new LuaMap()
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
    const project = new UserProjectImpl(global.nextProjectId++ as ProjectId, name, initialNumStages)
    UserProjectImpl.onProjectCreated(project)

    return project
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
  delete() {
    if (!this.valid) return
    remove_from_list(global.projects, this)
    this.valid = false
    for (const [, stage] of pairs(this.stages)) {
      stage._doDelete()
    }
    this.raiseEvent({ type: "project-deleted", project: this })
    this.localEvents.closeAll()
  }

  _getNewStageName(stage: StageNumber): string {
    // try to detect naming convention:
    // (Anything)(number)

    const otherStageNum = stage == 1 ? 1 : stage - 1
    const otherStage = this.stages[otherStageNum]
    const previousName = otherStage.name.get()
    const [name, numStr] = string.match(previousName, "^(.*)(%d+)$")
    const num = tonumber(numStr)

    const foundNumber = name != nil && num != nil
    if (foundNumber) {
      // see if there is a previous number and separator, before the last number
      // follow naming convention
      const newNum = tonumber(numStr)! + (stage == 1 ? -1 : 1)
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
    global.projects.push(project)
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
  for (const project of global.projects) {
    project.delete()
  }
  global.nextProjectId = 1 as ProjectId
}
export function getAllProjects(): readonly UserProject[] {
  return global.projects
}

function swapProjects(index1: number, index2: number): void {
  const projects = global.projects
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
  const index = global.projects.indexOf(project as UserProjectImpl)
  if (index <= 0) return false
  swapProjects(index - 1, index)
  return true
}

export function moveProjectDown(project: UserProject): boolean {
  // down means higher index
  const index = global.projects.indexOf(project as UserProjectImpl)
  if (index < 0 || index >= global.projects.length - 1) return false
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

  getBlueprintSettingsView(): BlueprintSettingsTable {
    return createdDiffedPropertyTableView(this.project.defaultBlueprintSettings, this.stageBlueprintSettings)
  }

  getBlueprintBBox(): BBox {
    return this.project.content.computeBoundingBox() ?? BBox.coords(-20, -20, 20, 20)
  }
  constructor(
    public project: UserProjectImpl,
    readonly surface: LuaSurface,
    public stageNumber: StageNumber,
    name: string,
  ) {
    this.name = property(name)
    this.surfaceIndex = surface.index
    if (project.id != 0) global.surfaceIndexToStage.set(this.surfaceIndex, this)
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

  deleteInProject(): void {
    if (!this.valid) return
    this.project.deleteStage(this.stageNumber)
  }

  _doDelete(): void {
    if (!this.valid) return
    ;(this as Mutable<Stage>).valid = false
    global.surfaceIndexToStage.delete(this.surfaceIndex)
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

Migrations.priority(1, "0.23.0", () => {
  assume<{
    assemblies?: Record<number, UserProjectImpl>
  }>(global)
  global.projects = global.assemblies! as any
  for (const [, project] of pairs(global.assemblies!)) {
    for (const stage of project.getAllStages()) {
      assume<{
        assembly?: UserProjectImpl
      }>(stage)
      stage.project = project
      delete stage.assembly
    }
  }
})
Migrations.priority(2, "0.16.0", () => {
  const oldProjects = global.projects as unknown as LuaMap<ProjectId, UserProjectImpl>
  global.projects = Object.values(oldProjects)
})
// just always run this?
Migrations.priority(2, script.active_mods[script.mod_name]!, () => {
  for (const project of global.projects) {
    project.actions = UserActionsClass({ project })
    project.updates = ProjectUpdatesClass({ project })
    project.worldUpdates = WorldUpdatesClass({ project })
    for (const stage of project.getAllStages()) {
      stage.actions = project.actions
    }
  }
})
Migrations.early("0.23.0", () => {
  assume<{
    nextAssemblyId: any
  }>(global)
  global.nextProjectId = global.nextAssemblyId
  delete global.nextAssemblyId
})
Migrations.early("0.26.0", () => {
  for (const project of global.projects) {
    project.displayName = nil!
  }
})
Migrations.early($CURRENT_VERSION, () => {
  let anyProjectMigrated = false
  for (const project of global.projects) {
    if (project.stagedTilesEnabled == nil) {
      project.stagedTilesEnabled = property(false)
      anyProjectMigrated = true
    }
  }
  if (anyProjectMigrated) {
    game.print([
      "",
      "Staged tiles support was added in ",
      $CURRENT_VERSION,
      "To enable staged tiles for old projects, go to project settings -> Other.",
    ])
  }
})
Migrations.to("0.26.1", () => {
  for (const project of global.projects) {
    for (const stage of project.getAllStages()) {
      assume<{
        assembly?: UserProjectImpl
      }>(stage)
      delete stage.assembly
    }
  }
})

Migrations.to("0.16.0", () => {
  interface OldProject {
    assemblyBlueprintSettings?: {
      autoLandfill: MutableProperty<boolean>
      useNextStageTiles: MutableProperty<boolean>

      emptyBlueprintNames: MutableProperty<boolean>
      emptyBlueprintBookName: MutableProperty<boolean>

      entityFilters: MutableProperty<LuaSet<string> | nil>
      entityFilterMode: MutableProperty<defines.deconstruction_item.entity_filter_mode | nil>
      replaceInfinityWithCombinators: MutableProperty<boolean>
    }
  }

  interface OldStage {
    blueprintSettings?: {
      name: string
      icons: BlueprintSignalIcon[] | nil

      /** Original position + offset = blueprint position */
      positionOffset: Position
      snapToGrid?: Position
      positionRelativeToGrid?: Position
      absoluteSnapping: boolean
    }
  }

  function copyFromOldStageSettings(
    newSettings: PropertiesTable<OverrideableBlueprintSettings>,
    oldSettings: OldStage["blueprintSettings"] & AnyNotNil,
  ) {
    newSettings.positionOffset.set(oldSettings.positionOffset)
    newSettings.snapToGrid.set(oldSettings.snapToGrid)
    newSettings.positionRelativeToGrid.set(oldSettings.positionRelativeToGrid)
    newSettings.absoluteSnapping.set(oldSettings.absoluteSnapping)
  }

  for (const project of global.projects) {
    assume<Mutable<UserProjectImpl>>(project)
    assume<OldProject>(project)

    const oldSettings = project.assemblyBlueprintSettings!
    delete project.assemblyBlueprintSettings

    const newSettings = createNewBlueprintSettings()
    project.defaultBlueprintSettings = newSettings

    newSettings.autoLandfill.set(oldSettings.autoLandfill.get())
    newSettings.useNextStageTiles.set(oldSettings.useNextStageTiles.get())
    newSettings.replaceInfinityEntitiesWithCombinators.set(oldSettings.replaceInfinityWithCombinators.get())

    const entityFilterMode = oldSettings.entityFilterMode.get()
    if (entityFilterMode == entity_filter_mode.whitelist) {
      newSettings.additionalWhitelist.set(oldSettings.entityFilters.get())
    } else if (entityFilterMode == entity_filter_mode.blacklist) {
      newSettings.blacklist.set(oldSettings.entityFilters.get())
    }

    const lastStageSettings = (project.getStage(project.numStages())! as OldStage).blueprintSettings!
    copyFromOldStageSettings(newSettings, lastStageSettings)

    for (const stage of project.getAllStages()) {
      assume<OldStage>(stage)
      const oldSettings = stage.blueprintSettings!
      delete stage.blueprintSettings

      stage.stageBlueprintSettings = createEmptyStageBlueprintSettings()

      const view = stage.getBlueprintSettingsView()
      copyFromOldStageSettings(view, oldSettings)
      // note: changed to match 0.30.0
      for (const key of [1, 2, 3, 4] as const) {
        asMutable(stage.stageBlueprintSettings)[key] = property(nil)
      }
      setIconsInSettings(view, oldSettings.icons)
    }
  }
})

Migrations.to("0.23.1", () => {
  for (const project of global.projects) {
    project.name.forceNotify()
  }
})
Migrations.to("0.25.0", () => {
  for (const project of global.projects) {
    assume<Mutable<PropertiesTable<OverrideableBlueprintSettings>>>(project.defaultBlueprintSettings)
    project.defaultBlueprintSettings.useModulePreloading = property(false)
    for (const stage of project.getAllStages()) {
      assume<Mutable<BlueprintOverrideSettings>>(stage.stageBlueprintSettings)
      stage.stageBlueprintSettings.useModulePreloading = property(nil)
    }
  }
})

Migrations.to("0.27.0", () => {
  for (const project of global.projects) {
    assume<Mutable<UserProjectImpl>>(project)
    project.landfillTile = property("landfill")
  }
})

Migrations.to("0.30.0", () => {
  for (const project of global.projects) {
    for (const key of [1, 2, 3, 4] as const) {
      asMutable(project.defaultBlueprintSettings)[key] ??= property(nil)
    }
    asMutable(project.defaultBlueprintSettings).appendStageNumbersToIcons ??= property(false)
    for (const stage of project.getAllStages()) {
      for (const key of [1, 2, 3, 4] as const) {
        asMutable(stage.stageBlueprintSettings)[key] ??= property(nil)
      }
      asMutable(stage.stageBlueprintSettings).appendStageNumbersToIcons ??= property(nil)
      assume<{
        icons?: Property<BlueprintSignalIcon[] | nil>
      }>(stage.stageBlueprintSettings)
      const oldValue = stage.stageBlueprintSettings.icons?.get()
      delete stage.stageBlueprintSettings.icons
      if (oldValue) {
        setIconsInSettings(stage.getBlueprintSettingsView(), oldValue)
      }
    }

    // try to determine from old settings if:
    // - appendStageNumbersToIcons should be true
    // - what default icons should be
    function iconsEndsWithNumbers(icons: SignalID[], numbers: number[]) {
      let j = icons.length - 1
      for (let i = numbers.length - 1; i >= 0; i--) {
        if (j < 0 || !deepCompare(icons[j], { type: "virtual", name: "signal-" + numbers[i] })) return false
        j--
      }
      return true
    }
    const canUseAppendNumberStages: Record<StageNumber, number[]> = {}
    for (const stage of project.getAllStages()) {
      const name = stage.name.get()
      const numbers: number[] = []
      for (const [number] of string.gmatch(name, "%d")) {
        numbers.push(tonumber(number)!)
      }
      const icons = getIconsAsCompactArray(stage.getBlueprintSettingsView())
      if (!numbers || (icons && iconsEndsWithNumbers(icons, numbers))) {
        canUseAppendNumberStages[stage.stageNumber] = numbers
      }
    }
    if (table_size(canUseAppendNumberStages) >= project.numStages() / 2) {
      project.defaultBlueprintSettings.appendStageNumbersToIcons.set(true)
      for (const stage of project.getAllStages()) {
        stage.stageBlueprintSettings.appendStageNumbersToIcons.set(false) // default false, we'll activate true below
      }

      for (const [stageNum, numbers] of pairs(canUseAppendNumberStages)) {
        const stage = project.getStage(stageNum)!
        stage.stageBlueprintSettings.appendStageNumbersToIcons.set(nil) // set to default, which is true
        let toRemove = numbers.length
        for (const key of [4, 3, 2, 1] as const) {
          if (toRemove <= 0) break
          if (stage.stageBlueprintSettings[key].get() != nil) {
            stage.stageBlueprintSettings[key].set(nil)
            toRemove--
          }
        }
      }
    }

    function findMajority(prop: keyof BlueprintTakeSettings): unknown {
      const counts: [unknown, number][] = []
      for (const stage of project.getAllStages()) {
        const value = stage.stageBlueprintSettings[prop].get()
        const thisCount = counts.find(([v]) => deepCompare(v, value))
        let count: number
        if (thisCount) {
          thisCount[1]++
          count = thisCount[1]
        } else {
          counts.push([value, 1])
          count = 1
        }
        if (count >= project.numStages() / 2) {
          return typeof value == "object" ? deepCopy(value) : value
        }
      }
      return nil
    }
    function setDefaultToMajorityValue(prop: keyof BlueprintTakeSettings) {
      const value = findMajority(prop)
      if (value != nil) {
        project.defaultBlueprintSettings[prop].set(value as never)
        for (const stage of project.getAllStages()) {
          const view = stage.getBlueprintSettingsView()
          view[prop].set(view[prop].get() as never)
        }
      }
    }
    setDefaultToMajorityValue(1)
    setDefaultToMajorityValue(2)
    setDefaultToMajorityValue(3)
    setDefaultToMajorityValue(4)
  }
})
Migrations.to($CURRENT_VERSION, () => {
  for (const project of global.projects) {
    assume<{
      entityUpdates?: WorldUpdates
    }>(project)
    delete project.entityUpdates
  }
})
