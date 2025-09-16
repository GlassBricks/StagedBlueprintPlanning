// Copyright (c) 2022-2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

/** @noSelfInFile */

import { MapPosition, MapPositionArray } from "factorio:runtime"
import * as util from "util"
import { WithMetatable } from "../_util"

// Down is positive y, right is positive x

const setmetatable = globalThis.setmetatable
const _floor = math.floor
const _ceil = math.ceil

export type Position = MapPosition

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface PositionClass extends WithMetatable<Position, typeof Pos> {}

function Pos(x: number, y: number): PositionClass {
  return setmetatable({ x, y }, meta)
}

namespace Pos {
  import sqrt = math.sqrt
  export function from(position: Position): PositionClass {
    return setmetatable({ x: position.x, y: position.y }, meta)
  }
  export function load(position: Position): PositionClass {
    return setmetatable(position, meta)
  }
  export function normalize(pos: MapPosition | MapPositionArray): PositionClass
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  export function normalize(p: any): PositionClass {
    return Pos(p.x || p[1], p.y || p[2])
  }

  export function plus(pos1: Position, pos2: Position): PositionClass {
    return Pos(pos1.x + pos2.x, pos1.y + pos2.y)
  }
  export function add(pos: Position, x: number, y: number): PositionClass {
    return Pos(pos.x + x, pos.y + y)
  }
  export function minus(pos1: Position, pos2: Position): PositionClass {
    return Pos(pos1.x - pos2.x, pos1.y - pos2.y)
  }
  export function times(pos1: Position, factor: number): PositionClass {
    return Pos(pos1.x * factor, pos1.y * factor)
  }
  export function div(pos1: Position, factor: number): PositionClass {
    return Pos(pos1.x / factor, pos1.y / factor)
  }
  export function emul(pos1: Position, pos2: Position): PositionClass {
    return Pos(pos1.x * pos2.x, pos1.y * pos2.y)
  }
  export function ediv(pos1: Position, pos2: Position): PositionClass {
    return Pos(pos1.x / pos2.x, pos1.y / pos2.y)
  }
  export function floor(pos: Position): PositionClass {
    return Pos(_floor(pos.x), _floor(pos.y))
  }
  export function ceil(pos: Position): PositionClass {
    return Pos(_ceil(pos.x), _ceil(pos.y))
  }
  export function length(pos: Position): number {
    return sqrt(pos.x * pos.x + pos.y * pos.y)
  }
  export function equals(pos1: Position, pos2: Position): boolean {
    return pos1.x == pos2.x && pos1.y == pos2.y
  }
  export function isZero(pos: Position): boolean {
    return pos.x == 0 && pos.y == 0
  }
  export function manhattanDistance(pos1: Position, pos2: Position): number {
    return math.abs(pos1.x - pos2.x) + math.abs(pos1.y - pos2.y)
  }
  export function rotateAboutOrigin(pos: Position, direction: defines.direction | nil): PositionClass {
    if (direction == nil || direction == defines.direction.north) return Pos.from(pos)
    if (direction == defines.direction.south) return Pos(-pos.x, -pos.y)
    if (direction == defines.direction.west) return Pos(pos.y, -pos.x)
    if (direction == defines.direction.east) return Pos(-pos.y, pos.x)
    error(`invalid direction: ${defines.direction[direction]}`)
  }
  export function asArray(pos1: Position): MapPositionArray {
    return [pos1.x, pos1.y]
  }

  export function applyTransformation(
    pos: Position,
    flipHorizontal: boolean,
    flipVertical: boolean,
    rotation: defines.direction | nil,
  ): PositionClass {
    let x = pos.x
    let y = pos.y
    if (flipHorizontal) x = -x
    if (flipVertical) y = -y
    return rotateAboutOrigin({ x, y }, rotation)
  }
}

const meta: LuaMetatable<Position, PositionClass> = {
  __index: Pos as any,
  __tostring: util.positiontostr as any,
}

export { Pos }
