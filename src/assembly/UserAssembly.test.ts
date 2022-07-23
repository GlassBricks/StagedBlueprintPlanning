import { Pos } from "../lib/geometry"
import { L_Assembly } from "../locale"
import { WorldPosition } from "../utils/world-location"
import { Assembly } from "./Assembly"
import { newAssembly } from "./UserAssembly"

describe("Assembly", () => {
  test("assigns unique id", () => {
    const asm1 = newAssembly(Pos(1, 1))
    const asm2 = newAssembly(Pos(1, 1))
    assert.not_same(asm1.id, asm2.id)
  })
  test("rounds chunkSize up", () => {
    const asm = newAssembly(Pos(0.5, 0.5))
    assert.same(Pos(1, 1), asm.chunkSize)
  })

  test("Display name is correct", () => {
    const asm = newAssembly(Pos(1, 1))
    assert.same([L_Assembly.UnnamedAssembly, asm.id], asm.displayName.get())
    asm.name.set("test")
    assert.same("test", asm.displayName.get())
  })
})

describe("Layer", () => {
  let asm: Assembly
  let pos: WorldPosition
  before_each(() => {
    asm = newAssembly(Pos(1, 1))
    pos = { surface: game.surfaces[1], position: Pos(0, 0) }
  })
  test("layerNumber and id is correct", () => {
    const layer1 = asm.pushLayer(pos)
    assert.equals(1, layer1.layerNumber)
    assert.equals(asm, layer1.assembly)

    const layer2 = asm.pushLayer(pos)
    assert.equals(2, layer2.layerNumber)
    assert.equals(asm, layer2.assembly)
  })

  test("display name is correct", () => {
    const layer = asm.pushLayer(pos)
    assert.same([L_Assembly.UnnamedLayer, layer.layerNumber], layer.displayName.get())
    layer.name.set("test")
    assert.same("test", layer.displayName.get())
  })
})
