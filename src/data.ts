/*
 * Copyright (c) 2022-2023 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { Data } from "typed-factorio/data/types"
import { empty_sprite, table } from "util"
import { Colors, CustomInputs, Prototypes, Sprites, Styles } from "./constants"
import {
  BasicSprite,
  CustomInputPrototype,
  DeconstructionItemPrototype,
  ItemGroupPrototype,
  ItemPrototype,
  ItemSubgroupPrototype,
  LayeredSpritePrototype,
  SelectionToolPrototype,
  ShortcutPrototype,
  SimpleEntityPrototype,
  SimpleEntityWithOwnerPrototype,
  SoundPrototype,
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

// undo reference
const undoReference: SimpleEntityWithOwnerPrototype = {
  type: "simple-entity-with-owner",
  name: Prototypes.UndoReference,
  icon: "__core__/graphics/spawn-flag.png",
  icon_size: 64,
  subgroup: Prototypes.BlueprintSubgroup,
  picture: empty_sprite() as Sprite,
  flags: ["hidden", "player-creation", "placeable-off-grid"],
  collision_mask: [],
}

const undoReferenceItem: ItemPrototype = {
  type: "item",
  name: Prototypes.UndoReference,
  icon: "__core__/graphics/spawn-flag.png",
  icon_size: 64,
  stack_size: 1,
  flags: ["hidden"],
  place_result: Prototypes.UndoReference,
}

data.extend([undoReference, undoReferenceItem])

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
  prototype: Omit<SelectionToolPrototype, "type">,
  icon: Sprite,
  associatedControl: string | nil,
  style: ShortcutPrototype["style"],
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
  getCleanupToolInput,
  selectionToolToShortcut(
    cleanupTool,
    {
      filename: "__bp100__/graphics/icons/cleanup-white.png",
      size: 64,
    },
    Prototypes.CleanupTool,
    "blue",
  ),
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

  reverse_selection_color: stageMoveToolAltColor,
  reverse_selection_cursor_box_type: "electricity",
  reverse_selection_mode: ["entity-with-owner"],
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
      filename: "__bp100__/graphics/icons/stage-move-tool-white.png",
      size: 32,
      mipmap_count: 2,
    },
    Prototypes.StageMoveTool,
    "blue",
  ),
  stageMoveToolInput,
])

const filteredStagedMoveTool: DeconstructionItemPrototype = {
  type: "deconstruction-item",
  name: Prototypes.FilteredStageMoveTool,
  icons: [
    {
      icon: "__bp100__/graphics/icons/purple-blueprint.png",
      icon_size: 64,
      icon_mipmaps: 4,
    },
    {
      icon: "__bp100__/graphics/icons/stage-move-tool-white.png",
      icon_size: 32,
      icon_mipmaps: 2,
      scale: 0.5,
    },
  ],
  flags: ["spawnable", "not-stackable"],
  stack_size: 1,

  entity_filter_count: 50,

  draw_label_for_cursor_render: true,

  subgroup: "tool",
  order: "z[bp100]-c[filtered-stage-move-tool]",

  selection_color: stageMoveToolColor,
  selection_cursor_box_type: "copy",
  selection_mode: ["deconstruct"],

  alt_selection_color: [0, 0, 0],
  alt_selection_cursor_box_type: "not-allowed",
  alt_selection_mode: ["nothing"],

  // can't do anything about alt or reverse selection mode
}

const filteredStagedMoveToolInput: CustomInputPrototype = {
  type: "custom-input",
  name: Prototypes.FilteredStageMoveTool,
  localised_name: ["item-name." + Prototypes.FilteredStageMoveTool],
  key_sequence: "",
  item_to_spawn: Prototypes.FilteredStageMoveTool,
  action: "spawn-item",
  order: "a[tools]-c[stage-move-tool-filtered]",
}

data.extend([
  filteredStagedMoveTool,
  filteredStagedMoveToolInput,
  selectionToolToShortcut(
    filteredStagedMoveTool,
    {
      filename: "__bp100__/graphics/icons/stage-move-tool-white.png",
      size: 32,
      mipmap_count: 2,
    },
    Prototypes.FilteredStageMoveTool,
    "red",
  ),
])

const deconstructionPlanner = table.deepcopy<DeconstructionItemPrototype>(
  data.raw["deconstruction-item"]["deconstruction-planner"],
)
deconstructionPlanner.tile_filter_count = nil
// blueprint filters
const blueprintFilters: DeconstructionItemPrototype = {
  ...deconstructionPlanner,
  name: Prototypes.BlueprintFilters,
  flags: ["hidden", "not-stackable", "spawnable"],
  entity_filter_count: 80,
}

data.extend([blueprintFilters])

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
  createSprite(Sprites.CollapseLeft, "__bp100__/graphics/icons/collapse-left.png", 32, nil, 2),
  createSprite(Sprites.CollapseLeftDark, "__bp100__/graphics/icons/collapse-left-dark.png", 32, nil, 2),
])

function shiftedBlueprintSprite(shift: MapPositionArray): BasicSprite {
  return {
    filename: "__base__/graphics/icons/blueprint.png",
    size: 64,
    mipmap_count: 4,
    shift,
    scale: 0.75,
  }
}
const blueprintStages: LayeredSpritePrototype = {
  type: "sprite",
  name: Sprites.BlueprintStages,
  layers: [
    {
      filename: "__base__/graphics/icons/blueprint.png",
      size: 64,
      mipmap_count: 4,
      tint: [0, 0, 0, 0],
    },
    shiftedBlueprintSprite([-6, -6]),
    shiftedBlueprintSprite([0, 0]),
    shiftedBlueprintSprite([6, 6]),
  ],
}
data.extend([blueprintStages])

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
const nextAssembly: CustomInputPrototype = {
  name: CustomInputs.NextAssembly,
  type: "custom-input",

  key_sequence: "",
  action: "lua",
  order: "b[navigate]-f[next-assembly]",
}
const previousAssembly: CustomInputPrototype = {
  name: CustomInputs.PreviousAssembly,
  type: "custom-input",

  key_sequence: "",
  action: "lua",
  order: "b[navigate]-g[previous-assembly]",
}

const stageSelectNext: CustomInputPrototype = {
  name: CustomInputs.StageSelectNext,
  type: "custom-input",

  action: "lua",
  key_sequence: "SHIFT + mouse-wheel-down",
  order: "a[tools]-g[stage-move-tool]-a[next]",
}
const stageSelectPrevious: CustomInputPrototype = {
  name: CustomInputs.StageSelectPrevious,
  type: "custom-input",

  key_sequence: "SHIFT + mouse-wheel-up",
  action: "lua",
  order: "a[tools]-g[stage-move-tool]-b[previous]",
}

data.extend([
  nextStage,
  previousStage,
  nextAssembly,
  previousAssembly,
  goToFirstStage,
  goToNextNotableStage,
  moveToThisStage,
  stageSelectNext,
  stageSelectPrevious,
])

const banana: SoundPrototype = {
  type: "sound",
  name: Prototypes.BANANA,
  filename: "__bp100__/sounds/banana.ogg",
}

data.extend([banana])

// styles

// local styles = data.raw["gui-style"].default
//
// -- Nomenclature: small = size 36; tiny = size 32
//
// -- Imitates a listbox, but allowing for way more customisation by using real buttons
// styles["fp_scroll-pane_fake_listbox"] = {
//   type = "scroll_pane_style",
//   parent = "scroll_pane_with_dark_background_under_subheader",
//   extra_right_padding_when_activated = -12,
//   background_graphical_set = { -- rubber grid
//   position = {282,17},
//   corner_size = 8,
//   overall_tiling_vertical_size = 22,
//   overall_tiling_vertical_spacing = 6,
//   overall_tiling_vertical_padding = 4,
//   overall_tiling_horizontal_padding = 4
// },
//   vertically_stretchable = "on",
//   padding = 0,
//   vertical_flow_style = {
//     type = "vertical_flow_style",
//     vertical_spacing = 0
//   }
// }

const styles = data.raw["gui-style"].default

styles[Styles.FakeListBox] = {
  type: "scroll_pane_style",
  parent: "scroll_pane_with_dark_background_under_subheader",
  extra_right_padding_when_activated: -12,
  background_graphical_set: {
    position: [282, 17],
    corner_size: 8,
    overall_tiling_vertical_size: 22,
    overall_tiling_vertical_spacing: 6,
    overall_tiling_vertical_padding: 4,
    overall_tiling_horizontal_padding: 4,
  },
  vertically_stretchable: "on",
  padding: 0,
  vertical_flow_style: {
    type: "vertical_flow_style",
    vertical_spacing: 0,
  },
}

styles[Styles.FakeListBoxItem] = {
  type: "button_style",
  parent: "list_box_item",
  left_padding: 4,
  right_padding: 8,
  horizontally_stretchable: "on",
  horizontally_squashable: "on",
}

styles[Styles.FakeListBoxItemActive] = {
  type: "button_style",
  parent: Styles.FakeListBoxItem,
  default_graphical_set: styles.button.selected_graphical_set,
  hovered_graphical_set: styles.button.selected_hovered_graphical_set,
  clicked_graphical_set: styles.button.selected_clicked_graphical_set,
  default_font_color: styles.button.selected_font_color,
  default_vertical_offset: styles.button.selected_vertical_offset,
}
