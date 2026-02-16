// Copyright (c) 2024-2025 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { BlueprintEntity, BoundingBox, LuaInventory, LuaItemStack, LuaPlayer } from "factorio:runtime"
import { Entity } from "../entity/Entity"
import { serializeStageProperties, StageInfoExport, toExportStageDiffs } from "../import-export/entity"
import { isEmpty, Mutable } from "../lib"
import { Stage } from "../project/Project"

declare global {
  interface PlayerData {
    tempBpInventory?: LuaInventory
  }
}
declare const storage: StorageWithPlayer

export interface BpStagedInfoTags<E extends Entity = Entity> {
  bp100: StageInfoExport<E>
}

export function createBlueprintWithStageInfo(player: LuaPlayer, stage: Stage, area: BoundingBox): LuaItemStack | nil {
  const inventory = (storage.players[player.index].tempBpInventory ??= game.create_inventory(1))
  const stack = inventory[0]
  stack.clear()
  stack.set_stack("blueprint")

  const entityMapping = stack.create_blueprint({
    surface: stage.getSurface(),
    force: player.force_index,
    area,
  })
  if (isEmpty(entityMapping)) {
    stack.clear()
    return nil
  }
  const blueprintEntities = stack.get_blueprint_entities() as Mutable<BlueprintEntity>[]
  const content = stage.project.content
  const stageNumber = stage.stageNumber
  const wp = stage.project.worldPresentation

  for (const [number, luaEntity] of pairs(entityMapping)) {
    const projectEntity = content.findEntityExact(luaEntity, luaEntity.position, stageNumber, wp)
    if (!projectEntity) continue
    const info: StageInfoExport = {
      firstStage: projectEntity.firstStage,
      lastStage: projectEntity.lastStage,
    }
    const diffs = projectEntity.stageDiffs
    if (diffs) {
      info.firstValue = projectEntity.firstValue
      info.stageDiffs = toExportStageDiffs(diffs)
    }
    info.stageProperties = serializeStageProperties(projectEntity)
    blueprintEntities[number - 1].tags = { bp100: info } satisfies BpStagedInfoTags
  }

  stack.set_blueprint_entities(blueprintEntities)
  return stack
}

export const _mockable = true
