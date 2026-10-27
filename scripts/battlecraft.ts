import { homedir } from "node:os";
import { join } from "node:path";
import { Effect, Layer } from "effect";
import { runMainCli } from "wisp/scripts/wisp/cli";
import { Clients } from "wisp/scripts/wisp/clients";
import { type Command, UsageFailure, flagValues } from "wisp/scripts/wisp/command";
import { makeClient } from "wisp/scripts/wisp/commands/client";
import { makeHot } from "wisp/scripts/wisp/commands/hot";
import { GameFiles } from "wisp/scripts/wisp/gameFiles";
import { freshMatch } from "wisp/scripts/wisp/lobby";
import { ClientWatch } from "wisp/scripts/wisp/watch";
import { type BuildProject, MapBuild } from "wisp/scripts/wisp/mapBuild";
import { SourceErrors } from "wisp/scripts/wisp/sourceErrors";
import type { MapDeclaration } from "wisp/scripts/mapInfo";
import { buildTitle, installBuild } from "./mapBuilds";

const root = join(import.meta.dir, "..");
const wisp = join(root, "node_modules/wisp");
const sourceDirectory = join(root, "src");
const sourceMapDirectory = join(root, "build/source-maps");
const filePrefix = "battlecraft";
const headCommit = () => {
  const head = Bun.spawnSync(["git", "rev-parse", "--short", "HEAD"], { cwd: root, stdout: "pipe" });
  if (head.exitCode !== 0) throw new Error("the build title needs the current git commit");
  return head.stdout.toString().trim();
};
const clientsFile = process.env.WISP_CLIENTS ?? join(homedir(), ".local/state/wisp/clients.json");

const project: BuildProject = {
  projectRoot: root,
  configPath: join(root, "tsconfig.map.json"),
  bundlePath: join(root, "build/map.lua"),
  compileInputs: [sourceDirectory, join(wisp, "src"), join(wisp, "plugins"), join(root, "tsconfig.map.json")],
  packager: join(root, "build/tools/map-pack"),
  toolchainLockPath: join(root, "typescript-toolchain.lock"),
  packageDirectory: root,
};

const declaration: MapDeclaration = {
  author: "Battlecraft",
  description: "Two champions in an arena. Move with WASD, aim with the mouse, shoot with Q. Type -checksum to compare clients.",
  suggestedPlayers: "2",
  players: [{ id: 0, name: "Player 1" }, { id: 1, name: "Player 2" }],
  forces: [{ name: "Players", playerIds: [0, 1] }],
};

const mapServices = MapBuild.layer(project).pipe(
  Layer.provideMerge(SourceErrors.layer({ sourceMapDirectory, filePrefix })),
  Layer.provide(GameFiles.layer()),
);

const build: Command = (args) => Effect.gen(function*() {
  const [base] = flagValues(args, "base");
  const [out] = flagValues(args, "out");
  if (base === undefined || out === undefined) return yield* new UsageFailure({ problem: "build needs --base and --out" });
  yield* MapBuild.use((maps) => maps.build({ base, out, name: buildTitle(headCommit()), declaration }));
}).pipe(Effect.provide(mapServices));

const install: Command = (args) => Effect.gen(function*() {
  const [map, ...flags] = args;
  const [documents = process.env.BATTLECRAFT_DOCUMENTS] = flagValues(flags, "documents");
  if (map === undefined || documents === undefined) return yield* new UsageFailure({ problem: "install needs MAP.w3x and --documents DIR (or BATTLECRAFT_DOCUMENTS)" });
  console.log(`installed ${yield* installBuild(documents, map)}`);
});

const rebuild: Command = ([map, ...rest]) => Effect.gen(function*() {
  if (map === undefined || rest.length > 0) return yield* new UsageFailure({ problem: "rebuild takes one map" });
  yield* MapBuild.use((maps) => maps.rebuild(map));
}).pipe(Effect.provide(mapServices));

const fresh: Command = ([map, ...flags]) => Effect.gen(function*() {
  const [mapFolder = "Maps/00-Wisp"] = flagValues(flags, "map-folder");
  const known = flags.every((flag, index) => flag === "--rebuild" || flag === "--map-folder" || flags[index - 1] === "--map-folder");
  if (map === undefined || !known) return yield* new UsageFailure({ problem: "fresh takes MAP.w3x and its options" });
  if (flags.includes("--rebuild")) yield* MapBuild.use((maps) => maps.rebuild(map)).pipe(Effect.provide(mapServices));
  yield* freshMatch({ map, folder: mapFolder.replace(/^Maps\//, ""), filePrefix }).pipe(
    Effect.provide(Layer.mergeAll(Clients.layer(clientsFile), GameFiles.layer({ mapFolder, replacedMaps: "wisp-replaced-maps" }), ClientWatch.layer({ filePrefix }))),
  );
});

runMainCli("bun scripts/battlecraft.ts", {
  map: { usage: "build --base BASE.w3m --out OUT.w3x | rebuild MAP.w3x | install MAP.w3x --documents DIR", load: async () => ([verb, ...args]) => verb === "build" ? build(args) : verb === "rebuild" ? rebuild(args) : verb === "install" ? install(args) : Effect.fail(new UsageFailure({ problem: "map takes build, rebuild or install" })) },
  hot: { usage: "--data DIR [--data DIR ...] [--watch]", load: async () => makeHot({ project, sourceDirectory, sourceMapDirectory, filePrefix }) },
  fresh: { usage: "MAP.w3x [--rebuild] [--map-folder Maps/00-Wisp]   (WISP_CLIENTS=clients.json)", load: async () => fresh },
  client: { usage: "look|read|click|keys|chat CLIENT ... | watch [CLIENT...] [--once] [--json] | wait CLIENT STATE... [--seconds N]   [--clients-file FILE]", load: async () => makeClient(clientsFile, { filePrefix }) },
  dev: {
    usage: "[--data DIR ...] | --since REF",
    load: async () => {
      const { makeDev } = await import("wisp/scripts/wisp/commands/dev");
      const compiledSources = ["src/**/*.ts", "tsconfig.map.json"];
      return makeDev({
        root,
        sources: ["src", "scripts", "test"],
        typeCheck: { projects: ["tsconfig.json", "tsconfig.map.json", "tsconfig.tests.json", "tsconfig.headless.json"], command: [process.execPath, "run", "check"] },
        tests: {
          files: ["test/**/*.test.ts"],
          preload: ["test/lua32.preload.ts"],
          reads: {
            "test/hit.test.ts": [...compiledSources, "test/lua.ts", "tsconfig.tests.json"],
            "test/headless.test.ts": [...compiledSources, "test/headless-lua.ts", "test/journey.ts", "tsconfig.headless.json"],
          },
          journeys: ["test/headless.test.ts"],
        },
        journey: { module: "scripts/headless.ts", export: "BATTLECRAFT_HEADLESS", name: "arena" },
        hot: { project, sourceDirectory, sourceMapDirectory, filePrefix },
      });
    },
  },
  headless: {
    usage: "[arena] [--clients N] [--step N] [--runs N] [--json]",
    load: async () => {
      const { makeHeadless } = await import("wisp/scripts/wisp/commands/headless");
      return makeHeadless(async () => (await import("./headless")).BATTLECRAFT_HEADLESS);
    },
  },
}, process.argv.slice(2));
