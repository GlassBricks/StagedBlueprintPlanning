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

import { PRecord } from "../lib"
import { BBox, BBoxClass } from "../lib/geometry"

// <type>|<fast_replaceable_group>|<lx>|<ly>|<rx>|<ry> or <none>|<entity_name>
export type CategoryName = `${string}|${string}|${number}|${number}|${number}|${number}` | `<${string}>|${string}`

const typeRemap: PRecord<string, string> = { "logistic-container": "container" }
function computeCategoryName(entityName: string): CategoryName {
  const prototype = game.entity_prototypes[entityName]
  if (!prototype) return `<unknown>|${entityName}`
  const { fast_replaceable_group, type, collision_box } = prototype
  if (fast_replaceable_group === nil) return `<none>|${entityName}`
  const actualType = typeRemap[type] ?? type
  const { x: lx, y: ly } = collision_box.left_top
  const { x: rx, y: ry } = collision_box.right_bottom
  return [actualType, fast_replaceable_group, lx, ly, rx, ry].join("|") as CategoryName
}

const categoryNames: PRecord<string, CategoryName> = {}
export function getEntityCategory(entityName: string): CategoryName {
  const categoryName = categoryNames[entityName]
  if (categoryName) return categoryName
  return (categoryNames[entityName] = computeCategoryName(entityName))
}

const selectionBoxes: PRecord<string, BBoxClass> = {}
export function getSelectionBox(entityName: string): BBoxClass {
  const selectionBox = selectionBoxes[entityName]
  if (selectionBox) return selectionBox
  const prototype = game.entity_prototypes[entityName]
  return (selectionBoxes[entityName] = BBox.load(prototype.selection_box))
}

export function _overrideEntityCategory(entityName: string, categoryName: string): void {
  categoryNames[entityName] = categoryName as CategoryName
}
