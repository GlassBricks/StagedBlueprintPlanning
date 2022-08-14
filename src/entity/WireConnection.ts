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

import { AssemblyEntity } from "./AssemblyEntity"

export interface WireConnection {
  readonly fromEntity: AssemblyEntity
  readonly fromType?: defines.circuit_connector_id

  readonly toEntity: AssemblyEntity
  readonly toType?: defines.circuit_connector_id

  readonly wireType: defines.wire_type
}

export function wireConnectionEquals(a: WireConnection, b: WireConnection): boolean {
  if (a === b) return true
  if (a.wireType !== b.wireType) return false
  return (
    (a.fromEntity === b.fromEntity &&
      a.fromType === b.fromType &&
      a.toEntity === b.toEntity &&
      a.toType === b.toType) ||
    (a.fromEntity === b.toEntity && a.fromType === b.toType && a.toEntity === b.fromEntity && a.toType === b.fromType)
  )
}
