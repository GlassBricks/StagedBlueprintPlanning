/*
 * Copyright (c) 2024 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import expect from "tstl-expect"
import {
  BlueprintStageDiff,
  fromBlueprintStageDiff,
  isNilPlaceholder,
  toBlueprintStageDiff,
} from "../../copy-paste/blueprint-stage-info"
import { StageDiff } from "../../entity/stage-diff"
import { getNilPlaceholder } from "../../utils/diff-value"

test("isNilPlaceholder", () => {
  expect(isNilPlaceholder({})).toBe(false)
  expect(isNilPlaceholder({ __nil: true })).toBe(true)
})

test("toBlueprintStageDiff", () => {
  const value: StageDiff<any> = {
    a: 1,
    b: {},
    c: getNilPlaceholder(),
  }
  const expected = {
    a: 1,
    b: {},
    c: { __nil: true },
  }
  expect(toBlueprintStageDiff(value)).toEqual(expected)
})

test("fromBlueprintStageDiff", () => {
  const value: BlueprintStageDiff<any> = {
    a: 1,
    b: {},
    c: { __nil: true },
  }
  const expected: StageDiff<any> = {
    a: 1,
    b: {},
    c: getNilPlaceholder(),
  }
  expect(fromBlueprintStageDiff(value)).toEqual(expected)
})
