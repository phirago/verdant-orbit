import * as THREE from '../vendor/three.module.js';
import {
  createGame, collectNode, craftMachine, placeMachine, addSpecies, advanceWorld,
  updateSurvival, getLocalSupport, linkPowerSites, getStage, serializeGame,
  deserializeGame, getUnlockedSchematics, MACHINE_DEFS, SPECIES_DEFS,
} from './game-state.mjs';
import { facingYawForDirection } from './movement.mjs';

const $ = (selector) => selector.startsWith?.('.') ? document.querySelector(selector) : document.getElementById(selector);
const canvas = $('world');
let game;
try { game = deserializeGame(localStorage.getItem('verdant-orbit-save')); }
catch { game = createGame(7309); }
let started = localStorage.getItem('verdant-orbit-started') === 'yes';
let last = performance.now(), saveTimer = 0, toastTimer, placement = null, tab = 'machines';
let cameraYaw = Math.PI * 0.08, cameraPitch = 0.48, sprinting = false, support = getLocalSupport(game);
let deferredInstallPrompt = null;
const keys = new Set();
const joy = { active: false, x: 0, y: 0, pointer: null };
const entityViews = new Map();

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.6));
renderer.setSize(innerWidth, innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111329);
scene.fog = new THREE.FogExp2(0x17172a, 0.021);
const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.1, 180);
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const clock = new THREE.Clock();

scene.add(new THREE.HemisphereLight(0xb9d9ff, 0x382239, 1.65));
const sun = new THREE.DirectionalLight(0xffd7bd, 2.7);
sun.position.set(-18, 28, 12); sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024); sun.shadow.camera.left = -34; sun.shadow.camera.right = 34;
sun.shadow.camera.top = 25; sun.shadow.camera.bottom = -25; scene.add(sun);
const rim = new THREE.DirectionalLight(0x6bf1d5, 1.1); rim.position.set(18, 9, -16); scene.add(rim);

function hash(n) { return Math.abs(Math.sin(n * 12.9898 + 78.233) * 43758.5453) % 1; }
function terrainHeight(x, z) {
  const basin = -Math.exp(-((x - 4) ** 2 + (z + 1) ** 2) / 95) * 1.2;
  return Math.sin(x * 0.32) * 0.34 + Math.cos(z * 0.48) * 0.25 + Math.sin((x + z) * 0.19) * 0.28 + basin;
}
function worldTo3(x, y) { const px = (x - 800) / 25, pz = (y - 450) / 25; return new THREE.Vector3(px, terrainHeight(px, pz), pz); }
function threeToWorld(point) { return { x: point.x * 25 + 800, y: point.z * 25 + 450 }; }
function material(color, roughness = 0.8, metalness = 0.05, emissive = 0x000000) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive, emissiveIntensity: emissive ? 0.5 : 0 });
}
function mesh(geometry, mat, parent, pos = [0, 0, 0]) {
  const item = new THREE.Mesh(geometry, mat); item.position.set(...pos); item.castShadow = true; item.receiveShadow = true; parent.add(item); return item;
}

const groundGeometry = new THREE.PlaneGeometry(64, 36, 64, 36);
groundGeometry.rotateX(-Math.PI / 2);
const groundPositions = groundGeometry.attributes.position;
for (let i = 0; i < groundPositions.count; i++) groundPositions.setY(i, terrainHeight(groundPositions.getX(i), groundPositions.getZ(i)));
groundGeometry.computeVertexNormals();
const groundColors = new Float32Array(groundPositions.count * 3);
groundGeometry.setAttribute('color', new THREE.BufferAttribute(groundColors, 3));
const groundMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
const ground = new THREE.Mesh(groundGeometry, groundMaterial); ground.receiveShadow = true; scene.add(ground);

const waterMaterial = new THREE.MeshPhysicalMaterial({ color: 0x3ca3bd, transparent: true, opacity: 0, roughness: 0.18, metalness: 0.12, transmission: 0.18, depthWrite: false });
const water = new THREE.Mesh(new THREE.CircleGeometry(10.5, 72), waterMaterial); water.rotation.x = -Math.PI / 2; water.position.set(4, -0.55, -1); scene.add(water);

