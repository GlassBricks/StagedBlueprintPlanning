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

import { _migrate031, _migrate060, StageNumber } from "../entity/AssemblyEntity"
import { migrateMap030, migrateMap060 } from "../entity/EntityMap"
import { Migrations } from "../lib/migration"
import { AssemblyId, UserAssembly } from "./AssemblyDef"
import { _migrate0131 } from "./edit-blueprint-settings"

declare const global: {
  assemblies: LuaMap<AssemblyId, UserAssembly>
}

export function getAllAssemblies(): ReadonlyLuaMap<AssemblyId, UserAssembly> {
  return global.assemblies
}

// Many classes don't know about where they are used; so this file is needed to call their migrations, from global

Migrations.to("0.3.0", () => {
  for (const [, assembly] of getAllAssemblies()) {
    // see also: migrations-custom/cable
    migrateMap030(assembly.content)
  }
})

Migrations.to("0.3.1", () => {
  // remove empty stageDiffs props from all AssemblyEntities
  for (const [, assembly] of getAllAssemblies()) {
    for (const entity of assembly.content.iterateAllEntities()) {
      _migrate031(entity)
    }
  }
})

Migrations.to("0.6.0", () => {
  for (const [, assembly] of getAllAssemblies()) {
    migrateMap060(assembly.content)
    for (const entity of assembly.content.iterateAllEntities()) {
      _migrate060(entity)
    }
  }
})

// migration 0.8.0, same as 0.14.0 (remove oldStage), done again

Migrations.to("0.13.0", () => {
  for (const [, assembly] of getAllAssemblies()) {
    _migrate0131(assembly.assemblyBlueprintSettings)
  }
})

Migrations.to("0.14.0", () => {
  for (const [, assembly] of getAllAssemblies()) {
    for (const entity of assembly.content.iterateAllEntities()) {
      interface OldAssemblyEntity {
        oldStage?: StageNumber
      }
      delete (entity as unknown as OldAssemblyEntity).oldStage
    }
  }
})
