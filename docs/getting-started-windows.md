# Getting started on Windows

This guide takes you from a Windows machine with Warcraft III (Reforged, with
World Editor) to playing Battlecraft, changing it while it runs and adding a
champion of your own. You install only Git and Bun. Every command is for
PowerShell.

If you know Dota 2 Workshop Tools, most of this will feel familiar: the game
code is TypeScript in `src/`, a build turns it into a map file, and a dev loop
reloads your code into the running game. A few Warcraft words first:

- **Base map**: a map you save once in World Editor; the build takes its
  terrain and size and puts Battlecraft's code into a copy of it.
- **Lua script mode**: the map's script language setting. Battlecraft compiles
  to Lua, so the base map must use Lua, not JASS, Warcraft's older language.
- **Player slot**: one of the map's seats (Player 1, Player 2) that a person
  takes in the game lobby, like a team slot in a Dota lobby.
- **Hot reload**: your saved code swapping into a game that is already
  running, without restarting it, like `script_reload` in Dota.

Some steps say "checked on Linux; Windows check pending". They work on Linux
and in the Windows CI job but haven't yet been tried on a real Windows
machine with the game; if one fails for you, tell us what you saw.

## 1. Install Git and Bun

Install Git for Windows from [git-scm.com](https://git-scm.com/download/win),
keeping the default options, or from PowerShell:

```powershell
winget install --id Git.Git -e --source winget
```

Install Bun 1.3.13 with Bun's own PowerShell installer. Battlecraft is pinned
to that version, and the map build refuses any other:

```powershell
iex "& {$(irm https://bun.sh/install.ps1)} -Version 1.3.13"
```

Close PowerShell and open a new one so both are on your `PATH`, then check:

```powershell
git --version
bun --version
```

`git --version` prints something like `git version 2.51.0.windows.1`, and
`bun --version` prints exactly `1.3.13`.

## 2. Get Battlecraft and run its checks

```powershell
cd $HOME
git clone https://github.com/tompassarelli/battlecraft.git
cd battlecraft
bun install --frozen-lockfile
bun run check
bun test
bun scripts/battlecraft.ts headless
```

The clone lands in `C:\Users\<you>\battlecraft`. What passing looks like:

- `bun install --frozen-lockfile` ends with `35 packages installed`. Wisp, the
  framework under Battlecraft, comes from the tarball in `vendor/`.
- `bun run check` prints the command it runs and nothing else. Errors would
  print as `file(line,column): error ...` and end with `script "check" exited
  with code 1`.
- `bun test` ends with `9 pass`, `0 fail`. It plays the map in two simulated
  clients, in Bun and in the 32-bit Lua that Warcraft runs; Wisp ships that
  Lua prebuilt for Windows, so you need no compiler.
- `bun scripts/battlecraft.ts headless` plays the same match on its own and
  ends with

  ```text
  p0: 408 native calls, checksum -1338690738
  p1: 408 native calls, checksum -1338690738
  no desync in 300 frames
  hot reload 1 running in every client
     0.101 s  headless (0.101 s)
  ```

  Both clients made the same Warcraft calls, so the match stayed in sync.

## 3. Save a base map in World Editor

You do this once.

1. Open World Editor and choose **File > New Map**. Any tileset works. Make it
   64 x 64 or larger: the arena needs a playable area of at least 2048 by 1536
   around the map's center.
2. Open **Scenario > Map Options** and set **Script Language** to **Lua**.
3. Leave players, forces and triggers as they are. The build writes its own
   two player slots (Player 1 and Player 2, on one team) and its own name and
   description, and it never runs the map's default melee trigger.
4. Make a folder for it, outside the clone:

   ```powershell
   $docs = [Environment]::GetFolderPath("MyDocuments")
   New-Item -ItemType Directory -Force "$docs\Battlecraft" | Out-Null
   ```

5. **File > Save Map As**, into `Documents\Battlecraft`, as `base.w3x`. Save
   it as one map file, not as a folder.

Never commit the base map: it is your own World Editor file, not part of the
code, and it stays out of Git. You can reuse it for every build without
opening World Editor again.

## 4. Build the map and play it

Build into Warcraft's `Maps` folder, where the game lists custom maps. The
output folder must exist before the build:

```powershell
$docs = [Environment]::GetFolderPath("MyDocuments")
New-Item -ItemType Directory -Force "$docs\Warcraft III\Maps\Battlecraft" | Out-Null
bun scripts/battlecraft.ts map build --base "$docs\Battlecraft\base.w3x" --out "$docs\Warcraft III\Maps\Battlecraft\battlecraft.w3x"
```

The build prints its steps with timings and ends with

```text
built C:\Users\<you>\Documents\Warcraft III\Maps\Battlecraft\battlecraft.w3x
```

It also writes `battlecraft.w3x.base.lua` beside the map, a copy of the base
map's script; leave it there. `$docs` follows your Documents folder wherever
Windows keeps it, OneDrive included.

Now start Warcraft III and open **Custom Game > Create Game**, find the
`Battlecraft` folder in the map list and pick `battlecraft.w3x`. Start it
alone, or open it from the **Local Area Network** screen to play a friend on
your network. Checked on Linux; Windows check pending.

In the game you should see a walled arena with your Ranger on one side, the
other slot's champion on the other and a training dummy in the middle:

- **W A S D** move your champion.
- **The mouse** aims.
- **Q** fires an arrow at the aim point. Hit the dummy: it shows its health,
  floats the damage and resets when it reaches zero.
- Type **`-checksum`** in chat: every client prints the confirmed frame and a
  checksum. With two players, both lines must match.

An empty slot, or a player who leaves, keeps a champion that stands still.

## 5. The dev loop

`dev` is the command you leave running while you work. On every save it
checks the saved files' types, runs the tests the save can affect and plays
the headless match, and prints each result with its time since the save:

```powershell
bun scripts/battlecraft.ts dev
```

To have each save also hot-reload into the game, point `--data` at Warcraft's
`CustomMapData` folder, where the game and the dev loop exchange files. Start
it before you start the match, because it makes the folder the map looks for:

```powershell
$docs = [Environment]::GetFolderPath("MyDocuments")
bun scripts/battlecraft.ts dev --data "$docs\Warcraft III\CustomMapData"
```

Then start `battlecraft.w3x` as in step 4, edit something small (say the
Ranger's `damage` in `src/champions/ranger.ts`) and save. The game shows `hot
reload 1 applied`, and your next arrow does the new damage. Errors in the game
and desyncs print in the dev loop's window, with TypeScript lines. Checked on
Linux; Windows check pending.

A hot reload changes code, not the map. Changing numbers and logic reloads;
a new model, a new champion in the match or a change to what `SimState` holds
needs `map build` again and a fresh game.

To check a commit without leaving anything running, `--since` treats
everything changed since a commit as one save, prints the same results and
exits:

```powershell
bun scripts/battlecraft.ts dev --since HEAD~1
```

It ends with a line like `1.176 s  dev (1.176 s)` and exits with 0 when
everything passed, or with `dev failed` and the problems when something
didn't. Checked on Linux; Windows check pending.

## 6. Add a champion

A champion is data plus pure functions of the simulation state: given a state
and a cast, return a new state, and touch nothing else. Here is a Sorceress
whose Frost Bolt is slower, bigger and harder-hitting than the Ranger's
arrow, and pushes her back as she casts. Save it as
`src/champions/sorceress.ts`:

```ts
import { ARENA } from "../sim/state";
import { SCALE, clamp, perFrame } from "../sim/fixed";
import type { Ability, ChampionKind } from "./champion";
import { skillshot } from "./skillshot";

const RECOIL_FRAMES = 4;

const bolt = skillshot(0, {
  name: "Frost Bolt",
  cooldown: 90,
  speed: perFrame(800),
  range: 700 * SCALE,
  radius: 40 * SCALE,
  damage: 45,
  model: "Abilities\\Weapons\\FrostWyrmMissile\\FrostWyrmMissile.mdl",
});

const frostBolt: Ability = {
  ...bolt,
  cast: (state, casterId, aim) => {
    const next = bolt.cast(state, casterId, aim);
    const shot = next.projectiles[next.projectiles.length - 1];
    if (next === state || shot === undefined) return next;
    const champions = next.champions.map((champion) => champion.id !== casterId ? champion : {
      ...champion,
      x: clamp(champion.x - shot.vx * RECOIL_FRAMES, -ARENA.halfWidth, ARENA.halfWidth),
      y: clamp(champion.y - shot.vy * RECOIL_FRAMES, -ARENA.halfHeight, ARENA.halfHeight),
    });
    return { ...next, champions };
  },
};

export const sorceress: ChampionKind = {
  name: "Sorceress",
  model: "units\\human\\Sorceress\\Sorceress.mdl",
  radius: 28 * SCALE,
  moveSpeed: perFrame(270),
  health: 160,
  abilities: [frostBolt],
};
```

The units: positions and radii are in sixteenths of a world unit (`SCALE`),
speeds are per frame (`perFrame(worldUnitsPerSecond)`), cooldowns are frames
at 60 a second, and models are paths to stock Warcraft models.

Register it with one line in `src/champions/registry.ts`:

```ts
import type { ChampionKind } from "./champion";
import { ranger } from "./ranger";
import { sorceress } from "./sorceress";

export const CHAMPIONS: readonly ChampionKind[] = [
  ranger,
  sorceress,
];
```

Players pick champions by their index in that list. To give the second
player the Sorceress, change `initialState([0, 0])` in `src/main.ts` to

```ts
  const sim = initialState([0, 1]);
```

Then run the checks again:

```powershell
bun run check
bun scripts/battlecraft.ts headless
bun test
```

`check` passes and `headless` still ends with `no desync in 300 frames`.
`bun test` now fails one test, `under instant, Battle.net and turn-burst
delivery ...`: it pins what two Rangers do in the scripted match, and the
Sorceress's slower bolt misses an arrow the old match landed (`- "1@143.0"`
in its diff). That is the test doing its job. Once the new matchup plays the
way you want, update those expected hits and frames in
`test/headless.test.ts` to the new ones it prints. The test that compares Bun
with Warcraft's 32-bit Lua still passes, and that one must never fail.

Then `map build` again and start a fresh game to play it.

### The number rules

Every client runs the simulation on its own and must reach exactly the same
state, so simulation code (`src/sim/` and `src/champions/`) follows Wisp's
number rules:

- Integers only. Use `floorDiv(a, b)` and `floorMod(a, b)` from
  `wisp/src/sim/intMath` instead of `/` and `%`: JavaScript and Warcraft's Lua
  round them differently.
- Keep values below 2^31: Warcraft's Lua integers are 32-bit and wrap.
- Compare numbers explicitly (`count !== 0`, not `if (count)`): Lua treats 0
  as true.
- All game state lives in `SimState`. No `let` at module level that a cast or
  step changes, and no `Math.random`.

`bun run check` rejects most mistakes, and `bun test` catches the rest by
running the same match in Bun and in 32-bit Lua.

## 7. When something fails

**Wrong Bun version.** The map build stops with

```text
verify TypeScript toolchain lock failed for C:\Users\<you>\battlecraft\typescript-toolchain.lock: running Bun 1.4.4 (locked 1.3.13)
```

Run the installer from step 1 again with `-Version 1.3.13`, open a new
PowerShell, check `bun --version`, then `bun install --frozen-lockfile`.

**Base map saved as JASS.** The build stops with

```text
extract war3map.lua failed for C:\Users\<you>\Documents\Battlecraft\base.w3x: <map-pack path> exited with 1: Cannot extract map script (2)
```

The base has no Lua script. Open it in World Editor, set **Scenario > Map
Options > Script Language** to **Lua**, save it and build again. If World
Editor won't switch, make a new map and set Lua before anything else.

**A number-rule error.** `bun run check` prints the file, line, column and
the fix, then `script "check" exited with code 1`:

```text
src/champions/sorceress.ts(6,25): error TS9300: `%` truncates in JavaScript and floors in Lua; use floorMod or imod
src/champions/sorceress.ts(6,23): error TS9300: 0.3 isn't a binary32 value; write 0.30000001192092896 or f32(0.3)
```

Do what the message says; in simulation code that usually means an integer
and `floorDiv` or `floorMod`.

**A desync.** `headless` (or the dev loop) fails with

```text
desync: call 407 differs between slot 0 and slot 1:
```

followed by each client's last Warcraft calls, and `arena: 1 problem`. The
two clients computed different states. Usually game state lives outside
`SimState`: a module-level `let` that a cast changes runs again on every
rollback, so each client counts differently. Keep all state in `SimState`
and return a new one from your functions. In a real game, the dev loop
prints `Warcraft desync on ...` when Warcraft itself reports one.
