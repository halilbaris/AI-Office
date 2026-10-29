// MyOffice · panel avatars: each agent's own 3D cat in its meme pose, head-and-shoulders portrait (256×256)
// Built once at startup in a separate small renderer; returns Map<agentId, dataURL>.
import * as THREE from 'three';
import { createCat } from './cat.js';
import { findMeme } from './meme.js';

const SIZE = 256;

export function buildPortraits(agents, { pattern, accessory, color }) {
  const result = new Map();
  let r;
  try {
    r = new THREE.WebGLRenderer({ antialias:true, preserveDrawingBuffer:true });
  } catch { return result; } // without WebGL the initial-letter badges stay
  r.setPixelRatio(1); r.setSize(SIZE, SIZE, false);
  r.toneMapping = THREE.ACESFilmicToneMapping; r.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#fff6ea', '#cdb99d', 1.5));
  const sun = new THREE.DirectionalLight('#ffe2bf', 2.4); sun.position.set(-2, 3, 4); scene.add(sun);
  const camera = new THREE.PerspectiveCamera(28, 1, .05, 20);
  const headPos = new THREE.Vector3(), forward = new THREE.Vector3(), q = new THREE.Quaternion();

  agents.forEach(a => {
    const cat = createCat({ pattern:pattern(a), accessory:accessory(a) });
    scene.add(cat.group);
    const m = findMeme(a.id, a.room);
    if (m) {
      // attached props (hood, handset) bind to the cat; the decor group is not added to the scene
      m.scene?.(new THREE.Group(), {}, cat);
      cat.setMeme(m.cat, { instant:true });
      if (m.cat.outline) cat.setOutline(m.cat.outline);
    } else cat.setStatus('working');
    cat.update(1 / 60);
    cat.group.updateMatrixWorld(true);
    cat.nodes.head.getWorldPosition(headPos);
    cat.nodes.head.getWorldQuaternion(q);
    forward.set(0, 0, 1).applyQuaternion(q).setY(0).normalize();
    if (forward.lengthSq() < .01) forward.set(0, 0, 1);
    camera.position.copy(headPos).addScaledVector(forward, 1.65).add(new THREE.Vector3(0, .1, 0));
    camera.lookAt(headPos.x, headPos.y - .2, headPos.z);
    scene.background = new THREE.Color(color(a));
    r.render(scene, camera);
    result.set(a.id, r.domElement.toDataURL('image/jpeg', .9));
    scene.remove(cat.group);
  });
  r.dispose(); r.forceContextLoss();
  return result;
}
