/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of BBPP3.
 *
 * BBPP3 is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * BBPP3 is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with BBPP3. If not, see <https://www.gnu.org/licenses/>.
 */
import { Position } from "../lib/geometry"

export interface EntityPose {
  readonly position: Position
  readonly direction: defines.direction | nil
}
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
}
