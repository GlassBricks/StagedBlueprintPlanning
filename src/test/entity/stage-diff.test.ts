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

import { applyDiffToEntity, getEntityDiff } from "../../entity/stage-diff"
import expect from "tstl-expect"
import { getNilPlaceholder } from "../../utils/diff-value"

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
  expect(diff).to.equal({
    name: "2",
    changedProp: { x: 2, y: 2 },
    setToNil: getNilPlaceholder(),
  })
})
test("applyDiffToEntity", () => {
  const diff = getEntityDiff(entity1, entity2)!
  const entity = { ...entity1 }
  applyDiffToEntity(entity, diff)
  expect(entity).to.equal(entity2)
})
