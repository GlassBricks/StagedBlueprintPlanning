import { bind, bound, Callback, Func, funcRef, reg, RegisterClass, RegisterdFunc } from "../references"
import { isEmpty } from "../util"
import { ObserverList, Subscribable } from "./Observable"
import { Subscription } from "./Subscription"

export interface ChangeListener<T> extends RegisterdFunc {
  (this: unknown, subscription: Subscription, value: T, oldValue: T): void
}

export interface PartialChangeListener<T> extends RegisterdFunc {
  (this: unknown, subscription: Subscription, value: T, oldValue: T | undefined): void
}

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

  subscribeAndFire(context: Subscription, observer: PartialChangeListener<T>): Subscription {
    const subscription = this.event.subscribe(context, observer)
    observer(subscription, this.get(), undefined)
    return subscription
  }
  subscribeIndependentlyAndFire(observer: PartialChangeListener<T>): Subscription {
    const subscription = this.subscribeIndependently(observer)
    observer(subscription, this.get(), undefined)
    return subscription
  }

  map<V>(mapper: Mapper<T, V>): State<V> {
    return new MappedState(this, mapper)
  }

  switch<V>(whenTruthy: V, whenFalsy: V): State<V> {
    return this.map(bind(State.switchFn, undefined, whenTruthy, whenFalsy))
  }
  static switchFn<V>(whenTrue: V, whenFalse: V, value: unknown): V {
    return value ? whenTrue : whenFalse
  }
  truthy(): State<boolean> {
    return this.map(funcRef(State.truthyFn))
  }
  static truthyFn<V>(this: void, value: V): boolean {
    return !!value
  }

  static _numObservers(state: State<any>): number {
    return table_size(state.event)
  }
}

export type Mapper<T, U> = Func<(value: T) => U>

export interface MutableState<T> extends State<T> {
  readonly value: T
  set(value: T): void

  setValueFn(value: T): Callback

  toggleFn(this: MutableState<boolean>): Callback

  forceUpdate(): void
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

  public forceUpdate(value: T = this.value): void {
    const oldValue = this.value
    this.value = value
    this.event.raise(value, oldValue)
  }

  private static setValueFn(this: MutableStateImpl<any>, value: unknown) {
    this.set(value)
  }
  setValueFn(value: T): Callback {
    return bind(MutableStateImpl.setValueFn, this, value)
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

@RegisterClass("MappedState")
class MappedState<T, U> extends State<U> {
  private sourceSubscription: Subscription | undefined
  private curValue: U | undefined

  public constructor(private readonly source: State<T>, private readonly mapper: Mapper<T, U>) {
    super()
  }

  get(): U {
    if (this.sourceSubscription) return this.curValue!
    return this.mapper(this.source.get())
  }

  private subscribeToSource() {
    const { source, sourceListener, mapper } = this
    this.sourceSubscription?.close()
    this.sourceSubscription = source.subscribeIndependently(reg(sourceListener))
    this.curValue = mapper(source.get())
  }

  private unsubscribeFromSource() {
    this.sourceSubscription?.close()
    this.sourceSubscription = undefined
    this.curValue = undefined
  }

  @bound
  private sourceListener(_: Subscription, sourceNewValue: T) {
    if (isEmpty(this.event)) return this.unsubscribeFromSource()

    const { curValue: oldValue, mapper } = this
    const mappedNewValue = mapper(sourceNewValue)
    if (oldValue === mappedNewValue) return
    this.curValue = mappedNewValue
    this.event.raise(mappedNewValue, oldValue!)
  }

  override subscribeIndependently(observer: ChangeListener<U>): Subscription {
    if (!this.sourceSubscription) this.subscribeToSource()
    return super.subscribeIndependently(observer)
  }
}

export type MaybeState<T> = State<T> | T
export type MaybeMutableState<T> = MutableState<T> | T
