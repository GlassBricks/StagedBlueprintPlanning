// Copyright (c) 2022 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { PRecord } from "./_util"

export class Registry<T extends AnyNotNil> {
  private nameToItem = {} as PRecord<string, T>
  private itemToName = new LuaMap<T, string>()

  constructor(
    protected itemName: string,
    protected getDebugDescription: (item: T) => string,
  ) {}

  registerAs(name: string, item: T): void {
    if (game != nil) {
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
