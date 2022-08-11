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
import { getSelectionBox } from "../entity/entity-info"
import { getWorldPosition } from "../entity/EntityHandler"
import { assertNever } from "../lib"
import { BBox, Pos, Position } from "../lib/geometry"
import draw, { RenderObj } from "../lib/rendering"
import { AssemblyPosition, LayerPosition } from "./Assembly"

interface HighlightEntities {
  errorHighlight?: HighlightBoxEntity
  errorIndicator?: RenderObj<"sprite">
  lostReferenceHighlight?: HighlightBoxEntity
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

  removeErrorHighlights(entity: AssemblyEntity): void
  updateLostReferenceHighlights(assembly: AssemblyPosition, entity: AssemblyEntity): void
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
  readonly name: keyof HighlightEntities
  readonly renderType: CursorBoxRenderType
}

interface SpriteConfig {
  readonly type: "sprite"
  readonly name: keyof HighlightEntities
  readonly sprite: SpritePath
  readonly offset: Position
  readonly scale: number
}
const highlightConfigs: {
  [P in keyof HighlightEntities]-?: HighlightConfig | SpriteConfig
} = {
  errorHighlight: {
    type: "highlight",
    name: "errorHighlight",
    renderType: "not-allowed",
  },
  errorIndicator: {
    type: "sprite",
    name: "errorIndicator",
    sprite: "utility/danger_icon",
    offset: { x: 0.8, y: 0.1 },
    scale: 0.3,
  },
  lostReferenceHighlight: {
    type: "highlight",
    name: "lostReferenceHighlight",
    renderType: "pair",
  },
}

declare const luaLength: LuaLength<table, number>

export function createHighlightCreator(entityCreator: HighlightCreator): EntityHighlighter {
  const { createHighlightBox, createSprite } = entityCreator

  function createHighlight(entity: AssemblyEntity, layer: LayerPosition, type: keyof HighlightEntities): void {
    const existing = entity.getWorldEntity(layer.layerNumber, type)
    if (existing) return

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
  }
  function removeHighlight(entity: AssemblyEntity, layerNumber: LayerNumber, type: keyof HighlightEntities): void {
    entity.destroyWorldEntity(layerNumber, type)
  }
  function removeAllHighlights(entity: AssemblyEntity, type: keyof HighlightEntities): void {
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
      removeHighlight(entity, layerNumber, "errorIndicator")
      return
    }
    const layer = assembly.layers[layerNumber]
    const hasError = entity.getProperty(layerNumber, "hasError")
    const hasErrorElsewhere = !hasError && entity.propertySetInAnyLayer("hasError")
    setHighlight(entity, layer, "errorHighlight", hasError)
    setHighlight(entity, layer, "errorIndicator", hasErrorElsewhere)
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

  function removeErrorHighlights(entity: AssemblyEntity): void {
    removeAllHighlights(entity, "errorHighlight")
    removeAllHighlights(entity, "errorIndicator")
    entity.clearProperty("hasError")
  }

  function updateLostReferenceHighlights(assembly: AssemblyPosition, entity: AssemblyEntity): void {
    if (entity.isLostReference) {
      for (const layer of $range(entity.getBaseLayer(), luaLength(assembly.layers))) {
        createHighlight(entity, assembly.layers[layer], "lostReferenceHighlight")
      }
    } else {
      removeAllHighlights(entity, "lostReferenceHighlight")
    }
  }

  return {
    setHasError,
    removeErrorHighlights,
    updateLostReferenceHighlights,
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
