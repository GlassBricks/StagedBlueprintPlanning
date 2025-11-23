import { Events } from "./Events"

declare const storage: {
  delayedEvents?: Record<number, DelayedEventData<unknown>>
}

const GlobalEventHandlers: Record<string, (args: never) => void> = {}

interface DelayedEventData<T> {
  readonly name: string
  readonly args: T
}

export interface DelayedEvent<T> {
  (args: T): void
}

export function DelayedEvent<T>(name: string, fn: (args: T) => void): DelayedEvent<T> {
  if (name in GlobalEventHandlers) {
    error(`DelayedEvent "${name}" already exists`)
  }
  GlobalEventHandlers[name] = fn
  return (args) => {
    const dummyObj = rendering.draw_text({
      surface: game.surfaces[1],
      target: [0, 0],
      text: "You shouldn't seem me",
      color: [0, 0, 0],
    })
    const [regNumber] = script.register_on_object_destroyed(dummyObj)
    dummyObj.destroy()
    const delayedEvents: Record<number, DelayedEventData<unknown>> = (storage.delayedEvents ??= {})
    delayedEvents[regNumber] = { name, args }
  }
}

Events.on_object_destroyed((event) => {
  const id = event.registration_number
  const data = storage.delayedEvents?.[id]
  if (!data) return
  delete storage.delayedEvents![id]
  const handler = GlobalEventHandlers[data.name]
  handler?.(data.args as never)
})
