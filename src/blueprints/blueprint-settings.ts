import { BlueprintSignalIcon } from "factorio:runtime"
import { Position } from "../lib/geometry"
import { createPropertiesTable, PropertiesTable, PropertyOverrideTable } from "../utils/properties-obj"

export interface BlueprintGridSettings {
  // blueprint grid settings
  readonly positionOffset: Position | nil
  readonly snapToGrid: Position | nil
  readonly positionRelativeToGrid: Position | nil
  readonly absoluteSnapping: boolean
}

export interface BlueprintTakeSettings extends BlueprintGridSettings {
  /** If not nil, only include entities changed in the last x stages */
  readonly stageLimit: number | nil

  /** If not nil, also include whitelisted entities in addition to [stageLimit]. Ignored if [stageLimit] is nil. */
  readonly additionalWhitelist: ReadonlyLuaSet<string> | nil

  /** If not nil, exclude these blacklisted entities. Always applied. */
  readonly blacklist: ReadonlyLuaSet<string> | nil

  // (transformations)
  readonly replaceInfinityEntitiesWithCombinators: boolean
}

export interface OverrideableBlueprintSettings extends BlueprintTakeSettings {
  readonly autoLandfill: boolean

  readonly useNextStageTiles: boolean
}

export interface AdditionalBlueprintItemSettings {
  readonly icons: BlueprintSignalIcon[] | nil
}

export interface BlueprintTakeParameters extends BlueprintTakeSettings, Partial<AdditionalBlueprintItemSettings> {}

/** The actual values of a stage's blueprint settings. */
export interface StageBlueprintSettings extends OverrideableBlueprintSettings, AdditionalBlueprintItemSettings {}

/** The stored information about a stage's blueprint settings, in property (possibly overrides) form */
export interface StageBlueprintSettingsTable
  extends PropertyOverrideTable<OverrideableBlueprintSettings>,
    PropertiesTable<AdditionalBlueprintItemSettings> {}

export interface ProjectOrStageBlueprintSettings
  extends PropertiesTable<OverrideableBlueprintSettings>,
    Partial<PropertiesTable<AdditionalBlueprintItemSettings>> {}

export function getDefaultBlueprintSettings(): OverrideableBlueprintSettings {
  return {
    autoLandfill: false,
    positionOffset: nil,
    snapToGrid: nil,
    positionRelativeToGrid: nil,
    absoluteSnapping: true,
    useNextStageTiles: false,
    additionalWhitelist: nil,
    blacklist: nil,
    replaceInfinityEntitiesWithCombinators: false,
    stageLimit: nil,
  }
}

export function createNewBlueprintSettings(): PropertiesTable<OverrideableBlueprintSettings> {
  return createPropertiesTable(keys<OverrideableBlueprintSettings>(), getDefaultBlueprintSettings())
}
