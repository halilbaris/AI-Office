// MyOffice · cat memes: clicking a cat switches it to its own meme pose (no photos, all procedural 3D)
import * as THREE from 'three';
import { makePose } from './cat.js';

const P = (p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) => [...p, ...r, ...s];
const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness:.7, ...extra });
const lit = (color) => new THREE.MeshBasicMaterial({ color, toneMapped:false });

function box(g, w, h, d, m, x, y, z) {
  const k = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); k.position.set(x, y, z);
  k.castShadow = true; k.receiveShadow = true; g.add(k); return k;
}
function makeCanvas(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return { canvas:c, ctx:c.getContext('2d'), texture:t };
}

/* ---------- live textures ---------- */
function matrixTexture(w = 256, h = 256) {
  const d = makeCanvas(w, h); const columns = Array.from({ length:Math.floor(w / 10) }, () => Math.random() * h);
  d.ctx.fillStyle = '#020a04'; d.ctx.fillRect(0, 0, w, h);
  d.draw = () => {
    d.ctx.fillStyle = 'rgba(2,10,4,.16)'; d.ctx.fillRect(0, 0, w, h);
    d.ctx.font = '700 11px monospace';
    columns.forEach((y, i) => {
      d.ctx.fillStyle = Math.random() > .9 ? '#d9ffe0' : '#35e06a';
      d.ctx.fillText(Math.random() > .5 ? '1' : '0', i * 10, y);
      columns[i] = y > h + Math.random() * 60 ? 0 : y + 11;
    });
    d.texture.needsUpdate = true;
  };
  for (let i = 0; i < 40; i++) d.draw();
  return d;
}
function mapTexture() {
  const d = makeCanvas(1024, 512), x = d.ctx;
  const g = x.createLinearGradient(0, 0, 1024, 512); g.addColorStop(0, '#071a4a'); g.addColorStop(.6, '#0d3b9c'); g.addColorStop(1, '#0a2466');
  x.fillStyle = g; x.fillRect(0, 0, 1024, 512);
  const continents = [[200, 170, 120, 80], [270, 340, 60, 100], [520, 150, 90, 60], [540, 290, 70, 110], [720, 180, 170, 90], [820, 370, 70, 45]];
  for (let px = 8; px < 1024; px += 13) for (let py = 8; py < 512; py += 13) {
    if (continents.some(([cx, cy, rx, ry]) => ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2 < 1)) { x.fillStyle = 'rgba(140,200,255,.75)'; x.fillRect(px, py, 4, 4); }
  }
  x.strokeStyle = 'rgba(160,220,255,.5)'; x.lineWidth = 1.5;
  const nodes = [[210, 160], [540, 150], [760, 190], [560, 300], [290, 330], [830, 370]];
  nodes.forEach((a, i) => nodes.slice(i + 1).forEach(b => { if (Math.random() > .4) { x.beginPath(); x.moveTo(...a); x.lineTo(...b); x.stroke(); } }));
  nodes.forEach(([a, b]) => { x.fillStyle = '#e8f6ff'; x.beginPath(); x.arc(a, b, 5, 0, 7); x.fill(); });
  d.texture.needsUpdate = true; return d;
}
function vortexTexture() {
  const d = makeCanvas(256, 256), x = d.ctx;
  x.fillStyle = '#0a1240'; x.fillRect(0, 0, 256, 256);
  for (let k = 0; k < 4; k++) {
    x.strokeStyle = ['#3a5bff', '#8fb0ff', '#ffffff', '#2236b8'][k]; x.lineWidth = 7 - k;
    x.beginPath();
    for (let a = 0; a < 18; a += .05) { const r = a * 7; x.lineTo(128 + Math.cos(a + k * 1.6) * r, 128 + Math.sin(a + k * 1.6) * r); }
    x.stroke();
  }
  d.texture.center.set(.5, .5); d.texture.needsUpdate = true; return d;
}

