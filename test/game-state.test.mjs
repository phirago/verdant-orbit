import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame,
  collectNode,
  craftMachine,
  placeMachine,
  advanceWorld,
  addSpecies,
  getStage,
  serializeGame,
  deserializeGame,
  updateSurvival,
  getLocalSupport,
  linkPowerSites,
  getUnlockedSchematics,
} from '../src/game-state.mjs';

test('new game starts with a playable restoration objective', () => {
  const game = createGame(7);
  assert.equal(game.resources.mineral, 0);
  assert.equal(game.resources.water, 0);
  assert.equal(game.objective.id, 'gather');
  assert.equal(getStage(game), 'DORMANT');
  assert.ok(game.nodes.length >= 8);
});

test('opening objectives establish local power and a safe outpost before terraforming', () => {
  const game = createGame(7);
  for (const node of game.nodes.filter((item) => item.kind === 'mineral').slice(0, 3)) {
    game.player.x = node.x;
    game.player.y = node.y;
    collectNode(game, node.id);
  }
  assert.equal(game.objective.id, 'solar');
  game.inventory.solar = 1;
  placeMachine(game, 'solar', 800, 650);
  assert.equal(game.objective.id, 'outpost');
  game.inventory.waystation = 1;
  placeMachine(game, 'waystation', 830, 650);
  assert.equal(game.objective.id, 'condenser');
});

test('collecting a nearby node grants its resource once', () => {
  const game = createGame(7);
  const node = game.nodes[0];
  game.player.x = node.x;
  game.player.y = node.y;
  const first = collectNode(game, node.id);
  const second = collectNode(game, node.id);
  assert.equal(first.ok, true);
  assert.equal(second.ok, false);
  assert.equal(game.resources[node.kind], node.amount);
});

test('crafting and placing a condenser consumes materials and creates water influence', () => {
  const game = createGame(7);
  game.resources.mineral = 12;
  const crafted = craftMachine(game, 'condenser');
  assert.equal(crafted.ok, true);
  assert.equal(game.inventory.condenser, 1);
  const placed = placeMachine(game, 'condenser', 900, 500);
  assert.equal(placed.ok, true);
  assert.equal(game.inventory.condenser, 0);
  advanceWorld(game, 10);
  assert.ok(game.ecology.water > 0);
});

test('species require habitat conditions and produce biodiversity when suitable', () => {
  const game = createGame(7);
  game.resources.spores = 5;
  let result = addSpecies(game, 'glowmoss', 800, 500);
  assert.equal(result.ok, false);
  game.ecology.water = 28;
  game.ecology.soil = 24;
  result = addSpecies(game, 'glowmoss', 800, 500);
  assert.equal(result.ok, true);
  advanceWorld(game, 12);
  assert.ok(game.ecology.biodiversity > 0);
});

test('restoration stages advance from ecology values', () => {
  const game = createGame(7);
  game.ecology.water = 30;
  game.ecology.soil = 28;
  assert.equal(getStage(game), 'AWAKENING');
  game.ecology.flora = 52;
  game.ecology.biodiversity = 32;
  assert.equal(getStage(game), 'VERDANT');
  game.ecology.flora = 78;
  game.ecology.biodiversity = 72;
  assert.equal(getStage(game), 'HARMONY');
});

test('save data round-trips and malformed data is rejected', () => {
  const game = createGame(19);
  game.resources.mineral = 14;
  const restored = deserializeGame(serializeGame(game));
  assert.equal(restored.seed, 19);
  assert.equal(restored.resources.mineral, 14);
  assert.throws(() => deserializeGame('{"oops":true}'), /Invalid save/);
});

test('pre-industry saves migrate onto the new mining progression', () => {
  const game = createGame(19);
  game.objective = { id: 'moss', text: 'Seed Glow Moss', target: 1 };
  game.machines.push({ id: 'old-condenser', type: 'condenser', x: 800, y: 500 });
  const restored = deserializeGame(serializeGame(game));
  assert.equal(restored.objective.id, 'mine');
  assert.ok(restored.nodes.some((node) => node.kind === 'coal'));
});

