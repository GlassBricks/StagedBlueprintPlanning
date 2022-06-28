import { LayerContent } from "../entity/LayerContent"
import { Vec2 } from "../lib/geometry"
import { MutableState, State } from "../lib/observable"
import { WorldArea } from "../utils/world-location"

export type AssemblyId = number & { _assemblyIdBrand: never }

export interface Assembly {
  readonly id: AssemblyId

  readonly name: MutableState<string>
  readonly displayName: State<LocalisedString>

  readonly layers: readonly Layer[]

  readonly size: Vec2
}

export interface Layer {
  readonly index: number

  readonly name: MutableState<string>
  readonly displayName: State<LocalisedString>

  readonly area: WorldArea

  readonly contents: LayerContent
}
