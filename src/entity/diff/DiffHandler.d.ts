import { Position } from "../../lib/geometry"
import { Entity } from "../AssemblyEntity"

export interface DiffHandler<E extends Entity> {
  save(luaEntity: LuaEntity): E | nil
  create(surface: LuaSurface, position: Position, direction: defines.direction | nil, entity: E): LuaEntity | nil
  match(luaEntity: LuaEntity, value: E): void
}
