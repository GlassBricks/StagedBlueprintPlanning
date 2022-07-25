/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of BBPP3.
 *
 * BBPP3 is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * BBPP3 is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with Foobar. If not, see <https://www.gnu.org/licenses/>.
 */

import { isWorldEntityAssemblyEntity } from "../entity/AssemblyEntity"
import { Events } from "../lib"
import { AssemblyUpdater } from "./AssemblyUpdater"
import { getLayerAtPosition } from "./world-register"

function onEntityCreated(entity: LuaEntity): void {
  if (!isWorldEntityAssemblyEntity(entity)) return
  const layer = getLayerAtPosition(entity.surface, entity.position)
  if (!layer || !layer.valid) return
  AssemblyUpdater.onEntityCreated(layer.assembly, entity, layer)
}
Events.on_built_entity((e) => onEntityCreated(e.created_entity))
Events.script_raised_built((e) => onEntityCreated(e.entity))
// todo: handle ghosts and deconstruction and stuff

function onEntityDeleted(entity: LuaEntity): void {
  if (!isWorldEntityAssemblyEntity(entity)) return
  const layer = getLayerAtPosition(entity.surface, entity.position)
  if (!layer || !layer.valid) return
  AssemblyUpdater.onEntityDeleted(layer.assembly, entity, layer)
}

Events.on_player_mined_entity((e) => onEntityDeleted(e.entity))
Events.on_entity_died((e) => onEntityDeleted(e.entity))
Events.script_raised_destroy((e) => onEntityDeleted(e.entity))
