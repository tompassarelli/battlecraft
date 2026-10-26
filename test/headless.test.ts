import { afterAll, expect, test } from "bun:test";
import { join } from "node:path";
import { mapCompiler, report } from "wisp/scripts/compiler";
import { installHeadless } from "wisp/scripts/wisp/headless";
import type { HeadlessClient } from "wisp/src/headless/client";
import { runJourney } from "wisp/src/headless/journey";
import type { Journey } from "wisp/src/headless/journey";
import { at } from "wisp/src/runtime/lookup";
import { createDisplay, noticeHits } from "../src/display";
import { KEY_Q, KEY_W } from "../src/input";
import { INPUT_CODEC, inputRow } from "../src/inputCodec";
import { type Match, install, start } from "../src/main";
import { ranger } from "../src/champions/ranger";
import { NET_SETTINGS, type Session, type Simulation, createSession, predictedAt, receive, tick } from "../src/netcode/session";
import { checksum } from "../src/sim/checksum";
import { SCALE } from "../src/sim/fixed";
import type { InputRow } from "../src/sim/input";
import { DUMMY, type SimState } from "../src/sim/state";
import { initialState, step } from "../src/sim/step";
import { ARENA_JOURNEY, BATTLECRAFT_MAP, CHECK_FRAME, JOURNEY_NETS, type JourneyNet, journeyReport, netOptions } from "./journey";

const headless = installHeadless(BATTLECRAFT_MAP);
afterAll(headless.restore);

const root = join(import.meta.dir, "..");

function matchOf(client: HeadlessClient): Match | undefined {
  let current: Match | undefined;
  client.run(() => {
    current = globalThis.__battlecraftMatch;
  });
  return current;
}

function play(net: JourneyNet) {
  const clients = headless.clients({ start, install }, [0, 1], netOptions(net));
  const result = runJourney(clients, ARENA_JOURNEY);
  return { clients, result, lines: journeyReport(net, clients, result, matchOf) };
}

test("under instant, Battle.net and turn-burst delivery both clients move, aim with the mouse, cast, hit the dummy on the same frames and miss once to range, roll back to the confirmed state and agree", () => {
  for (const net of JOURNEY_NETS) {
    const { clients, result, lines } = play(net);
    console.log(lines.join("\n"));
    expect(result.divergence).toBeUndefined();
    expect(result.reloads).toEqual([]);
    const matches: Match[] = [];
    for (const client of clients.clients) {
      expect(client.errors).toEqual([]);
      expect(client.missingNatives).toEqual([]);
      const current = matchOf(client);
      if (current === undefined) throw new Error(`p${client.slot} has no match`);
      matches.push(current);
      const session = current.session;
      expect(session.stats.refused).toBe(0);
      expect(session.stats.largest).toBeLessThanOrEqual(200);
      expect(session.stats.messages * 6).toBeLessThanOrEqual(session.callbacks + 18);
      const settled = predictedAt(session, session.confirmedFrame);
      expect(settled === undefined ? "gone" : checksum(settled)).toBe(checksum(session.confirmed));
      expect(current.display.shownHits).toEqual(["0@63.0", "1@73.0", "1@143.0", "1@213.0"]);
      const labels = client.textTags.poses().map(({ text }) => text);
      expect(labels).toContain("Training dummy 100/100");
      const shown = `frame ${session.confirmedFrame} checksum ${checksum(session.confirmed)} dummy hits 90 96 166 236`;
      expect(client.messages).toEqual(["hot reload 1 applied", shown]);
      expect(client.files.get(`battlecraft-checksum-p${client.slot}.txt`)).toEqual([shown]);
    }
    const [first, second] = matches;
    if (first === undefined || second === undefined) throw new Error("a client has no match");
    expect(first.dummyHits).toHaveLength(4);
    expect(second.dummyHits).toEqual(first.dummyHits);
    expect(second.session.confirmedFrame).toBe(first.session.confirmedFrame);
    expect(checksum(second.session.confirmed)).toBe(checksum(first.session.confirmed));
    expect(first.session.confirmedFrame).toBeGreaterThanOrEqual(CHECK_FRAME);
    if (net.delivery !== undefined) expect(first.session.stats.rollbacks + second.session.stats.rollbacks).toBeGreaterThan(0);
    const confirmed = first.session.confirmed;
    expect(confirmed.frame).toBeGreaterThan(240);
    expect(confirmed.dummy.health).toBe(100);
    const [ranger0, ranger1] = confirmed.champions;
    const straight = ranger.moveSpeed;
    const diagonal = Math.floor(straight * 181 / 256);
    expect({ x: ranger0?.x, y: ranger0?.y }).toEqual({ x: -600 * SCALE, y: 40 * straight });
    expect({ x: ranger1?.x, y: ranger1?.y }).toEqual({ x: 600 * SCALE - 14 * diagonal - 6 * straight, y: -8 * straight - 14 * diagonal });
    expect(confirmed.nextProjectile).toBe(5);
    expect(confirmed.projectiles).toEqual([]);
    const [one, two] = result.clients;
    expect(one?.calls).toBe(two?.calls ?? 0);
    expect(one?.checksum).toBe(two?.checksum ?? "");
  }
});

