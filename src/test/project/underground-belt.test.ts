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
import { UndergroundBeltEntity } from "../../entity/Entity"
import { MutableProjectContent, newProjectContent } from "../../entity/ProjectContent"
import { createProjectEntityNoCopy, StageNumber, UndergroundBeltProjectEntity } from "../../entity/ProjectEntity"
import { findUndergroundPair, unit } from "../../entity/underground-belt"
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
      unit(direction).times(location),
      direction,
      stage,
    )
    content.add(underground)
    return underground
  }

  function strToUndergrounds(str: string) {
    const result: (UndergroundBeltProjectEntity | "none")[] = []
    for (let i = 0; i < str.length; i++) {
      const c = str[i]
      if (c == "v") {
        result.push(createUnderground(i, "input", i + 1))
      } else if (c == "^") {
        result.push(createUnderground(i, "output", i + 1))
      } else {
        result.push("none")
      }
    }
    return result
  }

  function testSingle(
    undergrounds: (UndergroundBeltProjectEntity | "none")[],
    probe: number,
    expected: number | undefined,
    expectedMultiple: boolean,
  ): void {
    const expectedUnderground = expected != nil ? undergrounds[expected] : nil
    if (expectedUnderground == "none") error("expectedUnderground is none")
    const probeUnderground = undergrounds[probe]
    if (probeUnderground == "none") error("probeUnderground is none")
    const [underground, hasMultiple] = findUndergroundPair(content, probeUnderground)
    expect(underground).to.equal(expectedUnderground)
    expect(hasMultiple).to.equal(expectedMultiple)
  }

  function testUndergrounds(
    expected: number | undefined,
    inputUndergrounds: (UndergroundBeltProjectEntity | "none")[],
    probe: number,
    expectedMultiple: boolean,
  ) {
    testSingle(inputUndergrounds, probe, expected, expectedMultiple)
    if (expected != nil) {
      testSingle(inputUndergrounds, expected, probe, expectedMultiple)
    }
  }

  test("simple", () => {
    const undergrounds = strToUndergrounds("v___^")
    testUndergrounds(4, undergrounds, 0, false)
  })
  test("multiple one direction", () => {
    const undergrounds = strToUndergrounds("v__^^")
    ;(undergrounds[4] as UndergroundBeltProjectEntity).setFirstStageUnchecked(1)
    testUndergrounds(3, undergrounds, 0, true)
  })
  test("multiple other direction", () => {
    const undergrounds = strToUndergrounds("v_v^")
    ;(undergrounds[3] as UndergroundBeltProjectEntity).setFirstStageUnchecked(1)

    testUndergrounds(3, undergrounds, 2, true)
  })
  test("out of reach", () => {
    const undergrounds = strToUndergrounds("v_____^")
    testUndergrounds(nil, undergrounds, 0, false)
  })
  test("backwards out of reach", () => {
    const undergrounds = strToUndergrounds("v____v^")
    ;(undergrounds[6] as UndergroundBeltProjectEntity).setFirstStageUnchecked(1)
    testUndergrounds(6, undergrounds, 5, false)
  })

  test("if completely covered by first, does not count as multiple", () => {
    const inputUndergrounds = strToUndergrounds("v__^^")
    testUndergrounds(3, inputUndergrounds, 0, false)
  })

  test("none if connected to another pair", () => {
    const undergrounds = strToUndergrounds("vv__^")
    testUndergrounds(nil, undergrounds, 0, false)
  })

  test("different underground types not same group", () => {
    const undergrounds = strToUndergrounds("v^") as UndergroundBeltProjectEntity[]
    undergrounds[0].applyUpgradeAtStage(1, "fast-underground-belt")
    const [pair, hasMultiple] = findUndergroundPair(content, undergrounds[1])
    expect(pair).to.be.nil()
    expect(hasMultiple).to.be(false)
  })
})
