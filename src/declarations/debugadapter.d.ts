// Copyright (c) 2022 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

/** @noSelf */
interface DebugAdapter {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  stepIgnore(func: Function): void
  breakpoint(): void
}

declare const __DebugAdapter: DebugAdapter | nil
