/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of BBPP3.
 *
 * BBPP3 is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * BBPP3 is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with BBPP3. If not, see <https://www.gnu.org/licenses/>.
 */

import { keys } from "ts-transformer-keys"
import { Prototypes } from "../constants"
import { AssemblyEntity, LayerNumber } from "../entity/AssemblyEntity"
import { getSelectionBox } from "../entity/entity-info"
import { getWorldPosition } from "../entity/EntityHandler"
import { assertNever } from "../lib"
import { Position } from "../lib/geometry"
import draw, { AnyRender, DrawParams, RectangleRender, SpriteRender } from "../lib/rendering"
import { AssemblyContent, LayerPosition } from "./Assembly"

export type HighlightEntity = HighlightBoxEntity | SpriteRender | RectangleRender
export interface HighlightEntities {
  /** Error outline when an entity cannot be placed. Should be placed on preview entity. */
  errorOutline?: HighlightBoxEntity
  /** Indicator sprite when there is an error highlight in another layer. */
  errorElsewhereIndicator?: SpriteRender

  /** Blue outline when a lost reference entity is left behind. */
  lostReferenceHighlight?: HighlightBoxEntity

  /** Blue outline when an entity's settings have changed. */
  configChangedHighlight?: HighlightBoxEntity
  /** Blueprint sprite when an entity's settings have changed in a future layer. */
  configChangedLaterHighlight?: SpriteRender
}
declare module "../entity/AssemblyEntity" {
  export interface WorldEntities extends HighlightEntities {
    previewEntity?: LuaEntity
  }
}

/**
 * Handles various highlights (rendering) for an entity.
 *
 * @noSelf
 */
export interface EntityHighlighter {
  /** Updates config changed, and error highlights. */
  updateHighlights(assembly: AssemblyContent, entity: AssemblyEntity): void
  updateHighlights(
    assembly: AssemblyContent,
    entity: AssemblyEntity,
    layerStart: LayerNumber,
    layerEnd: LayerNumber,
  ): void

  deleteEntity(entity: AssemblyEntity): void
  makeLostReference(assembly: AssemblyContent, entity: AssemblyEntity): void
  reviveLostReference(assembly: AssemblyContent, entity: AssemblyEntity): void
}

/** @noSelf */
export interface HighlightCreator {
  createHighlightBox(target: LuaEntity, type: CursorBoxRenderType): LuaEntity | nil

  createSprite(params: DrawParams["sprite"]): SpriteRender

  createEntityPreview(
    surface: LuaSurface,
    type: string,
    position: Position,
    direction: defines.direction | nil,
  ): LuaEntity | nil
}

interface HighlightConfig {
  readonly type: "highlight"
  readonly renderType: CursorBoxRenderType
  readonly target: "mainEntity" | "previewEntity"
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
  LostReference = "train-visualization",
  ConfigChanged = "logistics",
  Upgraded = "copy",
  ErrorInOtherLayer = "utility/danger_icon",
  ConfigChangedLater = "item/blueprint",
  UpgradedLater = "item/upgrade-planner",
}

const highlightConfigs: {
  [P in keyof HighlightEntities]-?: HighlightConfig | SpriteConfig
} = {
  errorOutline: {
    type: "highlight",
    renderType: HighlightValues.Error,
    target: "previewEntity",
  },
  errorElsewhereIndicator: {
    type: "sprite",
    sprite: HighlightValues.ErrorInOtherLayer,
    offset: { x: 0.2, y: 0.1 },
    scale: 0.3,
    renderLayer: "entity-info-icon-above",
  },
  lostReferenceHighlight: {
    type: "highlight",
    renderType: HighlightValues.LostReference,
    target: "previewEntity",
  },
  configChangedHighlight: {
    type: "highlight",
    renderType: HighlightValues.ConfigChanged,
    target: "mainEntity",
  },
  configChangedLaterHighlight: {
    type: "sprite",
    sprite: HighlightValues.ConfigChangedLater,
    offset: { x: 0.8, y: 0.1 },
    scale: 0.5,
    renderLayer: "entity-info-icon-above",
  },
}

declare const luaLength: LuaLength<table, number>

