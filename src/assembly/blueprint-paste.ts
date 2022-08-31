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

import { Prototypes } from "../constants"
import { Mutable } from "../lib"
import { L_Interaction } from "../locale"

const enum ModifiedBlueprintTag {
  Value = "isBp100ModifiedBlueprint",
}
export interface MarkerTags extends Tags {
  referencedName: string
  hasCircuitWires: boolean
}

export function modifyBlueprintInStackIfNeeded(stack: BaseItemStack | nil): void {
  const innerStack = getInnerBlueprint(stack)
  if (innerStack && !isModifiedBlueprint(innerStack)) modifyBlueprint(innerStack)
}
function getInnerBlueprint(stack: BaseItemStack | nil): BlueprintItemStack | nil {
  if (!stack || !stack.valid_for_read) return nil
  const type = stack.type
  if (type === "blueprint") return stack as BlueprintItemStack
  if (type === "blueprint-book") {
    const active = (stack as BlueprintBookItemStack).active_index
    if (!active) return nil
    const innerStack = stack.get_inventory(defines.inventory.item_main)
    if (!innerStack) return nil
    return active <= innerStack.length ? getInnerBlueprint(innerStack[active - 1]) : nil
  }
  return nil
}

function isModifiedBlueprint(stack: BlueprintItemStack): boolean {
  if (!stack.is_blueprint_setup()) return true
  const count = stack.get_blueprint_entity_count()
  if (count === 0) return true
  return stack.get_blueprint_entity_tag(count, ModifiedBlueprintTag.Value) !== nil
}

function modifyBlueprint(stack: BlueprintItemStack): void {
  const entities = stack.get_blueprint_entities()
  if (!entities) return
  const numEntities = entities.length
  if (numEntities === 0) return
  let nextIndex = numEntities + 1
  for (const i of $range(1, numEntities)) {
    const entity = entities[i - 1]
    const { direction } = entity
    if (direction && direction % 2 !== 0) continue // ignore diagonal stuff for now
    const { name, position } = entity
    const hasCircuitWires = entity.connections !== nil
    entities[nextIndex - 1] = {
      entity_number: nextIndex,
      name: Prototypes.EntityMarker,
      direction,
      position,
      tags: {
        referencedName: name,
        hasCircuitWires,
      } as MarkerTags,
    }
    nextIndex++
  }
  const lastEntity = entities[entities.length - 1] as Mutable<BlueprintEntity>
  const lastEntityTags = (lastEntity.tags ?? (lastEntity.tags = {})) as MarkerTags
  lastEntityTags[ModifiedBlueprintTag.Value] = true

  stack.set_blueprint_entities(entities)
}

export function validateHeldBlueprint(player: LuaPlayer): void {
  if (!isModifiedBlueprintStack(player.cursor_stack)) {
    player.print([L_Interaction.BlueprintNotHandled])
  }
}
function isModifiedBlueprintStack(stack: LuaItemStack | nil): boolean {
  const innerStack = getInnerBlueprint(stack)
  return innerStack !== nil && isModifiedBlueprint(innerStack)
}
