import { BlueprintInsertPlan, BlueprintInsertPlanWrite } from "factorio:runtime"
import expect from "tstl-expect"
import {
  mergeRequestPlans,
  partitionInventoryFromRequest,
  partitionInventoryFromRequests,
  partitionModulesFromRequests,
} from "../../entity/item-requests"

test("partitionInventoryFromRequest with mixed items", () => {
  const request: BlueprintInsertPlanWrite = {
    id: {
      name: "iron-plate",
    },
    items: {
      grid_count: 1,
      in_inventory: [
        {
          inventory: defines.inventory.crafter_input,
          stack: 0,
        },
        {
          inventory: defines.inventory.crafter_modules,
          stack: 2,
        },
        {
          inventory: defines.inventory.crafter_output,
          stack: 1,
        },
      ],
    },
  }
  const [withModules, withoutModules] = partitionInventoryFromRequest(
    request as BlueprintInsertPlan,
    defines.inventory.crafter_modules,
  )
  expect(withModules).toEqual({
    id: {
      name: "iron-plate",
    },
    items: {
      in_inventory: [
        {
          inventory: defines.inventory.crafter_modules,
          stack: 2,
        },
      ],
    },
  })
  expect(withoutModules).toEqual({
    id: {
      name: "iron-plate",
    },
    items: {
      grid_count: 1,
      in_inventory: [
        {
          inventory: defines.inventory.crafter_input,
          stack: 0,
        },
        {
          inventory: defines.inventory.crafter_output,
          stack: 1,
        },
      ],
    },
  })
})

test("partitionInventoryFromRequest, matching only", () => {
  const request: BlueprintInsertPlanWrite = {
    id: {
      name: "iron-plate",
    },
    items: {
      in_inventory: [
        {
          inventory: defines.inventory.crafter_modules,
          stack: 2,
        },
      ],
    },
  }
  const [withModules, withoutModules] = partitionInventoryFromRequest(
    request as BlueprintInsertPlan,
    defines.inventory.crafter_modules,
  )
  expect(withModules).toEqual(request)
  expect(withoutModules).toEqual(nil)
})

test("partitionInventoryFromRequest, excluded only", () => {
  const request: BlueprintInsertPlanWrite = {
    id: {
      name: "iron-plate",
    },
    items: {
      in_inventory: [
        {
          inventory: defines.inventory.crafter_modules,
          stack: 2,
        },
      ],
    },
  }
  const [withModules, withoutModules] = partitionInventoryFromRequest(
    request as BlueprintInsertPlan,
    defines.inventory.crafter_output,
  )
  expect(withModules).toEqual(nil)
  expect(withoutModules).toEqual(request)
})
test("partitionInventoryFromRequests with mixed requests", () => {
  const requests: BlueprintInsertPlan[] = [
    {
      id: { name: "iron-plate" },
      items: {
        in_inventory: [
          { inventory: defines.inventory.crafter_input, stack: 0 },
          { inventory: defines.inventory.crafter_modules, stack: 1 },
        ],
      },
    } satisfies BlueprintInsertPlanWrite as unknown as BlueprintInsertPlan,
    {
      id: { name: "copper-plate" },
      items: {
        in_inventory: [{ inventory: defines.inventory.crafter_modules, stack: 0 }],
      },
    } satisfies BlueprintInsertPlanWrite as unknown as BlueprintInsertPlan,
  ]
  const [withModules, withoutModules] = partitionInventoryFromRequests(requests, defines.inventory.crafter_modules)
  expect(withModules!).toHaveLength(2)
  expect(withoutModules!).toHaveLength(1)
  expect(withoutModules![0].id.name).toBe("iron-plate")
})

test("partitionModulesFromRequests basic case", () => {
  const requests: BlueprintInsertPlan[] = [
    {
      id: { name: "speed-module" },
      items: {
        in_inventory: [{ inventory: defines.inventory.crafter_modules, stack: 0 }],
      },
    } satisfies BlueprintInsertPlanWrite as unknown as BlueprintInsertPlan,
  ]
  const [modules, nonModules] = partitionModulesFromRequests(requests, "assembling-machine-1")
  expect(modules!).toHaveLength(1)
  expect(modules![0].id.name).toBe("speed-module")
  expect(nonModules).toBeNil()
})

test("mergeRequestPlans with overlapping requests", () => {
  const plan1: BlueprintInsertPlan = {
    id: { name: "productivity-module" },
    items: {
      in_inventory: [
        { inventory: defines.inventory.crafter_input, stack: 0 },
        { inventory: defines.inventory.crafter_output, stack: 1 },
      ],
    },
  } satisfies BlueprintInsertPlanWrite as unknown as BlueprintInsertPlan

  const plan2: BlueprintInsertPlan = {
    id: { name: "productivity-module" },
    items: {
      in_inventory: [{ inventory: defines.inventory.crafter_modules, stack: 2 }],
    },
  } satisfies BlueprintInsertPlanWrite as unknown as BlueprintInsertPlan

  const plan3: BlueprintInsertPlan = {
    id: { name: "iron-plate" },
    items: {
      in_inventory: [{ inventory: defines.inventory.crafter_input, stack: 2 }],
    },
  } satisfies BlueprintInsertPlanWrite as unknown as BlueprintInsertPlan

  const merged = mergeRequestPlans([plan1, plan2, plan3])

  expect(merged).toHaveLength(2)
  expect(merged[0]).toEqual({
    id: { name: "productivity-module" },
    items: {
      in_inventory: [
        { inventory: defines.inventory.crafter_input, stack: 0 },
        { inventory: defines.inventory.crafter_output, stack: 1 },
        { inventory: defines.inventory.crafter_modules, stack: 2 },
      ],
    },
  })
  expect(merged[1]).toBe(plan3)
})
test("mergeRequestPlans with non-overlapping requests", () => {
  const plan1: BlueprintInsertPlan = {
    id: { name: "iron-plate" },
    items: {
      in_inventory: [{ inventory: defines.inventory.crafter_input, stack: 0 }],
    },
  } satisfies BlueprintInsertPlanWrite as unknown as BlueprintInsertPlan

  const plan2: BlueprintInsertPlan = {
    id: { name: "copper-plate" },
    items: {
      in_inventory: [{ inventory: defines.inventory.crafter_input, stack: 1 }],
    },
  } satisfies BlueprintInsertPlanWrite as unknown as BlueprintInsertPlan

  const merged = mergeRequestPlans([plan1, plan2])

  expect(merged).toHaveLength(2)
  expect(merged).toEqual([plan1, plan2])
})
