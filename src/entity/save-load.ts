// Copyright (c) 2022-2025 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import {
  AssemblingMachineBlueprintEntity,
  BlueprintEntity,
  BlueprintEquipment,
  BlueprintInsertPlan,
  BlueprintInsertPlanWrite,
  BoundingBox,
  CarBlueprintEntity,
  CargoWagonBlueprintEntity,
  CargoWagonSurfaceCreateEntity,
  LoaderBlueprintEntity,
  LuaEntity,
  LuaInventory,
  LuaItemStack,
  LuaSurface,
  MapPosition,
  RailSignalSurfaceCreateEntity,
  UndergroundBeltBlueprintEntity,
  UndergroundBeltSurfaceCreateEntity,
} from "factorio:runtime"
import { Events, getName, getQuality, Mutable, mutableShallowCopy } from "../lib"
import { BBox, Pos, Position } from "../lib/geometry"
import { getStageAtSurface } from "../project/project-refs"

import { Prototypes } from "../constants"
import { Entity, UnstagedEntityProps } from "./Entity"
import {
  addItemRequests,
  getNonModuleRequests,
  partitionInventoryFromRequests,
  partitionModulesAndRemoveGridRequests,
  removeGridRequests,
} from "./item-requests"
import { NameAndQuality, ProjectEntity, UndergroundBeltProjectEntity } from "./ProjectEntity"
import {
  elevatedRailTypes,
  getPrototypeRotationType,
  movableTypes,
  OnPrototypeInfoLoaded,
  PrototypeInfo,
  RotationType,
  tranSignalTypes,
} from "./prototype-info"
import { getUndergroundDirection } from "./underground-belt"
import build_check_manual_ghost = defines.build_check_type.manual_ghost
import floor = math.floor

declare const storage: {
  tempBPInventory: LuaInventory
}
Events.on_init(() => {
  storage.tempBPInventory = game.create_inventory(1)
})

let bpStack: LuaItemStack
Events.on_init(() => {
  bpStack = storage.tempBPInventory[0]
  bpStack.set_stack("blueprint")
})
Events.on_load(() => {
  bpStack = storage.tempBPInventory[0]
})

const { raise_script_built, raise_script_destroy } = script
const pcall = _G.pcall

export function getTempBpItemStack(): LuaItemStack {
  return bpStack
}

function findEntityIndex(mapping: Record<number, LuaEntity>, entity: LuaEntity): number | nil {
  for (const [index, mEntity] of pairs(mapping)) {
    if (entity == mEntity) return index
  }
}

function blueprintEntity(entity: LuaEntity): Mutable<BlueprintEntity> | nil {
  const { surface, position } = entity

  for (const radius of [0.01, 2]) {
    let area = BBox.around(position, radius)
    if (
      elevatedRailTypes.has(entity.type) ||
      (tranSignalTypes.has(entity.type) && entity.rail_layer == defines.rail_layer.elevated)
    ) {
      area = area.translate(Pos(0, -4))
    }
    const indexMapping = bpStack.create_blueprint({
      surface,
      force: entity.force_index,
      area,
      include_station_names: true,
      include_trains: true,
    })
    const matchingIndex = findEntityIndex(indexMapping, entity)
    if (matchingIndex) {
      return bpStack.get_blueprint_entities()![matchingIndex - 1] as Mutable<BlueprintEntity>
    }
  }
}

function setBlueprintEntity(
  stack: LuaItemStack,
  value: Mutable<BlueprintEntity>,
  unstagedValue: UnstagedEntityProps | nil,
  position: Position,
  direction: defines.direction,
): void {
  assume<Mutable<AssemblingMachineBlueprintEntity>>(value)

  const oldItems = value.items
  if (unstagedValue) {
    addItemRequests(value, unstagedValue.items)
  }
  // reuse the same table to avoid several allocations
  value.position = position
  value.direction = direction
  value.entity_number = 1
  const oldRecipe = value.recipe
  value.recipe = nil

  stack.set_blueprint_entities([value])

  value.position = nil!
  value.direction = nil!
  value.entity_number = nil!
  value.recipe = oldRecipe
  value.items = oldItems
}

const buildModeForced = defines.build_mode.forced
let entityVersion = 1

