/** @noSelfInFile */

import * as util from "util"

// Down is positive y, right is positive x

const setmetatable = globalThis.setmetatable
const _floor = math.floor
const _ceil = math.ceil

export type Position = MapPositionTable
export type PositionClass = WithMetatable<Position, typeof Pos>

export type Vec2 = Position

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
  export function normalize(pos: MapPosition): PositionClass
  export function normalize(p: Any): PositionClass {
    return Pos(p.x || p[1], p.y || p[2])
  }

  export function plus(pos1: Position, pos2: Position): PositionClass {
    return Pos(pos1.x + pos2.x, pos1.y + pos2.y)
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
  export function floor(pos1: Position): PositionClass {
    return Pos(_floor(pos1.x), _floor(pos1.y))
  }
  export function ceil(pos1: Position): PositionClass {
    return Pos(_ceil(pos1.x), _ceil(pos1.y))
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
    if (direction === defines.direction.north) return Pos.from(pos1)
    if (direction === defines.direction.south) return Pos(-pos1.x, -pos1.y)
    if (direction === defines.direction.west) return Pos(pos1.y, -pos1.x)
    if (direction === defines.direction.east) return Pos(-pos1.y, pos1.x)
    error(`invalid direction: ${defines.direction[direction]}`)
  }
}

const meta: LuaMetatable<Position, PositionClass> = {
  __index: Pos as any,
  __tostring: util.positiontostr as any,
}

export { Pos }
