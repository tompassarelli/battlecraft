import { SCALE } from "./fixed";

export const ARENA = { halfWidth: 1024 * SCALE, halfHeight: 768 * SCALE } as const;
export const DUMMY = -1;

export interface Champion {
  readonly id: number;
  readonly kind: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly facing: number;
  readonly health: number;
  readonly cooldowns: readonly number[];
}

export interface Projectile {
  readonly id: number;
  readonly owner: number;
  readonly kind: number;
  readonly ability: number;
  readonly castFrame: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly facing: number;
  readonly speed: number;
  readonly remaining: number;
  readonly radius: number;
  readonly damage: number;
}

export interface Dummy {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly health: number;
  readonly maxHealth: number;
}

export interface Hit {
  readonly target: number;
  readonly projectile: number;
  readonly owner: number;
  readonly ability: number;
  readonly castFrame: number;
  readonly damage: number;
  readonly x: number;
  readonly y: number;
}

export interface SimState {
  readonly frame: number;
  readonly nextProjectile: number;
  readonly champions: readonly Champion[];
  readonly projectiles: readonly Projectile[];
  readonly dummy: Dummy;
  readonly hits: readonly Hit[];
}
