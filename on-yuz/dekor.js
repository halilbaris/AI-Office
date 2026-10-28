// Ajan Ofisi · canlı dekor: kilim, poster, bitki, masa lambası, kedi eşyaları (prosedürel, harici dosya yok)
import * as THREE from 'three';

const M = new Map();
const mat = (renk, ek = {}) => {
  const k = renk + JSON.stringify(ek);
  if (!M.has(k)) M.set(k, new THREE.MeshStandardMaterial({ color:renk, roughness:.85, ...ek }));
  return M.get(k);
};
function parca(g, geo, m, x, y, z, golge = true) {
  const p = new THREE.Mesh(geo, m); p.position.set(x, y, z);
  p.castShadow = golge; p.receiveShadow = true; g.add(p); return p;
}
function tuval(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return { x:c.getContext('2d'), t };
}
// küçük deterministik rastgele: her oda her açılışta aynı görünsün
function tohum(s) { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0) / 4294967296); }

/* ---------- kilim ---------- */
function kilimDoku(renkler, r) {
  const { x, t } = tuval(512, 256);
  x.fillStyle = renkler[0]; x.fillRect(0, 0, 512, 256);
  x.fillStyle = renkler[1]; x.fillRect(14, 14, 484, 228);
  x.fillStyle = renkler[0]; x.fillRect(26, 26, 460, 204);
  const elmas = (cx, cy, w, h, renk) => { x.fillStyle = renk; x.beginPath(); x.moveTo(cx, cy - h); x.lineTo(cx + w, cy); x.lineTo(cx, cy + h); x.lineTo(cx - w, cy); x.fill(); };
  for (let i = 0; i < 5; i++) {
    const cx = 70 + i * 93;
    elmas(cx, 128, 38, 70, renkler[2]); elmas(cx, 128, 24, 44, renkler[3]); elmas(cx, 128, 10, 18, renkler[1]);
  }
  x.fillStyle = renkler[3];
  for (let i = 0; i < 24; i++) { x.fillRect(30 + i * 19.5, 34, 8, 8); x.fillRect(30 + i * 19.5, 214, 8, 8); }
  x.globalAlpha = .08; x.fillStyle = '#000';
  for (let i = 0; i < 1600; i++) x.fillRect(r() * 512, r() * 256, 2, 1);
  t.needsUpdate = true; return t;
}
function kilim(g, oda, r) {
  const renkler = [oda.hali1, '#fff5e6', oda.duvar || oda.hali2, oda.hali2];
  const m = new THREE.Mesh(new THREE.BoxGeometry(5.2, .025, 2.6), [mat('#e9dccb'), mat('#e9dccb'), new THREE.MeshStandardMaterial({ map:kilimDoku(renkler, r), roughness:.95 }), mat('#e9dccb'), mat('#e9dccb'), mat('#e9dccb')]);
  m.position.set(0, .125, .75); m.receiveShadow = true; g.add(m);
}

