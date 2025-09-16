// Copyright (c) 2022 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { PlayerIndex } from "factorio:runtime"

declare global {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface PlayerData {}
  type GlobalPlayerData = {
    readonly [P in PlayerIndex]: PlayerData
  }
  interface StorageWithPlayer {
    readonly players: GlobalPlayerData
  }
}
