// noinspection JSUnusedLocalSymbols

import { RegisterClass } from "../references"
import { Event, ValueListener, ValueSubscribable } from "./Observable"
import { Subscription } from "./Subscription"

export interface ObservableMapChange<K extends AnyNotNil, V> {
  map: ObservableMap<K, V>
  key: K
  oldValue: V | undefined
  value: V | undefined
}

export type MapObserver<K extends AnyNotNil, V> = ValueListener<ObservableMapChange<K, V>>

export interface ObservableMap<K extends AnyNotNil, V>
  extends ValueSubscribable<ObservableMapChange<K, V>>,
    LuaPairsIterable<K, V> {
  size(): number
  get(key: K): V | undefined
  has(key: K): boolean
  value(): LuaMap<K, V | undefined>
}

export interface MutableObservableMap<K extends AnyNotNil, V> extends ObservableMap<K, V> {
  set(key: K, value: V): void
  delete(key: K): void
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface ObservableMapImpl<K extends AnyNotNil, V> extends LuaPairsIterable<K, V> {}
@RegisterClass("ObservableMap")
class ObservableMapImpl<K extends AnyNotNil, V> implements MutableObservableMap<K, V> {
  private event = new Event<ObservableMapChange<K, V>>()
  private _map = new LuaMap<K, V | undefined>()
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
  public get(key: K): V | undefined {
    return this._map.get(key)
  }

  public has(key: K): boolean {
    return this._map.has(key)
  }

  public value(): LuaMap<K, V | undefined> {
    return this._map
  }

  public set(key: K, value: V | undefined): void {
    const { _map } = this
    const oldValue = _map.get(key)
    if (oldValue !== value) {
      if (oldValue === undefined) {
        this._size++
      } else if (value === undefined) {
        this._size--
      }
      _map.set(key, value)
      this.event.raise({ map: this, key, oldValue, value })
    }
  }

  public delete(key: K): void {
    this.set(key, undefined!)
  }

  // noinspection JSUnusedGlobalSymbols
  __pairs() {
    return pairs(this._map)
  }
}

export function observableMap<K extends AnyNotNil, V>(): MutableObservableMap<K, V> {
  return new ObservableMapImpl<K, V>()
}
