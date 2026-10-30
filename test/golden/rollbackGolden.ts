// The recorded behaviour of Wisp's rollback session driving Battlecraft's input codec under seeded packet sequences. Bun and 32-bit Lua print the same text; test/rollback-golden.test.ts holds the record.
import { at } from "wisp/src/runtime/lookup";
import { floorDiv, floorMod } from "wisp/src/sim/intMath";
import { FUTURE_LIMIT, type Receipt, knownThrough } from "wisp/src/netcode/ledger";
import { encodeMessage } from "wisp/src/netcode/message";
import { NET_SETTINGS, type Session, type Simulation, confirmedFrame, createSession, leave, predictedAt, presentFrame, receive, remoteThrough, tick } from "wisp/src/netcode/session";
import { WIRE_MAX_VALUE } from "wisp/src/netcode/wire";
import { INPUT_CODEC, inputRow } from "../../src/inputCodec";
import { checksum } from "../../src/sim/checksum";
import type { InputRow } from "../../src/sim/input";
import type { SimState } from "../../src/sim/state";
import { initialState, step } from "../../src/sim/step";

const NET: Simulation<InputRow, SimState> = { codec: INPUT_CODEC, step, predicted: () => {}, confirmed: () => {} };
const NO_ROLLBACK = WIRE_MAX_VALUE + 1;
const RECEIPTS: readonly Receipt[] = ["accepted", "malformed", "wrongSender", "gone", "outOfHistory", "tooFarAhead", "conflict"];
const LOG_EVERY = 25;
const INJECT_EVERY = 40;

interface Plan {
  readonly name: string;
  readonly seed: number;
  readonly players: number;
  readonly local: number;
  readonly callbacks: number;
  /** Callbacks a player's message spends in flight, before jitter; the local player's is its own echo. */
  readonly lag: readonly number[];
  readonly jitter: number;
  readonly faults: boolean;
  readonly leave?: { readonly callback: number; readonly player: number };
  readonly restartAt?: number;
}

interface Flight {
  readonly arrival: number;
  readonly order: number;
  readonly sender: number;
  readonly wire: string;
}

const PLANS: readonly Plan[] = [
  { name: "in-order", seed: 11, players: 2, local: 0, callbacks: 300, lag: [2, 2], jitter: 0, faults: false },
  { name: "late-and-reordered", seed: 23, players: 3, local: 1, callbacks: 400, lag: [9, 3, 14], jitter: 12, faults: false },
  { name: "faults-and-leave", seed: 37, players: 3, local: 2, callbacks: 360, lag: [4, 6, 3], jitter: 5, faults: true, leave: { callback: 250, player: 1 } },
  { name: "session-restart", seed: 47, players: 2, local: 0, callbacks: 300, lag: [3, 20], jitter: 6, faults: false, restartAt: 150 },
  { name: "window-held", seed: 41, players: 2, local: 0, callbacks: 260, lag: [2, 60], jitter: 3, faults: false },
  { name: "late-echo-stall", seed: 53, players: 2, local: 0, callbacks: 420, lag: [300, 2], jitter: 0, faults: false },
];

function lcg(seed: number): (this: void) => number {
  let state = seed;
  return () => {
    state = floorMod(state * 75 + 74, 65537);
    return state;
  };
}

function rowOf(seed: number, player: number, frame: number): InputRow {
  if (frame <= NET_SETTINGS.delay) return inputRow();
  const run = 2 + floorMod(seed + player * 3, 7);
  const step = floorDiv(frame, run);
  const pressed = floorMod(step * 7 + player, 5) === 0 && floorMod(frame, run) === 0 ? 1 + floorMod(step, 63) : 0;
  return {
    held: floorMod(step * 37 + player * 11 + seed, 16), pressed,
    aimX: pressed === 0 ? 0 : (floorMod(step * 13 + player, 5) - 2) * 4000,
    aimY: pressed === 0 ? 0 : (floorMod(step * 17 + player, 7) - 3) * 3000,
  };
}

const different = (row: InputRow): InputRow => ({ ...row, held: floorMod(row.held + 1, 16) });

