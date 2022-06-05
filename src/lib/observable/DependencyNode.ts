import { bound, Callback, Classes, OnLoad, reg } from "../references"
import { Event } from "./Event"
import { SingleObserver } from "./Observable"
import { state, State } from "./State"

export interface DependencyNode {
  readonly isUpToDate: State<boolean>

  onChanged(observer: SingleObserver<this>): Callback

  resetSelf(): void

  /** Is bound */
  markNotUpToDate(): void
  ensureUpToDate(): void

  addDependency(dependency: DependencyNode): void
  removeDependency(dependency: DependencyNode): void

  delete(): void
}

@Classes.register("DependencyNode")
class DependencyNodeImpl implements DependencyNode {
  isUpToDate = state(false)
  private invalidatedEvent = new Event<this>()
  private dependencies = new LuaMap<DependencyNode, Callback>()

  private isValid = true

  constructor(private readonly updateCallback?: Callback) {
    this.isUpToDate.subscribe(reg(this.notifyOutOfDate))
    setmetatable(this.dependencies, { __mode: "k" })
  }

  [OnLoad]() {
    setmetatable(this.dependencies, { __mode: "k" })
  }

  private assertIsValid() {
    if (!this.isValid) error("DependencyNode was deleted")
  }

  addDependency(dependency: DependencyNode) {
    if (!this.isValid || this === dependency) return
    this.assertIsValid()
    this.markNotUpToDate()
    this.dependencies.set(dependency, dependency.onChanged(reg(this.markNotUpToDate)))
  }
  removeDependency(dependency: DependencyNode) {
    if (!this.isValid) return
    const cb = this.dependencies.get(dependency)
    if (cb) cb()
  }

  @bound // by contract
  markNotUpToDate(): void {
    if (!this.isValid) return
    this.isUpToDate.set(false)
  }

  @bound
  private notifyOutOfDate(value: boolean): void {
    if (!this.isValid) return
    if (!value) this.invalidatedEvent.raise(this)
  }

  resetSelf(): void {
    if (!this.isValid) return
    for (const [dependency] of this.dependencies) {
      dependency.ensureUpToDate()
    }
    this.updateCallback?.()
    this.invalidatedEvent.raise(this)
    this.isUpToDate.set(true)
  }

  onChanged(observer: SingleObserver<this>): Callback {
    if (!this.isValid) error("DependencyNode was deleted")
    return this.invalidatedEvent.subscribe(observer)
  }

  delete(): void {
    if (!this.isValid) return
    for (const [, cb] of this.dependencies) cb()
    this.isValid = false
    this.dependencies = undefined!
    this.invalidatedEvent = undefined!
    this.isUpToDate = undefined!
  }

  ensureUpToDate(): void {
    if (!this.isValid || this.isUpToDate.value) return
    this.resetSelf()
  }
}

export function dependencyNode(updateCallback?: Callback): DependencyNode {
  return new DependencyNodeImpl(updateCallback)
}
