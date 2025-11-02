// Copyright (c) 2022-2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import expect from "tstl-expect"
import { BBox } from "../../lib/geometry"
import { createUserProject } from "../../project/UserProject"
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

test("surface is named with project and stage names", () => {
  const project = createUserProject("MyProject", 2)
  after_test(() => project.delete())
  const stage = project.getStage(1)!

  expect(stage.surface.name).toMatch("^bp100%-")
  expect(stage.surface.name).toMatch("%-MyProject%-Stage%-1$")
})

test("surface name updates when project name changes", () => {
  const project = createUserProject("OldName", 1)
  after_test(() => project.delete())
  const stage = project.getStage(1)!
  const surface = stage.surface

  project.name.set("NewName")

  expect(surface.name).toMatch("NewName")
  expect(surface.name).not.toMatch("OldName")
})

test("surface name updates when stage name changes", () => {
  const project = createUserProject("Project", 1)
  after_test(() => project.delete())
  const stage = project.getStage(1)!
  const surface = stage.surface

  stage.name.set("CustomStage")

  expect(surface.name).toMatch("CustomStage")
})

test("sanitizes non-alphanumeric characters", () => {
  const project = createUserProject("My Project!", 1)
  after_test(() => project.delete())
  const stage = project.getStage(1)!
  stage.name.set("Stage #1")

  const name = stage.surface.name
  expect(name).not.toContain("!")
  expect(name).not.toContain("#")
  expect(name).not.toContain(" ")
})
