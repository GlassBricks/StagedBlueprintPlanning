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

import { oppositedirection } from "util"
import { createAssemblyEntity, UndergroundBeltAssemblyEntity } from "../../entity/AssemblyEntity"
import { MutableEntityMap, newEntityMap } from "../../entity/EntityMap"
import { UndergroundBeltEntity } from "../../entity/special-entities"
import { findUndergroundPair, unit } from "../../entity/special-entity-treatment"
import direction = defines.direction
import { SavedDirection } from "../../entity/direction"

let content: MutableEntityMap

before_each(() => {
  content = newEntityMap()
})
// describe.each([defines.direction.north, defines.direction.east, defines.direction.south, defines.direction.west])(
describe.each([direction.north, direction.west])("findUndergroundPair, direction %s", (direction) => {
  function createUnderground(location: number, type: "input" | "output") {
    const underground = createAssemblyEntity<UndergroundBeltEntity>(
      { name: "underground-belt", type },
      unit(direction).times(location),
      (type == "output" ? oppositedirection(direction) : direction) as SavedDirection,
      1,
    )
    content.add(underground)
    return underground
  }

  function strToUndergrounds(str: string) {
    const result: (UndergroundBeltAssemblyEntity | "none")[] = []
    for (let i = 0; i < str.length; i++) {
      const c = str[i]
      if (c == "v") {
        result.push(createUnderground(i, "input"))
      } else if (c == "^") {
        result.push(createUnderground(i, "output"))
      } else {
        result.push("none")
      }
    }
    return result
  }

  function testStr(input: string, probe: number, expected: number | nil, expectedMultiple: boolean) {
    const inputUndergrounds = strToUndergrounds(input)
    const expectedUnderground = expected != nil ? inputUndergrounds[expected] : nil
    if (expectedUnderground == "none") error("expectedUnderground is none")
    const probeUnderground = inputUndergrounds[probe]
    if (probeUnderground == "none") error("probeUnderground is none")
    const [underground, hasMultiple] = findUndergroundPair(content, probeUnderground)
    assert.same(expectedUnderground, underground)
    assert.same(expectedMultiple, hasMultiple)
  }

  test("simple", () => {
    testStr("v___^", 0, 4, false)
  })
  test("multiple one direction", () => {
    testStr("v__^^", 0, 3, true)
  })
  test("multiple other direction", () => {
    testStr("v_v^", 2, 3, true)
  })
  test("out of reach", () => {
    testStr("v_____^", 0, nil, false)
  })
  test("backwards out of reach", () => {
    testStr("v____v^", 5, 6, false)
  })

  test("different underground types not same group", () => {
    const undergrounds = strToUndergrounds("v^") as UndergroundBeltAssemblyEntity[]
    undergrounds[0].applyUpgradeAtStage(1, "fast-underground-belt")
    const [pair, hasMultiple] = findUndergroundPair(content, undergrounds[1])
    assert.nil(pair)
    assert.false(hasMultiple)
  })
})