function wireOf(seed: number, player: number, first: number, last: number, altered: boolean): string {
  return encodeMessage(INPUT_CODEC, first, last, (frame) => {
    const row = rowOf(seed, player, frame);
    return altered && frame === first + 1 ? different(row) : row;
  }).wire;
}

class Run {
  private session: Session<InputRow, SimState>;
  private readonly next: (this: void) => number;
  private readonly flights: Flight[] = [];
  private readonly receipts = new Map<Receipt, number>();
  private readonly sentThrough: number[];
  private readonly sample = inputRow();
  private callback = 0;
  private order = 0;
  private departed = -1;
  private deepest = 0;
  private rollbacks = 0;
  private firstLate = -1;
  private firstHold = -1;
  private held = 0;

  constructor(private readonly plan: Plan, private readonly out: string[]) {
    this.next = lcg(plan.seed);
    this.session = this.fresh();
    this.sentThrough = plan.lag.map(() => NET_SETTINGS.delay);
    out.push(`scenario ${plan.name} seed=${plan.seed} players=${plan.players} local=${plan.local} delay=${NET_SETTINGS.delay} window=${NET_SETTINGS.window}`);
  }

  private fresh(): Session<InputRow, SimState> {
    return createSession(NET, NET_SETTINGS, this.plan.players, this.plan.local, initialState(this.plan.lag.map(() => 0)));
  }

  play(): void {
    for (this.callback = 1; this.callback <= this.plan.callbacks; this.callback++) {
      this.restart();
      this.departure();
      this.send();
      this.deliver();
      if (this.plan.faults && floorMod(this.callback, INJECT_EVERY) === 0) this.inject();
      this.advance();
      if (floorMod(this.callback, LOG_EVERY) === 0) this.log();
    }
    this.summarize();
  }

  private offer(sender: number, wire: string, label: string): void {
    const receipt = receive(this.session, NET, sender, wire);
    this.receipts.set(receipt, (this.receipts.get(receipt) ?? 0) + 1);
    if (receipt !== "accepted") this.out.push(`c${this.callback} s${sender} ${label} ${receipt}`);
    const from = this.session.rollbackFrom;
    if (from < NO_ROLLBACK && this.firstLate < 0) this.firstLate = from;
  }

  private push(sender: number, wire: string, arrival: number): void {
    const flight = { arrival, order: this.order++, sender, wire };
    let index = this.flights.length;
    while (index > 0) {
      const earlier = at(this.flights, index - 1);
      if (earlier.arrival < flight.arrival || (earlier.arrival === flight.arrival && earlier.order < flight.order)) break;
      index--;
    }
    this.flights.splice(index, 0, flight);
  }

  private restart(): void {
    if (this.plan.restartAt !== this.callback) return;
    this.session = this.fresh();
    this.out.push(`c${this.callback} restart a new session; its wire carries no epoch, so rows still in flight from the old one reach it`);
    for (let player = 0; player < this.plan.players; player++) this.sentThrough[player] = NET_SETTINGS.delay;
  }

  private departure(): void {
    const gone = this.plan.leave;
    if (gone === undefined || gone.callback !== this.callback) return;
    leave(this.session, NET, gone.player);
    this.departed = gone.player;
    this.out.push(`c${this.callback} leave p${gone.player} goneAfter=${at(this.session.ledger.goneAfter, gone.player)} rollbackFrom=${this.session.rollbackFrom < NO_ROLLBACK ? this.session.rollbackFrom : -1}`);
  }

  private send(): void {
    const { plan } = this;
    for (let player = 0; player < plan.players; player++) {
      if (player === plan.local || player === this.departed) continue;
      if (floorMod(this.callback + player, NET_SETTINGS.sendEvery) !== 0) continue;
      const first = at(this.sentThrough, player) + 1;
      const last = this.callback + NET_SETTINGS.delay;
      if (last < first) continue;
      const message = encodeMessage(INPUT_CODEC, first, last, (frame) => rowOf(plan.seed, player, frame));
      this.sentThrough[player] = message.lastFrame;
      const arrival = this.callback + at(plan.lag, player) + (plan.jitter === 0 ? 0 : floorMod(this.next(), plan.jitter + 1));
      this.push(player, message.wire, arrival);
      if (plan.faults || plan.jitter > 0) {
        if (floorMod(this.next(), 7) === 0) this.push(player, message.wire, arrival + 3);
        if (plan.faults && floorMod(this.next(), 23) === 0) this.push(player, wireOf(plan.seed, player, first, last, true), arrival + 1);
      }
    }
  }

