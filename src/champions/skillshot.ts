import { floorDiv } from "wisp/src/sim/intMath";
import { at } from "wisp/src/runtime/lookup";
import { ARENA, type SimState } from "../sim/state";
import { SCALE, clamp, direction, isqrt } from "../sim/fixed";
import type { Ability, Aim } from "./champion";

const UNIT = 256;
const FACING_X = [256, 181, 0, -181, -256, -181, 0, 181];
const FACING_Y = [0, 181, 256, 181, 0, -181, -256, -181];

export type SkillshotData = Omit<Ability, "cast">;

export function skillshot(index: number, data: SkillshotData): Ability {
  return {
    ...data,
    cast: (state: SimState, casterId: number, aim: Aim): SimState => {
      const caster = state.champions[casterId];
      if (caster === undefined) return state;
      const dx = floorDiv(clamp(aim.x, -ARENA.halfWidth, ARENA.halfWidth) - caster.x, SCALE);
      const dy = floorDiv(clamp(aim.y, -ARENA.halfHeight, ARENA.halfHeight) - caster.y, SCALE);
      const length = isqrt(dx * dx + dy * dy);
      const facing = direction(dx, dy, caster.facing);
      const vx = length === 0 ? floorDiv(at(FACING_X, facing) * data.speed, UNIT) : floorDiv(dx * data.speed, length);
      const vy = length === 0 ? floorDiv(at(FACING_Y, facing) * data.speed, UNIT) : floorDiv(dy * data.speed, length);
      const projectile = {
        id: state.nextProjectile, owner: casterId, kind: caster.kind, ability: index, castFrame: state.frame,
        x: caster.x, y: caster.y, vx, vy, facing, speed: data.speed, remaining: data.range, radius: data.radius, damage: data.damage,
      };
      const champions = state.champions.map((champion) => champion.id === casterId ? { ...champion, facing } : champion);
      return { ...state, nextProjectile: state.nextProjectile + 1, champions, projectiles: [...state.projectiles, projectile] };
    },
  };
}
