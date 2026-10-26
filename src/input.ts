import { inputRow, AIM_LIMIT } from "./inputCodec";
import { SCALE, clamp } from "./sim/fixed";
import { type InputRow, MOVE_DOWN, MOVE_LEFT, MOVE_RIGHT, MOVE_UP } from "./sim/input";

export interface PlayerInput {
  readonly sample: InputRow;
  aimX: number;
  aimY: number;
  polled: number;
  readonly unmatchedRises: number[];
  readonly owedPresses: number[];
}

export const KEY_W = 0x57;
export const KEY_A = 0x41;
export const KEY_S = 0x53;
export const KEY_D = 0x44;
export const KEY_Q = 0x51;

export const MOVE_KEYS: readonly (readonly [key: number, bit: number])[] = [
  [KEY_W, MOVE_UP], [KEY_A, MOVE_LEFT], [KEY_S, MOVE_DOWN], [KEY_D, MOVE_RIGHT],
];
export const ABILITY_KEYS: readonly number[] = [KEY_Q];
// A key event fires only for the exact Shift, Ctrl, Alt and Windows meta mask it was registered with.
export const KEY_METAS = 16;

export function playerInput(): PlayerInput {
  return { sample: inputRow(), aimX: 0, aimY: 0, polled: 0, unmatchedRises: ABILITY_KEYS.map(() => 0), owedPresses: ABILITY_KEYS.map(() => 0) };
}

function press(input: PlayerInput, index: number): void {
  const sample = input.sample;
  if (sample.pressed === 0) {
    sample.aimX = input.aimX;
    sample.aimY = input.aimY;
  }
  sample.pressed = sample.pressed | (1 << index);
}

export function poll(input: PlayerInput, held: number, abilities: number): void {
  input.sample.held = held;
  const rose = abilities & ~input.polled;
  input.polled = abilities;
  for (let index = 0; index < ABILITY_KEYS.length; index++) {
    if ((rose & (1 << index)) !== 0 && (input.owedPresses[index] ?? 0) === 0) {
      press(input, index);
      input.unmatchedRises[index] = (input.unmatchedRises[index] ?? 0) + 1;
    }
    input.owedPresses[index] = 0;
  }
}

export function keyDown(input: PlayerInput, key: number): void {
  for (let index = 0; index < ABILITY_KEYS.length; index++) {
    if (ABILITY_KEYS[index] !== key) continue;
    const unmatched = input.unmatchedRises[index] ?? 0;
    if (unmatched > 0) input.unmatchedRises[index] = unmatched - 1;
    else {
      press(input, index);
      input.owedPresses[index] = (input.owedPresses[index] ?? 0) + 1;
    }
  }
}

export function aimAt(input: PlayerInput, worldX: number, worldY: number, centerX: number, centerY: number): void {
  input.aimX = clamp(Math.floor((worldX - centerX) * SCALE), -AIM_LIMIT, AIM_LIMIT);
  input.aimY = clamp(Math.floor((worldY - centerY) * SCALE), -AIM_LIMIT, AIM_LIMIT);
}
