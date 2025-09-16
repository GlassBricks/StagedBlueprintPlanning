// Copyright (c) 2022 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

/** @noSelfInFile */

import { BoundingBox as PBoundingBox } from "factorio:prototype"
import { BoundingBox } from "factorio:runtime"
import { WithMetatable } from "../_util"
import { Pos, Position, PositionClass } from "./position"

// Down is positive y, right is positive x

const floor = math.floor
const ceil = math.ceil
const setmetatable = globalThis.setmetatable

type BBox = BoundingBox
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface BBoxClass extends WithMetatable<BBox, typeof BBox> {}

function BBox(left_top: Position, right_bottom: Position): BBoxClass {
  return setmetatable({ left_top, right_bottom }, meta)
}

namespace BBox {
  import max = math.max
  import min = math.min
  export function from(data: BBox): BBoxClass {
    return setmetatable(
      {
        left_top: data.left_top,
        right_bottom: data.right_bottom,
      },
      meta,
    )
  }
  export function load(data: BBox): BBoxClass {
    return setmetatable(data, meta)
  }

  export function coords(lx: number, ly: number, rx: number, ry: number): BBoxClass {
    return BBox({ x: lx, y: ly }, { x: rx, y: ry })
  }

  export function around(point: Position, radius: number): BBoxClass {
    return BBox({ x: point.x - radius, y: point.y - radius }, { x: point.x + radius, y: point.y + radius })
  }

  export function normalize(box: PBoundingBox): BBoxClass
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  export function normalize(box: any): BBoxClass {
    return BBox(Pos.normalize(box.left_top || box[1]), Pos.normalize(box.right_bottom || box[2]))
  }

  export function empty(): BBoxClass {
    const pos = { x: 0, y: 0 }
    return BBox(pos, pos)
  }

  export function translate(box: BBox, amount: Position): BBoxClass {
    const { left_top, right_bottom } = box
    const { x: bx, y: by } = amount
    return BBox({ x: left_top.x + bx, y: left_top.y + by }, { x: right_bottom.x + bx, y: right_bottom.y + by })
  }
  export function translateNegative(box: BBox, amount: Position): BBoxClass {
    const { left_top, right_bottom } = box
    const { x: bx, y: by } = amount
    return BBox({ x: left_top.x - bx, y: left_top.y - by }, { x: right_bottom.x - bx, y: right_bottom.y - by })
  }
  export function size(box: BBox): PositionClass {
    const { left_top, right_bottom } = box
    return Pos(right_bottom.x - left_top.x, right_bottom.y - left_top.y)
  }
  export function roundTile(box: BBox): BBoxClass {
    const { left_top, right_bottom } = box
    return BBox({ x: floor(left_top.x), y: floor(left_top.y) }, { x: ceil(right_bottom.x), y: ceil(right_bottom.y) })
  }
  export function roundChunk(box: BBox): BBoxClass {
    // chunk is 32x32
    const { left_top, right_bottom } = box
    return BBox(
      { x: floor(left_top.x / 32) * 32, y: floor(left_top.y / 32) * 32 },
      { x: ceil(right_bottom.x / 32) * 32, y: ceil(right_bottom.y / 32) * 32 },
    )
  }
  export function scale(box: BBox, factor: number): BBoxClass {
    const { left_top, right_bottom } = box
    return BBox(
      { x: left_top.x * factor, y: left_top.y * factor },
      { x: right_bottom.x * factor, y: right_bottom.y * factor },
    )
  }

  export function scaleXY(box: BBox, factorX: number, factorY: number): BBoxClass {
    const { left_top, right_bottom } = box
    return BBox(
      { x: left_top.x * factorX, y: left_top.y * factorY },
      { x: right_bottom.x * factorX, y: right_bottom.y * factorY },
    )
  }
  export function expand(box: BBox, amount: number): BBoxClass {
    const { left_top, right_bottom } = box
    return BBox(
      { x: left_top.x - amount, y: left_top.y - amount },
      { x: right_bottom.x + amount, y: right_bottom.y + amount },
    )
  }
  export function center(box: BBox): PositionClass {
    const { left_top, right_bottom } = box
    return Pos((left_top.x + right_bottom.x) / 2, (left_top.y + right_bottom.y) / 2)
  }
  export function rotateAboutOrigin(box: BBox, direction: defines.direction | nil): BBoxClass {
    if (direction == nil || direction == defines.direction.north) return BBox.from(box)
    const { left_top, right_bottom } = box
    const { x: lx, y: ly } = left_top
    const { x: rx, y: ry } = right_bottom
    if (direction == defines.direction.south) return BBox({ x: -rx, y: -ry }, { x: -lx, y: -ly })
    if (direction == defines.direction.west) return BBox({ x: ly, y: -rx }, { x: ry, y: -lx })
    if (direction == defines.direction.east) return BBox({ x: -ry, y: lx }, { x: -ly, y: rx })

    // diagonal, not yet supported, rotate -45 degrees
    return rotateAboutOrigin(box, (direction + 7) % 8)
  }
  export function intersect(box1: BBox, box2: BBox): BBoxClass {
    const { left_top, right_bottom } = box1
    const { left_top: lt2, right_bottom: rb2 } = box2
    return coords(
      max(left_top.x, lt2.x),
      max(left_top.y, lt2.y),
      min(right_bottom.x, rb2.x),
      min(right_bottom.y, rb2.y),
    )
  }
  export function iterateTiles(box: BBox): LuaIterable<LuaMultiReturn<[x: number, y: number] | []>> {
    const { left_top, right_bottom } = box
    const startX = left_top.x
    const x2 = right_bottom.x
    const y2 = right_bottom.y
    let x = startX
    let y = left_top.y
    return function () {
      if (y >= y2) return
      const retX = x
      const retY = y
      x++
      if (x >= x2) {
        x = startX
        y++
      }
      return $multi(retX, retY)
    } as any
  }
  export function equals(box1: BBox, box2: BBox): boolean {
    const { left_top, right_bottom } = box1
    const { left_top: lt2, right_bottom: rb2 } = box2
    return left_top.x == lt2.x && left_top.y == lt2.y && right_bottom.x == rb2.x && right_bottom.y == rb2.y
  }
  export function isCenteredSquare(box: BBox): boolean {
    const { left_top, right_bottom } = box
    return left_top.x == left_top.y && right_bottom.x == right_bottom.y && left_top.x == -right_bottom.x
  }
  export function isCenteredRectangle(box: BBox): boolean {
    const { left_top, right_bottom } = box
    return left_top.x == -right_bottom.x && left_top.y == -right_bottom.y
  }
  export function contains(box: BBox, point: Position): boolean {
    const { left_top, right_bottom } = box
    return point.x >= left_top.x && point.x <= right_bottom.x && point.y >= left_top.y && point.y <= right_bottom.y
  }
  export function intersectsFully(box: BBox, other: BBox): boolean {
    const { left_top, right_bottom } = box
    const { left_top: lt2, right_bottom: rb2 } = other
    return left_top.x < rb2.x && right_bottom.x > lt2.x && left_top.y < rb2.y && right_bottom.y > lt2.y
  }
  export function asArray(box: BBox): PBoundingBox {
    const { left_top, right_bottom } = box
    return [left_top, right_bottom]
  }
}

const meta: LuaMetatable<BBox, BBoxClass> = {
  __index: BBox as any,
  __tostring() {
    const { left_top, right_bottom } = this
    return `{(${left_top.x}, ${left_top.y}), (${right_bottom.x}, ${right_bottom.y})}`
  },
}
export { BBox }
