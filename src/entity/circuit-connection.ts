/*
 * Copyright (c) 2022-2023 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { LuaEntity } from "factorio:runtime"
import { ProjectEntity } from "./ProjectEntity"

export type AnyConnectionId = defines.circuit_connector_id | defines.wire_connection_id

export interface ProjectCircuitConnection {
  readonly fromEntity: ProjectEntity
  readonly fromId: AnyConnectionId

  readonly toEntity: ProjectEntity
  readonly toId: AnyConnectionId

  readonly wire: defines.wire_type
}

export interface CircuitOrPowerSwitchConnection {
  readonly wire: defines.wire_type
  readonly target_entity: LuaEntity
  readonly source_circuit_id: AnyConnectionId
  readonly target_circuit_id: AnyConnectionId
}

export function circuitConnectionEquals(a: ProjectCircuitConnection, b: ProjectCircuitConnection): boolean {
  if (a == b) return true
  if (a.wire != b.wire) return false
  return (
    (a.fromEntity == b.fromEntity && a.fromId == b.fromId && a.toEntity == b.toEntity && a.toId == b.toId) ||
    (a.fromEntity == b.toEntity && a.fromId == b.toId && a.toEntity == b.fromEntity && a.toId == b.fromId)
  )
}

export function getDirectionalInfo(
  connection: ProjectCircuitConnection,
  fromEntity: ProjectEntity,
): LuaMultiReturn<[otherEntity: ProjectEntity, fromId: AnyConnectionId, toId: AnyConnectionId]> {
  if (connection.fromEntity == fromEntity) return $multi(connection.toEntity, connection.fromId, connection.toId)
  return $multi(connection.fromEntity, connection.toId, connection.fromId)
}

export function circuitConnectionMatches(
  connection: ProjectCircuitConnection,
  wire: defines.wire_type,
  toEntity: ProjectEntity,
  fromId: AnyConnectionId,
  toId: AnyConnectionId,
): boolean {
  return (
    connection.wire == wire &&
    ((connection.toEntity == toEntity && connection.fromId == fromId && connection.toId == toId) ||
      (connection.fromEntity == toEntity && connection.toId == fromId && connection.fromId == toId))
  )
}
