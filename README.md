# Battlecraft

A starter arena brawler in the style of Bloodline Champions and Battlerite for
Warcraft III, built on [Wisp](https://github.com/tompassarelli/wisp) and the
input and rollback lessons from
[Smashcraft](https://github.com/tompassarelli/smashcraft).

Two players each control a champion in a walled arena: WASD moves, the mouse
aims, Q fires a skillshot at the aim point. A training dummy in the middle
shows its health, floats the damage it takes and resets when it reaches zero.
Type `-checksum` in chat to print the simulation's checksum on every client.
The built map runs in the stock game with nothing else installed.

## Run the tests

You need only [Bun](https://bun.sh) 1.3.13 and Git. Wisp is installed from the
tarball in `vendor/`, so no other download is needed.

```sh
bun install --frozen-lockfile
bun run check                          # types and Warcraft's number rules
bun test                               # unit test and headless journey, in Bun and 32-bit Lua
bun scripts/battlecraft.ts headless    # the headless journey on its own
```

The first `bun test` builds Lua 5.3.6 with 32-bit numbers, as Warcraft runs
it, into Wisp's cache; it needs a C compiler. Set `LUA` to use one you built.

The headless journey plays the map in two simulated clients: both champions
move, cast, cool down and hit the dummy until it resets, through a hot reload,
and both clients must make the same Warcraft calls and print the same
checksum. Warcraft's mouse events are not simulated yet, so the journey aims
at the starting aim point, the arena center.

## How it fits together

| Path | What it holds |
| --- | --- |
| `src/sim/` | The simulation: all game state, integers only. `step(state, inputs)` is a pure function of the state and one `InputRow` per player. |
| `src/champions/` | Champions: one file each, and `registry.ts` listing them. |
| `src/input.ts` | Turns Warcraft's synchronized key and mouse events into each frame's input rows. |
| `src/display.ts` | Draws the state with stock Warcraft units, effects and floating text. It never reads the game back. |
| `src/main.ts` | The map entry: `start()` creates everything once, `install()` registers handlers and runs again after each hot reload. |
| `test/` | The hit-rule test and the headless journey. |
| `scripts/battlecraft.ts` | Commands: `map build`, `map rebuild`, `hot`, `fresh`, `client`, `headless`. |

The simulation runs at 60 frames a second. Keep it deterministic: integers
only (positions are in sixteenths of a world unit), `floorDiv`/`floorMod` from
Wisp instead of `/` and `%`, and no state outside `SimState`. `bun run check`
rejects most mistakes. Values must stay below 2^31, because Warcraft's Lua
integers are 32-bit.

## Add a champion

A champion is data plus pure functions. Copy `src/champions/ranger.ts` to a
new file, change its name, unit type, radius, move speed, health and
abilities, and add it to `CHAMPIONS` in `src/champions/registry.ts`. An
ability is a cooldown, projectile speed, range, radius, damage and model, plus
`cast(state, casterId, aim)`, which returns the new state; `skillshot()` makes
the usual straight projectile. Speeds are simulation units per frame
(`perFrame(worldUnitsPerSecond)`), cooldowns are frames.

Players pick champions by registry index in `initialState([0, 0])` in
`src/main.ts`.

## Build the map

```sh
bun scripts/battlecraft.ts map build --base BASE.w3m --out OUT/battlecraft.w3x
```

The build needs a base map: any Warcraft III map saved from World Editor with
Lua as its script language. It supplies the terrain, size and camera bounds;
the build replaces its script, players and forces. Its playable area should be
at least 2048 by 1536 around its center, the arena's size. A base saved once
can be reused without opening World Editor again. Keep base maps, built maps
and any game files out of this repository. On first use the build compiles
Wisp's map packager, which needs `nix` (or `STORMLIB_PREFIX` and `CC`); see
Wisp's [editor-free guide](https://github.com/tompassarelli/wisp/blob/24ce98b6feca1b4059501508177a3783ef9c768d/docs/editor-free.md).

## Wisp version

`package.json` installs Wisp from `vendor/wisp-<commit>.tgz`, recorded in
`wisp.lock`, and CI runs Wisp's consumer workflow at the same commit.
