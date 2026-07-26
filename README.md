# Chrono Block — 300 Vine Street, 1945 → 2055

One city block, procedurally rebuilt six times over. Drag the timeline and the street
reconstructs itself in place: buildings, shopfronts, signage, advertising, traffic,
street furniture and the clothes on people's backs.

Nothing is loaded from disk. Every brick, cobblestone, ghost sign, neon tube, hologram,
car body, pedestrian outfit and every sound is generated at runtime.

## Run it

No build step and no `npm install` — the server uses only Node built-ins and Three.js is
vendored in `vendor/three/`.

```bash
npm start          # → http://localhost:4173/
npm start -- -v    # same, logging every request
```

Any other static file server works just as well, as long as it serves the repository root:

```bash
python3 -m http.server 4173
npx serve .
```

Opening `index.html` directly from the filesystem will **not** work: ES modules and the
importmap require an `http://` origin.

**If you get a 404,** the server prints the URL it was asked for and the absolute path it
looked for, which usually makes the cause obvious (wrong working directory, or serving a
subfolder instead of the repository root).

Then open the page and press **Enter the street**. WebGL2 required; headphones recommended
(the soundtrack is synthesised live).

## Controls

| | |
|---|---|
| `1`–`6` | jump to a year |
| `←` `→` | step through time |
| drag the timeline | scrub between eras |
| mouse drag / scroll | orbit and zoom |
| `W A S D`, `Q`/`E`, `Shift` | move in Walk and Fly modes |
| hover anything | identify it |
| `C` | cinematic camera |
| `M` | mute |
| `H` | hide the interface |
| `P` | save a PNG frame |
| `Esc` | release the mouse cursor |

Six camera bookmarks (Street, Wide, Corner, Shopfront, Aerial, Look up) are in the panel,
bottom right.

## The six eras

| Year | | What changes |
|---|---|---|
| **1945** | Post-War | Streetcar 41 and overhead trolley wire, cobbles, hand-lettered signs, canvas awnings, cast-iron lamp standards, fedoras and trench coats, WAR BONDS billboard on the empty lot, 21¢ service station on the corner |
| **1965** | Mid-Century | The empty lot becomes the nine-storey Progress Building; rails paved over, buses and tailfins, backlit acrylic signage, a metal slipcover hides the 1897 brickwork, cobra-head lights, glass phone booth, TV aerials |
| **1985** | Neon Decline | Dusk. Sodium vapour and neon, graffiti, window air-conditioners, barred windows, dumpsters, payphones, an arcade and a video rental shop, satellite dish on the tower |
| **2005** | Turn of the Century | Overcast drizzle on wet asphalt. The tenement is demolished for surface parking behind chain link; blue-green curtain-wall recladding, restoration scaffolding, bootcut jeans and flip phones |
| **2025** | Present Day | Golden hour. Protected bike lane, e-scooter dock, parklet dining, EV charge plaza under a solar canopy, cross-laminated timber infill, animated LED media wall, restored ghost sign |
| **2055** | Near Future | Blue hour. Embedded light guideways instead of paint, volumetric holographic advertising, vertical farms and living facades, autonomous pods, rooftop drone pads, a skybridge, techwear with electroluminescent trim |

The history is deliberate. **The 1912 bank on the corner survives all six eras** — remodelled
in 1961, reduced to a cheque-cashing window by 1985, landmarked and scaffolded in 2005,
restored as a cafe in 2025, and wearing a glass hat by 2049. The tenement on Lot D does not
survive: it comes down in 1998 and returns as timber-framed housing in 2019.

## The time jump

A single horizontal "time front" sweeps up through the world. Below the line you are in the
new era; above it you are still in the old one. Both eras' materials are patched with a
shared dissolve shader that discards fragments on its own side of the plane and draws a
glowing rim exactly at the cut, so the block appears to be rebuilt from the pavement up in
one continuous shot. Sky, sun angle, fog, colour grade, practical lighting and audio all
crossfade with the sweep, over camera shake and a synthesised riser.

## How it is put together

```
index.html            importmap + HUD markup
styles.css            interface
src/
  main.js             renderer, loop, era cache, keyboard
  ui.js               timeline, era card, panel, loader
  config/
    eras.js           per-era sky, light, fog, grade, weather, street and population
    block.js          the 110-year history of six lots, plus the south side and skyline
  lib/
    util.js           seeded RNG, easing, colour helpers
    geom.js           geometry helpers + Batch (merges an era into ~60 draw calls)
    textures.js       procedural canvas textures: brick, stone, cobbles, windows,
                      shop interiors, graffiti, posters, road paint, foliage
    signs.js          signage by technology: painted, gilded, plastic, enamel, neon,
                      vinyl, minimal, holographic, plus live animated LED displays
    materials.js      per-era material factory + the chrono-wipe shader patch
  world/
    ground.js         road, kerbs, pavements, markings, tram rails, light guideways
    buildings.js      facades, windows with real reveals, cornices, fire escapes, roofs
    storefront.js     bulkheads, display glazing, fascia signs, awnings, pavement clutter
    specials.js       vacant lots, service station, EV plaza, autonomy hub
    props.js          lamps, signals, hydrants, phones, meters, shelters, trees
    vehicles.js       extruded side-profile vehicles, buses, streetcar, drones, traffic
    people.js         articulated pedestrians with era outfits and carried props
    environment.js    sky shader, lighting rig, dynamic light pool, weather, backdrop
    era.js            assembles one era into a single detachable group
  systems/
    postfx.js         bloom + per-era grade (grain, vignette, scanlines, aberration)
    controls.js       orbit / walk / fly, bookmarks, cinematic dolly
    transition.js     the time jump
    inspector.js      hover labels
    audio.js          synthesised ambience, six music styles, era sound events
tools/
  serve.mjs           static server
  shoot.mjs           headless Chrome capture of every era (dev only)
```

Three.js `0.169.0` is vendored in `vendor/three/` so the scene runs offline from any static
server with no bundler. To refresh it: `npm i -D three` then copy `build/three.module.js` and
`examples/jsm/{controls,postprocessing,shaders,math,utils}` into `vendor/three/`.

## Performance notes

- One era at a time is visible; the others stay built and hidden, so re-visiting a year is
  instant. All six resident is roughly 6,000 meshes' worth of geometry merged down to a few
  hundred draw calls.
- Buildings, props and vehicles are merged per material at build time by `Batch`.
- Practical lights (neon, lamps, shopfront spill) are collected as *sources*; a pool of 14
  real point lights is reassigned to whichever sources matter most from the current camera.
- The shadow map freezes for the two seconds a time jump is running, when two eras are
  resident.
- Quality toggle drops pixel ratio, shadows and bloom.
