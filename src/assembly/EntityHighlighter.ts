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
import { AssemblyEntity, LayerNumber } from "../entity/AssemblyEntity"
import { getSelectionBox } from "../entity/entity-info"
import { getWorldPosition } from "../entity/EntityHandler"
import { assertNever } from "../lib"
import { BBox, Pos, Position } from "../lib/geometry"
import draw, { RenderObj } from "../lib/rendering"
import { AssemblyContent, LayerPosition } from "./Assembly"

export type HighlightEntity = HighlightBoxEntity | RenderObj<"sprite">
export interface HighlightEntities {
  /** Error outline when an entity cannot be placed. */
  errorHighlight?: HighlightEntity
  /** Indicator sprite when there is an error highlight in another layer. */
  errorInOtherLayerHighlight?: HighlightEntity
  /** Blue outline when a lost reference entity is left behind. */
  lostReferenceHighlight?: HighlightEntity

  /** Blue outline when an entity's settings have changed. */
  configChangedHighlight?: HighlightEntity
  /** Blueprint sprite when an entity's settings have changed in a future layer. */
  configChangedLaterHighlight?: HighlightEntity
}
export interface HighlightProperties {
  hasLostReferenceHighlight?: true
}
declare module "../entity/AssemblyEntity" {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  export interface WorldEntities extends HighlightEntities {}
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  export interface LayerProperties extends HighlightProperties {}
}

/** @noSelf */
export interface EntityHighlighter {
  updateHighlights(assembly: AssemblyContent, entity: AssemblyEntity): void
  deleteAllHighlights(entity: AssemblyEntity): void
}

/** @noSelf */
export interface HighlightCreator {
  createHighlightBox(
    surface: LuaSurface,
    position: Position,
    bbox: BoundingBox,
    type: CursorBoxRenderType,
  ): LuaEntity | nil

  createSprite(surface: LuaSurface, position: Position, scale: number, sprite: SpritePath): RenderObj<"sprite">
}

interface HighlightConfig {
  readonly type: "highlight"
  readonly renderType: CursorBoxRenderType
}

interface SpriteConfig {
  readonly type: "sprite"
  readonly sprite: SpritePath
  readonly offset: Position
  readonly scale: number
}

export const enum HighlightValues {
  Error = "not-allowed",
  ErrorInOtherLayer = "utility/danger_icon",
  LostReference = "train-visualization",
  ConfigChanged = "logistics",
  Upgraded = "copy",
  ConfigChangedLater = "item/blueprint",
  UpgradedLater = "item/upgrade-planner",
}
const highlightConfigs: {
  [P in keyof HighlightEntities]-?: HighlightConfig | SpriteConfig
} = {
  errorHighlight: {
    type: "highlight",
    renderType: HighlightValues.Error,
  },
  errorInOtherLayerHighlight: {
    type: "sprite",
    sprite: HighlightValues.ErrorInOtherLayer,
    offset: { x: 0.2, y: 0.1 },
    scale: 0.3,
  },
  lostReferenceHighlight: {
    type: "highlight",
    renderType: HighlightValues.LostReference,
  },
  configChangedHighlight: {
    type: "highlight",
    renderType: HighlightValues.ConfigChanged,
  },
  configChangedLaterHighlight: {
    type: "sprite",
    sprite: HighlightValues.ConfigChangedLater,
    offset: { x: 0.8, y: 0.1 },
    scale: 0.6,
  },
}

declare const luaLength: LuaLength<table, number>

