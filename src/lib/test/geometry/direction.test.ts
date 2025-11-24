// Copyright (c) 2022-2025 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import expect from "tstl-expect"
import { applyDirectionTransformation, floorToCardinalDirection } from "../../geometry/direction"

describe("floorToCardinalDirection()", () => {
  test.each<[defines.direction, defines.direction]>([
    [defines.direction.north, defines.direction.north],
    [defines.direction.east, defines.direction.east],
    [defines.direction.south, defines.direction.south],
    [defines.direction.west, defines.direction.west],
    [defines.direction.northeast, defines.direction.north],
    [defines.direction.southeast, defines.direction.east],
    [defines.direction.southwest, defines.direction.south],
    [defines.direction.northwest, defines.direction.west],
  ])("floors direction %s to %s", (input, expected) => {
    expect(floorToCardinalDirection(input)).toBe(expected)
  })
})

describe("applyDirectionTransformation()", () => {
  test.each<[defines.direction, boolean, boolean, defines.direction, defines.direction]>([
    // [input direction, flipH, flipV, rotation, expected output]
    // No transformation
    [defines.direction.north, false, false, defines.direction.north, defines.direction.north],

    // Rotation only
    [defines.direction.north, false, false, defines.direction.east, defines.direction.east],
    [defines.direction.east, false, false, defines.direction.east, defines.direction.south],
    [defines.direction.north, false, false, defines.direction.south, defines.direction.south],

    // Horizontal flip only
    [defines.direction.north, true, false, defines.direction.north, defines.direction.north],
    [defines.direction.east, true, false, defines.direction.north, defines.direction.west],
    [defines.direction.northeast, true, false, defines.direction.north, defines.direction.northwest],
    [defines.direction.south, true, false, defines.direction.north, defines.direction.south],

    // Vertical flip only
    [defines.direction.north, false, true, defines.direction.north, defines.direction.south],
    [defines.direction.east, false, true, defines.direction.north, defines.direction.east],
    [defines.direction.northeast, false, true, defines.direction.north, defines.direction.southeast],
    [defines.direction.west, false, true, defines.direction.north, defines.direction.west],

    // Both flips (180° rotation)
    [defines.direction.north, true, true, defines.direction.north, defines.direction.south],
    [defines.direction.east, true, true, defines.direction.north, defines.direction.west],
    [defines.direction.northeast, true, true, defines.direction.north, defines.direction.southwest],

    // Rotation + horizontal flip
    [defines.direction.north, true, false, defines.direction.east, defines.direction.west],
    [defines.direction.northeast, true, false, defines.direction.east, defines.direction.southwest],

    // Rotation + vertical flip
    [defines.direction.north, false, true, defines.direction.east, defines.direction.east],
    [defines.direction.east, false, true, defines.direction.east, defines.direction.north],

    // Rotation + both flips
    [defines.direction.north, true, true, defines.direction.east, defines.direction.west],
  ])("transform dir=%s flipH=%s flipV=%s rot=%s -> %s", (input, flipH, flipV, rot, expected) => {
    expect(applyDirectionTransformation(input, flipH, flipV, rot)).toBe(expected)
  })
})
