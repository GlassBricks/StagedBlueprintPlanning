declare type LuaTableAddMethod<TKey extends AnyNotNil> = ((key: TKey) => void) &
  LuaExtension<"__luaTableAddMethodBrand">

declare type LuaTableFirstMethod<TKey extends AnyNotNil> = (() => TKey | undefined) &
  LuaExtension<"__luaTableFirstMethodBrand">

declare type LuaSetIterable<T extends AnyNotNil> = Iterable<T> & LuaExtension<"__luaSetIterableBrand">

declare interface LuaSet<T extends AnyNotNil> extends LuaSetIterable<T> {
  readonly size: LuaLengthMethod<number>
  readonly has: LuaTableHasMethod<T> & LuaTableHasMethod<AnyNotNil>
  readonly first: LuaTableFirstMethod<T>
}

declare interface MutableLuaSet<T extends AnyNotNil> extends LuaSet<T> {
  readonly add: LuaTableAddMethod<T>
  readonly delete: LuaTableDeleteMethod<T>
}

declare const LuaSet: (new <TKey extends AnyNotNil>(...values: TKey[]) => MutableLuaSet<TKey>) &
  LuaExtension<"__luaSetNewBrand">

declare function next<T>(table: LuaSet<any>, index?: T): LuaMultiReturn<[T, true] | []>

declare interface LuaMap<TKey extends AnyNotNil, TValue> extends LuaPairsIterable<TKey, TValue> {
  get: LuaTableGetMethod<TKey, TValue>
  has: LuaTableHasMethod<TKey>
}

declare interface MutableLuaMap<TKey extends AnyNotNil, TValue> extends LuaMap<TKey, TValue> {
  set: LuaTableSetMethod<TKey, TValue>
  delete: LuaTableDeleteMethod<TKey>
  first: LuaTableFirstMethod<TKey>
}

declare const LuaMap: (new <TKey extends AnyNotNil, TValue>() => MutableLuaMap<TKey, TValue>) &
  LuaExtension<"__luaTableNewBrand">

declare type WithMetatable<T, M> = T & {
  [P in keyof M]: M[P] extends (self: T, ...args: infer A) => infer R ? (this: T, ...args: A) => R : M[P]
}
