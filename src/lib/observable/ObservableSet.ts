// noinspection JSUnusedLocalSymbols

import { RegisterClass } from "../references"
import { Event, Observable, ValueListener } from "./Observable"
import { Subscription } from "./Subscription"

export interface ObservableSetChange<T> {
  set: ObservableSet<T>
  value: T
  added?: true
}

export type SetObserver<T> = ValueListener<ObservableSetChange<T>>

export interface ObservableSet<T> extends Observable<ObservableSetChange<T>>, LuaPairsKeyIterable<T> {
  size(): number
  has(value: T): boolean
  value(): ReadonlyLuaSet<T>
}

export interface MutableObservableSet<T> extends ObservableSet<T> {
  add(value: T): void
  delete(value: T): void
}

export function observableSet<T>(): MutableObservableSet<T> {
  return new ObservableSetImpl()
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface ObservableSetImpl<T> extends LuaPairsKeyIterable<T> {}

@RegisterClass("ObservableSet")
class ObservableSetImpl<T> implements MutableObservableSet<T> {
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
