// Copyright (c) 2024 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

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
      icon3: { type: "item", name: "iron-plate" },
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
      icon2: { type: "item", name: "iron-plate" },
    }

    const result = getIconsFromSettings(settings, "stage-1")
    expect(result).toEqual([
      { index: 2, signal: { type: "item", name: "iron-plate" } },
      { index: 3, signal: { type: "virtual", name: "signal-1" } },
    ])
  })
})
