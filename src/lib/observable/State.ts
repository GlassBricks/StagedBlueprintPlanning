/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { isEmpty } from "../_util"
import {
  bind,
  Callback,
  Func,
  funcRef,
  ibind,
  RegisterClass,
  RegisterClassFunctionsOnly,
  registerFunctions,
} from "../references"
import { MultiObservable, MultiObserver, MultiEvent } from "./Observable"
import { Subscription } from "./Subscription"

type ChangeParams<T> = [value: T, oldValue: T]
export type ChangeListener<T> = MultiObserver<ChangeParams<T>>
export type PartialChangeListener<T> = MultiObserver<[value: T, oldValue: T | nil]>

export type MaybeState<T> = State<T> | T
export type MaybeMutableState<T> = State<T> | MutableState<T> | T

export type Mapper<T, U> = Func<(value: T) => U>

@RegisterClassFunctionsOnly("State")
export abstract class State<T> implements MultiObservable<ChangeParams<T>> {
  abstract get(): T
  abstract subscribeIndependently(observer: MultiObserver<ChangeParams<T>>): Subscription
  subscribe(context: Subscription, observer: ChangeListener<T>): Subscription {
    const subscription = this.subscribeIndependently(observer)
    context.add(subscription)
    return subscription
  }
  subscribeIndependentlyAndFire(observer: PartialChangeListener<T>): Subscription {
    const subscription = this.subscribeIndependently(observer)
    observer.invoke(this.get(), nil)
    return subscription
  }
  subscribeAndFire(context: Subscription, observer: PartialChangeListener<T>): Subscription {
    const subscription = this.subscribe(context, observer)
    observer.invoke(this.get(), nil)
    return subscription
  }

  map<V>(mapper: Mapper<T, V>): State<V> {
    return new MappedState(this, mapper)
  }
  flatMap<V>(mapper: Mapper<T, MaybeState<V>>): State<V> {
    return new FlatMappedState(this, mapper)
  }

  // utils
  static truthyFn<V>(this: void, value: V): boolean {
    return !!value
  }
  truthy(): State<boolean> {
    return this.map(funcRef(State.truthyFn))
  }
}

export abstract class BasicState<T> extends State<T> {
  protected event = new MultiEvent<ChangeParams<T>>()

  subscribeIndependently(observer: ChangeListener<T>): Subscription {
    return this.event.subscribeIndependently(observer)
  }
}
export function _numObservers(state: State<unknown>): number {
  return table_size((state as unknown as { event: MultiEvent<any> }).event)
}

export interface MutableState<T> extends State<T> {
  set(value: T): void
  forceNotify(): void
  closeAll(): void
}

@RegisterClass("MutableState")
class MutableStateImpl<T> extends BasicState<T> implements MutableState<T> {
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

  public forceNotify(value: T = this.value): void {
    const oldValue = this.value
    this.value = value
    this.event.raise(value, oldValue)
  }

  public closeAll(): void {
    this.event.closeAll()
  }

  __tostring(): string {
    return "MutableState(" + this.get() + ")"
  }
}
export function state<T>(value: T): MutableState<T> {
  return new MutableStateImpl(value)
}

export function isMutableState<T>(state: State<T>): state is MutableState<T> {
  return typeof (state as MutableState<T>).set == "function"
}

@RegisterClass("MappedState")
class MappedState<T, U> extends BasicState<U> {
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
    this.sourceSubscription = source.subscribeIndependently(ibind(this.sourceListener))
    this.curValue = mapper.invoke(source.get())
  }

  private unsubscribeFromSource() {
    this.sourceSubscription?.close()
    this.sourceSubscription = nil
    this.curValue = nil
  }

  sourceListener(sourceNewValue: T) {
    if (isEmpty(this.event)) return this.unsubscribeFromSource()

    const { curValue: oldValue, mapper } = this
    const mappedNewValue = mapper.invoke(sourceNewValue)
    if (oldValue == mappedNewValue) return
    this.curValue = mappedNewValue
    this.event.raise(mappedNewValue, oldValue!)
  }

  override subscribeIndependently(observer: ChangeListener<U>): Subscription {
    if (!this.sourceSubscription) this.subscribeToSource()
    return super.subscribeIndependently(observer)
  }

  __tostring(): string {
    return "MappedState(" + this.source + ")"
  }
}

@RegisterClass("FlatMappedState")
export class FlatMappedState<T, U> extends BasicState<U> {
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
    this.sourceSubscription = source.subscribeIndependently(ibind(this.sourceListener))
    this.receiveNewMappedValue(mapper.invoke(source.get()))
  }

  private receiveNewMappedValue(newValue: MaybeState<U>) {
    this.nestedSubscription?.close()
    if (newValue instanceof State) {
      this.nestedSubscription = newValue.subscribeIndependently(ibind(this.nestedListener))
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

  override subscribeIndependently(observer: ChangeListener<U>): Subscription {
    if (!this.sourceSubscription) this.subscribeToSource()
    return super.subscribeIndependently(observer)
  }

  __tostring(): string {
    return "FlatMappedState(" + this.source + ")"
  }
}

export namespace States {
  function setValue(state: MutableState<unknown>, value: unknown) {
    state.set(value)
  }
  function toggle(state: MutableState<boolean>) {
    state.set(!state.get())
  }

  registerFunctions("States", {
    setValue,
    toggle,
  })

  export function setValueFn(state: MutableState<unknown>, value: unknown): Callback {
    return bind(setValue, state, value)
  }

  export function toggleFn(state: MutableState<boolean>): Callback {
    return bind(toggle, state)
  }
}
