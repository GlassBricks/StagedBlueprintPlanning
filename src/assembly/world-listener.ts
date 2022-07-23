import { isWorldEntityAssemblyEntity } from "../entity/AssemblyEntity"
import { Events } from "../lib"
import { Layer } from "./Assembly"
import { AssemblyUpdater } from "./AssemblyUpdater"
import { getLayerAtPosition } from "./world-register"

function onEntityCreated(entity: LuaEntity): void {
  if (!isWorldEntityAssemblyEntity(entity)) return
  const layer = getLayerAtPosition(entity.surface, entity.position)
  if (!layer) return
  const assembly = (layer as Layer).assembly
  if (assembly) AssemblyUpdater.onEntityCreated(assembly, entity, layer)
}
Events.on_built_entity((e) => onEntityCreated(e.created_entity))
Events.script_raised_built((e) => onEntityCreated(e.entity))
// todo: handle ghosts and deconstruction and stuff

function onEntityDeleted(entity: LuaEntity): void {
  if (!isWorldEntityAssemblyEntity(entity)) return
  const layer = getLayerAtPosition(entity.surface, entity.position)
  if (!layer) return
  const assembly = (layer as Layer).assembly
  if (assembly) AssemblyUpdater.onEntityDeleted(assembly, entity, layer)
}

Events.on_player_mined_entity((e) => onEntityDeleted(e.entity))
Events.on_entity_died((e) => onEntityDeleted(e.entity))
Events.script_raised_destroy((e) => onEntityDeleted(e.entity))
