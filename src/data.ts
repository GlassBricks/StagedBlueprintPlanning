/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { Data } from "typed-factorio/data/types"
import { empty_sprite } from "util"
import { Colors, CustomInputs, Prototypes, Sprites } from "./constants"
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

// entity marker
const entityMarker: SimpleEntityPrototype = {
  type: "simple-entity",
  name: Prototypes.EntityMarker,
  icon: "__core__/graphics/spawn-flag.png",
  icon_size: 64,
  subgroup: Prototypes.BlueprintSubgroup,
  picture: empty_sprite() as Sprite,
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

function selectionToolToShortcut(
  prototype: SelectionToolPrototype,
  icon: Sprite,
  associatedControl: string | nil,
  style: ShortcutPrototype["style"] = "blue",
): ShortcutPrototype {
  return {
    type: "shortcut",
    name: prototype.name,
    order: prototype.order,
    action: "spawn-item",
    item_to_spawn: prototype.name,
    icon,
    style,
    associated_control_input: associatedControl,
  }
}
// Cleanup tool
const cleanupToolColor = Colors.Green
const cleanupReverseToolColor = Colors.Red
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

  flags: ["only-in-cursor", "spawnable", "not-stackable"],
  stack_size: 1,

  subgroup: "tool",
  order: "z[bp100]-b[cleanup]",

  selection_mode: ["entity-with-owner"],
  selection_color: cleanupToolColor,
  selection_cursor_box_type: "entity",

  alt_selection_mode: ["entity-with-owner"],
  alt_selection_color: cleanupToolColor,
  alt_selection_cursor_box_type: "entity",

  reverse_selection_mode: ["entity-with-owner"],
  reverse_selection_color: cleanupReverseToolColor,
  reverse_selection_cursor_box_type: "not-allowed",
}

const getCleanupToolInput: CustomInputPrototype = {
  type: "custom-input",
  name: Prototypes.CleanupTool,
  localised_name: ["item-name." + Prototypes.CleanupTool],
  key_sequence: "",
  item_to_spawn: Prototypes.CleanupTool,
  action: "spawn-item",
  order: "a[tools]-a[cleanup]",
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
// Move to stage tool
const stageMoveToolColor = Colors.Orange
const stageMoveToolAltColor = Colors.Blueish

const stageMoveTool: SelectionToolPrototype = {
  type: "selection-tool",
  name: Prototypes.StageMoveTool,
  icon: "__bp100__/graphics/icons/stage-move-tool.png",
  icon_size: 64,
  icon_mipmaps: 4,
  flags: ["spawnable", "not-stackable", "only-in-cursor"],
  stack_size: 1,

  draw_label_for_cursor_render: true,

  subgroup: "tool",
  order: "z[bp100]-a[stage-move-tool]",

  selection_color: stageMoveToolColor,
  selection_cursor_box_type: "copy",
  selection_mode: ["deconstruct"],

  alt_selection_color: stageMoveToolAltColor,
  alt_selection_cursor_box_type: "electricity",
  alt_selection_mode: ["entity-with-owner"],
}

const stageMoveToolInput: CustomInputPrototype = {
  type: "custom-input",
  name: Prototypes.StageMoveTool,
  localised_name: ["item-name." + Prototypes.StageMoveTool],
  key_sequence: "",
  item_to_spawn: Prototypes.StageMoveTool,
  action: "spawn-item",
  order: "a[tools]-b[stage-move-tool]",
}

data.extend([
  stageMoveTool,
  selectionToolToShortcut(
    stageMoveTool,
    {
      filename: "__bp100__/graphics/icons/stage-move-tool-black.png",
      size: 32,
      mipmap_count: 2,
    },
    Prototypes.StageMoveTool,
    "default",
  ),
  stageMoveToolInput,
])

// Sprites
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

const buildInput: CustomInputPrototype = {
  type: "custom-input",
  name: CustomInputs.Build,

  key_sequence: "",
  linked_game_control: "build",
}
const removePoleCablesInput: CustomInputPrototype = {
  type: "custom-input",
  name: CustomInputs.RemovePoleCables,

  key_sequence: "",
  linked_game_control: "remove-pole-cables",
}
data.extend([buildInput, removePoleCablesInput])

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
const stageSelectNext: CustomInputPrototype = {
  name: CustomInputs.StageSelectNext,
  type: "custom-input",

  action: "lua",
  key_sequence: "SHIFT + mouse-wheel-down",
  order: "a[tools]-b[stage-move-tool]-a[next]",
}
const stageSelectPrevious: CustomInputPrototype = {
  name: CustomInputs.StageSelectPrevious,
  type: "custom-input",

  key_sequence: "SHIFT + mouse-wheel-up",
  action: "lua",
  order: "a[tools]-b[stage-move-tool]-b[previous]",
}

data.extend([
  nextStage,
  previousStage,
  goToFirstStage,
  goToNextNotableStage,
  moveToThisStage,
  stageSelectNext,
  stageSelectPrevious,
])
