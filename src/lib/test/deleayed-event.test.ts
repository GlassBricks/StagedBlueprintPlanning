import expect from "tstl-expect"
import { DelayedEvent } from "../delayed-event"

test("can use delayed event", () => {
  let eventValue: string | nil
  const testDelayedEvent = DelayedEvent("_test", (args: string) => {
    eventValue = args
  })
  testDelayedEvent("foo")
  expect(eventValue).toBe(nil)
  after_ticks(1, () => {
    expect(eventValue).toBe("foo")
  })
})
