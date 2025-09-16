// Copyright (c) 2022-2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import expect from "tstl-expect"
import { BBox } from "../../lib/geometry"
import { createStageSurface } from "../../project/surfaces"

test("generateStageSurface creates surface and generates chunks", () => {
  const surface = createStageSurface()
  after_test(() => game.delete_surface(surface))
  expect(surface.index).not.toEqual(1)
  expect(surface.always_day).toBe(true)
  expect(surface.generate_with_lab_tiles).toBe(true)
  expect(surface.ignore_surface_conditions).toBe(true)

  const area = BBox.coords(0, 0, 1, 1)
  for (const [x, y] of area.iterateTiles()) {
    const pos = { x, y }
    expect(surface.is_chunk_generated(pos)).toBe(true)
  }
})
