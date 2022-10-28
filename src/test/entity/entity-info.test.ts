/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { getEntityCategory } from "../../entity/entity-info"

describe("getCategoryName", () => {
  test("same type", () => {
    assert.equal(getEntityCategory("inserter"), getEntityCategory("inserter"))
  })
  test("same category", () => {
    assert.equal(getEntityCategory("inserter"), getEntityCategory("fast-inserter"))
  })
  test("same type, not same category", () => {
    assert.not_equal(getEntityCategory("inserter"), getEntityCategory("long-handed-inserter"))
  })
  test("logistic-container is same as container", () => {
    assert.equal(getEntityCategory("iron-chest"), getEntityCategory("logistic-chest-passive-provider"))
  })
})
