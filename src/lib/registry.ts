import { addSetupHook, checkIsBeforeLoad } from "./setup"

export function getCallerFile(): string {
  const source = debug.getinfo(3, "S")!.source!
  return string.match(source, "^.-/(.+)%.lua")[0]
}
export function getCurrentFile(): string {
  const source = debug.getinfo(2, "S")!.source!
  return string.match(source, "^.-/(.+)%.lua")[0]
}

export class Registry<T, N extends string> {
  private nameToItem = {} as Record<N, T>
  private itemToName = new LuaTable<T, N>()

  constructor(
    protected itemName: string,
    protected getDefaultName: (item: T) => string,
    protected getDebugDescription: (item: T) => string,
    protected onRegister: (item: T, name: N) => void,
  ) {
    addSetupHook({
      reset: () => {
        const store = {
          nameToItem: this.nameToItem,
          itemToName: this.itemToName,
        }
        this.nameToItem = {} as Record<N, T>
        this.itemToName = new LuaTable<T, N>()
        return store
      },
      restore: (store) => {
        this.nameToItem = store.nameToItem
        this.itemToName = store.itemToName
      },
    })
  }

  registerRaw(name: N, item: T): void {
    checkIsBeforeLoad()
    const existing: T = this.nameToItem[name]
    if (existing) {
      error(
        `${this.itemName} with the name ${name} is already registered, existing is: ${this.getDebugDescription(
          existing,
        )}`,
      )
    }
    this.nameToItem[name] = item
    this.itemToName.set(item, name)
    this.onRegister(item, name)
  }

  register(as?: string): (this: unknown, item: T) => void {
    const prefix = getCallerFile() + "::"
    return (item) => {
      const name = as ?? this.getDefaultName(item)
      this.registerRaw((prefix + name) as N, item)
    }
  }
  registerIn(file: string, as?: string): (this: unknown, item: T) => void {
    const callerFile = getCallerFile()

    const [folder] = string.match(callerFile, "^(.+/)")
    const prefix = (folder ?? "") + file + "::"

    return (item) => {
      const name = as ?? this.getDefaultName(item)
      this.registerRaw((prefix + name) as N, item)
    }
  }

  registerAll(items: Record<string, T>): void {
    const prefix = getCallerFile() + "::"
    for (const [name, item] of pairs(items)) {
      this.registerRaw((prefix + name) as N, item)
    }
  }

  get<V extends T>(name: N): V {
    return (this.nameToItem[name] as V) || error(`could not find ${this.itemName} with name ${name}`)
  }
  getOrNil<V extends T>(name: N): V | undefined {
    return this.nameToItem[name] as V | undefined
  }

  nameOf(item: T): N {
    return (
      this.itemToName.get(item) ??
      error(`The given ${this.itemName} was not registered: ${this.getDebugDescription(item)}`)
    )
  }
}
