/** @noSelfInFile */

import * as util from "util"
import { DOWN, LEFT, RIGHT, UP } from "./rotation"

// Down is positive y, right is positive x

const setmetatable = globalThis.setmetatable
const _floor = math.floor
const _ceil = math.ceil

export type Position = MapPositionTable
export type PositionClass = WithMetatable<Position, typeof pos>

function pos(x: number, y: number): PositionClass {
  return setmetatable({ x, y }, meta)
}

namespace pos {
  import sqrt = math.sqrt
  export function from(position: Position): PositionClass {
    return setmetatable({ x: position.x, y: position.y }, meta)
  }
  export function load(position: Position): PositionClass {
    return setmetatable(position, meta)
  }
  export function normalize(pos: MapPosition): PositionClass
  export function normalize(p: Any): PositionClass {
    return pos(p.x || p[1], p.y || p[2])
  }

  export function add(pos1: Position, pos2: Position): PositionClass {
    return pos(pos1.x + pos2.x, pos1.y + pos2.y)
  }
  export function sub(pos1: Position, pos2: Position): PositionClass {
    return pos(pos1.x - pos2.x, pos1.y - pos2.y)
  }
  export function times(pos1: Position, factor: number): PositionClass {
    return pos(pos1.x * factor, pos1.y * factor)
  }
  export function div(pos1: Position, factor: number): PositionClass {
    return pos(pos1.x / factor, pos1.y / factor)
  }
  export function emul(pos1: Position, pos2: Position): PositionClass {
    return pos(pos1.x * pos2.x, pos1.y * pos2.y)
  }
  export function ediv(pos1: Position, pos2: Position): PositionClass {
    return pos(pos1.x / pos2.x, pos1.y / pos2.y)
  }
  export function floor(pos1: Position): PositionClass {
    return pos(_floor(pos1.x), _floor(pos1.y))
  }
  export function ceil(pos1: Position): PositionClass {
    return pos(_ceil(pos1.x), _ceil(pos1.y))
  }
  export function length(pos1: Position): number {
    return sqrt(pos1.x * pos1.x + pos1.y * pos1.y)
  }
  export function equals(pos1: Position, pos2: Position): boolean {
    return pos1.x === pos2.x && pos1.y === pos2.y
  }
  export function isZero(pos1: Position): boolean {
    return pos1.x === 0 && pos1.y === 0
  }
  export function rotateAboutOrigin(pos1: Position, direction: defines.direction): PositionClass {
    if (direction === UP) return pos.from(pos1)
    if (direction === DOWN) return pos(-pos1.x, -pos1.y)
    if (direction === LEFT) return pos(pos1.y, -pos1.x)
    if (direction === RIGHT) return pos(-pos1.y, pos1.x)
    error(`invalid direction: ${defines.direction[direction]}`)
  }
}

const meta: LuaMetatable<Position, PositionClass> = {
  __index: pos as any,
  __tostring: util.positiontostr as any,
}

export { pos }