/* ---------- procedural props (cat frame: desk top y=.30, desk z .45–1.35) ---------- */
const BEIGE = mat('#e4dccb'), BEIGE_DARK = mat('#cfc5b0'), BLACK = mat('#1c1c1f', { roughness:.4 }), METAL = mat('#9aa0a6', { metalness:.7, roughness:.35 });
function crt(g, x, z, ry, screenMaterial, scale = 1) {
  const c = new THREE.Group(); c.position.set(x, .3, z); c.rotation.y = ry; c.scale.setScalar(scale); g.add(c);
  box(c, .56, .48, .42, BEIGE, 0, .3, 0);
  box(c, .4, .34, .26, BEIGE_DARK, 0, .3, -.3);
  box(c, .3, .05, .26, BEIGE_DARK, 0, .03, 0);
  const frame = box(c, .5, .42, .02, mat('#2a2a28'), 0, .31, .21);
  frame.castShadow = false;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(.42, .34), screenMaterial); screen.position.set(0, .31, .225); c.add(screen);
  return c;
}
function pcCase(g, x, z, ry, openFaces = ['+x'], y = .3) {
  const c = new THREE.Group(); c.position.set(x, y, z); c.rotation.y = ry; g.add(c);
  const W = .42, H = .66, D = .62, t = .02, m = mat('#3a3d42', { metalness:.4, roughness:.45 });
  const faces = { '-x':[t, H, D, -W / 2, H / 2, 0], '+x':[t, H, D, W / 2, H / 2, 0], '+y':[W, t, D, 0, H, 0], '-y':[W, t, D, 0, 0, 0], '-z':[W, H, t, 0, H / 2, -D / 2], '+z':[W, H, t, 0, H / 2, D / 2] };
  Object.entries(faces).forEach(([k, v]) => { if (!openFaces.includes(k)) box(c, ...v.slice(0, 3), m, ...v.slice(3)); });
  box(c, .02, .4, .44, mat('#2f7a46'), -W / 2 + .03, .36, 0);
  const fan = new THREE.Mesh(new THREE.TorusGeometry(.07, .015, 8, 20), METAL); fan.position.set(-.1, .52, -D / 2 + .04); c.add(fan);
  box(c, .14, .08, .1, METAL, -.06, .16, .12);
  return c;
}
function cables(g, count, center, size) {
  const colors = ['#d23a3a', '#2f6fd8', '#e0b02a', '#3aa35a', '#e8e8e8', '#7a4fc0', '#1b1b1b', '#e07a2a'];
  for (let i = 0; i < count; i++) {
    const points = Array.from({ length:5 }, () => new THREE.Vector3(
      center[0] + (Math.random() - .5) * size[0], center[1] + (Math.random() - .5) * size[1], center[2] + (Math.random() - .5) * size[2]));
    const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 40, .006 + Math.random() * .006, 6), mat(colors[i % colors.length], { roughness:.5 }));
    m.castShadow = true; g.add(m);
  }
}
function hood(cat, g, color, trim) {
  const m = mat(color, { side:THREE.DoubleSide, roughness:.85 });
  const h = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 18, .78 * Math.PI, 1.44 * Math.PI, 0, .7 * Math.PI), m);
  h.scale.set(.36, .33, .34); h.position.set(0, .03, -.02); cat.nodes.head.add(h);
  const cape = new THREE.Mesh(new THREE.CylinderGeometry(.22, .42, .62, 26, 1, true), m);
  cape.position.set(0, .4, -.04); cat.nodes.root.add(cape);
  const pieces = [h, cape];
  if (trim) {
    const k = new THREE.Mesh(new THREE.TorusGeometry(.25, .03, 10, 28), mat(trim, { roughness:.95 }));
    k.position.set(0, .01, .17); k.scale.set(1.08, 1, 1); cat.nodes.head.add(k); pieces.push(k);
  }
  return pieces; // removed again when the meme closes
}
function laptop(g, x, z, ry, screenMaterial) {
  const c = new THREE.Group(); c.position.set(x, .3, z); c.rotation.y = ry; g.add(c);
  box(c, .5, .025, .34, mat('#2b2d31', { metalness:.5, roughness:.4 }), 0, .012, 0);
  const lid = new THREE.Group(); lid.position.set(0, .02, -.16); lid.rotation.x = -.25; c.add(lid);
  box(lid, .5, .32, .018, mat('#2b2d31', { metalness:.5, roughness:.4 }), 0, .16, 0);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(.46, .28), screenMaterial); screen.position.set(0, .16, .011); lid.add(screen);
  return c;
}
function handset(cat, g) {
  const hand = new THREE.Group(); hand.position.set(-.02, -.36, .06); cat.nodes.armR.add(hand);
  const m = mat('#c83c32', { roughness:.3 });
  const grip = new THREE.Mesh(new THREE.CapsuleGeometry(.03, .26, 6, 12), m); hand.add(grip);
  [-1, 1].forEach(s => { const earpiece = new THREE.Mesh(new THREE.SphereGeometry(.055, 14, 10), m); earpiece.scale.set(1, .65, 1); earpiece.position.set(-.03, s * .16, 0); hand.add(earpiece); });
  const base = new THREE.Group(); base.position.set(.55, .3, .8); g.add(base);
  box(base, .3, .1, .24, m, 0, .05, 0);  // red retro phone
  box(base, .2, .03, .14, mat('#d8cfc0'), 0, .11, .02);
  const cord = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(.45, .36, .78), new THREE.Vector3(.35, .32, .6), new THREE.Vector3(.3, .45, .4), new THREE.Vector3(.25, .7, .25)]), 30, .008, 5), m);
  g.add(cord);
  return [hand];
}
function papers(g, x, z) {
  const m = mat('#fbf8f1', { roughness:.95 }), m2 = mat('#f1ead8', { roughness:.95 });
  for (let i = 0; i < 9; i++) {
    const k = box(g, .34, .012, .44, i % 2 ? m : m2, x + (Math.random() - .5) * .12, .305 + i * .012, z + (Math.random() - .5) * .1);
    k.rotation.y = (Math.random() - .5) * .7;
  }
  for (let i = 0; i < 4; i++) { const k = box(g, .3, .006, .4, m, x + .35 + Math.random() * .4, .305, z + (Math.random() - .5) * .4); k.rotation.y = Math.random() * 3; }
}
function backdrop(g, texture, w, h, z, y = 1) {
  const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map:texture.texture, toneMapped:false }));
  p.position.set(0, y, z); g.add(p); return p;
}

