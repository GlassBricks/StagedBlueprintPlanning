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

import { RegisterClass } from "../references"
import { Event, Observable, Observer } from "./Observable"
import { Subscription } from "./Subscription"

export interface ObservableMapChange<K extends AnyNotNil, V> {
  map: ObservableMap<K, V>
  key: K
  oldValue: V | nil
  value: V | nil
}

export type MapObserver<K extends AnyNotNil, V> = Observer<ObservableMapChange<K, V>>

export interface ObservableMap<K extends AnyNotNil, V>
  extends Observable<ObservableMapChange<K, V>>,
    LuaPairsIterable<K, V> {
  size(): number
  get(key: K): V | nil
  has(key: K): boolean
  value(): ReadonlyLuaMap<K, V | nil>
}

export interface MutableObservableMap<K extends AnyNotNil, V> extends ObservableMap<K, V> {
  set(key: K, value: V): void
  delete(key: K): void
}

// noinspection JSUnusedLocalSymbols
interface ObservableMapImpl<K extends AnyNotNil, V> extends LuaPairsIterable<K, V> {
  _used: never
}
@RegisterClass("ObservableMap")
class ObservableMapImpl<K extends AnyNotNil, V> implements MutableObservableMap<K, V> {
  private event = new Event<ObservableMapChange<K, V>>()
  private _map = new LuaMap<K, V | nil>()
  private _size = 0

  public subscribe(context: Subscription, observer: MapObserver<K, V>): Subscription {
    return this.event.subscribe(context, observer)
  }

  public subscribeIndependently(observer: MapObserver<K, V>): Subscription {
    return this.event.subscribeIndependently(observer)
  }

  public size(): number {
    return this._size
  }
  public get(key: K): V | nil {
    return this._map.get(key)
  }

  public has(key: K): boolean {
    return this._map.has(key)
  }

  public value(): ReadonlyLuaMap<K, V | nil> {
    return this._map
  }

  public set(key: K, value: V | nil): void {
    const { _map } = this
    const oldValue = _map.get(key)
    if (oldValue !== value) {
      if (oldValue === nil) {
        this._size++
      } else if (value === nil) {
        this._size--
      }
      _map.set(key, value)
      this.event.raise({ map: this, key, oldValue, value })
    }
  }

  public delete(key: K): void {
    this.set(key, nil!)
  }

  // noinspection JSUnusedGlobalSymbols
  __pairs() {
    return pairs(this._map)
  }
}

export function observableMap<K extends AnyNotNil, V>(): MutableObservableMap<K, V> {
  return new ObservableMapImpl<K, V>()
}
