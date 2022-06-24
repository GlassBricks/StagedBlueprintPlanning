export class Registry<T> {
  private nameToItem = {} as Record<string, T>
  private itemToName = new LuaTable<T, string>()

  constructor(protected itemName: string, protected getDebugDescription: (item: T) => string) {}

  registerRaw(name: string, item: T): void {
    if (game) {
      error("This operation must only be done during script load.")
    }
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
  }

  get(name: string): T {
    return this.nameToItem[name] || error(`could not find ${this.itemName} with name ${name}`)
  }
  getOrNil(name: string): T | undefined {
    return this.nameToItem[name]
  }

  nameOf(item: T): string {
    return (
      this.itemToName.get(item) ??
      error(`The given ${this.itemName} was not registered: ${this.getDebugDescription(item)}`)
    )
  }
}
