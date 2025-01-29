/*
 * Copyright (c) 2022-2025 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { isEmpty, mutableShallowCopy } from "../_util"
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
  static truthyFn(this: void, value: unknown): boolean {
    return !!value
  }
  truthy(): Property<boolean> {
    return this.map(funcRef(Property.truthyFn))
  }
  static notNilFn(this: void, value: unknown): boolean {
    return value != nil
  }
  notNil(): Property<boolean> {
    return this.map(funcRef(Property.notNilFn))
  }
  static andFn<V>(this: void, outValue: V, thisValue: unknown): V | nil {
    return thisValue ? outValue : nil
  }
  and<V>(other: MaybeProperty<V>): Property<V | nil> {
    return this.flatMap(bind(Property.andFn<MaybeProperty<V>>, other))
  }
  static selectFn<V>(this: void, ifTrue: V, ifFalse: V, value: unknown): V {
    return value ? ifTrue : ifFalse
  }
  // maybe a better name is ITE?
  select<V>(ifTrue: MaybeProperty<V>, ifFalse: MaybeProperty<V>): Property<V> {
    return this.flatMap(bind(Property.selectFn<MaybeProperty<V>>, ifTrue, ifFalse))
  }

  sub<K extends keyof T>(this: MutableProperty<T>, key: K): MutableProperty<T[K]> {
    return new KeyProperty(this as MutableProperty<any>, key)
  }

  index<T>(this: MutableProperty<T[]>, index: number): MutableProperty<T> {
    return this.sub(index + 1)
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
  return table_size(
    (
      state as unknown as {
        event: Event<any>
      }
    ).event,
  )
}

export interface MutableProperty<T> extends Property<T> {
  set(value: T): void
}

@RegisterClass("MutableState")
class MutablePropertyImpl<T> extends BasicProperty<T> implements MutableProperty<T> {
  constructor(private value: T) {
    super()
  }
  get(): T {
    return this.value
  }
  set(value: T): void {
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

  constructor(
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

  checkEmpty() {
    if (isEmpty(this.event)) this.unsubscribeFromSource()
  }
  _checkEmpty = ibind(this.checkEmpty)

  override _subscribeIndependently(observer: ChangeObserver<U>): Subscription {
    if (!this.sourceSubscription) this.subscribeToSource()
    const childSubscription = super._subscribeIndependently(observer)
    childSubscription.add(this._checkEmpty)
    return childSubscription
  }

  __tostring(): string {
    return `MappedState(${tostring(this.source)})`
  }
}

@RegisterClass("CustomProperty")
class CustomProperty<U> extends BasicProperty<U> {
  private subscriptions: Subscription[] | nil
  private curValue: U | nil

  constructor(
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

  checkEmpty() {
    if (isEmpty(this.event)) this.unsubscribeFromSources()
  }
  _checkEmpty = ibind(this.checkEmpty)

  override _subscribeIndependently(observer: ChangeObserver<U>): Subscription {
    if (!this.subscriptions) this.subscribeToSources()
    const subscription = super._subscribeIndependently(observer)
    subscription.add(this._checkEmpty)
    return subscription
  }

  __tostring(): string {
    return `CustomProperty(${tostring(this.sources)})`
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

  constructor(
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

  checkEmpty(): void {
    if (isEmpty(this.event)) this.unsubscribeFromSource()
  }
  _checkEmpty = ibind(this.checkEmpty)

  override _subscribeIndependently(observer: ChangeObserver<U>): Subscription {
    if (!this.sourceSubscription) this.subscribeToSource()
    const subscription = super._subscribeIndependently(observer)
    subscription.add(this._checkEmpty)
    return subscription
  }

  __tostring(): string {
    return `FlatMappedState(${tostring(this.source)})`
  }
}

type AnyTable<T> = Record<keyof any, T>
@RegisterClass("KeyProperty")
export class KeyProperty<T> extends BasicProperty<T> implements MutableProperty<T> {
  private sourceSubscription: Subscription | nil

  constructor(
    private readonly source: MutableProperty<AnyTable<T>>,
    private readonly key: keyof any,
  ) {
    super()
  }

  get(): T {
    return this.source.get()[this.key]
  }

  private subscribeToSource() {
    this.sourceSubscription?.close()
    this.sourceSubscription = this.source._subscribeIndependently(ibind(this.sourceListener))
  }
  private unsubscribeFromSource() {
    this.sourceSubscription?.close()
    this.sourceSubscription = nil
  }
  private sourceListener(newValue: AnyTable<T>, oldValue: AnyTable<T>) {
    if (isEmpty(this.event)) return this.unsubscribeFromSource()

    const { key } = this
    const newSubValue = newValue[key]
    const oldSubValue = oldValue[key]
    if (newSubValue != oldSubValue) this.event.raise(newSubValue, oldSubValue)
  }

  set(value: T): void {
    const source = this.source.get()
    if (source[this.key] == value) return
    const newValue = mutableShallowCopy(source)
    newValue[this.key] = value
    this.source.set(newValue)
  }

  checkEmpty(): void {
    if (isEmpty(this.event)) this.unsubscribeFromSource()
  }
  _checkEmpty = ibind(this.checkEmpty)

  override _subscribeIndependently(observer: ChangeObserver<T>): Subscription {
    if (!this.sourceSubscription) this.subscribeToSource()
    const subscription = super._subscribeIndependently(observer)
    subscription.add(this._checkEmpty)
    return subscription
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
