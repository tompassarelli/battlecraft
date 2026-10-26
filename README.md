# Battlecraft

A starter arena brawler in the style of Bloodline Champions and Battlerite for
Warcraft III, built on [Wisp](https://github.com/tompassarelli/wisp) and the
input and rollback lessons from
[Smashcraft](https://github.com/tompassarelli/smashcraft).

Two players each control a champion in a walled arena: WASD moves, the mouse
aims, Q fires a skillshot at the aim point. The map also runs alone: a slot
with no human in it, or a player who leaves, keeps a champion that stands
still. A training dummy in the middle
shows its health, floats the damage it takes and resets when it reaches zero.
Type `-checksum` in chat to print the confirmed simulation's frame and
checksum on every client.
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
move, cast, cool down and hit the dummy until it resets, through a hot reload.
It runs three times, with input messages delivered at once, with Battle.net's
measured delay (`syncDelivery(MEASURED_BATTLE_NET)`) and with that delay plus
Warcraft's bursty turns (`turnBursts()`). Each time both clients must make the
same synchronized Warcraft calls, hit the dummy on the same frames, confirm the
same state and float each hit's damage once. A one-client run checks that a
player alone keeps playing. Warcraft's mouse events are not
simulated yet, so the journey aims at the starting aim point, the arena
center.

## How it fits together

| Path | What it holds |
| --- | --- |
| `src/sim/` | The simulation: all game state, integers only. `step(state, inputs)` is a pure function of the state and one `InputRow` per player. |
| `src/champions/` | Champions: one file each, and `registry.ts` listing them. |
| `src/input.ts` | Builds the local player's next input row from polled keys, key-down events and the synchronized mouse. |
| `src/inputCodec.ts` | How an input row travels: neutral row, prediction, equality and its delta encoding. |
| `src/netcode/` | Frame-stamped input, knowing nothing of Battlecraft's rows: ledger, batched messages, prediction and rollback. |
| `src/display.ts` | Draws the predicted state with stock Warcraft effects and floating text made at startup. It never reads the game back. |
| `src/main.ts` | The map entry: `start()` creates everything once, `install()` registers handlers and runs again after each hot reload. |
| `test/` | The hit-rule test and the headless journey. |
| `scripts/battlecraft.ts` | Commands: `map build`, `map rebuild`, `hot`, `fresh`, `client`, `headless`. |

## Input and netcode

Each 60 Hz callback, the local player's keys are polled (`BlzIsKeyPressed`
reads the client's own keyboard, without a round trip) into the row for frame
F + 2, where F is the next frame to simulate. An ability press latches the
aim and is carried in that row, so a skillshot cast on frame N uses the same
aim on every client. A tap that starts and ends between two polls still casts
through its synchronized key-down event; a move key tapped for less than a
frame is lost, as it was before.

Rows go out in one synchronized message about every 6 callbacks (sooner for a
press), under a token bucket that keeps the average at 10 messages a second
and every message under 200 bytes. A message carries every unsent frame: the
first row, then only rows that differ from holding the one before. Every
client accepts the same messages in the same order into its ledger, so the
confirmed simulation, stepped only on accepted rows, is identical everywhere.

The display draws a predicted simulation instead: it runs the local rows at
once and guesses that each remote player keeps holding their last row. When a
remote row arrives that differs from the guess, the prediction rolls back to
the snapshot before it and runs forward again. Snapshots cost nothing extra,
as `step` returns new immutable state. Prediction waits when it would run more
than 24 frames past the remote rows it has, and runs up to 6 frames a callback
to catch up after a stall. Floating damage fires once per arrow, however many
times a rollback runs the frame that hit: an arrow is known by its caster,
cast frame and ability, because a late cast renumbers the projectiles.

Every client decides at start which slots take part: a slot that is playing
and controlled by a user. Every other slot gets idle rows without waiting for
them. When a player leaves, Warcraft's leave event reaches every client at the
same point, so every client treats that player's rows after the last one its
ledger accepted from them as idle and rolls the prediction back if it had
guessed otherwise.

The netcode module takes the row through a `RowCodec`; Battlecraft's is
`INPUT_CODEC` in `src/inputCodec.ts`. Add a row field there and in
`src/sim/input.ts` and the netcode needs no change.

The simulation runs at 60 frames a second. Keep it deterministic: integers
only (positions are in sixteenths of a world unit), `floorDiv`/`floorMod` from
Wisp instead of `/` and `%`, and no state outside `SimState`. `bun run check`
rejects most mistakes. Values must stay below 2^31, because Warcraft's Lua
integers are 32-bit.

## Add a champion

A champion is data plus pure functions. Copy `src/champions/ranger.ts` to a
new file, change its name, model, radius, move speed, health and
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
