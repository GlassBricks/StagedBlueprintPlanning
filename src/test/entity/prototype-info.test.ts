// Copyright (c) 2022-2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import expect from "tstl-expect"
import { getPrototypeInfo, RotationType } from "../../entity/prototype-info"

describe("getCategoryName()", () => {
  function getEntityCategory(name: string): string {
    return getPrototypeInfo().nameToCategory.get(name) ?? "unknown"
  }
  test("same type", () => {
    expect(getEntityCategory("inserter")).toBe(getEntityCategory("inserter"))
  })
  test("same category", () => {
    expect(getEntityCategory("fast-inserter")).toBe(getEntityCategory("inserter"))
  })
  test("same type, not same category", () => {
    if (!("bobinserters" in script.active_mods)) {
      expect(getEntityCategory("inserter")).not.toBe(getEntityCategory("long-handed-inserter"))
    }
  })
  test("logistic-container is same as container", () => {
    expect(getEntityCategory("passive-provider-chest")).toBe(getEntityCategory("iron-chest"))
  })
  test("transport belt has no fast-replace-group in category", () => {
    expect(getEntityCategory("fast-transport-belt")).not.toInclude("|transport-belt|")
  })
  test("normal storage tanks are two-directional", () => {
    expect(getPrototypeInfo().twoDirectionTanks).toHaveKey("storage-tank")
  })

  test("blueprintableTiles includes concrete", () => {
    expect(getPrototypeInfo().blueprintableTiles).toHaveKey("concrete")
  })

  test("inserters and underground pipe are paste rotatable", () => {
    expect(getPrototypeInfo().rotationTypes.get("inserter")).toBe(RotationType.AnyDirection)
    expect(getPrototypeInfo().rotationTypes.get("pipe-to-ground")).toBe(RotationType.AnyDirection)
  })
})
