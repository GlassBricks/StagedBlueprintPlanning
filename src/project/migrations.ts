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

import { _migrateAddTiles, _migrateProjectContent_0_18_0, _migrateWireConnections } from "../entity/ProjectContent"
import { _migrateEntity_0_17_0, StageNumber } from "../entity/ProjectEntity"
import { getPrototypeInfo } from "../entity/prototype-info"
import { Migrations } from "../lib/migration"
import { UserProject } from "./ProjectDef"

declare const global: {
  projects: LuaMap<number, UserProject>
}

// Many classes don't know about where they are used; so this file is needed to call their migrations, from global

Migrations.to("0.14.0", () => {
  for (const [, project] of global.projects) {
    for (const entity of project.content.allEntities()) {
      interface OldProjectEntity {
        oldStage?: StageNumber
      }
      delete (entity as unknown as OldProjectEntity).oldStage
    }
  }
})

Migrations.to("0.14.3", () => {
  for (const [, project] of global.projects) {
    for (const entity of project.content.allEntities()) {
      // re-generate previews, if not existing
      if (entity.isRollingStock()) {
        project.worldUpdates.updateWorldEntities(entity, 1)
      }
    }
  }
})

Migrations.priority(7, "0.22.0", () => {
  for (const [, project] of global.projects) {
    for (const entity of project.content.allEntities()) {
      entity.direction ??= 0
    }
  }
})
Migrations.priority(7, "0.28.0", () => {
  for (const [, project] of global.projects) {
    _migrateWireConnections(project.content)
  }
})

Migrations.early("0.17.0", () => {
  for (const [, project] of global.projects) {
    for (const entity of project.content.allEntities()) {
      _migrateEntity_0_17_0(entity)
    }
  }
})

Migrations.early("0.18.0", () => {
  for (const [, project] of global.projects) {
    _migrateProjectContent_0_18_0(project.content)
  }
})

Migrations.to("0.18.0", () => {
  for (const [, project] of global.projects) {
    for (const entity of project.content.allEntities()) {
      if (entity.isRollingStock()) {
        entity.setLastStageUnchecked(entity.firstStage)
        project.worldUpdates.updateWorldEntitiesOnLastStageChanged(entity, nil)
      }
    }
  }
})

Migrations.to("0.20.0", () => {
  // update all power switches
  const nameToType = getPrototypeInfo().nameToType
  for (const [, project] of global.projects) {
    for (const entity of project.content.allEntities()) {
      if (nameToType.get(entity.firstValue.name) == "power-switch") {
        project.updates.updateWiresFromWorld(entity, project.lastStageFor(entity))
      }
    }
  }
})

Migrations.to("0.23.1", () => {
  for (const [, project] of global.projects) {
    for (const entity of project.content.allEntities()) {
      if (entity.hasStageDiff() || entity.lastStage != nil) {
        project.worldUpdates.updateAllHighlights(entity)
      }
    }
  }
})
Migrations.to("0.31.0", () => {
  for (const [, project] of global.projects) {
    _migrateAddTiles(project.content)
  }
})
