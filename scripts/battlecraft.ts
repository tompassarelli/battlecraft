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

const root = join(import.meta.dir, "..");
const wisp = join(root, "node_modules/wisp");
const sourceDirectory = join(root, "src");
const sourceMapDirectory = join(root, "build/source-maps");
const filePrefix = "battlecraft";
const NAME = "Battlecraft";
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
  yield* MapBuild.use((maps) => maps.build({ base, out, name: NAME, declaration }));
}).pipe(Effect.provide(mapServices));

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
  map: { usage: "build --base BASE.w3m --out OUT.w3x | rebuild MAP.w3x", load: async () => ([verb, ...args]) => verb === "build" ? build(args) : verb === "rebuild" ? rebuild(args) : Effect.fail(new UsageFailure({ problem: "map takes build or rebuild" })) },
  hot: { usage: "--data DIR [--data DIR ...] [--watch]", load: async () => makeHot({ project, sourceDirectory, sourceMapDirectory, filePrefix }) },
  fresh: { usage: "MAP.w3x [--rebuild] [--map-folder Maps/00-Wisp]   (WISP_CLIENTS=clients.json)", load: async () => fresh },
  client: { usage: "look|read|click|keys|chat CLIENT ... | watch [CLIENT...] [--once] [--json] | wait CLIENT STATE... [--seconds N]   [--clients-file FILE]", load: async () => makeClient(clientsFile, { filePrefix }) },
  headless: {
    usage: "[arena] [--clients N] [--step N] [--runs N] [--json]",
    load: async () => {
      const { makeHeadless } = await import("wisp/scripts/wisp/commands/headless");
      return makeHeadless(async () => {
        const { ARENA_JOURNEY, BATTLECRAFT_MAP } = await import("../test/journey");
        return { map: BATTLECRAFT_MAP, entry: join(sourceDirectory, "main.ts"), journeys: { arena: ARENA_JOURNEY } };
      });
    },
  },
}, process.argv.slice(2));
