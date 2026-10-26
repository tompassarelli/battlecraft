import { afterAll, expect, test } from "bun:test";
import { join } from "node:path";
import { mapCompiler, report } from "wisp/scripts/compiler";
import { installHeadless } from "wisp/scripts/wisp/headless";
import type { HeadlessClient } from "wisp/src/headless/client";
import { runJourney } from "wisp/src/headless/journey";
import { type Match, install, start } from "../src/main";
import { ranger } from "../src/champions/ranger";
import { predictedAt } from "../src/netcode/session";
import { checksum } from "../src/sim/checksum";
import { SCALE } from "../src/sim/fixed";
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

test("under instant, Battle.net and turn-burst delivery both clients move, cast and hit the dummy on the same frames, roll back to the confirmed state and agree", () => {
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
      expect([...current.display.shownHits].sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
      const labels = client.textTags.poses().map(({ text }) => text);
      expect(labels).toContain("Training dummy 100/100");
      expect(client.messages).toEqual(["hot reload 1 applied", `frame ${session.confirmedFrame} checksum ${checksum(session.confirmed)}`]);
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
    expect(confirmed.nextProjectile).toBe(4);
    expect(confirmed.projectiles).toEqual([]);
    const [one, two] = result.clients;
    expect(one?.calls).toBe(two?.calls ?? 0);
    expect(one?.checksum).toBe(two?.checksum ?? "");
  }
});

test("the compiled bundle in 32-bit Lua plays the journey under every delivery with the same hit frames, checksums and display as the TypeScript in Bun", () => {
  expect(report(mapCompiler(join(root, "tsconfig.map.json"))())).toBe("");
  expect(report(mapCompiler(join(root, "tsconfig.headless.json"))())).toBe("");
  const run = Bun.spawnSync([
    process.env.LUA ?? "lua", join(root, "build/headless/headless.lua"),
    join(root, "build/map.lua"), join(root, "node_modules/wisp/src/natives/warcraft.d.ts"),
  ], { stdout: "pipe", stderr: "pipe" });
  const lines = run.stdout.toString().trimEnd().split(/\r?\n/);
  console.log(lines.join("\n"));
  expect({ code: run.exitCode, stderr: run.stderr.toString() }).toEqual({ code: 0, stderr: "" });
  const bun = JOURNEY_NETS.flatMap((net) => play(net).lines);
  // Wisp's syncDelivery computes some arrival frames a frame later in Lua32 than in Bun, so only instant delivery's transport matches exactly.
  const compared = (line: string) => !line.includes(" transport ") || line.startsWith("instant ");
  expect(lines.filter(compared)).toEqual(bun.filter(compared));
  expect(lines.filter((line) => !compared(line))).toHaveLength(bun.filter((line) => !compared(line)).length);
});
