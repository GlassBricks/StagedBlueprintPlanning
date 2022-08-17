/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of BBPP3.
 *
 * BBPP3 is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * BBPP3 is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with BBPP3. If not, see <https://www.gnu.org/licenses/>.
 */

import { Data } from "typed-factorio/data/types"
import { CustomInputs, Prototypes } from "./constants"
import {
  CustomInputPrototype,
  ItemGroupPrototype,
  ItemPrototype,
  ItemSubgroupPrototype,
  SelectionToolPrototype,
  SimpleEntityPrototype,
  Sprite,
} from "./declarations/data"

declare const data: Data

const buildInput: CustomInputPrototype = {
  type: "custom-input",
  name: CustomInputs.Build,

  key_sequence: "",
  linked_game_control: "build",
}
const removePoleCablesInput: CustomInputPrototype = {
  name: CustomInputs.RemovePoleCables,
  type: "custom-input",

  key_sequence: "",
  linked_game_control: "remove-pole-cables",
}

data.extend([buildInput, removePoleCablesInput])

const emptySprite: Sprite = {
  filename: "__core__/graphics/empty.png",
  width: 1,
  height: 1,
}

const entityMarker: SimpleEntityPrototype = {
  type: "simple-entity",
  name: Prototypes.EntityMarker,
  picture: emptySprite,
  flags: ["hidden", "player-creation", "placeable-off-grid"],
  collision_mask: [],
}

const entityMarkerItem: ItemPrototype = {
  type: "item",
  name: Prototypes.EntityMarker,
  icon: "__core__/graphics/spawn-flag.png",
  icon_size: 64,
  stack_size: 1,
  flags: ["hidden"],
  place_result: Prototypes.EntityMarker,
}

data.extend([entityMarker, entityMarkerItem])

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
  order: "a",
}
const selectionProxySubgroup: ItemSubgroupPrototype = {
  type: "item-subgroup",
  name: Prototypes.SelectionProxySubgroup,
  group: Prototypes.UtilityGroup,
  order: "b",
}

data.extend([utilityGroup, previewEntitySubgroup, selectionProxySubgroup])

// light yellow
const cleanupToolColor: ColorArray = [0.9, 0.9, 0.2]
const cleanupToolDeleteColor: ColorArray = [0.9, 0.2, 0.2, 0.5]
const cleanupTool: SelectionToolPrototype = {
  type: "selection-tool",
  name: Prototypes.CleanupTool,
  icons: [
    {
      icon: "__base__/graphics/icons/blueprint.png",
      icon_size: 64,
      tint: [1, 1, 1, 0.5],
    },
    {
      icon: "__bbpp3__/graphics/cleanup.png",
      icon_size: 64,
      scale: 0.4,
    },
  ],
  icon_mipmaps: 4,

  flags: ["only-in-cursor", "spawnable", "not-stackable"],
  stack_size: 1,

  subgroup: "tool",
  order: "z-bp3-cleanup",

  selection_mode: ["entity-with-owner"],
  selection_color: cleanupToolColor,
  selection_cursor_box_type: "entity",

  alt_selection_mode: ["entity-with-owner"],
  alt_selection_color: cleanupToolDeleteColor,
  alt_selection_cursor_box_type: "not-allowed",

  // filters set in data-final-fixes
}

data.extend([cleanupTool])