function updateTerrainColor() {
  const life = game.ecology.flora / 100, moisture = game.ecology.water / 100;
  const barren = new THREE.Color(0x574153), alive = new THREE.Color(0x294d3e), wet = new THREE.Color(0x354754);
  const c = new THREE.Color();
  for (let i = 0; i < groundPositions.count; i++) {
    const x = groundPositions.getX(i), z = groundPositions.getZ(i);
    c.copy(barren).lerp(alive, Math.min(0.88, life * (0.55 + hash(i) * 0.8))).lerp(wet, moisture * 0.18);
    c.offsetHSL(hash(x + z) * 0.025, 0, (hash(i * 2.7) - 0.5) * 0.08);
    groundColors[i * 3] = c.r; groundColors[i * 3 + 1] = c.g; groundColors[i * 3 + 2] = c.b;
  }
  groundGeometry.attributes.color.needsUpdate = true;
  waterMaterial.opacity = Math.min(0.7, game.ecology.water / 55);
  water.scale.setScalar(Math.max(0.03, game.ecology.water / 30));
  const stage = getStage(game);
  scene.background.set(stage === 'HARMONY' ? 0x356478 : stage === 'VERDANT' ? 0x243f5e : 0x111329);
  scene.fog.color.copy(scene.background);
}
updateTerrainColor();

function createStars() {
  const positions = [];
  for (let i = 0; i < 700; i++) {
    const r = 55 + hash(i) * 45, a = hash(i * 3.1) * Math.PI * 2, y = 10 + hash(i * 7.8) * 50;
    positions.push(Math.cos(a) * r, y, Math.sin(a) * r);
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xbcc7ff, size: 0.12, transparent: true, opacity: 0.75 })));
  const planet = mesh(new THREE.SphereGeometry(5.8, 32, 24), material(0x5f507e, 0.9), scene, [25, 31, -54]);
  planet.material.emissive.set(0x17132d); planet.material.emissiveIntensity = 0.5;
}
createStars();

function createAstronaut() {
  const group = new THREE.Group();
  const suit = material(0xe4e6e1, 0.52, 0.12), dark = material(0x17243a, 0.3, 0.48), accent = material(0x72f2c0, 0.35, 0.35, 0x20a47c);
  mesh(new THREE.CapsuleGeometry(0.34, 0.72, 5, 10), suit, group, [0, 1.18, 0]);
  mesh(new THREE.SphereGeometry(0.36, 18, 12), suit, group, [0, 1.9, 0]);
  const visor = mesh(new THREE.SphereGeometry(0.285, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), dark, group, [0, 1.94, -0.16]); visor.rotation.x = -0.25;
  mesh(new THREE.BoxGeometry(0.46, 0.62, 0.25), dark, group, [0, 1.28, 0.31]);
  const lamp = mesh(new THREE.SphereGeometry(0.07, 10, 8), accent, group, [0.24, 1.55, -0.28]);
  const light = new THREE.PointLight(0x65f4ba, 1.2, 5); light.position.copy(lamp.position); group.add(light);
  const limbGeo = new THREE.CapsuleGeometry(0.105, 0.55, 4, 8);
  for (const x of [-0.22, 0.22]) { const leg = mesh(limbGeo, suit, group, [x, 0.45, 0]); leg.name = x < 0 ? 'legL' : 'legR'; }
  for (const x of [-0.46, 0.46]) { const arm = mesh(limbGeo, suit, group, [x, 1.25, 0]); arm.name = x < 0 ? 'armL' : 'armR'; }
  group.scale.setScalar(0.85); scene.add(group); return group;
}
const playerView = createAstronaut();

function createNodeView(node) {
  const group = new THREE.Group(), colors = { mineral: 0xb891ff, water: 0x56d8ff, coal: 0x806a67, spores: 0xffd27b }, color = colors[node.kind];
  const crystalMat = material(color, 0.25, 0.35, color);
  for (let i = 0; i < 3; i++) { const shard = mesh(new THREE.OctahedronGeometry(0.18 + i * 0.05, 0), crystalMat, group, [(i - 1) * 0.22, 0.3 + i * 0.13, 0]); shard.scale.y = 1.8; }
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.48, 0.53, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.48, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04; group.add(ring); group.userData.ring = ring;
  group.position.copy(worldTo3(node.x, node.y)); scene.add(group); return group;
}

