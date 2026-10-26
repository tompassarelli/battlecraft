import { journeyProblems, runJourney } from "wisp/src/headless/journey";
import { luaLockstep, readFile } from "wisp/src/headless/lua";
import type { Match } from "../src/main";
import { ARENA_JOURNEY, BATTLECRAFT_MAP, JOURNEY_NETS, journeyReport } from "./journey";

declare const arg: Readonly<Record<number, string | undefined>>;

const bundlePath = arg[1];
const declarationsPath = arg[2];
if (bundlePath === undefined || declarationsPath === undefined) throw new Error("usage: lua headless.lua MAP_LUA WARCRAFT_D_TS");
const bundle = readFile(bundlePath);
const declarations = readFile(declarationsPath);
let problems = 0;
for (const net of JOURNEY_NETS) {
  const clients = luaLockstep(BATTLECRAFT_MAP, bundle, declarations, undefined, net.delivery?.());
  const result = runJourney(clients, ARENA_JOURNEY);
  for (const line of journeyReport(net, clients, result, (client) => client.natives.__battlecraftMatch as Match | undefined)) print(line);
  problems += journeyProblems(result);
}
if (problems > 0) os.exit(1);
