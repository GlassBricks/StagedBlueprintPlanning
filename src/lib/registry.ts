/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of 100% Blueprint Planning.
 *
 * 100% Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * 100% Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with 100% Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { PRecord } from "./util-types"

export class Registry<T extends AnyNotNil> {
  private nameToItem = {} as PRecord<string, T>
  private itemToName = new LuaMap<T, string>()

  constructor(protected itemName: string, protected getDebugDescription: (item: T) => string) {}

  registerRaw(name: string, item: T): void {
    if (game !== nil) {
      error("This operation must only be done during script load.")
    }
    const existingItem = this.nameToItem[name]
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
    return this.nameToItem[name] ?? error(`could not find ${this.itemName} with name ${name}`)
  }
  getOrNil(name: string): T | nil {
    return this.nameToItem[name]
  }

  _nameToItem(): PRecord<string, T> {
    return this.nameToItem
  }

  nameOf(item: T): string {
    return (
      this.itemToName.get(item) ??
      error(`The given ${this.itemName} was not registered: ${this.getDebugDescription(item)}`)
    )
  }
}
