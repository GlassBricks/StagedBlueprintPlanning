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

import { PlayerChangedStageEvent } from "./player-current-stage"
import { getAssemblyEntityOfEntity } from "./world-entities"

PlayerChangedStageEvent.addListener((player, stage) => {
  const entity = player.opened
  if (!entity || entity.object_name !== "LuaEntity") return

  const [oldStage, assemblyEntity] = getAssemblyEntityOfEntity(entity)
  if (!oldStage || oldStage === stage) return
  if (stage === nil || oldStage.assembly !== stage.assembly) {
    player.opened = nil
    return
  }

  const otherEntity =
    assemblyEntity.getWorldEntity(stage.stageNumber) ??
    assemblyEntity.getWorldEntity(stage.stageNumber, "previewEntity")
  player.opened = otherEntity
})
