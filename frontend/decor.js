// MyOffice · live decor: rug, posters, plants, desk lamp, cat props (procedural, no external files)
import * as THREE from 'three';

const CACHE = new Map();
const mat = (color, extra = {}) => {
  const k = color + JSON.stringify(extra);
  if (!CACHE.has(k)) CACHE.set(k, new THREE.MeshStandardMaterial({ color, roughness:.85, ...extra }));
  return CACHE.get(k);
};
function piece(g, geometry, m, x, y, z, shadow = true) {
  const p = new THREE.Mesh(geometry, m); p.position.set(x, y, z);
  p.castShadow = shadow; p.receiveShadow = true; g.add(p); return p;
}
function makeCanvas(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return { ctx:c.getContext('2d'), texture:t };
}
// small deterministic random: every room looks the same on every load
function seed(s) { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507)) >>> 0) / 4294967296; }

/* ---------- rug ---------- */
function rugTexture(colors, rand) {
  // plain soft rug with rounded corners (transparent outside), a cream binding and a thin inner line
  const { ctx, texture } = makeCanvas(512, 256);
  const rr = (x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };
  ctx.fillStyle = '#efe3d0'; rr(0, 0, 512, 256, 34); ctx.fill();            // binding
  ctx.save(); rr(7, 7, 498, 242, 28); ctx.clip();
  ctx.fillStyle = colors[0]; ctx.fillRect(0, 0, 512, 256);
  ctx.globalAlpha = .07; ctx.fillStyle = '#000';
  for (let i = 0; i < 1800; i++) ctx.fillRect(rand() * 512, rand() * 256, 2, 1);
  ctx.globalAlpha = .06; ctx.fillStyle = '#fff';
  for (let i = 0; i < 900; i++) ctx.fillRect(rand() * 512, rand() * 256, 1, 2);
  ctx.restore();
  ctx.globalAlpha = .75; ctx.strokeStyle = colors[1]; ctx.lineWidth = 4; rr(24, 24, 464, 208, 20); ctx.stroke();
  ctx.globalAlpha = 1;
  texture.needsUpdate = true; return texture;
}
function rug(g, room, rand, [rw, rd, rz] = [5.0, 2.5, .75], palette = null) {
  const colors = palette || [room.rug1, '#fff5e6', room.wall || room.rug2, room.rug2];
  const m = new THREE.Mesh(new THREE.PlaneGeometry(rw, rd), new THREE.MeshStandardMaterial({ map:rugTexture(colors, rand), roughness:.95, transparent:true, alphaTest:.5 }));
  m.rotation.x = -Math.PI / 2; m.position.set(0, .138, rz); m.receiveShadow = true; g.add(m);
}

/* ---------- floor: wood planks (the room colour tints the map) ---------- */
function floorPlanks(room, rand) {
  const { ctx, texture } = makeCanvas(512, 512);
  const rows = 8, h = 512 / rows;
  for (let r = 0; r < rows; r++) {
    for (let x = -rand() * 220; x < 512;) {
      const len = 170 + rand() * 240, v = 226 + Math.floor(rand() * 20);
      ctx.fillStyle = `rgb(${v},${v - 7},${v - 18})`; ctx.fillRect(x, r * h, len, h);
      ctx.fillStyle = 'rgba(95,65,35,.05)';
      for (let i = 0; i < 16; i++) ctx.fillRect(x + rand() * len, r * h + 3 + rand() * (h - 6), 24 + rand() * 70, 1.5);
      ctx.fillStyle = 'rgba(85,58,30,.26)'; ctx.fillRect(x, r * h, 2, h);   // butt seam
      x += len;
    }
    ctx.fillStyle = 'rgba(85,58,30,.3)'; ctx.fillRect(0, r * h, 512, 2);    // plank edge
  }
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(room.w / 4.4, room.d / 4.4);
  texture.needsUpdate = true; return texture;
}

