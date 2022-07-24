import { LayerNumber } from "../entity/AssemblyEntity"
import { MutableState, Observable, State } from "../lib/observable"
import { WorldPosition } from "../utils/world-location"
import { AssemblyUpdaterParams } from "./AssemblyUpdater"
import { MutableEntityMap } from "./EntityMap"
import { WorldUpdaterParams } from "./WorldUpdater"

export interface AssemblyPosition {
  readonly layers: readonly LayerPosition[]
}

export interface LayerPosition extends BoundingBoxRead {
  readonly layerNumber: LayerNumber
  readonly surface: LuaSurface
  readonly assembly: AssemblyPosition
}

export type AssemblyId = number & { _assemblyIdBrand: never }

export interface Assembly extends AssemblyUpdaterParams, WorldUpdaterParams {
  readonly id: AssemblyId

  readonly name: MutableState<string>
  readonly displayName: State<LocalisedString>

  readonly layers: readonly Layer[]
  pushLayer(leftTop: WorldPosition): Layer

  readonly content: MutableEntityMap

  readonly events: Observable<AssemblyChangeEvent>
}

export interface Layer extends LayerPosition {
  readonly assembly: Assembly

  readonly name: MutableState<string>
  readonly displayName: State<LocalisedString>
}

// events
export interface LayerPushedEvent {
  readonly type: "layer-pushed"
  readonly layer: Layer
}
export type AssemblyChangeEvent = LayerPushedEvent
