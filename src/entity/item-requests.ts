// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { EntityType } from "factorio:prototype"
import { BlueprintEntity, BlueprintInsertPlan, InventoryPosition, LuaEntity } from "factorio:runtime"
import { deepCopy, getName, Mutable, nullableConcat, PRecord } from "../lib"
import { OnPrototypeInfoLoaded, PrototypeInfo } from "./prototype-info"

let nameToType: PrototypeInfo["nameToType"]
OnPrototypeInfoLoaded.addListener((info) => {
  nameToType = info.nameToType
})

export function partitionInventoryFromRequest(
  request: BlueprintInsertPlan,
  inventory: defines.inventory,
): LuaMultiReturn<[withInv: BlueprintInsertPlan | nil, withoutInv: BlueprintInsertPlan | nil]> {
  const { in_inventory } = request.items
  if (!in_inventory) {
    return $multi(nil, nil)
  }

  const withInv = in_inventory.filter((i) => i.inventory == inventory)
  const withoutInv = in_inventory.filter((i) => i.inventory != inventory)

  const withInvResult: BlueprintInsertPlan | nil =
    withInv[0] != nil
      ? {
          id: request.id,
          items: {
            in_inventory: withInv[0] && withInv,
          },
        }
      : nil

  const withoutInvResult: BlueprintInsertPlan | nil =
    withoutInv[0] != nil
      ? {
          id: request.id,
          items: {
            in_inventory: withoutInv,
          },
        }
      : nil

  return $multi(withInvResult, withoutInvResult)
}

export function partitionInventoryFromRequests(
  plans: BlueprintInsertPlan[],
  inventory: defines.inventory,
): LuaMultiReturn<[withInv: BlueprintInsertPlan[] | nil, withoutInv: BlueprintInsertPlan[] | nil]> {
  const withInv: BlueprintInsertPlan[] = []
  const withoutInv: BlueprintInsertPlan[] = []
  for (const plan of plans) {
    const [withInvPlan, withoutInvPlan] = partitionInventoryFromRequest(plan, inventory)
    if (withInvPlan) {
      withInv.push(withInvPlan)
    }
    if (withoutInvPlan) {
      withoutInv.push(withoutInvPlan)
    }
  }

  return $multi(withInv[0] && withInv, withoutInv[0] && withoutInv)
}
interface MutableBlueprintInsertPlan extends BlueprintInsertPlan {
  items: {
    grid_count?: number
    in_inventory?: Mutable<InventoryPosition>[]
  }
}

export function mergeItemRequests(plans: readonly BlueprintInsertPlan[]): BlueprintInsertPlan[] {
  const result: BlueprintInsertPlan[] = []
  const idToIndex = new LuaMap<string, number>()
  const isOwned = new LuaSet<BlueprintInsertPlan>()

  function getIdKey(id: BlueprintInsertPlan["id"]): string {
    const name = getName(id.name)
    const quality = getName(id.quality)
    return `${name}:${quality ?? "normal"}`
  }

  function asMutable(src: BlueprintInsertPlan, index: number): MutableBlueprintInsertPlan {
    if (isOwned.has(src)) {
      return src
    }
    const plan = deepCopy(src)
    isOwned.add(plan)
    result[index] = plan
    return plan
  }

  function addPlan(plan: BlueprintInsertPlan): void {
    const idKey = getIdKey(plan.id)
    const existingIndex = idToIndex.get(idKey)

    if (existingIndex != nil) {
      const existing = result[existingIndex]
      const existingInInventory = existing.items.in_inventory
      const newInInventory = plan.items.in_inventory

      if (existingInInventory && newInInventory) {
        asMutable(existing, existingIndex).items.in_inventory!.push(...newInInventory)
      } else if (newInInventory) {
        asMutable(existing, existingIndex).items.in_inventory = newInInventory
      }

      if (plan.items.grid_count != nil) {
        asMutable(existing, existingIndex).items.grid_count = (existing.items.grid_count ?? 0) + plan.items.grid_count
      }
    } else {
      idToIndex.set(idKey, result.length)
      result.push(plan)
    }
  }

  for (const plan of plans) {
    addPlan(plan)
  }

  return result
}