/* ---------- walls: baseboard, wainscot, window, live wall clock ---------- */
const skyTexture = (() => {
  const { ctx, texture } = makeCanvas(128, 128);
  const g = ctx.createLinearGradient(0, 0, 0, 128); g.addColorStop(0, '#8fc7ee'); g.addColorStop(.7, '#d8eefb'); g.addColorStop(1, '#fff3d6');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = 'rgba(255,255,255,.85)';
  [[34, 40, 22], [52, 38, 16], [92, 62, 18], [106, 60, 12]].forEach(([x, y, r]) => { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); });
  texture.needsUpdate = true; return texture;
})();
const slab = (g, w, h, d, material, x, y, z, shadow = false) => piece(g, new THREE.BoxGeometry(w, h, d), material, x, y, z, shadow);
const clocks = [];
function wallDetails(g, room) {
  const T = .24, wall = new THREE.Color(room.wall);
  const panel = mat('#' + wall.clone().lerp(new THREE.Color('#ffffff'), .42).getHexString());
  const trim = mat('#fff6e8', { roughness:.6 });
  const BW = room.baseW ?? room.w, BD = room.baseD ?? room.d, w = room.w, d = room.d;
  const backZ = -BD / 2 + T, leftX = -BW / 2 + T;
  // back wall
  slab(g, w - T, 1.0, .05, panel, T / 2, .6, backZ + .025);
  slab(g, w - T, .07, .09, trim, T / 2, 1.13, backZ + .045);
  slab(g, w - T, .17, .07, trim, T / 2, .19, backZ + .035);
  // left wall
  slab(g, .05, 1.0, d - T, panel, leftX + .025, .6, T / 2);
  slab(g, .09, .07, d - T, trim, leftX + .045, 1.13, T / 2);
  slab(g, .07, .17, d - T, trim, leftX + .035, .19, T / 2);
  // window on the left wall
  const wz = -2.55, wy = 1.75;
  slab(g, .08, 1.45, 1.6, trim, leftX + .04, wy, wz);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.34, 1.2), new THREE.MeshBasicMaterial({ map:skyTexture, toneMapped:false }));
  glass.rotation.y = Math.PI / 2; glass.position.set(leftX + .09, wy, wz); g.add(glass);
  slab(g, .06, 1.2, .05, trim, leftX + .1, wy, wz); slab(g, .06, .05, 1.34, trim, leftX + .1, wy, wz);
  slab(g, .2, .06, 1.8, trim, leftX + .1, wy - .76, wz, true);
  // wall clock on the back wall, shows the real time
  const { ctx, texture } = makeCanvas(128, 128);
  const face = new THREE.Mesh(new THREE.CircleGeometry(.27, 32), new THREE.MeshBasicMaterial({ map:texture, toneMapped:false }));
  face.position.set(BW / 2 - 1.5, 2.15, backZ + .075); g.add(face);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(.28, .03, 8, 32), trim); rim.position.copy(face.position); rim.position.z -= .005; g.add(rim);
  clocks.push({ ctx, texture });
}
function drawClock({ ctx, texture }, date = new Date()) {
  ctx.fillStyle = '#fffaf0'; ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = '#5b4e43'; ctx.lineCap = 'round';
  for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283; ctx.lineWidth = i % 3 ? 3 : 6; ctx.beginPath(); ctx.moveTo(64 + Math.sin(a) * 50, 64 - Math.cos(a) * 50); ctx.lineTo(64 + Math.sin(a) * 58, 64 - Math.cos(a) * 58); ctx.stroke(); }
  const hand = (a, len, width, color) => { ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath(); ctx.moveTo(64, 64); ctx.lineTo(64 + Math.sin(a) * len, 64 - Math.cos(a) * len); ctx.stroke(); };
  const m = date.getMinutes(), h = date.getHours() % 12;
  hand((h + m / 60) / 12 * 6.283, 28, 7, '#3b342c'); hand(m / 60 * 6.283, 42, 5, '#3b342c');
  ctx.fillStyle = '#e0522b'; ctx.beginPath(); ctx.arc(64, 64, 5, 0, 7); ctx.fill();
  texture.needsUpdate = true;
}
setInterval(() => clocks.forEach(c => drawClock(c)), 30000);

