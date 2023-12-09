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

import { getEntityPrototypeInfo } from "../entity/entity-prototype-info"
import { _migrateProjectContent_0_18_0 } from "../entity/ProjectContent"
import { _migrateEntity_0_17_0, StageNumber } from "../entity/ProjectEntity"
import { Migrations } from "../lib/migration"
import { updateAllHighlights } from "./entity-highlights"
import { UserProject } from "./ProjectDef"

declare const global: {
  projects: LuaMap<number, UserProject>
}

// Many classes don't know about where they are used; so this file is needed to call their migrations, from global

Migrations.to("0.14.0", () => {
  for (const [, project] of global.projects) {
    for (const entity of project.content.iterateAllEntities()) {
      interface OldProjectEntity {
        oldStage?: StageNumber
      }
      delete (entity as unknown as OldProjectEntity).oldStage
    }
  }
})

Migrations.to("0.14.3", () => {
  for (const [, project] of global.projects) {
    for (const entity of project.content.iterateAllEntities()) {
      // re-generate previews, if not existing
      if (entity.isRollingStock()) {
        project.entityUpdates.updateWorldEntities(project, entity, 1)
      }
    }
  }
})

Migrations.early("0.17.0", () => {
  for (const [, project] of global.projects) {
    for (const entity of project.content.iterateAllEntities()) {
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
    for (const entity of project.content.iterateAllEntities()) {
      if (entity.isRollingStock()) {
        entity.setLastStageUnchecked(entity.firstStage)
        project.entityUpdates.updateWorldEntitiesOnLastStageChanged(project, entity, nil)
      }
    }
  }
})

Migrations.to("0.20.0", () => {
  // update all power switches
  const nameToType = getEntityPrototypeInfo().nameToType
  for (const [, project] of global.projects) {
    for (const entity of project.content.iterateAllEntities()) {
      if (nameToType.get(entity.firstValue.name) == "power-switch") {
        project.updates.updateWiresFromWorld(entity, project.lastStageFor(entity))
      }
    }
  }
})

Migrations.priority(7, "0.22.0", () => {
  for (const [, project] of global.projects) {
    for (const entity of project.content.iterateAllEntities()) {
      entity.direction ??= 0
    }
  }
})

Migrations.to("0.23.1", () => {
  for (const [, project] of global.projects) {
    for (const entity of project.content.iterateAllEntities()) {
      if (entity.hasStageDiff() || entity.lastStage != nil) {
        updateAllHighlights(project, entity)
      }
    }
  }
})
