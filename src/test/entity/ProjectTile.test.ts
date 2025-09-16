// Copyright (c) 2024 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

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
test("moveDownWithValue", () => {
  const tile = createProjectTile("a", { x: 0, y: 0 }, 2)
  tile.moveDownWithValue(1, "b")

  expect(tile.firstValue).toBe("b")
  expect(tile.hasStageDiff()).toBe(true)
  expect(tile.getValueAtStage(1)).toBe("b")
  expect(tile.getValueAtStage(2)).toBe("a")
  expect(tile.getValueAtStage(3)).toBe("a")
})
