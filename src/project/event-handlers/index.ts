import "./blueprint-paste"
import "./build-events"
import "./entity-events"
import "./misc-events"
import "./selection-tools"
import "./wire-events"

import { _assertBlueprintPasteInValidState, _resetBlueprintPasteState } from "./blueprint-paste"
import { _assertInValidState as _assertSharedInValidState, _resetState as _resetSharedState } from "./shared-state"

export { getCurrentlyOpenedModdedGui } from "./misc-events"
export { checkForCircuitWireUpdates, checkForEntityUpdates } from "./shared-state"

export function _resetState(): void {
  _resetSharedState()
  _resetBlueprintPasteState()
}

export function _assertInValidState(): void {
  _assertSharedInValidState()
  _assertBlueprintPasteInValidState()
}
