import type { HeadlessClient } from "wisp/src/headless/client";
import { type Journey, type JourneyResult, journeyLines } from "wisp/src/headless/journey";
import type { Lockstep, SyncDelivery } from "wisp/src/headless/lockstep";
import { type CallbackTiming, MEASURED_BATTLE_NET, syncDelivery, turnBursts } from "wisp/src/headless/syncChannel";
import { KEY_A, KEY_Q, KEY_S, KEY_W } from "../src/input";
import type { Match } from "../src/main";
import { predictedAt } from "../src/netcode/session";
import { checksum } from "../src/sim/checksum";

const PREDICTED = "draws this client's prediction on a handle made at shared startup";

export const BATTLECRAFT_MAP = {
  filePrefix: "battlecraft", globalPrefixes: ["__battlecraft"],
  natives: () => ({ GetRectCenterX: () => 0, GetRectCenterY: () => 0 }),
  localNatives: {
    BlzIsKeyPressed: "local keys, sent through sync data as input rows",
    BlzSetSpecialEffectX: PREDICTED, BlzSetSpecialEffectY: PREDICTED, BlzSetSpecialEffectYaw: PREDICTED, BlzSetSpecialEffectAlpha: PREDICTED,
    BlzSetSpecialEffectPosition: PREDICTED, BlzPlaySpecialEffect: PREDICTED,
    SetTextTagText: PREDICTED, SetTextTagPos: PREDICTED, SetTextTagColor: PREDICTED, SetTextTagVelocity: PREDICTED, SetTextTagVisibility: PREDICTED,
  },
  intentionalNoops: {
    FogEnable: "visibility only; the simulation never reads it",
    FogMaskEnable: "visibility only; the simulation never reads it",
  },
};

export const ARENA_JOURNEY: Journey = {
  frames: 300,
  events: [
    { frame: 10, player: 0, key: KEY_W, meta: 0, down: true },
    { frame: 12, player: 1, key: KEY_S, meta: 0, down: true },
    { frame: 20, player: 1, key: KEY_A, meta: 0, down: true },
    { frame: 30, player: 0, key: KEY_W, meta: 0, down: false },
    { frame: 34, player: 1, key: KEY_S, meta: 0, down: false },
    { frame: 40, player: 1, key: KEY_A, meta: 0, down: false },
    { frame: 60, player: 0, key: KEY_Q, meta: 0 },
    { frame: 66, player: 1, playerMouse: { x: -300, y: 52 } },
    { frame: 70, player: 1, key: KEY_Q, meta: 0 },
    { frame: 86, player: 1, key: KEY_Q, meta: 0 },
    { frame: 100, player: 0, key: KEY_Q, meta: 0 },
    { frame: 120, player: 0, playerMouse: { x: 300, y: 500 } },
    { frame: 130, player: 0, key: KEY_Q, meta: 0, down: true },
    { frame: 133, player: 0, key: KEY_Q, meta: 0, down: false },
    { frame: 140, player: 1, key: KEY_Q, meta: 0 },
    { frame: 150, reload: true },
    { frame: 200, player: 0, key: KEY_W, meta: 0, down: true },
    { frame: 210, player: 1, key: KEY_Q, meta: 0 },
    { frame: 220, player: 0, key: KEY_W, meta: 0, down: false },
    { frame: 300, player: 0, chat: "-checksum" },
  ],
};

export interface JourneyNet {
  readonly name: string;
  readonly delivery?: (this: void) => SyncDelivery;
  readonly callbacks?: (this: void) => CallbackTiming;
}

// Wisp's Lua runner takes no callback timing, so arrivals move to the next turn's first callback here, as Lockstep does.
export function burstDelivery(delivery: SyncDelivery, timing: CallbackTiming): SyncDelivery {
  return {
    arrivalFrame: (sender, frame, message) => {
      let start = delivery.arrivalFrame(sender, frame, message);
      while (timing.wallMs(start) <= timing.wallMs(start - 1)) start++;
      return start;
    },
  };
}

export const JOURNEY_NETS: readonly JourneyNet[] = [
  { name: "instant" },
  { name: "Battle.net", delivery: () => syncDelivery(MEASURED_BATTLE_NET) },
  { name: "turn bursts", delivery: () => burstDelivery(syncDelivery(MEASURED_BATTLE_NET), turnBursts()), callbacks: () => turnBursts() },
];

export function netOptions(net: JourneyNet): { delivery?: SyncDelivery; callbacks?: CallbackTiming } {
  return {
    ...(net.delivery === undefined ? {} : { delivery: net.delivery() }),
    ...(net.callbacks === undefined ? {} : { callbacks: net.callbacks() }),
  };
}

export const CHECK_FRAME = 250;

export function journeyReport(net: JourneyNet, clients: Lockstep, result: JourneyResult, matchOf: (this: void, client: HeadlessClient) => Match | undefined): string[] {
  const lines = [`${net.name}:`];
  const transport = `${net.name} transport`;
  for (const line of journeyLines(result)) lines.push(line.includes(" native calls") ? `${transport} ${line}` : `${net.name} ${line}`);
  for (const client of clients.clients) {
    const current = matchOf(client);
    const who = `${net.name} p${client.slot}`;
    if (current === undefined) {
      lines.push(`${who}: no match`);
      continue;
    }
    const session = current.session;
    const stats = session.stats;
    const checked = session.confirmedFrame >= CHECK_FRAME ? predictedAt(session, CHECK_FRAME) : undefined;
    const settled = predictedAt(session, session.confirmedFrame);
    lines.push(`${who}: arrows hit the dummy on frames ${current.dummyHits.join(" ")}`);
    lines.push(`${who}: frame ${CHECK_FRAME} checksum ${checked === undefined ? "not confirmed" : checksum(checked)}`);
    lines.push(`${who}: the rolled-back prediction ${settled !== undefined && checksum(settled) === checksum(session.confirmed) ? "equals" : "differs from"} the confirmed state`);
    lines.push(`${who}: hit text floated once for arrows ${current.display.shownHits.join(" ")}`);
    lines.push(`${transport} p${client.slot}: confirmed frame ${session.confirmedFrame} checksum ${checksum(session.confirmed)}, predicted to frame ${session.present}`);
    lines.push(`${transport} p${client.slot}: ${stats.rollbacks} rollbacks up to ${stats.deepest} frames deep, ${stats.held} held callbacks, ${stats.messages} messages up to ${stats.largest} bytes, ${stats.refused} refused`);
  }
  return lines;
}
