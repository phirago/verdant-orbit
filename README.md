# Verdant Orbit

A playable mobile-first 3D vertical slice of an original third-person survival-terraforming game.

You play human pathfinder Ari Vale, balancing finite suit oxygen and electrical reserves while building a planetary support network. Powered Haven Outposts create safe recharge zones; Aether Relays unlock during the Awakening stage and transmit generation wirelessly between distant sites.

## Play

```bash
cd /home/triton/verdant-orbit
npm start
```

Open http://localhost:4173 in a browser. For a phone on the same network, open `http://<this-machine-ip>:4173` and add it to the home screen.

## Controls

- Touch: left joystick to move; drag the 3D world to orbit the camera; hold SPRINT for faster traversal; COLLECT to interact; BUILD to fabricate and seed.
- Keyboard: WASD or arrow keys to move; Shift to sprint; Space to interact.
- Build flow: establish a Solar Petal, then place a Haven Outpost nearby to create a powered, pressurized recharge zone.
- Midgame grid: place Aether Relays near generation sites and remote outposts; successive relays link wirelessly once the Awakening stage is reached.
- Terraforming: use condensers and nurseries, then introduce compatible native species.

## Playable slice

- Explore the Ashen Crater as human pathfinder Ari Vale in third person.
- Traverse a procedural low-poly 3D landscape with an orbit camera.
- Balance suit oxygen, electrical reserves, sprinting, and exposure.
- Gather moonstone, water, and spores.
- Build Solar Petals, Mist Condensers, Soil Nurseries, Haven Outposts, Seam Extractors, Carbon Generators, Aquifer Pumps, Field Fabricators, and Aether Relays.
- Place extractors directly on mapped coal seams and power them from a nearby generation site.
- Restore a stable water cycle before aquifer pumps can harvest water at scale.
- Burn coal for dependable local generation when solar coverage is insufficient.
- Convert coal and moonstone into advanced components in powered Field Fabricators.
- Unlock schematics through production milestones rather than receiving the complete catalogue immediately.
- Create local safe zones that replenish oxygen and suit power.
- Unlock Aether Relays and connect distant sites to a wireless power grid.
- Seed Glow Moss, Ember Reeds, and Glasswings.
- Restore water, soil, flora, and biodiversity.
- Progress through Dormant, Awakening, Verdant, and Harmony biome states.
- Follow LYRA's objectives and story journal.
- Autosave locally and install as an offline-capable PWA.

## Verification

```bash
npm test
node --check src/app.mjs
```

The simulation, ecology gates, crafting, saving, server security, UI contract, and PWA manifest are covered by the Node test suite.

## Project structure

- `index.html` — game shell and accessible mobile controls
- `styles.css` — responsive HUD and visual system
- `src/app.mjs` — canvas renderer, input, UI, and game loop
- `src/game-state.mjs` — deterministic simulation and progression
- `test/` — automated tests
- `service-worker.js` — offline asset cache
- `manifest.webmanifest` — installable mobile metadata

## Next production milestones

This repository is a polished vertical slice, not yet an App Store binary. A full production build would next add the remaining five regions, authored story scenes, audio, native store packaging, device QA, analytics/consent, localization, and original production art assets.
