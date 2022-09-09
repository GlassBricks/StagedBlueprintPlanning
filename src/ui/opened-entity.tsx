/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of 100% Blueprint Planning.
 *
 * 100% Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * 100% Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with 100% Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { Stage } from "../assembly/AssemblyDef"
import { AssemblyOperations } from "../assembly/AssemblyOperations"
import { DefaultAssemblyUpdater } from "../assembly/AssemblyUpdater"
import { checkEntityUpdated } from "../assembly/world-listener"
import { BuildableEntityType } from "../constants"
import { AssemblyEntity } from "../entity/AssemblyEntity"
import { Entity } from "../entity/Entity"
import { StageDiff } from "../entity/stage-diff"
import { bind, funcOn, ProtectedEvents, RegisterClass } from "../lib"
import { Component, destroy, ElemProps, FactorioJsx, renderNamed, Spec, Tracker } from "../lib/factoriojsx"
import { DraggableSpace, HorizontalPusher, RefreshButton, TitleBar } from "../lib/factoriojsx/components"
import { L_GuiEntityInfo } from "../locale"
import { getAssemblyEntityOfEntity } from "./entity-util"
import { PlayerChangedStageEvent, teleportToStage } from "./player-current-stage"
import relative_gui_position = defines.relative_gui_position
import relative_gui_type = defines.relative_gui_type

PlayerChangedStageEvent.addListener((player, stage) => {
  const entity = player.opened
  if (!entity || entity.object_name !== "LuaEntity") return

  const [oldStage, assemblyEntity] = getAssemblyEntityOfEntity(entity)
  if (!oldStage || oldStage === stage) return
  if (stage === nil || oldStage.assembly !== stage.assembly) {
    player.opened = nil
    return
  }

  const otherEntity = assemblyEntity.getWorldEntity(stage.stageNumber)
  player.opened = otherEntity
})

const StageButtonWidth = 100
const StageButtonHeight = 28

interface EntityStageInfoProps {
  assemblyEntity: AssemblyEntity
  stage: Stage
  anchor: GuiAnchor
}
function SmallToolButton(props: ElemProps<"sprite-button">) {
  return <sprite-button style="mini_button" styleMod={{ size: [20, 20] }} {...props} />
}

@RegisterClass("EntityAssemblyInfo")
class EntityAssemblyInfo extends Component<EntityStageInfoProps> {
  playerIndex!: PlayerIndex
  stage!: Stage
  entity!: AssemblyEntity

  public override render(props: EntityStageInfoProps, tracker: Tracker): Spec {
    this.playerIndex = tracker.playerIndex
    const { stage, assemblyEntity: entity } = props
    this.stage = stage
    this.entity = entity
    const currentStageNum = stage.stageNumber
    const assembly = stage.assembly

    const isRollingStock = entity.isRollingStock()

    const firstStageNum = entity.getFirstStage()
    const firstStage = assembly.getStage(firstStageNum)!
    const prevStageWithDiff = entity.prevStageWithDiff(currentStageNum)
    const nextStageWithDiff = entity.nextStageWithDiff(currentStageNum)

    const stageDiff = entity.getStageDiff(currentStageNum)

    return (
      <frame anchor={props.anchor} style="inner_frame_in_outer_frame" direction="vertical">
        <TitleBar>
          <label style="frame_title" caption={[L_GuiEntityInfo.Title]} />
          <DraggableSpace />
          <RefreshButton on_gui_click={funcOn(this.refresh)} />
        </TitleBar>
        <frame style="inside_shallow_frame_with_padding" direction="vertical">
          {!isRollingStock &&
            EntityAssemblyInfo.renderStageButtonRow(
              [L_GuiEntityInfo.FirstStage],
              firstStage,
              firstStageNum !== currentStageNum,
            )}
          {prevStageWithDiff !== nil &&
            EntityAssemblyInfo.renderStageButtonRow(
              [L_GuiEntityInfo.PrevStageWithChange],
              assembly.getStage(prevStageWithDiff)!,
              true,
            )}
          {nextStageWithDiff !== nil &&
            EntityAssemblyInfo.renderStageButtonRow(
              [L_GuiEntityInfo.NextStageWithChange],
              assembly.getStage(nextStageWithDiff)!,
              true,
            )}
          {firstStageNum !== currentStageNum && (
            <button
              styleMod={{ horizontally_stretchable: true }}
              caption={[L_GuiEntityInfo.MoveToThisStage]}
              on_gui_click={funcOn(this.moveToThisStage)}
            />
          )}
          {isRollingStock && [
            <button
              styleMod={{ horizontally_stretchable: true }}
              caption={[L_GuiEntityInfo.ResetTrain]}
              on_gui_click={funcOn(this.resetTrain)}
            />,
            <button
              styleMod={{ horizontally_stretchable: true }}
              caption={[L_GuiEntityInfo.SetTrainLocationHere]}
              on_gui_click={funcOn(this.setTrainLocationHere)}
            />,
          ]}
          {stageDiff && <line direction="horizontal" style="control_behavior_window_line" />}
          {stageDiff && this.renderStageDiffSettings(stageDiff)}
        </frame>
      </frame>
    )
  }

