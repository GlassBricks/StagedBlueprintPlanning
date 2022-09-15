/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of 100% Blueprint Planning.
 *
 * 100% Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * 100% Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with 100% Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { Position } from "../lib/geometry"

export interface Entity {
  readonly name: string
  readonly items?: Record<string, number>
}
export interface BasicEntityInfo {
  readonly name: string
  readonly type: string
  readonly surface: LuaSurface
  readonly position: Position
  readonly direction: defines.direction
  readonly belt_to_ground_type?: "input" | "output"
  readonly object_name?: string
}
