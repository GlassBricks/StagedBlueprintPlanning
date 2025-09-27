// Copyright (c) 2022-2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { SignalID } from "factorio:runtime"
import {
  BlueprintSettingsOverrideTable,
  BlueprintTakeSettings,
  createStageBlueprintSettingsTable,
  iconNumbers,
} from "../blueprints/blueprint-settings"
import { Mutable } from "../lib"
import { Migrations } from "../lib/migration"
import "./event-handlers"
import "./project-event-listener"
import { Stage } from "./ProjectDef"
import "./UserProject"
import { getAllProjects } from "./UserProject"

Migrations.to("2.2.0", () => {
  for (const project of getAllProjects()) {
    for (const entity of project.content.allEntities()) {
      if (entity.isMovable()) {
        const oldLastStage = entity.lastStage
        if (oldLastStage != entity.firstStage) {
          entity.setLastStageUnchecked(entity.firstStage)
          project.worldUpdates.updateWorldEntitiesOnLastStageChanged(entity, oldLastStage)
          project.updates.resetTrain(entity)
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
      assume<Mutable<Stage>>(stage)
      stage.blueprintOverrideSettings = oldStage.stageBlueprintSettings!
      delete oldStage.stageBlueprintSettings
      stage.stageBlueprintSettings = createStageBlueprintSettingsTable()
    }
  }
})

Migrations.to("2.5.2", () => {
  interface OldBlueprintSettings {
    1: SignalID | nil
    2: SignalID | nil
    3: SignalID | nil
    4: SignalID | nil
  }
  for (const project of getAllProjects()) {
    const projectBpSettings = project.defaultBlueprintSettings
    function migrateIconNumbers(table: Record<keyof BlueprintTakeSettings, unknown>) {
      assume<Mutable<OldBlueprintSettings>>(table)
      for (const number of iconNumbers) {
        table[`icon${number}`] = table[number] || table[tostring(number) as "1" | "2" | "3" | "4"]
      }
    }
    migrateIconNumbers(projectBpSettings)
    for (const stage of project.getAllStages()) {
      migrateIconNumbers(stage.blueprintOverrideSettings)
    }
  }
})
