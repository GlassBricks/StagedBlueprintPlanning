/*
 * Copyright (c) 2022-2023 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

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
      if (entity.isRollingStock()) {
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

Migrations.to($CURRENT_VERSION, () => {
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
