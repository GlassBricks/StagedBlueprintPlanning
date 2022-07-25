/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of BBPP3.
 *
 * BBPP3 is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * BBPP3 is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with Foobar. If not, see <https://www.gnu.org/licenses/>.
 */

import { Position } from "../../lib/geometry"
import { Entity } from "../AssemblyEntity"

export interface DiffHandler<E extends Entity> {
  save(luaEntity: LuaEntity): E | nil
  create(surface: LuaSurface, position: Position, direction: defines.direction | nil, entity: E): LuaEntity | nil
  match(luaEntity: LuaEntity, value: E): void
}
