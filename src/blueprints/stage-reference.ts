// Copyright (c) 2024 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { LuaItemStack } from "factorio:runtime"
import { Prototypes } from "../constants"
import { Events } from "../lib"
import { getProjectById } from "../project/project-refs"
import { ProjectId, Stage, StageId } from "../project/ProjectDef"
import { getCurrentValues } from "../utils/properties-obj"
import { getIconsFromSettings } from "./blueprint-settings"

const StageReferenceTag = "bp100StageReference"

export function createStageReference(stack: LuaItemStack, stage: Stage): boolean {
  if (!stack.valid) return false
  if (!stack.valid_for_read || stack.name != Prototypes.StageReference) stack.set_stack(Prototypes.StageReference)
  const name = stage.name.get()
  stack.label = `[[ ${name} ]]`
  stack.allow_manual_label_change = false
  stack.set_blueprint_entities([
    {
      name: Prototypes.StageReferenceData,
      entity_number: 1,
      position: { x: 0, y: 0 },
      tags: {
        [StageReferenceTag]: true,
        projectId: stage.project.id,
        stageId: stage.getID(),
      },
    },
  ])
  stack.preview_icons = getIconsFromSettings(getCurrentValues(stage.getBlueprintSettingsView()), name) ?? [
    {
      index: 1,
      signal: { type: "item", name: Prototypes.StageReference },
    },
  ]

  return true
}

/**
 * If is a blueprint reference, gets the stage it references.
 */
export function getReferencedStage(stack: LuaItemStack): Stage | nil {
  if (!stack.valid || !stack.valid_for_read || stack.name != Prototypes.StageReference) return nil
  const tags = stack.get_blueprint_entity_tags(1)
  if (
    !(tags && tags[StageReferenceTag] == true && typeof tags.projectId == "number" && typeof tags.stageId == "number")
  )
    return
  const projectId = tags.projectId as ProjectId
  const stageId = tags.stageId as StageId
  return getProjectById(projectId)?.getStageById(stageId)
}

/**
 * If is a blueprint reference, makes sure it is consistent with the referenced stage, or clears it.
 */
export function correctStageReference(stack: LuaItemStack): Stage | nil {
  if (!(stack.valid && stack.valid_for_read && stack.name == Prototypes.StageReference)) return nil
  const stage = getReferencedStage(stack)
  if (!stage) {
    stack.clear()
    return
  }
  createStageReference(stack, stage)
  return stage
}

export function correctStageReferenceRecursive(stack: LuaItemStack): void {
  if (!(stack.valid && stack.valid_for_read)) return
  if (stack.name == Prototypes.StageReference) {
    correctStageReference(stack)
    return
  }
  if (stack.is_blueprint_book) {
    const inv = stack.get_inventory(defines.inventory.item_main)!
    if (inv.is_empty()) return
    for (let i = 1; i <= inv.length; i++) {
      correctStageReferenceRecursive(inv[i - 1])
    }
  }
}

// opening a stage reference
// needs to be here instead of in blueprints/stage-reference.ts because of circular dependencies
Events.on_gui_opened((e) => {
  const item = e.item
  if (item) correctStageReferenceRecursive(item)
})
