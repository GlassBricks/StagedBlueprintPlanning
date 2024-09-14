/*
 * Copyright (c) 2024 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { getAllProjects } from "../project/UserProject"

commands.add_command(
  "clean-broken-entities",
  "Staged Blueprint Planning: remove broken entities from all projects. Entities that are broken in their first stage are removed.",
  () => {
    let numDeleted = 0
    for (const project of getAllProjects()) {
      for (const entity of project.content.allEntities()) {
        const broken = entity.getWorldEntity(entity.firstStage) == nil
        if (broken) {
          project.updates.forceDeleteEntity(entity)
          numDeleted++
        }
      }
    }
    game.print(`Deleted ${numDeleted} broken entities.`)
  },
)
