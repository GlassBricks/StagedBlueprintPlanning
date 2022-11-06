/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { Mutable } from "../lib"
import { BBox, Pos, Position } from "../lib/geometry"

function canMoveEntity(entity: LuaEntity, position: Position, direction: defines.direction): boolean {
  return entity.surface.can_place_entity({
    name: entity.name == "entity-ghost" ? entity.ghost_name : entity.name,
    position,
    direction,
    force: entity.force,
    build_check_type: defines.build_check_type.blueprint_ghost,
    inner_name: entity.name == "entity-ghost" ? entity.ghost_name : nil,
  })
}

function canWiresReach(entity: LuaEntity) {
  const wires =
    entity.type == "electric-pole"
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

export type EntityDollyResult = "success" | "overlap" | "could-not-teleport" | "wires-cannot-reach"

function tryMoveOutOfTheWay(entity: LuaEntity): boolean {
  let retries = 5
  const outOfTheWay: Mutable<MapPosition> = Pos.plus(entity.position, { x: 20, y: 20 })
  while (!entity.teleport(outOfTheWay)) {
    if (retries <= 1) return false
    outOfTheWay.x += retries
    outOfTheWay.y += retries
    retries--
  }
  return true
}

/** Moves all entities back if not successful. */
export function tryDollyAllEntities(
  entities: LuaEntity[],
  position: Position,
  direction: defines.direction,
): EntityDollyResult {
  entities = entities.filter((e) => e.valid && !(Pos.equals(e.position, position) && e.direction == direction))
  const oldPositions = entities.map((e) => e.position)
  const oldDirections = entities.map((e) => e.direction)
  function revertTeleport() {
    for (const i of $range(1, entities.length)) {
      const entity = entities[i - 1]
      entity.direction = oldDirections[i - 1]
      entity.teleport(oldPositions[i - 1])
    }
  }

  if (!entities.every((e) => tryMoveOutOfTheWay(e))) {
    revertTeleport()
    return "could-not-teleport"
  }
  if (!entities.every((e) => canMoveEntity(e, position, direction))) {
    revertTeleport()
    return "overlap"
  }

  let teleportError = false
  for (const entity of entities) {
    entity.direction = direction
    if (!entity.teleport(position)) {
      teleportError = true
      break
    }
  }
  if (teleportError || !entities.every((e) => canWiresReach(e))) {
    revertTeleport()
    return teleportError ? "could-not-teleport" : "wires-cannot-reach"
  }

  for (const i of $range(1, entities.length)) {
    updateMovedEntity(oldPositions[i - 1], entities[i - 1])
  }
  return "success"
}

export function forceDollyEntity(entity: LuaEntity, position: Position, direction: defines.direction): boolean {
  const oldPosition = entity.position
  const oldDirection = entity.direction
  entity.direction = direction
  if (!entity.teleport(position)) {
    entity.direction = oldDirection
    return false
  }

  updateMovedEntity(oldPosition, entity)
  return true
}
