// Copyright (c) 2024 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import expect from "tstl-expect"
import { createProjectTile } from "../../entity/ProjectTile"
import { getNilPlaceholder } from "../../utils/diff-value"

describe("ProjectTile", () => {
  describe("getTileAtStage()", () => {
    test("returns value at exact stage", () => {
      const tile = createProjectTile()
      tile.values[2] = "concrete"
      expect(tile.getTileAtStage(2)).toBe("concrete")
    })

    test("returns propagated value from earlier stage", () => {
      const tile = createProjectTile()
      tile.values[2] = "concrete"
      expect(tile.getTileAtStage(3)).toBe("concrete")
      expect(tile.getTileAtStage(10)).toBe("concrete")
    })

    test("returns nil before first stage", () => {
      const tile = createProjectTile()
      tile.values[2] = "concrete"
      expect(tile.getTileAtStage(1)).toBeNil()
    })

    test("returns nil when value is nilPlaceholder", () => {
      const tile = createProjectTile()
      tile.values[2] = "concrete"
      tile.values[4] = getNilPlaceholder()
      expect(tile.getTileAtStage(4)).toBeNil()
      expect(tile.getTileAtStage(5)).toBeNil()
    })

    test("handles value changes across stages", () => {
      const tile = createProjectTile()
      tile.values[1] = "concrete"
      tile.values[3] = "stone-path"
      expect(tile.getTileAtStage(1)).toBe("concrete")
      expect(tile.getTileAtStage(2)).toBe("concrete")
      expect(tile.getTileAtStage(3)).toBe("stone-path")
      expect(tile.getTileAtStage(4)).toBe("stone-path")
    })
  })

  describe("setTileAtStage()", () => {
    test("sets value and creates entry", () => {
      const tile = createProjectTile()
      tile.values[1] = "concrete"

      const nextStage = tile.setTileAtStage(3, "stone-path")

      expect(tile.values[3]).toBe("stone-path")
      expect(nextStage).toBeNil()
    })

    test("returns next stage when it exists", () => {
      const tile = createProjectTile()
      tile.values[1] = "concrete"
      tile.values[5] = "landfill"

      const nextStage = tile.setTileAtStage(3, "stone-path")

      expect(nextStage).toBe(5)
    })

    test("removes redundant entry when value matches previous", () => {
      const tile = createProjectTile()
      tile.values[1] = "concrete"
      tile.values[3] = "stone-path"

      tile.setTileAtStage(3, "concrete")

      expect(tile.values[3]).toBeNil()
    })

    test("trims duplicate values after changed stage", () => {
      const tile = createProjectTile()
      tile.values[1] = "concrete"
      tile.values[3] = "stone-path"
      tile.values[5] = "stone-path"

      tile.setTileAtStage(1, "stone-path")

      expect(tile.values).toMatchTable({ [1]: "stone-path" })
    })

    test("stops trimming at first different value", () => {
      const tile = createProjectTile()
      tile.values[1] = "concrete"
      tile.values[3] = "stone-path"
      tile.values[5] = "landfill"

      tile.setTileAtStage(1, "stone-path")

      expect(tile.values).toMatchTable({ [1]: "stone-path", [5]: "landfill" })
    })

    test("sets nil value using nilPlaceholder", () => {
      const tile = createProjectTile()
      tile.values[1] = "concrete"

      tile.setTileAtStage(3, nil)

      expect(tile.values[3]).toBe(getNilPlaceholder())
      expect(tile.getTileAtStage(3)).toBeNil()
    })

    test("removes nil entry when previous stage was already nil", () => {
      const tile = createProjectTile()
      tile.values[1] = "concrete"
      tile.values[3] = getNilPlaceholder()

      tile.setTileAtStage(5, nil)

      expect(tile.values[5]).toBeNil()
    })
  })

  describe("isEmpty()", () => {
    test("returns true for empty tile", () => {
      const tile = createProjectTile()
      expect(tile.isEmpty()).toBe(true)
    })

    test("returns false when tile has values", () => {
      const tile = createProjectTile()
      tile.values[1] = "concrete"
      expect(tile.isEmpty()).toBe(false)
    })
  })

  describe("getFirstStage()", () => {
    test("returns lowest stage number", () => {
      const tile = createProjectTile()
      tile.values[3] = "concrete"
      tile.values[1] = "stone-path"
      tile.values[5] = "landfill"
      expect(tile.getFirstStage()).toBe(1)
    })
  })

  describe("getLastStage()", () => {
    test("returns nil when no explicit nil entry", () => {
      const tile = createProjectTile()
      tile.values[2] = "concrete"
      expect(tile.getLastStage()).toBeNil()
    })

    test("returns stage with nilPlaceholder", () => {
      const tile = createProjectTile()
      tile.values[2] = "concrete"
      tile.values[5] = getNilPlaceholder()
      expect(tile.getLastStage()).toBe(5)
    })
  })

  describe("insertStage()", () => {
    test("shifts all stages at or after insertion point", () => {
      const tile = createProjectTile()
      tile.values[2] = "concrete"
      tile.values[4] = "stone-path"

      tile.insertStage(3)

      expect(tile.values).toMatchTable({ [2]: "concrete", [5]: "stone-path" })
    })

    test("does not affect stages before insertion point", () => {
      const tile = createProjectTile()
      tile.values[1] = "concrete"
      tile.values[4] = "stone-path"

      tile.insertStage(3)

      expect(tile.values[1]).toBe("concrete")
    })
  })

  describe("deleteStage()", () => {
    test("merges stage value with previous and shifts", () => {
      const tile = createProjectTile()
      tile.values[1] = "concrete"
      tile.values[2] = "stone-path"
      tile.values[4] = "landfill"

      tile.mergeStage(2)

      expect(tile.values).toMatchTable({ [1]: "stone-path", [3]: "landfill" })
    })

    test("handles deleting stage 1 by merging stage 2", () => {
      const tile = createProjectTile()
      tile.values[1] = "concrete"
      tile.values[2] = "stone-path"

      tile.mergeStage(1)

      expect(tile.values[1]).toBe("stone-path")
    })
  })

  describe("discardStage()", () => {
    test("discards stage value without merging", () => {
      const tile = createProjectTile()
      tile.values[1] = "concrete"
      tile.values[2] = "stone-path"
      tile.values[4] = "landfill"

      tile.discardStage(2)

      expect(tile.values).toMatchTable({ [1]: "concrete", [3]: "landfill" })
    })

    test("trims duplicates after discard", () => {
      const tile = createProjectTile()
      tile.values[1] = "concrete"
      tile.values[2] = "stone-path"
      tile.values[3] = "concrete"

      tile.discardStage(2)

      // After discarding stage 2, stage 3 becomes stage 2 with "concrete"
      // setTileAtStage should trim this duplicate
      expect(tile.values).toMatchTable({ [1]: "concrete" })
    })

    test("handles discarding stage 1", () => {
      const tile = createProjectTile()
      tile.values[1] = "concrete"
      tile.values[2] = "stone-path"

      tile.discardStage(1)

      expect(tile.values).toMatchTable({ [1]: "stone-path" })
    })
  })
})
