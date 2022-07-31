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

export class Registry<T> {
  private nameToItem = {} as Record<string, T>
  private itemToName = new LuaTable<T, string>()

  constructor(protected itemName: string, protected getDebugDescription: (item: T) => string) {}

  registerRaw(name: string, item: T): void {
    if (game) {
      error("This operation must only be done during script load.")
    }
    const existingItem: T = this.nameToItem[name]
    if (existingItem) {
      error(
        `${this.itemName} with the name "${name}" is already registered, existing is: ${this.getDebugDescription(
          existingItem,
        )}`,
      )
    }

    const existingName = this.itemToName.get(item)
    if (existingName) {
      error(
        `${this.itemName} registered with different names, existing is: ${existingName}, tried to register again as ${name}`,
      )
    }

    this.nameToItem[name] = item
    this.itemToName.set(item, name)
  }

  get(name: string): T {
    return this.nameToItem[name] || error(`could not find ${this.itemName} with name ${name}`)
  }
  getOrNil(name: string): T | nil {
    return this.nameToItem[name]
  }

  _nameToItem(): Record<string, T> {
    return this.nameToItem
  }

  nameOf(item: T): string {
    return (
      this.itemToName.get(item) ??
      error(`The given ${this.itemName} was not registered: ${this.getDebugDescription(item)}`)
    )
  }
}
