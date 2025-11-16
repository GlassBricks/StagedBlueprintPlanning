// Copyright (c) 2024 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

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

test("creates stage reference with correct properties", () => {
  const project = createUserProject("Test", 3)
  const stage = project.getStage(2)!

  const settings = stage.getBlueprintSettingsView()
  settings.icon1.set({
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

  stage.deleteByMerging()

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

test("corrects stage reference recursively in blueprint books", () => {
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

    stage.deleteByMerging()
    player.opened = stack

    expect(stack.valid_for_read).toBe(false)
    expect(player.opened).toBe(null)
  })
})