test('human pathfinder expends oxygen and suit power while traversing', () => {
  const game = createGame(7);
  assert.equal(game.player.oxygen, 100);
  assert.equal(game.player.suitPower, 100);
  updateSurvival(game, 10, { moving: true, sprinting: false });
  assert.ok(game.player.oxygen < 99);
  assert.ok(game.player.suitPower < 99);
  const afterWalking = game.player.suitPower;
  updateSurvival(game, 10, { moving: true, sprinting: true });
  assert.ok(game.player.suitPower < afterWalking - 2);
});

test('a powered waystation replenishes oxygen and suit power nearby', () => {
  const game = createGame(7);
  game.player.oxygen = 30;
  game.player.suitPower = 25;
  game.machines.push({ id: 'solar-a', type: 'solar', x: 800, y: 670 });
  game.machines.push({ id: 'station-a', type: 'waystation', x: 820, y: 670 });
  assert.equal(getLocalSupport(game).pressurized, true);
  updateSurvival(game, 10, { moving: false, sprinting: false });
  assert.ok(game.player.oxygen > 30);
  assert.ok(game.player.suitPower > 25);
});

test('wireless relays link a remote outpost to a producing power site midgame', () => {
  const game = createGame(7);
  game.ecology.water = 30;
  game.ecology.soil = 25;
  game.machines.push({ id: 'solar-a', type: 'solar', x: 250, y: 250 });
  game.machines.push({ id: 'relay-a', type: 'relay', x: 300, y: 250 });
  game.machines.push({ id: 'relay-b', type: 'relay', x: 1200, y: 650 });
  game.machines.push({ id: 'station-b', type: 'waystation', x: 1250, y: 650 });
  const linked = linkPowerSites(game, 'relay-a', 'relay-b');
  assert.equal(linked.ok, true);
  game.player.x = 1250;
  game.player.y = 650;
  assert.equal(getLocalSupport(game).powered, true);
});

test('schematics unlock through an extraction and factory production chain', () => {
  const game = createGame(7);
  assert.deepEqual(getUnlockedSchematics(game), ['solar', 'waystation', 'condenser']);
  game.machines.push({ id: 'condenser-a', type: 'condenser', x: 800, y: 500 });
  assert.ok(getUnlockedSchematics(game).includes('mine'));
  game.resources.coal = 2;
  assert.ok(getUnlockedSchematics(game).includes('coalGenerator'));
  game.ecology.water = 24;
  assert.ok(getUnlockedSchematics(game).includes('pump'));
  game.machines.push({ id: 'generator-a', type: 'coalGenerator', x: 700, y: 500 });
  game.machines.push({ id: 'pump-a', type: 'pump', x: 850, y: 500 });
  assert.ok(getUnlockedSchematics(game).includes('factory'));
  game.resources.components = 2;
  game.ecology.soil = 22;
  assert.ok(getUnlockedSchematics(game).includes('relay'));
});

test('a powered mine on a coal seam extracts coal', () => {
  const game = createGame(7);
  const seam = game.nodes.find((node) => node.kind === 'coal');
  assert.ok(seam);
  game.inventory.mine = 1;
  assert.equal(placeMachine(game, 'mine', 800, 500).ok, false);
  assert.equal(placeMachine(game, 'mine', seam.x, seam.y).ok, true);
  game.machines.push({ id: 'solar-mine', type: 'solar', x: seam.x + 40, y: seam.y });
  advanceWorld(game, 20);
  assert.ok(game.resources.coal > 0);
});

test('water pumps require a restored water cycle and factories produce components', () => {
  const game = createGame(7);
  game.inventory.pump = 1;
  assert.equal(placeMachine(game, 'pump', 800, 500).ok, false);
  game.ecology.water = 25;
  assert.equal(placeMachine(game, 'pump', 800, 500).ok, true);
  game.machines.push({ id: 'solar-pump', type: 'solar', x: 820, y: 500 });
  const waterBefore = game.resources.water;
  advanceWorld(game, 10);
  assert.ok(game.resources.water > waterBefore);

  game.machines.push({ id: 'factory-a', type: 'factory', x: 830, y: 500, progress: 0 });
  game.resources.mineral = 3;
  game.resources.coal = 3;
  advanceWorld(game, 20);
  assert.ok(game.resources.components >= 1);
});
