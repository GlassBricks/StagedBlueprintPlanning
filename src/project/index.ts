// Copyright (c) 2022-2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { SignalID } from "factorio:runtime"
import {
  BlueprintSettingsOverrideTable,
  BlueprintSettingsTable,
  BlueprintTakeSettings,
  createStageBlueprintSettingsTable,
  iconNumbers,
} from "../blueprints/blueprint-settings"
import { newMap2d } from "../entity/map2d"
import { StageNumber } from "../entity/ProjectEntity"
import { createProjectTile } from "../tiles/ProjectTile"
import { Mutable, PRecord, property } from "../lib"
import { WorldPresentation } from "./WorldPresentation"
import { Position } from "../lib/geometry"
import { Migrations } from "../lib/migration"
import { getNilPlaceholder } from "../utils/diff-value"
import "./event-handlers"
import "./project-event-listener"
import { getDefaultSurfaceSettings, readSurfaceSettings, updateStageSurfaceName } from "./surfaces"
import "./UserProject"
import { getAllProjects, StageInternal, UserProjectInternal } from "./UserProject"

Migrations.to("2.2.0", () => {
  for (const project of getAllProjects()) {
    for (const entity of project.content.allEntities()) {
      if (entity.isMovable()) {
        const oldLastStage = entity.lastStage
        if (oldLastStage != entity.firstStage) {
          entity.setLastStageUnchecked(entity.firstStage)
          project.worldUpdates.updateWorldEntitiesOnLastStageChanged(entity, oldLastStage)
          project.updates.resetVehicleLocation(entity)
        }
      }
    }
    for (const stage of project.getAllStages()) {
      stage.surface.ignore_surface_conditions = true
    }
  }
})

Migrations.to("2.4.0", () => {
  interface OldStage {
    stageBlueprintSettings?: BlueprintSettingsOverrideTable
  }
  for (const project of getAllProjects()) {
    for (const stage of project.getAllStages()) {
      const oldStage = stage as unknown as OldStage
      const stageSettings = stage.getSettings()
      assume<Mutable<typeof stageSettings>>(stageSettings)
      stageSettings.blueprintOverrideSettings = oldStage.stageBlueprintSettings!
      delete oldStage.stageBlueprintSettings
      stageSettings.stageBlueprintSettings = createStageBlueprintSettingsTable()
    }
  }
})

interface OldBlueprintSettings {
  1: SignalID | nil
  2: SignalID | nil
  3: SignalID | nil
  4: SignalID | nil
}
Migrations.to("2.5.2", () => {
  for (const project of getAllProjects()) {
    const projectBpSettings = project.settings.defaultBlueprintSettings
    function migrateIconNumbers(table: Record<keyof BlueprintTakeSettings, unknown>) {
      assume<Mutable<OldBlueprintSettings>>(table)
      for (const number of iconNumbers) {
        table[`icon${number}`] = table[number] || table[tostring(number) as "1" | "2" | "3" | "4"]
      }
    }
    migrateIconNumbers(projectBpSettings)
    for (const stage of project.getAllStages()) {
      migrateIconNumbers(stage.getSettings().blueprintOverrideSettings)
    }
  }
})
Migrations.to("2.6.4", () => {
  for (const project of getAllProjects()) {
    const projectBpSettings = project.settings.defaultBlueprintSettings
    function deleteOldNumberKeys(table: Record<string, unknown>) {
      assume<Mutable<OldBlueprintSettings>>(table)
      for (const number of iconNumbers) {
        delete table[number]
        delete table[tostring(number) as "1" | "2" | "3" | "4"]
      }
    }
    deleteOldNumberKeys(projectBpSettings)
    for (const stage of project.getAllStages()) {
      deleteOldNumberKeys(stage.getSettings().blueprintOverrideSettings)
    }
  }
})

interface OldProjectTile {
  firstStage: StageNumber
  firstValue: string
  stageDiffs?: PRecord<StageNumber, string>
  lastStage: StageNumber | nil
  position: Position
}

Migrations.to("2.8.0", () => {
  for (const project of getAllProjects()) {
    ;(project as UserProjectInternal).registerEvents()
    for (const stage of project.getAllStages()) {
      ;(stage as StageInternal).registerEvents()
      updateStageSurfaceName(stage.surface, project.settings.projectName.get(), stage.getSettings().name.get())
    }

    const settings = readSurfaceSettings(project.getStage(1)!.surface)
    project.settings.surfaceSettings = { ...getDefaultSurfaceSettings(), ...settings }

    // Migrate tiles from old format to new sparse array format
    const tilesToMigrate: OldProjectTile[] = []

    for (const [, row] of pairs<PRecord<number, PRecord<number, unknown>>>(project.content.tiles)) {
      for (const [, tile] of pairs(row)) {
        const old = tile as unknown as OldProjectTile
        tilesToMigrate.push(old)
      }
    }
    project.content.tiles = newMap2d()

    for (const old of tilesToMigrate) {
      const newTile = createProjectTile()
      const position = old.position

      newTile.values[old.firstStage] = old.firstValue

      if (old.stageDiffs) {
        for (const [stage, value] of pairs(old.stageDiffs)) {
          newTile.values[stage] = value
        }
      }

      if (old.lastStage != nil) {
        newTile.values[old.lastStage + 1] = getNilPlaceholder()
      }

      project.content.setTile(position, newTile)
    }
  }
})

Migrations.to("2.8.4", () => {
  for (const project of getAllProjects()) {
    for (const stage of project.getAllStages()) {
      game.forces.player.set_surface_hidden(stage.surface, true)
    }
  }
})

Migrations.to("2.12.0", () => {
  for (const project of getAllProjects()) {
    assume<Mutable<BlueprintSettingsTable>>(project.settings.defaultBlueprintSettings)
    project.settings.defaultBlueprintSettings.customBlueprintName = property(nil)

    for (const stage of project.getAllStages()) {
      const overrideSettings = stage.getSettings().blueprintOverrideSettings
      assume<Mutable<BlueprintSettingsOverrideTable>>(overrideSettings)
      overrideSettings.customBlueprintName = property(nil)
    }
  }
})

Migrations.to($CURRENT_VERSION, () => {
  for (const project of getAllProjects()) {
    const p = project as unknown as Record<string, unknown>
    delete p.worldUpdates
    if (!p._worldPresentation) {
      p._worldPresentation = new WorldPresentation(project)
    }
  }
})
