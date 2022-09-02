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

import "../assembly/EntityMap"
import { getAllAssemblies } from "../assembly/global"
import { DefaultWireHandler } from "../assembly/WireHandler"
import { Migrations } from "../lib/migration"

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
    log("   Updating assembly " + assembly.name.get())
    migrateCables(assembly)
  }
  log("Done migrating copper cable connections")

  game.print(
    "100% Blueprint Planning:\nCopper cable connections support added since v0.3.0. " +
      "Cable connections have been saved based on the [font=default-large-bold]last stage[/font] of each assembly. ",
  )
})
