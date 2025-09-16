// Copyright (c) 2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { LuaSurface } from "factorio:runtime"
import expect from "tstl-expect"
import { createRollingStock } from "./createRollingStock"

describe("getSavedDirection", () => {
  let surface: LuaSurface
  before_all(() => {
    surface = game.surfaces[1]
  })
  before_each(() => {
    surface.find_entities().forEach((e) => e.destroy())
  })
  test("normal direction for normal entities", () => {
    const entity = surface.create_entity({
      name: "transport-belt",
      position: { x: 0, y: 0 },
      direction: defines.direction.north,
    })!
    assert(entity)
    expect(defines.direction.north).toBe(entity.direction)

    entity.direction = defines.direction.east
    expect(defines.direction.east).toBe(entity.direction)
  })

  test("NOT opposite direction for output underground belts", () => {
    const entity = surface.create_entity({
      name: "underground-belt",
      position: { x: 0, y: 0 },
      direction: defines.direction.east,
      type: "input",
    })!
    assert(entity)
    expect(defines.direction.east).toBe(entity.direction)
    entity.destroy()
    const entity2 = surface.create_entity({
      name: "underground-belt",
      position: { x: 0, y: 0 },
      direction: defines.direction.east,
      type: "output",
    })
    assert(entity2)
    expect(defines.direction.east).toBe(entity2!.direction)
  })

  test("always north for rolling stock", () => {
    const rollingStock = createRollingStock()
    assert(rollingStock)
    expect(defines.direction.north).toBe(rollingStock.direction)
  })

  test("same for assembling machine with no fluid inputs", () => {
    const project = surface.create_entity({
      name: "assembling-machine-2",
      position: { x: 0, y: 0 },
      recipe: "electric-engine-unit",
      direction: defines.direction.east,
    })!
    assert(project)
    expect(project.direction).toBe(defines.direction.east)
    expect(project.direction).toBe(defines.direction.east)

    project.set_recipe(nil)
    expect(project.direction).toBe(defines.direction.east)
    expect(project.direction).toBe(defines.direction.east)
  })
})
