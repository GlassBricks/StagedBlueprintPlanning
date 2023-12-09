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

import {
  Color,
  ColorArray,
  CursorBoxRenderType,
  HighlightBoxEntity,
  LuaEntity,
  LuaSurface,
  RenderLayer,
  SpritePath,
  Vector,
} from "factorio:runtime"
import { EntityPrototypeInfo, OnEntityPrototypesLoaded } from "../entity/entity-prototype-info"
import { ExtraEntities, ProjectEntity, StageNumber } from "../entity/ProjectEntity"
import { AnyRender, assertNever, SpriteRender } from "../lib"
import { BBox, Position } from "../lib/geometry"
import { createHighlightBox, createSprite } from "./create-highlight"
import { Project } from "./ProjectDef"

export type HighlightEntity = HighlightBoxEntity | SpriteRender
export interface HighlightEntities {
  /** Error outline when an entity cannot be placed. Should be placed on preview entity. */
  errorOutline?: HighlightBoxEntity
  /** Indicator sprite when there is an error highlight in another stage. */
  errorElsewhereIndicator?: SpriteRender

  /** White outline when a settings remnant entity is left behind. */
  settingsRemnantHighlight?: HighlightBoxEntity

  /** Blue/green outline when an entity's settings have changed; green if is upgrade */
  configChangedHighlight?: HighlightBoxEntity
  /** Blueprint sprite when an entity's settings have changed in a future stage. */
  configChangedLaterHighlight?: SpriteRender

  /** Deconstruction planner sprite when an entity is deleted in the next stage (lastStage is set). Ignored if lastStage == firstStage. */
  stageDeleteHighlight?: SpriteRender
}
declare module "../entity/ProjectEntity" {
  // noinspection JSUnusedGlobalSymbols
  export interface ExtraEntities extends HighlightEntities {}
}

interface HighlightConfig {
  readonly type: "highlight"
  readonly renderType: CursorBoxRenderType
}

interface SpriteConfig {
  readonly type: "sprite"
  readonly sprite: SpritePath
  readonly offset: Position
  readonly tint?: Color | ColorArray
  readonly scale: number
  readonly scaleRelative?: boolean
  readonly renderLayer: RenderLayer
}

export const enum HighlightConstants {
  Error = "not-allowed",
  SettingsRemnant = "train-visualization",
  ConfigChanged = "logistics",
  Upgraded = "copy",
  ErrorInOtherStage = "utility/danger_icon",
  ConfigChangedLater = "item/blueprint",
  UpgradedLater = "item/upgrade-planner",
  DeletedNextStage = "item/deconstruction-planner",
}
const highlightConfigs: {
  [P in keyof HighlightEntities]-?: HighlightConfig | SpriteConfig
} = {
  errorOutline: {
    type: "highlight",
    renderType: HighlightConstants.Error,
  },
  errorElsewhereIndicator: {
    type: "sprite",
    sprite: HighlightConstants.ErrorInOtherStage,
    offset: { x: 0.2, y: 0.1 },
    scale: 0.3,
    renderLayer: "entity-info-icon-above",
  },
  settingsRemnantHighlight: {
    type: "highlight",
    renderType: HighlightConstants.SettingsRemnant,
  },
  configChangedHighlight: {
    type: "highlight",
    renderType: HighlightConstants.ConfigChanged,
  },
  configChangedLaterHighlight: {
    type: "sprite",
    sprite: HighlightConstants.ConfigChangedLater,
    offset: { x: 0.8, y: 0.1 },
    scale: 0.5,
    renderLayer: "entity-info-icon-above",
  },
  stageDeleteHighlight: {
    type: "sprite",
    sprite: HighlightConstants.DeletedNextStage,
    offset: { x: 0.8, y: 0.8 },
    scale: 0.5,
    renderLayer: "entity-info-icon-above",
  },
}

let selectionBoxes: EntityPrototypeInfo["selectionBoxes"]
OnEntityPrototypesLoaded.addListener((info) => {
  ;({ selectionBoxes } = info)
})

function createHighlight<T extends keyof HighlightEntities>(
  entity: ProjectEntity,
  stage: StageNumber,
  surface: LuaSurface,
  type: T,
): HighlightEntities[T] {
  const config = highlightConfigs[type]
  const existing = entity.getExtraEntity(type, stage)
  const entityTarget = entity.getWorldOrPreviewEntity(stage)
  if (
    existing &&
    config.type == "sprite" &&
    existing.valid &&
    existing.object_name == "_RenderObj" &&
    existing.target == entityTarget
  )
    return existing

  const prototypeName = entity.firstValue.name
  let result: LuaEntity | AnyRender | nil
  if (config.type == "highlight") {
    const { renderType } = config
    result = entityTarget && createHighlightBox(entityTarget, renderType)
  } else if (config.type == "sprite") {
    const localSelectionBox = selectionBoxes.get(prototypeName)
    if (localSelectionBox) {
      const selectionBox = BBox.rotateAboutOrigin(localSelectionBox, entity.direction)
      const size = selectionBox.size()
      const relativePosition = size.emul(config.offset).plus(selectionBox.left_top)
      // const worldPosition = relativePosition.plus(entity.position)
      const target = entityTarget ?? relativePosition.plus(entity.position)
      const offset: Vector | nil = entityTarget && [relativePosition.x, relativePosition.y]
      const scale = config.scaleRelative ? (config.scale * (size.x + size.y)) / 2 : config.scale
      result = createSprite({
        surface,
        target,
        target_offset: offset,
        x_scale: scale,
        y_scale: scale,
        sprite: config.sprite,
        tint: config.tint,
        render_layer: config.renderLayer,
      })
    }
  } else {
    assertNever(config)
  }

  entity.replaceExtraEntity(type, stage, result as ExtraEntities[T])
  return result as HighlightEntities[T]
}
function removeHighlight(entity: ProjectEntity, stageNumber: StageNumber, type: keyof HighlightEntities): void {
  entity.destroyExtraEntity(type, stageNumber)
}
function removeHighlightFromAllStages(entity: ProjectEntity, type: keyof HighlightEntities): void {
  entity.destroyAllExtraEntities(type)
}

