export const MOVE_UP = 1;
export const MOVE_LEFT = 2;
export const MOVE_DOWN = 4;
export const MOVE_RIGHT = 8;
export const ALL_MOVES = 15;

export interface InputRow {
  held: number;
  pressed: number;
  aimX: number;
  aimY: number;
}

export const IDLE: InputRow = { held: 0, pressed: 0, aimX: 0, aimY: 0 };
