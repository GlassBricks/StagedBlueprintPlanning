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

import { Assembly } from "../assembly/AssemblyDef"
import { getAllAssemblies } from "../assembly/global"
import { DefaultWireHandler } from "../assembly/WireHandler"
import { _migrate031 } from "../entity/AssemblyEntity"
import { Events } from "../lib"
import { formatVersion, Migrations } from "../lib/migration"

import from010 from "./from010"

Events.on_configuration_changed((data) => {
  const thisChange = data.mod_changes[script.mod_name]
  if (!thisChange) return
  const oldVersion = thisChange.old_version
  if (!oldVersion) return
  if (formatVersion(oldVersion) < formatVersion("0.2.0")) {
    return from010()
  }
  Migrations.doMigrations(oldVersion)
})

function migrateCables(assembly: Assembly): void {
  const { saveWireConnections, updateWireConnections } = DefaultWireHandler
  const lastStageNum = assembly.numStages()

  for (const entity of assembly.content.iterateAllEntities()) {
    saveWireConnections(assembly, entity, lastStageNum)
  }
  for (const i of $range(1, lastStageNum)) {
    for (const entity of assembly.content.iterateAllEntities()) {
      updateWireConnections(assembly, entity, i)
    }
  }
}

Migrations.to("0.3.0", () => {
  log("Migrating copper cable connections. This may take a while")
  for (const [, assembly] of getAllAssemblies()) {
    log("   Updating assembly " + assembly.displayName.get())
    migrateCables(assembly)
  }
  log("Done migrating copper cable connections")

  game.print(
    "100% Blueprint Planning:\nCopper cable connections support added since v0.3.0. " +
      "Cable connections have been saved based on the [font=default-large-bold]last stage[/font] of each assembly. ",
  )
})

Migrations.to("0.3.1", () => {
  // remove empty stageDiffs props from all AssemblyEntities
  for (const [, assembly] of getAllAssemblies()) {
    for (const entity of assembly.content.iterateAllEntities()) {
      _migrate031(entity)
    }
  }
})
