import { journeyProblems, runJourney } from "wisp/src/headless/journey";
import { luaLockstep, readFile } from "wisp/src/headless/lua";
import type { Match } from "../src/main";
import { MESSAGE_MAX_BYTES } from "../src/netcode/message";
import { checksum } from "../src/sim/checksum";
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
  const matchOf = (client: (typeof clients.clients)[number]) => client.natives.__battlecraftMatch as Match | undefined;
  for (const line of journeyReport(net, clients, result, matchOf)) print(line);
  problems += journeyProblems(result);
  const checksums: string[] = [];
  for (const client of clients.clients) {
    const session = matchOf(client)?.session;
    if (session === undefined || session.stats.refused !== 0 || session.stats.largest > MESSAGE_MAX_BYTES) {
      print(`${net.name} p${client.slot}: missing match, refused messages or a message over ${MESSAGE_MAX_BYTES} bytes`);
      problems++;
    } else checksums.push(`${session.confirmedFrame} ${checksum(session.confirmed)}`);
  }
  if (checksums.length === 2 && checksums[0] !== checksums[1]) {
    print(`${net.name}: the clients confirmed different states: ${checksums.join(", ")}`);
    problems++;
  }
}
if (problems > 0) os.exit(1);
