/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of BBPP3.
 *
 * BBPP3 is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * BBPP3 is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with BBPP3. If not, see <https://www.gnu.org/licenses/>.
 */

import { Layer } from "../assembly/AssemblyDef"
import { getLayerAtPosition } from "../assembly/world-register"
import { CustomInputs, Prototypes, Settings } from "../constants"
import { AssemblyEntity, isNotableLayer, LayerNumber } from "../entity/AssemblyEntity"
import { getLayerPosition } from "../entity/EntityHandler"
import { ProtectedEvents } from "../lib/ProtectedEvents"
import { L_Interaction } from "../locale"
import { playerCurrentLayer, teleportToLayer } from "./player-position"

const Events = ProtectedEvents

function playErrorSound(player: LuaPlayer) {
  player.play_sound({ path: "utility/cannot_build" })
}
function notifyError(player: LuaPlayer, message: LocalisedString) {
  playErrorSound(player)
  player.create_local_flying_text({
    text: message,
    create_at_cursor: true,
  })
}

Events.on(CustomInputs.NextLayer, (e) => {
  const player = game.get_player(e.player_index)!
  const layer = playerCurrentLayer(e.player_index).get()
  if (!layer) {
    return notifyError(player, [L_Interaction.PlayerNotInAssembly])
  }
  const nextLayerNum = layer.layerNumber + 1
  let toLayer = layer.assembly.getLayer(nextLayerNum)
  if (!toLayer) {
    if (player.mod_settings[Settings.CyclicNavigation].value) {
      toLayer = layer.assembly.getLayer(1)!
    } else {
      return notifyError(player, [L_Interaction.NoPreviousLayer])
    }
  }
  teleportToLayer(player, toLayer)
})

Events.on(CustomInputs.PreviousLayer, (e) => {
  const player = game.get_player(e.player_index)!
  const layer = playerCurrentLayer(e.player_index).get()
  if (!layer) {
    return notifyError(player, [L_Interaction.PlayerNotInAssembly])
  }
  const prevLayerNum = layer.layerNumber - 1
  let toLayer = layer.assembly.getLayer(prevLayerNum)
  if (!toLayer) {
    if (player.mod_settings[Settings.CyclicNavigation].value) {
      toLayer = layer.assembly.getLayer(layer.assembly.numLayers())!
    } else {
      return notifyError(player, [L_Interaction.NoPreviousLayer])
    }
  }
  teleportToLayer(player, toLayer)
})
function getAssemblyEntityOfEntity(entity: LuaEntity): LuaMultiReturn<[Layer, AssemblyEntity] | [_?: nil]> {
  const [assembly, layer] = getLayerAtPosition(entity.surface, entity.position)
  if (!assembly) return $multi()
  const entityName = entity.name.startsWith(Prototypes.PreviewEntityPrefix)
    ? entity.name.substring(Prototypes.PreviewEntityPrefix.length)
    : entity.name
  const found = assembly.content.findCompatible(entityName, getLayerPosition(layer, entity), entity.direction)
  if (found) return $multi(layer, found)
  return $multi()
}

Events.on(CustomInputs.GoToBaseLayer, (e) => {
  const player = game.get_player(e.player_index)!
  const entity = player.selected
  if (!entity) return
  const [layer, assemblyEntity] = getAssemblyEntityOfEntity(entity)
  if (!assemblyEntity) {
    return notifyError(player, [L_Interaction.EntityNotInAssembly])
  }
  const baseLayerNum = assemblyEntity.getBaseLayer()
  const currentLayer = layer!.layerNumber
  if (baseLayerNum === currentLayer) {
    return notifyError(player, [L_Interaction.AlreadyAtBaseLayer])
  }
  const baseLayer = layer!.assembly.getLayer(baseLayerNum)
  assert(baseLayer, "Base layer not found")
  teleportToLayer(player, baseLayer!)
})

function getNextNotableLayer(layer: Layer, entity: AssemblyEntity): LayerNumber {
  const numLayers = layer.assembly.numLayers()
  const currentLayerNum = layer.layerNumber
  for (let i = 0; i < numLayers - 1; i++) {
    const testLayer = ((currentLayerNum + i) % numLayers) + 1
    if (isNotableLayer(entity, testLayer)) return testLayer
  }
  return currentLayerNum
}

Events.on(CustomInputs.GoToNextNotableLayer, (e) => {
  const player = game.get_player(e.player_index)!
  const entity = player.selected
  if (!entity) return
  const [layer, assemblyEntity] = getAssemblyEntityOfEntity(entity)
  if (!assemblyEntity) {
    return notifyError(player, [L_Interaction.EntityNotInAssembly])
  }
  const nextNotableLayerNum = getNextNotableLayer(layer!, assemblyEntity)
  if (nextNotableLayerNum === layer!.layerNumber) {
    return notifyError(player, [L_Interaction.EntitySameInAllLayers])
  }

  const nextNotableLayer = layer!.assembly.getLayer(nextNotableLayerNum)
  assert(nextNotableLayer, "layer not found")
  teleportToLayer(player, nextNotableLayer!)
})