/* ---------- meme definitions ---------- */
const SIT_ARM_REST = P([-.11, .52, .17], [-1.2, 0, .04]);
const MEMES = {
  designer: {
    caption:'ONE MORE REVISION?',
    cat:{ pose:{ head:P([0, .86, .1], [-.14, 0, .16]), armR:P([.11, .52, .17], [-.25, 0, -.05]) }, face:{ pupil:1, wide:1, lookY:.25 } },
    camera:[.25, 1.0, 2.4], target:[0, .82, .1],
  },
  cleaner: {
    caption:'MAKING ROOM',
    // head first inside an open box on the floor left of the desk; back and tail stick out
    cat:{ base:'curl', pose:{ root:P([-.98, -.56, 1.75], [0, -Math.PI / 2, 0]), head:P([0, .24, .22], [.15, 0, 0]),
      tail0:P([0, .1, -.3], [-1.2, 0, 0]), tail1:P([0, .12, 0], [.35, 0, 0]), tail2:P([0, .12, 0], [.3, 0, 0]), tail3:P([0, .12, 0], [.25, 0, .2]), tail4:P([0, .12, 0], [.2, 0, .3]), tail5:P([0, .12, 0], [.1, 0, .3]) }, face:{ pupil:.6 } },
    scene(g) { pcCase(g, -1.32, 1.75, 0, ['+x', '+z'], -.56); },
    camera:[-.45, .45, 4.4], target:[-1.05, -.3, 1.75],
  },
  'content-writer': 'vortex', 'editor': 'vortex',
  vortex: {
    caption:'READERS LOVE YOU',
    cat:{ pose:{ head:P([0, .84, .1], [-.18, 0, -.22]), earL:P([-.15, .14, -.03], [-.45, 0, .75]), armR:P([.11, .52, .17], [-.25, 0, -.05]) }, face:{ open:0, happy:1 } },
    scene(g, state) {
      const vortex = vortexTexture(); state.vortex = vortex;
      crt(g, .72, .85, -.85, new THREE.MeshBasicMaterial({ map:vortex.texture, toneMapped:false }), 1.1);
      const arm = new THREE.Group(); arm.position.set(.62, .62, .78); g.add(arm);
      arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(.02, 1.18, .12).sub(arm.position).normalize());
      const skin = mat('#f0c8a8', { roughness:.6 });
      const length = new THREE.Vector3(.02, 1.2, .12).distanceTo(arm.position);
      const k = new THREE.Mesh(new THREE.CapsuleGeometry(.055, length - .2, 6, 14), skin); k.rotation.x = Math.PI / 2; k.position.z = (length - .1) / 2; arm.add(k);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(.09, 18, 14), skin); hand.scale.set(1.1, .55, 1.25); hand.position.z = length - .06; arm.add(hand);
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(.075, .075, .1, 16), mat('#e8e2d6')); cuff.rotation.x = Math.PI / 2; cuff.position.z = .06; arm.add(cuff);
      state.hand = hand; state.handZ = length - .06;
    },
    animate(t, state) { if (state.vortex) state.vortex.texture.rotation = -t * 1.6; if (state.hand) state.hand.position.z = state.handZ + Math.sin(t * 5) * .05; },
    camera:[.55, 1.1, 2.5], target:[.2, .82, .3],
  },
  social: {
    caption:'WHAT IS TRENDING',
    cat:{ pose:{ head:P([0, .86, .1], [0, -.6, .05]) }, face:{ lookX:1, lid:.45, pupil:.6, wide:.3 }, typing:true },
    camera:[.6, 1.0, 2.1], target:[0, .84, .1],
  },
  mail: {
    caption:'INBOX: 999+',
    cat:{ pose:{ body:P([0, .38, -.02], [-.04, 0, 0], [.28, .4, .28]), head:P([0, .9, .08], [.12, 0, 0]) }, face:{ pupil:.3 }, typing:true, typingSpeed:17 },
    scene(g) { crt(g, 0, 1.0, Math.PI, new THREE.MeshBasicMaterial({ color:'#9fc4ff', toneMapped:false }), 1); },
    camera:[2.3, 1.55, 2.6], target:[0, .72, .35],
  },
  ceo: {
    caption:'YES BOSS, ON IT',
    cat:{ pose:{ armR:P([.11, .55, .12], [-2.55, 0, .5]), head:P([0, .86, .08], [-.05, 0, -.14]) }, face:{ lid:.35, lookX:-.4 }, talking:true },
    scene(g, state, cat) { state.attached = handset(cat, g); },
    camera:[.15, 1.05, 2.6], target:[0, .82, .1],
  },
  'code-reviewer': 'sniff', 'tester': 'sniff',
  sniff: {
    caption:'THIS LINE HAS A BUG',
    cat:{ pose:{ body:P([0, .36, .04], [.42, 0, 0], [.3, .38, .29]), chest:P([0, .45, .26], [.45, 0, 0], [.19, .25, .13]), head:P([0, .64, .46], [.1, 0, 0]), armL:P([-.11, .5, .3], [-1.0, 0, .04]) }, face:{ crossed:1, pupil:.7, wide:.2 } },
    scene(g) { crt(g, 0, 1.0, Math.PI, new THREE.MeshBasicMaterial({ color:'#cfe3ff', toneMapped:false })); },
    camera:[2.1, 1.0, 1.2], target:[0, .62, .65],
  },
  researcher: {
    caption:'LOOKING FOR SOURCES',
    cat:{ pose:{ body:P([0, .36, .06], [.5, 0, 0], [.3, .38, .29]), chest:P([0, .44, .28], [.5, 0, 0], [.19, .25, .13]), head:P([0, .58, .6], [.15, 0, 0]), armL:P([-.13, .5, .3], [-1.1, 0, .2]) }, face:{} },
    scene(g) { pcCase(g, 0, .95, 0, ['-z']); },
    camera:[1.9, 1.05, 1.5], target:[0, .55, .6],
  },
  'end-of-day': {
    caption:'WHAT DID WE DO TODAY',
    cat:{ pose:{ root:P([-.55, .4, .86], [0, .15, 0]), armL:P([-.11, .52, .17], [-.2, 0, .04]) }, face:{ lid:.2, lookY:-.3 } },
    scene(g) { papers(g, -.55, .86); },
    camera:[0, 1.75, 4.0], target:[-.45, .85, .8],
  },
  builder: {
    caption:'ALREADY DEPLOYED',
    cat:{ pose:{ head:P([0, .86, .1], [.04, .25, 0]) }, face:{ brow:1, lid:.42, lookX:-.6 } },
    scene(g, state, cat) {
      state.map = mapTexture(); backdrop(g, state.map, 4.2, 2.2, -.45, 1.0);
      state.screen = matrixTexture(); laptop(g, .48, .72, -.6, new THREE.MeshBasicMaterial({ map:state.screen.texture, toneMapped:false }));
      state.attached = hood(cat, g, '#2a2d34');
    },
    animate(t, state) { if (t - (state.last || 0) > .07) { state.last = t; state.screen.draw(); } },
    camera:[.35, 1.0, 2.5], target:[.1, .8, .2],
  },
  data: {
    caption:'I DO NOT GET IT',
    cat:{ pose:{ head:P([0, .84, .1], [0, .2, .28]), armR:P([.11, .52, .17], [-.3, 0, -.05]) }, face:{ pupil:.9, wide:.25, mouth:.35, lookX:-.3 } },
    scene(g, state, cat) {
      crt(g, -.5, .85, .5, new THREE.MeshBasicMaterial({ color:'#7fa6a0', toneMapped:false }), .9);
      cables(g, 40, [0, 1.4, -.75], [3.2, 2.0, .4]);
      cables(g, 8, [.75, .45, .6], [.5, .3, .6]);
      state.attached = hood(cat, g, '#b8322b', '#f5f1ea');
    },
    camera:[.2, 1.25, 3.0], target:[0, .8, .1],
  },
  guard: {
    caption:'THIS FILE DOES NOT GET IN',
    cat:{ pose:{ armL:P([-.11, .5, .18], [-1.5, 0, .95]), armR:P([.11, .56, .2], [-1.5, 0, -.95]), head:P([0, .87, .07], [-.1, 0, .06]) }, face:{ lid:.6, lookX:.2 }, outline:'#4dff7a' },
    scene(g, state) { state.screen = matrixTexture(256, 256); backdrop(g, state.screen, 3.6, 2.4, -.42, 1.0); },
    animate(t, state) { if (t - (state.last || 0) > .06) { state.last = t; state.screen.draw(); } },
    camera:[.1, 1.35, 2.7], target:[0, .7, .15],
  },
};
// for your own agent ids: an agent without a meme plays its room's meme
const ROOM_MEME = { writing:'vortex', code:'sniff', design:'designer', social:'social', research:'researcher', 'end-of-day':'end-of-day',
  workshop:'builder', maintenance:'guard', mail:'mail', data:'data', ceo:'ceo',
  'security-operations':'guard', labs:'builder' };
