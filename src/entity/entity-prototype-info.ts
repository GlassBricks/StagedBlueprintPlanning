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

import { LuaEntity, LuaEntityPrototype } from "factorio:runtime"
import { merge } from "util"
import { Prototypes } from "../constants"
import { Events, globalEvent, PRecord } from "../lib"
import { BBox } from "../lib/geometry"

export type CategoryName = string & {
  _categoryName: never
}
export interface EntityPrototypeInfo {
  nameToCategory: ReadonlyLuaMap<string, CategoryName>
  categories: ReadonlyLuaMap<CategoryName, string[]>
  pasteCompatibleRotations: ReadonlyLuaMap<string, PasteCompatibleRotationType>
  selectionBoxes: ReadonlyLuaMap<string, BBox>
  nameToType: ReadonlyLuaMap<string, string>
}
/**
 * Compatible rotations for pasting entities.
 *
 * Default: all rotations are different
 */
export const enum PasteCompatibleRotationType {
  /** 180 deg rotation is equivalent */
  Flippable,
  /** All directions are equivalent */
  AnyDirection,
}

declare const global: {
  entityPrototypeInfo: EntityPrototypeInfo
}

let entityPrototypeInfo: EntityPrototypeInfo
export const OnEntityPrototypesLoaded = globalEvent<[info: EntityPrototypeInfo]>()
Events.on_configuration_changed(() => {
  entityPrototypeInfo = global.entityPrototypeInfo = computeEntityPrototypeInfo()
  OnEntityPrototypesLoaded.raise(entityPrototypeInfo)
})
Events.on_init(() => {
  entityPrototypeInfo = global.entityPrototypeInfo = computeEntityPrototypeInfo()
  OnEntityPrototypesLoaded.raise(entityPrototypeInfo)
})
Events.on_load(() => {
  entityPrototypeInfo = global.entityPrototypeInfo
  if (entityPrototypeInfo != nil) {
    OnEntityPrototypesLoaded.raise(entityPrototypeInfo)
  }
})

function computeEntityPrototypeInfo(): EntityPrototypeInfo {
  log("Processing blueprint-able entity prototypes")
  const compatibleTypes: PRecord<string, string> = {
    "logistic-container": "container",
    "rail-chain-signal": "rail-signal",
  }

  const nameToCategory = new LuaMap<string, CategoryName>()
  const categories = new LuaMap<CategoryName, string[]>()
  const pasteRotationTypes = new LuaMap<string, PasteCompatibleRotationType>()
  const selectionBoxes = new LuaMap<string, BBox>()

  const pasteRotatableEntityTypes = newLuaSet("assembling-machine", "boiler", "generator")

  function getCategory(prototype: LuaEntityPrototype): CategoryName | nil {
    const { fast_replaceable_group, type, collision_box } = prototype
    if (fast_replaceable_group == nil) return
    const actualType = compatibleTypes[type] ?? type
    const { x: lx, y: ly } = collision_box.left_top
    const { x: rx, y: ry } = collision_box.right_bottom
    return [actualType, fast_replaceable_group, lx, ly, rx, ry].join("|") as CategoryName
  }

  function getPasteCompatibleRotation(prototype: LuaEntityPrototype): PasteCompatibleRotationType | nil {
    const type = prototype.type
    if (!prototype.supports_direction || prototype.has_flag("not-rotatable")) {
      return PasteCompatibleRotationType.AnyDirection
    }

    // hardcoded shenanigans
    if (type == "straight-rail") {
      return PasteCompatibleRotationType.Flippable
    }

    if (pasteRotatableEntityTypes.has(type)) {
      const collisionBox = prototype.collision_box
      if (BBox.isCenteredSquare(collisionBox)) {
        return PasteCompatibleRotationType.AnyDirection
      }
      if (BBox.isCenteredRectangle(collisionBox)) {
        return PasteCompatibleRotationType.Flippable
      }
    }
  }

  const nameToType = new LuaMap<string, string>()

  for (const [name, prototype] of game.get_filtered_entity_prototypes([{ filter: "blueprintable" }])) {
    const categoryName = getCategory(prototype)
    if (categoryName != nil) {
      nameToCategory.set(name, categoryName)
      let category = categories.get(categoryName)
      if (category == nil) categories.set(categoryName, (category = []))
      category.push(name)
    }

    const pasteRotationType = getPasteCompatibleRotation(prototype)
    if (pasteRotationType != nil) pasteRotationTypes.set(name, pasteRotationType)

    selectionBoxes.set(name, BBox.from(prototype.selection_box))

    nameToType.set(name, prototype.type)
  }

  for (const [categoryName, category] of categories) {
    if (table_size(category) <= 1) {
      categories.delete(categoryName)
      for (const name of category) nameToCategory.delete(name)
    }
  }

  return {
    nameToCategory,
    categories,
    pasteCompatibleRotations: pasteRotationTypes,
    selectionBoxes,
    nameToType,
  }
}
const rollingStockTypes: ReadonlyLuaSet<string> = newLuaSet(
  "artillery-wagon",
  "cargo-wagon",
  "fluid-wagon",
  "locomotive",
)

export const allowOverlapDifferentDirection = merge([newLuaSet("straight-rail", "curved-rail"), rollingStockTypes])

export function getEntityPrototypeInfo(): EntityPrototypeInfo {
  return entityPrototypeInfo
}

let nameToCategory: EntityPrototypeInfo["nameToCategory"]
let nameToType: EntityPrototypeInfo["nameToType"]
let categories: EntityPrototypeInfo["categories"]
let pasteCompatibleRotations: EntityPrototypeInfo["pasteCompatibleRotations"]
OnEntityPrototypesLoaded.addListener((info) => {
  ;({ nameToCategory, categories, pasteCompatibleRotations, nameToType } = info)
})

export function areUpgradeableTypes(a: string, b: string): boolean {
  if (a == b) return true
  const aCategory = nameToCategory.get(a)
  if (aCategory == nil) return false
  return aCategory == nameToCategory.get(b)
}

export function getCompatibleNames(entityName: string): readonly string[] | nil {
  const category = nameToCategory.get(entityName)
  if (category == nil) return
  return categories.get(category)
}

/** For straight rails, paste rotation only applies to non-diagonal rails. */
export function getPasteRotatableType(entityName: string): PasteCompatibleRotationType | nil {
  return pasteCompatibleRotations.get(entityName)
}
export function isRollingStockType(entityName: string): boolean {
  const type = nameToType.get(entityName)
  return type != nil && rollingStockTypes.has(type)
}
export { rollingStockTypes }

export function isPreviewEntity(entity: LuaEntity): boolean {
  // performance: this returns false almost all the time,
  // so we do a cheap check on the type before the expensive check on name
  const type = entity.type
  return (
    (type == "simple-entity-with-owner" || type == "rail-remnants") &&
    entity.name.startsWith(Prototypes.PreviewEntityPrefix)
  )
}
