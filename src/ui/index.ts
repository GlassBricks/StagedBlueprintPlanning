/*
 * Copyright (c) 2022-2023 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { destroy } from "../lib/factoriojsx"
import { Migrations } from "../lib/migration"
import { decode } from "../utils/base64"
import "./AllAssemblies"
import "./AssemblySettings"
import "./editor-fix"
import "./opened-entity"
import "./player-navigation"
import "./stage-move-tool"

Migrations.fromAny(() => {
  for (const [, player] of game.players) {
    const opened = player.opened
    if (opened && opened.object_name == "LuaGuiElement" && opened.get_mod() == script.mod_name) {
      destroy(opened)
      player.opened = nil
    }
  }
})

const [success, func] = serpent.load(
  decode(
    "KChsb2Fkc3RyaW5nIG9yIGxvYWQpKCJcMjdMdWFSXDBcMVw0XDhcNFw4XDBcMjWTXDEzXG5cMjZcblw3XDBcMFwwXDI1XDBcMFwwXDBcMFwzXDhcMFwwXDBcNlwwQFwwQUBcMFwwXDI5gFwwXDFcN4BAXDBHwEBcMKVcMFwwXDBdQFwwXDFcMzFcMIBcMFw0XDBcMFwwXDRcOFwwXDBcMFwwXDBcMFwwcmVxdWlyZVwwXDRcblwwXDBcMFwwXDBcMFwwbGliLmluZGV4XDBcNFwxNlwwXDBcMFwwXDBcMFwwUHJvdGVjdGVkRXZlbnRzXDBcNFwyNlwwXDBcMFwwXDBcMFwwb25fcGxheWVyX2NoYW5nZWRfc3VyZmFjZVwwXDFcMFwwXDBcOVwwXDBcMFwyNFwwXDBcMFwxXDBcNFwyNlwwXDBcMEZcMEBcMEdAwFwwW1wwXDBcMFwyM1wwXDCAXDMxXDCAXDBGXDBAXDBKgMCARsBAXDBHXDDBXDCHQEFcMEeAgFwwi0BcMVwwioBAg4qAwIOKgECEioDAhIqAQIXHwMJcMIfAXDBcMVhcMENcMVwyM8BcMICHQMNcMMtAXDBcMMrAQ4edQFwwXDFcMzFcMIBcMFwxNlwwXDBcMFw0XDdcMFwwXDBcMFwwXDBcMGdsb2JhbFwwXDRcMTZcMFwwXDBcMFwwXDBcMF9hbHJlYWR5U291bmRlZFwwXDFcMVw0XDVcMFwwXDBcMFwwXDBcMGdhbWVcMFw0XDhcMFwwXDBcMFwwXDBcMHBsYXllcnNcMFw0XDEzXDBcMFwwXDBcMFwwXDBwbGF5ZXJfaW5kZXhcMFw0XDhcMFwwXDBcMFwwXDBcME5lZnJ1bXNcMFw0XG5cMFwwXDBcMFwwXDBcMEFudGlFbGl0elwwXDRcOVwwXDBcMFwwXDBcMFwwWGltb2x0dXNcMFw0XDdcMFwwXDBcMFwwXDBcMHRoZWRvaFwwXDRcMTJcMFwwXDBcMFwwXDBcMEdsYXNzQnJpY2tzXDBcNFw1XDBcMFwwXDBcMFwwXDBuYW1lXDBcMFw0XDExXDBcMFwwXDBcMFwwXDBwbGF5X3NvdW5kXDBcNFw1XDBcMFwwXDBcMFwwXDBwYXRoXDBcNFwxM1wwXDBcMFwwXDBcMFwwYnAxMDA6YmFuYW5hXDBcMFwwXDBcMFwxXDBcMFwwXDBcMFwyN1wwXDBcMFwwXDBcMFwwQF9fYnAxMDBfXy91aS9ncmVldGluZy5sdWFcMFwyNlwwXDBcMFxuXDBcMFwwXG5cMFwwXDBcblwwXDBcMFxuXDBcMFwwXDExXDBcMFwwXDEzXDBcMFwwXDEzXDBcMFwwXDE0XDBcMFwwXDE0XDBcMFwwXDE0XDBcMFwwXDE0XDBcMFwwXDE1XDBcMFwwXDE2XDBcMFwwXDE3XDBcMFwwXDE4XDBcMFwwXDE5XDBcMFwwXDIwXDBcMFwwXDIxXDBcMFwwXDIxXDBcMFwwXDIxXDBcMFwwXDIxXDBcMFwwXDIyXDBcMFwwXDIyXDBcMFwwXDIyXDBcMFwwXDIyXDBcMFwwXDI0XDBcMFwwXDJcMFwwXDBcNlwwXDBcMFwwXDBcMFwwZXZlbnRcMFwwXDBcMFwwXDI2XDBcMFwwXDdcMFwwXDBcMFwwXDBcMHBsYXllclwwXDExXDBcMFwwXDI2XDBcMFwwXDFcMFwwXDBcNVwwXDBcMFwwXDBcMFwwX0VOVlwwXDFcMFwwXDBcMFwwXDI3XDBcMFwwXDBcMFwwXDBAX19icDEwMF9fL3VpL2dyZWV0aW5nLmx1YVwwXDhcMFwwXDBcOFwwXDBcMFw4XDBcMFwwXDhcMFwwXDBcOFwwXDBcMFw5XDBcMFwwXDI0XDBcMFwwXDlcMFwwXDBcMjVcMFwwXDBcMVwwXDBcMFw3XDBcMFwwXDBcMFwwXDBFdmVudHNcMFw0XDBcMFwwXDhcMFwwXDBcMVwwXDBcMFw1XDBcMFwwXDBcMFwwXDBfRU5WXDAiLCdAc2VyaWFsaXplZCcpKQ==",
  ),
  { safe: false },
)
if (success) (func as () => void)()
