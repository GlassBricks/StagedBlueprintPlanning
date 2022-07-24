import { LayerNumber } from "../entity/AssemblyEntity"
import { bind, Events, Mutable, PRecord, RegisterClass, registerFunctions } from "../lib"
import { Pos, Vec2 } from "../lib/geometry"
import { Event, state, State } from "../lib/observable"
import { L_Assembly } from "../locale"
import { WorldPosition } from "../utils/world-location"
import { Assembly, AssemblyChangeEvent, AssemblyId, Layer } from "./Assembly"
import { newEntityMap } from "./EntityMap"
import { registerAssembly } from "./world-register"

declare const global: {
  nextAssemblyId: AssemblyId
  assemblies: PRecord<AssemblyId, AssemblyImpl>
}
Events.on_init(() => {
  global.nextAssemblyId = 1 as AssemblyId
  global.assemblies = {}
})

type AssemblyLayer = Mutable<Layer>

@RegisterClass("Assembly")
class AssemblyImpl implements Assembly {
  name = state("")
  displayName: State<LocalisedString>
  layers: AssemblyLayer[] = []

  content = newEntityMap()

  events: Event<AssemblyChangeEvent> = new Event()

  valid = true

  private constructor(readonly id: AssemblyId, readonly chunkSize: Vec2) {
    this.displayName = this.name.map(bind(getDisplayName, L_Assembly.UnnamedAssembly, id))
  }

  static create(chunkSize: Vec2): AssemblyImpl {
    const id = global.nextAssemblyId++ as AssemblyId
    assert(chunkSize.x > 0 && chunkSize.y > 0, "size must be positive")
    const actualSize = Pos.ceil(chunkSize)

    const assembly = new AssemblyImpl(id, actualSize)
    global.assemblies[id] = assembly

    registerAssembly(assembly)

    return assembly
  }
  static _mock(chunkSize: Vec2): AssemblyImpl {
    // does not hook to anything.
    return new AssemblyImpl(0 as AssemblyId, chunkSize)
  }

  static get(id: AssemblyId): AssemblyImpl | nil {
    return global.assemblies[id]
  }

  delete() {
    if (!this.valid) return
    delete global.assemblies[this.id]
    this.valid = false
    for (const layer of this.layers) {
      layer.valid = false
    }
    this.events.raise({ type: "assembly-deleted", assembly: this })
    this.events.closeAll()
  }

  pushLayer(leftTop: WorldPosition): Layer {
    const nextIndex = this.layers.length + 1
    const layer = (this.layers[nextIndex - 1] = createLayer(this, nextIndex, leftTop))
    this.events.raise({ type: "layer-pushed", layer, assembly: this })
    return layer
  }
}

export function newAssembly(chunkSize: Vec2): AssemblyImpl {
  return AssemblyImpl.create(chunkSize)
}
export function _mockAssembly(chunkSize: Vec2): AssemblyImpl {
  return AssemblyImpl._mock(chunkSize)
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
    valid: true,
  }
}
