import { bind, Callback, Func, funcRef, RegisterClass, Registered } from "../references"
import { Subscribable, Unsubscribe } from "./Observable"
import { Observers } from "./Observers"

declare const ObservableBrand: unique symbol

export abstract class State<T> implements Subscribable<ChangeListener<T>> {
  declare [ObservableBrand]: true
  abstract get(): T

  protected listeners = new Observers<ChangeListener<T>>()
  subscribe(observer: ChangeListener<T>): Callback {
    return this.listeners.addSubscription(observer)
  }

  subscribeAndFire(observer: PartialChangeListener<T>): Callback {
    const callback = this.subscribe(observer)
    observer(this.get(), undefined)
    return callback
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
    return table_size(state.listeners)
  }
}

export interface ChangeListener<T> extends Registered {
  (this: unknown, value: T, oldValue: T): void | typeof Unsubscribe
}

export interface PartialChangeListener<T> extends Registered {
  (this: unknown, value: T, oldValue: T | undefined): void | typeof Unsubscribe
}

export type Mapper<T, U> = Func<(value: T) => U>

export interface MutableState<T> extends State<T> {
  readonly value: T
  set(value: T): void

  setValueFn(value: T): Callback

  toggleFn(this: MutableState<boolean>): Callback

  forceUpdate(): void
}

@RegisterClass("State")
class MutableStateImpl<T> extends State<T> implements MutableState<T> {
  public value: T
  public constructor(value: T) {
    super()
    this.value = value
  }

  get(): T {
    return this.value
  }

  public set(value: T): void {
    const oldValue = this.value
    this.value = value
    if (oldValue !== value) {
      this.listeners.fire(value, oldValue)
    }
  }

  public forceUpdate(value: T = this.value): void {
    const oldValue = this.value
    this.value = value
    this.listeners.fire(value, oldValue)
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
  public constructor(private readonly source: State<T>, private readonly mapper: Mapper<T, U>) {
    super()
  }

  get(): U {
    return this.mapper(this.source.get())
  }

  private static mappedObserver(
    this: ChangeListener<any>,
    mapper: Mapper<any, any>,
    state: {
      oldValueSet: boolean
      oldValue?: unknown
    },
    value: unknown,
    oldValue: unknown,
  ) {
    let oldMappedValue: unknown
    if (!state.oldValueSet) {
      oldMappedValue = state.oldValue = mapper(oldValue)
      state.oldValueSet = true
    } else {
      oldMappedValue = state.oldValue
    }
    const newMappedValue = mapper(value)
    if (oldMappedValue !== newMappedValue) {
      state.oldValue = newMappedValue
      return this(newMappedValue, oldMappedValue)
    }
  }
  override subscribe(observer: ChangeListener<U>): Callback {
    return this.source.subscribe(bind(MappedState.mappedObserver, observer, this.mapper, { oldValueSet: false }))
  }
}

export type MaybeState<T> = State<T> | T
export type MaybeMutableState<T> = MutableState<T> | T
