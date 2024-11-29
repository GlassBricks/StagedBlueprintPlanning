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

import { EntityType, PrototypeMap } from "factorio:prototype"
import { LuaEntity, LuaEntityPrototype } from "factorio:runtime"
import { list_to_map, merge } from "util"
import { Prototypes } from "../constants"
import { Events, globalEvent, PRecord } from "../lib"
import { BBox } from "../lib/geometry"

export type CategoryName = string & {
  _categoryName: never
}
export interface PrototypeInfo {
  nameToCategory: ReadonlyLuaMap<string, CategoryName>
  categories: ReadonlyLuaMap<CategoryName, string[]>
  rotationTypes: ReadonlyLuaMap<string, RotationType>
  selectionBoxes: ReadonlyLuaMap<string, BBox>

  nameToType: ReadonlyLuaMap<string, EntityType>

  twoDirectionTanks: ReadonlyLuaSet<string>
  blueprintableTiles: ReadonlyLuaSet<string>

  /** Entities that require rebuilding when updating; mainly for some modded entities. */
  requiresRebuild: ReadonlyLuaSet<string>
  mayHaveModdedGui: ReadonlyLuaSet<string>
  excludedNames: ReadonlyLuaSet<string>
}
/**
 * Compatible rotations for pasting entities.
 *
 * Default: all rotations are different
 */
export const enum RotationType {
  /** 180 deg rotation is equivalent */
  Flippable,
  /** All directions are equivalent */
  AnyDirection,
}

declare const storage: {
  // has "entity" in name for legacy reasons
  entityPrototypeInfo: PrototypeInfo
}

let prototypeInfo: PrototypeInfo
export const OnPrototypeInfoLoaded = globalEvent<[info: PrototypeInfo]>()
Events.on_configuration_changed(() => {
  prototypeInfo = storage.entityPrototypeInfo = computeEntityPrototypeInfo()
  OnPrototypeInfoLoaded.raise(prototypeInfo)
})
Events.on_init(() => {
  prototypeInfo = storage.entityPrototypeInfo = computeEntityPrototypeInfo()
  OnPrototypeInfoLoaded.raise(prototypeInfo)
})
Events.on_load(() => {
  prototypeInfo = storage.entityPrototypeInfo
  if (prototypeInfo != nil) {
    OnPrototypeInfoLoaded.raise(prototypeInfo)
  }
})

interface PassedPrototypeInfo {
  twoDirectionOnlyTanks: string[]
}

function getPassedPrototypeInfo(): PassedPrototypeInfo {
  const selectionTool = prototypes.item[Prototypes.PassedPrototypeInfo]
  const filters = selectionTool.get_entity_filters(defines.selection_mode.select)!
  return {
    twoDirectionOnlyTanks: filters.map((filter) => filter.name),
  }
}

