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
import { createProjectTile } from "../../entity/ProjectTile"

describe("setValueAtStage", () => {
  test("can set value at first stage", () => {
    const tile = createProjectTile("a", { x: 0, y: 0 }, 1)
    expect(tile.firstValue).toBe("a")
    expect(tile.hasStageDiff()).toBe(false)
    expect(tile.getValueAtStage(1)).toBe("a")
    expect(tile.getValueAtStage(2)).toBe("a")

    tile.adjustValueAtStage(1, "b")
    expect(tile.firstValue).toBe("b")
    expect(tile.hasStageDiff()).toBe(false)
    expect(tile.getValueAtStage(1)).toBe("b")
    expect(tile.getValueAtStage(2)).toBe("b")
  })

  test("creates stage diff when setting value at stage > first stage", () => {
    const tile = createProjectTile("a", { x: 0, y: 0 }, 1)
    tile.adjustValueAtStage(2, "b")
    expect(tile.firstValue).toBe("a")
    expect(tile.stageDiffs).toEqual({ [2]: "b" })

    expect(tile.getValueAtStage(1)).toBe("a")
    expect(tile.getValueAtStage(2)).toBe("b")
    expect(tile.getValueAtStage(3)).toBe("b")
  })

  test("removes stage diff when setting to old value", () => {
    const tile = createProjectTile("a", { x: 0, y: 0 }, 1)
    tile.adjustValueAtStage(2, "b")
    tile.adjustValueAtStage(2, "a")
    expect(tile.firstValue).toBe("a")
    expect(tile.hasStageDiff()).toBe(false)

    expect(tile.getValueAtStage(1)).toBe("a")
    expect(tile.getValueAtStage(2)).toBe("a")
    expect(tile.getValueAtStage(3)).toBe("a")
  })

  test("setting value at first stage may remove stage diff", () => {
    const tile = createProjectTile("a", { x: 0, y: 0 }, 1)
    tile.adjustValueAtStage(2, "b")
    tile.adjustValueAtStage(1, "b")

    expect(tile.getValueAtStage(1)).toBe("b")
    expect(tile.hasStageDiff()).toBe(false)
  })

  test("partially removes stage diff when setting to value different at previous stage", () => {
    const tile = createProjectTile("a", { x: 0, y: 0 }, 1)
    tile.adjustValueAtStage(3, "b")
    tile.adjustValueAtStage(2, "b")

    expect(tile.firstValue).toBe("a")
    expect(tile.stageDiffs).toEqual({ [2]: "b" })
  })
})
