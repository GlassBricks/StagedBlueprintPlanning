// noinspection JSUnusedLocalSymbols

import { Classes } from "../references"
import { Observable } from "./Observable"
import { SingleSubscribable } from "./Observers"

export interface ObservableSetChange<T> {
  set: ObservableSet<T>
  value: T
  added?: true
}

export interface ObservableSet<T> extends Observable<ObservableSetChange<T>>, LuaSetIterable<T> {
  size(): number
  has(value: T): boolean
  value(): LuaSet<T>
}

export interface MutableObservableSet<T> extends ObservableSet<T> {
  add(value: T): void
  delete(value: T): void
}

export function observableSet<T>(): MutableObservableSet<T> {
  return new ObservableSetImpl()
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface ObservableSetImpl<T> extends LuaSetIterable<T> {}

@Classes.register()
class ObservableSetImpl<T> extends SingleSubscribable<ObservableSetChange<T>> implements MutableObservableSet<T> {
  private set = new LuaSet<T>()
  private _size = 0

  public has(value: T): boolean {
    return this.value().has(value)
  }

  public value(): LuaSet<T> {
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
      this.fire({ set: this, value, added: true })
    }
  }

  public delete(value: T): void {
    const { set } = this
    if (set.has(value)) {
      set.delete(value)
      this._size--
      this.fire({ set: this, value })
    }
  }

  // noinspection JSUnusedGlobalSymbols
  __pairs() {
    return pairs(this.set)
  }
}
