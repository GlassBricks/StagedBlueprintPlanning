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

import { applyDiffToEntity, getEntityDiff, getNilPlaceholder } from "../../entity/diff"

const entity1 = {
  name: "1",
  changedProp: { x: 1, y: 2 },
  simpleUnchanged: "unchanged",
  unchanged: { x: 1, y: 2 },
  setToNil: "setToNil",
}
const entity2 = {
  name: "2",
  changedProp: { x: 2, y: 2 },
  simpleUnchanged: "unchanged",
  unchanged: { x: 1, y: 2 },
}
test("getEntityDiff", () => {
  const diff = getEntityDiff(entity1, entity2)
  assert.same(
    {
      name: "2",
      changedProp: { x: 2, y: 2 },
      setToNil: getNilPlaceholder(),
    },
    diff,
  )
})
test("applyDiffToEntity", () => {
  const diff = getEntityDiff(entity1, entity2)!
  const entity = { ...entity1 }
  applyDiffToEntity(entity, diff)
  assert.same(entity2, entity)
})
