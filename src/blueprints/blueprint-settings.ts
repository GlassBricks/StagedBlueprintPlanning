import { BlueprintSignalIcon, SignalID } from "factorio:runtime"
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
  // kinda dumb, but works for now
  readonly 1: SignalID | nil
  readonly 2: SignalID | nil
  readonly 3: SignalID | nil
  readonly 4: SignalID | nil

  readonly appendNumbersToIcons: boolean

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
const signalKeys = [1, 2, 3, 4] as const

export function setIconsInSettings(settings: BlueprintSettingsTable, icons: BlueprintSignalIcon[] | nil): void {
  const toSet: Record<number, SignalID> = {}
  if (icons) {
    for (const icon of icons) {
      toSet[icon.index] = icon.signal
    }
  }
  for (const key of signalKeys) {
    settings[key].set(toSet[key])
  }
}
export function getIconsAsSparseArray(settings: BlueprintSettingsTable | BlueprintOverrideSettings): SignalID[] {
  const result: SignalID[] = []
  for (const [index, signal] of pairs(settings)) {
    if (type(index) == "number") {
      result[index as number] = signal.get() as SignalID
    } else {
      break
    }
  }
  return result
}

/**
 * Stage name is used for the "append numbers to icons" feature.
 */
export function getIconsFromSettings(settings: BlueprintTakeSettings, stageName?: string): BlueprintSignalIcon[] | nil {
  const result: BlueprintSignalIcon[] = []
  const appendNumbers = settings.appendNumbersToIcons && stageName
  let index = 1
  for (const key of signalKeys) {
    const signal = settings[key]
    if (signal) {
      result.push({ index: appendNumbers ? index : key, signal })
      index++
    }
  }

  if (appendNumbers) {
    for (const [number] of string.gmatch(stageName, "%d")) {
      result.push({
        index,
        signal: {
          type: "virtual",
          name: "signal-" + number,
        },
      })
      index++
      if (index > 4) break
    }
  }

  if (result.length == 0) return nil
  return result
}

export type StageBlueprintSettings = OverrideableBlueprintSettings

export type BlueprintSettingsTable = PropertiesTable<OverrideableBlueprintSettings>
export type BlueprintOverrideSettings = PropertyOverrideTable<OverrideableBlueprintSettings>

export function getDefaultBlueprintSettings(): OverrideableBlueprintSettings {
  return {
    1: nil,
    2: nil,
    3: nil,
    4: nil,
    appendNumbersToIcons: false,
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
