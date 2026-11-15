# Strike Counter 1

A lighthearted 3D tactical shooter parody (think Counter-Strike, but in a sunny Italian town). **Tortellini vs Counter-Tortellini** on the map **de_Bellavista**: half medieval Italian town (piazza, church, arcade café, market, alleys, city wall), half Tuscan countryside (vineyard, olive grove, farmhouse, ruined barn, watchtower).

No gore. When someone is eliminated they turn red, tip over sideways and vanish in a puff of smoke.

Built with plain **three.js** ES modules, the same setup as The Behindrooms. There's no build step and no asset files: every texture, model and sound is generated in the browser.

---

## Run it locally (VS Code)

ES modules don't load from `file://`, so you need a local web server:

- **VS Code:** install the **Live Server** extension, right-click `index.html` → *Open with Live Server*.
- **or terminal:** `npx serve .` (or `python3 -m http.server 8000`) and open the URL it prints.

You need an internet connection the first time, because three.js (r170) and the Google Fonts load from CDNs.

## Deploy to Netlify

The `netlify.toml` already sets up a static site with no build command, publishing the folder root.

- **Fastest:** go to <https://app.netlify.com/drop> and drag the whole `strike-counter-1` folder in.
- **With Git:** push the folder to a GitHub repo → Netlify → *Add new site → Import from Git*. Leave the build command empty and set the publish directory to `.`.

---

## Controls

| Key | Action |
|---|---|
| WASD | Move |
| **Double-tap W** | Sprint (+35% speed, drains energy) |
| Space | Jump |
| Shift | Crouch (smaller hitbox, quieter, steadier aim) |
| **Q** | Dodge in your move direction (bots use the same dodge) |
| **C** | Toggle first / third-person |
| LMB / RMB | Fire / aim down sights (snipers: click to cycle 2 zoom levels) |
| R | Reload |
| 1 2 3 4 / wheel | Primary · Pistol · Stiletto · Hatchet |
| B | Loadout menu (instant during freeze time / first 15 s after spawn) |
| F | Inspect weapon |
| Tab | Scoreboard |
| Esc | Pause |

### Touch (phones & tablets)

Touch controls turn on automatically on phones and tablets (Settings → Controls → *Touch controls*: Auto / Always on / Off).

- **Left thumb:** a floating stick that appears wherever you touch the left side. Push it to the edge to **sprint**.
- **Right thumb:** drag to look. You can also drag the fire button to aim while shooting.
- **Fire** (big button), with an arc of icons around it: **Aim/scope, Reload, Jump, Dodge, Crouch** (aim and crouch toggle).
- **Top-right icons:** Pause, Switch weapon, Camera (first/third person), Loadout.
- **Tap the team bar** at the top to show or hide the scoreboard.

Play in landscape. The game asks you to rotate, and goes fullscreen where the browser allows it.

**HUD:** the small bar under the crosshair shows each weapon's cooldown after a shot (white) and reload progress (orange), like Minecraft's attack bar. The minimap shows every enemy. Ones that are shooting or spotted by your team get a white ring, and players off the edge of the map show as arrows on the rim.

**Bots:** they react, turn and aim like people: their first aim lands near you and then settles, they wobble while moving and flinch when hit. Snipers must stop, scope in and hold steady before shooting, and rifle bots stop to fire bursts at range.

**Energy:** below 6 you're exhausted and can't sprint until it recovers to about 22. It refills slowly while walking and fastest while standing still. Sprint mode (Hold / Toggle) is in Settings → Controls.

## Modes

- **Team Deathmatch:** tactical rounds, first team to N round wins (3/5/8). Friendly fire is off. AI teammates don't respawn mid-round. You can respawn after the 20 s death-screen countdown.
- **Free-For-All:** first to 20 eliminations, 10-minute limit. Bots respawn after 8 s, you after 20 s.

## Graphics presets

`Potato · Low · Normal · High · Ultra · Blow Up Your Computer`. Each preset changes render scale, shadow-map size and range, draw distance and fog, texture resolution, grass density and fade distance, tree LOD distance, and post-processing (bloom, colour grade, FXAA/SMAA, GTAO ambient occlusion). You can override individual settings under the presets. Everything is saved in `localStorage`.

Optimisation: the map is merged into roughly 40 m chunks per material, so it uses few draw calls. Three.js frustum-culls each chunk, and chunks are also distance-culled against the draw distance. Trees use instanced near/far LOD per chunk, grass shrinks away with distance in the shader, the shadow camera follows the player (texel-snapped), and linear distance fog hides the cut-off.

---

## Project layout

```
index.html          overlays (menus, HUD, death/pause/buy screens) + import map
css/style.css       all UI styling
js/main.js          boot, menus, settings UI, main loop
js/settings.js      graphics presets, saved settings, bot difficulty
js/renderer.js      WebGL renderer + post-processing chain
js/textures.js      procedural canvas textures (+ normal maps), sign/poster atlases
js/materials.js     shared materials, wind shader, terrain splat shader
js/physics.js       collision world (AABBs, cylinders, heightfield), raycasts, Mover (player & bot movement)
js/character.js     rigged soldier model, procedural animation, IK arms, hitboxes, death tip-over
js/weapons.js       weapon stats + procedural gun/knife/axe models
js/viewmodel.js     first-person arm + weapon (sway, bob, recoil, reload, melee, inspect)
js/combat.js        firing, spread, recoil, hitscan, damage, melee
js/actor.js         shared Actor (player or bot)
js/player.js        player input + FP/TP camera (head bob, sprint tilt)
js/ai.js            bot brain (vision/LOS stealth, target focus, cover, strafe/jump/dodge)
js/nav.js           navigation grid, A* pathfinding, cover cells
js/game.js          modes, rounds, spawns, respawns, kills, team markers
js/hud.js           HUD, radar, killfeed, scoreboard
js/effects.js       particles, tracers, decals, shell casings, muzzle flashes
js/audio.js         synthesized Web Audio SFX + ambience
js/world/*          sky/lighting, town, countryside, vegetation, props, world assembly
```

### Easy tweaks
- Weapon stats: `WEAPONS` in `js/weapons.js`
- Movement and stamina numbers: `MOVE` in `js/physics.js`
- Respawn timers, round length, FFA kill limit: constants at the top of `js/game.js`
- Bot difficulty: `DIFFICULTY` in `js/settings.js`
- Preset contents: `PRESETS` in `js/settings.js`

### If a preset crashes your device
The game protects itself from crash loops. If a launch or a graphics change doesn't finish (for example the browser runs out of memory), the next load drops back to the last preset that worked and tells you. On phones and tablets, Ultra and Blow Up are capped (render scale, shadow size, texture size, grass, view distance) to stay within mobile memory limits.

Manual recovery links: add `?preset=low` to the URL to load and **save** a preset, or `?reset` to wipe all saved settings.

Use URL parameters for quick testing: `?autostart=tdm` or `?autostart=ffa`, and `?preset=ultra`.
