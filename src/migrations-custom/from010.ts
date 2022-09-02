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

import { Assembly, AssemblyId } from "../assembly/AssemblyDef"
import { AssemblyOperations } from "../assembly/AssemblyOperations"
import { destroyAllRenders, Events } from "../lib"

declare let global: {
  assemblies?: LuaMap<AssemblyId, Assembly>
  bpSurfaces?: Record<number, LuaSurface>
}
export default function from010(): void {
  log("Migrating from 0.1.0 (backwards incompatible). Completely removing old data and reinitializing mod")

  destroyAllRenders()

  // clean old assemblies
  const assemblies = global.assemblies
  if (assemblies) {
    for (const [, assembly] of assemblies) {
      AssemblyOperations.deleteAllExtraEntitiesOnly(assembly)
    }
  }
  // rename old surfaces
  const bpSurfaces = global.bpSurfaces
  if (bpSurfaces) {
    for (const [, surface] of pairs(bpSurfaces)) {
      if (surface.name.startsWith("bp100-stage-")) {
        surface.name = "old-" + surface.name
      }
    }
  }
  // remove script inventories
  const inventories = game.get_script_inventories(script.mod_name)[script.mod_name]
  inventories?.forEach((x) => x.destroy())

  // remove gui elements
  for (const [, player] of game.players) {
    const { screen, left, top, center } = player.gui
    for (const gui of [screen, left, top, center]) {
      for (const child of gui.children) {
        if (child.get_mod() === script.mod_name) child.destroy()
      }
    }
  }

  // reinit
  global = {}
  Events.raiseFakeEventNamed("on_init", nil!)

  log("Migration complete")
  game.print(
    "100% Blueprint Planning v0.1.0 is incompatible with later versions. All assemblies have been removed. " +
      'Previous assembly entities can be found on surfaces "old-bp100-stage-*".',
  )
}
