import { afterAll, expect, test } from "bun:test";
import { join } from "node:path";
import { mapCompiler, report } from "wisp/scripts/compiler";
import { installHeadless } from "wisp/scripts/wisp/headless";
import { journeyLines, runJourney } from "wisp/src/headless/journey";
import { install, start } from "../src/main";
import { ranger } from "../src/champions/ranger";
import { checksum } from "../src/sim/checksum";
import { SCALE } from "../src/sim/fixed";
import type { SimState } from "../src/sim/state";
import { ARENA_JOURNEY, BATTLECRAFT_MAP } from "./journey";

const headless = installHeadless(BATTLECRAFT_MAP);
afterAll(headless.restore);

const root = join(import.meta.dir, "..");

function playInBun() {
  const clients = headless.clients({ start, install });
  return { clients, result: runJourney(clients, ARENA_JOURNEY) };
}

test("both champions move and cast, the arrows hit the dummy until it resets, and both clients agree", () => {
  const { clients, result } = playInBun();
  expect(result.divergence).toBeUndefined();
  expect(result.reloads).toEqual([]);
  const states: SimState[] = [];
  for (const client of clients.clients) {
    expect(client.errors).toEqual([]);
    expect(client.missingNatives).toEqual([]);
    client.run(() => {
      const sim = globalThis.__battlecraftMatch?.sim;
      if (sim !== undefined) states.push(sim);
    });
    const labels = client.log.filter(({ name }) => name === "SetTextTagText").map(({ args }) => String(args[1]));
    expect(labels.filter((text) => text.startsWith("Training dummy"))).toEqual(
      ["Training dummy 100/100", "Training dummy 70/100", "Training dummy 40/100", "Training dummy 10/100", "Training dummy 100/100"]);
    expect(labels.filter((text) => text === "-30")).toHaveLength(4);
  }
  const [first, second] = states;
  if (first === undefined || second === undefined) throw new Error("a client has no match state");
  expect(checksum(first)).toBe(checksum(second));
  const [ranger0, ranger1] = first.champions;
  const straight = ranger.moveSpeed;
  const diagonal = Math.floor(straight * 181 / 256);
  expect({ x: ranger0?.x, y: ranger0?.y }).toEqual({ x: -600 * SCALE, y: 40 * straight });
  expect({ x: ranger1?.x, y: ranger1?.y }).toEqual({ x: 600 * SCALE - 14 * diagonal - 6 * straight, y: -8 * straight - 14 * diagonal });
  expect(first.nextProjectile).toBe(4);
  expect(first.projectiles).toEqual([]);
  for (const client of clients.clients) {
    expect(client.messages).toEqual(["hot reload 1 applied", `frame ${first.frame} checksum ${checksum(first)}`]);
  }
  const [one, two] = result.clients;
  expect(one?.calls).toBe(two?.calls ?? 0);
  expect(one?.checksum).toBe(two?.checksum ?? "");
});

test("the compiled bundle in 32-bit Lua plays the same journey with the same native calls as the TypeScript in Bun", () => {
  expect(report(mapCompiler(join(root, "tsconfig.map.json"))())).toBe("");
  expect(report(mapCompiler(join(root, "tsconfig.headless.json"))())).toBe("");
  const run = Bun.spawnSync([
    process.env.LUA ?? "lua", join(root, "build/headless/headless.lua"),
    join(root, "build/map.lua"), join(root, "node_modules/wisp/src/natives/warcraft.d.ts"),
  ], { stdout: "pipe", stderr: "pipe" });
  const lines = run.stdout.toString().trimEnd().split(/\r?\n/);
  console.log(lines.join("\n"));
  expect({ code: run.exitCode, stderr: run.stderr.toString() }).toEqual({ code: 0, stderr: "" });
  expect(lines).toEqual(journeyLines(playInBun().result));
});
