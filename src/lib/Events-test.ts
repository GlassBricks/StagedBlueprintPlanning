/* eslint-disable @typescript-eslint/no-empty-function */
/** @noSelfInFile */
import Events from "./Events"
import { mockSetupInTest, simulateOnLoad } from "./setup-mock"

const eventId = defines.events.script_raised_set_tiles
after_each(() => {
  Events.clearHandlers(eventId)
})

test("Can register directly", () => {
  const func = () => {}
  Events.on(eventId, func)

  assert.equal(func, script.get_event_handler(eventId))
})

test("Can register multiple", () => {
  const actions: number[] = []
  Events.on(eventId, () => {
    actions.push(1)
  })
  Events.on(eventId, () => {
    actions.push(2)
  })
  Events.on(eventId, () => {
    actions.push(3)
  })
  script.raise_script_set_tiles({ surface_index: 1 as SurfaceIndex, tiles: [] })
  assert.same([1, 2, 3], actions)
})

test("Shorthand register", () => {
  const func = () => {}
  Events.script_raised_set_tiles(func)
  assert.equal(func, script.get_event_handler(eventId))
})

test("Object register", () => {
  const func = () => {}
  Events.onAll({
    script_raised_set_tiles: func,
  })
  assert.equal(func, script.get_event_handler(eventId))
})

let outsideLoad = false
function setLoaded() {
  outsideLoad = true
}
Events.onAll({
  on_load: setLoaded,
  on_init: setLoaded,
  on_configuration_changed: setLoaded,
})

describe("mock load", () => {
  // see also: setup-mock.ts, setup-test.ts
  let loaded = false
  before_each(() => {
    loaded = false
    outsideLoad = false
    mockSetupInTest()
    function setLoaded() {
      loaded = true
    }
    Events.onAll({
      on_load: setLoaded,
      on_init: setLoaded,
      on_configuration_changed: setLoaded,
    })
  })
  test("on_load", () => {
    simulateOnLoad()
    assert.true(loaded)
    assert.false(outsideLoad)
  })
  test("on_init", () => {
    simulateOnLoad()
    assert.true(loaded)
    assert.false(outsideLoad)
  })
  test("on_configuration_changed", () => {
    simulateOnLoad()
    assert.true(loaded)
    assert.false(outsideLoad)
  })
})
