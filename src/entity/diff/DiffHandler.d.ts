import { Position } from "../../lib/geometry"
import { WorldPosition } from "../../utils/world-location"
import { Entity } from "../AssemblyEntity"

export interface DiffHandler<E extends Entity> {
  save(entity: LuaEntity, layerPosition: Position): E | nil

  create(saved: E, layerPosition: WorldPosition): void
}
