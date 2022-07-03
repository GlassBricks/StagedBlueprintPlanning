import { Func, isCallable, RegisterClass } from "../references"

export interface Unsubscribable {
  close(): void
}

export class UnsubscriptionError extends Error {
  constructor(readonly errors: any[]) {
    super(errors.map((err, i) => `${i + 1}) ${err.toString()}`).join("\n  "))
    this.name = "UnsubscriptionError"
  }
}

export type Unsubscription = Unsubscribable | Func<() => void>

@RegisterClass("Subscription")
export class Subscription implements Unsubscribable {
  // if nil, is closed
  _children: MutableLuaSet<Unsubscription> | nil = new LuaSet()
  _parents: MutableLuaSet<Subscription> | nil = new LuaSet()

  isClosed(): boolean {
    return this._children === nil
  }

  add(subscription: Unsubscription): void {
    if (subscription === this) return
    const { _children } = this
    if (!_children) {
      this.callUnsubscription(subscription)
      return
    }
    if (isSubscriptionContext(subscription)) {
      if (subscription.isClosed()) return
      subscription._parents!.add(this)
    }
    _children.add(subscription)
  }

  hasActions(): boolean {
    return this._children !== nil && this._children.first() !== nil
  }

  private removeChild(subscription: Unsubscribable): void {
    this._children?.delete(subscription)
  }

  private callUnsubscription(subscription: Unsubscription): void {
    if (isCallable(subscription)) {
      ;(subscription as Func<() => void>)()
    } else {
      ;(subscription as Unsubscribable).close()
    }
  }

  close(): void {
    const { _children } = this
    if (!_children) return

    // remove self from parents
    for (const parent of this._parents!) {
      parent.removeChild(this)
    }
    this._children = nil
    this._parents = nil

    // close children
    let errors: any[] | nil = nil
    for (const subscription of _children) {
      const [success, result] = pcall(this.callUnsubscription, this, subscription)
      if (!success) {
        errors ??= []
        if ((result as unknown) instanceof UnsubscriptionError) {
          errors.push(...(result as unknown as UnsubscriptionError).errors)
        } else {
          errors.push(result)
        }
      }
    }
    if (errors) {
      throw new UnsubscriptionError(errors)
    }
  }
}

const getMeta = getmetatable
export function isSubscriptionContext(subscription: unknown): subscription is Subscription {
  return getMeta(subscription) === Subscription.prototype
}