function computeEntityPrototypeInfo(): PrototypeInfo {
  log("Processing blueprint-able entity prototypes")
  const compatibleTypes: PRecord<keyof PrototypeMap, keyof PrototypeMap> = {
    "logistic-container": "container",
    "infinity-container": "container",
    "rail-chain-signal": "rail-signal",
    "storage-tank": "pipe",
    "infinity-pipe": "pipe",
  }
  const ignoreFastReplaceGroup = newLuaSet("transport-belt", "underground-belt", "splitter")

  function getCategory(prototype: LuaEntityPrototype): CategoryName | nil {
    if (prototype.name.startsWith("ee-infinity-accumulator")) {
      return "ee-infinity-accumulator" as CategoryName
    }
    const { fast_replaceable_group, type, collision_box } = prototype
    assume<keyof PrototypeMap>(type)
    const actualFastReplaceGroup = ignoreFastReplaceGroup.has(type) ? "" : fast_replaceable_group
    if (actualFastReplaceGroup == nil) return
    const actualType = compatibleTypes[type] ?? type
    const { x: lx, y: ly } = collision_box.left_top
    const { x: rx, y: ry } = collision_box.right_bottom
    return [actualType, actualFastReplaceGroup, lx, ly, rx, ry].join("|") as CategoryName
  }

  function requiresRebuild(prototype: LuaEntityPrototype): boolean {
    return prototype.name.startsWith("ee-infinity")
  }

  const pasteRotatableEntityTypes = newLuaSet("assembling-machine", "boiler", "generator")
  function getRotationType(prototype: LuaEntityPrototype): RotationType | nil {
    if (!prototype.supports_direction || prototype.has_flag("not-rotatable")) {
      return RotationType.AnyDirection
    }

    const type = prototype.type
    // hardcoded shenanigans
    if (type == "straight-rail") {
      return RotationType.Flippable
    }

    if (pasteRotatableEntityTypes.has(type)) {
      const collisionBox = prototype.collision_box
      if (BBox.isCenteredSquare(collisionBox)) {
        return RotationType.AnyDirection
      }
      if (BBox.isCenteredRectangle(collisionBox)) {
        return RotationType.Flippable
      }
    }
  }

  const nameToType = new LuaMap<string, EntityType>()
  const nameToCategory = new LuaMap<string, CategoryName>()
  const categories = new LuaMap<CategoryName, string[]>()
  const rotationTypes = new LuaMap<string, RotationType>()
  const selectionBoxes = new LuaMap<string, BBox>()
  const requiresRebuildNames = new LuaSet<string>()

  for (const [name, prototype] of prototypes.get_entity_filtered([{ filter: "blueprintable" }])) {
    const categoryName = getCategory(prototype)
    if (categoryName != nil) {
      nameToCategory.set(name, categoryName)
      let category = categories.get(categoryName)
      if (category == nil) categories.set(categoryName, (category = []))
      category.push(name)
    }

    if (requiresRebuild(prototype)) {
      requiresRebuildNames.add(name)
    }

    const pasteRotationType = getRotationType(prototype)
    if (pasteRotationType != nil) rotationTypes.set(name, pasteRotationType)

    selectionBoxes.set(name, BBox.from(prototype.selection_box))

    nameToType.set(name, prototype.type as EntityType)
  }

  for (const [categoryName, category] of categories) {
    if (table_size(category) <= 1) {
      categories.delete(categoryName)
      for (const name of category) nameToCategory.delete(name)
    }
  }
  const blueprintableTilePrototypes = prototypes.get_tile_filtered([{ filter: "blueprintable" }])
  const blueprintableTiles = new LuaSet<string>()
  for (const [name] of blueprintableTilePrototypes) {
    blueprintableTiles.add(name)
  }

  return {
    nameToCategory,
    categories,
    rotationTypes,
    selectionBoxes,
    nameToType,
    requiresRebuild: requiresRebuildNames,
    mayHaveModdedGui: requiresRebuildNames,
    excludedNames: newLuaSet("ee-linked-belt", "ee-infinity-cargo-wagon", "ee-infinity-fluid-wagon"),
    twoDirectionTanks: list_to_map(getPassedPrototypeInfo().twoDirectionOnlyTanks),
    blueprintableTiles,
  }
}
const rollingStockTypes: ReadonlyLuaSet<string> = newLuaSet(
  "artillery-wagon",
  "cargo-wagon",
  "fluid-wagon",
  "locomotive",
)

export const allowOverlapDifferentDirection = merge([newLuaSet("straight-rail", "curved-rail"), rollingStockTypes])

export function getPrototypeInfo(): PrototypeInfo {
  return prototypeInfo
}

let nameToCategory: PrototypeInfo["nameToCategory"]
let nameToType: PrototypeInfo["nameToType"]
let categories: PrototypeInfo["categories"]
let rotationTypes: PrototypeInfo["rotationTypes"]
OnPrototypeInfoLoaded.addListener((info) => {
  ;({ nameToCategory, categories, rotationTypes, nameToType } = info)
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
export function getPrototypeRotationType(entityName: string): RotationType | nil {
  return rotationTypes.get(entityName)
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
