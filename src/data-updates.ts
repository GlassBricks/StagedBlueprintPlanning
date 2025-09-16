// Copyright (c) 2022 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { PrototypeData } from "factorio:common"
import { ItemPrototype } from "factorio:prototype"
import { Settings } from "./constants"

declare const data: PrototypeData

if (settings.startup[Settings.UnhideInfinityItems].value) {
  function removeHiddenFlag(prototype: ItemPrototype | nil): void {
    if (prototype) prototype.hidden = false
  }
  removeHiddenFlag(data.raw.item["electric-energy-interface"])
  removeHiddenFlag(data.raw.item["linked-chest"])
  removeHiddenFlag(data.raw.item["linked-belt"])
  removeHiddenFlag(data.raw.item["heat-interface"])
  removeHiddenFlag(data.raw.item["infinity-chest"])
  removeHiddenFlag(data.raw.item["infinity-pipe"])
}

// if (settings.startup[Settings.FlexibleOffshorePumpPlacement].value) {
//   for (const [, pump] of pairs(data.raw["offshore-pump"])) {
//     pump.tile_buildability_rules = nil
//     pump.placeable_position_visualization = nil
//     pump.flags = pump.flags?.filter((f) => f != "filter-directions")
//   }
// }
