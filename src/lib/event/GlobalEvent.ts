/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */
export interface GlobalEvent<A extends any[]> {
  addListener(listener: (...args: A) => void): void
  removeListener(listener: (...args: A) => void): void
  raise(...args: A): void
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface GlobalEventImpl<A extends any[]> extends LuaSet<(...args: A) => void> {}
class GlobalEventImpl<A extends any[]> implements GlobalEvent<A> {
  addListener(listener: (...args: A) => void) {
    this.add(listener)
  }
  removeListener(listener: (...args: A) => void) {
    this.delete(listener)
  }
  raise(...args: A) {
    for (const listener of this) listener(...args)
  }
}

export function globalEvent<A extends any[]>(): GlobalEvent<A> {
  return new GlobalEventImpl<A>()
}
