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

import { UserAssembly } from "../assembly/AssemblyDef"
import { AssemblyUpdater } from "../assembly/AssemblyUpdater"
import { getAllAssemblies } from "../assembly/migrations"
import { rollingStockTypes } from "../entity/entity-info"
import { WireHandler } from "../entity/WireHandler"
import { Events } from "../lib"
import { formatVersion, Migrations } from "../lib/migration"

Events.on_configuration_changed((data) => {
  const thisChange = data.mod_changes[script.mod_name]
  if (!thisChange) return
  const oldVersion = thisChange.old_version
  if (!oldVersion) return
  if (formatVersion(oldVersion) < formatVersion("0.2.0")) {
    return error(
      "Migrating from 0.1.0 is backwards incompatible. Try migrating to 0.2 first before the current version.",
    )
  }
  Migrations.doMigrations(oldVersion)
})

// global-data related migrations are done in other files
// this is for entity-related migrations

function migrateCables(assembly: UserAssembly): void {
  const { saveWireConnections, updateWireConnections } = WireHandler
  const lastStageNum = assembly.maxStage()

  const content = assembly.content
  for (const entity of content.iterateAllEntities()) {
    saveWireConnections(content, entity, lastStageNum, lastStageNum)
  }
  for (const i of $range(1, lastStageNum)) {
    for (const entity of content.iterateAllEntities()) {
      updateWireConnections(content, entity, i)
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

Migrations.to("0.4.0", () => {
  log("Finding and adding trains to assemblies")
  let anyRollingStock = false
  for (const [, assembly] of getAllAssemblies()) {
    for (const stage of assembly.getAllStages()) {
      const surface = stage.surface
      if (!surface.valid) return
      if (surface.valid) surface.show_clouds = false

      const rollingStock = surface.find_entities_filtered({
        type: Object.keys(rollingStockTypes),
      })
      if (rollingStock.length > 0) anyRollingStock = true
      for (const luaEntity of rollingStock) {
        AssemblyUpdater.addNewEntity(assembly, luaEntity, stage.stageNumber)
      }
    }
  }
  log("Done adding trains")
  if (anyRollingStock) {
    game.print(
      "100% Blueprint Planning: Train entities are supported since v0.4.0. Trains were found and added to your assemblies.",
    )
  }
})
