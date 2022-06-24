import { AnyFunction, Func, RegisterClass, SelflessFun } from "../references"

@RegisterClass("Test: AsFunc")
class AsFunc<F extends AnyFunction> {
  private readonly func: SelflessFun
  constructor(func: F) {
    this.func = func as any
  }

  // noinspection JSUnusedGlobalSymbols
  protected __call(thisArg: unknown, ...args: any[]) {
    return this.func(...args)
  }
}
export function asFunc<F extends (this: void, ...args: any) => any>(func: F): Func<(...args: any) => any> {
  return new AsFunc(func) as any
}
