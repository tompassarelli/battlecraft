import { Effect } from "effect";
import { provideLua32Env } from "wisp/scripts/wisp/lua32";

await Effect.runPromise(provideLua32Env);