/* ---------- poster ---------- */
const POSTERS = [
  (x, a, b) => { x.fillStyle = a; x.fillRect(0, 0, 200, 260); x.fillStyle = '#fff5e6'; x.beginPath(); x.arc(100, 120, 62, 0, 7); x.fill(); x.fillStyle = b; [0, 1, 2].forEach(i => x.fillRect(30, 200 + i * 14, 140, 7)); },
  (x, a, b) => { x.fillStyle = '#fff5e6'; x.fillRect(0, 0, 200, 260); x.fillStyle = a; x.beginPath(); x.moveTo(40, 190); x.lineTo(55, 70); x.lineTo(85, 110); x.lineTo(115, 110); x.lineTo(145, 70); x.lineTo(160, 190); x.closePath(); x.fill();
    x.fillStyle = '#fff5e6'; [[80, 140], [120, 140]].forEach(([cx, cy]) => { x.beginPath(); x.arc(cx, cy, 9, 0, 7); x.fill(); }); x.fillStyle = b; x.font = '700 28px sans-serif'; x.textAlign = 'center'; x.fillText('MEOW', 100, 238); },
  (x, a, b) => { x.fillStyle = b; x.fillRect(0, 0, 200, 260); for (let i = 0; i < 6; i++) { x.fillStyle = i % 2 ? a : '#fff5e6'; x.beginPath(); x.arc(100, 260, 210 - i * 34, Math.PI, 0); x.fill(); } },
  (x, a, b) => { x.fillStyle = '#fff5e6'; x.fillRect(0, 0, 200, 260); x.fillStyle = a; x.fillRect(20, 20, 75, 105); x.fillStyle = b; x.fillRect(105, 20, 75, 105); x.fillStyle = b; x.fillRect(20, 135, 75, 105); x.fillStyle = a; x.beginPath(); x.arc(142, 187, 36, 0, 7); x.fill(); },
];
function poster(g, x, y, z, ry, type, a, b) {
  const { ctx, texture } = makeCanvas(200, 260);
  POSTERS[type % POSTERS.length](ctx, a, b); texture.needsUpdate = true;
  const p = new THREE.Group(); p.position.set(x, y, z); p.rotation.y = ry; g.add(p);
  piece(p, new THREE.BoxGeometry(.86, 1.1, .04), mat('#4a3f35'), 0, 0, 0, false);
  piece(p, new THREE.PlaneGeometry(.74, .96), new THREE.MeshStandardMaterial({ map:texture, roughness:.7 }), 0, 0, .025, false);
}

/* ---------- plant (different heights) ---------- */
const LEAVES = ['#6fae5c', '#82c06a', '#5d9a55', '#9ccc6b'];
function plant(g, x, z, height, rand, pot) {
  const s = new THREE.Group(); s.position.set(x, .12, z); g.add(s);
  piece(s, new THREE.CylinderGeometry(.22 * height, .17 * height, .36 * height, 18), mat(pot), 0, .18 * height, 0);
  if (height > 1.2) { // tall: trunk + crown
    piece(s, new THREE.CylinderGeometry(.03, .04, 1.1 * height, 6), mat('#7a5a3a'), 0, .9 * height, 0);
    for (let i = 0; i < 7; i++) {
      const y = (1.1 + rand() * .7) * height, a = rand() * 6.28;
      const leaf = piece(s, new THREE.IcosahedronGeometry((.2 + rand() * .14) * height, 0), mat(LEAVES[i % 4], { flatShading:true }), Math.cos(a) * .22 * height, y, Math.sin(a) * .22 * height);
      leaf.scale.y = .8;
    }
  } else { // short: spreading leaves
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * 6.28 + rand() * .3;
      const y = piece(s, new THREE.SphereGeometry(.13 * height, 8, 6), mat(LEAVES[i % 4], { flatShading:true }), Math.cos(a) * .2 * height, (.42 + rand() * .3) * height, Math.sin(a) * .2 * height);
      y.scale.set(.6, 1.4, .6); y.rotation.set(Math.sin(a) * .6, 0, -Math.cos(a) * .6);
    }
  }
}

