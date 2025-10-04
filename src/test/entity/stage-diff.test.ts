// Copyright (c) 2022 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import expect from "tstl-expect"
import { applyDiffToEntity, getEntityDiff } from "../../entity/stage-diff"
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
test("returns diff with only changed and removed properties", () => {
  const diff = getEntityDiff(entity1, entity2)
  expect(diff).toEqual({
    name: "2",
    changedProp: { x: 2, y: 2 },
    setToNil: getNilPlaceholder(),
  })
})
test("applies diff to entity correctly", () => {
  const diff = getEntityDiff(entity1, entity2)!
  const entity = { ...entity1 }
  applyDiffToEntity(entity, diff)
  expect(entity).toEqual(entity2)
})
