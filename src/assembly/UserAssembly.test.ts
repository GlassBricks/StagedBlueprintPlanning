import { Pos } from "../lib/geometry"
import { L_Assembly } from "../locale"
import { WorldPosition } from "../utils/world-location"
import { Assembly } from "./Assembly"
import { _mockAssembly, newAssembly } from "./UserAssembly"

describe("Assembly", () => {
  test("basic", () => {
    const asm1 = newAssembly(Pos(1, 1))
    assert.true(asm1.valid)

    const asm2 = newAssembly(Pos(1, 1))
    assert.not_same(asm1.id, asm2.id)
  })
  test("rounds chunkSize up", () => {
    const asm = newAssembly(Pos(0.5, 0.5))
    assert.same(Pos(1, 1), asm.chunkSize)
  })

  test("Display name is correct", () => {
    const asm = _mockAssembly(Pos(1, 1))
    assert.same([L_Assembly.UnnamedAssembly, asm.id], asm.displayName.get())
    asm.name.set("test")
    assert.same("test", asm.displayName.get())
  })

  describe("deletion", () => {
    let asm: Assembly
    before_each(() => {
      asm = _mockAssembly(Pos(1, 1))
    })
    test("sets to invalid", () => {
      asm.delete()
      assert.false(asm.valid)
    })
    test("sets layers to invalid", () => {
      const layer = asm.pushLayer({ surface: game.surfaces[1], position: Pos(0, 0) })
      assert.true(layer.valid)
      asm.delete()
      assert.false(layer.valid)
    })
    test("fires event", () => {
      const sp = spy()
      asm.events.subscribeIndependently(sp)
      asm.delete()
      assert.same(sp.calls[1].refs[3], {
        type: "assembly-deleted",
        assembly: asm,
      })
    })
  })
})

describe("Layers", () => {
  let asm: Assembly
  let pos: WorldPosition
  before_each(() => {
    asm = _mockAssembly(Pos(1, 1))
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

  test("fires event on push", () => {
    const sp = spy()
    asm.events.subscribeIndependently(sp)
    const layer = asm.pushLayer(pos)
    assert.spy(sp).called_with(match._, match._, { type: "layer-pushed", layer, assembly: asm })
  })

  test("display name is correct", () => {
    const layer = asm.pushLayer(pos)
    assert.same([L_Assembly.UnnamedLayer, layer.layerNumber], layer.displayName.get())
    layer.name.set("test")
    assert.same("test", layer.displayName.get())
  })
})
