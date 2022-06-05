import { L_Interaction } from "../locale"
import { protectedAction, raiseUserError } from "./protected-action"
import { getPlayer } from "./test-util/misc"

test("Protected action with no error", () => {
  const player = getPlayer()
  const result = protectedAction(player, () => "test")
  assert.same("test", result)
})

test("Protected action with user error", () => {
  const player = getPlayer()
  rawset(player, "print", player.print)
  const print = stub(player, "print")
  const result = protectedAction(player, () => {
    raiseUserError("test", "print")
  })
  assert.is_nil(result)
  assert.spy(print).called_with("test")
})

test("Protected action with user error using flying text", () => {
  const player = getPlayer()
  rawset(player, "create_local_flying_text", player.create_local_flying_text)
  const fn = stub(player, "create_local_flying_text")
  const result = protectedAction(player, () => {
    raiseUserError("test", "flying-text")
  })
  assert.is_nil(result)
  assert.spy(fn).called()
})

test("Protected action with unexpected error", () => {
  const player = getPlayer()
  rawset(player, "print", player.print)
  const print = stub(player, "print")
  const result = protectedAction(player, () => error("test"))
  assert.is_nil(result)
  assert.equal(L_Interaction.UnexpectedError, (print.calls[0].vals[0] as [string])[0])
})
