// Copyright (c) 2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { PrototypeData } from "factorio:common"
import {
  BlueprintItemPrototype,
  CustomInputPrototype,
  DeconstructionItemPrototype,
  IconData,
  SelectionToolPrototype,
  ShortcutPrototype,
} from "factorio:prototype"
import { table } from "util"
import { Colors, Prototypes } from "../constants"

declare const data: PrototypeData

function selectionToolToShortcut(
  prototype: SelectionToolPrototype | DeconstructionItemPrototype,
  icon: string,
  associatedControl: string | nil,
  style: ShortcutPrototype["style"],
  icon_size: number = 32,
): ShortcutPrototype {
  return {
    type: "shortcut",
    name: prototype.name,
    order: prototype.order,
    action: "spawn-item",
    item_to_spawn: prototype.name,
    icon,
    icon_size,
    small_icon: icon,
    small_icon_size: 32,
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

  select: {
    mode: ["any-entity"],
    border_color: cleanupToolColor,
    cursor_box_type: "entity",
  },
  alt_select: {
    mode: ["any-entity"],
    border_color: cleanupToolColor,
    cursor_box_type: "entity",
  },
  reverse_select: {
    mode: ["any-entity"],
    border_color: cleanupReverseToolColor,
    cursor_box_type: "not-allowed",
  },
}

data.extend([
  cleanupTool,
  selectionToolToShortcut(
    cleanupTool,
    "__bp100__/graphics/icons/cleanup-white.png",
    Prototypes.CleanupTool,
    "blue",
    64,
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
  flags: ["spawnable", "not-stackable", "only-in-cursor"],
  stack_size: 1,

  draw_label_for_cursor_render: true,

  subgroup: "tool",
  order: "z[bp100]-a[a-tools]-b[stage-move-tool]",

  select: {
    mode: ["deconstruct"],
    border_color: stageMoveToolColor,
    cursor_box_type: "copy",
  },
  alt_select: {
    mode: ["any-entity"],
    border_color: stageMoveToolAltColor,
    cursor_box_type: "copy",
  },
  reverse_select: {
    mode: ["any-entity"],
    border_color: stageMoveToolReverseColor,
    cursor_box_type: "electricity",
  },
  alt_reverse_select: {
    mode: ["any-entity"],
    border_color: stageMoveToolReverseColor,
    cursor_box_type: "electricity",
  },
}

data.extend([
  stageMoveTool,
  selectionToolToShortcut(
    stageMoveTool,
    "__bp100__/graphics/icons/stage-move-tool-white.png",
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
    },
    {
      icon: "__bp100__/graphics/icons/stage-move-tool-white.png",
      icon_size: 32,
      scale: 0.5,
    },
  ],
  flags: ["spawnable", "not-stackable"],
  stack_size: 1,

  entity_filter_count: 50,

  draw_label_for_cursor_render: true,

  subgroup: "tool",
  order: "z[bp100]-a[a-tools]-c[filtered-stage-move-tool]",

  select: {
    mode: ["deconstruct"],
    border_color: stageMoveToolColor,
    cursor_box_type: "copy",
  },
  alt_select: {
    mode: ["nothing"],
    border_color: [0, 0, 0],
    cursor_box_type: "not-allowed",
  },
}

data.extend([
  filteredStagedMoveTool,
  selectionToolToShortcut(
    filteredStagedMoveTool,
    "__bp100__/graphics/icons/stage-move-tool-white.png",
    Prototypes.FilteredStageMoveTool,
    "red",
  ),
  selectionToolToInput(filteredStagedMoveTool),
])

const deconstructionPlanner = table.deepcopy(data.raw["deconstruction-item"]["deconstruction-planner"]!)
const stagedDeconstructTool: SelectionToolPrototype = {
  type: "selection-tool",
  name: Prototypes.StageDeconstructTool,
  icon: "__bp100__/graphics/icons/staged-deconstruct-tool.png",
  icon_size: 64,

  flags: ["spawnable", "not-stackable", "only-in-cursor"],
  stack_size: 1,

  draw_label_for_cursor_render: true,

  subgroup: "tool",
  order: "z[bp100]-a[a-tools]-e[stage-deconstruct-tool]",

  select: {
    mode: ["blueprint"],
    border_color: deconstructionPlanner.select.border_color,
    cursor_box_type: "not-allowed",
  },
  alt_select: {
    mode: ["blueprint"],
    border_color: deconstructionPlanner.alt_select.border_color,
    cursor_box_type: "not-allowed",
  },
  reverse_select: {
    mode: ["blueprint"],
    border_color: deconstructionPlanner.select.border_color,
    cursor_box_type: "not-allowed",
  },
}

data.extend([
  stagedDeconstructTool,
  selectionToolToShortcut(
    stagedDeconstructTool,
    "__bp100__/graphics/icons/staged-deconstruct-tool-new.png",
    Prototypes.StageDeconstructTool,
    "red",
  ),
  selectionToolToInput(stagedDeconstructTool, nil, false),
])

const copyTool = table.deepcopy(data.raw["copy-paste-tool"]["copy-paste-tool"]!)

const stageCopyTool: SelectionToolPrototype = {
  type: "selection-tool",
  name: Prototypes.StagedCopyTool,

  icon: "__bp100__/graphics/icons/staged-copy-tool.png",
  icon_size: 64,

  subgroup: "tool",
  order: "z[bp100]-b[b-tools]-a[staged-copy-tool]",

  flags: ["spawnable", "not-stackable", "only-in-cursor"],
  stack_size: 1,

  select: {
    mode: ["blueprint"],
    border_color: copyTool.select.border_color,
    cursor_box_type: "copy",
  },
  alt_select: {
    mode: ["blueprint"],
    border_color: copyTool.alt_select.border_color,
    cursor_box_type: "copy",
  },
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
    "__bp100__/graphics/icons/staged-copy-white.png",
    Prototypes.StagedCopyTool,
    "blue",
  ),
  stageCutTool,
  selectionToolToShortcut(
    stageCutTool,
    "__bp100__/graphics/icons/staged-cut-white.png",
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

  select: {
    mode: ["blueprint"],
    border_color: deconstructionPlanner.select.border_color,
    cursor_box_type: "not-allowed",
  },
  alt_select: {
    mode: ["any-entity"],
    border_color: deconstructionPlanner.alt_select.border_color,
    cursor_box_type: "not-allowed",
  },
}

data.extend([
  forceDeleteTool,
  selectionToolToShortcut(
    forceDeleteTool,
    "__bp100__/graphics/icons/force-delete-tool-new.png",
    Prototypes.ForceDeleteTool,
    "red",
  ),
  selectionToolToInput(forceDeleteTool, nil, false),
])

const excludeFromBlueprintsTool: SelectionToolPrototype = {
  type: "selection-tool",
  name: Prototypes.ExcludeFromBlueprintsTool,
  icons: [
    {
      icon: "__base__/graphics/icons/deconstruction-planner.png",
      icon_size: 64,
      tint: [1, 1, 1, 0.5],
    },
    {
      icon: "__core__/graphics/icons/mip/not-available.png",
      icon_size: 32,
      scale: 0.7,
    },
  ],

  flags: ["only-in-cursor", "spawnable", "not-stackable"],
  stack_size: 1,

  subgroup: "tool",
  order: "z[bp100]-a[a-tools]-f[exclude-from-blueprints-tool]",

  select: {
    mode: ["any-entity"],
    border_color: deconstructionPlanner.select.border_color,
    cursor_box_type: "not-allowed",
  },
  alt_select: {
    mode: ["any-entity"],
    border_color: deconstructionPlanner.alt_select.border_color,
    cursor_box_type: "entity",
  },
}

const notAvailableIcon: IconData = {
  icon: "__core__/graphics/icons/mip/not-available.png",
  icon_size: 32,
}

const excludeFromBlueprintsShortcut: ShortcutPrototype = {
  type: "shortcut",
  name: excludeFromBlueprintsTool.name,
  order: excludeFromBlueprintsTool.order,
  action: "spawn-item",
  item_to_spawn: excludeFromBlueprintsTool.name,
  icons: [notAvailableIcon],
  small_icons: [notAvailableIcon],
  style: "red",
  associated_control_input: Prototypes.ExcludeFromBlueprintsTool,
  localised_name: ["item-name." + excludeFromBlueprintsTool.name],
}

data.extend([excludeFromBlueprintsTool, excludeFromBlueprintsShortcut, selectionToolToInput(excludeFromBlueprintsTool)])

const stageReference = table.deepcopy(data.raw["blueprint"]["blueprint"])!
stageReference.subgroup = nil
Object.assign(stageReference, {
  name: Prototypes.StageReference,
  icon: "__bp100__/graphics/icons/purple-blueprint.png",
  hidden: true,
  flags: ["not-stackable", "spawnable"],
} satisfies Partial<BlueprintItemPrototype>)

data.extend([stageReference])
