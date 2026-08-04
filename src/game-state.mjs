const WORLD = { width: 1600, height: 900 };

export const MACHINE_DEFS = {
  solar: { name: 'Solar Petal', cost: { mineral: 5 }, radius: 130, color: '#ffd579' },
  condenser: { name: 'Mist Condenser', cost: { mineral: 8 }, radius: 150, color: '#62d9ff' },
  nursery: { name: 'Soil Nursery', cost: { mineral: 6, water: 4 }, radius: 140, color: '#d78cff' },
  waystation: { name: 'Haven Outpost', cost: { mineral: 10, water: 2 }, radius: 110, color: '#65f4ba' },
  mine: { name: 'Seam Extractor', cost: { mineral: 9 }, radius: 145, color: '#d1a685' },
  coalGenerator: { name: 'Carbon Generator', cost: { mineral: 12, coal: 2 }, radius: 220, color: '#ff9c61' },
  pump: { name: 'Aquifer Pump', cost: { mineral: 10 }, radius: 150, color: '#53d7ff' },
  factory: { name: 'Field Fabricator', cost: { mineral: 18, coal: 4 }, radius: 170, color: '#9baeff' },
  relay: { name: 'Aether Relay', cost: { mineral: 12, components: 2 }, radius: 180, color: '#ff9bd5' },
};

export const SPECIES_DEFS = {
  glowmoss: { name: 'Glow Moss', cost: { spores: 1 }, needs: { water: 20, soil: 18 }, flora: 0.34, bio: 0.16, color: '#59f2b2' },
  emberreed: { name: 'Ember Reeds', cost: { spores: 2 }, needs: { water: 35, soil: 25 }, flora: 0.5, bio: 0.22, color: '#ffb15c' },
  glasswing: { name: 'Glasswings', cost: { spores: 3 }, needs: { flora: 35, biodiversity: 8 }, flora: 0.08, bio: 0.52, color: '#bca7ff' },
};

