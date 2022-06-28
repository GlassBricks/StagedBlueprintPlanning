import { Position } from "../../lib/geometry"
import { WorldPosition } from "../../utils/world-location"
import { Entity } from "../entity"

export interface DiffHandler<E extends Entity> {
  save(entity: LuaEntity, layerPosition: Position): E | undefined

  create(saved: E, layerPosition: WorldPosition): void
}