function createMachineView(machine) {
  const group = new THREE.Group(), def = MACHINE_DEFS[machine.type], base = material(0x1d2b3a, 0.42, 0.65), glow = material(def.color, 0.3, 0.5, def.color);
  mesh(new THREE.CylinderGeometry(0.62, 0.78, 0.28, 10), base, group, [0, 0.14, 0]);
  if (machine.type === 'solar') {
    const mast = mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.45, 8), base, group, [0, 0.92, 0]);
    for (let i = 0; i < 6; i++) { const panel = mesh(new THREE.BoxGeometry(0.72, 0.06, 0.3), glow, group, [Math.cos(i * Math.PI / 3) * 0.57, 1.58, Math.sin(i * Math.PI / 3) * 0.57]); panel.rotation.y = -i * Math.PI / 3; }
  } else if (machine.type === 'condenser') {
    mesh(new THREE.TorusGeometry(0.55, 0.09, 10, 32), glow, group, [0, 1.05, 0]).rotation.x = Math.PI / 2;
    mesh(new THREE.CylinderGeometry(0.1, 0.18, 1.2, 10), base, group, [0, 0.78, 0]);
  } else if (machine.type === 'nursery') {
    const dome = mesh(new THREE.SphereGeometry(0.7, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), glow, group, [0, 0.26, 0]); dome.material.transparent = true; dome.material.opacity = 0.58;
  } else if (machine.type === 'waystation') {
    mesh(new THREE.CylinderGeometry(0.88, 0.95, 1.55, 10), base, group, [0, 0.88, 0]);
    const windowBand = mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.32, 10), glow, group, [0, 1.15, 0]); windowBand.material.transparent = true; windowBand.material.opacity = 0.72;
    mesh(new THREE.ConeGeometry(0.96, 0.48, 10), base, group, [0, 1.89, 0]);
  } else if (machine.type === 'mine') {
    mesh(new THREE.BoxGeometry(1.15, 0.65, 0.9), base, group, [0, 0.55, 0]);
    const drill = mesh(new THREE.ConeGeometry(0.24, 1.15, 8), glow, group, [0, 0.5, -0.72]); drill.rotation.x = Math.PI / 2;
    mesh(new THREE.BoxGeometry(0.18, 1.2, 0.18), glow, group, [-0.42, 1.1, 0]);
  } else if (machine.type === 'coalGenerator') {
    mesh(new THREE.BoxGeometry(1.35, 1.05, 0.95), base, group, [0, 0.67, 0]);
    for (const x of [-0.38, 0.38]) mesh(new THREE.CylinderGeometry(0.12, 0.18, 1.5, 8), glow, group, [x, 1.45, 0.18]);
  } else if (machine.type === 'pump') {
    mesh(new THREE.CylinderGeometry(0.48, 0.62, 1.15, 10), base, group, [0, 0.7, 0]);
    mesh(new THREE.TorusGeometry(0.42, 0.08, 8, 24), glow, group, [0, 1.35, 0]).rotation.x = Math.PI / 2;
  } else if (machine.type === 'factory') {
    mesh(new THREE.BoxGeometry(1.8, 1.1, 1.25), base, group, [0, 0.68, 0]);
    mesh(new THREE.BoxGeometry(1.45, 0.18, 0.9), glow, group, [0, 1.32, 0]);
    for (const x of [-0.62, 0, 0.62]) mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.52, 8), glow, group, [x, 1.7, 0]);
  } else if (machine.type === 'relay') {
    mesh(new THREE.CylinderGeometry(0.09, 0.17, 2.45, 10), base, group, [0, 1.3, 0]);
    mesh(new THREE.TorusGeometry(0.48, 0.065, 8, 28), glow, group, [0, 2.25, 0]).rotation.x = Math.PI / 2;
    const beacon = new THREE.PointLight(def.color, 1.8, 7); beacon.position.y = 2.25; group.add(beacon);
  }
  const radius = new THREE.Mesh(new THREE.RingGeometry(def.radius / 25 - 0.04, def.radius / 25, 64), new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.18, side: THREE.DoubleSide })); radius.rotation.x = -Math.PI / 2; radius.position.y = 0.06; group.add(radius);
  group.position.copy(worldTo3(machine.x, machine.y)); scene.add(group); return group;
}

