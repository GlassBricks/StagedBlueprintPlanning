import { LayerNumber } from "../entity/AssemblyEntity"
import { MutableState, State } from "../lib/observable"
import { WorldPosition } from "../utils/world-location"
import { AssemblyUpdaterParams } from "./AssemblyUpdater"
import { MutableEntityMap } from "./EntityMap"
import { WorldUpdaterParams } from "./WorldUpdater"

export interface LayerPosition extends BoundingBoxRead {
  readonly layerNumber: LayerNumber
  readonly surface: LuaSurface
}

export type AssemblyId = number & { _assemblyIdBrand: never }

export interface Assembly extends AssemblyUpdaterParams, WorldUpdaterParams {
  readonly id: AssemblyId

  readonly name: MutableState<string>
  readonly displayName: State<LocalisedString>

  readonly layers: readonly Layer[]
  pushLayer(leftTop: WorldPosition): Layer

  readonly content: MutableEntityMap
}

export interface Layer extends LayerPosition {
  readonly name: MutableState<string>
  readonly displayName: State<LocalisedString>

  readonly assembly: Assembly
}