  private static teleportToStageAction(this: void, stage: Stage, event: OnGuiClickEvent) {
    const player = game.get_player(event.player_index)
    if (player) teleportToStage(player, stage)
  }
  private static renderStageButtonRow(label: LocalisedString, stage: Stage, enabled?: boolean): Spec {
    return (
      <flow styleMod={{ vertical_align: "center" }}>
        <label caption={label} />
        <HorizontalPusher />
        <button
          caption={stage.name}
          styleMod={{ width: StageButtonWidth, height: StageButtonHeight }}
          enabled={enabled}
          on_gui_click={bind(EntityAssemblyInfo.teleportToStageAction, stage)}
        />
      </flow>
    )
  }
  private moveToThisStage() {
    DefaultAssemblyUpdater.moveEntityToStage(this.stage.assembly, this.entity, this.stage.stageNumber, this.playerIndex)
    this.rerender(false)
  }
  private resetTrain() {
    AssemblyOperations.resetTrain(this.stage.assembly, this.entity)
  }
  private setTrainLocationHere() {
    AssemblyOperations.setTrainLocationToCurrent(this.stage.assembly, this.entity)
  }

  private renderStageDiffSettings(stageDiff: StageDiff<BlueprintEntity>): Spec {
    const diffEntries = Object.keys(stageDiff).sort() as Array<keyof BlueprintEntity>
    const nextLowerStageNum = this.entity.prevStageWithDiff(this.stage.stageNumber) ?? this.entity.getFirstStage()
    const nextLowerStageName = this.stage.assembly.getStage(nextLowerStageNum)!.name.get()
    return (
      <>
        <label caption={[L_GuiEntityInfo.StageDiff]} style="heading_2_label" />
        {diffEntries.map((k) => this.renderPropertyOptions(k, nextLowerStageName))}
        {diffEntries.length > 1 && this.renderPropertyOptions(true, nextLowerStageName)}
      </>
    )
  }
  private renderPropertyOptions(prop: keyof BlueprintEntity | true, nextLowerStageName: LocalisedString): Spec {
    const caption: LocalisedString = prop === true ? [L_GuiEntityInfo.AllProps] : prop
    return (
      <flow direction="horizontal">
        <label caption={caption} />
        <HorizontalPusher />
        <SmallToolButton
          sprite="utility/reset"
          tooltip={[L_GuiEntityInfo.ResetProp]}
          tags={{ prop }}
          on_gui_click={funcOn(this.resetProp)}
        />
        <SmallToolButton
          sprite="utility/speed_down"
          tooltip={[L_GuiEntityInfo.ApplyToLowerStage, nextLowerStageName]}
          tags={{ prop }}
          on_gui_click={funcOn(this.applyToLowerStage)}
        />
      </flow>
    )
  }

