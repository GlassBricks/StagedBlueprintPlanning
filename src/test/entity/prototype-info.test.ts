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

import expect from "tstl-expect"
import { getPrototypeInfo } from "../../entity/prototype-info"

describe("getCategoryName", () => {
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
})
