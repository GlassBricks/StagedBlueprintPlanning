// Copyright (c) 2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { CursorBoxRenderType, LuaEntity, LuaRendering, LuaRenderObject } from "factorio:runtime"

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
export function createSprite(params: Parameters<LuaRendering["draw_sprite"]>[0]): LuaRenderObject {
  return rendering.draw_sprite(params)
}
export const _mockable = true
