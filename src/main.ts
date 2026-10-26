import { configureRuntime } from "wisp/src/runtime/config";
import { at } from "wisp/src/runtime/lookup";
import { installDispatch, on, trampoline } from "wisp/src/map/dispatch";
import { installHotReload, startHotReload } from "wisp/src/map/hotReload";
import { f32 } from "wisp/src/sim/f32";
import { type Display, createDisplay, draw } from "./display";
import { ABILITY_KEYS, KEY_METAS, MOVE_KEYS, type PlayerInput, aimAt, keyDown, keyUp, takeRow } from "./input";
import { checksum } from "./sim/checksum";
import type { SimState } from "./sim/state";
import { initialState, step } from "./sim/step";

const PLAYERS = 2;

interface Match {
  sim: SimState;
  readonly inputs: readonly PlayerInput[];
  readonly display: Display;
}

declare global {
  var __battlecraftMatch: Match | undefined;
}

function match(): Match {
  const current = globalThis.__battlecraftMatch;
  if (current === undefined) throw new Error("Battlecraft match used before start");
  return current;
}

function frame(): void {
  const current = match();
  current.sim = step(current.sim, current.inputs.map((input) => takeRow(input)));
  draw(current.display, current.sim);
}

function triggerInput(): PlayerInput {
  return at(match().inputs, GetPlayerId(GetTriggerPlayer()));
}

function pressed(): void {
  keyDown(triggerInput(), GetHandleId(BlzGetTriggerPlayerKey()));
}

function released(): void {
  keyUp(triggerInput(), GetHandleId(BlzGetTriggerPlayerKey()));
}

function mouseMoved(): void {
  const x = BlzGetTriggerPlayerMouseX();
  const y = BlzGetTriggerPlayerMouseY();
  // Warcraft reports the pointer at (0, 0) while it is over the interface.
  if (x === 0 && y === 0) return;
  const current = match();
  aimAt(triggerInput(), x, y, current.display.centerX, current.display.centerY);
}

function showChecksum(): void {
  DisplayTextToForce(GetPlayersAll(), `frame ${match().sim.frame} checksum ${checksum(match().sim)}`);
}

export function install(this: void): void {
  configureRuntime({ filePrefix: "battlecraft", readyPrefix: "BC_HRR", globalPrefix: "__battlecraft" });
  installDispatch();
  on("battlecraft.frame", frame);
  on("battlecraft.keyDown", pressed);
  on("battlecraft.keyUp", released);
  on("battlecraft.mouse", mouseMoved);
  on("battlecraft.checksum", showChecksum);
  installHotReload();
}

export function start(this: void): void {
  install();
  const sim = initialState([0, 0]);
  const inputs: PlayerInput[] = [];
  for (let player = 0; player < PLAYERS; player++) inputs.push({ held: 0, pressed: 0, aimX: 0, aimY: 0, castAimX: 0, castAimY: 0 });
  const display = createDisplay(sim, GetRectCenterX(bj_mapInitialPlayableArea), GetRectCenterY(bj_mapInitialPlayableArea));
  globalThis.__battlecraftMatch = { sim, inputs, display };
  const down = CreateTrigger();
  const up = CreateTrigger();
  const mouse = CreateTrigger();
  const chat = CreateTrigger();
  for (let player = 0; player < PLAYERS; player++) {
    for (const key of [...MOVE_KEYS.map(([moveKey]) => moveKey), ...ABILITY_KEYS]) {
      for (let meta = 0; meta < KEY_METAS; meta++) {
        BlzTriggerRegisterPlayerKeyEvent(down, Player(player), ConvertOsKeyType(key), meta, true);
        BlzTriggerRegisterPlayerKeyEvent(up, Player(player), ConvertOsKeyType(key), meta, false);
      }
    }
    TriggerRegisterPlayerEvent(mouse, Player(player), EVENT_PLAYER_MOUSE_MOVE);
    TriggerRegisterPlayerChatEvent(chat, Player(player), "-checksum", true);
  }
  TriggerAddAction(down, trampoline("battlecraft.keyDown"));
  TriggerAddAction(up, trampoline("battlecraft.keyUp"));
  TriggerAddAction(mouse, trampoline("battlecraft.mouse"));
  TriggerAddAction(chat, trampoline("battlecraft.checksum"));
  TimerStart(CreateTimer(), f32(1 / 60), true, trampoline("battlecraft.frame"));
  startHotReload();
}
