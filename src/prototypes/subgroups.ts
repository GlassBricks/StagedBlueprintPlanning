// Copyright (c) 2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { PrototypeData } from "factorio:common"
import { ItemGroup, ItemSubGroup } from "factorio:prototype"
import { Prototypes } from "../constants"

declare const data: PrototypeData

const utilityGroup: ItemGroup = {
  type: "item-group",
  name: Prototypes.UtilityGroup,
  order: "z-utility",
  icon: "__base__/graphics/icons/blueprint.png",
  icon_size: 64,
}
const previewEntitySubgroup: ItemSubGroup = {
  type: "item-subgroup",
  name: Prototypes.PreviewEntitySubgroup,
  group: Prototypes.UtilityGroup,
  order: "b",
}
const blueprintSubgroup: ItemSubGroup = {
  type: "item-subgroup",
  name: Prototypes.BlueprintSubgroup,
  group: Prototypes.UtilityGroup,
  order: "a",
}

data.extend([utilityGroup, previewEntitySubgroup, blueprintSubgroup])
