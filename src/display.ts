import { f32 } from "wisp/src/sim/f32";
import { floorMod } from "wisp/src/sim/intMath";
import { at } from "wisp/src/runtime/lookup";
import { CHAMPIONS } from "./champions/registry";
import { SCALE } from "./sim/fixed";
import type { SimState } from "./sim/state";

const FOOTMAN = "units\\human\\Footman\\Footman.mdl";
const PROJECTILE_HEIGHT = 60;
const LABEL_HEIGHT = 160;
const MISSILES_PER_ABILITY = 2;
const FLOATERS = 8;
const FLOAT_FRAMES = 120;
const REMEMBERED_HITS = 32;
const YAW = [0, 0.7853981852531433, 1.5707963705062866, 2.356194496154785, 3.1415927410125732, 3.9269907474517822, 4.71238899230957, 5.497786998748779];

interface ChampionView {
  readonly effect: effect;
  readonly label: texttag;
  shownHealth: number;
  moving: boolean;
}

interface MissileView {
  readonly effect: effect;
  readonly owner: number;
  readonly ability: number;
  projectile: number;
}

interface Floater {
  readonly tag: texttag;
  until: number;
}

// Drawn from this client's prediction, so every handle is made at shared startup and only posed afterwards.
export interface Display {
  readonly centerX: number;
  readonly centerY: number;
  readonly champions: readonly ChampionView[];
  readonly dummy: effect;
  readonly dummyLabel: texttag;
  shownDummyHealth: number;
  // Plain arrays only: a hot-reloaded Lua bundle can't iterate the previous bundle's Map or Set.
  readonly missiles: readonly MissileView[];
  readonly floaters: readonly Floater[];
  nextFloater: number;
  frames: number;
  readonly shownHits: number[];
}

function worldX(display: Display, x: number): number {
  return display.centerX + x / SCALE;
}

function worldY(display: Display, y: number): number {
  return display.centerY + y / SCALE;
}

function hiddenTag(): texttag {
  const tag = CreateTextTag();
  SetTextTagPermanent(tag, true);
  SetTextTagVisibility(tag, false);
  return tag;
}

export function createDisplay(state: SimState, centerX: number, centerY: number): Display {
  const champions: ChampionView[] = [];
  const missiles: MissileView[] = [];
  for (const champion of state.champions) {
    const kind = at(CHAMPIONS, champion.kind);
    const shown = AddSpecialEffect(kind.model, centerX + champion.x / SCALE, centerY + champion.y / SCALE);
    BlzSetSpecialEffectColorByPlayer(shown, Player(champion.id));
    const label = CreateTextTag();
    SetTextTagPermanent(label, true);
    champions.push({ effect: shown, label, shownHealth: -1, moving: false });
    for (let ability = 0; ability < kind.abilities.length; ability++) {
      for (let copy = 0; copy < MISSILES_PER_ABILITY; copy++) {
        const missile = AddSpecialEffect(at(kind.abilities, ability).model, centerX, centerY);
        BlzSetSpecialEffectAlpha(missile, 0);
        missiles.push({ effect: missile, owner: champion.id, ability, projectile: -1 });
      }
    }
  }
  const dummy = AddSpecialEffect(FOOTMAN, centerX + state.dummy.x / SCALE, centerY + state.dummy.y / SCALE);
  BlzSetSpecialEffectYaw(dummy, at(YAW, 6));
  const dummyLabel = CreateTextTag();
  SetTextTagPos(dummyLabel, centerX + state.dummy.x / SCALE, centerY + state.dummy.y / SCALE, 200);
  SetTextTagPermanent(dummyLabel, true);
  const floaters: Floater[] = [];
  for (let index = 0; index < FLOATERS; index++) floaters.push({ tag: hiddenTag(), until: 0 });
  const display: Display = { centerX, centerY, champions, dummy, dummyLabel, shownDummyHealth: -1, missiles, floaters, nextFloater: 0, frames: 0, shownHits: [] };
  draw(display, state);
  return display;
}

function floatText(display: Display, x: number, y: number, text: string): void {
  const floater = at(display.floaters, display.nextFloater);
  display.nextFloater = floorMod(display.nextFloater + 1, display.floaters.length);
  SetTextTagText(floater.tag, text, f32(0.024));
  SetTextTagPos(floater.tag, worldX(display, x), worldY(display, y), 120);
  SetTextTagColor(floater.tag, 255, 64, 64, 255);
  SetTextTagVelocity(floater.tag, 0, f32(0.04));
  SetTextTagVisibility(floater.tag, true);
  floater.until = display.frames + FLOAT_FRAMES;
}

export function noticeHits(display: Display, state: SimState): void {
  for (const hit of state.hits) {
    if (display.shownHits.includes(hit.projectile)) continue;
    display.shownHits.push(hit.projectile);
    if (display.shownHits.length > REMEMBERED_HITS) display.shownHits.shift();
    floatText(display, hit.x, hit.y, `-${hit.damage}`);
  }
}

function drawMissiles(display: Display, state: SimState): void {
  for (const missile of display.missiles) {
    if (missile.projectile < 0 || state.projectiles.some((projectile) => projectile.id === missile.projectile)) continue;
    BlzSetSpecialEffectAlpha(missile.effect, 0);
    missile.projectile = -1;
  }
  for (const projectile of state.projectiles) {
    let shown = display.missiles.find((missile) => missile.projectile === projectile.id);
    if (shown === undefined) {
      shown = display.missiles.find((missile) => missile.projectile < 0 && missile.owner === projectile.owner && missile.ability === projectile.ability);
      if (shown === undefined) continue;
      shown.projectile = projectile.id;
      BlzSetSpecialEffectAlpha(shown.effect, 255);
      BlzSetSpecialEffectYaw(shown.effect, at(YAW, projectile.facing));
    }
    BlzSetSpecialEffectPosition(shown.effect, worldX(display, projectile.x), worldY(display, projectile.y), PROJECTILE_HEIGHT);
  }
}

export function draw(display: Display, state: SimState): void {
  display.frames++;
  for (const champion of state.champions) {
    const shown = at(display.champions, champion.id);
    const x = worldX(display, champion.x);
    const y = worldY(display, champion.y);
    BlzSetSpecialEffectX(shown.effect, x);
    BlzSetSpecialEffectY(shown.effect, y);
    BlzSetSpecialEffectYaw(shown.effect, at(YAW, champion.facing));
    const moving = champion.vx !== 0 || champion.vy !== 0;
    if (moving !== shown.moving) {
      BlzPlaySpecialEffect(shown.effect, moving ? ANIM_TYPE_WALK : ANIM_TYPE_STAND);
      shown.moving = moving;
    }
    SetTextTagPos(shown.label, x - 16, y, LABEL_HEIGHT);
    if (shown.shownHealth !== champion.health) {
      SetTextTagText(shown.label, `${champion.health}`, f32(0.024));
      shown.shownHealth = champion.health;
    }
  }
  drawMissiles(display, state);
  for (const floater of display.floaters) {
    if (floater.until !== 0 && floater.until <= display.frames) {
      SetTextTagVisibility(floater.tag, false);
      floater.until = 0;
    }
  }
  if (display.shownDummyHealth !== state.dummy.health) {
    SetTextTagText(display.dummyLabel, `Training dummy ${state.dummy.health}/${state.dummy.maxHealth}`, f32(0.024));
    display.shownDummyHealth = state.dummy.health;
  }
}