export function createHighlightCreator(entityCreator: HighlightCreator): EntityHighlighter {
  const { createHighlightBox, createSprite } = entityCreator

  function createHighlight<T extends keyof HighlightEntities>(
    entity: AssemblyEntity,
    layer: LayerPosition,
    type: T,
  ): HighlightEntities[T] {
    const existing = entity.getWorldEntity(layer.layerNumber, type)
    if (existing) return existing!

    const config = highlightConfigs[type]
    const prototypeName = entity.getBaseValue().name
    const selectionBox = getSelectionBox(prototypeName)

    let result: LuaEntity | RenderObj | nil
    if (config.type === "highlight") {
      const worldSelectionBox = BBox.translate(selectionBox, getWorldPosition(layer, entity))
      result = createHighlightBox(layer.surface, entity.position, worldSelectionBox, config.renderType)
    } else if (config.type === "sprite") {
      const relativePosition = Pos.plus(selectionBox.left_top, selectionBox.size().emul(config.offset))
      const worldPosition = relativePosition.plus(getWorldPosition(layer, entity))
      result = createSprite(layer.surface, worldPosition, config.scale, config.sprite)
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

  function setHighlight(
    entity: AssemblyEntity,
    layer: LayerPosition,
    type: keyof HighlightEntities,
    value: boolean | nil,
  ): HighlightEntity | nil {
    if (value) return createHighlight(entity, layer, type)
    removeHighlight(entity, layer.layerNumber, type)
    return nil
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
      setHighlight(entity, layer, "errorHighlight", hasError)
      setHighlight(entity, layer, "errorInOtherLayerHighlight", hasErrorInOtherLayer)
    }
  }

  function updateAllConfigChangedHighlights(assembly: AssemblyContent, entity: AssemblyEntity): void {
    const baseLayer = entity.getBaseLayer()
    let lastLayerWithHighlights = baseLayer
    for (const i of $range(baseLayer, luaLength(assembly.layers))) {
      const hasConfigChanged = entity.hasLayerChange(i)
      const isUpgrade = hasConfigChanged && entity.getLayerChange(i)!.name !== nil
      const highlight = setHighlight(entity, assembly.layers[i], "configChangedHighlight", hasConfigChanged)
      if (highlight) {
        ;(highlight as HighlightBoxEntity).highlight_box_type = isUpgrade
          ? HighlightValues.Upgraded
          : HighlightValues.ConfigChanged
      }
      if (!hasConfigChanged) continue

      // update configChangedLaterHighlights in previous layers
      const sprite = isUpgrade ? HighlightValues.UpgradedLater : HighlightValues.ConfigChangedLater
      for (; lastLayerWithHighlights < i; lastLayerWithHighlights++) {
        const highlight = setHighlight(
          entity,
          assembly.layers[lastLayerWithHighlights],
          "configChangedLaterHighlight",
          true,
        ) as RenderObj<"sprite">
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

  function updateLostReferenceHighlights(assembly: AssemblyContent, entity: AssemblyEntity): void {
    const isLost = entity.isLostReference === true
    const hasHighlight = entity.propertySetInAnyLayer("hasLostReferenceHighlight")
    if (isLost === hasHighlight) return
    if (isLost) {
      removeAllHighlights(entity)

      entity.setProperty(entity.getBaseLayer(), "hasLostReferenceHighlight", true)
      for (const layer of $range(entity.getBaseLayer(), luaLength(assembly.layers))) {
        createHighlight(entity, assembly.layers[layer], "lostReferenceHighlight")
      }
    } else {
      entity.clearPropertyInAllLayers("hasLostReferenceHighlight")
      removeHighlightFromAllLayers(entity, "lostReferenceHighlight")
    }
  }

  function updateHighlights(assembly: AssemblyContent, entity: AssemblyEntity): void {
    updateLostReferenceHighlights(assembly, entity)
    if (!entity.isLostReference) {
      updateAllErrorHighlights(assembly, entity)
      updateAllConfigChangedHighlights(assembly, entity)
    }
  }

  function removeAllHighlights(entity: AssemblyEntity): void {
    for (const type of keys<HighlightEntities>()) {
      removeHighlightFromAllLayers(entity, type)
    }
    for (const prop of keys<HighlightProperties>()) {
      entity.clearPropertyInAllLayers(prop)
    }
  }

  return {
    updateHighlights,
    deleteAllHighlights: removeAllHighlights,
  }
}

export const DefaultHighlightCreator: HighlightCreator = {
  createHighlightBox(
    surface: LuaSurface,
    position: Position,
    bbox: BoundingBox,
    type: CursorBoxRenderType,
  ): LuaEntity | nil {
    return surface.create_entity({
      name: "highlight-box",
      position,
      bounding_box: bbox,
      box_type: type,
      force: "player",
    })
  },
  createSprite(surface: LuaSurface, position: Position, scale: number, sprite: SpritePath): RenderObj<"sprite"> {
    return draw("sprite", {
      sprite,
      x_scale: scale,
      y_scale: scale,
      surface,
      target: position,
    })
  },
}

export const DefaultEntityHighlighter = createHighlightCreator(DefaultHighlightCreator)