test("the compiled bundle in 32-bit Lua plays the journey under every delivery with the same calls, rollbacks, hit frames, checksums and display as the TypeScript in Bun", () => {
  expect(report(mapCompiler(join(root, "tsconfig.map.json"))())).toBe("");
  expect(report(mapCompiler(join(root, "tsconfig.headless.json"))())).toBe("");
  const run = Bun.spawnSync([
    process.env.LUA ?? "lua", join(root, "build/headless/headless.lua"),
    join(root, "build/map.lua"), join(root, "node_modules/wisp/src/natives/warcraft.d.ts"),
  ], { stdout: "pipe", stderr: "pipe" });
  const lines = run.stdout.toString().trimEnd().split(/\r?\n/);
  console.log(lines.join("\n"));
  expect({ code: run.exitCode, stderr: run.stderr.toString() }).toEqual({ code: 0, stderr: "" });
  expect(lines).toEqual(JOURNEY_NETS.flatMap((net) => play(net).lines));
}, 60_000);

const SOLO_JOURNEY: Journey = {
  frames: 420,
  events: [
    { frame: 10, player: 0, key: KEY_W, meta: 0, down: true },
    { frame: 30, player: 0, key: KEY_W, meta: 0, down: false },
    { frame: 60, player: 0, key: KEY_Q, meta: 0 },
    { frame: 320, player: 0, key: KEY_Q, meta: 0 },
  ],
};

test("with one human player in the game the match keeps stepping past frame 300, the champion moves and its skillshot hits the dummy", () => {
  const clients = headless.clients({ start, install }, [0]);
  const result = runJourney(clients, SOLO_JOURNEY);
  expect(result.divergence).toBeUndefined();
  const client = at(clients.clients, 0);
  expect(client.errors).toEqual([]);
  const current = matchOf(client);
  if (current === undefined) throw new Error("p0 has no match");
  const session = current.session;
  expect(session.present).toBeGreaterThan(400);
  expect(session.confirmedFrame).toBeGreaterThan(400);
  expect(checksum(predictedAt(session, session.confirmedFrame) ?? initialState([0, 0]))).toBe(checksum(session.confirmed));
  expect(current.dummyHits).toHaveLength(2);
  expect(at(current.dummyHits, 1)).toBeGreaterThan(300);
  const [ranger0, ranger1] = session.confirmed.champions;
  expect({ x: ranger0?.x, y: ranger0?.y }).toEqual({ x: -600 * SCALE, y: 20 * ranger.moveSpeed });
  expect({ x: ranger1?.x, y: ranger1?.y }).toEqual({ x: 600 * SCALE, y: 0 });
  expect(session.confirmed.dummy.health).toBe(40);
  expect(session.stats.refused).toBe(0);
});

interface Delivery {
  readonly arrival: number;
  readonly sender: number;
  readonly wire: string;
}

test("rollback: a late remote cast whose short flight lands inside the rollback window renumbers projectiles, and each hit's damage text floats once on both clients", () => {
  const host = at(headless.clients({ start, install }, [0]).clients, 0);
  host.run(() => {
    const begin = initialState([0, 0]);
    const initial: SimState = { ...begin, champions: begin.champions.map((champion) => ({ ...champion, x: champion.id === 0 ? -200 * SCALE : 150 * SCALE })) };
    const floats: number[][] = [[], []];
    const floatCallbacks: number[][] = [[], []];
    const confirmedHits: number[][] = [[], []];
    let callback = 0;
    const sims = [0, 1].map((player): Simulation<InputRow, SimState> => {
      const display = createDisplay(initial, 0, 0);
      return {
        codec: INPUT_CODEC, step,
        predicted: (state) => {
          const before = display.nextFloater;
          noticeHits(display, state);
          const floated = (display.nextFloater - before + display.floaters.length) % display.floaters.length;
          for (let index = 0; index < floated; index++) {
            at(floats, player).push(state.frame);
            at(floatCallbacks, player).push(callback);
          }
        },
        confirmed: (state) => {
          for (const hit of state.hits) if (hit.target === DUMMY) at(confirmedHits, player).push(state.frame);
        },
      };
    });
    const sessions: Session<InputRow, SimState>[] = sims.map((sim, player) => createSession(sim, NET_SETTINGS, 2, player, initial));
    const samples = [inputRow(), inputRow()];
    const network: Delivery[] = [];
    const lateFrom = 20;
    const lateUntil = 33;
    for (callback = 1; callback <= 120; callback++) {
      for (let index = 0; index < network.length;) {
        const message = at(network, index);
        if (message.arrival > callback) index++;
        else {
          for (let player = 0; player < 2; player++) expect(receive(at(sessions, player), at(sims, player), message.sender, message.wire)).toBe("accepted");
          network.splice(index, 1);
        }
      }
      for (let player = 0; player < 2; player++) {
        const sample = at(samples, player);
        if (callback === (player === 0 ? lateFrom : lateFrom + 3)) sample.pressed = 1;
        const wire = tick(at(sessions, player), at(sims, player), NET_SETTINGS, sample);
        if (wire === undefined) continue;
        const late = player === 0 && callback >= lateFrom && callback < lateUntil;
        network.push({ arrival: late ? lateUntil : callback + 1, sender: player, wire });
      }
    }
    const [first, second] = sessions;
    if (first === undefined || second === undefined) throw new Error("two sessions");
    expect(checksum(second.confirmed)).toBe(checksum(first.confirmed));
    expect(first.confirmed.nextProjectile).toBe(2);
    const truth = at(confirmedHits, 0);
    expect(truth).toHaveLength(2);
    expect(at(confirmedHits, 1)).toEqual(truth);
    expect(second.stats.rollbacks).toBeGreaterThan(0);
    expect(at(at(floatCallbacks, 1), 0)).toBeLessThan(lateUntil);
    for (let player = 0; player < 2; player++) expect({ player, floats: [...at(floats, player)].sort((a, b) => a - b) }).toEqual({ player, floats: truth });
  });
});
