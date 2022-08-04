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

import { AssemblyEntity, LayerNumber } from "../entity/AssemblyEntity"
import { getWorldPosition } from "../entity/EntityHandler"
import { BBox, Position } from "../lib/geometry"
import draw, { RenderObj } from "../lib/rendering"
import { AssemblyPosition, LayerPosition } from "./Assembly"

declare module "../entity/Entity" {
  export interface WorldEntityTypes {
    errorHighlight: HighlightBoxEntity
    errorIndicator: RenderObj<"sprite">
  }
}

/** @noSelf */
export interface EntityHighlighter {
  setErrorHighlightAt(
    assembly: AssemblyPosition,
    entity: AssemblyEntity,
    layerNumber: LayerNumber,
    value: boolean,
  ): void

  deleteAllHighlights(entity: AssemblyEntity): void
}

/** @noSelf */
export interface HighlightCreator {
  createHighlight(
    surface: LuaSurface,
    position: Position,
    bbox: BoundingBox,
    type: CursorBoxRenderType,
  ): LuaEntity | nil

  createSprite(surface: LuaSurface, position: Position, scale: number, sprite: SpritePath): RenderObj<"sprite">
}

const enum HighlightCreatorConstants {
  IndicatorBBoxOffsetX = 0.2,
  IndicatorBBoxOffsetY = 0.1,
  IndicatorScale = 0.3,
}

declare const luaLength: LuaLength<table, number>

export function createHighlightCreator(entityCreator: HighlightCreator): EntityHighlighter {
  const { createHighlight, createSprite } = entityCreator

  function removeErrorHighlight(entity: AssemblyEntity, layerNumber: number, assembly: AssemblyPosition): void {
    entity.replaceWorldEntity(layerNumber, nil, "errorHighlight")
    if (entity.hasAnyWorldEntity("errorHighlight")) {
      // other layers have highlights, create indicator here
      createErrorIndicator(assembly, entity, layerNumber)
    } else {
      // no more highlights, delete all indicators
      removeAllErrorIndicators(entity)
    }
  }

  function createErrorHighlight(entity: AssemblyEntity, layerNumber: number, assembly: AssemblyPosition): void {
    if (layerNumber < entity.getBaseLayer()) return removeErrorHighlight(entity, layerNumber, assembly)

    const existingHighlight = entity.getWorldEntity(layerNumber, "errorHighlight")
    if (existingHighlight) return

    // remove indicator
    entity.replaceWorldEntity(layerNumber, nil, "errorIndicator")

    const hadAnyHighlight = entity.hasAnyWorldEntity("errorHighlight")

    const layer = assembly.layers[layerNumber]
    const highlight = createHighlightEntity(entity, layer)
    entity.replaceWorldEntity(layerNumber, highlight, "errorHighlight")

    if (!hadAnyHighlight) {
      // now there is a highlight, create all indicators
      createAllErrorIndicators(assembly, entity)
    }
  }

  function createErrorIndicator(assembly: AssemblyPosition, entity: AssemblyEntity, layerNumber: LayerNumber): void {
    if (layerNumber < entity.getBaseLayer() || entity.getWorldEntity(layerNumber, "errorHighlight")) {
      entity.replaceWorldEntity(layerNumber, nil, "errorIndicator")
      return
    }
    const layer = assembly.layers[layerNumber]
    const indicator = createErrorIndicatorEntity(entity, layer)
    entity.replaceWorldEntity(layerNumber, indicator, "errorIndicator")
  }

  function createAllErrorIndicators(assembly: AssemblyPosition, entity: AssemblyEntity): void {
    const minLayer = entity.getBaseLayer()
    const maxLayer = luaLength(assembly.layers)
    for (const layers of $range(minLayer, maxLayer)) {
      createErrorIndicator(assembly, entity, layers)
    }
  }

  function removeAllErrorIndicators(entity: AssemblyEntity): void {
    entity.destroyAllWorldEntities("errorIndicator")
  }

  function setErrorHighlightAt(
    assembly: AssemblyPosition,
    entity: AssemblyEntity,
    layerNumber: LayerNumber,
    value: boolean,
  ): void {
    if (layerNumber < entity.getBaseLayer()) return removeErrorHighlight(entity, layerNumber, assembly) // bug?
    if (value) {
      createErrorHighlight(entity, layerNumber, assembly)
    } else {
      removeErrorHighlight(entity, layerNumber, assembly)
    }
  }

  function createHighlightEntity(entity: AssemblyEntity, layer: LayerPosition) {
    const prototypeName = entity.categoryName
    const position = entity.position
    const selectionBox = BBox.translate(
      game.entity_prototypes[prototypeName].selection_box,
      getWorldPosition(position, layer),
    )
    return createHighlight(layer.surface, position, selectionBox, "not-allowed")!
  }

  function createErrorIndicatorEntity(entity: AssemblyEntity, layer: LayerPosition) {
    const prototypeName = entity.categoryName
    const position = entity.position
    const box = BBox.load(game.entity_prototypes[prototypeName].selection_box)
    const size = box.size()
    const indicatorPosition = box
      .getTopRight()
      .plus({
        x: -size.x * HighlightCreatorConstants.IndicatorBBoxOffsetX,
        y: size.y * HighlightCreatorConstants.IndicatorBBoxOffsetY,
      })
      .plus(getWorldPosition(position, layer))

    return createSprite(
      layer.surface,
      indicatorPosition,
      HighlightCreatorConstants.IndicatorScale,
      "utility/danger_icon",
    )
  }

  function deleteAllHighlights(entity: AssemblyEntity): void {
    entity.destroyAllWorldEntities("errorHighlight")
    entity.destroyAllWorldEntities("errorIndicator")
  }

  return {
    setErrorHighlightAt,
    deleteAllHighlights,
  }
}

export const DefaultEntityCreator: HighlightCreator = {
  createHighlight(
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
    })!
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
