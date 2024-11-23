/*
 * Copyright (c) 2024 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { LuaPlayer } from "factorio:runtime"
import expect from "tstl-expect"
import {
  correctStageReference,
  correctStageReferenceRecursive,
  createStageReference,
  getReferencedStage,
} from "../../blueprints/stage-reference"
import { Prototypes } from "../../constants"
import { getPlayer } from "../../lib/test/misc"
import { _deleteAllProjects, createUserProject } from "../../project/UserProject"
import { temporaryItemStack } from "../test-util"

let player: LuaPlayer
before_each(() => {
  player = getPlayer()
})
after_each(() => {
  _deleteAllProjects()
  player.clear_cursor()
})

test("createStageReference", () => {
  const project = createUserProject("Test", 3)
  const stage = project.getStage(2)!

  const settings = stage.getBlueprintSettingsView()
  settings[1].set({
    type: "item",
    name: "iron-plate",
  })
  settings.appendStageNumbersToIcons.set(false)

  const stack = temporaryItemStack()

  createStageReference(stack, stage)
  expect(stack.valid).toBe(true)
  expect(stack.name).toBe(Prototypes.StageReference)
  expect(stack.label).toBe(`[[ ${stage.name.get()} ]]`)
  expect(stack.allow_manual_label_change).toBe(false)
  expect(stack.preview_icons).toEqual([
    {
      signal: {
        type: "item",
        name: "iron-plate",
      },
      index: 1,
    },
  ])

  const retrievedStage = getReferencedStage(stack)
  expect(retrievedStage).toBe(stage)
})

test("correctStageReference deletes stack if stage not found", () => {
  const project = createUserProject("Test", 3)
  const stage = project.getStage(2)!
  const stack = temporaryItemStack()
  createStageReference(stack, stage)

  stage.deleteInProject()

  const retrievedStage = getReferencedStage(stack)
  expect(retrievedStage).toBe(undefined)

  const ret = correctStageReference(stack)

  expect(ret).toBe(nil)
  expect(stack.valid_for_read).toBe(false)
})

test("correctStageReference deletes stack if tags are invalid", () => {
  const project = createUserProject("Test", 3)
  const stage = project.getStage(2)!
  const stack = temporaryItemStack()
  createStageReference(stack, stage)
  stack.set_blueprint_entity_tags(1, {})

  const ret = correctStageReference(stack)
  expect(ret).toBe(nil)

  expect(stack.valid_for_read).toBe(false)
})

test("correctStageReference updates stack if stage changed", () => {
  const project = createUserProject("Test", 3)
  const stage = project.getStage(2)!
  const stack = temporaryItemStack()
  createStageReference(stack, stage)

  stage.name.set("New Name")
  const ret = correctStageReference(stack)

  expect(ret).toBe(stage)

  const retrievedStage = getReferencedStage(stack)
  expect(retrievedStage).toBe(stage)
})

test("correctStageReferenceRecursive", () => {
  const project = createUserProject("Test", 3)
  const stage = project.getStage(2)!

  const book = temporaryItemStack()
  book.set_stack("blueprint-book")
  const inv = book.get_inventory(defines.inventory.item_main)!
  inv.insert("blueprint")
  createStageReference(inv[0], stage)

  correctStageReferenceRecursive(book)
  const retrievedStage = getReferencedStage(inv[0])
  expect(retrievedStage).toBe(stage)
})

describe("opening a stage reference", () => {
  test("opening a broken stage reference deletes it", () => {
    const project = createUserProject("Test", 3)
    const stage = project.getStage(2)!
    const player = getPlayer()
    // tempInventory does not show up in event when opened
    const stack = player.get_main_inventory()![0]
    createStageReference(stack, stage)

    stage.deleteInProject()
    player.opened = stack

    expect(stack.valid_for_read).toBe(false)
    expect(player.opened).toBe(null)
  })
})