let pasteEntityVersion = 0
function pasteEntity(
  surface: LuaSurface,
  position: MapPosition,
  direction: defines.direction,
  value: BlueprintEntity,
  unstagedValue: UnstagedEntityProps | nil,
  target: LuaEntity | nil,
): LuaEntity | nil {
  const tilePosition = { x: floor(position.x), y: floor(position.y) }

  if (pasteEntityVersion != entityVersion) {
    pasteEntityVersion = entityVersion
    const offsetPosition = Pos.minus(position, tilePosition)
    setBlueprintEntity(bpStack, value, unstagedValue, offsetPosition, direction)
    bpStack.blueprint_snap_to_grid = [1, 1]
    bpStack.blueprint_absolute_snapping = true
  }

  const ghosts = bpStack.build_blueprint({
    surface,
    force: "player",
    position: tilePosition,
    build_mode: buildModeForced,
  })
  if (target?.type == "assembling-machine") {
    assume<AssemblingMachineBlueprintEntity>(value)
    pcall(target.set_recipe as any, value.recipe, value.recipe_quality)
    target.direction = direction
  }
  return ghosts[0]
}

function removeIntersectingEntities(surface: LuaSurface, area: BoundingBox) {
  const items = surface.find_entities_filtered({ type: "item-entity", area })
  for (const entity of items) entity.destroy()
  const treesAndRocks = surface.find_entities_filtered({ type: ["tree", "simple-entity"], area, force: "neutral" })
  for (const entity of treesAndRocks) entity.destroy()
}

const tryCreateEntityParams: Mutable<
  Parameters<LuaSurface["can_place_entity"]>[0] &
    CargoWagonSurfaceCreateEntity &
    UndergroundBeltSurfaceCreateEntity &
    RailSignalSurfaceCreateEntity
> = {
  name: "",
  position: nil!,
  direction: nil!,
  orientation: nil,
  type: nil!,
  force: "player",
  create_build_effect_smoke: false,
  build_check_type: nil,
  forced: true,
}

interface ShouldBeRailSignalBlueprintEntity {
  rail_layer?: "elevated" | "ground"
}

const elevated = defines.rail_layer.elevated
let tryCreateVersion = 0
function tryCreateUnconfiguredEntity(
  surface: LuaSurface,
  position: Position,
  direction: defines.direction,
  entity: BlueprintEntity,
): LuaEntity | nil {
  assume<Mutable<CargoWagonBlueprintEntity & UndergroundBeltBlueprintEntity & ShouldBeRailSignalBlueprintEntity>>(
    entity,
  )
  if (tryCreateVersion != entityVersion) {
    tryCreateVersion = entityVersion
    const orientation = entity.orientation
    if (orientation != nil) direction = nil!
    tryCreateEntityParams.name = entity.name
    tryCreateEntityParams.position = position
    tryCreateEntityParams.direction = direction
    tryCreateEntityParams.orientation = orientation
    tryCreateEntityParams.type = entity.type
    tryCreateEntityParams.quality = entity.quality
    tryCreateEntityParams.rail_layer = entity.rail_layer == "elevated" ? elevated : nil
  }
  tryCreateEntityParams.build_check_type = nil

  const canPlaceEntity = surface.can_place_entity
  if (canPlaceEntity(tryCreateEntityParams)) {
    return surface.create_entity(tryCreateEntityParams)
  }
  // try manual
  tryCreateEntityParams.build_check_type = build_check_manual_ghost
  if (canPlaceEntity(tryCreateEntityParams)) {
    const createdEntity = surface.create_entity(tryCreateEntityParams)
    if (!createdEntity) return
    removeIntersectingEntities(surface, createdEntity.bounding_box)
    if (createdEntity.secondary_bounding_box) removeIntersectingEntities(surface, createdEntity.secondary_bounding_box)
    return createdEntity
  }
}

let nameToType: PrototypeInfo["nameToType"]
let requiresRebuild: PrototypeInfo["requiresRebuild"]
OnPrototypeInfoLoaded.addListener((info) => {
  nameToType = info.nameToType
  requiresRebuild = info.requiresRebuild
})
/**
 * If changed is false, the code assumes that the last time this was called [entity] is the same.
 * This is a performance optimization to use with care.
 */
