// Copyright (c) 2024 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

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
