import { BlueprintSignalIcon, SignalID } from "factorio:runtime"
import { asLuaArray, isEmpty, PRecord } from "../lib"
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
  readonly icons: BlueprintIcons

  /** If not nil, only include entities changed in the last x stages */
  readonly stageLimit: number | nil

  /** If not nil, also include whitelisted entities in addition to [stageLimit]. Ignored if [stageLimit] is nil. */
  readonly additionalWhitelist: ReadonlyLuaSet<string> | nil

  /** If not nil, exclude these blacklisted entities. Always applied. */
  readonly blacklist: ReadonlyLuaSet<string> | nil

  // (transformations)
  readonly replaceInfinityEntitiesWithCombinators: boolean
  readonly useModulePreloading: boolean
}

export interface OverrideableBlueprintSettings extends BlueprintTakeSettings {
  readonly autoLandfill: boolean

  readonly useNextStageTiles: boolean
}

export type BlueprintIcons = [a?: SignalID | nil, b?: SignalID | nil, c?: SignalID | nil, d?: SignalID | nil]
export function iconsFromBpFormat(icons: BlueprintSignalIcon[] | nil): BlueprintIcons {
  const result: BlueprintIcons = []
  if (icons)
    for (const icon of icons) {
      result[icon.index - 1] = icon.signal
    }
  return result
}
export function iconsToBpFormat(icons: BlueprintIcons): BlueprintSignalIcon[] | nil {
  if (isEmpty(icons)) return nil
  const result: BlueprintSignalIcon[] = []
  for (const [luaIndex, value] of pairs<PRecord<number, SignalID>>(icons)) {
    result.push({ index: luaIndex, signal: value })
  }
  return result
}
export function compactIcons(icons: BlueprintIcons): BlueprintIcons {
  const result: BlueprintIcons = []
  for (const [, icon] of pairs(asLuaArray(icons))) {
    result.push(icon)
  }
  return result
}

export type StageBlueprintSettings = OverrideableBlueprintSettings

export type BlueprintSettingsTable = PropertiesTable<OverrideableBlueprintSettings>
export type BlueprintOverrideSettings = PropertyOverrideTable<OverrideableBlueprintSettings>

export function getDefaultBlueprintSettings(): OverrideableBlueprintSettings {
  return {
    icons: [],
    autoLandfill: false,
    positionOffset: nil,
    snapToGrid: nil,
    positionRelativeToGrid: nil,
    absoluteSnapping: true,
    useNextStageTiles: false,
    additionalWhitelist: nil,
    blacklist: nil,
    stageLimit: nil,
    replaceInfinityEntitiesWithCombinators: false,
    useModulePreloading: false,
  }
}

export function createNewBlueprintSettings(): PropertiesTable<OverrideableBlueprintSettings> {
  return createPropertiesTable(keys<OverrideableBlueprintSettings>(), getDefaultBlueprintSettings())
}