/* ---------- cat props ---------- */
function catBed(g, x, z, color) {
  const y = new THREE.Group(); y.position.set(x, .13, z); g.add(y);
  piece(y, new THREE.TorusGeometry(.36, .13, 12, 28), mat(color, { roughness:.95 }), 0, .1, 0).rotation.x = Math.PI / 2;
  piece(y, new THREE.CylinderGeometry(.34, .34, .08, 24), mat('#fff3e2', { roughness:.95 }), 0, .05, 0);
}
function foodBowl(g, x, z, color) {
  const k = new THREE.Group(); k.position.set(x, .13, z); g.add(k);
  piece(k, new THREE.CylinderGeometry(.2, .15, .1, 20), mat(color, { roughness:.4 }), 0, .05, 0);
  for (let i = 0; i < 10; i++) piece(k, new THREE.SphereGeometry(.035, 6, 4), mat('#b9824a'), (Math.random() - .5) * .2, .11, (Math.random() - .5) * .2, false);
}
function scratchingPost(g, x, z, color) {
  const t = new THREE.Group(); t.position.set(x, .12, z); g.add(t);
  piece(t, new THREE.BoxGeometry(.7, .08, .7), mat(color), 0, .04, 0);
  piece(t, new THREE.CylinderGeometry(.1, .1, 1.1, 14), mat('#d8bf8f', { roughness:1 }), 0, .63, 0);
  piece(t, new THREE.BoxGeometry(.55, .07, .55), mat(color), 0, 1.2, 0);
  const top = piece(t, new THREE.SphereGeometry(.07, 12, 8), mat('#e0522b'), .18, .95, .18);
  piece(t, new THREE.CylinderGeometry(.006, .006, .26, 4), mat('#6d5a48'), .18, 1.09, .18, false);
  return top;
}
function yarnBall(g, x, z, color) {
  const { ctx, texture } = makeCanvas(128, 64);
  ctx.fillStyle = color; ctx.fillRect(0, 0, 128, 64); ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 2;
  for (let i = 0; i < 18; i++) { ctx.beginPath(); ctx.moveTo(i * 9, 0); ctx.lineTo(i * 9 + 30, 64); ctx.stroke(); }
  texture.needsUpdate = true;
  const y = new THREE.Group(); y.position.set(x, 0, z); g.add(y);
  piece(y, new THREE.SphereGeometry(.14, 16, 12), new THREE.MeshStandardMaterial({ map:texture, roughness:1 }), 0, .26, 0);
  const thread = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(.1, .14, 0), new THREE.Vector3(.4, .13, .2), new THREE.Vector3(.7, .13, -.1)]), 20, .01, 4), mat(color));
  y.add(thread);
}

