import { at } from "wisp/src/runtime/lookup";
import type { RowCodec } from "./codec";
import { type FrameRing, frameRing, ringRow, ringStore } from "./frameRing";

// Every client takes or refuses a row by the common confirmed frame alone, so all ledgers hold the same rows.
export const FUTURE_LIMIT = 128;
export const LEDGER_CAPACITY = 2 * FUTURE_LIMIT;

export type Receipt = "accepted" | "malformed" | "wrongSender" | "outOfHistory" | "tooFarAhead" | "conflict";

export interface InputLedger<Row> {
  readonly rings: readonly FrameRing<Row>[];
  readonly through: number[];
}

export function inputLedger<Row>(codec: RowCodec<Row>, players: number, seeded: number): InputLedger<Row> {
  const rings: FrameRing<Row>[] = [];
  const through: number[] = [];
  const neutral = codec.neutral();
  for (let player = 0; player < players; player++) {
    const ring = frameRing(codec, LEDGER_CAPACITY);
    for (let frame = 1; frame <= seeded; frame++) ringStore(codec, ring, frame, neutral);
    rings.push(ring);
    through.push(seeded);
  }
  return { rings, through };
}

export function knownThrough<Row>(ledger: InputLedger<Row>): number {
  let known = at(ledger.through, 0);
  for (const through of ledger.through) if (through < known) known = through;
  return known;
}

export function acceptedRow<Row>(ledger: InputLedger<Row>, player: number, frame: number): Readonly<Row> | undefined {
  return ringRow(at(ledger.rings, player), frame);
}

export function acceptRows<Row>(codec: RowCodec<Row>, ledger: InputLedger<Row>, sender: number, firstFrame: number, rows: readonly Row[], count: number, confirmed: number): Receipt {
  const ring = ledger.rings[sender];
  if (ring === undefined) return "wrongSender";
  for (let index = 0; index < count; index++) {
    const frame = firstFrame + index;
    if (frame > confirmed + FUTURE_LIMIT) return "tooFarAhead";
    if (frame <= confirmed + FUTURE_LIMIT - LEDGER_CAPACITY) return "outOfHistory";
    const stored = ringRow(ring, frame);
    if (stored !== undefined && !codec.same(stored, at(rows, index))) return "conflict";
  }
  for (let index = 0; index < count; index++) ringStore(codec, ring, firstFrame + index, at(rows, index));
  let through = at(ledger.through, sender);
  while (ringRow(ring, through + 1) !== undefined) through++;
  ledger.through[sender] = through;
  return "accepted";
}
