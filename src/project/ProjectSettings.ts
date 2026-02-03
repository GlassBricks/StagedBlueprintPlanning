import { LocalisedString } from "factorio:runtime"
import {
  BlueprintSettingsOverrideTable,
  BlueprintSettingsTable,
  createBlueprintSettingsTable,
  createStageBlueprintSettingsTable,
  OverrideableBlueprintSettings,
  StageBlueprintSettingsTable,
} from "../blueprints/blueprint-settings"
import { StageNumber } from "../entity/ProjectEntity"
import { bind, Mutable, MutableProperty, property, Property, RegisterClass } from "../lib"
import { L_Bp100 } from "../locale"
import {
  createdDiffedPropertyTableView,
  createEmptyPropertyOverrideTable,
  PropertiesTable,
} from "../utils/properties-obj"
import { BlueprintBookTemplate } from "./BlueprintBookTemplate"
import { SurfaceSettings } from "./surfaces"

export interface StageSettingsData {
  readonly name: MutableProperty<string>
  readonly blueprintOverrideSettings: BlueprintSettingsOverrideTable
  readonly stageBlueprintSettings: StageBlueprintSettingsTable
}

declare const luaLength: LuaLength<Record<number, any>, number>

@RegisterClass("ProjectSettings")
export class ProjectSettings {
  readonly projectName: MutableProperty<string>
  readonly landfillTile: MutableProperty<string | nil>
  readonly stagedTilesEnabled: MutableProperty<boolean>
  readonly defaultBlueprintSettings: PropertiesTable<OverrideableBlueprintSettings>
  surfaceSettings: SurfaceSettings
  readonly blueprintBookTemplate: BlueprintBookTemplate

  private stageSettings: Record<StageNumber, StageSettingsData>

  constructor(name: string, surfaceSettings: SurfaceSettings) {
    this.projectName = property(name)
    this.landfillTile = property<string | nil>("landfill")
    this.stagedTilesEnabled = property(!("factorio-test" in script.active_mods))
    this.defaultBlueprintSettings = createBlueprintSettingsTable()
    this.surfaceSettings = surfaceSettings
    this.blueprintBookTemplate = new BlueprintBookTemplate()
    this.stageSettings = {}

    if (this.isSpacePlatform()) {
      this.stagedTilesEnabled.set(true)
      this.landfillTile.set("space-platform-foundation")
    }
  }

  stageCount(): StageNumber {
    return luaLength(this.stageSettings)
  }

  getStageName(stage: StageNumber): LocalisedString {
    return this.stageSettings[stage].name.get()
  }

  getStageSettings(stage: StageNumber): StageSettingsData {
    return this.stageSettings[stage]
  }

  getBlueprintSettingsView(stage: StageNumber): BlueprintSettingsTable {
    return createdDiffedPropertyTableView(
      this.defaultBlueprintSettings,
      this.getStageSettings(stage).blueprintOverrideSettings,
    ) as BlueprintSettingsTable
  }

  isSpacePlatform(): boolean {
    return this.surfaceSettings.type == "spacePlatform"
  }

  insertStageSettings(stageNumber: StageNumber, name: string): void {
    const settings: StageSettingsData = {
      name: property(name),
      blueprintOverrideSettings: createEmptyBlueprintOverrideSettings(),
      stageBlueprintSettings: createStageBlueprintSettingsTable(),
    }
    table.insert(this.stageSettings as unknown as StageSettingsData[], stageNumber, settings)
  }

  removeStageSettings(stageNumber: StageNumber): void {
    table.remove(this.stageSettings as unknown as StageSettingsData[], stageNumber)
  }

  getNewStageName(stageNumber: StageNumber): string {
    const otherStageNum = stageNumber == 1 ? 1 : stageNumber - 1
    const previousName = this.stageSettings[otherStageNum].name.get()
    const [name, numStr] = string.match(previousName, "^(.-)(%d+)$")
    const num = tonumber(numStr)

    const foundNumber = name != nil && num != nil
    if (foundNumber) {
      const newNum = num + (stageNumber == 1 ? -1 : 1)
      if (newNum >= 0) {
        const candidateName = name + newNum
        const nextName = this.stageSettings[stageNumber]?.name.get()
        if (candidateName != nextName) {
          return candidateName
        }
      }
    }

    if (stageNumber == 1) return "New Stage"
    const sep = string.match(previousName, "^.*%d+([^%d]+)%d+$")[0] ?? (foundNumber ? "." : " ")
    return previousName + sep + "1"
  }

  private static getDisplayName(this: void, id: number, name: string): LocalisedString {
    return name != "" ? name : [L_Bp100.UnnamedProject, id]
  }

  displayName(id: number): Property<LocalisedString> {
    return this.projectName.map(bind(ProjectSettings.getDisplayName, id))
  }

  static _fromOld(data: {
    projectName: MutableProperty<string>
    landfillTile: MutableProperty<string | nil>
    stagedTilesEnabled: MutableProperty<boolean>
    defaultBlueprintSettings: PropertiesTable<OverrideableBlueprintSettings>
    surfaceSettings: SurfaceSettings
    blueprintBookTemplate: BlueprintBookTemplate
    stageSettings: Record<number, StageSettingsData>
  }): ProjectSettings {
    const instance = new ProjectSettings("_migration_", data.surfaceSettings)
    const mut = instance as unknown as Mutable<ProjectSettings> & {
      stageSettings: Record<number, StageSettingsData>
    }
    mut.projectName = data.projectName
    mut.landfillTile = data.landfillTile
    mut.stagedTilesEnabled = data.stagedTilesEnabled
    mut.defaultBlueprintSettings = data.defaultBlueprintSettings
    mut.blueprintBookTemplate = data.blueprintBookTemplate
    mut.stageSettings = data.stageSettings
    return instance
  }
}

function createEmptyBlueprintOverrideSettings(): BlueprintSettingsOverrideTable {
  return createEmptyPropertyOverrideTable<OverrideableBlueprintSettings>(keys<OverrideableBlueprintSettings>())
}
