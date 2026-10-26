import { at } from "wisp/src/runtime/lookup";
import { assertEquals, assertGreaterThan, assertTrue, test } from "wisp/src/runtime/testing";
import { floorMod } from "wisp/src/sim/intMath";
import { lcg } from "./inputCodec.tests";
import { AIM_LIMIT, INPUT_CODEC, inputRow } from "./inputCodec";
import { ringRow } from "./netcode/frameRing";
import { NET_SETTINGS, type Session, type Simulation, createSession, predictedAt, remoteThrough, receive, tick } from "./netcode/session";
import { checksum } from "./sim/checksum";
import type { InputRow } from "./sim/input";
import type { SimState } from "./sim/state";
import { initialState, step } from "./sim/step";

const NET: Simulation<InputRow, SimState> = { codec: INPUT_CODEC, step, predicted: () => {}, confirmed: () => {} };

interface InFlight {
  readonly arrival: number;
  readonly sender: number;
  readonly wire: string;
}

function truthAt(rows: readonly (readonly InputRow[])[], frame: number): SimState {
  let state = initialState([0, 0]);
  for (let stepped = 1; stepped <= frame; stepped++) state = step(state, [rows[0]?.[stepped] ?? inputRow(), rows[1]?.[stepped] ?? inputRow()]);
  return state;
}

// Rolled-back prediction must equal the state stepped with the rows each player really captured, on both clients.
test("rollback: two clients trading rows over a late, bursty channel predict, roll back and confirm the state of the true rows", () => {
  const next = lcg(11);
  const sessions: Session<InputRow, SimState>[] = [0, 1].map((player) => createSession(NET, NET_SETTINGS, 2, player, initialState([0, 0])));
  const samples = [inputRow(), inputRow()];
  const captured: InputRow[][] = [[], []];
  const recorded = [NET_SETTINGS.delay, NET_SETTINGS.delay];
  const lastArrival = [0, 0];
  const network: InFlight[] = [];
  const callbacks = 900;
  for (let callback = 1; callback <= callbacks + 120; callback++) {
    for (let index = 0; index < network.length;) {
      const message = at(network, index);
      if (message.arrival > callback) index++;
      else {
        for (const session of sessions) assertEquals(receive(session, NET, message.sender, message.wire), "accepted", "receipt");
        network.splice(index, 1);
      }
    }
    for (let player = 0; player < 2; player++) {
      const session = at(sessions, player);
      const sample = at(samples, player);
      if (callback <= callbacks) {
        if (floorMod(next(), 9) === 0) sample.held = floorMod(next(), 16);
        if (floorMod(next(), 25) === 0 && sample.pressed === 0) {
          sample.pressed = 1;
          sample.aimX = floorMod(next() * 16, 2 * AIM_LIMIT) - AIM_LIMIT;
          sample.aimY = floorMod(next(), 24577) - 12288;
        }
      } else INPUT_CODEC.hold(sample, inputRow());
      const wire = tick(session, NET, NET_SETTINGS, sample);
      for (let frame = at(recorded, player) + 1; frame <= session.present + NET_SETTINGS.delay; frame++) {
        const row = inputRow();
        INPUT_CODEC.copy(row, ringRow(session.pending, frame) ?? inputRow());
        at(captured, player)[frame] = row;
        recorded[player] = frame;
      }
      if (wire === undefined) continue;
      const stall = floorMod(next(), 50) === 0 ? 40 : 0;
      const arrival = Math.max(at(lastArrival, player), callback + 3 + floorMod(next(), 12) + stall);
      lastArrival[player] = arrival;
      network.push({ arrival, sender: player, wire });
    }
  }
  const [first, second] = sessions;
  if (first === undefined || second === undefined) throw new Error("two sessions");
  assertEquals(first.confirmedFrame, second.confirmedFrame, "confirmed frame");
  assertGreaterThan(first.confirmedFrame, callbacks);
  const truth = truthAt(captured, first.confirmedFrame);
  assertEquals(checksum(first.confirmed), checksum(truth), "first client's confirmed state");
  assertEquals(checksum(second.confirmed), checksum(truth), "second client's confirmed state");
  for (const session of sessions) {
    assertGreaterThan(session.stats.rollbacks, 20);
    assertEquals(session.stats.refused, 0, "refused messages");
    const settled = Math.min(session.present, remoteThrough(session));
    const predicted = predictedAt(session, settled);
    if (predicted === undefined) throw new Error(`no prediction kept for frame ${settled}`);
    assertEquals(checksum(predicted), checksum(truthAt(captured, settled)), "rolled-back prediction");
    assertTrue(session.stats.messages * NET_SETTINGS.sendEvery <= session.callbacks + 3 * NET_SETTINGS.sendEvery);
  }
});
