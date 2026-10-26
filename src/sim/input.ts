export const MOVE_UP = 1;
export const MOVE_LEFT = 2;
export const MOVE_DOWN = 4;
export const MOVE_RIGHT = 8;

export interface InputRow {
  readonly held: number;
  readonly pressed: number;
  readonly aimX: number;
  readonly aimY: number;
}

export const IDLE: InputRow = { held: 0, pressed: 0, aimX: 0, aimY: 0 };
