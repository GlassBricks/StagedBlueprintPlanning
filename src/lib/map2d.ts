import { PRecord, PRRecord } from "./util-types"

export type Map2D<T> = PRRecord<number, PRRecord<number, LuaReadonlySet<T>>>
export type MutableMap2D<T> = PRecord<number, PRecord<number, LuaSet<T>>>

export function map2dGet<T>(map: MutableMap2D<T>, x: number, y: number): LuaReadonlySet<T> | nil
export function map2dGet<T>(map: Map2D<T>, x: number, y: number): LuaReadonlySet<T> | nil
export function map2dGet<T>(map: Map2D<T>, x: number, y: number): LuaReadonlySet<T> | nil {
  const byX = map[x]
  return byX && byX[y]
}

export function map2dAdd<T>(map: MutableMap2D<T>, x: number, y: number, value: T): void {
  const byX = map[x] || (map[x] = {})
  const byY = byX[y] || (byX[y] = new LuaSet())
  byY.add(value)
}

export function map2dRemove<T>(map: MutableMap2D<T>, x: number, y: number, value: T): void {
  const byX = map[x]
  if (byX === nil) return
  const byY = byX[y]
  if (byY === nil) return
  byY.delete(value)
  if (next(byY)[0] === nil) {
    delete byX[y]
    if (next(byX)[0] === nil) {
      delete map[x]
    }
  }
}

export function map2dSize<T>(map: MutableMap2D<T>): number
export function map2dSize<T>(map: Map2D<T>): number
export function map2dSize<T>(map: Map2D<T>): number {
  let size = 0
  for (const [, byX] of pairs(map)) {
    for (const [, byY] of pairs(byX)) {
      size += table_size(byY)
    }
  }
  return size
}
