import { bind, Callback, RegisterClass } from "../references"
import { Observable, SingleObserver, Unsubscribe } from "./Observable"

type ObserverKey = symbol & { _observerKeyBrand?: any }

@RegisterClass("Observers")
export class Observers<L extends (this: unknown, ...args: any[]) => void | Unsubscribe> {
  addSubscription(observer: L): Callback {
    const key: ObserverKey = {} as any

    ;(this as unknown as MutableLuaMap<ObserverKey, L>).set(key, observer)
    return bind(Observers.unsubscribe, this, key)
  }
  private static unsubscribe(this: Observers<any>, key: ObserverKey) {
    ;(this as unknown as MutableLuaMap<ObserverKey, any>).delete(key)
  }

  fire(...args: Parameters<L>): void {
    for (const [key, observer] of this as unknown as MutableLuaMap<ObserverKey, L>) {
      if (observer(...args) === Unsubscribe) {
        ;(this as unknown as MutableLuaMap<ObserverKey, L>).delete(key)
      }
    }
  }
}

@RegisterClass("SingleSubscribable")
export class SingleSubscribable<T> implements Observable<T> {
  private _observers = new Observers<SingleObserver<T>>()
  public subscribe(observer: SingleObserver<T>): Callback {
    return this._observers.addSubscription(observer)
  }

  protected fire(value: T): void {
    this._observers.fire(value)
  }
}