export function createEntity(
  surface: LuaSurface,
  position: MapPosition,
  direction: defines.direction,
  value: Entity,
  unstagedValue: UnstagedEntityProps | nil,
  changed: boolean = true,
): LuaEntity | nil {
  assume<BlueprintEntity>(value)
  if (changed) entityVersion++
  let luaEntity: LuaEntity | undefined
  const isMovable = movableTypes.has(nameToType.get(value.name) ?? ("" as never))
  if (isMovable) {
    const ghost = pasteEntity(surface, position, direction, value, unstagedValue, nil)
    if (!ghost) return nil
    const [, newLuaEntity] = ghost.silent_revive()
    luaEntity = newLuaEntity
  } else {
    luaEntity = tryCreateUnconfiguredEntity(surface, position, direction, value)
  }
  if (!luaEntity) return nil

  const type = nameToType.get(value.name)!

  if (type == "loader" || type == "loader-1x1") {
    assume<LoaderBlueprintEntity>(value)
    luaEntity.loader_type = value.type ?? "output"
    luaEntity.direction = direction
  }
  if ((!isMovable && entityHasSettings(value)) || unstagedValue != nil) {
    const ghost = pasteEntity(surface, position, direction, value, unstagedValue, luaEntity)
    ghost?.destroy()
  }
  if (value.items) {
    setModules(luaEntity, value.items)
  }
  if (isMovable) {
    assume<CarBlueprintEntity>(value)
    insertEquipment(luaEntity, value.grid)
  }
  raise_script_built({ entity: luaEntity })
  if (luaEntity.valid) return luaEntity
}

function entityHasSettings(entity: BlueprintEntity): boolean {
  assume<UndergroundBeltBlueprintEntity>(entity)
  for (const [key] of pairs(entity)) {
    if (key != "name" && key != "items" && key != "type") return true
  }
  return false
}

const upgradeEntityParams: Mutable<CargoWagonSurfaceCreateEntity & UndergroundBeltSurfaceCreateEntity> = {
  name: "",
  position: nil!,
  direction: nil,
  force: "player",
  fast_replace: true,
  spill: false,
  create_build_effect_smoke: false,
  type: nil,
}
let upgradeEntityVersion = 0
function upgradeEntity(oldEntity: LuaEntity, value: NameAndQuality): LuaEntity {
  if (upgradeEntityVersion != entityVersion) {
    upgradeEntityVersion = entityVersion
    upgradeEntityParams.name = value.name
    upgradeEntityParams.quality = value.quality
    upgradeEntityParams.position = oldEntity.position
    upgradeEntityParams.direction = oldEntity.direction
    upgradeEntityParams.type = oldEntity.type == "underground-belt" ? oldEntity.belt_to_ground_type : nil
  }
  oldEntity.minable = true
  const newEntity = oldEntity.surface.create_entity(upgradeEntityParams)
  if (!newEntity) return oldEntity
  if (oldEntity.valid) oldEntity.destroy()
  return newEntity
}

function setModules(luaEntity: LuaEntity, moduleItems: BlueprintInsertPlanWrite[] | nil): void {
  const inventory = luaEntity.get_module_inventory()
  if (!inventory) return
  inventory.clear()
  if (!moduleItems) return
  const moduleInvIndex = inventory.index!
  for (const { id, items } of moduleItems) {
    if (items.in_inventory) {
      for (const inv of items.in_inventory) {
        if (inv.inventory == moduleInvIndex) {
          inventory[inv.stack].set_stack({
            name: getName(id.name),
            quality: getName(id.quality),
            count: inv.count,
          })
        }
      }
    }
  }
  const itemRequestProxy = luaEntity.item_request_proxy
  if (itemRequestProxy) {
    const [, nonModules] = partitionInventoryFromRequests(itemRequestProxy.insert_plan, moduleInvIndex)
    if (nonModules == nil) {
      itemRequestProxy.destroy()
    } else {
      itemRequestProxy.insert_plan = nonModules
    }
  }
}

