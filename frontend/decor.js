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
  const { ctx, texture } = makeCanvas(512, 256);
  ctx.fillStyle = colors[0]; ctx.fillRect(0, 0, 512, 256);
  ctx.fillStyle = colors[1]; ctx.fillRect(14, 14, 484, 228);
  ctx.fillStyle = colors[0]; ctx.fillRect(26, 26, 460, 204);
  const diamond = (cx, cy, w, h, color) => { ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(cx, cy - h); ctx.lineTo(cx + w, cy); ctx.lineTo(cx, cy + h); ctx.lineTo(cx - w, cy); ctx.fill(); };
  for (let i = 0; i < 5; i++) {
    const cx = 70 + i * 93;
    diamond(cx, 128, 38, 70, colors[2]); diamond(cx, 128, 24, 44, colors[3]); diamond(cx, 128, 10, 18, colors[1]);
  }
  ctx.fillStyle = colors[3];
  for (let i = 0; i < 24; i++) { ctx.fillRect(30 + i * 19.5, 34, 8, 8); ctx.fillRect(30 + i * 19.5, 214, 8, 8); }
  ctx.globalAlpha = .08; ctx.fillStyle = '#000';
  for (let i = 0; i < 1600; i++) ctx.fillRect(rand() * 512, rand() * 256, 2, 1);
  texture.needsUpdate = true; return texture;
}
function rug(g, room, rand) {
  const colors = [room.rug1, '#fff5e6', room.wall || room.rug2, room.rug2];
  const m = new THREE.Mesh(new THREE.BoxGeometry(5.2, .025, 2.6), [mat('#e9dccb'), mat('#e9dccb'), new THREE.MeshStandardMaterial({ map:rugTexture(colors, rand), roughness:.95 }), mat('#e9dccb'), mat('#e9dccb'), mat('#e9dccb')]);
  m.position.set(0, .125, .75); m.receiveShadow = true; g.add(m);
}

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
  const top = piece(t, new THREE.SphereGeometry(.07, 12, 8), mat('#ff7a59'), .18, .95, .18);
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
    if (!room.gold) rug(g, room, rand);
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
