import { Callback, ContextualFun, Func } from "../references"

export interface Subscribable<L extends Func<ContextualFun>> {
  subscribe(observer: L): Callback
}

export type SingleObserver<T> = Func<(value: T) => void>
export type Observable<T> = Subscribable<SingleObserver<T>>

export const Unsubscribe: unique symbol = Symbol("Unsubscribe")
export type Unsubscribe = typeof Unsubscribe
