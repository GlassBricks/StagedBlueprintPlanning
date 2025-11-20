// Copyright (c) 2022-2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { assertNever } from "../lib"
import { UserProject } from "./ProjectDef"
import { ProjectEvents } from "./UserProject"

function initSpacePlatform(project: UserProject) {
  for (const stage of project.getAllStages()) {
    const surface = stage.surface
    for (const hub of surface.find_entities_filtered({ type: "space-platform-hub" })) {
      project.actions.rebuildEntity(hub, stage.stageNumber)
    }
  }

  const firstStage = project.getStage(1)!
  const tiles = firstStage.surface.find_tiles_filtered({ name: "space-platform-foundation" })
  for (const tile of tiles) {
    project.actions.onTileBuilt(tile.position, tile.name, 1)
  }
}

ProjectEvents.addListener((e) => {
  switch (e.type) {
    case "stage-added": {
      if (e.spacePlatformHub) {
        e.project.actions.rebuildEntity(e.spacePlatformHub, e.stage.stageNumber)
      }
      e.project.worldUpdates.rebuildStage(e.stage.stageNumber)
      return
    }
    case "stage-deleted": {
      const stageNumber = e.stage.stageNumber
      const stageNumberToMerge = stageNumber == 1 ? 2 : stageNumber - 1
      e.project.worldUpdates.rebuildStage(stageNumberToMerge)
      return
    }
    case "project-created": {
      const project = e.project
      if (project.isSpacePlatform()) {
        initSpacePlatform(project)
      }
      return
    }
    case "project-deleted":
    case "pre-stage-deleted":
    case "projects-reordered":
      return
    default:
      assertNever(e)
  }
})
