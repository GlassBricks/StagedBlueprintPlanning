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
import { direction_vectors } from "util"
import { UndergroundBeltEntity } from "../../entity/Entity"
import { MutableProjectContent, newProjectContent } from "../../entity/ProjectContent"
import { createProjectEntityNoCopy, StageNumber, UndergroundBeltProjectEntity } from "../../entity/ProjectEntity"
import { findUndergroundPair } from "../../entity/underground-belt"
import { Pos } from "../../lib/geometry"
import direction = defines.direction

let content: MutableProjectContent

before_each(() => {
  content = newProjectContent()
})
// describe.each([defines.direction.north, defines.direction.east, defines.direction.south, defines.direction.west])(
describe.each([direction.north, direction.west])("findUndergroundPair, direction %s", (direction) => {
  function createUnderground(location: number, type: "input" | "output", stage: StageNumber) {
    const underground = createProjectEntityNoCopy<UndergroundBeltEntity>(
      { name: "underground-belt", type },
      Pos.normalize(direction_vectors[direction]).times(location),
      direction,
      stage,
    )
    content.add(underground)
    return underground
  }
  function checkPair(
    u1: UndergroundBeltProjectEntity,
    expectedPair: UndergroundBeltProjectEntity | nil,
    stage: StageNumber,
  ) {
    const pair = findUndergroundPair(content, u1, stage)
    expect(pair).toEqual(expectedPair)
    if (expectedPair) {
      const pairPair = findUndergroundPair(content, expectedPair, stage)
      expect(pairPair).toEqual(u1)
    }
  }

  test("nil if no pair", () => {
    const u1 = createUnderground(0, "input", 1)
    checkPair(u1, nil, 1)
  })
  test("nil if wrong direction", () => {
    const u1 = createUnderground(0, "input", 1)
    const u2 = createUnderground(1, "input", 1)
    checkPair(u1, nil, 1)
    checkPair(u2, nil, 1)
  })

  test("finds pair", () => {
    const u1 = createUnderground(0, "input", 1)
    const u2 = createUnderground(1, "output", 1)
    checkPair(u1, u2, 1)
  })

  test("does not find pair if not in range", () => {
    const u1 = createUnderground(0, "input", 1)
    const u2 = createUnderground(6, "output", 1)
    checkPair(u1, nil, 1)
    checkPair(u2, nil, 1)
  })

  test("if multiple pairs, returns closest", () => {
    const u1 = createUnderground(0, "input", 1)
    const u2 = createUnderground(1, "output", 1)
    const u3 = createUnderground(2, "output", 1)
    checkPair(u1, u2, 1)
    checkPair(u3, nil, 1)
  })

  test("if multiple pairs in later stages, returns first", () => {
    const u1 = createUnderground(0, "input", 1)
    const u2 = createUnderground(1, "output", 3)
    const u3 = createUnderground(2, "output", 2)
    checkPair(u1, u3, 1)
    checkPair(u1, u2, 3)
  })

  test("if beyond lastStage, does not match", () => {
    const u1 = createUnderground(0, "input", 1)
    const u2 = createUnderground(1, "output", 1)
    u2.setLastStageUnchecked(1)
    checkPair(u1, u2, 1)
    checkPair(u1, nil, 2)
  })

  test("if shadowed by existing, returns nil", () => {
    const u1 = createUnderground(0, "input", 1)
    const u2 = createUnderground(1, "input", 1)
    const u3 = createUnderground(2, "output", 1)
    checkPair(u1, nil, 1)
    checkPair(u2, u3, 1)
  })

  test("if shadow is in later stage, depends on stage", () => {
    const u1 = createUnderground(0, "input", 1)
    const u2 = createUnderground(1, "input", 2)
    const u3 = createUnderground(2, "output", 1)
    checkPair(u1, u3, 1)
    checkPair(u1, nil, 2)
    checkPair(u2, u3, 2)
  })

  test("returns if pair is in later stage", () => {
    const u1 = createUnderground(0, "input", 1)
    const u2 = createUnderground(1, "output", 2)
    checkPair(u1, u2, 1)
  })

  test("must match type", () => {
    const u1 = createUnderground(0, "input", 1)
    const u2 = createUnderground(1, "output", 1)
    u2._applyDiffAtStage(1, { name: "fast-underground-belt" })

    checkPair(u1, nil, 1)
    checkPair(u2, nil, 1)
  })

  test("if has upgrade, doesn't match if upgrade doesn't match", () => {
    const u1 = createUnderground(0, "input", 1)
    const u2 = createUnderground(1, "output", 1)
    u2.applyUpgradeAtStage(2, "fast-underground-belt")

    checkPair(u1, u2, 1)
    checkPair(u1, nil, 2)
    checkPair(u2, nil, 2)
  })

  test("with name argument", () => {
    const u1 = createUnderground(0, "input", 1)
    const u2 = createUnderground(1, "output", 1)
    u2.applyUpgradeAtStage(1, "fast-underground-belt")
    const pair = findUndergroundPair(content, u1, 1)
    expect(pair).toEqual(nil)
    const pair2 = findUndergroundPair(content, u1, 1, "fast-underground-belt")
    expect(pair2).toEqual(u2)
  })
})
