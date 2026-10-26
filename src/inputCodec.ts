import type { RowCodec } from "./netcode/codec";
import { type WireReader, digit, readDigit, readSignedVarint, readVarint, signedVarint, varint } from "./netcode/wire";
import { ALL_MOVES, type InputRow } from "./sim/input";

export const ALL_ABILITIES = 63;
export const AIM_LIMIT = 1 << 20;

const HELD = 1;
const PRESSED = 2;

export function inputRow(): InputRow {
  return { held: 0, pressed: 0, aimX: 0, aimY: 0 };
}

export function validRow(row: Readonly<InputRow>): boolean {
  const inRange = (value: number, limit: number) => value >= -limit && value <= limit;
  return row.held >= 0 && row.held <= ALL_MOVES && row.pressed >= 0 && row.pressed <= ALL_ABILITIES
    && inRange(row.aimX, AIM_LIMIT) && inRange(row.aimY, AIM_LIMIT) && (row.pressed !== 0 || (row.aimX === 0 && row.aimY === 0));
}

export const INPUT_CODEC: RowCodec<InputRow> = {
  neutral: inputRow,
  copy: (target, source) => {
    target.held = source.held;
    target.pressed = source.pressed;
    target.aimX = source.aimX;
    target.aimY = source.aimY;
  },
  same: (a, b) => a.held === b.held && a.pressed === b.pressed && a.aimX === b.aimX && a.aimY === b.aimY,
  hold: (target, previous) => {
    target.held = previous.held;
    target.pressed = 0;
    target.aimX = 0;
    target.aimY = 0;
  },
  urgent: (row) => row.pressed !== 0,
  write: (row, previous) => {
    const held = row.held !== previous.held;
    const pressed = row.pressed !== 0;
    let text = digit((held ? HELD : 0) | (pressed ? PRESSED : 0));
    if (held) text += digit(row.held);
    if (pressed) text += varint(row.pressed) + signedVarint(row.aimX) + signedVarint(row.aimY);
    return text;
  },
  read: (reader: WireReader, previous, target) => {
    const flags = readDigit(reader);
    if (flags === undefined || flags > (HELD | PRESSED)) return false;
    const held = (flags & HELD) !== 0 ? readDigit(reader) : previous.held;
    const pressed = (flags & PRESSED) !== 0 ? readVarint(reader, ALL_ABILITIES) : 0;
    const aimX = (flags & PRESSED) !== 0 ? readSignedVarint(reader, AIM_LIMIT) : 0;
    const aimY = (flags & PRESSED) !== 0 ? readSignedVarint(reader, AIM_LIMIT) : 0;
    if (held === undefined || pressed === undefined || aimX === undefined || aimY === undefined) return false;
    if ((flags & HELD) !== 0 && held === previous.held) return false;
    if ((flags & PRESSED) !== 0 && pressed === 0) return false;
    target.held = held;
    target.pressed = pressed;
    target.aimX = aimX;
    target.aimY = aimY;
    return validRow(target);
  },
};
