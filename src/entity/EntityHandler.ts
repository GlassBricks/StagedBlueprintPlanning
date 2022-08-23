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

import { StagePosition } from "../assembly/AssemblyContent"
import { Mutable } from "../lib"
import { Pos, PositionClass } from "../lib/geometry"
import { BlueprintDiffHandler } from "./BlueprintDiffHandler"
import { BasicEntityInfo, Entity, EntityPose } from "./Entity"
import minus = Pos.minus
import plus = Pos.plus

export function getStagePosition(stage: StagePosition, luaEntity: BasicEntityInfo): PositionClass {
  return minus(luaEntity.position, stage.left_top)
}
export function getWorldPosition(stage: StagePosition, entity: EntityPose): PositionClass {
  return plus(entity.position, stage.left_top)
}

/** @noSelf */
export interface EntityCreator {
  createEntity(stage: StagePosition, pos: EntityPose, entity: Entity): LuaEntity | nil
  updateEntity(luaEntity: LuaEntity, value: Entity): LuaEntity
}

/** @noSelf */
export interface EntitySaver {
  saveEntity(entity: LuaEntity): Mutable<Entity> | nil
}

export interface EntityHandler extends EntityCreator, EntitySaver {}

export const DefaultEntityHandler: EntityHandler = {
  saveEntity(luaEntity: LuaEntity): Entity | nil {
    return BlueprintDiffHandler.save(luaEntity)
  },

  createEntity(stage: StagePosition, pose: EntityPose, entity: Entity): LuaEntity | nil {
    return BlueprintDiffHandler.create(
      stage.surface,
      getWorldPosition(stage, pose),
      pose.direction,
      entity as BlueprintEntity,
    )
  },
  updateEntity(luaEntity: LuaEntity, value: Entity): LuaEntity {
    return BlueprintDiffHandler.match(luaEntity, value as BlueprintEntity)
  },
}
