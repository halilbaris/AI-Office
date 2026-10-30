// MyOffice · procedural 3D cat (no external models or textures)
// createCat({ pattern, tone, kitten, accessory }) → { group, nodes, setStatus, update, setMeme, setOutline }
// Coordinates: root = top of the chair seat; the cat looks toward +z (same frame as the robot).
import * as THREE from 'three';

export const PATTERNS = {
  'tabby':     { body:'#c98a4b', stripe:'#6a4326', belly:'#f2dfc4', muzzle:'#f5e7d2', cheek:'#d9a571', paw:'#f0dcc2', ear:'#b97a40', tail:'#c98a4b', eye:'#9cc24a', whisker:'#fffaf0', nose:'#d98583', inner:'#f0a8a6', striped:1 },
  'grey-tabby': { body:'#9b9893', stripe:'#4a4744', belly:'#ebe7df', muzzle:'#f0ece5', cheek:'#b5b2ad', paw:'#e6e2da', ear:'#8a8783', tail:'#9b9893', eye:'#d9b23e', whisker:'#fffaf0', nose:'#c98a8c', inner:'#eaa6a8', striped:1 },
  'ginger':    { body:'#e49a50', stripe:'#bf6c2c', belly:'#f7dfbb', muzzle:'#f9e9d2', cheek:'#efb072', paw:'#f6d9b0', ear:'#d98a42', tail:'#e49a50', eye:'#a8c84a', whisker:'#fffaf0', nose:'#e08c86', inner:'#f2aaa4', striped:.55 },
  'black':     { body:'#2b2828', belly:'#322e2e', muzzle:'#3a3434', cheek:'#302c2c', paw:'#2b2828', ear:'#2b2828', tail:'#2b2828', eye:'#dcc43a', whisker:'#f4f1ea', nose:'#b9767c', inner:'#8a5e62' },
  'tuxedo':    { body:'#272424', belly:'#f8f5ef', muzzle:'#f8f5ef', cheek:'#f8f5ef', paw:'#f8f5ef', ear:'#272424', tail:'#272424', eye:'#b9cd3e', whisker:'#fffdf8', nose:'#e8999f', inner:'#e3a2a6', mask:1 },
  'grey-white': { body:'#8d9196', belly:'#f7f5f1', muzzle:'#f7f5f1', cheek:'#f7f5f1', paw:'#f7f5f1', ear:'#8d9196', tail:'#8d9196', eye:'#e3b548', whisker:'#fffdf8', nose:'#eaa0a6', inner:'#eeaab0', mask:1 },
  'fox':       { body:'#d97a3a', stripe:'#b4561f', belly:'#fbf1e2', muzzle:'#fbf1e2', cheek:'#f4dcc2', paw:'#3a2b22', ear:'#c9632b', tail:'#d97a3a', eye:'#c9a227', whisker:'#fffaf0', nose:'#2f2420', inner:'#e8a07a' },
  'siamese':   { body:'#efe3cd', point:'#57402f', belly:'#f6eedf', muzzle:'#5f4635', cheek:'#a88a6e', paw:'#57402f', ear:'#57402f', tail:'#57402f', eye:'#5aa2e6', whisker:'#fffaf0', nose:'#5a3f36', inner:'#b08478', siamese:1 },
};

/* ---------- shared geometry ---------- */
const GEO = (() => {
  const sphere = new THREE.SphereGeometry(1, 30, 22);
  const leg = new THREE.CapsuleGeometry(.055, .34, 6, 14); leg.translate(0, -.22, 0);
  const tail = new THREE.CapsuleGeometry(.046, .1, 5, 12); tail.translate(0, .06, 0);
  const ear = new THREE.ConeGeometry(.1, .2, 18); ear.translate(0, .1, 0);
  const innerEar = new THREE.ConeGeometry(.064, .14, 14); innerEar.translate(0, .07, 0);
  const arc = new THREE.TorusGeometry(.05, .011, 6, 16, Math.PI);
  const whiskers = new THREE.BufferGeometry();
  const points = [];
  [-1, 1].forEach(s => [[-.03, .04], [-.075, .0], [-.12, -.04]].forEach(([dy, dz]) => {
    points.push(s * .085, -.08, .25, s * .34, -.08 + dy, .19 + dz);
  }));
  whiskers.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  const bowtie = new THREE.ConeGeometry(.06, .11, 4); bowtie.rotateZ(Math.PI / 2); bowtie.translate(-.055, 0, 0);
  const collar = new THREE.TorusGeometry(.15, .022, 8, 28);
  const shieldShape = new THREE.Shape();
  shieldShape.moveTo(0, .09); shieldShape.lineTo(.075, .065); shieldShape.lineTo(.065, -.03); shieldShape.lineTo(0, -.09); shieldShape.lineTo(-.065, -.03); shieldShape.lineTo(-.075, .065); shieldShape.closePath();
  const shield = new THREE.ExtrudeGeometry(shieldShape, { depth:.02, bevelEnabled:true, bevelSize:.006, bevelThickness:.006, bevelSegments:2 });
  return { sphere, leg, tail, ear, innerEar, arc, whiskers, bowtie, collar, shield };
})();

