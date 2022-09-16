/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of 100% Blueprint Planning.
 *
 * 100% Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * 100% Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with 100% Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { Data } from "typed-factorio/data/types"
import { empty_sprite } from "util"
import { CustomInputs, Prototypes, Sprites } from "./constants"
import {
  CustomInputPrototype,
  ItemGroupPrototype,
  ItemPrototype,
  ItemSubgroupPrototype,
  SelectionToolPrototype,
  ShortcutPrototype,
  SimpleEntityPrototype,
  Sprite,
  SpritePrototype,
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

const emptySprite: Sprite = empty_sprite() as Sprite

const entityMarker: SimpleEntityPrototype = {
  type: "simple-entity",
  name: Prototypes.EntityMarker,
  icon: "__core__/graphics/spawn-flag.png",
  icon_size: 64,
  subgroup: Prototypes.BlueprintSubgroup,
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

const fakeSelectionBox2x2: Sprite = {
  filename: "__core__/graphics/arrows/fake-selection-box-2x2.png",
  size: 128,
  scale: 0.5,
}

const gridEnforcer: SimpleEntityPrototype = {
  type: "simple-entity",
  name: Prototypes.GridEnforcer,
  icon: "__core__/graphics/arrows/fake-selection-box-2x2.png",
  icon_size: 128,
  subgroup: Prototypes.BlueprintSubgroup,
  picture: fakeSelectionBox2x2,
  render_layer: "selection-box",

  build_grid_size: 2,
  flags: ["hidden", "player-creation"],
  collision_mask: [],
  selection_box: [
    [-1, -1],
    [1, 1],
  ],
  minable: { mining_time: 0 },
}

const gridEnforcerItem: ItemPrototype = {
  type: "item",
  name: Prototypes.GridEnforcer,
  icon: "__core__/graphics/arrows/fake-selection-box-2x2.png",
  icon_size: 128,
  stack_size: 1,
  flags: ["hidden"],
  place_result: Prototypes.GridEnforcer,
}

data.extend([entityMarker, entityMarkerItem, gridEnforcer, gridEnforcerItem])

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

// light yellow
const cleanupToolColor: ColorArray = [0.5, 0.9, 0.5]
const cleanupReverseToolColor: ColorArray = [0.9, 0.5, 0.5]
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
      icon: "__bp100__/graphics/icons/cleanup-white.png",
      icon_size: 64,
      scale: 0.4,
    },
  ],
  icon_mipmaps: 4,

  flags: ["only-in-cursor", "spawnable", "not-stackable"],
  stack_size: 1,

  subgroup: "tool",
  order: "z[bp100]-b[cleanup]",

  selection_mode: ["any-entity"],
  selection_color: cleanupToolColor,
  selection_cursor_box_type: "entity",

  alt_selection_mode: ["any-entity"],
  alt_selection_color: cleanupToolColor,
  alt_selection_cursor_box_type: "entity",

  reverse_selection_mode: ["any-entity"],
  reverse_selection_color: cleanupReverseToolColor,
  reverse_selection_cursor_box_type: "not-allowed",
}

function selectionToolToShortcut(
  prototype: SelectionToolPrototype,
  icon: Sprite,
  associatedControl?: string,
): ShortcutPrototype {
  const value: ShortcutPrototype = {
    type: "shortcut",
    name: prototype.name,
    order: prototype.order,
    action: "spawn-item",
    item_to_spawn: prototype.name,
    icon,
    style: "blue",
    associated_control_input: associatedControl,
  }
  return value
}
const getCleanupToolInput: CustomInputPrototype = {
  type: "custom-input",
  name: Prototypes.CleanupTool,
  localised_name: ["item-name." + Prototypes.CleanupTool],
  key_sequence: "",
  item_to_spawn: Prototypes.CleanupTool,
  action: "spawn-item",
  order: "a[tools]-[cleanup]",
}

data.extend([
  cleanupTool,
  selectionToolToShortcut(
    cleanupTool,
    {
      filename: "__bp100__/graphics/icons/cleanup-white.png",
      size: 64,
    },
    Prototypes.CleanupTool,
  ),
  getCleanupToolInput,
])

function createSprite(
  name: string,
  filename: string,
  size: number,
  position?: MapPositionArray,
  mipmaps?: number,
): SpritePrototype {
  return {
    type: "sprite",
    name,
    filename,
    size,
    flags: ["icon"],
    mipmap_count: mipmaps,
  }
}

data.extend([
  createSprite(Sprites.ExternalLinkBlack, "__bp100__/graphics/icons/external-link-black.png", 32),
  createSprite(Sprites.ExternalLinkWhite, "__bp100__/graphics/icons/external-link-white.png", 32),
])

const nextStage: CustomInputPrototype = {
  type: "custom-input",
  name: CustomInputs.NextStage,
  action: "lua",
  key_sequence: "CONTROL + mouse-wheel-down",
  order: "b[navigate]-a[next-stage]",
}
const previousStage: CustomInputPrototype = {
  type: "custom-input",
  name: CustomInputs.PreviousStage,
  action: "lua",
  key_sequence: "CONTROL + mouse-wheel-up",
  order: "b[navigate]-b[previous-stage]",
}
const goToNextNotableStage: CustomInputPrototype = {
  type: "custom-input",
  name: CustomInputs.GoToNextNotableStage,
  action: "lua",
  key_sequence: "CONTROL + mouse-button-3",
  order: "b[navigate]-c[go-to-next-notable-stage]",
}
const goToFirstStage: CustomInputPrototype = {
  type: "custom-input",
  name: CustomInputs.GoToFirstStage,
  action: "lua",
  key_sequence: "CONTROL + SHIFT + mouse-button-3",
  order: "b[navigate]-d[go-to-first-stage]",
}
const moveToThisStage: CustomInputPrototype = {
  type: "custom-input",
  name: CustomInputs.MoveToThisStage,
  action: "lua",
  key_sequence: "CONTROL + ALT + mouse-button-3",
  order: "b[navigate]-e[move-to-this-stage]",
}

data.extend([nextStage, previousStage, goToFirstStage, goToNextNotableStage, moveToThisStage])
