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
import draw, { AnyRender, DrawParams, SpriteRender } from "../lib/rendering"
import { AssemblyContent, LayerPosition } from "./AssemblyContent"

export type HighlightEntity = HighlightBoxEntity | SpriteRender
export interface HighlightEntities {
  /** Error outline when an entity cannot be placed. Should be placed on preview entity. */
  errorOutline?: HighlightBoxEntity
  /** Indicator sprite when there is an error highlight in another layer. */
  errorElsewhereIndicator?: SpriteRender

  /** Blue outline when a settings remnant entity is left behind. */
  settingsRemnantHighlight?: HighlightBoxEntity

  /** Blue outline when an entity's settings have changed. */
  configChangedHighlight?: HighlightBoxEntity
  /** Blueprint sprite when an entity's settings have changed in a future layer. */
  configChangedLaterHighlight?: SpriteRender
}
declare module "../entity/AssemblyEntity" {
  export interface WorldEntities extends HighlightEntities {
    previewEntity?: LuaEntity
    selectionProxy?: LuaEntity
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

  deleteHighlights(entity: AssemblyEntity): void
  deleteHighlightsInLayer(entity: AssemblyEntity, layer: LayerNumber): void

  makeSettingsRemnant(assembly: AssemblyContent, entity: AssemblyEntity): void
  reviveSettingsRemnant(assembly: AssemblyContent, entity: AssemblyEntity): void
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

