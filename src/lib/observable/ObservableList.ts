import { bind, Callback, Classes, Functions, Registered } from "../references"
import { Observable } from "./Observable"
import { SingleSubscribable } from "./Observers"

export type ObservableListAdd<T> = {
  list: ObservableList<T>
  type: "add"
  index: number
  value: T
}
export type ObservableListRemove<T> = {
  list: ObservableList<T>
  type: "remove"
  index: number
  value: T
}
export type ObservableListSwap<T> = {
  list: ObservableList<T>
  type: "swap"
  indexA: number
  indexB: number
  newValueA: T
  newValueB: T
}
export type ObservableListSet<T> = {
  list: ObservableList<T>
  type: "set"
  index: number
  oldValue: T
  value: T
}
export type ObservableListChange<T> =
  | ObservableListAdd<T>
  | ObservableListRemove<T>
  | ObservableListSwap<T>
  | ObservableListSet<T>

export interface ObservableList<T extends AnyNotNil> extends Observable<ObservableListChange<T>> {
  length(): number
  value(): readonly T[]
  get(index: number): T
}

export interface MutableObservableList<T extends AnyNotNil> extends ObservableList<T> {
  set(index: number, value: T): void
  insert(index: number, value: T): void
  remove(index: number): void
  push(value: T): void
  pop(): T
  swap(indexA: number, indexB: number): void
}

@Classes.register()
class ObservableListImpl<T extends AnyNotNil>
  extends SingleSubscribable<ObservableListChange<T>>
  implements MutableObservableList<T>
{
  private array: T[] = []

  public length(): number {
    return this.array.length
  }

  public value(): readonly T[] {
    return this.array
  }

  public get(index: number): T {
    return this.array[index]
  }

  public set(index: number, value: T): void {
    const { array } = this
    const oldValue = array[index]
    if (oldValue !== value) {
      array[index] = value
      this.fire({
        list: this,
        type: "set",
        index,
        oldValue,
        value,
      })
    }
  }

  public insert(index: number, value: T): void {
    const { array } = this
    table.insert(array, index + 1, value)
    this.fire({
      list: this,
      type: "add",
      index,
      value,
    })
  }

  public remove(index: number): T {
    const { array } = this
    const oldValue = array[index]
    table.remove(array, index + 1)
    this.fire({
      list: this,
      type: "remove",
      index,
      value: oldValue,
    })
    return oldValue
  }

  public push(value: T): void {
    this.insert(this.array.length, value)
  }

  public pop(): T {
    return this.remove(this.array.length - 1)
  }

  public swap(indexA: number, indexB: number): void {
    const { array } = this
    const oldValueA = array[indexA]
    const oldValueB = array[indexB]
    array[indexA] = oldValueB
    array[indexB] = oldValueA
    this.fire({
      list: this,
      type: "swap",
      indexA,
      indexB,
      newValueA: oldValueB,
      newValueB: oldValueA,
    })
  }
}

export function observableList<T extends AnyNotNil>(): MutableObservableList<T> {
  return new ObservableListImpl<T>()
}

export interface ObserveEachFn<T extends object> extends Registered {
  (this: unknown, value: T, index: number, type: "add"): Callback[] | undefined
  (this: unknown, value: T, index: number, type: "swap"): void
  (this: unknown, value: T, index: number, type: "remove"): void
}
export function observeEachUnique<T extends object>(
  list: ObservableList<T>,
  fn: ObserveEachFn<T>,
  fireNow?: boolean,
): Callback {
  const listener = bind(observeEachListener, fn, new LuaMap<T, Callback[] | undefined>())
  const cb = list.subscribe(listener)
  if (fireNow) {
    for (const [index, value] of ipairs(list.value())) {
      listener({
        list,
        type: "add",
        value,
        index: index - 1,
      })
    }
  }
  return cb
}
function observeEachListener<T extends object>(
  this: ObserveEachFn<T>,
  callbacks: MutableLuaMap<T, Callback[] | undefined>,
  change: ObservableListChange<T>,
): void {
  const { type } = change
  if (type === "add") {
    const { index, value } = change
    const callback = this(value, index, type)
    callbacks.set(value, callback)
  } else if (type === "remove") {
    const { value } = change
    const callback = callbacks.get(value)
    if (callback) {
      callbacks.set(value, undefined)
      for (const cb of callback) cb()
    }
    this(value, change.index, type)
  } else if (type === "set") {
    const { value, oldValue, index } = change
    const oldCallback = callbacks.get(oldValue)
    if (oldCallback) {
      callbacks.set(oldValue, undefined)
      for (const cb of oldCallback) cb()
    }
    this(oldValue, index, "remove")
    const callback = this(value, index, "add")
    callbacks.set(value, callback)
  } else if (type === "swap") {
    const { indexA, indexB, newValueA, newValueB } = change
    this(newValueA, indexA, "swap")
    this(newValueB, indexB, "swap")
  }
}
Functions.registerAll({ observeEachListener })
