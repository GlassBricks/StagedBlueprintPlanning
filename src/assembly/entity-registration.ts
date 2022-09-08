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

import type { AssemblyEntity } from "../entity/AssemblyEntity"
import { Events } from "../lib"
import { Migrations } from "../lib/migration"

declare const global: {
  entityByUnitNumber: LuaMap<UnitNumber, AssemblyEntity>
}

Migrations.since("0.4.0", () => {
  global.entityByUnitNumber = new LuaMap()
})

/** Currently only used for rolling stock (train) entities. */
export function registerEntity(luaEntity: LuaEntity, assemblyEntity: AssemblyEntity): boolean {
  if (!luaEntity.valid) return false
  const unitNumber = luaEntity.unit_number
  if (!unitNumber) return false
  const entry = global.entityByUnitNumber.get(unitNumber)
  if (entry) return true
  global.entityByUnitNumber.set(unitNumber, assemblyEntity)
  script.register_on_entity_destroyed(luaEntity)
  return true
}

export function getRegisteredAssemblyEntity(entity: LuaEntity): AssemblyEntity | nil {
  if (!entity.valid) return nil
  const unitNumber = entity.unit_number
  return unitNumber && global.entityByUnitNumber.get(unitNumber)
}

export function _clearUnitNumber(unitNumber: number): void {
  global.entityByUnitNumber.delete(unitNumber as UnitNumber)
}

Events.on_entity_destroyed((e) => {
  const eNumber = e.unit_number
  if (eNumber) global.entityByUnitNumber.delete(eNumber)
})
