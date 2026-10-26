import { SCALE, perFrame } from "../sim/fixed";
import type { ChampionKind } from "./champion";
import { skillshot } from "./skillshot";

export const ranger: ChampionKind = {
  name: "Ranger",
  model: "units\\human\\Rifleman\\Rifleman.mdl",
  radius: 32 * SCALE,
  moveSpeed: perFrame(300),
  health: 200,
  abilities: [
    skillshot(0, {
      name: "Arrow Shot",
      cooldown: 60,
      speed: perFrame(1200),
      range: 900 * SCALE,
      radius: 24 * SCALE,
      damage: 30,
      model: "Abilities\\Weapons\\Arrow\\ArrowMissile.mdl",
    }),
  ],
};