/* ---------- poster ---------- */
const POSTERLER = [
  (x, a, b) => { x.fillStyle = a; x.fillRect(0, 0, 200, 260); x.fillStyle = '#fff5e6'; x.beginPath(); x.arc(100, 120, 62, 0, 7); x.fill(); x.fillStyle = b; [0, 1, 2].forEach(i => x.fillRect(30, 200 + i * 14, 140, 7)); },
  (x, a, b) => { x.fillStyle = '#fff5e6'; x.fillRect(0, 0, 200, 260); x.fillStyle = a; x.beginPath(); x.moveTo(40, 190); x.lineTo(55, 70); x.lineTo(85, 110); x.lineTo(115, 110); x.lineTo(145, 70); x.lineTo(160, 190); x.closePath(); x.fill();
    x.fillStyle = '#fff5e6'; [[80, 140], [120, 140]].forEach(([cx, cy]) => { x.beginPath(); x.arc(cx, cy, 9, 0, 7); x.fill(); }); x.fillStyle = b; x.font = '700 28px sans-serif'; x.textAlign = 'center'; x.fillText('MİYAV', 100, 238); },
  (x, a, b) => { x.fillStyle = b; x.fillRect(0, 0, 200, 260); for (let i = 0; i < 6; i++) { x.fillStyle = i % 2 ? a : '#fff5e6'; x.beginPath(); x.arc(100, 260, 210 - i * 34, Math.PI, 0); x.fill(); } },
  (x, a, b) => { x.fillStyle = '#fff5e6'; x.fillRect(0, 0, 200, 260); x.fillStyle = a; x.fillRect(20, 20, 75, 105); x.fillStyle = b; x.fillRect(105, 20, 75, 105); x.fillStyle = b; x.fillRect(20, 135, 75, 105); x.fillStyle = a; x.beginPath(); x.arc(142, 187, 36, 0, 7); x.fill(); },
];
function poster(g, x, y, z, ry, tur, a, b) {
  const { x:ctx, t } = tuval(200, 260);
  POSTERLER[tur % POSTERLER.length](ctx, a, b); t.needsUpdate = true;
  const p = new THREE.Group(); p.position.set(x, y, z); p.rotation.y = ry; g.add(p);
  parca(p, new THREE.BoxGeometry(.86, 1.1, .04), mat('#4a3f35'), 0, 0, 0, false);
  parca(p, new THREE.PlaneGeometry(.74, .96), new THREE.MeshStandardMaterial({ map:t, roughness:.7 }), 0, 0, .025, false);
}

/* ---------- bitki (farklı boylar) ---------- */
const YAPRAK = ['#6fae5c', '#82c06a', '#5d9a55', '#9ccc6b'];
function bitki(g, x, z, boy, r, saksi) {
  const s = new THREE.Group(); s.position.set(x, .12, z); g.add(s);
  parca(s, new THREE.CylinderGeometry(.22 * boy, .17 * boy, .36 * boy, 18), mat(saksi), 0, .18 * boy, 0);
  if (boy > 1.2) { // uzun: gövde + taç
    parca(s, new THREE.CylinderGeometry(.03, .04, 1.1 * boy, 6), mat('#7a5a3a'), 0, .9 * boy, 0);
    for (let i = 0; i < 7; i++) {
      const y = (1.1 + r() * .7) * boy, a = r() * 6.28;
      const yap = parca(s, new THREE.IcosahedronGeometry((.2 + r() * .14) * boy, 0), mat(YAPRAK[i % 4], { flatShading:true }), Math.cos(a) * .22 * boy, y, Math.sin(a) * .22 * boy);
      yap.scale.y = .8;
    }
  } else { // alçak: yayılan yapraklar
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * 6.28 + r() * .3;
      const y = parca(s, new THREE.SphereGeometry(.13 * boy, 8, 6), mat(YAPRAK[i % 4], { flatShading:true }), Math.cos(a) * .2 * boy, (.42 + r() * .3) * boy, Math.sin(a) * .2 * boy);
      y.scale.set(.6, 1.4, .6); y.rotation.set(Math.sin(a) * .6, 0, -Math.cos(a) * .6);
    }
  }
}