function createSpeciesView(species) {
  const group = new THREE.Group(), def = SPECIES_DEFS[species.type], glow = material(def.color, 0.72, 0.02, def.color);
  if (species.type === 'glasswing') {
    const body = mesh(new THREE.CapsuleGeometry(0.05, 0.24, 3, 7), glow, group, [0, 1.1, 0]); body.rotation.z = Math.PI / 2;
    for (const z of [-0.13, 0.13]) { const wing = mesh(new THREE.SphereGeometry(0.22, 10, 6), glow, group, [0, 1.1, z]); wing.scale.set(1.6, 0.12, 0.7); wing.material.transparent = true; wing.material.opacity = 0.65; }
  } else {
    for (let i = 0; i < 12; i++) { const stem = mesh(new THREE.CylinderGeometry(0.015, 0.028, 0.25 + hash(i) * 0.5, 5), glow, group, [(hash(i * 3.2) - .5) * 1.1, 0.2, (hash(i * 7.1) - .5) * 1.1]); stem.rotation.z = (hash(i * 2) - .5) * .3; }
  }
  group.position.copy(worldTo3(species.x, species.y)); scene.add(group); return group;
}

function syncEntities(time) {
  for (const node of game.nodes) {
    const key = `n:${node.id}`; if (node.collected) { if (entityViews.has(key)) { scene.remove(entityViews.get(key)); entityViews.delete(key); } continue; }
    if (!entityViews.has(key)) entityViews.set(key, createNodeView(node));
    const view = entityViews.get(key); view.rotation.y = time * 0.00035 + node.x; view.userData.ring.material.opacity = 0.25 + Math.sin(time * 0.003 + node.x) * 0.15;
  }
  for (const machine of game.machines) { const key = `m:${machine.id}`; if (!entityViews.has(key)) entityViews.set(key, createMachineView(machine)); const view = entityViews.get(key); if (machine.type === 'relay') view.children.forEach((child) => { if (child.geometry?.type === 'TorusGeometry') child.rotation.z = time * 0.001; }); }
  for (const species of game.species) { const key = `s:${species.id}`; if (!entityViews.has(key)) entityViews.set(key, createSpeciesView(species)); const view = entityViews.get(key); if (species.type === 'glasswing') { view.position.y = terrainHeight(view.position.x, view.position.z) + 0.35 + Math.sin(time * 0.003 + species.x) * 0.22; view.position.x += Math.sin(time * 0.001 + species.x) * 0.002; } }
  renderPowerLinks();
}
let linkSignature = '', linkGroup = new THREE.Group(); scene.add(linkGroup);
function renderPowerLinks() {
  const signature = JSON.stringify(game.wirelessLinks || []); if (signature === linkSignature) return; linkSignature = signature; linkGroup.clear();
  for (const link of game.wirelessLinks || []) { const a = game.machines.find(m => m.id === link.a), b = game.machines.find(m => m.id === link.b); if (!a || !b) continue; const pa = worldTo3(a.x, a.y), pb = worldTo3(b.x, b.y), mid = pa.clone().lerp(pb, .5); mid.y += Math.min(10, pa.distanceTo(pb) * .24); const curve = new THREE.QuadraticBezierCurve3(pa.clone().add(new THREE.Vector3(0,2.2,0)), mid, pb.clone().add(new THREE.Vector3(0,2.2,0))); linkGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(40)), new THREE.LineBasicMaterial({ color: 0xff87d2, transparent: true, opacity: .65 }))); }
}

