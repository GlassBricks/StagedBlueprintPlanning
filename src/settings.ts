// Copyright (c) 2022-2025 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { SettingsData } from "factorio:common"
import { BoolSettingDefinition, StringSettingDefinition } from "factorio:settings"
import { Settings } from "./constants"

declare const data: SettingsData

data.extend<StringSettingDefinition | BoolSettingDefinition>([
  {
    name: Settings.EntityInfoLocation,
    type: "string-setting",
    setting_type: "runtime-per-user",
    default_value: "right",
    allowed_values: ["right", "left"],
    order: "a",
  },
  {
    name: Settings.DeleteAtNextStage,
    type: "bool-setting",
    setting_type: "runtime-per-user",
    default_value: false,
    order: "d",
  },
  {
    name: Settings.CopyItemRequests,
    type: "bool-setting",
    setting_type: "runtime-per-user",
    default_value: true,
    order: "e",
  },
  {
    name: Settings.UnhideInfinityItems,
    type: "bool-setting",
    setting_type: "startup",
    default_value: true,
    order: "a",
  },
])
