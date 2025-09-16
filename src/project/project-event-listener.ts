// Copyright (c) 2022-2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { assertNever } from "../lib"
import { ProjectEvents } from "./UserProject"

ProjectEvents.addListener((e) => {
  switch (e.type) {
    case "stage-added":
      e.project.worldUpdates.rebuildStage(e.stage.stageNumber)
      return
    case "stage-deleted": {
      const stageNumber = e.stage.stageNumber
      const stageNumberToMerge = stageNumber == 1 ? 2 : stageNumber - 1
      e.project.worldUpdates.rebuildStage(stageNumberToMerge)
      return
    }
    case "project-created":
    case "project-deleted":
    case "pre-stage-deleted":
    case "projects-reordered":
      return
    default:
      assertNever(e)
  }
})
