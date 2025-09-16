// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { BlueprintInsertPlan, BlueprintInsertPlanWrite, InventoryPosition } from "factorio:runtime"

export function moduleInsertPlan(
  inventory: defines.inventory,
  numItems: number,
  startIndex: number,
  item: string,
): BlueprintInsertPlan {
  return {
    id: { name: item },
    items: {
      in_inventory: Array.from(
        { length: numItems },
        (_, i) => ({ inventory, stack: startIndex + i }) satisfies InventoryPosition,
      ),
    },
  } satisfies BlueprintInsertPlanWrite as unknown as BlueprintInsertPlan
}

export function simpleInsertPlan(
  inventory: defines.inventory,
  item: string,
  slot: number,
  count?: number,
): BlueprintInsertPlan {
  return {
    id: { name: item },
    items: { in_inventory: [{ inventory, stack: slot, count }] },
  } satisfies BlueprintInsertPlanWrite as unknown as BlueprintInsertPlan
}
