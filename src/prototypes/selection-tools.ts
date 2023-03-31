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
import { table } from "util"
import { Colors, Prototypes } from "../constants"
import {
  CustomInputPrototype,
  DeconstructionItemPrototype,
  IconData,
  SelectionToolPrototype,
  ShortcutPrototype,
  Sprite,
} from "../declarations/data"

declare const data: Data
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
function selectionToolToInput(prototype: Omit<SelectionToolPrototype, "type">): CustomInputPrototype {
  return {
    type: "custom-input",
    name: prototype.name,
    localised_name: ["item-name." + prototype.name],
    key_sequence: "",
    item_to_spawn: prototype.name,
    action: "spawn-item",
    order: prototype.order,
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
  order: "z[bp100]-c[cleanup]",

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

data.extend([
  cleanupTool,
  selectionToolToShortcut(
    cleanupTool,
    {
      filename: "__bp100__/graphics/icons/cleanup-white.png",
      size: 64,
    },
    Prototypes.CleanupTool,
    "blue",
  ),
  selectionToolToInput(cleanupTool),
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
  selectionToolToInput(stageMoveTool),
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
  order: "z[bp100]-b[stage-move-tool-filtered]",

  selection_color: stageMoveToolColor,
  selection_cursor_box_type: "copy",
  selection_mode: ["deconstruct"],

  alt_selection_color: [0, 0, 0],
  alt_selection_cursor_box_type: "not-allowed",
  alt_selection_mode: ["nothing"],

  // can't do anything about alt or reverse selection mode
}

data.extend([
  filteredStagedMoveTool,
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
  selectionToolToInput(filteredStagedMoveTool),
])

// stage delete tool
const deconstructionPlanner = table.deepcopy<DeconstructionItemPrototype>(
  data.raw["deconstruction-item"]["deconstruction-planner"],
)
function shiftedBlueprintSprite(shift: MapPositionArray, filename: string): IconData {
  return {
    icon: filename,
    icon_size: 64,
    shift,
    scale: 0.5,
  }
}

const deconstructionPlannerImage = "__base__/graphics/icons/deconstruction-planner.png"
// staged delete tool
const stageDeleteTool: SelectionToolPrototype = {
  type: "selection-tool",
  name: Prototypes.StageDeconstructTool,
  icons: [
    {
      icon: deconstructionPlannerImage,
      icon_size: 64,
      tint: [0, 0, 0, 0],
    },
    shiftedBlueprintSprite([-3, -3], deconstructionPlannerImage),
    shiftedBlueprintSprite([0, 0], deconstructionPlannerImage),
    shiftedBlueprintSprite([3, 3], deconstructionPlannerImage),
  ],

  flags: ["spawnable", "not-stackable", "only-in-cursor"],
  stack_size: 1,

  draw_label_for_cursor_render: true,

  subgroup: "tool",
  order: "z[bp100]-c[stage-deconstruct-tool]",

  selection_color: deconstructionPlanner.selection_color,
  selection_cursor_box_type: "not-allowed",
  selection_mode: ["blueprint"],

  alt_selection_color: deconstructionPlanner.alt_selection_color,
  alt_selection_cursor_box_type: "not-allowed",
  alt_selection_mode: ["blueprint"],

  reverse_selection_color: deconstructionPlanner.reverse_selection_color,
  reverse_selection_cursor_box_type: "not-allowed",
  reverse_selection_mode: ["nothing"],
}

data.extend([
  stageDeleteTool,
  selectionToolToShortcut(
    stageDeleteTool,
    {
      filename: "__base__/graphics/icons/shortcut-toolbar/mip/new-deconstruction-planner-x32-white.png",
      size: 32,
      mipmap_count: 2,
    },
    Prototypes.StageDeconstructTool,
    "blue",
  ),
  selectionToolToInput(stageDeleteTool),
])

// blueprint filters

deconstructionPlanner.tile_filter_count = nil
const blueprintFilters: DeconstructionItemPrototype = {
  ...deconstructionPlanner,
  name: Prototypes.BlueprintFilters,
  flags: ["hidden", "not-stackable", "spawnable"],
  entity_filter_count: 80,
}

data.extend([blueprintFilters])