export function findMeme(id, room) { let m = MEMES[id] ?? ROOM_MEME[room]; while (typeof m === 'string') m = MEMES[m]; return m || null; }

/* ---------- caption ---------- */
function setupCaption() {
  if (!document.getElementById('memeFont')) {
    const l = document.createElement('link'); l.id = 'memeFont'; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Anton&display=swap'; document.head.append(l);
    const s = document.createElement('style');
    s.textContent = `#memeText{position:fixed;left:50%;bottom:9vh;transform:translate(-50%,20px) scale(.92);z-index:60;pointer-events:none;
      font:400 clamp(34px,5.6vw,86px)/1.02 Anton,Impact,'Arial Black',sans-serif;color:#fff;text-transform:uppercase;letter-spacing:.01em;
      -webkit-text-stroke:.07em #000;paint-order:stroke fill;text-shadow:0 .05em .12em rgba(0,0,0,.45);text-align:center;max-width:92vw;
      opacity:0;transition:opacity .25s ease,transform .35s cubic-bezier(.2,1.4,.4,1)}
      body.meme-open #labels{opacity:0;transition:opacity .2s}
      #memeText.open{opacity:1;transform:translate(-50%,0) scale(1)}`;
    document.head.append(s);
  }
  let d = document.getElementById('memeText');
  if (!d) { d = document.createElement('div'); d.id = 'memeText'; document.body.append(d); }
  return d;
}

