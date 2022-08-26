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

import { bind, Callback, cfuncRef, Func, funcOn, funcRef, RegisterClass } from "../references"
import { isEmpty } from "../util"
import { ObserverList, Subscribable } from "./Observable"
import { Subscription } from "./Subscription"

export interface ChangeListener<T> {
  invoke(subscription: Subscription, value: T, oldValue: T): void
}

export interface PartialChangeListener<T> {
  invoke(subscription: Subscription, value: T, oldValue: T | nil): void
}

export type MaybeState<T> = State<T> | T
export type MaybeMutableState<T> = MutableState<T> | T

@RegisterClass("State")
export abstract class State<T> implements Subscribable<ChangeListener<T>> {
  abstract get(): T

  protected event = new ObserverList<ChangeListener<T>>()
  subscribeIndependently(observer: ChangeListener<T>): Subscription {
    return this.event.subscribeIndependently(observer)
  }

  subscribe(context: Subscription, observer: ChangeListener<T>): Subscription {
    const subscription = this.subscribeIndependently(observer)
    context.add(subscription)
    return subscription
  }

  private static subFn(this: void, key: keyof any, value: Record<keyof any, any> | nil): any {
    return value && value[key]
  }
  subscribeIndependentlyAndFire(observer: PartialChangeListener<T>): Subscription {
    const subscription = this.subscribeIndependently(observer)
    observer.invoke(subscription, this.get(), nil)
    return subscription
  }

  map<V>(mapper: Mapper<T, V>): State<V> {
    return new MappedState(this, mapper)
  }

  flatMap<V>(mapper: Mapper<T, MaybeState<V>>): State<V> {
    return new FlatMappedState(this, mapper)
  }

  switch<V>(whenTruthy: V, whenFalsy: V): State<V> {
    return this.map(bind(State.switchFn, whenTruthy, whenFalsy)) as State<V>
  }
  static switchFn<V>(this: void, whenTrue: V, whenFalse: V, value: unknown): V {
    return value ? whenTrue : whenFalse
  }
  truthy(): State<boolean> {
    return this.map(funcRef(State.truthyFn))
  }
  static truthyFn<V>(this: void, value: V): boolean {
    return !!value
  }

  static gtFn(this: void, value: number, value2: number): boolean {
    return value2 > value
  }
  gt(this: State<number>, value: number): State<boolean> {
    return this.map(bind(State.gtFn, value)) as State<boolean>
  }

  subscribeAndFire(context: Subscription, observer: PartialChangeListener<T>): Subscription {
    const subscription = this.subscribe(context, observer)
    observer.invoke(subscription, this.get(), nil)
    return subscription
  }
  sub<K extends keyof T>(key: K): State<T[K]> {
    return this.map(bind(State.subFn, key)) as State<T[K]>
  }
  nullableSub<T, K extends keyof T>(this: State<T | nil>, key: K): State<T[K] | nil> {
    return this.map(bind(State.subFn, key)) as State<T[K]>
  }

  static _numObservers(state: State<any>): number {
    return table_size(state.event)
  }
}

export type Mapper<T, U> = Func<(value: T) => U>

export interface MutableState<T> extends State<T> {
  readonly value: T
  set(value: T): void

  forceNotify(): void

  setValueFn(value: T): Callback
  toggleFn(this: MutableState<boolean>): Callback
}

@RegisterClass("MutableState")
class MutableStateImpl<T> extends State<T> implements MutableState<T> {
  public constructor(public value: T) {
    super()
  }

  get(): T {
    return this.value
  }

  public set(value: T): void {
    const oldValue = this.value
    this.value = value
    if (oldValue !== value) {
      this.event.raise(value, oldValue)
    }
  }

  public forceNotify(value: T = this.value): void {
    const oldValue = this.value
    this.value = value
    this.event.raise(value, oldValue)
  }

