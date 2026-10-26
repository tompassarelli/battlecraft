import { floorDiv } from "wisp/src/sim/intMath";
import { CHAMPIONS } from "../champions/registry";
import type { ChampionKind } from "../champions/champion";
import { SCALE, clamp, direction } from "./fixed";
import { circlesOverlap } from "./hit";
import { IDLE, type InputRow, MOVE_DOWN, MOVE_LEFT, MOVE_RIGHT, MOVE_UP } from "./input";
import { ARENA, type Champion, DUMMY, type Hit, type Projectile, type SimState } from "./state";

const DIAGONAL_NUMERATOR = 181;
const DIAGONAL_DENOMINATOR = 256;
const SPAWN_DISTANCE = 600 * SCALE;

function kindOf(champion: Champion): ChampionKind {
  const kind = CHAMPIONS[champion.kind];
  if (kind === undefined) throw new Error(`champion ${champion.id} has unknown kind ${champion.kind}`);
  return kind;
}

export function initialState(kinds: readonly number[]): SimState {
  const champions: Champion[] = [];
  for (let id = 0; id < kinds.length; id++) {
    const kindIndex = kinds[id] ?? 0;
    const kind = CHAMPIONS[kindIndex];
    if (kind === undefined) throw new Error(`unknown champion kind ${kindIndex}`);
    const left = id === 0;
    champions.push({
      id, kind: kindIndex, x: left ? -SPAWN_DISTANCE : SPAWN_DISTANCE, y: 0, vx: 0, vy: 0, facing: left ? 0 : 4,
      health: kind.health, cooldowns: kind.abilities.map(() => 0),
    });
  }
  return {
    frame: 0, nextProjectile: 0, champions, projectiles: [], hits: [],
    dummy: { x: 0, y: 0, radius: 40 * SCALE, health: 100, maxHealth: 100 },
  };
}

function axis(held: number, positive: number, negative: number): number {
  return ((held & positive) !== 0 ? 1 : 0) - ((held & negative) !== 0 ? 1 : 0);
}

function move(champion: Champion, row: InputRow): Champion {
  const kind = kindOf(champion);
  const dx = axis(row.held, MOVE_RIGHT, MOVE_LEFT);
  const dy = axis(row.held, MOVE_UP, MOVE_DOWN);
  const speed = dx !== 0 && dy !== 0 ? floorDiv(kind.moveSpeed * DIAGONAL_NUMERATOR, DIAGONAL_DENOMINATOR) : kind.moveSpeed;
  const vx = dx * speed;
  const vy = dy * speed;
  return {
    ...champion, vx, vy,
    x: clamp(champion.x + vx, kind.radius - ARENA.halfWidth, ARENA.halfWidth - kind.radius),
    y: clamp(champion.y + vy, kind.radius - ARENA.halfHeight, ARENA.halfHeight - kind.radius),
    facing: direction(dx, dy, champion.facing),
    cooldowns: champion.cooldowns.map((frames) => frames > 0 ? frames - 1 : 0),
  };
}

function cast(state: SimState, casterId: number, row: InputRow): SimState {
  const caster = state.champions[casterId];
  if (caster === undefined) return state;
  const abilities = kindOf(caster).abilities;
  let next = state;
  for (let index = 0; index < abilities.length; index++) {
    const ability = abilities[index];
    if (ability === undefined || (row.pressed & (1 << index)) === 0 || (caster.cooldowns[index] ?? 0) > 0) continue;
    next = ability.cast(next, casterId, { x: row.aimX, y: row.aimY });
    next = {
      ...next,
      champions: next.champions.map((champion) => champion.id !== casterId ? champion
        : { ...champion, cooldowns: champion.cooldowns.map((frames, slot) => slot === index ? ability.cooldown : frames) }),
    };
  }
  return next;
}

function fly(state: SimState): SimState {
  const champions = state.champions.map((champion) => ({ ...champion }));
  let dummy = state.dummy;
  const projectiles: Projectile[] = [];
  const hits: Hit[] = [];
  for (const flying of state.projectiles) {
    const projectile = { ...flying, x: flying.x + flying.vx, y: flying.y + flying.vy, remaining: flying.remaining - flying.speed };
    let hit: Hit | undefined;
    for (let id = 0; id < champions.length && hit === undefined; id++) {
      const champion = champions[id];
      if (champion === undefined || champion.id === projectile.owner) continue;
      const kind = kindOf(champion);
      if (!circlesOverlap(projectile.x, projectile.y, projectile.radius, champion.x, champion.y, kind.radius)) continue;
      const health = champion.health - projectile.damage;
      champions[id] = { ...champion, health: health > 0 ? health : kind.health };
      hit = { target: champion.id, damage: projectile.damage, x: champion.x, y: champion.y };
    }
    if (hit === undefined && circlesOverlap(projectile.x, projectile.y, projectile.radius, dummy.x, dummy.y, dummy.radius)) {
      const health = dummy.health - projectile.damage;
      dummy = { ...dummy, health: health > 0 ? health : dummy.maxHealth };
      hit = { target: DUMMY, damage: projectile.damage, x: dummy.x, y: dummy.y };
    }
    if (hit !== undefined) hits.push(hit);
    else if (projectile.remaining > 0) projectiles.push(projectile);
  }
  return { ...state, champions, dummy, projectiles, hits };
}

export function step(state: SimState, inputs: readonly InputRow[]): SimState {
  let next: SimState = {
    ...state,
    frame: state.frame + 1,
    hits: [],
    champions: state.champions.map((champion) => move(champion, inputs[champion.id] ?? IDLE)),
  };
  for (const champion of next.champions) next = cast(next, champion.id, inputs[champion.id] ?? IDLE);
  return fly(next);
}
