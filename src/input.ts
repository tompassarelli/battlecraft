import { SCALE } from "./sim/fixed";
import { type InputRow, MOVE_DOWN, MOVE_LEFT, MOVE_RIGHT, MOVE_UP } from "./sim/input";

export interface PlayerInput {
  held: number;
  pressed: number;
  aimX: number;
  aimY: number;
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

export function keyDown(input: PlayerInput, key: number): void {
  for (const [moveKey, bit] of MOVE_KEYS) if (moveKey === key) input.held = input.held | bit;
  for (let index = 0; index < ABILITY_KEYS.length; index++) {
    if (ABILITY_KEYS[index] === key) input.pressed = input.pressed | (1 << index);
  }
}

export function keyUp(input: PlayerInput, key: number): void {
  for (const [moveKey, bit] of MOVE_KEYS) if (moveKey === key) input.held = input.held & ~bit;
}

export function aimAt(input: PlayerInput, worldX: number, worldY: number, centerX: number, centerY: number): void {
  input.aimX = Math.floor((worldX - centerX) * SCALE);
  input.aimY = Math.floor((worldY - centerY) * SCALE);
}

export function takeRow(input: PlayerInput): InputRow {
  const row = { held: input.held, pressed: input.pressed, aimX: input.aimX, aimY: input.aimY };
  input.pressed = 0;
  return row;
}