function removeItemsMatchingItemRequests(luaEntity: LuaEntity, requests: BlueprintInsertPlan[]) {
  for (const {
    id: { name, quality },
    items: { in_inventory },
  } of requests) {
    const actualQuality = quality ?? "normal"
    if (!in_inventory) return
    for (const { inventory, stack, count } of in_inventory) {
      const luaInventory = luaEntity.get_inventory(inventory)
      if (!luaInventory) continue
      if (stack >= luaInventory.length) continue
      const luaStack = luaInventory[stack]
      if (!luaStack.valid_for_read) continue
      const actualCount = count ?? 1
      if (
        luaStack.count == actualCount &&
        luaStack.name == (name as unknown as string) &&
        luaStack.quality.name == actualQuality
      ) {
        luaStack.clear()
      }
    }
  }
}

export function checkUndergroundPairFlippable(
  luaEntity: LuaEntity | nil,
): LuaMultiReturn<[neighbor: UndergroundBeltProjectEntity | nil, neighborIsFlippable: boolean]> {
  if (!luaEntity) return $multi(nil, true)
  const stage = getStageAtSurface(luaEntity.surface_index)
  if (!stage) return $multi(nil, true)
  const content = stage.project.content
  const existing = content.findCompatibleWithLuaEntity(luaEntity, nil, stage.stageNumber)
  if (!existing) return $multi(nil, true)
  assume<UndergroundBeltProjectEntity>(existing)
  return $multi(existing, existing.firstValue.type != luaEntity.belt_to_ground_type)
}
function updateUndergroundRotation(
  luaEntity: LuaEntity,
  value: UndergroundBeltBlueprintEntity,
  direction: defines.direction,
): LuaMultiReturn<[updated: LuaEntity | nil, updatedNeighbors?: ProjectEntity]> {
  if (
    getUndergroundDirection(direction, value.type) !=
    getUndergroundDirection(luaEntity.direction, luaEntity.belt_to_ground_type)
  ) {
    const surface = luaEntity.surface
    const position = luaEntity.position
    luaEntity.destroy()
    return $multi(createEntity(surface, position, direction, value, nil, false))
  }
  const mode = value.type ?? "input"
  if (luaEntity.belt_to_ground_type != mode) {
    const neighbor = luaEntity.neighbours as LuaEntity | nil
    const [neighborProjEntity, flippable] = checkUndergroundPairFlippable(neighbor)
    if (!flippable) {
      return $multi(luaEntity)
    }
    const rotated = forceFlipUnderground(luaEntity)
    return $multi(luaEntity, rotated ? neighborProjEntity : nil)
  }
  return $multi(luaEntity)
}
export function forceFlipUnderground(luaEntity: LuaEntity): boolean {
  const wasRotatable = luaEntity.rotatable
  luaEntity.rotatable = true
  const rotated = luaEntity.rotate()
  luaEntity.rotatable = wasRotatable
  return rotated
}

function removeExtraProperties(entity: Mutable<BlueprintEntity>): Mutable<EntityResult> {
  entity.entity_number = nil!
  entity.position = nil!
  entity.direction = nil
  entity.wires = nil
  entity.tags = nil
  if (entity.quality == "normal") entity.quality = nil
  if (!entity.items) return $multi(entity)

  const [moduleRequests, nonModules] = partitionModulesAndRemoveGridRequests(entity.items, entity.name)
  entity.items = moduleRequests
  const unstagedProps = nonModules && {
    items: nonModules,
  }
  return $multi(entity, unstagedProps)
}

export type EntityResult = LuaMultiReturn<[entity: Mutable<Entity>, unstagedEntityProps?: Mutable<UnstagedEntityProps>]>
export type NullableEntityResult = LuaMultiReturn<
  [entity?: Mutable<Entity>, unstagedEntityProps?: Mutable<UnstagedEntityProps>]
>

export function copyKnownValue(value: BlueprintEntity): EntityResult {
  return removeExtraProperties(mutableShallowCopy(value))
}

/**
 * Position and direction are ignored.
 */
