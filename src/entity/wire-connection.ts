// Copyright (c) 2022-2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { ProjectEntity } from "./ProjectEntity"

export interface ProjectWireConnection {
  readonly fromEntity: ProjectEntity
  readonly fromId: defines.wire_connector_id

  readonly toEntity: ProjectEntity
  readonly toId: defines.wire_connector_id
}

export function wireConnectionEquals(a: ProjectWireConnection, b: ProjectWireConnection): boolean {
  if (a == b) return true
  return (
    (a.fromEntity == b.fromEntity && a.fromId == b.fromId && a.toEntity == b.toEntity && a.toId == b.toId) ||
    (a.fromEntity == b.toEntity && a.fromId == b.toId && a.toEntity == b.fromEntity && a.toId == b.fromId)
  )
}

export function getDirectionalInfo(
  connection: ProjectWireConnection,
  fromEntity: ProjectEntity,
): LuaMultiReturn<[otherEntity: ProjectEntity, fromId: defines.wire_connector_id, toId: defines.wire_connector_id]> {
  if (connection.fromEntity == fromEntity) return $multi(connection.toEntity, connection.fromId, connection.toId)
  return $multi(connection.fromEntity, connection.toId, connection.fromId)
}

export function wireConnectionMatches(
  connection: ProjectWireConnection,
  toEntity: ProjectEntity,
  fromId: defines.wire_connector_id,
  toId: defines.wire_connector_id,
): boolean {
  return (
    (connection.toEntity == toEntity && connection.fromId == fromId && connection.toId == toId) ||
    (connection.fromEntity == toEntity && connection.toId == fromId && connection.fromId == toId)
  )
}
