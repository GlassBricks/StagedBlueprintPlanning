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

import type { ProjectEntity } from "./ProjectEntity"

export interface ProjectCircuitConnection {
  readonly fromEntity: ProjectEntity
  readonly fromId: defines.wire_connector_id

  readonly toEntity: ProjectEntity
  readonly toId: defines.wire_connector_id
}

export function circuitConnectionEquals(a: ProjectCircuitConnection, b: ProjectCircuitConnection): boolean {
  if (a == b) return true
  return (
    (a.fromEntity == b.fromEntity && a.fromId == b.fromId && a.toEntity == b.toEntity && a.toId == b.toId) ||
    (a.fromEntity == b.toEntity && a.fromId == b.toId && a.toEntity == b.fromEntity && a.toId == b.fromId)
  )
}

export function getDirectionalInfo(
  connection: ProjectCircuitConnection,
  fromEntity: ProjectEntity,
): LuaMultiReturn<[otherEntity: ProjectEntity, fromId: defines.wire_connector_id, toId: defines.wire_connector_id]> {
  if (connection.fromEntity == fromEntity) return $multi(connection.toEntity, connection.fromId, connection.toId)
  return $multi(connection.fromEntity, connection.toId, connection.fromId)
}

export function circuitConnectionMatches(
  connection: ProjectCircuitConnection,
  toEntity: ProjectEntity,
  fromId: defines.wire_connector_id,
  toId: defines.wire_connector_id,
): boolean {
  return (
    (connection.toEntity == toEntity && connection.fromId == fromId && connection.toId == toId) ||
    (connection.fromEntity == toEntity && connection.toId == fromId && connection.fromId == toId)
  )
}
