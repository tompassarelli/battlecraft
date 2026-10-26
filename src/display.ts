import { f32 } from "wisp/src/sim/f32";
import { at } from "wisp/src/runtime/lookup";
import { CHAMPIONS } from "./champions/registry";
import { SCALE } from "./sim/fixed";
import type { SimState } from "./sim/state";

const FOOTMAN = 0x68666f6f;
const MOVE = 0x416d6f76;
const ATTACK = 0x4161746b;
const PROJECTILE_HEIGHT = 60;
const YAW = [0, 0.7853981852531433, 1.5707963705062866, 2.356194496154785, 3.1415927410125732, 3.9269907474517822, 4.71238899230957, 5.497786998748779];

interface Missile {
  readonly id: number;
  readonly effect: effect;
}

export interface Display {
  readonly centerX: number;
  readonly centerY: number;
  readonly units: readonly unit[];
  readonly shownHealth: number[];
  readonly dummy: unit;
  readonly dummyLabel: texttag;
  shownDummyHealth: number;
  // Plain arrays only: a hot-reloaded Lua bundle can't iterate the previous bundle's Map or Set.
  missiles: readonly Missile[];
}

function worldX(display: Display, x: number): number {
  return display.centerX + x / SCALE;
}

function worldY(display: Display, y: number): number {
  return display.centerY + y / SCALE;
}

function puppet(owner: player, unitType: number, x: number, y: number, facing: number): unit {
  const created = CreateUnit(owner, unitType, x, y, facing);
  UnitRemoveAbility(created, MOVE);
  UnitRemoveAbility(created, ATTACK);
  return created;
}

export function createDisplay(state: SimState, centerX: number, centerY: number): Display {
  const units: unit[] = [];
  const shownHealth: number[] = [];
  for (const champion of state.champions) {
    const kind = at(CHAMPIONS, champion.kind);
    const created = puppet(Player(champion.id), kind.unitType, centerX + champion.x / SCALE, centerY + champion.y / SCALE, champion.facing * 45);
    BlzSetUnitMaxHP(created, kind.health);
    SetUnitState(created, UNIT_STATE_LIFE, champion.health);
    units.push(created);
    shownHealth.push(champion.health);
  }
  const dummy = puppet(Player(PLAYER_NEUTRAL_PASSIVE), FOOTMAN, centerX + state.dummy.x / SCALE, centerY + state.dummy.y / SCALE, 270);
  const dummyLabel = CreateTextTag();
  SetTextTagPos(dummyLabel, centerX + state.dummy.x / SCALE, centerY + state.dummy.y / SCALE, 200);
  SetTextTagPermanent(dummyLabel, true);
  const display: Display = { centerX, centerY, units, shownHealth, dummy, dummyLabel, shownDummyHealth: -1, missiles: [] };
  draw(display, state);
  return display;
}

function floatText(display: Display, x: number, y: number, text: string): void {
  const tag = CreateTextTag();
  SetTextTagText(tag, text, f32(0.024));
  SetTextTagPos(tag, worldX(display, x), worldY(display, y), 120);
  SetTextTagColor(tag, 255, 64, 64, 255);
  SetTextTagVelocity(tag, 0, f32(0.04));
  SetTextTagPermanent(tag, false);
  SetTextTagLifespan(tag, 2);
  SetTextTagFadepoint(tag, 1);
}

export function draw(display: Display, state: SimState): void {
  for (const champion of state.champions) {
    const shown = at(display.units, champion.id);
    SetUnitX(shown, worldX(display, champion.x));
    SetUnitY(shown, worldY(display, champion.y));
    BlzSetUnitFacingEx(shown, champion.facing * 45);
    if (display.shownHealth[champion.id] !== champion.health) {
      SetUnitState(shown, UNIT_STATE_LIFE, champion.health);
      display.shownHealth[champion.id] = champion.health;
    }
  }
  const missiles: Missile[] = [];
  for (const projectile of state.projectiles) {
    const x = worldX(display, projectile.x);
    const y = worldY(display, projectile.y);
    const shown = display.missiles.find((missile) => missile.id === projectile.id);
    if (shown === undefined) {
      const created = AddSpecialEffect(at(at(CHAMPIONS, projectile.kind).abilities, projectile.ability).model, x, y);
      BlzSetSpecialEffectZ(created, PROJECTILE_HEIGHT);
      BlzSetSpecialEffectYaw(created, at(YAW, projectile.facing));
      missiles.push({ id: projectile.id, effect: created });
    } else {
      BlzSetSpecialEffectPosition(shown.effect, x, y, PROJECTILE_HEIGHT);
      missiles.push(shown);
    }
  }
  for (const missile of display.missiles) {
    if (!missiles.includes(missile)) DestroyEffect(missile.effect);
  }
  display.missiles = missiles;
  for (const hit of state.hits) floatText(display, hit.x, hit.y, `-${hit.damage}`);
  if (display.shownDummyHealth !== state.dummy.health) {
    SetTextTagText(display.dummyLabel, `Training dummy ${state.dummy.health}/${state.dummy.maxHealth}`, f32(0.024));
    display.shownDummyHealth = state.dummy.health;
  }
}
