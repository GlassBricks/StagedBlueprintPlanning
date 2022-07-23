import { LayerNumber } from "../entity/AssemblyEntity"
import { bind, Events, PRecord, RegisterClass, registerFunctions } from "../lib"
import { Pos, Vec2 } from "../lib/geometry"
import { state, State } from "../lib/observable"
import { L_Assembly } from "../locale"
import { WorldPosition } from "../utils/world-location"
import { Assembly, AssemblyId, Layer } from "./Assembly"
import { newEntityMap } from "./EntityMap"

declare const global: {
  nextAssemblyId: AssemblyId
  assemblies: PRecord<AssemblyId, AssemblyImpl>
}
Events.on_init(() => {
  global.nextAssemblyId = 1 as AssemblyId
  global.assemblies = {}
})

@RegisterClass("Assembly")
class AssemblyImpl implements Assembly {
  name = state("")
  displayName: State<LocalisedString>
  layers: Layer[] = []

  content = newEntityMap()

  private constructor(readonly id: AssemblyId, readonly chunkSize: Vec2) {
    this.displayName = this.name.map(bind(getDisplayName, L_Assembly.UnnamedAssembly, id))
  }

  static create(chunkSize: Vec2): AssemblyImpl {
    const id = global.nextAssemblyId++ as AssemblyId
    assert(chunkSize.x > 0 && chunkSize.y > 0, "size must be positive")
    const actualSize = Pos.ceil(chunkSize)
    return (global.assemblies[id] = new AssemblyImpl(id, actualSize))
  }
  static get(id: AssemblyId): AssemblyImpl | nil {
    return global.assemblies[id]
  }

  pushLayer(leftTop: WorldPosition): Layer {
    const nextIndex = this.layers.length + 1
    return (this.layers[nextIndex - 1] = createLayer(this, nextIndex, leftTop))
  }
}
export function newAssembly(chunkSize: Vec2): AssemblyImpl {
  return AssemblyImpl.create(chunkSize)
}

function getDisplayName(this: string, id: number, name: string): LocalisedString {
  return name !== "" ? name : [this, id]
}
registerFunctions("AssemblyName", { getDisplayName })

function createLayer(parent: AssemblyImpl, layerNumber: LayerNumber, worldTopLeft: WorldPosition): Layer {
  const { chunkSize } = parent
  const { surface, position: leftTop } = worldTopLeft
  const actualLeftTop = Pos.floorToNearest(leftTop, 32)
  const rightBottom = Pos.plus(actualLeftTop, Pos.times(chunkSize, 32))
  const name = state("")
  return {
    layerNumber,
    surface,
    left_top: actualLeftTop,
    right_bottom: rightBottom,
    name,
    displayName: name.map(bind(getDisplayName, L_Assembly.UnnamedLayer, layerNumber)),
    assembly: parent,
  }
}
