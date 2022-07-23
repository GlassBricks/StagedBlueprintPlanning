import { BBox, Pos } from "../lib/geometry"
import { AssemblyPosition, LayerPosition } from "./Assembly"
import { deleteAssembly, getLayerAtPosition, registerAssembly } from "./world-register"

let mockAssembly: AssemblyPosition
before_all(() => {
  const surface = game.surfaces[1]
  const layers: LayerPosition[] = Array.from({ length: 5 }, (_, i) => {
    const leftTop = Pos(32, 32).times(i)
    return {
      surface,
      left_top: leftTop,
      right_bottom: leftTop.plus(Pos(32, 64)),
      layerNumber: i + 1,
      assembly: nil!,
    }
  })
  mockAssembly = { layers }
})

test("add", () => {
  registerAssembly(mockAssembly)
  after_test(() => deleteAssembly(mockAssembly))
  for (const layer of mockAssembly.layers) {
    const center = BBox.center(layer)
    assert.equal(layer, getLayerAtPosition(layer.surface, center))
    assert.not_equal(layer, getLayerAtPosition(layer.surface, center.plus(Pos(33, 33))))
  }
  deleteAssembly(mockAssembly)
  for (const layer of mockAssembly.layers) {
    const center = BBox.center(layer)
    assert.nil(getLayerAtPosition(layer.surface, center))
  }
})
