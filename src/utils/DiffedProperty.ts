import {
  bind,
  ChangeObserver,
  funcRef,
  MaybeProperty,
  MutableProperty,
  Property,
  RegisterClass,
  registerFunctions,
  Subscription,
} from "../lib"
import { BaseStyleMod } from "../lib/factoriojsx"
import { DiffValue, getDiff, getResultValue } from "./diff-value"

@RegisterClass("DiffedProperty")
export class DiffedProperty<T> extends Property<T> implements MutableProperty<T> {
  private resultValue: Property<T>
  constructor(readonly overrideValue: MutableProperty<DiffValue<T> | nil>, readonly defaultValue: Property<T>) {
    super()
    // prettier-ignore
    this.resultValue = overrideValue.flatMap(bind((getResultValue<MaybeProperty<T>>), defaultValue))
  }

  _subscribeIndependently(observer: ChangeObserver<T>): Subscription {
    return this.resultValue._subscribeIndependently(observer)
  }
  get(): T {
    return this.resultValue.get()
  }

  set(value: T): void {
    this.overrideValue.set(getDiff(this.defaultValue.get(), value))
  }

  forceNotify(): void {
    this.resultValue.forceNotify()
  }

  closeAll(): void {
    this.resultValue.closeAll()
  }
}
function blueIfNotNil(value: unknown | nil): Color | ColorArray {
  return value != nil ? [0.6, 0.8, 1] : [1, 1, 1]
}

function boldIfNotNil(value: unknown | nil): string {
  return value != nil ? "default-bold" : "default"
}

registerFunctions("prop-possibly-overriden", {
  blueIfNotNil,
  boldIfNotNil,
})

export function highlightIfOverriden<T>(prop: MutableProperty<T>): BaseStyleMod {
  if (!(prop instanceof DiffedProperty)) return {}
  return {
    font_color: prop.overrideValue.map(funcRef(blueIfNotNil)),
    font: prop.overrideValue.map(funcRef(boldIfNotNil)),
  }
}

export function getDefaultValueIfIsOverridenProp<T>(prop: MutableProperty<T>): T | nil {
  if (prop instanceof DiffedProperty) {
    return prop.defaultValue.get()
  }
}
