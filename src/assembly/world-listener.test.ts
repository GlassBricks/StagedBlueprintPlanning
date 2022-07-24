import { LayerNumber } from "../entity/AssemblyEntity"
import { Mutable } from "../lib"
import { BBox, Pos, PositionClass } from "../lib/geometry"
import { AssemblyPosition, LayerPosition } from "./Assembly"
import { AssemblyUpdater } from "./AssemblyUpdater"
import { deleteAssembly, registerAssembly } from "./world-register"

let updater: mock.Stubbed<AssemblyUpdater>
let layers: Record<number, LayerPosition>
let assembly: AssemblyPosition
let surface: LuaSurface
let player: LuaPlayer
before_all(() => {
  updater = mock(AssemblyUpdater, true)

  const theLayers = Array.from({ length: 5 }, (_, i) => {
    const leftTop = Pos(i * 32, 0)
    return {
      surface: game.surfaces[1],
      left_top: leftTop,
      right_bottom: leftTop.plus(Pos(32, 32)),
      layerNumber: i + 1,
      assembly: nil!,
    }
  })
  assembly = { layers: theLayers }
  layers = theLayers
  for (const layer of theLayers) {
    ;(layer as Mutable<LayerPosition>).assembly = assembly
  }
  registerAssembly(assembly)

  surface = game.surfaces[1]
  player = game.players[1]
})

before_each(() => {
  surface
    .find_entities_filtered({
      area: BBox.coords(0, 0, 5 * 32, 32),
    })
    .forEach((e) => e.destroy())

  mock.clear(updater)
})
after_all(() => {
  mock.revert(updater)
  deleteAssembly(assembly)
})

function getLayerCenter(layer: LayerNumber): PositionClass {
  return BBox.center(layers[layer])
}

describe("add", () => {
  test("player built entity", () => {
    const position = getLayerCenter(1)
    player.cursor_stack!.set_stack("iron-chest")
    player.build_from_cursor({ position })
    player.cursor_stack!.clear()
    const entity = surface.find_entities_filtered({
      position,
      radius: 1,
      limit: 1,
      name: "iron-chest",
    })[0]
    assert.spy(updater.onEntityCreated).called_with(assembly, entity, layers[1])
  })

  test("script raise built", () => {
    const position = getLayerCenter(1)
    const entity = surface.create_entity({
      name: "iron-chest",
      position,
      raise_built: true,
    })
    assert.not_nil(entity)
    assert.spy(updater.onEntityCreated).called_with(assembly, entity, layers[1])
  })
})
describe("delete", () => {
  let entity: LuaEntity
  before_each(() => {
    const position = getLayerCenter(1)
    entity = surface.create_entity({
      name: "iron-chest",
      position,
      raise_built: true,
    })!
  })
  test("player mined entity", () => {
    player.mine_entity(entity, true)
    assert.spy(updater.onEntityDeleted).called_with(assembly, match._, layers[1])
  })
  test("script raised destroy", () => {
    entity.destroy({ raise_destroy: true })
    assert.spy(updater.onEntityDeleted).called_with(assembly, match._, layers[1])
  })
  test("die", () => {
    entity.die()
    assert.spy(updater.onEntityDeleted).called_with(assembly, match._, layers[1])
  })
})
