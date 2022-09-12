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

import { BBox, Pos, Position } from "../lib/geometry"

function canMoveEntity(entity: LuaEntity, position: Position, direction: defines.direction): boolean {
  if (Pos.equals(entity.position, position) && entity.direction === direction) return true
  return entity.surface.can_place_entity({
    name: entity.name === "entity-ghost" ? entity.ghost_name : entity.name,
    position,
    direction,
    force: entity.force,
    build_check_type: defines.build_check_type.blueprint_ghost,
    inner_name: entity.name === "entity-ghost" ? entity.ghost_name : nil,
  })
}

function canWiresReach(this: unknown, entity: LuaEntity) {
  const wires =
    entity.type === "electric-pole"
      ? (entity.neighbours as Record<string, LuaEntity[]>)
      : entity.circuit_connected_entities
  if (!wires) return true

  for (const [, entities] of pairs(wires)) {
    for (const e of entities) {
      if (!entity.can_wires_reach(e)) return false
    }
  }
  return true
}

function updateMovedEntity(oldPosition: Position, entity: LuaEntity): void {
  const proxy = entity.surface.find_entity("item-request-proxy", oldPosition)
  if (proxy && proxy.valid) proxy.teleport(entity.position)

  entity.update_connections()
  const updateableEntities = entity.surface.find_entities_filtered({
    area: BBox.expand(entity.bounding_box, 32),
    force: entity.force,
  })
  for (const e of updateableEntities) e.update_connections()
}

export type MoveEntityResult = "success" | "overlap" | "could-not-teleport" | "wires-cannot-reach"

/** Moves all entities back if not successful. */
export function tryMoveAllEntities(
  entities: LuaEntity[],
  position: Position,
  direction: defines.direction,
): MoveEntityResult {
  if (!entities.every((e) => canMoveEntity(e, position, direction))) return "overlap"
  // move
  const oldPositions = entities.map((e) => e.position)
  const oldDirections = entities.map((e) => e.direction)

  let teleportError = false
  for (const entity of entities) {
    if (entity.teleport(position)) {
      entity.direction = direction
    } else {
      teleportError = true
      break
    }
  }
  if (teleportError || !entities.every(canWiresReach)) {
    // revert
    for (const i of $range(1, entities.length)) {
      const entity = entities[i - 1]
      entity.teleport(oldPositions[i - 1])
      entity.direction = oldDirections[i - 1]
    }
    return teleportError ? "could-not-teleport" : "wires-cannot-reach"
  }

  // update connections
  for (const i of $range(1, entities.length)) {
    updateMovedEntity(oldPositions[i - 1], entities[i - 1])
  }

  return "success"
}

export function forceMoveEntity(entity: LuaEntity, position: Position, direction: defines.direction): boolean {
  const oldPosition = entity.position
  if (!entity.teleport(position)) {
    entity.direction = direction
    return false
  }
  entity.direction = direction
  updateMovedEntity(oldPosition, entity)
  return true
}
