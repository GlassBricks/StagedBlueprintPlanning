// Copyright (c) 2025 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { nil } from "factorio:runtime"

export type Point = [number, number]

class MaxHeap {
  private heap: { dist: number; distCenter: number; x: number; y: number; key: string }[] = []

  push(dist: number, distCenter: number, x: number, y: number, key: string): void {
    this.heap.push({ dist, distCenter, x, y, key })
    this.bubbleUp(this.heap.length - 1)
  }

  pop(): string | nil {
    if (this.heap.length == 0) return nil
    const top = this.heap[0].key
    const last = this.heap.pop()!
    if (this.heap.length > 0) {
      this.heap[0] = last
      this.bubbleDown(0)
    }
    return top
  }

  isEmpty(): boolean {
    return this.heap.length == 0
  }

  private compare(
    a: { dist: number; distCenter: number; x: number; y: number },
    b: { dist: number; distCenter: number; x: number; y: number },
  ): number {
    if (a.dist != b.dist) return b.dist - a.dist
    if (a.distCenter != b.distCenter) return b.distCenter - a.distCenter
    if (a.x != b.x) return a.x - b.x
    return a.y - b.y
  }

  private bubbleUp(i: number): void {
    while (i > 0) {
      const parent = math.floor((i - 1) / 2)
      if (this.compare(this.heap[parent], this.heap[i]) <= 0) break
      ;[this.heap[parent], this.heap[i]] = [this.heap[i], this.heap[parent]]
      i = parent
    }
  }

  private bubbleDown(i: number): void {
    const n = this.heap.length
    while (true) {
      let best = i
      const left = 2 * i + 1
      const right = 2 * i + 2
      if (left < n && this.compare(this.heap[left], this.heap[best]) < 0) {
        best = left
      }
      if (right < n && this.compare(this.heap[right], this.heap[best]) < 0) {
        best = right
      }
      if (best == i) break
      ;[this.heap[i], this.heap[best]] = [this.heap[best], this.heap[i]]
      i = best
    }
  }
}

export function posToKey(p: Point): string {
  return tostring(p[0]) + "," + tostring(p[1])
}

export function keyToPos(k: string): Point {
  const iter = string.gmatch(k, "([^,]+)")
  const x = tonumber(iter()[0])!
  const y = tonumber(iter()[0])!
  return [x, y]
}

const DIRS8: Point[] = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
]

const DIRS4: Point[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]

