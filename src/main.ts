import { configureRuntime } from "wisp/src/runtime/config";
import { at } from "wisp/src/runtime/lookup";
import { installDispatch, on, trampoline } from "wisp/src/map/dispatch";
import { writeLine } from "wisp/src/map/fileio";
import { installHotReload, startHotReload } from "wisp/src/map/hotReload";
import { f32 } from "wisp/src/sim/f32";
import { type Display, createDisplay, draw, noticeHits } from "./display";
import { ABILITY_KEYS, KEY_METAS, MOVE_KEYS, type PlayerInput, aimAt, keyDown, playerInput, poll } from "./input";
import { INPUT_CODEC, inputRow } from "./inputCodec";
import { NET_SETTINGS, type Session, type Simulation, createSession, leave, predictedState, receive, tick } from "wisp/src/netcode/session";
import { checksum } from "./sim/checksum";
import type { InputRow } from "./sim/input";
import { DUMMY, type SimState } from "./sim/state";
import { initialState, step } from "./sim/step";

const PLAYERS = 2;
const INPUT_PREFIX = "BCIN";
const REMEMBERED_HITS = 64;

export interface Match {
  readonly session: Session<InputRow, SimState>;
  readonly inputs: readonly PlayerInput[];
  readonly moveKeys: readonly oskeytype[];
  readonly abilityKeys: readonly oskeytype[];
  readonly idle: InputRow;
  readonly display: Display;
  readonly dummyHits: number[];
  aimProbe: boolean;
}

declare global {
  var __battlecraftMatch: Match | undefined;
}

function match(): Match {
  const current = globalThis.__battlecraftMatch;
  if (current === undefined) throw new Error("Battlecraft match used before start");
  return current;
}

function predicted(state: SimState): void {
  noticeHits(match().display, state);
}

function confirmed(state: SimState): void {
  const hits = match().dummyHits;
  for (const hit of state.hits) if (hit.target === DUMMY) hits.push(state.frame);
  while (hits.length > REMEMBERED_HITS) hits.shift();
}

const BATTLECRAFT_NET: Simulation<InputRow, SimState> = { codec: INPUT_CODEC, step, predicted, confirmed };

function pollLocalKeys(current: Match, input: PlayerInput): void {
  let held = 0;
  for (let index = 0; index < MOVE_KEYS.length; index++) {
    if (BlzIsKeyPressed(at(current.moveKeys, index))) held = held | at(MOVE_KEYS, index)[1];
  }
  let abilities = 0;
  for (let index = 0; index < current.abilityKeys.length; index++) {
    if (BlzIsKeyPressed(at(current.abilityKeys, index))) abilities = abilities | (1 << index);
  }
  poll(input, held, abilities);
}

function frame(): void {
  const current = match();
  const session = current.session;
  const local = current.inputs[session.local];
  if (local !== undefined) pollLocalKeys(current, local);
  const wire = tick(session, BATTLECRAFT_NET, NET_SETTINGS, local === undefined ? current.idle : local.sample);
  if (wire !== undefined) BlzSendSyncData(INPUT_PREFIX, wire);
  draw(current.display, predictedState(session));
}

function synced(): void {
  receive(match().session, BATTLECRAFT_NET, GetPlayerId(GetTriggerPlayer()), BlzGetTriggerSyncData());
}

function left(): void {
  leave(match().session, BATTLECRAFT_NET, GetPlayerId(GetTriggerPlayer()));
}

function playing(player: number): boolean {
  return GetPlayerSlotState(Player(player)) === PLAYER_SLOT_STATE_PLAYING && GetPlayerController(Player(player)) === MAP_CONTROL_USER;
}

function pressed(): void {
  const current = match();
  const key = GetHandleId(BlzGetTriggerPlayerKey());
  const sender = GetPlayerId(GetTriggerPlayer());
  if (sender === current.session.local) keyDown(at(current.inputs, sender), key);
}

