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

import { PRecord } from "../lib"
import { BBox, BBoxClass } from "../lib/geometry"

let theEntityPrototypes: typeof game.entity_prototypes

function getEntityPrototypes(): typeof game.entity_prototypes {
  if (theEntityPrototypes !== nil) return theEntityPrototypes
  return (theEntityPrototypes = game.entity_prototypes)
}

// <type>|<fast_replaceable_group>|<lx>|<ly>|<rx>|<ry> or <none>|<entity_name>
export type CategoryName = `${string}|${string}|${number}|${number}|${number}|${number}` | `<${string}>|${string}`

export const enum PasteRotatableType {
  None = 0,
  Rectangular = 1,
  Square = 2,
}
export interface EntityInfo {
  categoryName: CategoryName
  pasteRotatableType: PasteRotatableType
  selectionBox: BBoxClass
  type: string
  overlapsWithSelf: boolean
}

const typeRemap: PRecord<string, string> = {
  "logistic-container": "container",
  "rail-chain-signal": "rail-signal",
}

function computeCategoryName(prototype: LuaEntityPrototype | nil): CategoryName {
  if (!prototype) return `<unknown>|${prototype}`
  const { fast_replaceable_group, type, collision_box } = prototype
  if (fast_replaceable_group === nil) return `<none>|${prototype.name}`
  const actualType = typeRemap[type] ?? type
  const { x: lx, y: ly } = collision_box.left_top
  const { x: rx, y: ry } = collision_box.right_bottom
  return [actualType, fast_replaceable_group, lx, ly, rx, ry].join("|") as CategoryName
}

const pasteRotatableTypes = newLuaSet("assembling-machine", "boiler")
const overlapWithSelfTypes = newLuaSet("straight-rail", "curved-rail")

function computeEntityInfo(entityName: string): EntityInfo {
  const prototype = getEntityPrototypes()[entityName]
  if (!prototype)
    return {
      categoryName: `<unknown>|${entityName}`,
      pasteRotatableType: PasteRotatableType.None,
      selectionBox: BBox.coords(0, 0, 0, 0),
      type: "",
      overlapsWithSelf: false,
    }
  const categoryName = computeCategoryName(prototype)
  const selectionBox = BBox.from(prototype.selection_box)
  let pasteRotatableType = PasteRotatableType.None
  if (pasteRotatableTypes.has(prototype.type)) {
    const collisionBox = prototype.collision_box
    if (BBox.isCenteredSquare(collisionBox)) {
      pasteRotatableType = PasteRotatableType.Square
    } else if (BBox.isCenteredRectangle(collisionBox)) {
      pasteRotatableType = PasteRotatableType.Rectangular
    }
  }

  return {
    type: prototype.type,
    categoryName,
    selectionBox,
    pasteRotatableType,
    overlapsWithSelf: overlapWithSelfTypes.has(prototype.type),
  }
}

const entityInfoCache: PRecord<string, EntityInfo> = {}

function getEntityInfo(entityName: string): EntityInfo {
  const existing = entityInfoCache[entityName]
  if (existing !== nil) return existing
  return (entityInfoCache[entityName] = computeEntityInfo(entityName))
}
export { getEntityInfo }

export function getEntityCategory(entityName: string): CategoryName {
  return getEntityInfo(entityName).categoryName
}
export function getSelectionBox(entityName: string): BBoxClass {
  return getEntityInfo(entityName).selectionBox
}
export function getPastRotatableType(entityName: string): PasteRotatableType {
  return getEntityInfo(entityName).pasteRotatableType
}
export function isUndergroundBeltType(entityName: string): boolean {
  return getEntityInfo(entityName).type === "underground-belt"
}
export function overlapsWithSelf(entityName: string): boolean {
  return getEntityInfo(entityName).overlapsWithSelf
}
