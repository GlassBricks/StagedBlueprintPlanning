import { BBox, Pos } from "../lib/geometry"
import { Assembly } from "./Assembly"
import { _mockAssembly } from "./UserAssembly"
import { deleteAssembly, getLayerAtPosition, registerAssembly } from "./world-register"

let mockAssembly: Assembly
before_all(() => {
  const surface = game.surfaces[1]
  mockAssembly = _mockAssembly(Pos(1, 1))
  for (let i = 0; i < 5; i++) {
    mockAssembly.pushLayer({
      surface,
      position: Pos(i * 32, 0),
    })
  }
})

test("registers in world correctly", () => {
  registerAssembly(mockAssembly)
  after_test(() => deleteAssembly(mockAssembly))
  function assertLayersCorrect(): void {
    for (const layer of mockAssembly.layers) {
      const center = BBox.center(layer)
      assert.equal(layer, getLayerAtPosition(layer.surface, center))
      assert.not_equal(layer, getLayerAtPosition(layer.surface, center.plus(Pos(33, 33))))
    }
  }
  assertLayersCorrect()
  mockAssembly.pushLayer({
    surface: game.surfaces[1],
    position: Pos(5 * 32, 0),
  })
  assertLayersCorrect()
  deleteAssembly(mockAssembly)
  for (const layer of mockAssembly.layers) {
    const center = BBox.center(layer)
    assert.nil(getLayerAtPosition(layer.surface, center))
  }
})