function rng(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function makeNodes(seed) {
  const random = rng(seed);
  const kinds = ['mineral', 'mineral', 'coal', 'spores', 'mineral', 'water', 'mineral', 'coal'];
  return Array.from({ length: 30 }, (_, i) => ({
    id: `node-${i}`,
    kind: kinds[i % kinds.length],
    amount: i % 5 === 0 ? 3 : 2,
    x: 220 + random() * 1160,
    y: 170 + random() * 570,
    collected: false,
  }));
}

export function createGame(seed = 7309) {
  return {
    version: 1,
    seed,
    elapsed: 0,
    player: { x: 800, y: 670, oxygen: 100, suitPower: 100, health: 100 },
    resources: { mineral: 0, water: 0, coal: 0, components: 0, spores: 1, bioenergy: 0 },
    inventory: { solar: 0, condenser: 0, nursery: 0, waystation: 0, mine: 0, coalGenerator: 0, pump: 0, factory: 0, relay: 0 },
    ecology: { water: 2, soil: 3, flora: 0, biodiversity: 0 },
    machines: [],
    wirelessLinks: [],
    species: [],
    nodes: makeNodes(seed),
    objective: { id: 'gather', text: 'Gather 5 moonstone', target: 5 },
    journal: ['ARI VALE // Touchdown on Nysa. Suit sealed. Pathfinder protocol active.'],
  };
}

function canPay(resources, cost) {
  return Object.entries(cost).every(([key, value]) => (resources[key] || 0) >= value);
}

function pay(resources, cost) {
  for (const [key, value] of Object.entries(cost)) resources[key] -= value;
}

function updateObjective(game) {
  if (game.objective.id === 'gather' && game.resources.mineral >= 5) {
    game.objective = { id: 'solar', text: 'Establish a solar power site', target: 1 };
    game.journal.push('COMMAND // Build local generation before your landing reserve expires.');
  }
  if (game.objective.id === 'solar' && game.machines.some((m) => m.type === 'solar')) {
    game.objective = { id: 'outpost', text: 'Deploy a Haven Outpost', target: 1 };
    game.journal.push('ARI // Power is live. I need somewhere to breathe.');
  }
  if (game.objective.id === 'outpost' && game.machines.some((m) => m.type === 'waystation')) {
    game.objective = { id: 'condenser', text: 'Build a Mist Condenser', target: 1 };
    game.journal.push('LYRA // Haven telemetry stable. Restore the water cycle.');
  }
  if (game.objective.id === 'condenser' && game.machines.some((m) => m.type === 'condenser')) {
    game.objective = { id: 'mine', text: 'Deploy a Seam Extractor on coal', target: 1 };
    game.journal.push('LYRA // Subsurface carbon mapped. Extraction schematic unlocked.');
  }
  if (game.objective.id === 'mine' && game.machines.some((m) => m.type === 'mine')) {
    game.objective = { id: 'coal', text: 'Extract 2 coal', target: 2 };
  }
  if (game.objective.id === 'coal' && game.resources.coal >= 2) {
    game.objective = { id: 'generator', text: 'Build a Carbon Generator', target: 1 };
    game.journal.push('ARI // Stored carbon gives us dependable night power.');
  }
  if (game.objective.id === 'generator' && game.machines.some((m) => m.type === 'coalGenerator')) {
    game.objective = { id: 'waterCycle', text: 'Restore planetary water to 24%', target: 24 };
  }
  if (game.objective.id === 'waterCycle' && game.ecology.water >= 24) {
    game.objective = { id: 'pump', text: 'Tap the new aquifer with a pump', target: 1 };
    game.journal.push('LYRA // Stable surface water detected. Aquifer schematic unlocked.');
  }
  if (game.objective.id === 'pump' && game.machines.some((m) => m.type === 'pump')) {
    game.objective = { id: 'factory', text: 'Construct a Field Fabricator', target: 1 };
  }
  if (game.objective.id === 'factory' && game.machines.some((m) => m.type === 'factory')) {
    game.objective = { id: 'components', text: 'Fabricate 2 advanced components', target: 2 };
  }
  if (game.objective.id === 'components' && game.resources.components >= 2) {
    game.objective = { id: 'moss', text: 'Seed Glow Moss', target: 1 };
    game.journal.push('LYRA // Advanced fabrication online. Biological restoration may proceed.');
  }
  if (game.objective.id === 'moss' && game.species.some((s) => s.type === 'glowmoss')) {
    game.objective = { id: 'harmony', text: 'Reach 35 biodiversity', target: 35 };
    game.journal.push('MEMORY // “When the glasswings return, Nysa will sing again.”');
  }
  if (game.objective.id === 'harmony' && game.ecology.biodiversity >= 35) {
    game.objective = { id: 'complete', text: 'The Ashen Crater lives', target: 1 };
    game.journal.push('LYRA // Regional heartbeat stable. This is only the beginning.');
  }
}

export function collectNode(game, nodeId) {
  const node = game.nodes.find((item) => item.id === nodeId);
  if (!node || node.collected) return { ok: false, reason: 'Depleted' };
  const distance = Math.hypot(game.player.x - node.x, game.player.y - node.y);
  if (distance > 90) return { ok: false, reason: 'Move closer' };
  node.collected = true;
  game.resources[node.kind] += node.amount;
  updateObjective(game);
  return { ok: true, amount: node.amount, kind: node.kind };
}

export function getUnlockedSchematics(game) {
  const unlocked = ['solar', 'waystation', 'condenser'];
  if (game.machines.some((machine) => machine.type === 'condenser')) unlocked.push('mine');
  if (game.resources.coal >= 2) unlocked.push('coalGenerator');
  if (game.ecology.water >= 24) unlocked.push('pump', 'nursery');
  if (game.machines.some((machine) => machine.type === 'coalGenerator') && game.machines.some((machine) => machine.type === 'pump')) unlocked.push('factory');
  if (game.resources.components >= 2 && getStage(game) !== 'DORMANT') unlocked.push('relay');
  return unlocked;
}

export function craftMachine(game, type) {
  const def = MACHINE_DEFS[type];
  if (!def) return { ok: false, reason: 'Unknown technology' };
  if (!getUnlockedSchematics(game).includes(type)) return { ok: false, reason: 'Schematic locked: complete the current production milestone' };
  if (!canPay(game.resources, def.cost)) return { ok: false, reason: 'Insufficient materials' };
  pay(game.resources, def.cost);
  game.inventory[type] += 1;
  return { ok: true };
}

export function placeMachine(game, type, x, y) {
  if (!MACHINE_DEFS[type] || game.inventory[type] < 1) return { ok: false, reason: 'Craft it first' };
  if (x < 100 || y < 100 || x > WORLD.width - 100 || y > WORLD.height - 100) return { ok: false, reason: 'Invalid terrain' };
  if (type === 'mine' && !game.nodes.some((node) => node.kind === 'coal' && distance(node, { x, y }) <= 145)) return { ok: false, reason: 'Extractor must overlap a coal seam' };
  if (type === 'pump' && game.ecology.water < 24) return { ok: false, reason: 'Restore a stable water cycle first' };
  game.inventory[type] -= 1;
  game.machines.push({ id: `machine-${game.machines.length}-${game.elapsed}`, type, x, y, progress: 0, active: false });
  updateObjective(game);
  return { ok: true };
}

export function addSpecies(game, type, x, y) {
  const def = SPECIES_DEFS[type];
  if (!def) return { ok: false, reason: 'Unknown species' };
  if (!canPay(game.resources, def.cost)) return { ok: false, reason: 'Not enough spores' };
  const suitable = Object.entries(def.needs).every(([key, value]) => game.ecology[key] >= value);
  if (!suitable) return { ok: false, reason: 'Habitat not ready' };
  pay(game.resources, def.cost);
  game.species.push({ id: `species-${game.species.length}-${game.elapsed}`, type, x, y, age: 0 });
  updateObjective(game);
  return { ok: true };
}

export function advanceWorld(game, seconds) {
  const dt = Math.max(0, Math.min(seconds, 30));
  game.elapsed += dt;

  for (const machine of game.machines.filter((item) => item.type === 'coalGenerator')) {
    machine.active = game.resources.coal > 0;
    if (machine.active) game.resources.coal = Math.max(0, game.resources.coal - dt * 0.025);
  }

  for (const machine of game.machines) {
    if (machine.type === 'condenser') {
      game.ecology.water = Math.min(100, game.ecology.water + dt * 0.34);
      game.resources.water = Math.min(99, game.resources.water + dt * 0.035);
    }
    if (machine.type === 'nursery' && isPoweredAt(game, machine)) game.ecology.soil = Math.min(100, game.ecology.soil + dt * 0.38);
    if (machine.type === 'mine' && isPoweredAt(game, machine) && game.nodes.some((node) => node.kind === 'coal' && distance(node, machine) <= 145)) {
      game.resources.coal = Math.min(999, game.resources.coal + dt * 0.09);
      machine.active = true;
    }
    if (machine.type === 'pump' && game.ecology.water >= 24 && isPoweredAt(game, machine)) {
      game.resources.water = Math.min(999, game.resources.water + dt * 0.18);
      machine.active = true;
    }
    if (machine.type === 'factory' && isPoweredAt(game, machine) && game.resources.mineral >= 1 && game.resources.coal >= 1) {
      machine.progress = (machine.progress || 0) + dt;
      while (machine.progress >= 8 && game.resources.mineral >= 1 && game.resources.coal >= 1) {
        machine.progress -= 8;
        game.resources.mineral -= 1;
        game.resources.coal -= 1;
        game.resources.components = Math.min(99, game.resources.components + 1);
      }
      machine.active = true;
    }
  }
  for (const species of game.species) {
    species.age += dt;
    const def = SPECIES_DEFS[species.type];
    game.ecology.flora = Math.min(100, game.ecology.flora + dt * def.flora);
    game.ecology.biodiversity = Math.min(100, game.ecology.biodiversity + dt * def.bio);
    game.resources.bioenergy = Math.min(999, game.resources.bioenergy + dt * def.bio * 0.15);
  }
  if (game.ecology.water >= 18) game.ecology.soil = Math.min(100, game.ecology.soil + dt * 0.08);
  if (game.ecology.flora >= 16) game.resources.spores = Math.min(30, game.resources.spores + dt * 0.025);
  updateObjective(game);
}

export function getStage(game) {
  const e = game.ecology;
  if (e.flora >= 70 && e.biodiversity >= 60) return 'HARMONY';
  if (e.flora >= 45 && e.biodiversity >= 25) return 'VERDANT';
  if (e.water >= 24 && e.soil >= 22) return 'AWAKENING';
  return 'DORMANT';
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function isPowerProducer(machine, game) {
  return machine.type === 'solar' || (machine.type === 'coalGenerator' && (machine.active || game.resources.coal > 0));
}

function isPoweredAt(game, site, radius = 240) {
  return game.machines.some((machine) => isPowerProducer(machine, game) && distance(machine, site) <= radius);
}

function relayHasGeneration(game, relay) {
  const direct = isPoweredAt(game, relay);
  if (direct) return true;
  for (const link of game.wirelessLinks || []) {
    const otherId = link.a === relay.id ? link.b : link.b === relay.id ? link.a : null;
    if (!otherId) continue;
    const other = game.machines.find((machine) => machine.id === otherId && machine.type === 'relay');
    if (other && isPoweredAt(game, other)) return true;
  }
  return false;
}

export function getLocalSupport(game) {
  const station = game.machines.find((machine) => machine.type === 'waystation' && distance(machine, game.player) <= 115);
  if (!station) return { powered: false, pressurized: false, station: null };
  const direct = isPoweredAt(game, station);
  const networked = game.machines.some((machine) => machine.type === 'relay' && distance(machine, station) <= 190 && relayHasGeneration(game, machine));
  const powered = direct || networked;
  return { powered, pressurized: powered, station };
}

export function updateSurvival(game, seconds, activity = {}) {
  const dt = Math.max(0, Math.min(seconds, 30));
  const moving = Boolean(activity.moving);
  const sprinting = Boolean(activity.sprinting);
  const support = getLocalSupport(game);
  if (support.pressurized) {
    game.player.oxygen = Math.min(100, game.player.oxygen + dt * 4.5);
    game.player.suitPower = Math.min(100, game.player.suitPower + dt * 3.8);
  } else {
    game.player.oxygen = Math.max(0, game.player.oxygen - dt * (moving ? 0.16 : 0.075));
    game.player.suitPower = Math.max(0, game.player.suitPower - dt * (sprinting ? 0.58 : moving ? 0.19 : 0.035));
  }
  if (game.player.oxygen <= 0 || game.player.suitPower <= 0) game.player.health = Math.max(0, game.player.health - dt * 2.5);
  return support;
}

export function linkPowerSites(game, firstId, secondId) {
  if (getStage(game) === 'DORMANT') return { ok: false, reason: 'Aether transmission not unlocked' };
  const first = game.machines.find((machine) => machine.id === firstId && machine.type === 'relay');
  const second = game.machines.find((machine) => machine.id === secondId && machine.type === 'relay');
  if (!first || !second || first.id === second.id) return { ok: false, reason: 'Select two different relays' };
  game.wirelessLinks ||= [];
  if (!game.wirelessLinks.some((link) => [link.a, link.b].includes(first.id) && [link.a, link.b].includes(second.id))) {
    game.wirelessLinks.push({ a: first.id, b: second.id });
  }
  return { ok: true };
}

export function serializeGame(game) {
  return JSON.stringify(game);
}

export function deserializeGame(json) {
  let value;
  try { value = JSON.parse(json); } catch { throw new Error('Invalid save data'); }
  if (!value || value.version !== 1 || !value.player || !value.resources || !Array.isArray(value.nodes)) {
    throw new Error('Invalid save data');
  }
  value.player.oxygen ??= 100;
  value.player.suitPower ??= value.player.energy ?? 100;
  value.player.health ??= 100;
  value.resources.coal ??= 0;
  value.resources.components ??= 0;
  for (const type of ['waystation', 'relay', 'mine', 'coalGenerator', 'pump', 'factory']) value.inventory[type] ??= 0;
  value.wirelessLinks ??= [];
  if (!value.nodes.some((node) => node.kind === 'coal')) {
    value.nodes.push(
      { id: 'coal-migration-1', kind: 'coal', amount: 2, x: 430, y: 330, collected: false },
      { id: 'coal-migration-2', kind: 'coal', amount: 2, x: 1180, y: 590, collected: false },
    );
  }
  if (value.objective?.id === 'moss' && value.machines.some((machine) => machine.type === 'condenser') && !value.machines.some((machine) => machine.type === 'factory')) {
    value.objective = { id: 'mine', text: 'Deploy a Seam Extractor on coal', target: 1 };
    value.journal.push('SYSTEM // Industrial progression added. Coal seams mapped.');
  }
  return value;
}
