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

import { LayerPosition } from "../assembly/Assembly"
import { Pos, Position, PositionClass } from "../lib/geometry"
import { Entity, EntityPose } from "./AssemblyEntity"
import { BlueprintDiffHandler } from "./diff/BlueprintDiffHandler"
import minus = Pos.minus
import plus = Pos.plus

export function getLayerPosition(luaEntity: LuaEntity, layer: LayerPosition): PositionClass {
  return minus(luaEntity.position, layer.left_top)
}
export function getWorldPosition(layerPosition: Position, layer: LayerPosition): PositionClass {
  return plus(layerPosition, layer.left_top)
}

export function saveEntity(luaEntity: LuaEntity): Entity | nil {
  return BlueprintDiffHandler.save(luaEntity)
}

export function createEntity(
  layer: LayerPosition,
  { position, direction }: EntityPose,
  entity: Entity,
): LuaEntity | nil {
  return BlueprintDiffHandler.create(
    layer.surface,
    getWorldPosition(position, layer),
    direction,
    entity as BlueprintEntity,
  )
}

export function matchEntity(luaEntity: LuaEntity, value: Entity): void {
  return BlueprintDiffHandler.match(luaEntity, value as BlueprintEntity)
}
