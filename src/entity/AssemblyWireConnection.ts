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

export interface AssemblyWireConnection {
  readonly fromEntity: AssemblyEntity
  readonly fromId: defines.circuit_connector_id

  readonly toEntity: AssemblyEntity
  readonly toId: defines.circuit_connector_id

  readonly wire: defines.wire_type
}

export function wireConnectionEquals(a: AssemblyWireConnection, b: AssemblyWireConnection): boolean {
  if (a === b) return true
  if (a.wire !== b.wire) return false
  return (
    (a.fromEntity === b.fromEntity && a.fromId === b.fromId && a.toEntity === b.toEntity && a.toId === b.toId) ||
    (a.fromEntity === b.toEntity && a.fromId === b.toId && a.toEntity === b.fromEntity && a.toId === b.fromId)
  )
}

export function getDirectionalInfo(
  connection: AssemblyWireConnection,
  fromEntity: AssemblyEntity,
): LuaMultiReturn<
  [otherEntity: AssemblyEntity, fromId: defines.circuit_connector_id, toId: defines.circuit_connector_id]
> {
  if (connection.fromEntity === fromEntity) return $multi(connection.toEntity, connection.fromId, connection.toId)
  return $multi(connection.fromEntity, connection.toId, connection.fromId)
}