/* ---------- setup ---------- */
const PROPS = [catBed, foodBowl, scratchingPost, yarnBall];
export function setupDecor(rooms) {
  rooms.forEach((room, i) => {
    const g = room.group; if (!g) return;
    const rand = seed(room.id);
    const wall = room.wall || room.rug1; // the glass CEO room has no wall
    if (room.glass) rug(g, room, rand, [7.4, 4.4, .35], ['#e59a7c', '#f3d98e']);   // executive rug: the desk sits in the middle
    else if (!room.gold) rug(g, room, rand);
    if (room.floorMesh) { room.floorMesh.material.map = floorPlanks(room, rand); room.floorMesh.material.roughness = .8; room.floorMesh.material.needsUpdate = true; }
    if (room.glass) ceoSuite(g, room);
    else { wallDetails(g, room); drawClock(clocks[clocks.length - 1]); }
    const W = (room.baseW ?? room.w) / 2, D = (room.baseD ?? room.d) / 2; // base size; index.html pushes props to the edge in a wider room
    if (!room.glass) {
      // two frames on the left wall
      poster(g, -W + .27, 1.65, -.9, Math.PI / 2, i, room.wall, room.rug2);
      poster(g, -W + .27, 1.5, .5, Math.PI / 2, i + 1, room.rug2, room.wall);
    }
    // plants: one tall, one short
    const pot = ['#e9805f', '#f2c14e', '#7fb5dc', '#b39ae6', '#fff5e6'][i % 5];
    plant(g, W - .7, D - 1.0, 1.5, rand, pot);
    plant(g, -W + .8, D - 1.4, .9, rand, '#fff5e6');
    // two cat props per room
    const a = PROPS[i % 4], b = PROPS[(i + 2) % 4];
    a(g, 2.3, 1.75, room.rug2); b(g, -2.4, 1.6, wall);
  });
}
// desk lamps: lit, warm light
const SHADE = new THREE.MeshStandardMaterial({ color:'#fff1cf', emissive:'#ffc46b', emissiveIntensity:1.4, roughness:.6, side:THREE.DoubleSide });
export function deskLamp(g, x = .8, z = .55) {
  const l = new THREE.Group(); l.position.set(x, .86, z); g.add(l);
  piece(l, new THREE.CylinderGeometry(.09, .1, .03, 16), mat('#3d352e'), 0, .015, 0);
  piece(l, new THREE.CylinderGeometry(.012, .012, .42, 6), mat('#3d352e'), 0, .23, 0);
  piece(l, new THREE.ConeGeometry(.16, .18, 18, 1, true), SHADE, 0, .46, 0);
  const light = new THREE.Mesh(new THREE.CircleGeometry(.3, 20), new THREE.MeshBasicMaterial({ color:'#ffd27f', transparent:true, opacity:.35, depthWrite:false }));
  light.rotation.x = -Math.PI / 2; light.position.y = .006; l.add(light);
}

// one small prop per species so each animal reads from the default camera distance (agent group: desk top y≈.86)
export function speciesProp(g, species) {
  const p = new THREE.Group(); g.add(p);
  if (species === 'owl') { // wooden perch with a book stack
    p.position.set(.5, .9, .72);
    piece(p, new THREE.CylinderGeometry(.1, .12, .04, 14), mat('#8a6a48'), 0, .02, 0);
    piece(p, new THREE.CylinderGeometry(.018, .018, .36, 8), mat('#8a6a48'), 0, .2, 0);
    const bar = piece(p, new THREE.CylinderGeometry(.02, .02, .34, 8), mat('#a07c52'), 0, .38, 0); bar.rotation.z = Math.PI / 2;
    [['#e07a3a', .02], ['#4f7fb5', .06]].forEach(([c, y], i) => piece(p, new THREE.BoxGeometry(.2 - i * .03, .035, .14), mat(c), -.3, y, .02));
  } else if (species === 'raven') { // shiny things on a tray
    p.position.set(.5, .9, .75);
    piece(p, new THREE.CylinderGeometry(.14, .12, .02, 18), mat('#6d6258'), 0, .01, 0);
    const gold = mat('#e2b54a', { metalness:.85, roughness:.25 });
    [[-.05, .03], [.04, -.02], [.0, .06]].forEach(([x, z], i) => { const c = piece(p, new THREE.CylinderGeometry(.035, .035, .01, 14), gold, x, .028 + i * .008, z); c.rotation.x = .15 * i; });
    piece(p, new THREE.TorusGeometry(.03, .008, 6, 14), mat('#c9d4dc', { metalness:.9, roughness:.2 }), .08, .035, -.05).rotation.x = Math.PI / 2;
  } else if (species === 'kangal') { // water bowl on the floor
    p.position.set(-1.25, 0, .95);
    piece(p, new THREE.CylinderGeometry(.2, .15, .1, 20), mat('#8d9aa6', { metalness:.5, roughness:.35 }), 0, .06, 0);
    piece(p, new THREE.CylinderGeometry(.17, .17, .01, 20), mat('#8fc9e8', { roughness:.1 }), 0, .1, 0, false);
  } else if (species === 'fox') { // a red ball to chase
    p.position.set(-1.2, 0, .95);
    piece(p, new THREE.SphereGeometry(.13, 16, 12), mat('#d9503a', { roughness:.6 }), 0, .14, 0);
    const band = piece(p, new THREE.TorusGeometry(.13, .012, 6, 20), mat('#fff3e2'), 0, .14, 0, false); band.rotation.x = Math.PI / 2;
  }
}