const moduleInventoryForType: PRecord<EntityType, defines.inventory> = {
  "assembling-machine": defines.inventory.crafter_modules,
  furnace: defines.inventory.crafter_modules,
  "rocket-silo": defines.inventory.crafter_modules,

  beacon: defines.inventory.beacon_modules,
  lab: defines.inventory.lab_modules,
  "mining-drill": defines.inventory.mining_drill_modules,
}

export function partitionModulesAndRemoveGridRequests(
  requests: BlueprintInsertPlan[],
  entityName: string,
): LuaMultiReturn<[modules: BlueprintInsertPlan[] | nil, nonModules: BlueprintInsertPlan[] | nil]> {
  if (!requests[0]) return $multi(nil, nil)
  const type: EntityType | nil = nameToType.get(entityName)
  if (!type) return $multi(nil, requests)
  const invIndex = moduleInventoryForType[type]
  if (invIndex) {
    return partitionInventoryFromRequests(requests, invIndex)
  }
  return $multi(nil, requests)
}

export function getNonModuleRequests(entity: LuaEntity): BlueprintInsertPlan[] | nil {
  if (!entity.valid) return
  const inserts = entity.item_request_proxy?.insert_plan
  if (!inserts) return nil
  const [, nonModules] = partitionModulesAndRemoveGridRequests(inserts, entity.name)
  return nonModules
}

export function addItemRequests(entity: Mutable<BlueprintEntity>, items: BlueprintInsertPlan[] | nil): void {
  const concat = nullableConcat(entity.items, items)
  entity.items = concat && mergeItemRequests(concat)
}

export function removeGridRequests(requests: BlueprintInsertPlan[]): BlueprintInsertPlan[] | nil {
  const result: BlueprintInsertPlan[] = []
  for (const request of requests) {
    if (request.items.grid_count == nil) {
      result.push(request)
    } else if (request.items.in_inventory) {
      result.push({
        id: request.id,
        items: {
          in_inventory: request.items.in_inventory,
        },
      })
    }
  }
  return result[0] && result
}

export function mergeInventoryPositions(positions: readonly InventoryPosition[]): InventoryPosition[] {
  const result: Mutable<InventoryPosition>[] = []
  const inventoryMap = new LuaMap<defines.inventory, number>()

  for (const position of positions) {
    const existingIndex = inventoryMap.get(position.inventory)
    if (existingIndex != nil) {
      const existing = result[existingIndex]
      existing.stack += position.stack
    } else {
      inventoryMap.set(position.inventory, result.length)
      result.push(position)
    }
  }

  return result
}

export function getInventoriesFromRequests(requests: BlueprintInsertPlan[]): ReadonlyLuaSet<defines.inventory> {
  const inventories = new LuaSet<defines.inventory>()
  for (const request of requests) {
    const inInventory = request.items.in_inventory
    if (inInventory) {
      for (const position of inInventory) {
        inventories.add(position.inventory)
      }
    }
  }
  return inventories
}

export function filterOutInventories(
  requests: BlueprintInsertPlan[],
  inventoriesToExclude: ReadonlyLuaSet<defines.inventory>,
): BlueprintInsertPlan[] | nil {
  const result: BlueprintInsertPlan[] = []
  for (const request of requests) {
    const inInventory = request.items.in_inventory
    if (!inInventory) {
      result.push(request)
    } else {
      const filteredPositions = inInventory.filter((pos) => !inventoriesToExclude.has(pos.inventory))
      if (filteredPositions[0]) {
        result.push({
          id: request.id,
          items: {
            in_inventory: filteredPositions,
            grid_count: request.items.grid_count,
          },
        })
      } else if (request.items.grid_count != nil) {
        result.push({
          id: request.id,
          items: {
            grid_count: request.items.grid_count,
          },
        })
      }
      // else, omit
    }
  }
  return result[0] && result
}
