import { BlueprintSignalIcon, SignalID } from "factorio:runtime"
import { Position } from "../lib/geometry"
import { L_GuiProjectSettings } from "../locale"
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
  readonly icon1: SignalID | nil
  readonly icon2: SignalID | nil
  readonly icon3: SignalID | nil
  readonly icon4: SignalID | nil

  readonly appendStageNumbersToIcons: boolean

  /** If not nil, only include entities changed in the last x stages */
  readonly stageLimit: number | nil
  readonly excludeFromFutureBlueprints: boolean

  /** If not nil, also include whitelisted entities in addition to [stageLimit]. Ignored if [stageLimit] is nil. */
  readonly additionalWhitelist: ReadonlyLuaSet<string> | nil

  /** If not nil, exclude these blacklisted entities. Always applied. */
  readonly blacklist: ReadonlyLuaSet<string> | nil
}

export type OverrideableBlueprintSettings = BlueprintTakeSettings
export type IconNumber = 1 | 2 | 3 | 4
export const iconNumbers = [1, 2, 3, 4] as const

export function setIconsInSettings(settings: BlueprintSettingsTable, icons: BlueprintSignalIcon[] | nil): void {
  const toSet: Record<number, SignalID> = {}
  if (icons) {
    for (const icon of icons) {
      toSet[icon.index] = icon.signal
    }
  }
  for (const number of iconNumbers) {
    settings[`icon${number}`].set(toSet[number])
  }
}

export function getIconsAsCompactArray(settings: BlueprintSettingsTable): SignalID[] {
  const result: SignalID[] = []
  for (const number of iconNumbers) {
    const signal = settings[`icon${number}`].get()
    if (signal) result.push(signal)
  }
  return result
}

/**
 * Stage name is used for the "append numbers to icons" feature.
 */
export function getIconsFromSettings(settings: BlueprintTakeSettings, stageName?: string): BlueprintSignalIcon[] | nil {
  const result: BlueprintSignalIcon[] = []
  const appendNumbers = settings.appendStageNumbersToIcons && stageName
  let largestIndex = 0
  for (const number of iconNumbers) {
    const signal = settings[`icon${number}`]
    if (signal) {
      const keyNumber = tonumber(number)
      result.push({ index: keyNumber!, signal })
      largestIndex = keyNumber!
    }
  }

  if (appendNumbers) {
    for (const [number] of string.gmatch(stageName, "%d")) {
      largestIndex++
      if (largestIndex > 4) {
        game.print([L_GuiProjectSettings.NotEnoughIconSlots, stageName])
        break
      }
      result.push({
        index: largestIndex,
        signal: {
          type: "virtual",
          name: "signal-" + number,
        },
      })
    }
  }

  if (result.length == 0) return nil
  return result
}

export interface StageBlueprintSettings {
  description: string
}

export type StageBlueprintSettingsTable = PropertiesTable<StageBlueprintSettings>

export type BlueprintSettingsTable = PropertiesTable<OverrideableBlueprintSettings>
export type BlueprintSettingsOverrideTable = PropertyOverrideTable<OverrideableBlueprintSettings>

export function getDefaultBlueprintSettings(): OverrideableBlueprintSettings {
  return {
    icon1: nil,
    icon2: nil,
    icon3: nil,
    icon4: nil,
    appendStageNumbersToIcons: true,
    positionOffset: nil,
    snapToGrid: nil,
    positionRelativeToGrid: nil,
    absoluteSnapping: true,
    additionalWhitelist: nil,
    blacklist: nil,
    stageLimit: nil,
    excludeFromFutureBlueprints: false,
  }
}

export function getDefaultStageBlueprintSettings(): StageBlueprintSettings {
  return {
    description: "",
  }
}

export function createBlueprintSettingsTable(): PropertiesTable<OverrideableBlueprintSettings> {
  return createPropertiesTable(keys<OverrideableBlueprintSettings>(), getDefaultBlueprintSettings())
}

export function createStageBlueprintSettingsTable(): StageBlueprintSettingsTable {
  return createPropertiesTable(keys<StageBlueprintSettings>(), getDefaultStageBlueprintSettings())
}
