import { floorDiv } from "wisp/src/sim/intMath";

export const SCALE = 16;
export const FRAMES_PER_SECOND = 60;
const TAN_22_5_NUMERATOR = 29;
const TAN_22_5_DENOMINATOR = 70;

export function perFrame(worldPerSecond: number): number {
  return floorDiv(worldPerSecond * SCALE, FRAMES_PER_SECOND);
}

export function clamp(value: number, low: number, high: number): number {
  return value < low ? low : value > high ? high : value;
}

export function isqrt(value: number): number {
  if (value < 2) return value;
  let root = floorDiv(value, 2) + 1;
  for (;;) {
    const next = floorDiv(root + floorDiv(value, root), 2);
    if (next >= root) return root;
    root = next;
  }
}

export function direction(dx: number, dy: number, fallback: number): number {
  if (dx === 0 && dy === 0) return fallback;
  const ax = dx < 0 ? -dx : dx;
  const ay = dy < 0 ? -dy : dy;
  // Lua's 32-bit integers wrap: callers keep |dx| and |dy| below 2^31 / TAN_22_5_DENOMINATOR.
  const horizontal = ay * TAN_22_5_DENOMINATOR <= ax * TAN_22_5_NUMERATOR;
  const vertical = ax * TAN_22_5_DENOMINATOR <= ay * TAN_22_5_NUMERATOR;
  if (horizontal) return dx > 0 ? 0 : 4;
  if (vertical) return dy > 0 ? 2 : 6;
  if (dx > 0) return dy > 0 ? 1 : 7;
  return dy > 0 ? 3 : 5;
}
