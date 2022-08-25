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

/**
 * This file handles player navigation.
 * For assembly editing, see assembly/world-listener.ts.
 */

import { Stage } from "../assembly/AssemblyDef"
import { getStageAtPosition } from "../assembly/world-register"
import { CustomInputs, Prototypes, Settings } from "../constants"
import { AssemblyEntity, isNotableStage, StageNumber } from "../entity/AssemblyEntity"
import { getStagePosition } from "../entity/EntityHandler"
import { ProtectedEvents } from "../lib/ProtectedEvents"
import { L_Interaction } from "../locale"
import { playerCurrentStage, teleportToStage } from "./player-position"

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

Events.on(CustomInputs.NextStage, (e) => {
  const player = game.get_player(e.player_index)!
  const stage = playerCurrentStage(e.player_index).get()
  if (!stage) {
    return notifyError(player, [L_Interaction.PlayerNotInAssembly])
  }
  const nextStageNum = stage.stageNumber + 1
  let toStage = stage.assembly.getStage(nextStageNum)
  if (!toStage) {
    if (player.mod_settings[Settings.CyclicNavigation].value) {
      toStage = stage.assembly.getStage(1)!
    } else {
      return notifyError(player, [L_Interaction.NoPreviousStage])
    }
  }
  teleportToStage(player, toStage)
})

Events.on(CustomInputs.PreviousStage, (e) => {
  const player = game.get_player(e.player_index)!
  const stage = playerCurrentStage(e.player_index).get()
  if (!stage) {
    return notifyError(player, [L_Interaction.PlayerNotInAssembly])
  }
  const prevStageNum = stage.stageNumber - 1
  let toStage = stage.assembly.getStage(prevStageNum)
  if (!toStage) {
    if (player.mod_settings[Settings.CyclicNavigation].value) {
      toStage = stage.assembly.getStage(stage.assembly.numStages())!
    } else {
      return notifyError(player, [L_Interaction.NoPreviousStage])
    }
  }
  teleportToStage(player, toStage)
})
function getAssemblyEntityOfEntity(entity: LuaEntity): LuaMultiReturn<[Stage, AssemblyEntity] | [_?: nil]> {
  const [assembly, stage] = getStageAtPosition(entity.surface, entity.position)
  if (!assembly) return $multi()
  const position = getStagePosition(stage, entity)
  const name = entity.name
  const actualName = name.startsWith(Prototypes.PreviewEntityPrefix)
    ? name.substring(Prototypes.PreviewEntityPrefix.length)
    : name
  const found = assembly.content.findCompatibleAnyDirection(actualName, position)
  if (found) return $multi(stage, found)
  return $multi()
}

Events.on(CustomInputs.GoToFirstStage, (e) => {
  const player = game.get_player(e.player_index)!
  const entity = player.selected
  if (!entity) return
  const [stage, assemblyEntity] = getAssemblyEntityOfEntity(entity)
  if (!assemblyEntity) {
    return notifyError(player, [L_Interaction.EntityNotInAssembly])
  }
  const firstStageNum = assemblyEntity.getFirstStage()
  const currentStage = stage!.stageNumber
  if (firstStageNum === currentStage) {
    return notifyError(player, [L_Interaction.AlreadyAtFirstStage])
  }
  const firstStage = stage!.assembly.getStage(firstStageNum)
  assert(firstStage, "First stage not found")
  teleportToStage(player, firstStage!)
})

function getNextNotableStage(stage: Stage, entity: AssemblyEntity): StageNumber {
  const numStages = stage.assembly.numStages()
  const currentStageNum = stage.stageNumber
  for (let i = 0; i < numStages - 1; i++) {
    const testStage = ((currentStageNum + i) % numStages) + 1
    if (isNotableStage(entity, testStage)) return testStage
  }
  return currentStageNum
}

Events.on(CustomInputs.GoToNextNotableStage, (e) => {
  const player = game.get_player(e.player_index)!
  const entity = player.selected
  if (!entity) return
  const [stage, assemblyEntity] = getAssemblyEntityOfEntity(entity)
  if (!assemblyEntity) {
    return notifyError(player, [L_Interaction.EntityNotInAssembly])
  }
  const nextNotableStageNum = getNextNotableStage(stage!, assemblyEntity)
  if (nextNotableStageNum === stage!.stageNumber) {
    return notifyError(player, [L_Interaction.EntitySameInAllStages])
  }

  const nextNotableStage = stage!.assembly.getStage(nextNotableStageNum)
  assert(nextNotableStage, "stage not found")
  teleportToStage(player, nextNotableStage!)
})
