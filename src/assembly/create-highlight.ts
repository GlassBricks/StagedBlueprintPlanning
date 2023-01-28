/*
 * Copyright (c) 2023 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { DrawParams, SpriteRender } from "../lib"
import draw from "../lib/rendering"

export function createHighlightBox(target: LuaEntity | nil, type: CursorBoxRenderType): LuaEntity | nil {
  if (!target) return nil
  return target.surface.create_entity({
    name: "highlight-box",
    position: target.position,
    source: target,
    box_type: type,
    force: target.force,
  })
}
export function createSprite(params: DrawParams["sprite"]): SpriteRender {
  return draw("sprite", params)
}
export const _mockable = true
