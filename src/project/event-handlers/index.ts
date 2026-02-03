import "./entity-events"
import "./build-events"
import "./blueprint-paste"
import "./wire-events"
import "./selection-tools"
import "./misc-events"

import { _assertInValidState as _assertSharedInValidState, _resetState as _resetSharedState } from "./shared-state"
import { _assertBlueprintPasteInValidState, _resetBlueprintPasteState } from "./blueprint-paste"

export { checkForEntityUpdates, checkForCircuitWireUpdates } from "./shared-state"
export { getCurrentlyOpenedModdedGui } from "./misc-events"

export function _resetState(): void {
  _resetSharedState()
  _resetBlueprintPasteState()
}

export function _assertInValidState(): void {
  _assertSharedInValidState()
  _assertBlueprintPasteInValidState()
}
