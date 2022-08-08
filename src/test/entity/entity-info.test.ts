/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of BBPP3.
 *
 * BBPP3 is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * BBPP3 is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with BBPP3. If not, see <https://www.gnu.org/licenses/>.
 */

import { getCategoryName } from "../../entity/entity-info"

describe("getCategoryName", () => {
  test("same type", () => {
    assert.equal(getCategoryName("inserter"), getCategoryName("inserter"))
  })
  test("same category", () => {
    assert.equal(getCategoryName("inserter"), getCategoryName("fast-inserter"))
  })
  test("same type, not same category", () => {
    assert.not_equal(getCategoryName("inserter"), getCategoryName("long-handed-inserter"))
  })
  test("logistic-container is same as container", () => {
    assert.equal(getCategoryName("iron-chest"), getCategoryName("logistic-chest-passive-provider"))
  })
})
