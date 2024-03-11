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

import { PrototypeData } from "factorio:common"
import {
  CustomInputPrototype,
  DeconstructionItemPrototype,
  SelectionToolPrototype,
  ShortcutPrototype,
  Sprite,
} from "factorio:prototype"
import { table } from "util"
import { Colors, Prototypes } from "../constants"

declare const data: PrototypeData

function selectionToolToShortcut(
  prototype: SelectionToolPrototype | DeconstructionItemPrototype,
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
    localised_name: prototype.localised_name ?? ["item-name." + prototype.name],
  }
}
function selectionToolToInput(
  prototype: SelectionToolPrototype | DeconstructionItemPrototype,
  keySequence: string = "",
  useItemNameForLocalisedName: boolean = true,
): CustomInputPrototype {
  return {
    type: "custom-input",
    name: prototype.name,
    localised_name: useItemNameForLocalisedName ? ["item-name." + prototype.name] : nil,
    order: prototype.order,

    key_sequence: keySequence,
    action: "spawn-item",
    item_to_spawn: prototype.name,
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
  order: "z[bp100]-a[a-tools]-a[cleanup-tool]",

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
const stageMoveToolAltColor = Colors.Orange2
const stageMoveToolReverseColor = Colors.Blueish

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
  order: "z[bp100]-a[a-tools]-b[stage-move-tool]",

  selection_color: stageMoveToolColor,
  selection_cursor_box_type: "copy",
  selection_mode: ["deconstruct"],

  alt_selection_color: stageMoveToolAltColor,
  alt_selection_cursor_box_type: "copy",
  alt_selection_mode: ["any-entity"],

  reverse_selection_color: stageMoveToolReverseColor,
  reverse_selection_cursor_box_type: "electricity",
  reverse_selection_mode: ["any-entity"],

  alt_reverse_selection_color: stageMoveToolReverseColor,
  alt_reverse_selection_cursor_box_type: "electricity",
  alt_reverse_selection_mode: ["any-entity"],
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
  order: "z[bp100]-a[a-tools]-c[filtered-stage-move-tool]",

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

const deconstructionPlanner = table.deepcopy(data.raw["deconstruction-item"]["deconstruction-planner"]!)
// staged delete tool
const stagedDeconstructTool: SelectionToolPrototype = {
  type: "selection-tool",
  name: Prototypes.StageDeconstructTool,
  icon: "__bp100__/graphics/icons/staged-deconstruct-tool.png",
  icon_size: 64,
  icon_mipmaps: 2,

  flags: ["spawnable", "not-stackable", "only-in-cursor"],
  stack_size: 1,

  draw_label_for_cursor_render: true,

  subgroup: "tool",
  order: "z[bp100]-a[a-tools]-e[stage-deconstruct-tool]",

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
  stagedDeconstructTool,
  selectionToolToShortcut(
    stagedDeconstructTool,
    {
      filename: "__bp100__/graphics/icons/staged-deconstruct-tool-new.png",
      size: 32,
    },
    Prototypes.StageDeconstructTool,
    "red",
  ),
  selectionToolToInput(stagedDeconstructTool, nil, false),
])

// staged copy and cut tools
const copyTool = table.deepcopy(data.raw["copy-paste-tool"]["copy-paste-tool"]!)

const stageCopyTool: SelectionToolPrototype = {
  type: "selection-tool",
  name: Prototypes.StagedCopyTool,

  icon: "__bp100__/graphics/icons/staged-copy-tool.png",
  icon_size: 64,
  icon_mipmaps: 2,

  subgroup: "tool",
  order: "z[bp100]-b[b-tools]-a[staged-copy-tool]",

  flags: ["spawnable", "not-stackable", "only-in-cursor"],
  stack_size: 1,

  selection_mode: ["blueprint"],
  selection_color: copyTool.selection_color,
  selection_cursor_box_type: "copy",

  alt_selection_mode: ["blueprint"],
  alt_selection_color: copyTool.alt_selection_color,
  alt_selection_cursor_box_type: "copy",
}

const stageCutTool: SelectionToolPrototype = table.deepcopy(stageCopyTool)
Object.assign(stageCutTool, {
  name: Prototypes.StagedCutTool,
  order: "z[bp100]-b[b-tools]-b[staged-cut-tool]",
  icon: "__bp100__/graphics/icons/staged-cut-tool.png",
} satisfies Partial<SelectionToolPrototype>)

data.extend([
  stageCopyTool,
  selectionToolToShortcut(
    stageCopyTool,
    {
      filename: "__bp100__/graphics/icons/staged-copy-white.png",
      size: 32,
      mipmap_count: 2,
    },
    Prototypes.StagedCopyTool,
    "blue",
  ),
  stageCutTool,
  selectionToolToShortcut(
    stageCutTool,
    {
      filename: "__bp100__/graphics/icons/staged-cut-white.png",
      size: 32,
      mipmap_count: 2,
    },
    Prototypes.StagedCutTool,
    "blue",
  ),

  selectionToolToInput(stageCopyTool, "CONTROL + SHIFT + C"),
  selectionToolToInput(stageCutTool, "CONTROL + SHIFT + X"),
])

const forceDeleteTool: SelectionToolPrototype = {
  type: "selection-tool",
  name: Prototypes.ForceDeleteTool,
  icon: "__bp100__/graphics/icons/force-delete-tool.png",
  icon_size: 64,
  flags: ["spawnable", "not-stackable", "only-in-cursor"],
  stack_size: 1,

  draw_label_for_cursor_render: true,

  subgroup: "tool",
  order: "z[bp100]-b[b-tools]-c[force-delete-tool]",

  selection_mode: ["blueprint"],
  selection_color: deconstructionPlanner.selection_color,
  selection_cursor_box_type: "not-allowed",

  alt_selection_mode: ["any-entity"],
  alt_selection_color: deconstructionPlanner.selection_color,
  alt_selection_cursor_box_type: "not-allowed",
}

data.extend([
  forceDeleteTool,
  selectionToolToShortcut(
    forceDeleteTool,
    {
      filename: "__bp100__/graphics/icons/force-delete-tool-new.png",
      size: 32,
      mipmap_count: 2,
    },
    Prototypes.ForceDeleteTool,
    "red",
  ),
  selectionToolToInput(forceDeleteTool, nil, false),
])