function nearestNode() { let best = null, dist = Infinity; for (const node of game.nodes) { if (node.collected) continue; const d = Math.hypot(game.player.x - node.x, game.player.y - node.y); if (d < dist) { best = node; dist = d; } } return dist < 95 ? best : null; }
function movementInput() {
  const x = (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0) + joy.x;
  const y = (keys.has('ArrowDown') || keys.has('KeyS') ? 1 : 0) - (keys.has('ArrowUp') || keys.has('KeyW') ? 1 : 0) + joy.y;
  return { x, y, moving: Math.hypot(x, y) > 0.08 };
}
function updatePlayer(dt, time) {
  const input = movementInput(), activeSprint = sprinting || keys.has('ShiftLeft') || keys.has('ShiftRight');
  if (input.moving && game.player.suitPower > 0 && game.player.health > 0) {
    const length = Math.max(1, Math.hypot(input.x, input.y)), right = input.x / length, forward = -input.y / length;
    const dx = right * Math.cos(cameraYaw) + forward * -Math.sin(cameraYaw), dz = right * -Math.sin(cameraYaw) + forward * -Math.cos(cameraYaw);
    const speed = activeSprint ? 185 : 112; game.player.x = Math.max(90, Math.min(1510, game.player.x + dx * speed * dt)); game.player.y = Math.max(90, Math.min(810, game.player.y + dz * speed * dt));
    playerView.rotation.y = facingYawForDirection(dx, dz); const stride = Math.sin(time * (activeSprint ? .016 : .011)) * .55;
    playerView.getObjectByName('legL').rotation.x = stride; playerView.getObjectByName('legR').rotation.x = -stride; playerView.getObjectByName('armL').rotation.x = -stride * .7; playerView.getObjectByName('armR').rotation.x = stride * .7;
  } else { for (const name of ['legL','legR','armL','armR']) playerView.getObjectByName(name).rotation.x *= .82; }
  support = updateSurvival(game, dt, { moving: input.moving, sprinting: activeSprint && input.moving });
  const p = worldTo3(game.player.x, game.player.y); playerView.position.lerp(p, .32);
  const distance = 7.4 + cameraPitch * 3.2, height = 3.6 + cameraPitch * 4.6;
  const targetCamera = p.clone().add(new THREE.Vector3(Math.sin(cameraYaw) * distance, height, Math.cos(cameraYaw) * distance)); camera.position.lerp(targetCamera, 1 - Math.pow(.002, dt));
  camera.lookAt(p.x, p.y + 1.05, p.z);
}

