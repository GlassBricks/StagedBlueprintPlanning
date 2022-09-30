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

import { AssemblyEntity } from "./AssemblyEntity"

export interface AsmCircuitConnection {
  readonly fromEntity: AssemblyEntity
  readonly fromId: defines.circuit_connector_id

  readonly toEntity: AssemblyEntity
  readonly toId: defines.circuit_connector_id

  readonly wire: defines.wire_type
}

export function circuitConnectionEquals(a: AsmCircuitConnection, b: AsmCircuitConnection): boolean {
  if (a === b) return true
  if (a.wire !== b.wire) return false
  return (
    (a.fromEntity === b.fromEntity && a.fromId === b.fromId && a.toEntity === b.toEntity && a.toId === b.toId) ||
    (a.fromEntity === b.toEntity && a.fromId === b.toId && a.toEntity === b.fromEntity && a.toId === b.fromId)
  )
}

export function getDirectionalInfo(
  connection: AsmCircuitConnection,
  fromEntity: AssemblyEntity,
): LuaMultiReturn<
  [otherEntity: AssemblyEntity, fromId: defines.circuit_connector_id, toId: defines.circuit_connector_id]
> {
  if (connection.fromEntity === fromEntity) return $multi(connection.toEntity, connection.fromId, connection.toId)
  return $multi(connection.fromEntity, connection.toId, connection.fromId)
}

export function circuitConnectionMatches(
  connection: AsmCircuitConnection,
  wire: defines.wire_type,
  toEntity: AssemblyEntity,
  fromId: defines.circuit_connector_id,
  toId: defines.circuit_connector_id,
): boolean {
  return (
    connection.wire === wire &&
    ((connection.toEntity === toEntity && connection.fromId === fromId && connection.toId === toId) ||
      (connection.fromEntity === toEntity && connection.toId === fromId && connection.fromId === toId))
  )
}
