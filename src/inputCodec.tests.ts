import { at } from "wisp/src/runtime/lookup";
import { assertEquals, assertTrue, test } from "wisp/src/runtime/testing";
import { floorMod } from "wisp/src/sim/intMath";
import { AIM_LIMIT, INPUT_CODEC, inputRow, validRow } from "./inputCodec";
import { MESSAGE_MAX_BYTES, MESSAGE_MAX_FRAMES, decodeMessage, encodeMessage } from "./netcode/message";
import type { InputRow } from "./sim/input";

export function lcg(seed: number): () => number {
  let state = seed;
  return () => {
    state = floorMod(state * 75 + 74, 65537);
    return state;
  };
}

function randomRows(next: () => number, count: number, pressOdds: number): InputRow[] {
  const rows: InputRow[] = [];
  let held = 0;
  for (let index = 0; index < count; index++) {
    if (floorMod(next(), 4) === 0) held = floorMod(next(), 16);
    const pressed = floorMod(next(), pressOdds) === 0 ? 1 + floorMod(next(), 63) : 0;
    const aim = (spread: number) => pressed === 0 ? 0 : floorMod(next() * 32 + next(), 2 * spread + 1) - spread;
    rows.push({ held, pressed, aimX: aim(AIM_LIMIT), aimY: aim(floorMod(next(), 3) === 0 ? AIM_LIMIT : 300) });
  }
  return rows;
}

// Every client must expand a message into exactly the rows the sender captured, at Warcraft's sync size limit.
test("codec: random Battlecraft rows survive a message round trip, and no message passes 200 bytes", () => {
  const next = lcg(7);
  const pool: InputRow[] = [];
  for (let index = 0; index < MESSAGE_MAX_FRAMES; index++) pool.push(inputRow());
  for (const pressOdds of [1, 3, 40]) {
    const rows = randomRows(next, 600, pressOdds);
    let first = 1;
    let messages = 0;
    while (first <= rows.length) {
      const message = encodeMessage(INPUT_CODEC, first, rows.length, (frame) => at(rows, frame - 1));
      messages++;
      assertTrue(message.wire.length <= MESSAGE_MAX_BYTES);
      assertTrue(message.lastFrame >= first);
      const decoded = decodeMessage(INPUT_CODEC, message.wire, pool);
      if (decoded === undefined) throw new Error(`message from frame ${first} does not decode: ${message.wire}`);
      assertEquals(decoded.firstFrame, first, "first frame");
      assertEquals(decoded.count, message.lastFrame - first + 1, "frames carried");
      for (let index = 0; index < decoded.count; index++) {
        const sent = at(rows, first - 1 + index);
        const got = at(pool, index);
        assertTrue(validRow(got));
        assertTrue(INPUT_CODEC.same(sent, got));
      }
      first = message.lastFrame + 1;
    }
    if (pressOdds === 40) assertTrue(messages <= 12);
  }
  const holding = encodeMessage(INPUT_CODEC, 5, 1000, () => ({ held: 9, pressed: 0, aimX: 0, aimY: 0 }));
  assertEquals(holding.lastFrame, 5 + MESSAGE_MAX_FRAMES - 1, "a held row fills a message");
  assertTrue(holding.wire.length <= 6);
  assertEquals(decodeMessage(INPUT_CODEC, `${holding.wire}0`, pool), undefined, "trailing garbage");
  assertEquals(decodeMessage(INPUT_CODEC, "11" + "2" + "0" + "0" + "0", pool), undefined, "a press with no ability");
});
