/** @noResolution */
declare module "__bplib__/types" {
  import { LuaItemStack, LuaRecord } from "factorio:runtime"

  export type Blueprintish = LuaItemStack | LuaRecord

  export type SnapData = [
    left: number,
    top: number,
    right: number,
    bottom: number,
    x_parity: number | undefined,
    y_parity: number | undefined,
  ]

  export type DirectionalSnapData = Record<defines.direction, SnapData>

  export type EntityDirectionalSnapData = Record<string, DirectionalSnapData>
}

/** @noResolution */
declare module "__bplib__/blueprint" {
  import {
    AnyBasic,
    BoundingBox,
    BlueprintEntity,
    LuaEntity,
    LuaItemStack,
    LuaPlayer,
    LuaRecord,
    LuaSurface,
    MapPosition,
    OnPlayerSetupBlueprintEvent,
    OnPreBuildEvent,
    Tags,
    TilePosition,
  } from "factorio:runtime"
  import { Blueprintish } from "__bplib__/types"

  export interface BlueprintBase {
    readonly record?: LuaRecord
    readonly stack?: LuaItemStack
    readonly player: LuaPlayer
    readonly actual?: Blueprintish
    readonly entities?: BlueprintEntity[]
    readonly bpspace_bbox?: BoundingBox
    readonly snap?: TilePosition
    readonly snap_offset?: TilePosition
    readonly snap_absolute?: boolean
    readonly debug?: boolean

    get_actual(): Blueprintish | undefined
    get_entities(force?: boolean): BlueprintEntity[] | undefined
    get_bpspace_bbox(): BoundingBox | undefined
  }

  export interface BlueprintSetup extends BlueprintBase {
    map_blueprint_indices_to_world_entities(): Record<number, LuaEntity> | undefined
    set_tags(bp_entity_index: number, tags: Tags | undefined): void
    apply_tags(bp_entity_index: number, tags: Tags): void
    apply_tag(bp_entity_index: number, key: string, value: AnyBasic): void
  }

  export interface BlueprintSetupConstructor {
    new: (this: void, event: OnPlayerSetupBlueprintEvent) => BlueprintSetup | undefined
  }

  export interface BlueprintBuild extends BlueprintBase {
    readonly surface: LuaSurface
    readonly position: MapPosition
    readonly direction: defines.direction
    readonly flip_horizontal?: boolean
    readonly flip_vertical?: boolean

    map_blueprint_indices_to_world_positions(): Record<number, MapPosition> | undefined
    map_blueprint_indices_to_overlapping_entities(
      entity_filter?: (bp_entity: BlueprintEntity) => boolean | undefined,
    ): Record<number, LuaEntity> | undefined
  }

  export interface BlueprintBuildConstructor {
    new: (this: void, event: OnPreBuildEvent) => BlueprintBuild | undefined
  }

  export const BlueprintSetup: BlueprintSetupConstructor
  export const BlueprintBuild: BlueprintBuildConstructor
  export function get_actual_blueprint(
    this: void,
    player: LuaPlayer,
    record?: LuaRecord,
    stack?: LuaItemStack,
  ): Blueprintish | undefined
}
