/*
 * Copyright (c) 2022-2023 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { isEmpty } from "../_util"
import { bind, Callback, Func, funcRef, ibind, RegisterClass, registerFunctions } from "../references"
import { Event, Subscribable } from "./Event"
import { Subscription } from "./Subscription"

export interface ChangeObserver<T> {
  invoke(value: T, oldValue: T): void
}
export interface PartialChangeObserver<T> {
  invoke(value: T, oldValue: T | nil): void
}

export type MaybeProperty<T> = Property<T> | T
export type MaybeMutableProperty<T> = Property<T> | MutableProperty<T> | T
export type Mapper<T, U> = Func<(value: T) => U>

@RegisterClass("State")
export abstract class Property<T> implements Subscribable<ChangeObserver<T>> {
  abstract get(): T

  abstract _subscribeIndependently(observer: ChangeObserver<T>): Subscription
  abstract forceNotify(): void
  abstract closeAll(): void

  subscribe(context: Subscription, observer: ChangeObserver<T>): Subscription {
    const subscription = this._subscribeIndependently(observer)
    context.add(subscription)
    return subscription
  }
  _subscribeIndependentlyAndRaise(observer: PartialChangeObserver<T>): Subscription {
    const subscription = this._subscribeIndependently(observer)
    observer.invoke(this.get(), nil)
    return subscription
  }
  subscribeAndRaise(context: Subscription, observer: PartialChangeObserver<T>): Subscription {
    const subscription = this.subscribe(context, observer)
    observer.invoke(this.get(), nil)
    return subscription
  }

  map<V>(mapper: Mapper<T, V>): Property<V> {
    return new MappedProperty(this, mapper)
  }
  flatMap<V>(mapper: Mapper<T, MaybeProperty<V>>): Property<V> {
    return new FlatMappedProperty(this, mapper)
  }

  // utils
  static truthyFn<V>(this: void, value: V): boolean {
    return !!value
  }
  truthy(): Property<boolean> {
    return this.map(funcRef(Property.truthyFn))
  }
}

export abstract class BasicProperty<T> extends Property<T> {
  protected event = new Event<ChangeObserver<T>>()

  _subscribeIndependently(observer: ChangeObserver<T>): Subscription {
    return this.event._subscribeIndependently(observer)
  }

  override forceNotify(): void {
    const value = this.get()
    this.event.raise(value, value)
  }
  override closeAll(): void {
    this.event.closeAll()
  }
}
export function _numObservers(state: Property<unknown>): number {
  return table_size((state as unknown as { event: Event<any> }).event)
}

export interface MutableProperty<T> extends Property<T> {
  set(value: T): void
}

@RegisterClass("MutableState")
class MutablePropertyImpl<T> extends BasicProperty<T> implements MutableProperty<T> {
  public constructor(private value: T) {
    super()
  }
  get(): T {
    return this.value
  }
  public set(value: T): void {
    const oldValue = this.value
    this.value = value
    if (oldValue != value) {
      this.event.raise(value, oldValue)
    }
  }

  __tostring(): string {
    return `MutablePropertyImpl(${this.get()})`
  }
}
export function property<T>(value: T): MutableProperty<T> {
  return new MutablePropertyImpl(value)
}

export function isMutableProperty<T>(property: Property<T>): property is MutableProperty<T> {
  return typeof (property as MutableProperty<T>).set == "function"
}

@RegisterClass("MappedState")
class MappedProperty<T, U> extends BasicProperty<U> {
  private sourceSubscription: Subscription | nil
  private curValue: U | nil

  public constructor(
    private readonly source: Property<T>,
    private readonly mapper: Mapper<T, U>,
  ) {
    super()
  }

  get(): U {
    if (this.sourceSubscription) return this.curValue!
    return this.mapper.invoke(this.source.get())
  }

  private subscribeToSource() {
    const { source, mapper } = this
    this.sourceSubscription?.close()
    this.sourceSubscription = source._subscribeIndependently(ibind(this.sourceListener))
    this.curValue = mapper.invoke(source.get())
  }

  private unsubscribeFromSource() {
    this.sourceSubscription?.close()
    this.sourceSubscription = nil
    this.curValue = nil
  }

  private sourceListener(sourceNewValue: T) {
    if (isEmpty(this.event)) return this.unsubscribeFromSource()

    const { curValue: oldValue, mapper } = this
    const mappedNewValue = mapper.invoke(sourceNewValue)
    if (oldValue == mappedNewValue) return
    this.curValue = mappedNewValue
    this.event.raise(mappedNewValue, oldValue!)
  }

  override _subscribeIndependently(observer: ChangeObserver<U>): Subscription {
    if (!this.sourceSubscription) this.subscribeToSource()
    return super._subscribeIndependently(observer)
  }

  __tostring(): string {
    return `MappedState(${tostring(this.source)})`
  }
}

@RegisterClass("CustomProperty")
class CustomProperty<U> extends BasicProperty<U> {
  private subscriptions: Subscription[] | nil
  private curValue: U | nil

  public constructor(
    private readonly sources: Property<unknown>[],
    private readonly func: Func<() => U>,
  ) {
    super()
  }
  get(): U {
    if (this.subscriptions) return this.curValue!
    return this.func.invoke()
  }

  private subscribeToSources() {
    this.subscriptions = this.sources.map((source) => source._subscribeIndependently(ibind(this.sourceListener)))
    this.curValue = this.func.invoke()
  }

  private unsubscribeFromSources() {
    for (const sub of this.subscriptions!) sub.close()
    this.subscriptions = nil
    this.curValue = nil
  }

  private sourceListener() {
    if (isEmpty(this.event)) return this.unsubscribeFromSources()

    const { curValue: oldValue } = this
    const mappedNewValue = this.func.invoke()
    if (oldValue == mappedNewValue) return
    this.curValue = mappedNewValue
    this.event.raise(mappedNewValue, oldValue!)
  }

  override _subscribeIndependently(observer: ChangeObserver<U>): Subscription {
    if (!this.subscriptions) this.subscribeToSources()
    return super._subscribeIndependently(observer)
  }

  __tostring(): string {
    return `CustomProperty(${this.sources})`
  }
}

// noinspection JSUnusedGlobalSymbols
export function customMap<U>(func: Func<() => U>, ...sources: Property<unknown>[]): Property<U> {
  return new CustomProperty<U>(sources, func)
}
function unwrapValuesAndCall(sources: Property<any>[], func: Func): any {
  const values = []
  for (const i of $range(1, sources.length)) {
    values[i - 1] = sources[i - 1].get()
  }
  return func.invoke(...values)
}

type ToProperties<T> = {
  [K in keyof T]: Property<T[K]>
}
registerFunctions("multiMap", {
  unwrapValuesAndCall,
})
export function multiMap<A extends any[], U>(func: Func<(...args: A) => U>, ...sources: ToProperties<A>): Property<U> {
  const fn = bind(func)
  return new CustomProperty<U>(sources, bind(unwrapValuesAndCall, sources, fn))
}

@RegisterClass("FlatMappedState")
export class FlatMappedProperty<T, U> extends BasicProperty<U> {
  private sourceSubscription: Subscription | nil
  private nestedSubscription: Subscription | nil
  private curValue: U | nil

  public constructor(
    private readonly source: Property<T>,
    private readonly mapper: Mapper<T, MaybeProperty<U>>,
  ) {
    super()
  }

  get(): U {
    if (this.sourceSubscription) return this.curValue!

    const mappedValue = this.mapper.invoke(this.source.get())
    return mappedValue instanceof Property ? mappedValue.get() : mappedValue
  }

  private subscribeToSource() {
    const { source, mapper } = this
    this.sourceSubscription?.close()
    this.sourceSubscription = source._subscribeIndependently(ibind(this.sourceListener))
    this.receiveNewMappedValue(mapper.invoke(source.get()))
  }

  private receiveNewMappedValue(newValue: MaybeProperty<U>) {
    this.nestedSubscription?.close()
    if (newValue instanceof Property) {
      this.nestedSubscription = newValue._subscribeIndependently(ibind(this.nestedListener))
      this.curValue = newValue.get()
    } else {
      this.nestedSubscription = nil
      this.curValue = newValue
    }
  }

  private sourceListener(sourceNewValue: T) {
    if (isEmpty(this.event)) return this.unsubscribeFromSource()

    const { curValue: oldValue, mapper } = this
    const newMappedValue = mapper.invoke(sourceNewValue)
    this.receiveNewMappedValue(newMappedValue)
    const newValue = this.curValue
    if (oldValue != newValue) this.event.raise(newValue!, oldValue!)
  }

  private nestedListener(nestedNewValue: U) {
    if (isEmpty(this.event)) return this.unsubscribeFromSource()
    const oldValue = this.curValue
    this.curValue = nestedNewValue
    if (oldValue != nestedNewValue) this.event.raise(nestedNewValue, oldValue!)
  }

  private unsubscribeFromSource() {
    const { sourceSubscription, nestedSubscription } = this
    if (nestedSubscription) {
      nestedSubscription.close()
      this.nestedSubscription = nil
    }
    if (sourceSubscription) {
      sourceSubscription.close()
      this.sourceSubscription = nil
    }
    this.curValue = nil
  }

  override _subscribeIndependently(observer: ChangeObserver<U>): Subscription {
    if (!this.sourceSubscription) this.subscribeToSource()
    return super._subscribeIndependently(observer)
  }

  __tostring(): string {
    return `FlatMappedState(${tostring(this.source)})`
  }
}

export namespace Props {
  function setValue(state: MutableProperty<unknown>, value: unknown) {
    state.set(value)
  }
  function toggle(state: MutableProperty<boolean>) {
    state.set(!state.get())
  }

  registerFunctions("States", {
    setValue,
    toggle,
  })

  export function setValueFn(state: MutableProperty<unknown>, value: unknown): Callback {
    return bind(setValue, state, value)
  }

  export function toggleFn(state: MutableProperty<boolean>): Callback {
    return bind(toggle, state)
  }
}