export function saveEntity(entity: LuaEntity, knownValue?: BlueprintEntity): NullableEntityResult {
  if (knownValue) return copyKnownValue(knownValue)
  const bpEntity = blueprintEntity(entity)
  if (!bpEntity) return $multi()
  if (bpEntity.items) {
    bpEntity.items = removeGridRequests(bpEntity.items)
  }

  const itemRequests = getNonModuleRequests(entity)
  const unstagedProps = itemRequests && {
    items: itemRequests,
  }
  const [result] = removeExtraProperties(mutableShallowCopy(bpEntity))
  // ignore non-module requests gotten via blueprint; use item request proxy for those instead
  return $multi(result, unstagedProps)
}

function insertEquipment(entity: LuaEntity, grid: BlueprintEquipment[] | undefined) {
  if (!grid) return
  const luaGrid = entity.grid
  if (!luaGrid) return
  for (const gridItem of grid) {
    const equipment = gridItem.equipment as never as string | { name: string; quality?: string }
    luaGrid.put({
      name: getName(equipment),
      quality: getQuality(equipment),
      position: gridItem.position,
    })
  }
}

export function updateEntity(
  luaEntity: LuaEntity,
  value: Entity,
  unstagedValue: UnstagedEntityProps | nil,
  direction: defines.direction,
  changed: boolean = true,
): LuaMultiReturn<[updated: LuaEntity | nil, updatedNeighbors?: ProjectEntity]> {
  assume<BlueprintEntity>(value)
  const type = luaEntity.type
  if (movableTypes.has(type)) {
    assume<CarBlueprintEntity>(value)
    insertEquipment(luaEntity, value.grid)
    return $multi(luaEntity)
  }
  if (requiresRebuild.has(value.name)) {
    const surface = luaEntity.surface
    const position = luaEntity.position
    raise_script_destroy({ entity: luaEntity })
    luaEntity.destroy()
    const entity = createEntity(surface, position, direction, value, unstagedValue, changed)
    return $multi(entity)
  }

  if (changed) entityVersion++

  if (luaEntity.name != value.name || luaEntity.quality.name != (value.quality ?? "normal")) {
    luaEntity = upgradeEntity(luaEntity, value)
  }

  if (type == "underground-belt") {
    assume<UndergroundBeltBlueprintEntity>(value)
    return updateUndergroundRotation(luaEntity, value, direction)
  } else if (type == "loader" || type == "loader-1x1") {
    assume<LoaderBlueprintEntity>(value)
    luaEntity.loader_type = value.type ?? "output"
  }
  luaEntity.direction = direction
  if (luaEntity.mirroring || value.mirror) {
    luaEntity.mirroring = value.mirror ?? false
  }

  const ghost = pasteEntity(luaEntity.surface, luaEntity.position, direction, value, unstagedValue, luaEntity)
  if (ghost) ghost.destroy() // should not happen?
  setModules(luaEntity, value.items)
  const hasOtherItemRequests = unstagedValue?.items?.[0]
  if (!hasOtherItemRequests) {
    luaEntity.item_request_proxy?.destroy()
  } else {
    removeItemsMatchingItemRequests(luaEntity, unstagedValue.items)
  }

  return $multi(luaEntity)
}

function makePreviewIndestructible(entity: LuaEntity | nil): void {
  if (!entity) return
  entity.destructible = false
  entity.minable = false
  entity.rotatable = false
  if (entity.type == "rail-remnants") {
    entity.corpse_expires = false
    entity.corpse_immune_to_entity_placement = true
  }
}
export function createPreviewEntity(
  surface: LuaSurface,
  position: Position,
  apparentDirection: defines.direction,
  previewName: string,
): LuaEntity | nil {
  if (!prototypes.entity[previewName]) {
    game.print(
      `Preview entity not found for ${previewName.substring(Prototypes.PreviewEntityPrefix.length)}! Please report this to the mod author.`,
    )
    return nil
  }
  const entity = surface.create_entity({
    name: previewName,
    position,
    direction: apparentDirection,
    force: "player",
  })
  makePreviewIndestructible(entity)
  return entity
}

// noinspection JSUnusedGlobalSymbols
export const _mockable = true

/** Currently only true if is a square assembling machine with no fluid inputs. */
export function canBeAnyDirection(luaEntity: LuaEntity): boolean {
  return (
    luaEntity.type == "assembling-machine" &&
    getPrototypeRotationType(luaEntity.name) == RotationType.AnyDirection &&
    luaEntity.fluidbox.length == 0
  )
}