function mouseMoved(): void {
  const x = BlzGetTriggerPlayerMouseX();
  const y = BlzGetTriggerPlayerMouseY();
  // Warcraft reports the pointer at (0, 0) while it is over the interface.
  if (x === 0 && y === 0) return;
  const current = match();
  const player = GetPlayerId(GetTriggerPlayer());
  aimAt(at(current.inputs, player), x, y, current.display.centerX, current.display.centerY);
  if (!current.aimProbe) return;
  current.aimProbe = false;
  writeLine(`battlecraft-aim-p${current.session.local}.txt`, `player ${player} callback ${current.session.callbacks} aim ${x} ${y}`);
}

function armAimProbe(): void {
  match().aimProbe = true;
}

function showChecksum(): void {
  const current = match();
  const session = current.session;
  const line = `frame ${session.confirmedFrame} checksum ${checksum(session.confirmed)} dummy hits ${current.dummyHits.join(" ")}`;
  DisplayTextToForce(GetPlayersAll(), line);
  writeLine(`battlecraft-checksum-p${session.local}.txt`, line);
}

export function install(this: void): void {
  configureRuntime({ filePrefix: "battlecraft", readyPrefix: "BC_HRR", globalPrefix: "__battlecraft" });
  installDispatch();
  on("battlecraft.frame", frame);
  on("battlecraft.sync", synced);
  on("battlecraft.leave", left);
  on("battlecraft.keyDown", pressed);
  on("battlecraft.mouse", mouseMoved);
  on("battlecraft.checksum", showChecksum);
  on("battlecraft.aimProbe", armAimProbe);
  installHotReload();
}

export function start(this: void): void {
  install();
  const sim = initialState([0, 0]);
  const inputs: PlayerInput[] = [];
  for (let player = 0; player < PLAYERS; player++) inputs.push(playerInput());
  const display = createDisplay(sim, GetRectCenterX(bj_mapInitialPlayableArea), GetRectCenterY(bj_mapInitialPlayableArea));
  FogEnable(false);
  FogMaskEnable(false);
  SetCameraPosition(display.centerX, display.centerY);
  const session = createSession(BATTLECRAFT_NET, NET_SETTINGS, PLAYERS, GetPlayerId(GetLocalPlayer()), sim);
  for (let player = 0; player < PLAYERS; player++) if (!playing(player)) leave(session, BATTLECRAFT_NET, player);
  const moveKeys = MOVE_KEYS.map(([key]) => ConvertOsKeyType(key));
  const abilityKeys = ABILITY_KEYS.map((key) => ConvertOsKeyType(key));
  globalThis.__battlecraftMatch = { session, inputs, moveKeys, abilityKeys, idle: inputRow(), display, dummyHits: [], aimProbe: false };
  const sync = CreateTrigger();
  const down = CreateTrigger();
  const mouse = CreateTrigger();
  const chat = CreateTrigger();
  const probe = CreateTrigger();
  const leaving = CreateTrigger();
  for (let player = 0; player < PLAYERS; player++) {
    BlzTriggerRegisterPlayerSyncEvent(sync, Player(player), INPUT_PREFIX, false);
    for (const key of abilityKeys) {
      for (let meta = 0; meta < KEY_METAS; meta++) BlzTriggerRegisterPlayerKeyEvent(down, Player(player), key, meta, true);
    }
    TriggerRegisterPlayerEvent(mouse, Player(player), EVENT_PLAYER_MOUSE_MOVE);
    TriggerRegisterPlayerChatEvent(chat, Player(player), "-checksum", true);
    TriggerRegisterPlayerChatEvent(probe, Player(player), "-aimprobe", true);
    TriggerRegisterPlayerEvent(leaving, Player(player), EVENT_PLAYER_LEAVE);
  }
  TriggerAddAction(sync, trampoline("battlecraft.sync"));
  TriggerAddAction(down, trampoline("battlecraft.keyDown"));
  TriggerAddAction(mouse, trampoline("battlecraft.mouse"));
  TriggerAddAction(chat, trampoline("battlecraft.checksum"));
  TriggerAddAction(probe, trampoline("battlecraft.aimProbe"));
  TriggerAddAction(leaving, trampoline("battlecraft.leave"));
  TimerStart(CreateTimer(), f32(1 / 60), true, trampoline("battlecraft.frame"));
  startHotReload();
}
