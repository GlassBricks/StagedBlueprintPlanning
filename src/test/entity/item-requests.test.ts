// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { BlueprintInsertPlan } from "factorio:runtime"
import expect from "tstl-expect"
import {
  mergeRequestPlans,
  partitionInventoryFromRequest,
  partitionInventoryFromRequests,
  partitionModulesAndRemoveGridRequests,
  removeGridRequests,
} from "../../entity/item-requests"

test("partitionInventoryFromRequest() with mixed items", () => {
  const request: BlueprintInsertPlan = {
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
  const [withModules, withoutModules] = partitionInventoryFromRequest(request, defines.inventory.crafter_modules)
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
  const request: BlueprintInsertPlan = {
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
  const [withModules, withoutModules] = partitionInventoryFromRequest(request, defines.inventory.crafter_modules)
  expect(withModules).toEqual(request)
  expect(withoutModules).toEqual(nil)
})

test("partitionInventoryFromRequest, excluded only", () => {
  const request: BlueprintInsertPlan = {
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
  const [withModules, withoutModules] = partitionInventoryFromRequest(request, defines.inventory.crafter_output)
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
    },
    {
      id: { name: "copper-plate" },
      items: {
        in_inventory: [{ inventory: defines.inventory.crafter_modules, stack: 0 }],
      },
    },
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
    } satisfies BlueprintInsertPlan,
  ]
  const [modules, nonModules] = partitionModulesAndRemoveGridRequests(requests, "assembling-machine-1")
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
  } satisfies BlueprintInsertPlan

  const plan2: BlueprintInsertPlan = {
    id: { name: "productivity-module" },
    items: {
      in_inventory: [{ inventory: defines.inventory.crafter_modules, stack: 2 }],
    },
  }

  const plan3: BlueprintInsertPlan = {
    id: { name: "iron-plate" },
    items: {
      in_inventory: [{ inventory: defines.inventory.crafter_input, stack: 2 }],
    },
  }

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
  }

  const plan2: BlueprintInsertPlan = {
    id: { name: "copper-plate" },
    items: {
      in_inventory: [{ inventory: defines.inventory.crafter_input, stack: 1 }],
    },
  }

  const merged = mergeRequestPlans([plan1, plan2])

  expect(merged).toHaveLength(2)
  expect(merged).toEqual([plan1, plan2])
})

test("removeGridRequests removes grid_count but keeps in_inventory", () => {
  const requests: BlueprintInsertPlan[] = [
    {
      id: { name: "iron-plate" },
      items: {
        grid_count: 5,
        in_inventory: [{ inventory: defines.inventory.crafter_input, stack: 0 }],
      },
    },
    {
      id: { name: "copper-plate" },
      items: {
        in_inventory: [{ inventory: defines.inventory.crafter_input, stack: 1 }],
      },
    },
    {
      id: { name: "steel-plate" },
      items: {
        grid_count: 3,
      },
    },
  ]

  const result = removeGridRequests(requests)!

  expect(result).toHaveLength(2)
  expect(result[0]).toEqual({
    id: { name: "iron-plate" },
    items: {
      in_inventory: [{ inventory: defines.inventory.crafter_input, stack: 0 }],
    },
  })
  expect(result[1]).toBe(requests[1])
})

test("removeGridRequests returns nil when all requests have only grid_count", () => {
  const requests: BlueprintInsertPlan[] = [
    {
      id: { name: "iron-plate" },
      items: {
        grid_count: 5,
      },
    },
  ]

  const result = removeGridRequests(requests)

  expect(result).toBeNil()
})