/* ---------- player ---------- */
export function setupMeme({ goCamera, controls, cancel }) {
  let active = null, limitTimer = 0;
  // loosen the OrbitControls limits for the close-up (minDistance 14 pushes the camera back)
  const limits = controls ? { min:controls.minDistance, polar:controls.maxPolarAngle } : null;
  const loosen = () => { if (!limits) return; clearTimeout(limitTimer); controls.minDistance = 1.5; controls.maxPolarAngle = 1.5; };
  const restore = () => { if (!limits) return; clearTimeout(limitTimer); limitTimer = setTimeout(() => { controls.minDistance = limits.min; controls.maxPolarAngle = limits.polar; }, 1400); };
  const caption = setupCaption();
  function close() {
    if (!active) return null;
    const a = active; active = null;
    a.timers.forEach(clearTimeout);
    cancelAnimationFrame(a.frameHandle);
    a.cat.setMeme(null); a.cat.setOutline(null);
    a.attached.forEach(x => x.parent?.remove(x));
    a.props.parent?.remove(a.props);
    a.agent.memeActive = false;
    caption.classList.remove('open');
    document.body.classList.remove('meme-open');
    restore();
    return a.agent;
  }
  function play(agent, { onDone, hold = false, instant = false } = {}) {
    close();
    const cat = agent.cat; const m = findMeme(agent.id, agent.room);
    if (!cat || !m) { onDone?.(); return false; }
    const props = new THREE.Group(); cat.group.add(props);
    const state = {};
    m.scene?.(props, state, cat);
    const wasSleeping = cat.status === 'sleeping';
    cat.setMeme(m.cat, { instant });
    if (m.cat.outline) cat.setOutline(m.cat.outline);
    cat.group.updateMatrixWorld(true);
    const position = cat.group.localToWorld(new THREE.Vector3(...m.camera));
    const target = cat.group.localToWorld(new THREE.Vector3(...m.target));
    loosen();
    goCamera(position, target, 1.0, instant);
    agent.memeActive = true;
    document.body.classList.add('meme-open');
    const a = { agent, cat, props, attached:state.attached || [], timers:[], frameHandle:0 };
    active = a;
    const t0 = performance.now();
    const loop = () => { if (active !== a) return; m.animate?.((performance.now() - t0) / 1000, state); a.frameHandle = requestAnimationFrame(loop); };
    loop();
    const captionDelay = (wasSleeping ? 1100 : 0) + 650;
    a.timers.push(setTimeout(() => { caption.textContent = m.caption; caption.classList.add('open'); }, captionDelay));
    if (!hold) a.timers.push(setTimeout(() => { close(); onDone?.(); }, captionDelay + 3000));
    return true;
  }
  addEventListener('keydown', e => { if (e.key === 'Escape' && active) { const a = close(); cancel?.(a); } });
  return { play, close, active:() => !!active };
}
