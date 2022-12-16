import { createRollingStock } from "./createRollingStock"
import { getSavedDirection } from "../../entity/direction"
import expect from "tstl-expect"

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
    expect(defines.direction.north).to.be(getSavedDirection(entity))

    entity.direction = defines.direction.east
    expect(defines.direction.east).to.be(getSavedDirection(entity))
  })

  test("opposite direction for output underground belts", () => {
    const entity = surface.create_entity({
      name: "underground-belt",
      position: { x: 0, y: 0 },
      direction: defines.direction.east,
      type: "input",
    })!
    assert(entity)
    expect(defines.direction.east).to.be(getSavedDirection(entity))
    entity.destroy()
    const entity2 = surface.create_entity({
      name: "underground-belt",
      position: { x: 0, y: 0 },
      direction: defines.direction.east,
      type: "output",
    })
    assert(entity2)
    expect(defines.direction.west).to.be(getSavedDirection(entity2!))
  })

  test("always north for rolling stock", () => {
    const rollingStock = createRollingStock()
    assert(rollingStock)
    expect(defines.direction.north).to.be(getSavedDirection(rollingStock))
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
    expect(getSavedDirection(asm)).to.be(defines.direction.east)

    asm.set_recipe(nil)
    expect(asm.direction).to.be(defines.direction.east)
    expect(getSavedDirection(asm)).to.be(defines.direction.east)
  })
})
