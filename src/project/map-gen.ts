// Copyright (c) 2024 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Stage } from "./ProjectDef"
import { copyMapGenSettings } from "./surfaces"

export function syncMapGenSettings(stage: Stage): void {
  const surface = stage.surface
  for (const otherStage of stage.project.getAllStages()) {
    const otherSurface = otherStage.surface
    copyMapGenSettings(surface, otherSurface)
    otherSurface.clear(true)
  }
}
