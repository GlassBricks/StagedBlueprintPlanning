import { ContextualFun, Func, RegisterClass } from "../references"
import { Subscription } from "./Subscription"

export interface Subscribable<L extends Func<ContextualFun>> {
  subscribe(context: Subscription, observer: L): Subscription
  subscribeIndependently(observer: L): Subscription
}

export type ValueListener<T> = Func<(subscription: Subscription, value: T) => void>
export type Observable<T> = Subscribable<ValueListener<T>>

type AdditionalArgs<L extends (this: any, arg1: any, ...args: any) => void> = L extends (
  this: any,
  arg1: any,
  ...args: infer A
) => void
  ? A
  : never

@RegisterClass("ObserverList")
export class ObserverList<L extends Func<(subscription: Subscription, ...args: any) => void>>
  implements Subscribable<L>
{
  subscribeIndependently(observer: L): Subscription {
    const thisAsMap = this as unknown as LuaMap<ObserverSubscription, L>
    const subscription = new ObserverSubscription(thisAsMap)
    thisAsMap.set(subscription, observer)
    return subscription
  }

  subscribe(context: Subscription, observer: L): Subscription {
    const subscription = this.subscribeIndependently(observer)
    context.add(subscription)
    return subscription
  }

  raise(...args: AdditionalArgs<L>): void
  raise(...args: any[]): void {
    for (const [subscription, observer] of this as unknown as LuaMap<ObserverSubscription, L>) {
      observer(subscription, ...args)
    }
  }

  closeAll(): void {
    for (const [subscription] of this as unknown as LuaMap<ObserverSubscription, L>) {
      subscription.close()
    }
  }
}

@RegisterClass("ObserverSubscription")
class ObserverSubscription extends Subscription {
  constructor(private readonly observers: LuaMap<ObserverSubscription>) {
    super()
  }
  override close() {
    this.observers.delete(this)
    super.close()
  }
}

export type EventListener<T> = ValueListener<T>
export type Event<T> = ObserverList<EventListener<T>>
export const Event: new <T>() => Event<T> = ObserverList
