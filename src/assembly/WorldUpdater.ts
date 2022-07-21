import { AssemblyEntity, LayerDiff, LayerNumber } from "../entity/AssemblyEntity"

export interface WorldUpdater {
  add(entity: AssemblyEntity): void
  refresh(entity: AssemblyEntity, layer: LayerNumber): void
  revive(entity: AssemblyEntity): void
  delete(entity: AssemblyEntity): void
  deletionForbidden(entity: AssemblyEntity, layer: LayerNumber): void
  update(entity: AssemblyEntity, layer: LayerNumber, diff: LayerDiff): void
}

function todo(this: unknown): never {
  error("TODO")
}
export const defaultWorldUpdater: WorldUpdater = {
  add: todo,
  refresh: todo,
  revive: todo,
  delete: todo,
  deletionForbidden: todo,
  update: todo,
}
