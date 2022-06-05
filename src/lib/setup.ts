export function checkIsBeforeLoad(): void {
  if (game) {
    error("This operation must only be done during script load.")
  }
}

export type SetupHook<T> = {
  reset(): T
  restore?(value: T): void
}

let hooksFinalized = false

const setupHooks: SetupHook<any>[] = []
export function addSetupHook(hook: SetupHook<any> | (() => void)): void {
  checkIsBeforeLoad()
  if (hooksFinalized) error("Cannot add setup hooks at this time.")
  if (typeof hook === "function") {
    hook = { reset: hook }
  }
  setupHooks.push(hook)
}

export function _getSetupHooks(): readonly SetupHook<any>[] {
  hooksFinalized = true
  return setupHooks
}

let inSetupMock = false
export function isInSetupMock(): boolean {
  return inSetupMock
}
export function _setInSetupMock(value: boolean): void {
  inSetupMock = value
}
