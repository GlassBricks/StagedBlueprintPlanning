/*
 * Copyright (c) 2024 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import expect from "tstl-expect"
import {
  BlueprintTakeSettings,
  getDefaultBlueprintSettings,
  getIconsFromSettings,
} from "../../blueprints/blueprint-settings"

describe("getIconsFromSettings", () => {
  test("gets icons if appendStageNumbersToIcons is false", () => {
    const settings: BlueprintTakeSettings = {
      ...getDefaultBlueprintSettings(),
      3: { type: "item", name: "iron-plate" },
    }

    const result = getIconsFromSettings(settings)

    expect(result).toEqual([{ index: 3, signal: { type: "item", name: "iron-plate" } }])
  })

  test("returns nil if no icons are set", () => {
    const settings = getDefaultBlueprintSettings()

    const result = getIconsFromSettings(settings)

    expect(result).toBeNil()
  })

  test("uses stage name numbers as icons if appendStageNumbersToIcons is true and stageName is set", () => {
    const settings: BlueprintTakeSettings = {
      ...getDefaultBlueprintSettings(),
      appendStageNumbersToIcons: true,
    }

    const result = getIconsFromSettings(settings, "stage-1")

    expect(result).toEqual([{ index: 1, signal: { type: "virtual", name: "signal-1" } }])
  })

  test("appends numbers to icons if stage name has numbers", () => {
    const settings: BlueprintTakeSettings = {
      ...getDefaultBlueprintSettings(),
      appendStageNumbersToIcons: true,
      2: { type: "item", name: "iron-plate" },
    }

    const result = getIconsFromSettings(settings, "stage-1")
    expect(result).toEqual([
      { index: 2, signal: { type: "item", name: "iron-plate" } },
      { index: 3, signal: { type: "virtual", name: "signal-1" } },
    ])
  })
})
