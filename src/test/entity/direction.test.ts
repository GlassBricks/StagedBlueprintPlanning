import { createRollingStock } from "./createRollingStock"
import { getSavedDirection } from "../../entity/direction"

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
    assert.equal(getSavedDirection(entity), defines.direction.north)

    entity.direction = defines.direction.east
    assert.equal(getSavedDirection(entity), defines.direction.east)
  })

  test("opposite direction for output underground belts", () => {
    const entity = surface.create_entity({
      name: "underground-belt",
      position: { x: 0, y: 0 },
      direction: defines.direction.east,
      type: "input",
    })!
    assert(entity)
    assert.equal(getSavedDirection(entity), defines.direction.east)
    entity.destroy()
    const entity2 = surface.create_entity({
      name: "underground-belt",
      position: { x: 0, y: 0 },
      direction: defines.direction.east,
      type: "output",
    })
    assert(entity2)
    assert.equal(getSavedDirection(entity2!), defines.direction.west)
  })

  test("always north for rolling stock", () => {
    const rollingStock = createRollingStock()
    assert(rollingStock)
    assert.equal(getSavedDirection(rollingStock), defines.direction.north)
  })

  test("same for assembling machine with no fluid inputs", () => {
    const asm = surface.create_entity({
      name: "assembling-machine-2",
      position: { x: 0, y: 0 },
      recipe: "electric-engine-unit",
      direction: defines.direction.east,
    })!
    assert(asm)
    assert.equal(defines.direction.east, asm.direction)
    assert.equal(defines.direction.east, getSavedDirection(asm))

    asm.set_recipe(nil)
    assert.equal(defines.direction.east, asm.direction)
    assert.equal(defines.direction.east, getSavedDirection(asm))
  })
})
