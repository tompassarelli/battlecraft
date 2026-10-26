import { floorMod } from "wisp/src/sim/intMath";
import type { SimState } from "./state";

const FIRST = 16777213;
const SECOND = 16777199;

export function checksum(state: SimState): string {
  let first = 0;
  let second = 0;
  const add = (value: number) => {
    first = floorMod(first * 31 + floorMod(value, FIRST), FIRST);
    second = floorMod(second * 37 + floorMod(value, SECOND), SECOND);
  };
  add(state.frame);
  add(state.nextProjectile);
  add(state.champions.length);
  for (const champion of state.champions) {
    add(champion.id); add(champion.kind); add(champion.x); add(champion.y); add(champion.vx); add(champion.vy);
    add(champion.facing); add(champion.health); add(champion.cooldowns.length);
    for (const cooldown of champion.cooldowns) add(cooldown);
  }
  add(state.projectiles.length);
  for (const projectile of state.projectiles) {
    add(projectile.id); add(projectile.owner); add(projectile.kind); add(projectile.ability); add(projectile.x); add(projectile.y);
    add(projectile.vx); add(projectile.vy); add(projectile.facing); add(projectile.speed); add(projectile.remaining);
    add(projectile.radius); add(projectile.damage);
  }
  const dummy = state.dummy;
  add(dummy.x); add(dummy.y); add(dummy.radius); add(dummy.health); add(dummy.maxHealth);
  add(state.hits.length);
  for (const hit of state.hits) {
    add(hit.target); add(hit.projectile); add(hit.damage); add(hit.x); add(hit.y);
  }
  return `${first}:${second}`;
}