/* ---------- kedi eşyaları ---------- */
function kediYatagi(g, x, z, renk) {
  const y = new THREE.Group(); y.position.set(x, .13, z); g.add(y);
  parca(y, new THREE.TorusGeometry(.36, .13, 12, 28), mat(renk, { roughness:.95 }), 0, .1, 0).rotation.x = Math.PI / 2;
  parca(y, new THREE.CylinderGeometry(.34, .34, .08, 24), mat('#fff3e2', { roughness:.95 }), 0, .05, 0);
}
function mamaKabi(g, x, z, renk) {
  const k = new THREE.Group(); k.position.set(x, .13, z); g.add(k);
  parca(k, new THREE.CylinderGeometry(.2, .15, .1, 20), mat(renk, { roughness:.4 }), 0, .05, 0);
  for (let i = 0; i < 10; i++) parca(k, new THREE.SphereGeometry(.035, 6, 4), mat('#b9824a'), (Math.random() - .5) * .2, .11, (Math.random() - .5) * .2, false);
}
function tirmalama(g, x, z, renk) {
  const t = new THREE.Group(); t.position.set(x, .12, z); g.add(t);
  parca(t, new THREE.BoxGeometry(.7, .08, .7), mat(renk), 0, .04, 0);
  parca(t, new THREE.CylinderGeometry(.1, .1, 1.1, 14), mat('#d8bf8f', { roughness:1 }), 0, .63, 0);
  parca(t, new THREE.BoxGeometry(.55, .07, .55), mat(renk), 0, 1.2, 0);
  const top = parca(t, new THREE.SphereGeometry(.07, 12, 8), mat('#ff7a59'), .18, .95, .18);
  parca(t, new THREE.CylinderGeometry(.006, .006, .26, 4), mat('#6d5a48'), .18, 1.09, .18, false);
  return top;
}
function yumak(g, x, z, renk) {
  const { x:ctx, t } = tuval(128, 64);
  ctx.fillStyle = renk; ctx.fillRect(0, 0, 128, 64); ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 2;
  for (let i = 0; i < 18; i++) { ctx.beginPath(); ctx.moveTo(i * 9, 0); ctx.lineTo(i * 9 + 30, 64); ctx.stroke(); }
  t.needsUpdate = true;
  const y = new THREE.Group(); y.position.set(x, 0, z); g.add(y);
  parca(y, new THREE.SphereGeometry(.14, 16, 12), new THREE.MeshStandardMaterial({ map:t, roughness:1 }), 0, .26, 0);
  const ip = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(.1, .14, 0), new THREE.Vector3(.4, .13, .2), new THREE.Vector3(.7, .13, -.1)]), 20, .01, 4), mat(renk));
  y.add(ip);
}

/* ---------- kurulum ---------- */
const ESYA = [kediYatagi, mamaKabi, tirmalama, yumak];
export function dekorKur(odalar) {
  odalar.forEach((oda, i) => {
    const g = oda.grup; if (!g) return;
    const r = tohum(oda.id);
    const duvar = oda.duvar || oda.hali1; // cam CEO odasının duvarı yok
    if (!oda.altin) kilim(g, oda, r);
    const W = (oda.w0 ?? oda.w) / 2, D = (oda.d0 ?? oda.d) / 2; // taban ölçü; geniş odada index.html kenara yaslar
    if (!oda.cam) {
      // sol duvara iki çerçeve
      poster(g, -W + .27, 1.65, -.9, Math.PI / 2, i, oda.duvar, oda.hali2);
      poster(g, -W + .27, 1.5, .5, Math.PI / 2, i + 1, oda.hali2, oda.duvar);
    }
    // bitkiler: biri uzun, biri alçak
    const saksi = ['#e9805f', '#f2c14e', '#7fb5dc', '#b39ae6', '#fff5e6'][i % 5];
    bitki(g, W - .7, D - 1.0, 1.5, r, saksi);
    bitki(g, -W + .8, D - 1.4, .9, r, '#fff5e6');
    // her odaya iki kedi eşyası
    const a = ESYA[i % 4], b = ESYA[(i + 2) % 4];
    a(g, 2.3, 1.75, oda.hali2); b(g, -2.4, 1.6, duvar);
  });
}
// masa lambaları: yanık, sıcak ışıklı abajur
const ABAJUR = new THREE.MeshStandardMaterial({ color:'#fff1cf', emissive:'#ffc46b', emissiveIntensity:1.4, roughness:.6, side:THREE.DoubleSide });
export function masaLambasi(g, x = .8, z = .55) {
  const l = new THREE.Group(); l.position.set(x, .86, z); g.add(l);
  parca(l, new THREE.CylinderGeometry(.09, .1, .03, 16), mat('#3d352e'), 0, .015, 0);
  parca(l, new THREE.CylinderGeometry(.012, .012, .42, 6), mat('#3d352e'), 0, .23, 0);
  parca(l, new THREE.ConeGeometry(.16, .18, 18, 1, true), ABAJUR, 0, .46, 0);
  const isik = new THREE.Mesh(new THREE.CircleGeometry(.3, 20), new THREE.MeshBasicMaterial({ color:'#ffd27f', transparent:true, opacity:.35, depthWrite:false }));
  isik.rotation.x = -Math.PI / 2; isik.position.y = .006; l.add(isik);
}
