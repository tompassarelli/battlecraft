import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { BUILD_FOLDER, OLD_BUILDS, installBuild } from "../scripts/mapBuilds";

test("installing keeps only the newest build and moves older ones into old", async () => {
  const documents = mkdtempSync(join(tmpdir(), "battlecraft-install-"));
  const folder = join(documents, BUILD_FOLDER);
  mkdirSync(join(documents, OLD_BUILDS), { recursive: true });
  writeFileSync(join(folder, "Battlecraft-aaaaaaa.w3x"), "older");
  writeFileSync(join(documents, OLD_BUILDS, "Battlecraft-0000000.w3x"), "oldest");
  const staged = join(mkdtempSync(join(tmpdir(), "battlecraft-staged-")), "Battlecraft-bbbbbbb.w3x");
  writeFileSync(staged, "newest");
  expect(await Effect.runPromise(installBuild(documents, staged))).toBe(join(folder, "Battlecraft-bbbbbbb.w3x"));
  expect(readdirSync(folder).sort()).toEqual(["Battlecraft-bbbbbbb.w3x", "old"]);
  expect(readdirSync(join(documents, OLD_BUILDS)).sort()).toEqual(["Battlecraft-0000000.w3x", "Battlecraft-aaaaaaa.w3x"]);
});
