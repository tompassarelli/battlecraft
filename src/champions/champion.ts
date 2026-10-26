import type { SimState } from "../sim/state";

export interface Aim {
  readonly x: number;
  readonly y: number;
}

export interface Ability {
  readonly name: string;
  readonly cooldown: number;
  readonly speed: number;
  readonly range: number;
  readonly radius: number;
  readonly damage: number;
  readonly model: string;
  readonly cast: (this: void, state: SimState, casterId: number, aim: Aim) => SimState;
}

export interface ChampionKind {
  readonly name: string;
  readonly unitType: number;
  readonly radius: number;
  readonly moveSpeed: number;
  readonly health: number;
  readonly abilities: readonly Ability[];
}
