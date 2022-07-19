import { WorldPosition } from "../../utils/world-location"
import { Entity } from "../AssemblyEntity"

export interface DiffHandler<E extends Entity> {
  save(entity: LuaEntity): E | nil

  create(saved: E, layerPosition: WorldPosition): void
}