/* ---------- textures (one per pattern) ---------- */
function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return { canvas:c, ctx:c.getContext('2d') }; }
function textureOf(canvas) { const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
function furNoise(ctx, w, h, color, count = 2600) {
  ctx.globalAlpha = .07; ctx.fillStyle = color;
  for (let i = 0; i < count; i++) { const px = Math.random() * w, py = Math.random() * h; ctx.fillRect(px, py, 1 + Math.random() * 2, 3 + Math.random() * 5); }
  ctx.globalAlpha = 1;
}
// SphereGeometry UV: u=.25 is the front (+z), u=.75 the back; the top of the canvas is the top of the sphere
function bodyTexture(p) {
  const W = 512, H = 256, { canvas, ctx } = makeCanvas(W, H);
  ctx.fillStyle = p.body; ctx.fillRect(0, 0, W, H);
  if (p.siamese) {
    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, 'rgba(120,90,60,.10)'); g.addColorStop(.25, 'rgba(255,255,255,0)'); g.addColorStop(.75, 'rgba(110,80,55,.22)'); g.addColorStop(1, 'rgba(120,90,60,.10)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  if (p.striped) {
    ctx.strokeStyle = p.stripe; ctx.lineCap = 'round'; ctx.globalAlpha = p.striped;
    for (let i = 0; i < 9; i++) {
      const y0 = 30 + i * 24; ctx.lineWidth = 7 + (i % 3) * 2;
      ctx.beginPath();
      for (let u = .42; u <= 1.08; u += .01) { const px = u * W, py = y0 + Math.sin(u * 22 + i) * 6; u === .42 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
      ctx.stroke();
      ctx.beginPath();
      for (let u = -.08; u <= .1; u += .01) { const px = u * W + (u < 0 ? W : 0), py = y0 + Math.sin(u * 22 + i) * 6; ctx.lineTo(px, py); }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  if (p.belly && !p.mask) { // lighter belly in front
    const g = ctx.createRadialGradient(.25 * W, .62 * H, 10, .25 * W, .62 * H, 110);
    g.addColorStop(0, p.belly); g.addColorStop(.6, p.belly); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  furNoise(ctx, W, H, p.siamese || p.mask || !p.stripe ? '#ffffff' : p.stripe);
  return textureOf(canvas);
}
function headTexture(p) {
  const W = 512, H = 256, { canvas, ctx } = makeCanvas(W, H);
  ctx.fillStyle = p.body; ctx.fillRect(0, 0, W, H);
  const cx = .25 * W;
  if (p.siamese) {
    const g = ctx.createRadialGradient(cx, .62 * H, 8, cx, .6 * H, 95);
    g.addColorStop(0, p.point); g.addColorStop(.55, p.point); g.addColorStop(1, 'rgba(87,64,47,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  if (p.mask) { // white inverted V on the face (tuxedo / grey-white)
    ctx.fillStyle = p.muzzle; ctx.beginPath();
    ctx.moveTo(cx, .38 * H); ctx.quadraticCurveTo(cx + 22, .55 * H, cx + 62, H); ctx.lineTo(cx - 62, H); ctx.quadraticCurveTo(cx - 22, .55 * H, cx, .38 * H); ctx.fill();
  }
  if (p.striped) { // M stripes on the forehead + cheek stripes
    ctx.strokeStyle = p.stripe; ctx.lineCap = 'round'; ctx.lineWidth = 6; ctx.globalAlpha = Math.min(1, p.striped + .2);
    [[-20, 24], [-7, 30], [7, 30], [20, 24]].forEach(([dx, len]) => { ctx.beginPath(); ctx.moveTo(cx + dx, .14 * H); ctx.lineTo(cx + dx * 1.15, .14 * H + len); ctx.stroke(); });
    [-1, 1].forEach(s => [0, 1].forEach(k => { ctx.beginPath(); ctx.moveTo(cx + s * (70 + k * 6), (.5 + k * .07) * H); ctx.lineTo(cx + s * (110 + k * 10), (.47 + k * .07) * H); ctx.stroke(); }));
    for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(.45 * W + i * 40, 0); ctx.lineTo(.45 * W + i * 40 + 8, .4 * H); ctx.stroke(); }
    ctx.globalAlpha = 1;
  }
  furNoise(ctx, W, H, '#ffffff', 1200);
  return textureOf(canvas);
}
function ringTexture(p) {
  const { canvas, ctx } = makeCanvas(64, 128);
  ctx.fillStyle = p.tail; ctx.fillRect(0, 0, 64, 128);
  if (p.striped) { ctx.fillStyle = p.stripe; ctx.globalAlpha = p.striped; [26, 80].forEach(y => ctx.fillRect(0, y, 64, 16)); ctx.globalAlpha = 1; }
  return textureOf(canvas);
}

/* ---------- material cache ---------- */
const MATERIALS = new Map();
function fur(key, settings, translucent) {
  const k = key + (translucent ? '|t' : '');
  if (!MATERIALS.has(k)) {
    const m = new THREE.MeshPhysicalMaterial({ roughness:.9, metalness:0, sheen:.6, sheenRoughness:.55, sheenColor:new THREE.Color('#fff4e6'), ...settings });
    if (translucent) { m.transparent = true; m.opacity = .58; }
    MATERIALS.set(k, m);
  }
  return MATERIALS.get(k);
}
const TEXTURES = new Map();
function texture(pattern, kind, build) { const k = pattern + kind; if (!TEXTURES.has(k)) TEXTURES.set(k, build()); return TEXTURES.get(k); }
function patternMaterials(pattern, tone, translucent) {
  const p = PATTERNS[pattern] || PATTERNS.tabby;
  const tk = Math.round(tone * 4) / 4; // round the tone difference to 9 steps so materials are shared
  const shade = new THREE.Color(1, 1, 1).multiplyScalar(1 + tk * .08);
  const tint = (c) => new THREE.Color(c).offsetHSL(0, 0, tk * .035);
  const k = pattern + '|' + tk;
  const m = {
    body: fur(k + 'b', { map:texture(pattern, 'b', () => bodyTexture(p)), color:shade }, translucent),
    head: fur(k + 'h', { map:texture(pattern, 'h', () => headTexture(p)), color:shade }, translucent),
    ring: fur(k + 'r', { map:texture(pattern, 'r', () => ringTexture(p)), color:shade }, translucent),
    belly: fur(k + 'e', { color:tint(p.belly) }, translucent),
    muzzle: fur(k + 'm', { color:tint(p.muzzle) }, translucent),
    cheek: fur(k + 'c', { color:tint(p.cheek) }, translucent),
    paw: fur(k + 'p', { color:tint(p.paw) }, translucent),
    ear: fur(k + 'a', { color:tint(p.ear) }, translucent),
    inner: fur(pattern + 'i', { color:p.inner, roughness:.7, sheen:0 }, translucent),
    nose: fur(pattern + 'n', { color:p.nose, roughness:.45, sheen:0 }, translucent),
    eye: fur(pattern + 'e', { color:p.eye, roughness:.15, sheen:0, clearcoat:1, emissive:p.eye, emissiveIntensity:.12 }, translucent),
    whisker: new THREE.LineBasicMaterial({ color:p.whisker, transparent:true, opacity:.85 }),
    leg: p.siamese ? fur(k + 's', { color:tint(p.point) }, translucent) : fur(k + 'h', {}, translucent),
  };
  return { p, m };
}
const SHARED = {
  pupil: new THREE.MeshPhysicalMaterial({ color:'#0d0b0b', roughness:.1, clearcoat:1 }),
  highlight: new THREE.MeshBasicMaterial({ color:'#ffffff' }),
  line: new THREE.MeshBasicMaterial({ color:'#2a2220' }),
  lightLine: new THREE.MeshBasicMaterial({ color:'#b9aea4' }),
  mouthInner: new THREE.MeshStandardMaterial({ color:'#5a2228', roughness:.6 }),
  red: new THREE.MeshStandardMaterial({ color:'#d8433a', roughness:.55 }),
  gold: new THREE.MeshStandardMaterial({ color:'#e2b54a', roughness:.25, metalness:.85 }),
  shield: new THREE.MeshStandardMaterial({ color:'#4f6b5a', roughness:.4, metalness:.3 }),
};

/* ---------- poses: [px,py,pz, rx,ry,rz, sx,sy,sz] ---------- */
const P = (p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) => [...p, ...r, ...s];
const mirror = (a) => [-a[0], a[1], a[2], a[3], -a[4], -a[5], a[6], a[7], a[8]];
function completePose(p) {
  const o = { ...p };
  ['hip', 'foot', 'ear', 'arm'].forEach(n => { if (o[n + 'L'] && !o[n + 'R']) o[n + 'R'] = mirror(o[n + 'L']); });
  return o;
}
const TAIL_SITTING = [P([0, .05, -.27], [-1.57, 0, 1.2]), P([0, .12, 0], [0, 0, .42]), P([0, .12, 0], [0, 0, .42]), P([0, .12, 0], [0, 0, .4]), P([0, .12, 0], [.35, 0, .3]), P([0, .12, 0], [.45, 0, .2])];
const TAIL_CURLED = [P([0, .07, -.29], [-1.57, 0, 1.4]), P([0, .12, 0], [0, 0, .5]), P([0, .12, 0], [0, 0, .5]), P([0, .12, 0], [0, 0, .5]), P([0, .12, 0], [0, 0, .45]), P([0, .12, 0], [0, 0, .4])];
export const POSE = {
  sit: completePose({
    root: P(), body: P([0, .36, -.02], [.1, 0, 0], [.3, .38, .29]), chest: P([0, .47, .17], [.15, 0, 0], [.19, .25, .13]),
    hipL: P([-.16, .17, -.04], [0, 0, 0], [.15, .16, .21]), footL: P([-.15, .04, .16], [0, 0, 0], [.075, .05, .11]),
    head: P([0, .86, .08]), earL: P([-.15, .16, -.01], [-.1, 0, .32]), armL: P([-.11, .52, .17], [-1.2, 0, .04]),
    neck: P([0, .64, .17], [.25, 0, 0]),
    ...Object.fromEntries(TAIL_SITTING.map((v, i) => ['tail' + i, v])),
  }),
  // sleeping: curled up in the empty left corner of the desk, next to the laptop
  curl: completePose({
    root: P([-.62, .3, .84], [0, -.2, 0]), body: P([0, .19, -.03], [0, 0, 0], [.34, .21, .3]), chest: P([0, .17, .15], [0, 0, 0], [.17, .12, .1]),
    hipL: P([-.14, .13, -.1], [0, 0, 0], [.15, .12, .19]), footL: P([-.13, .05, .1], [0, 0, 0], [.06, .04, .08]),
    head: P([.03, .25, .13], [.3, -.1, .22], [.95, .95, .95]), earL: P([-.15, .15, -.02], [-.35, 0, .6]), armL: P([-.09, .16, .06], [-1.5, 0, 0], [1, .5, 1]),
    neck: P([.04, .25, .16], [.6, 0, 0], [.8, .8, .8]),
    ...Object.fromEntries(TAIL_CURLED.map((v, i) => ['tail' + i, v])),
  }),
};
// adds partial changes on top of a base pose (used by the meme poses)
export function makePose(base, changes = {}) {
  const t = POSE[base] || POSE.sit;
  const o = { ...t };
  Object.entries(changes).forEach(([n, v]) => { o[n] = v; });
  return completePose(o);
}

// Every animal sleeps its own way: the cat curls up, the owl turns its head, the raven tucks it in,
// the kangal lies down with its chin on the desk.
export const SLEEP_POSE = {
  cat: POSE.curl,
  owl: makePose('curl', {
    body: P([0, .24, -.02], [.05, 0, 0], [.30, .30, .27]),
    chest: P([0, .24, .13], [.1, 0, 0], [.16, .17, .11]),
    neck: P([.02, .34, .12], [.35, 0, 0], [.85, .85, .85]),
    head: P([.03, .40, .10], [.15, 1.15, .15], [.92, .92, .92]),   // head turned the owl way
    earL: P([-.13, .16, -.02], [-.2, 0, .55]),
  }),
  raven: makePose('curl', {
    body: P([0, .22, -.02], [.02, 0, 0], [.31, .26, .28]),
    chest: P([0, .22, .13], [.12, 0, 0], [.16, .15, .11]),
    neck: P([0, .30, .10], [.75, 0, 0], [.8, .8, .8]),
    head: P([.02, .30, .04], [1.05, .12, 0], [.9, .9, .9]),        // beak tucked into the shoulder
    earL: P([-.13, .14, -.02], [-.2, 0, .3]),
  }),
  kangal: makePose('curl', {
    body: P([0, .16, -.05], [0, 0, 0], [.42, .19, .33]),
    chest: P([0, .16, .16], [.05, 0, 0], [.19, .13, .12]),
    hipL: P([-.16, .12, -.08], [0, 0, 0], [.16, .12, .2]),
    footL: P([-.15, .05, .22], [0, 0, 0], [.07, .04, .13]),
    neck: P([0, .22, .22], [.5, 0, 0], [.85, .85, .85]),
    head: P([.02, .24, .34], [.45, 0, 0], [.9, .9, .9]),           // chin on the desk
  }),
};

/* ---------- species profiles ----------
   The rig is shared; a species only changes proportions and adds one beak. Values are multipliers on the
   meshes (never on the animated nodes), so poses and memes keep working for every animal. */
export const SPECIES = {
  cat:    { head: 1.00, ear: 1.00, tail: 1.00, beak: 0,   pattern: null,         eyes: 1,    muzzle: 1,    disc: 0, whiskers: true,  bird: false, body: [1, 1, 1], size: 1 },
  kangal: { head: 1.04, ear: 1.30, tail: 1.14, beak: 0,   pattern: 'tabby',      eyes: 0.92, muzzle: 1.5,  disc: 0, whiskers: true,  bird: false, body: [1.06, 1.03, 1.05], size: 1.14 },
  owl:    { head: 1.30, ear: 0.18, tail: 0.00, beak: 0.9, pattern: 'grey-white', eyes: 1.35, muzzle: 0.25, disc: 1, whiskers: false, bird: true,  body: [1.16, 1.06, 1.14], size: 1.02 },
  raven:  { head: 0.92, ear: 0.00, tail: 1.35, beak: 2.0, pattern: 'black',      eyes: 0.95, muzzle: 0.55, disc: 0, whiskers: false, bird: true,  body: [.86, .94, .88], size: 0.96 },
  fox:    { head: 1.02, ear: 1.30, tail: 1.25, beak: 0,   pattern: 'fox',        eyes: 0.92, muzzle: 1.45, disc: 0, whiskers: true,  bird: false, body: [.98, .98, 1.0], size: 1.02 },
};

/* ---------- species kits ----------
   The rig stays the same (nodes are what poses animate); a kit swaps the *meshes* so the silhouette reads as
   the animal: wings and tufts for the owl, a feathered tail and thin legs for the raven, a heavy snout and
   drooping ears for the kangal. Birds also lose the front legs, so they stand on two feet. */
const BEAK = new THREE.MeshStandardMaterial({ color: '#c99a3e', roughness: .45, metalness: .05 });
const SPECIES_KIT = {
  owl(c) {
    // folded wings against the body
    [-1, 1].forEach(side => {
      const wing = c.add(c.nodes.body, c.GEO.sphere, c.m.ear, [side * .22, .02, -.02], [.075, .24, .30]);
      wing.rotation.z = side * .18;
    });
    // ear tufts and a fanned chest
    [-1, 1].forEach(side => {
      const tuft = c.add(c.skull, new THREE.ConeGeometry(.045, .13, 10), c.m.head, [side * .13, .21, -.01]);
      tuft.rotation.z = side * -.4;
    });
    [0, .07, -.07].forEach((z, i) => {
      c.add(c.nodes.chest, c.GEO.sphere, c.m.head, [0, -.02 + i * .01, z + .04], [.07, .05, .02], false);
    });
    // two legs, not four
    ['armL', 'armR'].forEach(n => { c.nodes[n].visible = false; });
    c.birdFeet();
  },
  raven(c) {
    // sleek folded wings and a long feathered tail
    [-1, 1].forEach(side => {
      const wing = c.add(c.nodes.body, c.GEO.sphere, c.m.ear, [side * .19, .03, -.03], [.05, .20, .34]);
      wing.rotation.z = side * .1;
    });
    [0, .8, 1.6].forEach((_, i) => {
      const feather = c.add(c.nodes.tail0, new THREE.ConeGeometry(.05, .42, 8), c.m.ring, [0, -.02, -.16 - i * .03]);
      feather.rotation.x = -Math.PI / 2 - .1;
      feather.scale.set(1 - i * .2, 1, .25);
    });
    // thin bird legs
    ['armL', 'armR'].forEach(n => { c.nodes[n].visible = false; });
    c.birdFeet();
  },
  fox(c) {
    // pointed ears that stay up, a slim snout and a heavy brush of a tail
    const snout = c.add(c.skull, c.GEO.sphere, c.m.body, [0, -.10, .32], [.075, .065, .19]);
    snout.rotation.x = .14;
    c.add(c.skull, c.GEO.sphere, c.m.belly, [0, -.135, .30], [.07, .05, .14], false);
    c.add(c.skull, c.GEO.sphere, c.m.nose, [0, -.105, .49], [.038, .03, .026], false);
    ['L', 'R'].forEach(side => {
      const ear = c.nodes['ear' + side];
      const mesh = ear && ear.children && ear.children[0];
      if (mesh) { mesh.scale.set(1.2, 1.45, .8); }
    });
    (c.tailMeshes || []).forEach((mesh, i) => {
      mesh.scale.x *= 1.9 - i * .12;
      mesh.scale.z *= 1.9 - i * .12;
    });
    c.add(c.nodes.tail2, c.GEO.sphere, c.m.belly, [0, .06, .02], [.05, .05, .12], false);  // white tail tip
  },

  kangal(c) {
    // a fur-coloured snout instead of the cat muzzle, folded-out ears, heavier tail
    const snout = c.add(c.skull, c.GEO.sphere, c.m.body, [0, -.10, .33], [.095, .085, .21]);
    snout.rotation.x = .18;
    c.add(c.skull, c.GEO.sphere, c.m.nose, [0, -.105, .52], [.05, .038, .03], false);
    ['L', 'R'].forEach((side, i) => {
      const ear = c.nodes['ear' + side];
      const mesh = ear && ear.children && ear.children[0];
      if (mesh) {
        mesh.rotation.z = (i ? -1 : 1) * 1.05;   // folded down like a shepherd's ears
        mesh.scale.set(1.15, 1.5, 1.1);
      }
    });
    (c.tailMeshes || []).forEach(mesh => { mesh.scale.x *= 1.6; mesh.scale.z *= 1.6; });
  },
};

/* ---------- cat ---------- */
const FACE0 = { open:1, pupil:0, lookX:0, lookY:0, lid:0, mouth:0, brow:0, happy:0, wide:0, crossed:0 };
export function createCat({ pattern = null, tone = 0, kitten = false, accessory = {}, species = 'cat' } = {}) {
  const profile = SPECIES[species] || SPECIES.cat;
  pattern = pattern || profile.pattern || 'tabby';
  const { p, m } = patternMaterials(pattern, tone, kitten);
  const group = new THREE.Group();
  const dark = new THREE.Color(p.body).getHSL({}).l < .25 && !p.mask || pattern === 'tuxedo';
  const rootNode = new THREE.Group(); group.add(rootNode);
  const nodes = { root: rootNode };
  const shadowed = [];
  const add = (parent, geometry, material, position = [0, 0, 0], scale = [1, 1, 1], shadow = true) => {
    const x = new THREE.Mesh(geometry, material); x.position.set(...position); x.scale.set(...scale);
    if (shadow) { x.castShadow = true; x.receiveShadow = true; shadowed.push(x); }
    parent.add(x); return x;
  };
  const nodeGroup = (name, parent = rootNode) => { const g = new THREE.Group(); parent.add(g); nodes[name] = g; return g; };

  // body parts: a node = a group, the scale lives on the group (sphere units)
  add(nodeGroup('body'), GEO.sphere, m.body);
  add(nodeGroup('chest'), GEO.sphere, m.belly);
  ['L', 'R'].forEach(s => { add(nodeGroup('hip' + s), GEO.sphere, m.body); add(nodeGroup('foot' + s), GEO.sphere, m.paw); });

  // head
  const headNode = nodeGroup('head');
  const headScale = kitten ? 1.18 : 1;
  const skull = new THREE.Group(); skull.scale.setScalar(headScale); headNode.add(skull);
  add(skull, GEO.sphere, m.head, [0, 0, 0], [.3, .26, .27]);
  [-1, 1].forEach(s => add(skull, GEO.sphere, m.cheek, [s * .12, -.08, .12], [.14, .11, .13]));
  [-1, 1].forEach(s => add(skull, GEO.sphere, m.muzzle, [s * .044, -.088, .222], [.068, .054, .06]));
  add(skull, GEO.sphere, m.muzzle, [0, -.135, .2], [.05, .035, .05]);
  add(skull, GEO.sphere, m.nose, [0, -.045, .272], [.033, .022, .02], false);
  const mouth = add(skull, GEO.sphere, SHARED.mouthInner, [0, -.128, .238], [.045, .001, .02], false);
  const whiskerLine = new THREE.LineSegments(GEO.whiskers, m.whisker); skull.add(whiskerLine);
  const eyes = [-1, 1].map(s => {
    const g = new THREE.Group(); g.position.set(s * .105, .03, .232); g.rotation.y = s * .36; skull.add(g);
    const openGroup = new THREE.Group(); g.add(openGroup);
    add(openGroup, GEO.sphere, m.eye, [0, 0, 0], [.062, .07, .03], false);
    const pupil = add(openGroup, GEO.sphere, SHARED.pupil, [0, 0, .02], [.024, .056, .016], false);
    const glint = add(openGroup, GEO.sphere, SHARED.highlight, [.018, .026, .034], [.014, .014, .008], false);
    const glint2 = add(openGroup, GEO.sphere, SHARED.highlight, [-.016, -.022, .032], [.008, .008, .006], false);
    const arc = new THREE.Mesh(GEO.arc, dark ? SHARED.lightLine : SHARED.line); arc.position.z = .02; arc.visible = false; g.add(arc);
    const brow = add(g, GEO.sphere, SHARED.line, [-s * .005, .085, .015], [.055, .011, .01], false); brow.visible = false;
    return { g, openGroup, pupil, glint, glint2, arc, brow, s };
  });
  const earMeshes = [];
  ['L', 'R'].forEach(s => {
    const k = nodeGroup('ear' + s, skull);
    earMeshes.push(add(k, GEO.ear, m.ear, [0, 0, 0], [1, 1, .55]));
    earMeshes.push(add(k, GEO.innerEar, m.inner, [0, .005, .028], [1, 1, .4], false));
  });

  // front legs (down from the shoulder) and the paw tip
  ['L', 'R'].forEach(s => {
    const o = nodeGroup('arm' + s);
    add(o, GEO.leg, m.leg);
    const paw = add(o, GEO.sphere, m.paw, [0, -.44, .015], [.072, .052, .088]);
    nodes['paw' + s] = paw;
  });

  // tail chain
  const tailMeshes = [];
  let upper = rootNode;
  for (let i = 0; i < 6; i++) {
    const g = nodeGroup('tail' + i, upper);
    const r = 1 - i * .07;
    const tailMaterial = p.siamese && i < 2 ? m.body : m.ring;
    tailMeshes.push(add(g, GEO.tail, tailMaterial, [0, 0, 0], [r, 1, r]));
    upper = g;
  }

  // neck + accessory
  const neck = nodeGroup('neck');
  if (accessory.bowtie) {
    [-1, 1].forEach(s => { const x = add(neck, GEO.bowtie, SHARED.red, [0, 0, .02]); x.scale.x = s; });
    add(neck, GEO.sphere, SHARED.red, [0, 0, .03], [.03, .03, .03]);
  }
  if (accessory.collar) {
    const c = add(neck, GEO.collar, SHARED.gold, [0, 0, -.08]); c.rotation.x = Math.PI / 2;
    add(neck, GEO.sphere, SHARED.gold, [0, -.04, .07], [.035, .035, .035]);
  }
  if (accessory.shield) { const s = add(neck, GEO.shield, SHARED.shield, [0, -.17, .02]); s.rotation.x = -.25; }

  // state machine
  const NODES = Object.keys(POSE.sit);
  const base = {};
  NODES.forEach(n => { base[n] = POSE.curl[n].slice(); });
  const face = { ...FACE0, open:0 };
  let status = 'sleeping', t = Math.random() * 10, doneAt = -1, blinkTimer = 2 + Math.random() * 3, blink = 0;
  let meme = null, memePose = null, wakeAt = -1;

  let outer = 'sleeping'; // last status from outside; 'done' stretches once even if it arrives every frame
  function setStatus(next) {
    if (next === 'idle' || next === 'waiting') next = 'sleeping';
    if (next === outer) return;
    outer = next;
    status = next;
    if (next === 'done') doneAt = t;
  }
  function setMeme(spec, { instant = false } = {}) {
    meme = spec || null;
    memePose = spec ? makePose(spec.base || 'sit', spec.pose) : null;
    wakeAt = spec && status === 'sleeping' && !instant ? t : -1; // a sleeping cat stretches awake first
    if (instant && spec) { // preview: jump straight to the pose, no transition
      NODES.forEach(n => { base[n] = memePose[n].slice(); });
      Object.assign(face, FACE0, spec.face);
    }
  }
  const waking = () => wakeAt >= 0 && t - wakeAt < 1.1;

  const sleepPose = SLEEP_POSE[species] || POSE.curl;
  function targetPose() {
    if (meme && !waking()) return memePose;
    if (meme || status !== 'sleeping') return POSE.sit;
    return sleepPose;
  }
  function targetFace() {
    if (meme && !waking()) return { ...FACE0, ...meme.face };
    if (status === 'sleeping' && !meme) return { ...FACE0, open:0 };
    if (status === 'done' || waking()) return { ...FACE0, open:0, happy:1 };
    if (status === 'thinking') return { ...FACE0, lookY:.6, lookX:.3 };
    return FACE0;
  }

  const bodyScale = profile.body || [1, 1, 1];
  const BODY_NODES = { body: 1, chest: 1, hipL: 1, hipR: 1 };
  function applyPose(n, arr, extra) {
    const g = nodes[n];
    const bs = BODY_NODES[n] ? bodyScale : [1, 1, 1];
    g.position.set(arr[0], arr[1], arr[2]);
    g.rotation.set(arr[3] + (extra?.rx || 0), arr[4] + (extra?.ry || 0), arr[5] + (extra?.rz || 0));
    g.scale.set(arr[6] * bs[0] * (extra?.s || 1), arr[7] * bs[1] * (extra?.sy || extra?.s || 1),
                arr[8] * bs[2] * (extra?.s || 1));
    if (extra?.py) g.position.y += extra.py;
  }

  function update(dt) {
    t += dt;
    if (status === 'done' && doneAt >= 0 && t - doneAt > 1.7 && !meme) { status = 'sleeping'; doneAt = -1; }
    const k = 1 - Math.exp(-dt * 8);
    const hp = targetPose();
    NODES.forEach(n => { const a = base[n], b = hp[n]; for (let i = 0; i < 9; i++) a[i] += (b[i] - a[i]) * k; });
    const hf = targetFace();
    if (meme?.talking && !waking()) hf.mouth = .2 + Math.abs(Math.sin(t * 9)) * .55;
    Object.keys(face).forEach(n => { face[n] += (hf[n] - face[n]) * Math.min(1, k * 1.6); });

    const asleep = status === 'sleeping' && !meme;
    const typing = (!meme && status === 'working') || (meme && meme.typing && !waking());
    const extra = {};
    if (asleep) {
      const n = Math.sin(t * 1.7);
      extra.body = { s:1 + n * .03 }; extra.head = { py:n * .006 }; extra.chest = { s:1 + n * .03 };
    }
    if (typing) {
      const h = meme?.typingSpeed || 11;
      extra.armL = { rx:Math.sin(t * h) * .16 }; extra.armR = { rx:Math.sin(t * h + Math.PI) * .16 };
      extra.head = { rx:Math.sin(t * 2.3) * .03 };
    }
    if (!asleep) { extra.tail4 = { rz:Math.sin(t * 3.1) * .3 }; extra.tail5 = { rz:Math.sin(t * 3.1 - .6) * .45 }; }
    const finishing = status === 'done' && doneAt >= 0 && !meme;
    if (finishing || waking()) {
      const tb = finishing ? t - doneAt : t - wakeAt, duration = finishing ? 1.6 : 1.1;
      const e = Math.sin(Math.min(1, tb / duration) * Math.PI);
      extra.armL = { rx:-1.4 * e, rz:.5 * e }; extra.armR = { rx:-1.4 * e, rz:-.5 * e };
      extra.root = { py:finishing ? Math.abs(Math.sin(tb * 6)) * .1 * (1 - tb / duration) : 0 };
      extra.body = { sy:1 + .12 * e }; extra.head = { rx:-.25 * e };
    }
    if (meme?.animate && !waking()) meme.animate(t, extra);
    NODES.forEach(n => applyPose(n, base[n], extra[n]));

    // blinking
    if (!asleep && face.open > .8) {
      blinkTimer -= dt;
      if (blinkTimer < 0) { blink = .14; blinkTimer = 2 + Math.random() * 4; }
    }
    blink = Math.max(0, blink - dt);
    const openness = face.open * (blink > 0 ? .08 : 1);
    eyes.forEach(o => {
      o.openGroup.visible = openness > .22;
      o.openGroup.scale.set(1, Math.max(.05, openness * (1 - .48 * face.lid)), 1);
      o.openGroup.position.y = -.022 * face.lid;
      o.arc.visible = openness <= .22;
      o.arc.rotation.z = face.happy > .5 ? 0 : Math.PI;
      o.arc.position.y = face.happy > .5 ? -.02 : .01;
      const b = face.pupil;
      o.pupil.scale.set(.024 + b * .03, .056 + b * .006, .016);
      o.pupil.position.x = face.lookX * .022 - o.s * face.crossed * .02;
      o.g.scale.setScalar(1 + face.wide * .38);
      o.glint2.visible = b > .5;
      o.pupil.position.y = face.lookY * .02;
      o.glint.scale.setScalar(.014 + b * .01);
      o.brow.visible = face.brow > .1;
      o.brow.rotation.z = -o.s * .45 * face.brow;
    });
    mouth.scale.set(.045, .001 + face.mouth * .045, .02);
    mouth.visible = face.mouth > .02;
  }

  // outline: a back-facing inflated copy (meme glow)
  let outline = null;
  function setOutline(color) {
    if (!outline && color) {
      outline = new THREE.MeshBasicMaterial({ color, side:THREE.BackSide, transparent:true, opacity:.9, depthWrite:false });
      shadowed.slice().forEach(x => {
        const c = new THREE.Mesh(x.geometry, outline);
        c.position.copy(x.position); c.scale.copy(x.scale).multiplyScalar(1.09); c.rotation.copy(x.rotation);
        c.userData.outline = true; x.parent.add(c);
      });
    }
    if (outline) { outline.visible = !!color; if (color) outline.color.set(color); }
  }

  update(0);
  // overall size: the root sits at the feet, so scaling keeps the animal planted on the chair
  if (profile.size && profile.size !== 1) group.scale.setScalar(profile.size);

  // species kit: extra or removed meshes, then proportions
  const kit = SPECIES_KIT[species];
  if (kit) kit({
    add, nodes, skull, m, GEO, profile, tailMeshes, earMeshes,
    birdFeet() {
      ['footL', 'footR'].forEach(name => {
        const node = nodes[name];
        const mesh = node && node.children && node.children[0];
        if (mesh) { mesh.material = m.muzzle; mesh.scale.set(.05, .045, .11); }
      });
    },
  });

  // species: proportions only, applied to the meshes so every pose and meme keeps working
  if (profile.head !== 1) skull.scale.multiplyScalar(profile.head);
  if (profile.ear === 0) earMeshes.forEach(mesh => { mesh.visible = false; });
  else if (profile.ear !== 1) earMeshes.forEach(mesh => mesh.scale.multiplyScalar(profile.ear));
  if (profile.tail === 0) tailMeshes.forEach(mesh => { mesh.visible = false; });
  else if (profile.tail !== 1) tailMeshes.forEach(mesh => { mesh.scale.x *= profile.tail; mesh.scale.z *= profile.tail; });
  if (profile.beak > 0) {
    const beak = new THREE.Mesh(new THREE.ConeGeometry(.040 * profile.beak, .10 * profile.beak, 14), BEAK);
    beak.position.set(0, -.072, .252 + .02 * profile.beak);
    beak.rotation.x = Math.PI / 2;
    beak.castShadow = true;
    skull.add(beak);
  }
  // shared profile: eyes, muzzle, whiskers and the owl's facial disc
  if (profile.eyes !== 1) eyes.forEach(o => o.g.scale.multiplyScalar(profile.eyes));
  if (profile.muzzle !== 1) {
    skull.children.forEach(ch => {
      if (ch.isMesh && ch.geometry === GEO.sphere && ch.material === m.muzzle) {
        ch.scale.z *= profile.muzzle;
        ch.position.z += (profile.muzzle - 1) * .06;
      }
    });
  }
  if (!profile.whiskers) whiskerLine.visible = false;
  if (profile.bird) {
    // a beak replaces the cat muzzle: drop the muzzle, cheeks and nose meshes
    skull.children.forEach(ch => {
      if (ch.isMesh && (ch.material === m.muzzle || ch.material === m.cheek || ch.material === m.nose)) ch.visible = false;
    });
  }
  if (profile.disc) {
    [-1, 1].forEach(side => {
      const disc = new THREE.Mesh(GEO.sphere, m.belly);
      disc.position.set(side * .10, .01, .205);
      disc.scale.set(.115, .135, .03);
      skull.add(disc);
    });
  }

  return { group, nodes, setStatus, setMeme, setOutline, update, get status() { return status; }, pattern };
}

/* ---------- role → pattern mapping ---------- */
const ROOM_PATTERN = {
  'ceo':'tuxedo', 'design':'ginger', 'writing':'tabby', 'code':'siamese', 'workshop':'black',
  'mail':'grey-white', 'social':'grey-tabby', 'data':'black', 'research':'siamese', 'end-of-day':'grey-white',
};
const AGENT_PATTERN = { 'soc-analyst':'tuxedo', 'lab-builder':'ginger' };
export function agentPattern(agentId, roomId) { return AGENT_PATTERN[agentId] || ROOM_PATTERN[roomId] || 'tabby'; }
export function agentAccessory(agentId, roomId) {
  if (agentId === 'ceo') return { bowtie:true };
  if (agentId === 'soc-analyst') return { shield:true };
  if (roomId === 'workshop') return { collar:true };
  return {};
}
