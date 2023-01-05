import {
  bind,
  deepCompare,
  FlatMappedState,
  funcRef,
  MutableState,
  RegisterClass,
  registerFunctions,
  State,
} from "../lib"
import { BaseStyleMod } from "../lib/factoriojsx"

@RegisterClass("PropWithOverride")
export class PropWithOverride<T> extends FlatMappedState<T | nil, T> implements MutableState<T> {
  constructor(readonly overrideValue: MutableState<T | nil>, readonly defaultValue: State<T>) {
    // prettier-ignore
    super(overrideValue, bind((PropWithOverride.defaultIfNil<T>), defaultValue))
  }

  private static defaultIfNil<T>(this: void, defaultValue: State<T>, value: T | nil) {
    return value ?? defaultValue
  }

  set(value: T): void {
    if (deepCompare(this.defaultValue.get(), value)) {
      this.overrideValue.set(nil)
    } else {
      this.overrideValue.set(value)
    }
  }

  forceNotify(): void {
    const oldValue = this.get()
    this.event.raise(oldValue, oldValue)
  }

  closeAll(): void {
    this.event.closeAll()
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

export function highlightIfOverriden<T>(prop: MutableState<T>): BaseStyleMod {
  if (!(prop instanceof PropWithOverride)) return {}
  const isOverriden = prop.overrideValue.notNil()
  return {
    font_color: isOverriden.map(funcRef(blueIfNotNil)),
    font: isOverriden.map(funcRef(boldIfNotNil)),
  }
}

export function getDefaultValueIfIsOverriden<T>(prop: MutableState<T>): T | nil {
  if (prop instanceof PropWithOverride) {
    return prop.defaultValue.get()
  }
}
