import { BlueprintInsertPlan, InventoryPosition, LuaEntity } from "factorio:runtime"
import { EntityType } from "factorio:prototype"
import { Mutable, deepCopy, PRecord, getName } from "../lib"
import { OnPrototypeInfoLoaded, PrototypeInfo } from "./prototype-info"

let nameToType: PrototypeInfo["nameToType"]
OnPrototypeInfoLoaded.addListener((info) => {
  nameToType = info.nameToType
})

export function partitionInventoryFromRequest(
  request: BlueprintInsertPlan,
  inventory: defines.inventory,
): LuaMultiReturn<[withInv: BlueprintInsertPlan | nil, withoutInv: BlueprintInsertPlan | nil]> {
  const { in_inventory, grid_count } = request.items
  if (!in_inventory) {
    const withoutInv: BlueprintInsertPlan = {
      id: request.id,
      items: {
        grid_count,
      },
    }
    return $multi(nil, withoutInv)
  }

  const withInv = in_inventory.filter((i) => i.inventory == inventory)
  const withoutInv = in_inventory.filter((i) => i.inventory != inventory)

  const withInvResult = withInv[0]
    ? {
        id: request.id,
        items: {
          in_inventory: withInv,
        },
      }
    : nil

  const withoutInvResult =
    withoutInv[0] != nil || grid_count != nil
      ? {
          id: request.id,
          items: {
            grid_count,
            in_inventory: withoutInv[0] && withoutInv,
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

export function mergeRequestPlans(plans: readonly BlueprintInsertPlan[]): BlueprintInsertPlan[] {
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

export function partitionModulesFromRequests(
  requests: BlueprintInsertPlan[],
  entityName: string,
): LuaMultiReturn<[modules: BlueprintInsertPlan[] | nil, nonModules: BlueprintInsertPlan[] | nil]> {
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
  const [, nonModules] = partitionModulesFromRequests(inserts, entity.name)
  return nonModules
}