export function solveSteinerErosion(W: number, H: number, required: LuaSet<string>): LuaSet<string> {
  if (required.isEmpty()) return new LuaSet()
  if (table_size(required) == 1) {
    const copy = new LuaSet<string>()
    for (const k of required) {
      copy.add(k)
    }
    return copy
  }

  const requiredPoints: Point[] = []
  for (const k of required) {
    requiredPoints.push(keyToPos(k))
  }

  let minX = requiredPoints[0][0]
  let maxX = requiredPoints[0][0]
  let minY = requiredPoints[0][1]
  let maxY = requiredPoints[0][1]

  for (const p of requiredPoints) {
    if (p[0] < minX) minX = p[0]
    if (p[0] > maxX) maxX = p[0]
    if (p[1] < minY) minY = p[1]
    if (p[1] > maxY) maxY = p[1]
  }

  const filled = new LuaSet<string>()
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      filled.add(posToKey([x, y]))
    }
  }

  const empty = new LuaSet<string>()
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) {
      const k = posToKey([x, y])
      if (!filled.has(k)) {
        empty.add(k)
      }
    }
  }

  const boundaryEmpty = new LuaSet<string>()
  for (const k of empty) {
    const [x, y] = keyToPos(k)
    if (x == 0 || x == W - 1 || y == 0 || y == H - 1) {
      boundaryEmpty.add(k)
    }
  }

  const reachableEmpty = new LuaSet<string>()
  for (const k of boundaryEmpty) {
    reachableEmpty.add(k)
  }
  const queue: string[] = []
  for (const k of boundaryEmpty) {
    queue.push(k)
  }

  let qi = 0
  while (qi < queue.length) {
    const [x, y] = keyToPos(queue[qi])
    qi++

    for (const [dx, dy] of DIRS4) {
      const nk = posToKey([x + dx, y + dy])
      if (empty.has(nk) && !reachableEmpty.has(nk)) {
        reachableEmpty.add(nk)
        queue.push(nk)
      }
    }
  }

  const holes = new LuaSet<string>()
  for (const k of empty) {
    if (!reachableEmpty.has(k)) {
      holes.add(k)
      filled.add(k)
    }
  }

  const requiredWithHoles = new LuaSet<string>()
  for (const k of required) {
    requiredWithHoles.add(k)
  }
  for (const k of holes) {
    requiredWithHoles.add(k)
  }

  const dist = new LuaMap<string, number>()
  const bfsQueue: string[] = []

  for (const k of requiredWithHoles) {
    dist.set(k, 0)
    bfsQueue.push(k)
  }

  qi = 0
  while (qi < bfsQueue.length) {
    const k = bfsQueue[qi]
    qi++
    const [x, y] = keyToPos(k)
    const d = dist.get(k)!

    for (const [dx, dy] of DIRS8) {
      const nk = posToKey([x + dx, y + dy])
      if (filled.has(nk) && !dist.has(nk)) {
        dist.set(nk, d + 1)
        bfsQueue.push(nk)
      }
    }
  }

  let centerX = 0
  let centerY = 0
  for (const p of requiredPoints) {
    centerX += p[0]
    centerY += p[1]
  }
  centerX = centerX / requiredPoints.length
  centerY = centerY / requiredPoints.length

  function isCandidate(k: string): boolean {
    if (requiredWithHoles.has(k)) return false
    const [x, y] = keyToPos(k)
    for (const [dx, dy] of DIRS4) {
      if (!filled.has(posToKey([x + dx, y + dy]))) {
        return true
      }
    }
    return false
  }

  function canRemove(k: string): boolean {
    const [x, y] = keyToPos(k)
    const neighbors: Point[] = []

    for (const [dx, dy] of DIRS8) {
      const nk = posToKey([x + dx, y + dy])
      if (filled.has(nk)) {
        neighbors.push([x + dx, y + dy])
      }
    }

    if (neighbors.length <= 1) return true

    const visited = new LuaSet<number>()
    visited.add(0)
    const stack = [0]

    while (stack.length > 0) {
      const i = stack.pop()!
      const [cx, cy] = neighbors[i]

      for (let j = 0; j < neighbors.length; j++) {
        if (visited.has(j)) continue
        const [ox, oy] = neighbors[j]
        if (math.abs(cx - ox) <= 1 && math.abs(cy - oy) <= 1) {
          visited.add(j)
          stack.push(j)
        }
      }
    }

    return table_size(visited) == neighbors.length
  }

  const pq = new MaxHeap()
  const inQueue = new LuaSet<string>()

  for (const k of filled) {
    if (isCandidate(k)) {
      const [x, y] = keyToPos(k)
      const dc = (x - centerX) ** 2 + (y - centerY) ** 2
      pq.push(dist.get(k) ?? 0, dc, x, y, k)
      inQueue.add(k)
    }
  }

  while (!pq.isEmpty()) {
    const k = pq.pop()!

    if (!filled.has(k)) continue
    if (!isCandidate(k)) continue
    if (!canRemove(k)) continue

    filled.delete(k)

    const [x, y] = keyToPos(k)
    for (const [dx, dy] of DIRS4) {
      const nx = x + dx
      const ny = y + dy
      const nk = posToKey([nx, ny])
      if (filled.has(nk) && !inQueue.has(nk) && isCandidate(nk)) {
        const dc = (nx - centerX) ** 2 + (ny - centerY) ** 2
        pq.push(dist.get(nk) ?? 0, dc, nx, ny, nk)
        inQueue.add(nk)
      }
    }
  }

  return filled
}

export function pointsToSet(points: Point[]): LuaSet<string> {
  const result = new LuaSet<string>()
  for (const p of points) {
    result.add(posToKey(p))
  }
  return result
}

export function visualize(W: number, H: number, required: LuaSet<string>, filled: LuaSet<string>): string {
  const lines: string[] = []
  for (let y = H - 1; y >= 0; y--) {
    let row = ""
    for (let x = 0; x < W; x++) {
      const k = posToKey([x, y])
      if (required.has(k)) {
        row += "R"
      } else if (filled.has(k)) {
        row += "#"
      } else {
        row += "."
      }
    }
    lines.push(row)
  }
  return table.concat(lines, "\n")
}
