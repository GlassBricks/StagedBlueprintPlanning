/*
 * Copyright (c) 2023 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

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
    expect(defines.direction.north).to.be(entity.direction)

    entity.direction = defines.direction.east
    expect(defines.direction.east).to.be(entity.direction)
  })

  test("NOT opposite direction for output underground belts", () => {
    const entity = surface.create_entity({
      name: "underground-belt",
      position: { x: 0, y: 0 },
      direction: defines.direction.east,
      type: "input",
    })!
    assert(entity)
    expect(defines.direction.east).to.be(entity.direction)
    entity.destroy()
    const entity2 = surface.create_entity({
      name: "underground-belt",
      position: { x: 0, y: 0 },
      direction: defines.direction.east,
      type: "output",
    })
    assert(entity2)
    expect(defines.direction.east).to.be(entity2!.direction)
  })

  test("always north for rolling stock", () => {
    const rollingStock = createRollingStock()
    assert(rollingStock)
    expect(defines.direction.north).to.be(rollingStock.direction)
  })

  test("same for assembling machine with no fluid inputs", () => {
    const asm = surface.create_entity({
      name: "assembling-machine-2",
      position: { x: 0, y: 0 },
      recipe: "electric-engine-unit",
      direction: defines.direction.east,
    })!
    assert(asm)
    expect(asm.direction).to.be(defines.direction.east)
    expect(asm.direction).to.be(defines.direction.east)

    asm.set_recipe(nil)
    expect(asm.direction).to.be(defines.direction.east)
    expect(asm.direction).to.be(defines.direction.east)
  })
})
