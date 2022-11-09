/*
 * Copyright (c) 2022 GlassBricks
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

const categories = new LuaMap<string, CategoryName>()
function processCategory(prototype: LuaEntityPrototype) {
  const { fast_replaceable_group, type, collision_box, name } = prototype
  if (fast_replaceable_group == nil) return
  const actualType = typeRemap[type] ?? type
  const { x: lx, y: ly } = collision_box.left_top
  const { x: rx, y: ry } = collision_box.right_bottom
  const categoryName = [actualType, fast_replaceable_group, lx, ly, rx, ry].join("|") as CategoryName

  categories.set(name, categoryName)
}

export const enum PasteRotatableType {
  Rectangular,
  Square,
}
const pasteRotatableTypes = newLuaSet("assembling-machine", "boiler")
const pasteRotationTypes = new LuaMap<string, PasteRotatableType>()

function processPasteRotatableType(prototype: LuaEntityPrototype) {
  const type = prototype.type
  if (!pasteRotatableTypes.has(type)) return
  const collisionBox = prototype.collision_box
  if (BBox.isCenteredSquare(collisionBox)) {
    pasteRotationTypes.set(prototype.name, PasteRotatableType.Square)
  } else if (BBox.isCenteredRectangle(collisionBox)) {
    pasteRotationTypes.set(prototype.name, PasteRotatableType.Rectangular)
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
  log("Finished processing entity prototypes")
}
Events.on_configuration_changed(processPrototypes)
Events.on_init(processPrototypes)

export function getEntityCategory(entityName: string): CategoryName | nil {
  if (!prototypesProcessed) processPrototypes()
  return categories.get(entityName)
}

export function areUpgradeableTypes(a: string, b: string): boolean {
  if (!prototypesProcessed) processPrototypes()
  if (a == b) return true
  const aCategory = categories.get(a)
  if (aCategory == nil) return false
  return aCategory == categories.get(b)
}

export function getSelectionBox(entityName: string): BBoxClass {
  if (!prototypesProcessed) processPrototypes()
  return selectionBoxes.get(entityName) ?? BBox.empty()
}
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
export function getInfinityTypes(): LuaMultiReturn<[chests: ReadonlyLuaSet<string>, pipes: ReadonlyLuaSet<string>]> {
  if (!prototypesProcessed) processPrototypes()
  return $multi(infinityChestNames, infinityPipeNames)
}
export { rollingStockTypes }

export function isPreviewEntity(entity: LuaEntity): boolean {
  return entity.name.startsWith(Prototypes.PreviewEntityPrefix)
}

const nameToTypeAsReadonly: ReadonlyLuaMap<string, string> = nameToType
export { nameToTypeAsReadonly as nameToType }
