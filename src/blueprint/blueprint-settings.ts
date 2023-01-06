import { Position } from "../lib/geometry"
import { AsProperties } from "../utils/settings-obj"

// embrace immutability!!
export interface BuildBlueprintSettings {
  readonly emptyBlueprintNames: boolean
  readonly emptyBlueprintBookName: boolean
}
export interface BlueprintGridSettings {
  // blueprint grid settings
  readonly positionOffset: Position | nil
  readonly snapToGrid: Position | nil
  readonly positionRelativeToGrid: Position | nil
  readonly absoluteSnapping: boolean
}
export interface OverridableStageBlueprintSettings extends BlueprintGridSettings {
  // before taking blueprint
  readonly autoLandfill: boolean

  // filtering entities

  /** If not nil, only include entities changed in the last x stages */
  readonly stageLimit: number | nil

  /** If not nil, also include white-listed entities in addition to [stageLimit]. Ignored if [stageLimit] is nil. */
  readonly additionalWhitelist: ReadonlyLuaSet<string> | nil

  /** If not nil, exclude these black-listed entities. Always applied. */
  readonly blacklist: ReadonlyLuaSet<string> | nil

  // (transformations)
  readonly replaceInfinityEntitiesWithCombinators: boolean

  // after taking blueprint
  readonly useNextStageTiles: boolean
}

export interface PerStageBlueprintSettings {
  readonly icons: BlueprintSignalIcon[] | nil
}

export interface InBlueprintItemSettings extends PerStageBlueprintSettings, BlueprintGridSettings {}

export interface StageBlueprintSettings
  extends OverridableStageBlueprintSettings,
    PerStageBlueprintSettings,
    InBlueprintItemSettings {}

export type EditableStageBlueprintSettings = AsProperties<StageBlueprintSettings>

export function getDefaultBlueprintSettings(): OverridableStageBlueprintSettings {
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
