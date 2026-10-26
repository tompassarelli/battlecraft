import type { Journey } from "wisp/src/headless/journey";
import { KEY_A, KEY_Q, KEY_S, KEY_W } from "../src/input";

export const BATTLECRAFT_MAP = {
  filePrefix: "battlecraft", globalPrefixes: ["__battlecraft"],
  natives: () => ({ GetRectCenterX: () => 0, GetRectCenterY: () => 0 }),
  intentionalNoops: {
    TriggerRegisterPlayerEvent: "Wisp's headless runtime has no synchronized mouse events yet, so this journey aims at the starting aim point, the arena center",
  },
};

export const ARENA_JOURNEY: Journey = {
  frames: 240,
  events: [
    { frame: 10, player: 0, key: KEY_W, meta: 0, down: true },
    { frame: 12, player: 1, key: KEY_S, meta: 0, down: true },
    { frame: 20, player: 1, key: KEY_A, meta: 0, down: true },
    { frame: 30, player: 0, key: KEY_W, meta: 0, down: false },
    { frame: 34, player: 1, key: KEY_S, meta: 0, down: false },
    { frame: 40, player: 1, key: KEY_A, meta: 0, down: false },
    { frame: 60, player: 0, key: KEY_Q, meta: 0 },
    { frame: 70, player: 1, key: KEY_Q, meta: 0 },
    { frame: 100, player: 0, key: KEY_Q, meta: 0 },
    { frame: 130, player: 0, key: KEY_Q, meta: 0 },
    { frame: 140, player: 1, key: KEY_Q, meta: 0 },
    { frame: 150, reload: true },
    { frame: 200, player: 0, key: KEY_W, meta: 0, down: true },
    { frame: 220, player: 0, key: KEY_W, meta: 0, down: false },
    { frame: 240, player: 0, chat: "-checksum" },
  ],
};
