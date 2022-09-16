/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of 100% Blueprint Planning.
 *
 * 100% Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * 100% Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with 100% Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { keys } from "ts-transformer-keys"
import { AssemblyEntity, entityHasErrorAt, ExtraEntities, StageNumber } from "../entity/AssemblyEntity"
import { getSelectionBox } from "../entity/entity-info"
import { assertNever } from "../lib"
import { Position } from "../lib/geometry"
import draw, { AnyRender, DrawParams, SpriteRender } from "../lib/rendering"
import { AssemblyContent, StagePosition } from "./AssemblyContent"
import { getPreviewStages } from "./special-entity-treatment"

export type HighlightEntity = HighlightBoxEntity | SpriteRender
export interface HighlightEntities {
  /** Error outline when an entity cannot be placed. Should be placed on preview entity. */
  errorOutline?: HighlightBoxEntity
  /** Indicator sprite when there is an error highlight in another stage. */
  errorElsewhereIndicator?: SpriteRender

  /** Blue outline when a settings remnant entity is left behind. */
  settingsRemnantHighlight?: HighlightBoxEntity

  /** Blue outline when an entity's settings have changed. */
  configChangedHighlight?: HighlightBoxEntity
  /** Blueprint sprite when an entity's settings have changed in a future stage. */
  configChangedLaterHighlight?: SpriteRender
}
declare module "../entity/AssemblyEntity" {
  // noinspection JSUnusedGlobalSymbols
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  export interface ExtraEntities extends HighlightEntities {}
}

/**
 * Handles various highlights (preview, icons, highlight-boxes) for world entities.
 *
 * @noSelf
 */
export interface EntityHighlighter {
  /** Updates config changed, and error highlights. */
  updateHighlights(assembly: AssemblyContent, entity: AssemblyEntity): void
  updateHighlights(
    assembly: AssemblyContent,
    entity: AssemblyEntity,
    stageStart: StageNumber,
    stageEnd: StageNumber,
  ): void

  deleteHighlights(entity: AssemblyEntity): void
  deleteHighlightsInStage(entity: AssemblyEntity, stage: StageNumber): void

  makeSettingsRemnant(assembly: AssemblyContent, entity: AssemblyEntity): void
  reviveSettingsRemnant(assembly: AssemblyContent, entity: AssemblyEntity): void
}

/** @noSelf */
export interface HighlightCreator {
  createHighlightBox(target: LuaEntity | nil, type: CursorBoxRenderType): LuaEntity | nil