  private resetProp(event: OnGuiClickEvent) {
    const prop = event.element.tags.prop as keyof BlueprintEntity | true
    if (prop === true) {
      AssemblyOperations.resetAllProps(this.stage.assembly, this.entity, this.stage.stageNumber)
    } else {
      AssemblyOperations.resetProp(this.stage.assembly, this.entity, this.stage.stageNumber, prop as keyof Entity)
    }
    this.rerender(true)
  }
  private applyToLowerStage(event: OnGuiClickEvent) {
    const prop = event.element.tags.prop as keyof BlueprintEntity | true
    if (prop === true) {
      AssemblyOperations.moveAllPropsDown(this.stage.assembly, this.entity, this.stage.stageNumber)
    } else {
      AssemblyOperations.movePropDown(this.stage.assembly, this.entity, this.stage.stageNumber, prop as keyof Entity)
    }
    this.rerender(false)
  }

  private rerender(reopen: boolean) {
    const player = game.get_player(this.playerIndex)
    if (!player) return
    const worldEntity = this.entity.getWorldEntity(this.stage.stageNumber)
    if (!worldEntity) {
      player.opened = nil
      return
    }
    const currentOpened = player.opened
    if (currentOpened === worldEntity && reopen) {
      reopenEntity(player)
    } else if (currentOpened && currentOpened.object_name === "LuaEntity") {
      tryRenderExtraStageInfo(player, currentOpened)
    }
  }

  private refresh() {
    const player = game.get_player(this.playerIndex)
    if (!player) return
    const opened = player.opened
    if (opened && opened.object_name === "LuaEntity") {
      checkEntityUpdated(opened, this.playerIndex)
      tryRenderExtraStageInfo(player, opened)
    }
  }
}

const EntityAssemblyInfoName = script.mod_name + ":EntityAssemblyInfo"
function renderEntityStageInfo(player: LuaPlayer, entity: LuaEntity, assemblyEntity: AssemblyEntity, stage: Stage) {
  const guiType = entityTypeToGuiType[entity.type as BuildableEntityType]
  if (!guiType) return
  const anchor: GuiAnchor = {
    gui: guiType,
    position: relative_gui_position.right,
  }
  renderNamed(
    <EntityAssemblyInfo assemblyEntity={assemblyEntity} stage={stage} anchor={anchor} />,
    player.gui.relative,
    EntityAssemblyInfoName,
  )
}
function destroyEntityStageInfo(player: LuaPlayer) {
  destroy(player.gui.relative[EntityAssemblyInfoName])
}

function tryRenderExtraStageInfo(player: LuaPlayer, entity: LuaEntity): boolean {
  const [stage, assemblyEntity] = getAssemblyEntityOfEntity(entity)
  if (!stage) {
    destroyEntityStageInfo(player)
    return false
  }

  renderEntityStageInfo(player, entity, assemblyEntity, stage)
  return true
}

const Events = ProtectedEvents

declare global {
  interface PlayerData {
    entityToReopen?: LuaEntity
  }
}
declare const global: GlobalWithPlayers

const fakeRerenderTranslationId = script.mod_name + ":rerender-fake-translation"
function reopenEntity(player: LuaPlayer) {
  const opened = player.opened
  if (opened && opened.object_name === "LuaEntity") {
    global.players[player.index].entityToReopen = opened
    player.opened = nil
    player.request_translation([fakeRerenderTranslationId])
  }
}
Events.on_string_translated((event) => {
  const str = event.localised_string
  if (!Array.isArray(str) || str[0] !== fakeRerenderTranslationId) return
  const playerData = global.players[event.player_index]
  const entity = playerData.entityToReopen
  delete playerData.entityToReopen
  if (entity && entity.valid) {
    const player = game.get_player(event.player_index)!
    player.opened = entity
  }
})

Events.on_gui_opened((e) => {
  if (e.entity) tryRenderExtraStageInfo(game.get_player(e.player_index)!, e.entity)
})

Events.on_gui_closed((e) => {
  if (e.entity) destroyEntityStageInfo(game.get_player(e.player_index)!)
})

// // testing: which relative_gui corresponds to which entity
// Events.on_init(() => {
//   const player = game.players[1]
//   if (!player) return
//   for (const [name, value] of pairs(relative_gui_type)) {
//     const elem = player.gui.relative.add({
//       type: "frame",
//       caption: name,
//       tooltip: value,
//       anchor: {
//         gui: value,
//         position: relative_gui_position.left,
//       },
//     })!
//     elem.style.height = 300
//   }
// })

