import { PRecord, PRRecord } from "./util-types"

export type Map2D<T> = PRRecord<number, PRRecord<number, LuaSet<T>>>
export type MutableMap2D<T> = PRecord<number, PRecord<number, MutableLuaSet<T>>>

export function map2dGet<T>(map: MutableMap2D<T>, x: number, y: number): LuaSet<T> | nil
export function map2dGet<T>(map: Map2D<T>, x: number, y: number): LuaSet<T> | nil
export function map2dGet<T>(map: Map2D<T>, x: number, y: number): LuaSet<T> | nil {
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
  if (byY.first() === nil) {
    delete byX[y]
    if (next(byX)[0] === nil) {
      delete map[x]
    }
  }
}
