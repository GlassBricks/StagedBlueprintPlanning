import { LayerNumber } from "../entity/AssemblyEntity"
import { WorldArea } from "../utils/world-location"

export interface Assembly {
  readonly layers: readonly Layer[]
}

export interface Layer extends WorldArea {
  readonly layerNumber: LayerNumber
}

// see also: UserAssembly
