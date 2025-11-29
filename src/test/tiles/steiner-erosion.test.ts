// Copyright (c) 2025 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import expect from "tstl-expect"
import { first } from "../../lib/_util"
import { keyToPos, Point, pointsToSet, posToKey, solveSteinerErosion, visualize } from "../../tiles/steiner-erosion"

describe("posToKey() and keyToPos()", () => {
  test("converts point to string key", () => {
    expect(posToKey([5, 10])).toBe("5,10")
    expect(posToKey([0, 0])).toBe("0,0")
    expect(posToKey([-3, 7])).toBe("-3,7")
  })

  test("converts string key to point", () => {
    expect(keyToPos("5,10")).toEqual([5, 10])
    expect(keyToPos("0,0")).toEqual([0, 0])
    expect(keyToPos("-3,7")).toEqual([-3, 7])
  })

  test("roundtrip conversion", () => {
    const point: Point = [42, -17]
    expect(keyToPos(posToKey(point))).toEqual(point)
  })
})

describe("pointsToSet()", () => {
  test("converts points array to set", () => {
    const points: Point[] = [
      [1, 2],
      [3, 4],
      [5, 6],
    ]
    const set = pointsToSet(points)
    expect(table_size(set)).toBe(3)
    expect(set.has("1,2")).toBe(true)
    expect(set.has("3,4")).toBe(true)
    expect(set.has("5,6")).toBe(true)
  })

  test("handles empty array", () => {
    const set = pointsToSet([])
    expect(table_size(set)).toBe(0)
  })
})

function makeGrid(pattern: string[]): { W: number; H: number; required: LuaSet<string> } {
  const H = pattern.length
  const W = pattern[0].length
  const required = new LuaSet<string>()

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const char = pattern[H - 1 - y][x]
      if (char == "R") {
        required.add(posToKey([x, y]))
      }
    }
  }

  return { W, H, required }
}

function verifyConnectivity(W: number, H: number, filled: LuaSet<string>): void {
  if (filled.isEmpty()) return

  const firstKey = first(filled)
  if (firstKey == nil) return

  const visited = new LuaSet<string>()
  visited.add(firstKey)
  const queue = [firstKey]
  let qi = 0

  while (qi < queue.length) {
    const k = queue[qi]
    qi++
    const [x, y] = keyToPos(k)

    for (const dx of [-1, 0, 1]) {
      for (const dy of [-1, 0, 1]) {
        if (dx == 0 && dy == 0) continue
        const nk = posToKey([x + dx, y + dy])
        if (filled.has(nk) && !visited.has(nk)) {
          visited.add(nk)
          queue.push(nk)
        }
      }
    }
  }

  expect(table_size(visited)).toBe(table_size(filled))
}

function verifyNoHoles(W: number, H: number, filled: LuaSet<string>): void {
  const empty = new LuaSet<string>()
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) {
      const k = posToKey([x, y])
      if (!filled.has(k)) {
        empty.add(k)
      }
    }
  }

  const boundaryEmpty = new LuaSet<string>()
  for (const k of empty) {
    const [x, y] = keyToPos(k)
    if (x == 0 || x == W - 1 || y == 0 || y == H - 1) {
      boundaryEmpty.add(k)
    }
  }

  const reachable = new LuaSet<string>()
  for (const k of boundaryEmpty) {
    reachable.add(k)
  }
  const queue: string[] = []
  for (const k of boundaryEmpty) {
    queue.push(k)
  }

  let qi = 0
  while (qi < queue.length) {
    const k = queue[qi]
    qi++
    const [x, y] = keyToPos(k)

    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nk = posToKey([x + dx, y + dy])
      if (empty.has(nk) && !reachable.has(nk)) {
        reachable.add(nk)
        queue.push(nk)
      }
    }
  }

  expect(table_size(reachable)).toBe(table_size(empty))
}

describe("solveSteinerErosion()", () => {
  const testCases = [
    {
      name: "empty required set",
      pattern: ["...", "...", "..."],
      expectedResult: 0,
    },
    {
      name: "single required tile",
      pattern: ["...", ".R.", "..."],
      expectedResult: 1,
    },
    {
      name: "two adjacent tiles horizontally",
      pattern: ["...", "RR.", "..."],
      expectedResult: 2,
    },
    {
      name: "two adjacent tiles vertically",
      pattern: ["...", ".R.", ".R."],
      expectedResult: 2,
    },
    {
      name: "two adjacent tiles diagonally",
      pattern: ["...", ".R.", "R.."],
      expectedResult: 2,
    },
    {
      name: "L-shaped required tiles",
      pattern: ["....", ".R..", ".R..", ".RR."],
      expectedMaxTiles: 4,
    },
    {
      name: "four corners small grid",
      pattern: ["R...R", ".....", ".....", ".....", "R...R"],
      expectedMaxTiles: 15,
    },
    {
      name: "four corners larger grid",
      pattern: [
        "R.......R",
        ".........",
        ".........",
        ".........",
        ".........",
        ".........",
        ".........",
        ".........",
        "R.......R",
      ],
      expectedMaxTiles: 30,
    },
    {
      name: "scattered clusters",
      pattern: [
        "R.......R",
        ".........",
        ".........",
        "...RR....",
        "...RR....",
        ".........",
        ".........",
        ".........",
        "R.......R",
      ],
      expectedMaxTiles: 35,
    },
    {
      name: "boundary tiles top-left",
      pattern: ["R...", "....", "....", "...."],
      expectedResult: 1,
    },
    {
      name: "boundary tiles bottom-right",
      pattern: ["....", "....", "....", "...R"],
      expectedResult: 1,
    },
    {
      name: "all tiles required",
      pattern: ["RRR", "RRR", "RRR"],
      expectedResult: 9,
    },
    {
      name: "required tiles with hole",
      pattern: ["RRRR", "R..R", "R..R", "RRRR"],
      expectedResult: 16,
    },
    {
      name: "already optimal layout horizontal line",
      pattern: [".....", ".RRR.", "....."],
      expectedResult: 3,
    },
    {
      name: "already optimal layout vertical line",
      pattern: ["...", ".R.", ".R.", ".R.", "..."],
      expectedResult: 3,
    },
  ]

  for (const testCase of testCases) {
    test(testCase.name, () => {
      const { W, H, required } = makeGrid(testCase.pattern)
      const result = solveSteinerErosion(W, H, required)

      if (testCase.expectedResult != nil) {
        expect(table_size(result)).toBe(testCase.expectedResult)
      } else if (testCase.expectedMaxTiles != nil) {
        expect(table_size(result)).toBeLessThanOrEqual(testCase.expectedMaxTiles)
      }

      for (const tile of required) {
        expect(result.has(tile)).toBe(true)
      }

      if (table_size(result) > 0) {
        verifyConnectivity(W, H, result)
        verifyNoHoles(W, H, result)
      }
    })
  }
})

describe("visualize()", () => {
  test("visualizes grid correctly", () => {
    const W = 5
    const H = 5
    const required = pointsToSet([
      [1, 1],
      [3, 3],
    ])
    const filled = pointsToSet([
      [1, 1],
      [2, 2],
      [3, 3],
    ])

    const result = visualize(W, H, required, filled)
    const lines = result.split("\n")

    expect(lines.length).toBe(5)
    expect(lines[0]).toContain(".")
    expect(lines[1]).toContain("R")
    expect(lines[2]).toContain("#")
    expect(lines[3]).toContain("R")
  })
})
