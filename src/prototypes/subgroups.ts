/*
 * Copyright (c) 2023 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { Data } from "typed-factorio/data/types"
import { Prototypes } from "../constants"
import { ItemGroupPrototype, ItemSubgroupPrototype } from "../declarations/data"

declare const data: Data

const utilityGroup: ItemGroupPrototype = {
  type: "item-group",
  name: Prototypes.UtilityGroup,
  order: "z-utility",
  icon: "__base__/graphics/icons/blueprint.png",
  icon_size: 64,
}
const previewEntitySubgroup: ItemSubgroupPrototype = {
  type: "item-subgroup",
  name: Prototypes.PreviewEntitySubgroup,
  group: Prototypes.UtilityGroup,
  order: "b",
}
const selectionProxySubgroup: ItemSubgroupPrototype = {
  type: "item-subgroup",
  name: Prototypes.SelectionProxySubgroup,
  group: Prototypes.UtilityGroup,
  order: "c",
}
const blueprintSubgroup: ItemSubgroupPrototype = {
  type: "item-subgroup",
  name: Prototypes.BlueprintSubgroup,
  group: Prototypes.UtilityGroup,
  order: "a",
}

data.extend([utilityGroup, previewEntitySubgroup, selectionProxySubgroup, blueprintSubgroup])
