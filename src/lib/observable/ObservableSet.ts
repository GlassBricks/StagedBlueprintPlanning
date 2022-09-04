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

import { RegisterClass } from "../references"
import { Event, Observable, Observer } from "./Observable"
import { Subscription } from "./Subscription"

export interface ObservableSetChange<T extends AnyNotNil> {
  set: ObservableSet<T>
  value: T
  added?: true
}

export type SetObserver<T extends AnyNotNil> = Observer<ObservableSetChange<T>>

export interface ObservableSet<T extends AnyNotNil> extends Observable<ObservableSetChange<T>>, LuaPairsKeyIterable<T> {
  size(): number
  has(value: T): boolean
  value(): ReadonlyLuaSet<T>
}

export interface MutableObservableSet<T extends AnyNotNil> extends ObservableSet<T> {
  add(value: T): void
  delete(value: T): void
}

export function observableSet<T extends AnyNotNil>(): MutableObservableSet<T> {
  return new ObservableSetImpl()
}

// noinspection JSUnusedLocalSymbols
interface ObservableSetImpl<T extends AnyNotNil> extends LuaPairsKeyIterable<T> {
  _used: never
}

@RegisterClass("ObservableSet")
class ObservableSetImpl<T extends AnyNotNil> implements MutableObservableSet<T> {
  private event = new Event<ObservableSetChange<T>>()
  private set = new LuaSet<T>()
  private _size = 0

  public subscribe(context: Subscription, observer: SetObserver<T>): Subscription {
    return this.event.subscribe(context, observer)
  }
  subscribeIndependently(observer: SetObserver<T>): Subscription {
    return this.event.subscribeIndependently(observer)
  }

  public has(value: T): boolean {
    return this.value().has(value)
  }

  public value(): ReadonlyLuaSet<T> {
    return this.set
  }

  public size(): number {
    return this._size
  }

  public add(value: T): void {
    const { set } = this
    if (!set.has(value)) {
      set.add(value)
      this._size++
      this.event.raise({ set: this, value, added: true })
    }
  }

  public delete(value: T): void {
    const { set } = this
    if (set.has(value)) {
      set.delete(value)
      this._size--
      this.event.raise({ set: this, value })
    }
  }

  // noinspection JSUnusedGlobalSymbols
  __pairs() {
    return pairs(this.set)
  }
}
