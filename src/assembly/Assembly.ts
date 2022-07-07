import { LayerNumber } from "../entity/AssemblyEntity"
import { bound, Events, PRecord, reg, RegisterClass } from "../lib"
import { BBox, Pos, Vec2 } from "../lib/geometry"
import { MutableState, state, State } from "../lib/observable"
import { L_Assembly } from "../locale"
import { WorldPosition } from "../utils/world-location"
import { LayerContext } from "./content-update"

export type AssemblyId = number & { _assemblyIdBrand: never }

export interface Assembly {
  readonly id: AssemblyId

  readonly name: MutableState<string>
  readonly displayName: State<LocalisedString>

  readonly layers: readonly Layer[]

  readonly chunkSize: Vec2

  /** Does not do any verification */
  pushLayer(leftTop: WorldPosition): Layer
}

export interface Layer extends LayerContext {
  readonly name: MutableState<string>
  readonly displayName: State<LocalisedString>

  readonly assemblyId: AssemblyId
}

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
  displayName: State<LocalisedString> = this.name.map(reg(this.getDisplayName))
  layers: Layer[] = []

  private constructor(readonly id: AssemblyId, readonly chunkSize: Vec2) {}

  static create(chunkSize: Vec2): Assembly {
    const id = global.nextAssemblyId++ as AssemblyId
    assert(chunkSize.x > 0 && chunkSize.y > 0, "size must be positive")
    const actualSize = Pos.ceil(chunkSize)
    return (global.assemblies[id] = new AssemblyImpl(id, actualSize))
  }
  static get(id: AssemblyId): Assembly | nil {
    return global.assemblies[id]
  }

  pushLayer(leftTop: WorldPosition): Layer {
    const nextIndex = this.layers.length + 1
    return (this.layers[nextIndex - 1] = LayerImpl.create(this, nextIndex, leftTop))
  }

  @bound
  private getDisplayName(name: string): LocalisedString {
    return name !== "" ? name : [L_Assembly.UnnamedAssembly, this.id]
  }
}

export function newAssembly(chunkSize: Vec2): Assembly {
  return AssemblyImpl.create(chunkSize)
}

@RegisterClass("Layer")
class LayerImpl implements Layer {
  name = state("")
  displayName: State<LocalisedString> = this.name.map(reg(this.getDisplayName))

  constructor(
    readonly assemblyId: AssemblyId,
    readonly surface: LuaSurface,
    readonly bbox: BBox,
    public layerNumber: LayerNumber,
  ) {}

  static create(parent: Assembly, layerNumber: LayerNumber, worldTopLeft: WorldPosition): LayerImpl {
    const { chunkSize } = parent
    const { surface, position: leftTop } = worldTopLeft
    const actualLeftTop = Pos.floorToNearest(leftTop, 32)
    const rightBottom = Pos.plus(actualLeftTop, Pos.times(chunkSize, 32))
    return new LayerImpl(parent.id, surface, { left_top: actualLeftTop, right_bottom: rightBottom }, layerNumber)
  }

  _setLayerNumber(layerNumber: LayerNumber) {
    this.layerNumber = layerNumber
    if (this.name.value === "") this.name.forceNotify()
  }

  @bound
  private getDisplayName(name: string): LocalisedString {
    return name !== "" ? name : [L_Assembly.UnnamedLayer, this.layerNumber]
  }
}