  private deliver(): void {
    while (this.flights.length > 0 && at(this.flights, 0).arrival <= this.callback) {
      const flight = this.flights.shift();
      if (flight !== undefined) this.offer(flight.sender, flight.wire, `f${flight.arrival}`);
    }
  }

  private inject(): void {
    const { plan, session } = this;
    const sender = floorMod(plan.local + 1, plan.players);
    const confirmed = confirmedFrame(session);
    const known = knownThrough(session.ledger);
    const span = (first: number, last: number) => wireOf(plan.seed, sender, first, last, false);
    this.offer(sender, span(known + FUTURE_LIMIT, known + FUTURE_LIMIT), "at-limit");
    this.offer(sender, span(known + FUTURE_LIMIT + 1, known + FUTURE_LIMIT + 1), "past-limit");
    this.offer(sender, span(1, 3), "out-of-history");
    const through = at(session.ledger.through, sender);
    this.offer(sender, wireOf(plan.seed, sender, through - 2, through, true), "conflicting");
    this.offer(plan.players + 4, span(confirmed + 1, confirmed + 2), "stranger");
    this.offer(sender, "!!", "garbage");
    this.offer(sender, "", "empty");
  }

  private advance(): void {
    const { session, sample } = this;
    if (floorMod(this.next(), 9) === 0) sample.held = floorMod(this.next(), 16);
    if (floorMod(this.next(), 25) === 0 && sample.pressed === 0) {
      sample.pressed = 1;
      sample.aimX = floorMod(this.next() * 16, 2 * 4096) - 4096;
      sample.aimY = floorMod(this.next(), 8193) - 4096;
    }
    const from = session.rollbackFrom;
    const present = presentFrame(session);
    const rollbacksBefore = session.stats.rollbacks;
    const heldBefore = session.stats.held;
    const wire = tick(session, NET, NET_SETTINGS, sample);
    if (session.stats.rollbacks !== rollbacksBefore) {
      const depth = present - from + 1;
      this.rollbacks++;
      if (depth > this.deepest) this.deepest = depth;
      this.out.push(`c${this.callback} rollback from=${from} depth=${depth}`);
    }
    if (session.stats.held !== heldBefore) {
      this.held++;
      if (this.firstHold < 0) this.firstHold = this.callback;
    }
    if (wire !== undefined) this.push(this.plan.local, wire, this.callback + at(this.plan.lag, this.plan.local));
  }

  private log(): void {
    const { session } = this;
    const settled = Math.min(presentFrame(session), remoteThrough(session));
    const predicted = predictedAt(session, settled);
    this.out.push(`c${this.callback} K=${knownThrough(session.ledger)} present=${presentFrame(session)} confirmed=${confirmedFrame(session)} remote=${remoteThrough(session) < NO_ROLLBACK ? remoteThrough(session) : -1} sent=${session.sentThrough} held=${session.stats.held} refused=${session.stats.refused} confirmedSum=${checksum(session.confirmed)} settledSum=${predicted === undefined ? "none" : checksum(predicted)}`);
  }

  private summarize(): void {
    const { session } = this;
    this.out.push(`receipts ${RECEIPTS.map((receipt) => `${receipt}=${this.receipts.get(receipt) ?? 0}`).join(" ")}`);
    this.out.push(`rollbacks=${this.rollbacks} deepest=${this.deepest} firstLate=${this.firstLate} heldCallbacks=${this.held} firstHold=${this.firstHold} stats rollbacks=${session.stats.rollbacks} deepest=${session.stats.deepest} held=${session.stats.held} messages=${session.stats.messages} largest=${session.stats.largest} refused=${session.stats.refused} confirmed=${confirmedFrame(session)} confirmedSum=${checksum(session.confirmed)}`);
  }
}

export function rollbackGoldenRecord(): string[] {
  const out: string[] = [];
  for (const plan of PLANS) new Run(plan, out).play();
  return out;
}
