import { join } from "node:path";
import type { HeadlessProject } from "wisp/scripts/wisp/headless";
import { ARENA_JOURNEY, BATTLECRAFT_MAP } from "../test/journey";

export const BATTLECRAFT_HEADLESS: HeadlessProject = {
  map: BATTLECRAFT_MAP,
  entry: join(import.meta.dir, "../src/main.ts"),
  journeys: { arena: ARENA_JOURNEY },
};
