// Copyright (c) 2022 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

require("__debugadapter__/debugadapter.lua")

declare const __DebugAdapter: DebugAdapter
// noinspection JSUnusedGlobalSymbols
export const _breakpoint = __DebugAdapter.breakpoint