const entityTypeToGuiType: Record<BuildableEntityType, relative_gui_type | nil> = {
  accumulator: relative_gui_type.accumulator_gui,
  "ammo-turret": relative_gui_type.container_gui,
  "arithmetic-combinator": relative_gui_type.arithmetic_combinator_gui,
  "artillery-wagon": relative_gui_type.container_gui,
  "cargo-wagon": relative_gui_type.container_gui,
  "curved-rail": relative_gui_type.additional_entity_info_gui,
  "electric-energy-interface": relative_gui_type.electric_energy_interface_gui,
  "electric-turret": relative_gui_type.additional_entity_info_gui,
  "fluid-turret": relative_gui_type.additional_entity_info_gui,
  "infinity-container": relative_gui_type.container_gui,
  "infinity-pipe": relative_gui_type.infinity_pipe_gui,
  "land-mine": relative_gui_type.additional_entity_info_gui,
  "linked-container": relative_gui_type.linked_container_gui,
  "loader-1x1": relative_gui_type.loader_gui,
  "offshore-pump": relative_gui_type.generic_on_off_entity_gui,
  "pipe-to-ground": relative_gui_type.pipe_gui,
  "player-port": relative_gui_type.additional_entity_info_gui,
  "power-switch": relative_gui_type.power_switch_gui,
  "programmable-speaker": relative_gui_type.programmable_speaker_gui,
  "rail-chain-signal": relative_gui_type.rail_chain_signal_gui,
  "rail-signal": relative_gui_type.rail_signal_gui,
  "rocket-silo": relative_gui_type.rocket_silo_gui,
  "simple-entity-with-force": relative_gui_type.additional_entity_info_gui,
  "simple-entity-with-owner": relative_gui_type.additional_entity_info_gui,
  "solar-panel": relative_gui_type.additional_entity_info_gui,
  "train-stop": relative_gui_type.train_stop_gui,
  "transport-belt": relative_gui_type.transport_belt_gui,
  "underground-belt": relative_gui_type.additional_entity_info_gui,
  boiler: relative_gui_type.entity_with_energy_source_gui,
  container: relative_gui_type.container_gui,
  furnace: relative_gui_type.furnace_gui,
  gate: relative_gui_type.additional_entity_info_gui,
  generator: relative_gui_type.additional_entity_info_gui,
  inserter: relative_gui_type.inserter_gui,
  market: relative_gui_type.market_gui,
  pipe: relative_gui_type.pipe_gui,
  radar: relative_gui_type.entity_with_energy_source_gui,
  splitter: relative_gui_type.splitter_gui,
  "artillery-turret": relative_gui_type.container_gui,
  "assembling-machine": relative_gui_type.assembling_machine_gui,
  "burner-generator": relative_gui_type.entity_with_energy_source_gui,
  "constant-combinator": relative_gui_type.constant_combinator_gui,
  "decider-combinator": relative_gui_type.decider_combinator_gui,
  "electric-pole": relative_gui_type.electric_network_gui,
  "fluid-wagon": relative_gui_type.additional_entity_info_gui,
  "heat-interface": relative_gui_type.heat_interface_gui,
  "heat-pipe": relative_gui_type.additional_entity_info_gui,
  "linked-belt": relative_gui_type.additional_entity_info_gui,
  "logistic-container": relative_gui_type.container_gui,
  "mining-drill": relative_gui_type.mining_drill_gui,
  "storage-tank": relative_gui_type.storage_tank_gui,
  "straight-rail": relative_gui_type.additional_entity_info_gui,
  beacon: relative_gui_type.beacon_gui,
  lab: relative_gui_type.lab_gui,
  lamp: relative_gui_type.lamp_gui,
  loader: relative_gui_type.loader_gui,
  locomotive: relative_gui_type.train_gui,
  pump: relative_gui_type.entity_with_energy_source_gui,
  reactor: relative_gui_type.reactor_gui,
  roboport: relative_gui_type.roboport_gui,
  turret: relative_gui_type.additional_entity_info_gui,
  wall: relative_gui_type.wall_gui,
}
