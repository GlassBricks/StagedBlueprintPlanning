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

import { LuaEntity, SurfaceIndex, UnitNumber } from "factorio:runtime"
import { Events } from "../lib"
import { Migrations } from "../lib/migration"
import type { ProjectEntity } from "./ProjectEntity"

declare const global: {
  entityByUnitNumber: LuaMap<UnitNumber, ProjectEntity>
  surfaceByUnitNumber: LuaMap<UnitNumber, SurfaceIndex>
}

Events.on_init(() => {
  global.entityByUnitNumber = new LuaMap()
})

/** Currently only used for rolling stock (train) entities. */
export function registerEntity(luaEntity: LuaEntity, projectEntity: ProjectEntity): boolean {
  if (!luaEntity.valid) return false
  const unitNumber = luaEntity.unit_number
  if (!unitNumber) return false
  const entry = global.entityByUnitNumber.get(unitNumber)
  if (entry) return true
  global.entityByUnitNumber.set(unitNumber, projectEntity)
  global.surfaceByUnitNumber.set(unitNumber, luaEntity.surface_index)
  script.register_on_entity_destroyed(luaEntity)
  return true
}

export function getRegisteredProjectEntity(entity: LuaEntity): ProjectEntity | nil {
  if (!entity.valid) return nil
  const unitNumber = entity.unit_number
  return unitNumber && global.entityByUnitNumber.get(unitNumber)
}
export function getRegisteredProjectEntityFromUnitNumber(unitNumber?: UnitNumber): ProjectEntity | nil {
  return unitNumber && global.entityByUnitNumber.get(unitNumber)
}
export function getStageFromUnitNumber(unitNumber?: UnitNumber): SurfaceIndex | nil {
  return unitNumber && global.surfaceByUnitNumber.get(unitNumber)
}
// detect when _we_ delete an entity; remove it
// this way event_handlers doesn't re-handle the entity deletion, causing a loop/other issues
Events.script_raised_destroy((e) => {
  if (e.mod_name != script.mod_name) return
  const eNumber = e.entity.unit_number
  if (eNumber) {
    global.entityByUnitNumber.delete(eNumber)
    global.surfaceByUnitNumber.delete(eNumber)
  }
})
Events.on_entity_destroyed((e) => {
  const eNumber = e.unit_number
  if (eNumber) {
    global.entityByUnitNumber.delete(eNumber)
    global.surfaceByUnitNumber.delete(eNumber)
  }
})
Migrations.since($CURRENT_VERSION, () => {
  global.surfaceByUnitNumber = new LuaMap()
})
Migrations.to($CURRENT_VERSION, () => {
  for (const [unitNumber, entity] of global.entityByUnitNumber) {
    for (const [key, value] of pairs<unknown>(entity)) {
      if (typeof key != "number") break
      if (
        type(value) == "table" &&
        (value as any).object_name == "LuaEntity" &&
        (value as LuaEntity).valid &&
        (value as LuaEntity).unit_number == unitNumber
      ) {
        global.surfaceByUnitNumber.set(unitNumber, (value as LuaEntity).surface_index)
      }
    }
  }
})