function objectiveProgress() {
  const o = game.objective;
  const machineObjectives = { solar:'solar', outpost:'waystation', condenser:'condenser', mine:'mine', generator:'coalGenerator', pump:'pump', factory:'factory' };
  if (o.id === 'gather') return game.resources.mineral / 5;
  if (machineObjectives[o.id]) return game.machines.some((machine) => machine.type === machineObjectives[o.id]) ? 1 : 0;
  if (o.id === 'coal') return game.resources.coal / 2;
  if (o.id === 'waterCycle') return game.ecology.water / 24;
  if (o.id === 'components') return game.resources.components / 2;
  if (o.id === 'moss') return game.species.some((species) => species.type === 'glowmoss') ? 1 : 0;
  if (o.id === 'harmony') return game.ecology.biodiversity / 35;
  return 1;
}
function updateHUD() {
  for (const key of ['mineral','water','coal','components','spores','bioenergy']) $(key).textContent = Math.floor(game.resources[key]);
  $('objective').textContent = game.objective.text; $('objective-bar').style.width = `${Math.min(100, objectiveProgress() * 100)}%`; $('stage').textContent = getStage(game);
  for (const [id,key] of Object.entries({ water:'water',soil:'soil',flora:'flora',life:'biodiversity' })) { const value = Math.floor(game.ecology[key]); $(`${id}-value`).textContent = `${value}%`; $(`${id}-bar`).style.width = `${value}%`; }
  $('oxygen-bar').style.width = `${game.player.oxygen}%`; $('oxygen-value').textContent = Math.floor(game.player.oxygen); $('power-bar').style.width = `${game.player.suitPower}%`; $('power-value').textContent = Math.floor(game.player.suitPower);
  $('.survival')?.classList.toggle('charging', support.pressurized); $('support-status').textContent = support.pressurized ? 'HAVEN LINK // RECHARGING' : game.player.oxygen < 25 ? 'WARNING // OXYGEN CRITICAL' : 'SUIT RESERVES';
  const node = nearestNode(); $('action-button').querySelector('small').textContent = node ? 'COLLECT' : 'SCAN'; $('action-button').querySelector('span').textContent = node ? '◇' : '◎';
}
function showToast(text) { $('toast').textContent = text; $('toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('show'), 1800); }
function save() { localStorage.setItem('verdant-orbit-save', serializeGame(game)); }
function interact() { const node = nearestNode(); if (!node) { showToast('Scanner: no resource in reach'); return; } const result = collectNode(game, node.id); showToast(result.ok ? `+${result.amount} ${result.kind.toUpperCase()}` : result.reason); }

function renderBuildItems() {
  const defs = tab === 'machines' ? MACHINE_DEFS : SPECIES_DEFS;
  const unlocked = new Set(getUnlockedSchematics(game));
  const icons = tab === 'machines' ? { solar:'☀',condenser:'◉',nursery:'✣',waystation:'⌂',mine:'⛏',coalGenerator:'♨',pump:'≋',factory:'▦',relay:'⌁' } : { glowmoss:'✣',emberreed:'♒',glasswing:'◇' };
  const descriptions = { solar:'Basic local generation',waystation:'Safe oxygen and power haven',condenser:'Melts ice and restores the water cycle',mine:'Powered extraction on coal seams',coalGenerator:'Fuelled dependable generation',pump:'Harvests established aquifers',factory:'Converts coal + moonstone into components',nursery:'Powered soil conversion',relay:'Wireless planetary power grid' };
  $('build-items').innerHTML = Object.entries(defs).map(([id, def]) => {
    const cost = Object.entries(def.cost).map(([key,value]) => `${value} ${key}`).join(' · '), count = tab === 'machines' && game.inventory[id] ? ` · READY ${game.inventory[id]}` : '', locked = tab === 'machines' && !unlocked.has(id);
    return `<button class="item${locked ? ' locked' : ''}" data-id="${id}"><span class="item-icon">${icons[id]}</span><strong>${def.name}</strong><small>${locked ? 'SCHEMATIC LOCKED' : tab === 'machines' ? descriptions[id] : 'Native archive species'}</small><em>${cost}${count}</em></button>`;
  }).join('');
  for (const button of $('build-items').querySelectorAll('.item')) button.addEventListener('click', () => selectBuild(button.dataset.id));
}
function closeSheet() { $('build-sheet').classList.remove('open'); $('build-sheet').setAttribute('aria-hidden','true'); }
function selectBuild(id) {
  if (tab === 'machines') { if (game.inventory[id] > 0) { placement = { kind:'machine', id }; closeSheet(); showToast(`Tap terrain to deploy ${MACHINE_DEFS[id].name}`); } else { const result = craftMachine(game,id); showToast(result.ok ? `${MACHINE_DEFS[id].name} fabricated` : result.reason); renderBuildItems(); } }
  else { placement = { kind:'species', id }; closeSheet(); showToast(`Tap suitable terrain to seed ${SPECIES_DEFS[id].name}`); }
}
function placeAt(clientX, clientY) {
  if (!placement) return false; pointer.x = clientX / innerWidth * 2 - 1; pointer.y = -(clientY / innerHeight) * 2 + 1; raycaster.setFromCamera(pointer,camera); const hit = raycaster.intersectObject(ground)[0]; if (!hit) return false;
  const point = threeToWorld(hit.point); const result = placement.kind === 'machine' ? placeMachine(game,placement.id,point.x,point.y) : addSpecies(game,placement.id,point.x,point.y);
  if (result.ok && placement.id === 'relay') { const relays = game.machines.filter(m => m.type === 'relay'); if (relays.length > 1) linkPowerSites(game, relays.at(-2).id, relays.at(-1).id); }
  showToast(result.ok ? 'Deployment confirmed' : result.reason); if (result.ok) placement = null; save(); return true;
}

function animate(now) {
  const dt = Math.min((now - last) / 1000, .05); last = now;
  if (started) { updatePlayer(dt, now); advanceWorld(game, dt * 2); saveTimer += dt; if (saveTimer > 4) { save(); saveTimer = 0; updateTerrainColor(); } }
  syncEntities(now); updateHUD(); renderer.render(scene,camera); requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

function resize() { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.6)); renderer.setSize(innerWidth,innerHeight,false); }
addEventListener('resize',resize);
$('action-button').addEventListener('click',interact); $('build-button').addEventListener('click',()=>{ $('build-sheet').classList.add('open'); $('build-sheet').setAttribute('aria-hidden','false'); renderBuildItems(); }); $('close-build').addEventListener('click',closeSheet);
for (const button of document.querySelectorAll('.tab')) button.addEventListener('click',()=>{ tab=button.dataset.tab; document.querySelectorAll('.tab').forEach(item=>item.classList.toggle('active',item===button)); renderBuildItems(); });
$('menu-button').addEventListener('click',()=>{ $('journal').classList.add('open'); $('journal').setAttribute('aria-hidden','false'); $('journal-entries').innerHTML=game.journal.slice().reverse().map(entry=>`<div class="journal-entry">${entry}</div>`).join(''); }); $('close-journal').addEventListener('click',()=>$('journal').classList.remove('open'));
$('reset-button').addEventListener('click',()=>{ if(confirm('Erase this pathfall and begin again?')) { localStorage.removeItem('verdant-orbit-save'); location.reload(); } });
const installButton = $('install-button');
addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  installButton.classList.add('ready');
  installButton.textContent = 'INSTALL VERDANT ORBIT';
  $('install-help').textContent = 'Installation is ready. Tap the button to confirm with your browser.';
});
installButton.addEventListener('click', async () => {
  if (matchMedia('(display-mode: standalone)').matches || navigator.standalone === true) {
    showToast('Verdant Orbit is already installed');
    return;
  }
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    if (choice.outcome === 'accepted') showToast('Installation accepted');
    deferredInstallPrompt = null;
    installButton.classList.remove('ready');
    return;
  }
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  showToast(isIOS ? 'Tap Share, then Add to Home Screen' : 'Open browser menu, then Install app or Add to Home Screen');
  $('install-help').textContent = isIOS
    ? 'iPhone/iPad: tap the Share icon, scroll down, then choose Add to Home Screen.'
    : 'If no prompt appears, open your browser menu and choose Install app or Add to Home Screen.';
});
addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  installButton.textContent = 'INSTALLED';
  installButton.classList.remove('ready');
  showToast('Verdant Orbit installed');
});
$('start-button').addEventListener('click',()=>{ started=true; localStorage.setItem('verdant-orbit-started','yes'); $('intro').classList.add('hidden'); showToast('ARI VALE // SUIT TELEMETRY ONLINE'); }); if(started) $('intro').classList.add('hidden');
addEventListener('keydown',event=>{ keys.add(event.code); if(event.code==='Space') interact(); }); addEventListener('keyup',event=>keys.delete(event.code));
const sprintButton=$('sprint-button'); const startSprint=event=>{event.preventDefault();sprinting=true;sprintButton.classList.add('active')}, stopSprint=()=>{sprinting=false;sprintButton.classList.remove('active')}; sprintButton.addEventListener('pointerdown',startSprint); sprintButton.addEventListener('pointerup',stopSprint); sprintButton.addEventListener('pointercancel',stopSprint);
const joystick=$('joystick'),stick=$('stick'); function joyMove(event){if(!joy.active||event.pointerId!==joy.pointer)return;const rect=joystick.getBoundingClientRect(),dx=event.clientX-(rect.left+rect.width/2),dy=event.clientY-(rect.top+rect.height/2),length=Math.hypot(dx,dy),max=rect.width*.31,k=Math.min(1,max/Math.max(1,length));joy.x=dx/max*k;joy.y=dy/max*k;stick.style.transform=`translate(${dx*k}px,${dy*k}px)`} joystick.addEventListener('pointerdown',event=>{event.stopPropagation();joy.active=true;joy.pointer=event.pointerId;joystick.setPointerCapture(event.pointerId);joyMove(event)});joystick.addEventListener('pointermove',joyMove);function joyEnd(){joy.active=false;joy.x=joy.y=0;stick.style.transform=''}joystick.addEventListener('pointerup',joyEnd);joystick.addEventListener('pointercancel',joyEnd);
let cameraDrag=null; canvas.addEventListener('pointerdown',event=>{if(placeAt(event.clientX,event.clientY))return;cameraDrag={id:event.pointerId,x:event.clientX,y:event.clientY};canvas.setPointerCapture(event.pointerId)});canvas.addEventListener('pointermove',event=>{if(!cameraDrag||cameraDrag.id!==event.pointerId)return;cameraYaw-=(event.clientX-cameraDrag.x)*.006;cameraPitch=Math.max(.12,Math.min(.9,cameraPitch+(event.clientY-cameraDrag.y)*.004));cameraDrag.x=event.clientX;cameraDrag.y=event.clientY});canvas.addEventListener('pointerup',()=>cameraDrag=null);canvas.addEventListener('pointercancel',()=>cameraDrag=null);
if('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