/* ---------- CEO suite: gold floor inlay, credenza with trophy and globe, coffee table, floor lamp ---------- */
function ceoSuite(g, room) {
  const gold = mat('#d6ad52', { metalness:.65, roughness:.32 });
  const W = room.w / 2, D = room.d / 2, inset = .45;
  slab(g, room.w - inset * 2, .012, .05, gold, 0, .141, -D + inset);
  slab(g, room.w - inset * 2, .012, .05, gold, 0, .141, D - inset);
  [-1, 1].forEach(sx => slab(g, .05, .012, room.d - inset * 2, gold, sx * (W - inset), .141, 0));
  // credenza along the back glass, left of the desk
  const wood = mat('#8a6a48', { roughness:.55 }), cream = mat('#efe4d6');
  const cr = new THREE.Group(); cr.position.set(-7.4, .12, -3.45); g.add(cr);
  slab(cr, 3.4, .72, .7, wood, 0, .38, 0, true);
  slab(cr, 3.46, .05, .76, cream, 0, .76, 0, true);
  [-1.1, 0, 1.1].forEach(x => slab(cr, .9, .5, .02, mat('#7a5c3c'), x, .38, .36));
  const trophy = new THREE.Group(); trophy.position.set(-1.1, .8, 0); cr.add(trophy);
  piece(trophy, new THREE.CylinderGeometry(.12, .14, .06, 16), cream, 0, .03, 0);
  piece(trophy, new THREE.CylinderGeometry(.03, .03, .22, 8), gold, 0, .17, 0);
  piece(trophy, new THREE.CylinderGeometry(.14, .06, .2, 16, 1, true), gold, 0, .38, 0);
  const globe = new THREE.Group(); globe.position.set(0, .8, 0); cr.add(globe);
  piece(globe, new THREE.CylinderGeometry(.14, .16, .04, 16), wood, 0, .02, 0);
  piece(globe, new THREE.SphereGeometry(.24, 20, 14), mat('#8fb8d6', { roughness:.4 }), 0, .3, 0);
  const ring = piece(globe, new THREE.TorusGeometry(.27, .012, 6, 28), gold, 0, .3, 0, false); ring.rotation.set(.3, 0, .35);
  [['#e07a3a', .1], ['#4f7fb5', .06], ['#d6ad52', .1]].forEach(([c, h], i) => slab(cr, .5 - i * .06, h, .26, mat(c), 1.05 + i * .06, .78 + h / 2, 0, true));
  // coffee table in front of the sofa
  const t = new THREE.Group(); t.position.set(-8.4, .12, .35); g.add(t);
  piece(t, new THREE.CylinderGeometry(.62, .62, .06, 32), cream, 0, .42, 0);
  piece(t, new THREE.CylinderGeometry(.06, .22, .4, 16), mat('#d8cdbd'), 0, .2, 0);
  piece(t, new THREE.CylinderGeometry(.06, .05, .09, 14), mat('#fff5e6'), .2, .52, .05);
  slab(t, .3, .035, .22, mat('#4f7fb5'), -.15, .475, -.1, true);
  // standing floor lamp beside the sofa
  const lamp = new THREE.Group(); lamp.position.set(-10.0, .12, 1.0); g.add(lamp);
  piece(lamp, new THREE.CylinderGeometry(.16, .18, .04, 18), mat('#3d352e'), 0, .02, 0);
  piece(lamp, new THREE.CylinderGeometry(.015, .015, 1.55, 6), gold, 0, .8, 0, false);
  piece(lamp, new THREE.CylinderGeometry(.18, .28, .32, 20, 1, true), SHADE, 0, 1.68, 0, false);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(.9, 28), new THREE.MeshBasicMaterial({ color:'#ffd27f', transparent:true, opacity:.16, depthWrite:false }));
  pool.rotation.x = -Math.PI / 2; pool.position.set(0, .02, 0); lamp.add(pool);
}
