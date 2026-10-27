import { basename, join } from "node:path";
import { Effect } from "effect";
import { GameFiles } from "wisp/scripts/wisp/gameFiles";

export const BUILD_FOLDER = "Maps/00-Battlecraft";
export const OLD_BUILDS = `${BUILD_FOLDER}/old`;

export const buildTitle = (commit: string) => `Battlecraft dev ${commit}`;

export const installBuild = (documents: string, map: string) =>
  GameFiles.use((files) => files.installMap(documents, map)).pipe(
    Effect.provide(GameFiles.layer({ mapFolder: BUILD_FOLDER, replacedMaps: OLD_BUILDS })),
    Effect.as(join(documents, BUILD_FOLDER, basename(map))),
  );
