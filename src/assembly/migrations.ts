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

import { StageNumber } from "../entity/AssemblyEntity"
import { Migrations } from "../lib/migration"
import { UserAssembly } from "./AssemblyDef"

declare const global: {
  assemblies: LuaMap<number, UserAssembly>
}

export function getAssembliesForMigration(): ReadonlyLuaMap<number, UserAssembly> {
  return global.assemblies
}

// Many classes don't know about where they are used; so this file is needed to call their migrations, from global

Migrations.to("0.14.0", () => {
  for (const [, assembly] of getAssembliesForMigration()) {
    for (const entity of assembly.content.iterateAllEntities()) {
      interface OldAssemblyEntity {
        oldStage?: StageNumber
      }
      delete (entity as unknown as OldAssemblyEntity).oldStage
    }
  }
})
