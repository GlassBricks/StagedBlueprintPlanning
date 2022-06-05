/** @noSelf */
interface DebugAdapter {
  stepIgnore(func: Function): void
  breakpoint(): void
}

declare const __DebugAdapter: DebugAdapter | undefined
