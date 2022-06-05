import { PRecord, PRRecord } from "./util-types"

export type Map2D<T> = PRRecord<number, PRRecord<number, LuaSet<T>>>
export type MutableMap2D<T> = PRecord<number, PRecord<number, MutableLuaSet<T>>>

export function get<T>(map: MutableMap2D<T>, x: number, y: number): LuaSet<T> | undefined
export function get<T>(map: Map2D<T>, x: number, y: number): LuaSet<T> | undefined
export function get<T>(map: Map2D<T>, x: number, y: number): LuaSet<T> | undefined {
  const byX = map[x]
  return byX && byX[y]
}

export function add<T>(map: MutableMap2D<T>, x: number, y: number, value: T): void {
  const byX = map[x] || (map[x] = {})
  const byY = byX[y] || (byX[y] = new LuaSet())
  byY.add(value)
}

export function remove<T>(map: MutableMap2D<T>, x: number, y: number, value: T): void {
  const byX = map[x]
  if (byX === undefined) return
  const byY = byX[y]
  if (byY === undefined) return
  byY.delete(value)
  if (byY.first() === undefined) {
    delete byX[y]
    if (next(byX)[0] === undefined) {
      delete map[x]
    }
  }
}
