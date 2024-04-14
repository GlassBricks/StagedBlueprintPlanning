/*
 * Copyright (c) 2024 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { LuaItemStack } from "factorio:runtime"
import { Prototypes } from "../constants"
import { Events } from "../lib"
import { getProjectById } from "../project/project-refs"
import { ProjectId, Stage, StageId } from "../project/ProjectDef"
import { getCurrentValues } from "../utils/properties-obj"
import { getIconsFromSettings } from "./blueprint-settings"

export function createStageReference(stack: LuaItemStack, stage: Stage): void {
  if (!stack.valid) return
  if (!stack.valid_for_read || stack.name != Prototypes.StageReference) stack.set_stack(Prototypes.StageReference)
  const name = stage.name.get()
  stack.label = `Template: ${name}`
  stack.allow_manual_label_change = false
  const inventory = assert(stack.get_inventory(defines.inventory.item_main))
  const innerStack = inventory[0]
  innerStack.set_stack("blueprint")
  innerStack.allow_manual_label_change = false
  innerStack.label = `INTERNAL, do not tamper: ${stage.project.id};${stage.getID()}`

  stack.blueprint_icons = getIconsFromSettings(getCurrentValues(stage.getBlueprintSettingsView()), name) ?? []
}

/**
 * If is a blueprint reference, gets the stage it references.
 */
export function getReferencedStage(stack: LuaItemStack): Stage | nil {
  if (!stack.valid || !stack.valid_for_read || stack.name != Prototypes.StageReference) return nil
  const innerStack = stack.get_inventory(defines.inventory.item_main)![0]
  if (!innerStack.valid || innerStack.name != "blueprint") return
  const label = innerStack.label
  if (!label) return
  const [projectIdStr, stageIdStr] = string.match(label, "(%d+);(%d+)$")
  const projectId = tonumber(projectIdStr)
  const stageId = tonumber(stageIdStr)
  if (!(projectId && stageId)) return
  const stage = getProjectById(projectId as ProjectId)?.getStageById(stageId as StageId)

  return stage
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