/** @noSelf */
export interface EntityHighlights {
  updateAllHighlights(entity: ProjectEntity): void
  deleteAllHighlights(entity: ProjectEntity): void
  makeSettingsRemnantHighlights(entity: ProjectEntity): void
  updateHighlightsOnReviveSettingsRemnant(entity: ProjectEntity): void
}
export function EntityHighlights(project: Project): EntityHighlights {
  return {
    updateAllHighlights,
    deleteAllHighlights,
    makeSettingsRemnantHighlights,
    updateHighlightsOnReviveSettingsRemnant,
  }
  function updateHighlight(
    entity: ProjectEntity,
    stage: StageNumber,
    type: keyof HighlightEntities,
    value: boolean | nil,
  ): HighlightEntity | nil {
    if (value) return createHighlight(entity, stage, project.getSurface(stage)!, type)
    removeHighlight(entity, stage, type)
    return nil
  }

  function updateErrorOutlines(entity: ProjectEntity): void {
    let hasErrorAnywhere = false
    for (const stage of $range(entity.firstStage, project.lastStageFor(entity))) {
      const hasError = entity.hasErrorAt(stage)
      updateHighlight(entity, stage, "errorOutline", hasError)
      hasErrorAnywhere ||= hasError
    }

    if (!hasErrorAnywhere) {
      entity.destroyAllExtraEntities("errorElsewhereIndicator")
    } else {
      for (const stage of $range(1, project.lastStageFor(entity))) {
        const shouldHaveIndicator = !entity.hasErrorAt(stage)
        updateHighlight(entity, stage, "errorElsewhereIndicator", shouldHaveIndicator)
      }
    }
  }

  function updateStageDiffHighlights(entity: ProjectEntity): void {
    if (!entity.hasStageDiff()) {
      entity.destroyAllExtraEntities("configChangedHighlight")
      entity.destroyAllExtraEntities("configChangedLaterHighlight")
      return
    }
    const firstStage = entity.firstStage
    let lastStageWithHighlights = firstStage
    for (const stage of $range(1, project.lastStageFor(entity))) {
      const hasConfigChanged = entity.hasStageDiff(stage)
      const isUpgrade = hasConfigChanged && entity.getStageDiff(stage)!.name != nil
      const highlight = updateHighlight(entity, stage, "configChangedHighlight", hasConfigChanged)
      if (highlight) {
        ;(highlight as HighlightBoxEntity).highlight_box_type = isUpgrade
          ? HighlightConstants.Upgraded
          : HighlightConstants.ConfigChanged
      }
      if (!hasConfigChanged) continue

      // update configChangedLaterHighlights in previous stages
      const sprite = isUpgrade ? HighlightConstants.UpgradedLater : HighlightConstants.ConfigChangedLater
      for (; lastStageWithHighlights < stage; lastStageWithHighlights++) {
        const highlight = updateHighlight(
          entity,
          lastStageWithHighlights,
          "configChangedLaterHighlight",
          true,
        ) as SpriteRender
        highlight.sprite = sprite
      }
    }
    if (lastStageWithHighlights == firstStage) {
      // remove later highlights for all stages
      removeHighlightFromAllStages(entity, "configChangedLaterHighlight")
    } else {
      for (const i of $range(lastStageWithHighlights, project.lastStageFor(entity))) {
        removeHighlight(entity, i, "configChangedLaterHighlight")
      }
      for (const i of $range(1, firstStage - 1)) {
        removeHighlight(entity, i, "configChangedLaterHighlight")
      }
    }
  }

  function updateStageDeleteIndicator(entity: ProjectEntity): void {
    entity.destroyAllExtraEntities("stageDeleteHighlight")
    if (entity.lastStage != nil && entity.lastStage != entity.firstStage) {
      const stage = entity.lastStage
      const surface = project.getSurface(stage)!
      createHighlight(entity, stage, surface, "stageDeleteHighlight")
    }
  }

  function updateAllHighlights(entity: ProjectEntity): void {
    // ignore start and end stage for now
    updateErrorOutlines(entity)
    updateStageDiffHighlights(entity)
    updateStageDeleteIndicator(entity)
  }

  function deleteAllHighlights(entity: ProjectEntity): void {
    for (const type of keys<HighlightEntities>()) entity.destroyAllExtraEntities(type)
  }
  function makeSettingsRemnantHighlights(entity: ProjectEntity): void {
    if (!entity.isSettingsRemnant) return
    for (const type of keys<HighlightEntities>()) entity.destroyAllExtraEntities(type)
    for (const stage of $range(1, project.lastStageFor(entity))) {
      updateHighlight(entity, stage, "settingsRemnantHighlight", true)
    }
  }
  function updateHighlightsOnReviveSettingsRemnant(entity: ProjectEntity): void {
    if (entity.isSettingsRemnant) return
    entity.destroyAllExtraEntities("settingsRemnantHighlight")
    updateAllHighlights(entity)
  }
}