  createSprite(params: DrawParams["sprite"]): SpriteRender
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

export const enum HighlightValues {
  Error = "not-allowed",
  SettingsRemnant = "train-visualization",
  ConfigChanged = "logistics",
  Upgraded = "copy",
  ErrorInOtherStage = "utility/danger_icon",
  ConfigChangedLater = "item/blueprint",
  UpgradedLater = "item/upgrade-planner",
}
const highlightConfigs: {
  [P in keyof HighlightEntities]-?: HighlightConfig | SpriteConfig
} = {
  errorOutline: {
    type: "highlight",
    renderType: HighlightValues.Error,
  },
  errorElsewhereIndicator: {
    type: "sprite",
    sprite: HighlightValues.ErrorInOtherStage,
    offset: { x: 0.2, y: 0.1 },
    scale: 0.3,
    renderLayer: "entity-info-icon-above",
  },
  settingsRemnantHighlight: {
    type: "highlight",
    renderType: HighlightValues.SettingsRemnant,
  },
  configChangedHighlight: {
    type: "highlight",
    renderType: HighlightValues.ConfigChanged,
  },
  configChangedLaterHighlight: {
    type: "sprite",
    sprite: HighlightValues.ConfigChangedLater,
    offset: { x: 0.8, y: 0.1 },
    scale: 0.5,
    renderLayer: "entity-info-icon-above",
  },
}

export function createHighlightCreator(entityCreator: HighlightCreator): EntityHighlighter {
  const { createHighlightBox, createSprite } = entityCreator

  function createHighlight<T extends keyof HighlightEntities>(
    entity: AssemblyEntity,
    stage: StagePosition,
    type: T,
  ): HighlightEntities[T] {
    const config = highlightConfigs[type]
    const existing = entity.getExtraEntity(type, stage.stageNumber)
    if (existing && config.type === "sprite") return existing
    // always replace highlight box, in case of upgrade

    const prototypeName = entity.firstValue.name
    const selectionBox = getSelectionBox(prototypeName).rotateAboutOrigin(entity.direction)
    let result: LuaEntity | AnyRender | nil
    if (config.type === "highlight") {
      const { renderType } = config
      const entityTarget = entity.getWorldOrPreviewEntity(stage.stageNumber)
      result = entityTarget && createHighlightBox(entityTarget!, renderType)
    } else if (config.type === "sprite") {
      const size = selectionBox.size()
      const relativePosition = size.emul(config.offset).plus(selectionBox.left_top)
      const worldPosition = relativePosition.plus(entity.position)
      const scale = config.scaleRelative ? (config.scale * (size.x + size.y)) / 2 : config.scale
      result = createSprite({
        surface: stage.surface,
        target: worldPosition,
        x_scale: scale,
        y_scale: scale,
        sprite: config.sprite,
        tint: config.tint,
        render_layer: config.renderLayer,
      })
    } else {
      assertNever(config)
    }

    entity.replaceExtraEntity(type, stage.stageNumber, result as ExtraEntities[T])
    return result as HighlightEntities[T]
  }
  function removeHighlight(entity: AssemblyEntity, stageNumber: StageNumber, type: keyof HighlightEntities): void {
    entity.destroyExtraEntity(type, stageNumber)
  }
  function removeHighlightFromAllStages(entity: AssemblyEntity, type: keyof HighlightEntities): void {
    entity.destroyAllExtraEntities(type)
  }
  function updateHighlight(
    entity: AssemblyEntity,
    stage: StagePosition,
    type: keyof HighlightEntities,
    value: boolean | nil,
  ): HighlightEntity | nil {
    if (value) return createHighlight(entity, stage, type)
    removeHighlight(entity, stage.stageNumber, type)
    return nil
  }

  function updateAssociatedEntitiesAndErrorHighlight(assembly: AssemblyContent, entity: AssemblyEntity): void {
    for (const [i, stage] of assembly.iterateStages(...getPreviewStages(entity))) {
      const hasError = entityHasErrorAt(entity, i)
      updateHighlight(entity, stage, "errorOutline", hasError)
    }
  }

  function updateErrorIndicators(assembly: AssemblyContent, entity: AssemblyEntity): void {
    if (entity.isRollingStock()) return
    let hasErrorAnywhere = false
    for (const i of $range(entity.firstStage, assembly.numStages())) {
      const hasError = entity.getWorldEntity(i) === nil
      if (hasError) {
        hasErrorAnywhere = true
        break
      }
    }
    if (!hasErrorAnywhere) {
      entity.destroyAllExtraEntities("errorElsewhereIndicator")
      return
    }

    for (const [i, stage] of assembly.iterateStages()) {
      const shouldHaveIndicator = i >= entity.firstStage && entity.getWorldEntity(i) !== nil
      updateHighlight(entity, stage, "errorElsewhereIndicator", shouldHaveIndicator)
    }
  }

  function updateAllConfigChangedHighlights(assembly: AssemblyContent, entity: AssemblyEntity): void {
    const firstStage = entity.firstStage
    let lastStageWithHighlights = firstStage
    for (const [i, stage] of assembly.iterateStages()) {
      const hasConfigChanged = entity.hasStageDiff(i)
      const isUpgrade = hasConfigChanged && entity.getStageDiff(i)!.name !== nil
      const highlight = updateHighlight(entity, stage, "configChangedHighlight", hasConfigChanged)
      if (highlight) {
        ;(highlight as HighlightBoxEntity).highlight_box_type = isUpgrade
          ? HighlightValues.Upgraded
          : HighlightValues.ConfigChanged
      }
      if (!hasConfigChanged) continue

      // update configChangedLaterHighlights in previous stages
      const sprite = isUpgrade ? HighlightValues.UpgradedLater : HighlightValues.ConfigChangedLater
      for (; lastStageWithHighlights < i; lastStageWithHighlights++) {
        const highlight = updateHighlight(
          entity,
          assembly.getStage(lastStageWithHighlights)!,
          "configChangedLaterHighlight",
          true,
        ) as SpriteRender
        highlight.sprite = sprite
      }
    }
    if (lastStageWithHighlights === firstStage) {
      // remove later highlights for all stages
      removeHighlightFromAllStages(entity, "configChangedLaterHighlight")
    } else {
      for (const i of $range(lastStageWithHighlights, assembly.numStages())) {
        removeHighlight(entity, i, "configChangedLaterHighlight")
      }
      for (const i of $range(1, firstStage - 1)) {
        removeHighlight(entity, i, "configChangedLaterHighlight")
      }
    }
  }
  function updateHighlights(assembly: AssemblyContent, entity: AssemblyEntity): void {
    // ignore start and end stage for now
    updateAssociatedEntitiesAndErrorHighlight(assembly, entity)
    if (!entity.isRollingStock()) {
      updateErrorIndicators(assembly, entity)
      updateAllConfigChangedHighlights(assembly, entity)
    }
  }

  function makeSettingsRemnant(assembly: AssemblyContent, entity: AssemblyEntity): void {
    if (!entity.isSettingsRemnant) return
    for (const type of keys<HighlightEntities>()) entity.destroyAllExtraEntities(type)
    for (const [, stage] of assembly.iterateStages()) {
      updateHighlight(entity, stage, "settingsRemnantHighlight", true)
    }
  }
  function reviveSettingsRemnant(assembly: AssemblyContent, entity: AssemblyEntity): void {
    if (entity.isSettingsRemnant) return
    entity.destroyAllExtraEntities("settingsRemnantHighlight")
    updateHighlights(assembly, entity)
  }

  return {
    updateHighlights,
    deleteHighlights(entity: AssemblyEntity): void {
      for (const type of keys<HighlightEntities>()) entity.destroyAllExtraEntities(type)
    },
    deleteHighlightsInStage(entity: AssemblyEntity, stage: StageNumber) {
      for (const type of keys<HighlightEntities>()) entity.destroyExtraEntity(type, stage)
    },
    makeSettingsRemnant,
    reviveSettingsRemnant,
  }
}

export const DefaultHighlightCreator: HighlightCreator = {
  createHighlightBox(target: LuaEntity | nil, type: CursorBoxRenderType): LuaEntity | nil {
    if (!target) return nil
    return target.surface.create_entity({
      name: "highlight-box",
      position: target.position,
      source: target,
      box_type: type,
      force: target.force,
    })
  },
  createSprite(params: DrawParams["sprite"]): SpriteRender {
    return draw("sprite", params)
  },
}

export const DefaultEntityHighlighter = createHighlightCreator(DefaultHighlightCreator)