export function createHighlightCreator(entityCreator: HighlightCreator): EntityHighlighter {
  const { createHighlightBox, createSprite, createEntityPreview } = entityCreator

  function createHighlight<T extends keyof HighlightEntities>(
    entity: AssemblyEntity,
    layer: LayerPosition,
    type: T,
  ): HighlightEntities[T] {
    const existing = entity.getWorldEntity(layer.layerNumber, type)
    if (existing) return existing!

    const config = highlightConfigs[type]
    const prototypeName = entity.getBaseValue().name
    const selectionBox = getSelectionBox(prototypeName).rotateAboutOrigin(entity.direction)
    let result: LuaEntity | AnyRender | nil
    if (config.type === "highlight") {
      const { renderType, target } = config
      const entityTarget = entity.getWorldEntity(layer.layerNumber, target)
      result = entityTarget && createHighlightBox(entityTarget!, renderType)
    } else if (config.type === "sprite") {
      const size = selectionBox.size()
      const relativePosition = size.emul(config.offset).plus(selectionBox.left_top)
      const worldPosition = relativePosition.plus(getWorldPosition(layer, entity))
      const scale = config.scaleRelative ? (config.scale * (size.x + size.y)) / 2 : config.scale
      result = createSprite({
        surface: layer.surface,
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

    entity.replaceWorldEntity<any>(layer.layerNumber, result, type)
    return result as HighlightEntities[T]
  }
  function removeHighlight(entity: AssemblyEntity, layerNumber: LayerNumber, type: keyof HighlightEntities): void {
    entity.destroyWorldEntity(layerNumber, type)
  }
  function removeHighlightFromAllLayers(entity: AssemblyEntity, type: keyof HighlightEntities): void {
    entity.destroyAllWorldEntities(type)
  }
  function updateHighlight(
    entity: AssemblyEntity,
    layer: LayerPosition,
    type: keyof HighlightEntities,
    value: boolean | nil,
  ): HighlightEntity | nil {
    if (value) return createHighlight(entity, layer, type)
    removeHighlight(entity, layer.layerNumber, type)
    return nil
  }

  function makePreviewEntity(entity: AssemblyEntity, layer: LayerPosition): LuaEntity | nil {
    const preview = createEntityPreview(
      layer.surface,
      entity.getNameAtLayer(layer.layerNumber),
      getWorldPosition(layer, entity),
      entity.direction,
    )
    entity.replaceWorldEntity(layer.layerNumber, preview, "previewEntity")
    return preview
  }

  function getOrCreatePreviewEntity(entity: AssemblyEntity, layer: LayerPosition): LuaEntity | nil {
    const existing = entity.getWorldEntity(layer.layerNumber, "previewEntity")
    if (!existing || existing.name !== Prototypes.PreviewEntityPrefix + entity.getNameAtLayer(layer.layerNumber)) {
      return makePreviewEntity(entity, layer)
    } else if (existing) {
      existing.direction = entity.direction ?? 0
      return existing
    }
  }

  function updateAllPreviewEntities(
    assembly: AssemblyContent,
    entity: AssemblyEntity,
    layerStart: number | undefined,
    layerEnd: number | undefined,
  ): void {
    for (const i of $range(layerStart ?? 1, layerEnd ?? luaLength(assembly.layers))) {
      const shouldHavePreview = entity.getWorldEntity(i, "mainEntity") === nil
      if (shouldHavePreview) {
        getOrCreatePreviewEntity(entity, assembly.layers[i])
      } else {
        entity.destroyWorldEntity(i, "previewEntity")
      }
    }
  }

  function updateAllErrorHighlights(assembly: AssemblyContent, entity: AssemblyEntity): void {
    let hasErrorAnywhere = false
    for (const i of $range(entity.getBaseLayer(), luaLength(assembly.layers))) {
      const hasError = entity.getWorldEntity(i) === nil
      if (hasError) {
        hasErrorAnywhere = true
        break
      }
    }
    for (const i of $range(entity.getBaseLayer(), luaLength(assembly.layers))) {
      const hasError = entity.getWorldEntity(i) === nil
      const hasErrorInOtherLayer = !hasError && hasErrorAnywhere

      const layer = assembly.layers[i]
      if (hasError) getOrCreatePreviewEntity(entity, layer)
      updateHighlight(entity, layer, "errorOutline", hasError)
      updateHighlight(entity, layer, "errorElsewhereIndicator", hasErrorInOtherLayer)
    }
  }

  function updateAllConfigChangedHighlights(assembly: AssemblyContent, entity: AssemblyEntity): void {
    const baseLayer = entity.getBaseLayer()
    let lastLayerWithHighlights = baseLayer
    for (const i of $range(baseLayer, luaLength(assembly.layers))) {
      const hasConfigChanged = entity.hasLayerChange(i)
      const isUpgrade = hasConfigChanged && entity.getLayerChange(i)!.name !== nil
      const highlight = updateHighlight(entity, assembly.layers[i], "configChangedHighlight", hasConfigChanged)
      if (highlight) {
        ;(highlight as HighlightBoxEntity).highlight_box_type = isUpgrade
          ? HighlightValues.Upgraded
          : HighlightValues.ConfigChanged
      }
      if (!hasConfigChanged) continue

      // update configChangedLaterHighlights in previous layers
      const sprite = isUpgrade ? HighlightValues.UpgradedLater : HighlightValues.ConfigChangedLater
      for (; lastLayerWithHighlights < i; lastLayerWithHighlights++) {
        const highlight = updateHighlight(
          entity,
          assembly.layers[lastLayerWithHighlights],
          "configChangedLaterHighlight",
          true,
        ) as SpriteRender
        highlight.sprite = sprite
      }
    }
    if (lastLayerWithHighlights === baseLayer) {
      // remove later highlights for all layers
      removeHighlightFromAllLayers(entity, "configChangedLaterHighlight")
    } else {
      for (const i of $range(lastLayerWithHighlights, luaLength(assembly.layers))) {
        removeHighlight(entity, i, "configChangedLaterHighlight")
      }
    }
  }
  function updateHighlights(
    assembly: AssemblyContent,
    entity: AssemblyEntity,
    layerStart?: LayerNumber,
    layerEnd?: LayerNumber,
  ): void {
    updateAllPreviewEntities(assembly, entity, layerStart, layerEnd)
    updateAllErrorHighlights(assembly, entity)
    updateAllConfigChangedHighlights(assembly, entity)
  }

  function makeLostReference(assembly: AssemblyContent, entity: AssemblyEntity): void {
    if (!entity.isLostReference) return
    for (const type of keys<HighlightEntities>()) entity.destroyAllWorldEntities(type)
    for (const i of $range(1, luaLength(assembly.layers))) {
      getOrCreatePreviewEntity(entity, assembly.layers[i])
      updateHighlight(entity, assembly.layers[i], "lostReferenceHighlight", true)
    }
  }
  function reviveLostReference(assembly: AssemblyContent, entity: AssemblyEntity): void {
    if (entity.isLostReference) return
    entity.destroyAllWorldEntities("lostReferenceHighlight")
    updateHighlights(assembly, entity)
  }

  function deleteEntity(entity: AssemblyEntity): void {
    for (const type of keys<HighlightEntities>()) entity.destroyAllWorldEntities(type)
    entity.destroyAllWorldEntities("previewEntity")
  }

  return {
    updateHighlights,
    deleteEntity,
    makeLostReference,
    reviveLostReference,
  }
}

export const DefaultHighlightCreator: HighlightCreator = {
  createHighlightBox(target: LuaEntity, type: CursorBoxRenderType): LuaEntity | nil {
    return target.surface.create_entity({
      name: "highlight-box",
      position: target.position,
      target,
      box_type: type,
      force: target.force,
    })
  },
  createSprite(params: DrawParams["sprite"]): SpriteRender {
    return draw("sprite", params)
  },
  createEntityPreview(
    surface: LuaSurface,
    type: string,
    position: Position,
    direction: defines.direction | nil,
  ): LuaEntity | nil {
    const name = Prototypes.PreviewEntityPrefix + type
    const result = surface.create_entity({
      name,
      position,
      direction,
      force: "player",
    })
    if (result) {
      result.destructible = false
      result.minable = false
      result.rotatable = false
    }
    return result
  },
}

export const DefaultEntityHighlighter = createHighlightCreator(DefaultHighlightCreator)