  private static setValueFn(this: MutableStateImpl<any>, value: unknown) {
    this.set(value)
  }
  setValueFn(value: T): Callback {
    return bind(cfuncRef(MutableStateImpl.setValueFn), this, value)
  }
  private static toggleFn(this: MutableState<boolean>) {
    this.set(!this.value)
  }
  toggleFn(this: MutableState<boolean>): Callback {
    return bind(MutableStateImpl.toggleFn, this)
  }
}
export function state<T>(value: T): MutableState<T> {
  return new MutableStateImpl(value)
}

export function isMutableState<T>(state: State<T>): state is MutableState<T> {
  return state instanceof MutableStateImpl
}

@RegisterClass("MappedState")
class MappedState<T, U> extends State<U> {
  private sourceSubscription: Subscription | nil
  private curValue: U | nil

  public constructor(private readonly source: State<T>, private readonly mapper: Mapper<T, U>) {
    super()
  }

  get(): U {
    if (this.sourceSubscription) return this.curValue!
    return this.mapper.invoke(this.source.get())
  }

  private subscribeToSource() {
    const { source, mapper } = this
    this.sourceSubscription?.close()
    this.sourceSubscription = source.subscribeIndependently(funcOn(this.sourceListener))
    this.curValue = mapper.invoke(source.get())
  }

  private unsubscribeFromSource() {
    this.sourceSubscription?.close()
    this.sourceSubscription = nil
    this.curValue = nil
  }

  sourceListener(_: Subscription, sourceNewValue: T) {
    if (isEmpty(this.event)) return this.unsubscribeFromSource()

    const { curValue: oldValue, mapper } = this
    const mappedNewValue = mapper.invoke(sourceNewValue)
    if (oldValue === mappedNewValue) return
    this.curValue = mappedNewValue
    this.event.raise(mappedNewValue, oldValue!)
  }

  override subscribeIndependently(observer: ChangeListener<U>): Subscription {
    if (!this.sourceSubscription) this.subscribeToSource()
    return super.subscribeIndependently(observer)
  }
}

@RegisterClass("FlatMappedState")
class FlatMappedState<T, U> extends State<U> {
  private sourceSubscription: Subscription | nil
  private nestedSubscription: Subscription | nil
  private curValue: U | nil

  public constructor(private readonly source: State<T>, private readonly mapper: Mapper<T, MaybeState<U>>) {
    super()
  }

  get(): U {
    if (this.sourceSubscription) return this.curValue!

    const mappedValue = this.mapper.invoke(this.source.get())
    return mappedValue instanceof State ? mappedValue.get() : mappedValue
  }

  private subscribeToSource() {
    const { source, mapper } = this
    this.sourceSubscription?.close()
    this.sourceSubscription = source.subscribeIndependently(funcOn(this.sourceListener))
    this.receiveNewMappedValue(mapper.invoke(source.get()))
  }

  private receiveNewMappedValue(newValue: MaybeState<U>) {
    this.nestedSubscription?.close()
    if (newValue instanceof State) {
      this.nestedSubscription = newValue.subscribeIndependently(funcOn(this.nestedListener))
      this.curValue = newValue.get()
    } else {
      this.nestedSubscription = nil
      this.curValue = newValue
    }
  }

  sourceListener(_: Subscription, sourceNewValue: T) {
    if (isEmpty(this.event)) return this.unsubscribeFromSource()

    const { curValue: oldValue, mapper } = this
    const newMappedValue = mapper.invoke(sourceNewValue)
    this.receiveNewMappedValue(newMappedValue)
    const newValue = this.curValue
    if (oldValue !== newValue) this.event.raise(newValue!, oldValue!)
  }

  nestedListener(_: Subscription, nestedNewValue: U) {
    if (isEmpty(this.event)) return this.unsubscribeFromSource()
    const oldValue = this.curValue
    this.curValue = nestedNewValue
    if (oldValue !== nestedNewValue) this.event.raise(nestedNewValue, oldValue!)
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

  override subscribeIndependently(observer: ChangeListener<U>): Subscription {
    if (!this.sourceSubscription) this.subscribeToSource()
    return super.subscribeIndependently(observer)
  }
}