  createSelectionProxy(
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
  SettingsRemnant = "train-visualization",
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
  settingsRemnantHighlight: {
    type: "highlight",
    renderType: HighlightValues.SettingsRemnant,
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

export function createHighlightCreator(entityCreator: HighlightCreator): EntityHighlighter {
  const { createHighlightBox, createSprite, createEntityPreview, createSelectionProxy } = entityCreator

  function createHighlight<T extends keyof HighlightEntities>(
    entity: AssemblyEntity,
    layer: LayerPosition,
    type: T,
  ): HighlightEntities[T] {
    const config = highlightConfigs[type]
    const existing = entity.getWorldEntity(layer.layerNumber, type)
    if (existing && config.type === "sprite") return existing
    // always replace highlight box, in case of upgrade

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

  //
  // function makePreviewEntity(entity: AssemblyEntity, layer: LayerPosition): LuaEntity | nil {
  //   const preview = createEntityPreview(
  //     layer.surface,
  //     entity.getNameAtLayer(layer.layerNumber),
  //     getWorldPosition(layer, entity),
  //     entity.direction,
  //   )
  //   entity.replaceWorldEntity(layer.layerNumber, preview, "previewEntity")
  //   return preview
  // }
  //
  // function getOrCreatePreviewEntity(entity: AssemblyEntity, layer: LayerPosition): LuaEntity | nil {
  //   const existing = entity.getWorldEntity(layer.layerNumber, "previewEntity")
  //   if (!existing || existing.name !== Prototypes.PreviewEntityPrefix + entity.getNameAtLayer(layer.layerNumber)) {
  //     return makePreviewEntity(entity, layer)
  //   } else if (existing) {
  //     existing.direction = entity.direction ?? 0
  //     return existing
  //   }
  // }

  function createAssociatedEntity(
    entity: AssemblyEntity,
    layer: LayerPosition,
    type: "previewEntity" | "selectionProxy",
  ): LuaEntity | nil {
    const creator = type === "previewEntity" ? createEntityPreview : createSelectionProxy
    const result = creator(
      layer.surface,
      entity.getNameAtLayer(layer.layerNumber),
      getWorldPosition(layer, entity),
      entity.direction,
    )
    entity.replaceWorldEntity(layer.layerNumber, result, type)
    return result
  }

  function getOrCreateAssociatedEntity(
    entity: AssemblyEntity,
    layer: LayerPosition,
    type: "previewEntity" | "selectionProxy",
  ): LuaEntity | nil {
    const prefix = type === "previewEntity" ? Prototypes.PreviewEntityPrefix : Prototypes.SelectionProxyPrefix
    const existing = entity.getWorldEntity(layer.layerNumber, type)
    if (existing && existing.name === prefix + entity.getNameAtLayer(layer.layerNumber)) {
      return existing
    }
    return createAssociatedEntity(entity, layer, type)
  }

  function updateAssociatedEntity(
    entity: AssemblyEntity,
    layer: LayerPosition,
    type: "previewEntity" | "selectionProxy",
    shouldHave: boolean,
  ): void {
    if (shouldHave) {
      createAssociatedEntity(entity, layer, type)
    } else {
      entity.destroyWorldEntity(layer.layerNumber, type)
    }
  }

  function updateAssociatedEntitiesAndErrorHighlight(assembly: AssemblyContent, entity: AssemblyEntity): void {
    for (const [i, layer] of assembly.iterateLayers()) {
      const shouldHaveEntityPreview = entity.getWorldEntity(layer.layerNumber, "mainEntity") === nil
      const hasError = shouldHaveEntityPreview && i >= entity.getBaseLayer()
      updateAssociatedEntity(entity, layer, "previewEntity", shouldHaveEntityPreview)
      updateAssociatedEntity(entity, layer, "selectionProxy", hasError)
      updateHighlight(entity, layer, "errorOutline", hasError)
    }
  }

  function updateErrorIndicators(assembly: AssemblyContent, entity: AssemblyEntity): void {
    let hasErrorAnywhere = false
    for (const i of $range(entity.getBaseLayer(), assembly.numLayers())) {
      const hasError = entity.getWorldEntity(i) === nil
      if (hasError) {
        hasErrorAnywhere = true
        break
      }
    }
    if (!hasErrorAnywhere) {
      entity.destroyAllWorldEntities("errorElsewhereIndicator")
      return
    }

    for (const [i, layer] of assembly.iterateLayers()) {
      const shouldHaveIndicator = i >= entity.getBaseLayer() && entity.getWorldEntity(i, "mainEntity") !== nil
      updateHighlight(entity, layer, "errorElsewhereIndicator", shouldHaveIndicator)
    }
  }

  function updateAllConfigChangedHighlights(assembly: AssemblyContent, entity: AssemblyEntity): void {
    const baseLayer = entity.getBaseLayer()
    let lastLayerWithHighlights = baseLayer
    for (const [i, layer] of assembly.iterateLayers()) {
      const hasConfigChanged = entity.hasLayerChange(i)
      const isUpgrade = hasConfigChanged && entity.getLayerChange(i)!.name !== nil
      const highlight = updateHighlight(entity, layer, "configChangedHighlight", hasConfigChanged)
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
          assembly.getLayer(lastLayerWithHighlights)!,
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
      for (const i of $range(lastLayerWithHighlights, assembly.numLayers())) {
        removeHighlight(entity, i, "configChangedLaterHighlight")
      }
    }
  }
  function updateHighlights(assembly: AssemblyContent, entity: AssemblyEntity): void {
    updateAssociatedEntitiesAndErrorHighlight(assembly, entity)
    updateErrorIndicators(assembly, entity)
    updateAllConfigChangedHighlights(assembly, entity)
  }

  function makeSettingsRemnant(assembly: AssemblyContent, entity: AssemblyEntity): void {
    if (!entity.isSettingsRemnant) return
    for (const type of keys<HighlightEntities>()) entity.destroyAllWorldEntities(type)
    for (const [, layer] of assembly.iterateLayers()) {
      getOrCreateAssociatedEntity(entity, layer, "previewEntity")
      getOrCreateAssociatedEntity(entity, layer, "selectionProxy")
      updateHighlight(entity, layer, "settingsRemnantHighlight", true)
    }
  }
  function reviveSettingsRemnant(assembly: AssemblyContent, entity: AssemblyEntity): void {
    if (entity.isSettingsRemnant) return
    entity.destroyAllWorldEntities("settingsRemnantHighlight")
    updateHighlights(assembly, entity)
  }

  function deleteEntity(entity: AssemblyEntity): void {
    for (const type of keys<HighlightEntities>()) entity.destroyAllWorldEntities(type)
    entity.destroyAllWorldEntities("previewEntity")
    entity.destroyAllWorldEntities("selectionProxy")
  }
  function deleteLayer(entity: AssemblyEntity, layer: LayerNumber) {
    for (const type of keys<HighlightEntities>()) entity.destroyWorldEntity(layer, type)
    entity.destroyWorldEntity(layer, "previewEntity")
    entity.destroyWorldEntity(layer, "selectionProxy")
  }

  return {
    updateHighlights,
    deleteHighlights: deleteEntity,
    deleteHighlightsInLayer: deleteLayer,
    makeSettingsRemnant,
    reviveSettingsRemnant,
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
  createSelectionProxy(
    surface: LuaSurface,
    type: string,
    position: Position,
    direction: defines.direction | nil,
  ): LuaEntity | nil {
    const name = Prototypes.SelectionProxyPrefix + type
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
