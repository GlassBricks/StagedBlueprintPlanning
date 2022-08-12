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
import { AssemblyPosition, LayerPosition } from "./Assembly"

export interface HighlightEntities {
  /** Error outline when an entity cannot be placed. */
  errorHighlight?: HighlightBoxEntity
  /** Indicator sprite when there is an error highlight in another layer. */
  errorInOtherLayerIndicator?: RenderObj<"sprite">
  /** Blue outline when a lost reference entity is left behind. */
  lostReferenceHighlight?: HighlightBoxEntity

  /** Blueprint sprite when an entity's settings have changed. This may be the sprite "blueprint" or "upgrade-planner". */
  configChangedHighlight?: HighlightBoxEntity
}
declare module "../entity/AssemblyEntity" {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  export interface WorldEntities extends HighlightEntities {}
  export interface LayerProperties {
    hasError?: true
  }
}

/** @noSelf */
export interface EntityHighlighter {
  setHasError(assembly: AssemblyPosition, entity: AssemblyEntity, layerNumber: LayerNumber, value: boolean): void
  updateConfigChangedHighlight(assembly: AssemblyPosition, entity: AssemblyEntity, layerNumber: LayerNumber): void
  updateLostReferenceHighlights(assembly: AssemblyPosition, entity: AssemblyEntity): void

  removeAllHighlights(entity: AssemblyEntity): void
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
const highlightConfigs: {
  [P in keyof HighlightEntities]-?: NonNullable<HighlightEntities[P]> extends RenderObj<"sprite">
    ? SpriteConfig
    : NonNullable<HighlightEntities[P]> extends HighlightBoxEntity
    ? HighlightConfig
    : never
} = {
  errorHighlight: {
    type: "highlight",
    renderType: "not-allowed",
  },
  errorInOtherLayerIndicator: {
    type: "sprite",
    sprite: "utility/danger_icon",
    offset: { x: 0.2, y: 0.1 },
    scale: 0.3,
  },
  lostReferenceHighlight: {
    type: "highlight",
    renderType: "train-visualization",
  },
  configChangedHighlight: {
    // type: "sprite",
    // sprite: "item/blueprint",
    // offset: { x: 0.8, y: 0.1 },
    // scale: 0.6,
    type: "highlight",
    renderType: "pair",
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
      const position = entity.position
      const worldSelectionBox = BBox.translate(selectionBox, getWorldPosition(layer, position))
      result = createHighlightBox(layer.surface, position, worldSelectionBox, config.renderType)
    } else if (config.type === "sprite") {
      const relativePosition = Pos.plus(selectionBox.left_top, selectionBox.size().emul(config.offset))
      const worldPosition = relativePosition.plus(getWorldPosition(layer, entity.position))
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
  function removeHighlightsOfType(entity: AssemblyEntity, type: keyof HighlightEntities): void {
    entity.destroyAllWorldEntities(type)
  }

  function setHighlight(
    entity: AssemblyEntity,
    layer: LayerPosition,
    type: keyof HighlightEntities,
    value: boolean | nil,
  ): void {
    if (value) {
      createHighlight(entity, layer, type)
    } else {
      removeHighlight(entity, layer.layerNumber, type)
    }
  }

  function updateErrorHighlight(entity: AssemblyEntity, layerNumber: LayerNumber, assembly: AssemblyPosition) {
    if (layerNumber < entity.getBaseLayer()) {
      removeHighlight(entity, layerNumber, "errorHighlight")
      removeHighlight(entity, layerNumber, "errorInOtherLayerIndicator")
      return
    }
    const layer = assembly.layers[layerNumber]
    const hasError = entity.getProperty(layerNumber, "hasError")
    const hasErrorElsewhere = !hasError && entity.propertySetInAnyLayer("hasError")
    setHighlight(entity, layer, "errorHighlight", hasError)
    setHighlight(entity, layer, "errorInOtherLayerIndicator", hasErrorElsewhere)
  }

  function setHasError(
    assembly: AssemblyPosition,
    entity: AssemblyEntity,
    layerNumber: LayerNumber,
    value: boolean,
  ): void {
    const hadAnywhere = entity.propertySetInAnyLayer("hasError")
    entity.setProperty(layerNumber, "hasError", value || nil)
    const hasAnywhere = entity.propertySetInAnyLayer("hasError")
    if (hadAnywhere !== hasAnywhere) {
      for (const layer of $range(entity.getBaseLayer(), luaLength(assembly.layers))) {
        updateErrorHighlight(entity, layer, assembly)
      }
    } else {
      updateErrorHighlight(entity, layerNumber, assembly)
    }
  }

  function updateConfigChangedHighlight(assembly: AssemblyPosition, entity: AssemblyEntity, layerNumber: LayerNumber) {
    const hasChanged = entity.hasLayerChanges(layerNumber)
    setHighlight(entity, assembly.layers[layerNumber], "configChangedHighlight", hasChanged)
  }

  function updateLostReferenceHighlights(assembly: AssemblyPosition, entity: AssemblyEntity): void {
    if (entity.isLostReference) {
      for (const layer of $range(entity.getBaseLayer(), luaLength(assembly.layers))) {
        createHighlight(entity, assembly.layers[layer], "lostReferenceHighlight")
      }
    } else {
      removeHighlightsOfType(entity, "lostReferenceHighlight")
    }
  }

  function removeAllHighlights(entity: AssemblyEntity): void {
    entity.clearProperty("hasError")
    for (const type of keys<HighlightEntities>()) {
      removeHighlightsOfType(entity, type)
    }
  }

  return {
    setHasError,
    updateConfigChangedHighlight,
    updateLostReferenceHighlights,
    removeAllHighlights,
  }
}

export const DefaultEntityCreator: HighlightCreator = {
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

export const DefaultHighlightCreator = createHighlightCreator(DefaultEntityCreator)
