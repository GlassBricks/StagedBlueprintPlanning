/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of BBPP3.
 *
 * BBPP3 is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * BBPP3 is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with BBPP3. If not, see <https://www.gnu.org/licenses/>.
 */

export interface GlobalEvent<T> {
  addListener(listener: (value: T) => void): void
  raise(value: T): void
}

class GlobalEventImpl<T> implements GlobalEvent<T> {
  private listeners: ((value: T) => void)[] = []

  addListener(listener: (value: T) => void): void {
    this.listeners.push(listener)
  }
  raise(value: T): void {
    for (const listener of this.listeners) {
      listener(value)
    }
  }
}

export function globalEvent<T>(): GlobalEvent<T> {
  return new GlobalEventImpl<T>()
}
