import { expect, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mapCompiler, report } from "wisp/scripts/compiler";
import { rollbackGoldenRecord } from "./golden/rollbackGolden";

const RECORD = join(import.meta.dir, "fixtures/rollback-golden.txt");

function recorded(actual: readonly string[]): string[] {
  if (process.env.RECORD_GOLDEN === "1" || !existsSync(RECORD)) writeFileSync(RECORD, `${actual.join("\n")}\n`);
  return readFileSync(RECORD, "utf8").trimEnd().split("\n");
}

test("the rollback session answers seeded in-order, late, duplicate and conflicting rows, rows past the future limit and out of history, a session restart, a leave, a held prediction window and a late echo with the recorded receipts, cursors, K, held counts and first late frame, in Bun and in 32-bit Lua [k1 scenario]", () => {
  const bun = rollbackGoldenRecord();
  const record = recorded(bun);
  expect(bun).toEqual(record);
  expect(report(mapCompiler(join(import.meta.dir, "../tsconfig.golden.json"))())).toBe("");
  const run = Bun.spawnSync([process.env.LUA ?? "lua", join(import.meta.dir, "../build/golden/golden.lua")], { stdout: "pipe", stderr: "pipe" });
  expect({ code: run.exitCode, stderr: run.stderr.toString() }).toEqual({ code: 0, stderr: "" });
  expect(run.stdout.toString().trimEnd().split("\n")).toEqual(record);
}, 60_000);
