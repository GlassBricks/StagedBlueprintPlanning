import { LayerNumber } from "../entity/AssemblyEntity"
import { MutableState, Observable, State } from "../lib/observable"
import { WorldPosition } from "../utils/world-location"
import { AssemblyUpdaterParams } from "./AssemblyUpdater"
import { MutableEntityMap } from "./EntityMap"
import { WorldUpdaterParams } from "./WorldUpdater"

export interface AssemblyPosition {
  readonly layers: readonly LayerPosition[]

  readonly valid: boolean
}

export interface LayerPosition extends BoundingBoxRead {
  readonly layerNumber: LayerNumber
  readonly surface: LuaSurface
  readonly assembly: AssemblyPosition

  readonly valid: boolean
}

export type AssemblyId = number & { _assemblyIdBrand: never }

export interface Assembly extends AssemblyUpdaterParams, WorldUpdaterParams, AssemblyPosition {
  readonly id: AssemblyId

  readonly name: MutableState<string>
  readonly displayName: State<LocalisedString>

  readonly layers: readonly Layer[]
  pushLayer(leftTop: WorldPosition): Layer

  readonly content: MutableEntityMap

  readonly events: Observable<AssemblyChangeEvent>

  delete(): void
}

export interface Layer extends LayerPosition {
  readonly assembly: Assembly

  readonly name: MutableState<string>
  readonly displayName: State<LocalisedString>
}

// events
export interface LayerPushedEvent {
  readonly type: "layer-pushed"
  readonly assembly: Assembly
  readonly layer: Layer
}

export interface AssemblyDeletedEvent {
  readonly type: "assembly-deleted"
  readonly assembly: Assembly
}
export type AssemblyChangeEvent = LayerPushedEvent | AssemblyDeletedEvent
