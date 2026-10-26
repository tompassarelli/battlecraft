import { runLuaJourney } from "wisp/src/headless/lua";
import { ARENA_JOURNEY, BATTLECRAFT_MAP } from "./journey";

declare const arg: Readonly<Record<number, string | undefined>>;

const bundle = arg[1];
const declarations = arg[2];
if (bundle === undefined || declarations === undefined) throw new Error("usage: lua headless.lua MAP_LUA WARCRAFT_D_TS");
if (runLuaJourney(BATTLECRAFT_MAP, ARENA_JOURNEY, bundle, declarations) > 0) os.exit(1);
