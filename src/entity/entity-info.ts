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

import { merge } from "util"
import { Prototypes } from "../constants"
import { Events, PRecord } from "../lib"
import { BBox, BBoxClass } from "../lib/geometry"

const typeRemap: PRecord<string, string> = {
  "logistic-container": "container",
  "rail-chain-signal": "rail-signal",
}
export type CategoryName = string & {
  _categoryName: never
}

const nameToCategory = new LuaMap<string, CategoryName>()
const categories = new LuaMap<CategoryName, string[]>()
function processCategory(prototype: LuaEntityPrototype) {
  const { fast_replaceable_group, type, collision_box, name } = prototype
  if (fast_replaceable_group == nil) return
  const actualType = typeRemap[type] ?? type
  const { x: lx, y: ly } = collision_box.left_top
  const { x: rx, y: ry } = collision_box.right_bottom
  const categoryName = [actualType, fast_replaceable_group, lx, ly, rx, ry].join("|") as CategoryName

  nameToCategory.set(name, categoryName)
  let category = categories.get(categoryName)
  if (category == nil) {
    categories.set(categoryName, (category = []))
  }
  category.push(name)
}

function trimCategories() {
  for (const [categoryName, category] of categories) {
    if (table_size(category) <= 1) {
      categories.delete(categoryName)
      for (const name of category) {
        nameToCategory.delete(name)
      }
    }
  }
}

export const enum PasteRotatableType {
  RectangularOrStraightRail,
  AnyDirection,
}
const pasteRotationTypes = new LuaMap<string, PasteRotatableType>()

const pasteRotatableEntityTypes = newLuaSet("assembling-machine", "boiler", "generator")

function processPasteRotatableType(prototype: LuaEntityPrototype) {
  const type = prototype.type

  if (type == "straight-rail") {
    pasteRotationTypes.set(prototype.name, PasteRotatableType.RectangularOrStraightRail)
    return
  }
  if (!prototype.supports_direction) {
    pasteRotationTypes.set(prototype.name, PasteRotatableType.AnyDirection)
    return
  }

  if (!pasteRotatableEntityTypes.has(type)) return
  const collisionBox = prototype.collision_box
  if (BBox.isCenteredSquare(collisionBox)) {
    pasteRotationTypes.set(prototype.name, PasteRotatableType.AnyDirection)
  } else if (BBox.isCenteredRectangle(collisionBox)) {
    pasteRotationTypes.set(prototype.name, PasteRotatableType.RectangularOrStraightRail)
  }
  // else, none
}

const selectionBoxes = new LuaMap<string, BBoxClass>()

const rollingStockTypes: ReadonlyLuaSet<string> = newLuaSet(
  "artillery-wagon",
  "cargo-wagon",
  "fluid-wagon",
  "locomotive",
)
const checkExactlyForMatchTypes = merge([newLuaSet("straight-rail", "curved-rail"), rollingStockTypes])

const rollingStockNames = new LuaSet<string>()
const infinityChestNames = new LuaSet<string>()
const infinityPipeNames = new LuaSet<string>()

const checkExactlyNames = new LuaSet<string>()

const nameToType = new LuaMap<string, string>()

function processPrototype(name: string, prototype: LuaEntityPrototype): void {
  processCategory(prototype)
  processPasteRotatableType(prototype)
  selectionBoxes.set(name, BBox.from(prototype.selection_box))
  const type = prototype.type
  if (checkExactlyForMatchTypes.has(type)) checkExactlyNames.add(name)
  if (rollingStockTypes.has(type)) rollingStockNames.add(name)
  if (type == "infinity-container") infinityChestNames.add(name)
  if (type == "infinity-pipe") infinityPipeNames.add(name)
  nameToType.set(name, type)
}

let prototypesProcessed = false
function processPrototypes() {
  if (prototypesProcessed) return
  prototypesProcessed = true
  log("Processing blueprint-able entity prototypes")
  for (const [name, prototype] of game.get_filtered_entity_prototypes([{ filter: "blueprintable" }])) {
    processPrototype(name, prototype)
  }
  trimCategories()
  log("Finished processing entity prototypes")
}
Events.on_configuration_changed(processPrototypes)
Events.on_init(processPrototypes)

export function getEntityCategory(entityName: string): CategoryName | nil {
  if (!prototypesProcessed) processPrototypes()
  return nameToCategory.get(entityName)
}

export function areUpgradeableTypes(a: string, b: string): boolean {
  if (!prototypesProcessed) processPrototypes()
  if (a == b) return true
  const aCategory = nameToCategory.get(a)
  if (aCategory == nil) return false
  return aCategory == nameToCategory.get(b)
}

export function getCompatibleNames(entityName: string): readonly string[] | nil {
  if (!prototypesProcessed) processPrototypes()
  const category = nameToCategory.get(entityName)
  if (category == nil) return
  return categories.get(category)
}

export function getSelectionBox(entityName: string): BBoxClass {
  if (!prototypesProcessed) processPrototypes()
  return selectionBoxes.get(entityName) ?? BBox.empty()
}
/** For straight rails, paste rotation only applies to non-diagonal rails. */
export function getPasteRotatableType(entityName: string): PasteRotatableType | nil {
  if (!prototypesProcessed) processPrototypes()
  return pasteRotationTypes.get(entityName)
}
export function shouldCheckEntityExactlyForMatch(entityName: string): boolean {
  if (!prototypesProcessed) processPrototypes()
  return checkExactlyNames.has(entityName)
}
export function isUndergroundBeltType(entityName: string): boolean {
  if (!prototypesProcessed) processPrototypes()
  return nameToType.get(entityName) == "underground-belt"
}
export function isRollingStockType(entityName: string): boolean {
  if (!prototypesProcessed) processPrototypes()
  return rollingStockNames.has(entityName)
}
export function getInfinityEntityNames(): LuaMultiReturn<
  [chests: ReadonlyLuaSet<string>, pipes: ReadonlyLuaSet<string>]
> {
  if (!prototypesProcessed) processPrototypes()
  return $multi(infinityChestNames, infinityPipeNames)
}
export { rollingStockTypes }

export function isPreviewEntity(entity: LuaEntity): boolean {
  return entity.name.startsWith(Prototypes.PreviewEntityPrefix)
}

const nameToTypeAsReadonly: ReadonlyLuaMap<string, string> = nameToType
export { nameToTypeAsReadonly as nameToType }
