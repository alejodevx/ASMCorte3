/*
 * Diorama de impacto biómico: valle fluvial low-poly generado por código (sin texturas ni modelos externos).
 * Un único parámetro, "estrés térmico" (0 → 1), deriva de la anomalía de temperatura y gobierna toda la escena:
 * nivel del río, color y follaje de la vegetación, cultivo, cielo, luz, niebla, polvo, nubes y aves.
 */
import * as THREE from 'three';

/* ───────── utilidades ───────── */
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const mix = (a, b, t) => a + (b - a) * t;
function hash(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, y) => vnoise(x, y) * 0.5 + vnoise(x * 2.1, y * 2.1) * 0.3 + vnoise(x * 4.3, y * 4.3) * 0.2;
function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ───────── geografía del valle ───────── */
const WATER_FULL = -0.8;
const WATER_LOW = -2.95;
const FIELD = { x0: -34, x1: -9, z0: -21, z1: 21 };
const riverX = (z) => 11 + 9 * Math.sin(z * 0.045) + 4 * Math.sin(z * 0.11 + 1.3);
const inField = (x, z) => x > FIELD.x0 && x < FIELD.x1 && z > FIELD.z0 && z < FIELD.z1;

function ground(x, z) {
  const d = Math.abs(x - riverX(z));
  const r = Math.hypot(x, z);
  let base = (fbm(x * 0.06 + 10, z * 0.06 + 10) - 0.5) * 1.6 + 0.45;
  base = mix(0.5, base, smooth(4, 12, r)); // claro plano donde está el observador
  if (inField(x, z)) base = mix(base, 0.45, 0.8);
  base += smooth(48, 95, r) * (12 + 26 * fbm(x * 0.022 + 5, z * 0.022 + 5));
  const bed = -3.25 + fbm(x * 0.2, z * 0.2) * 0.5;
  return mix(bed, base, smooth(4.5, 14, d));
}

const C = (hex) => new THREE.Color(hex);
const PAL = {
  skyTop: [C('#2f7fd0'), C('#b39a78')],
  skyHorizon: [C('#cfe6f2'), C('#f0c48c')],
  sun: [C('#fff6d8'), C('#ff9a4a')],
  dirLight: [C('#fff4e0'), C('#ffb469')],
  hemiGround: [C('#4c6b3a'), C('#7a5a3a')],
  water: [C('#2f8f9a'), C('#7a6a44')],
};

export function createDiorama(canvas, { reducedMotion = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xcfe6f2, 60, 260);
  const camera = new THREE.PerspectiveCamera(68, 1, 0.1, 700);
  camera.rotation.order = 'YXZ';
  camera.position.set(0, ground(0, 0) + 1.75, 0);

  const disposables = [];
  const track = (o) => { disposables.push(o); return o; };
  const rand = mulberry32(20261112);

  /* ── cielo ── */
  const skyMat = track(new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: PAL.skyTop[0].clone() }, horizon: { value: PAL.skyHorizon[0].clone() } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 horizon; varying vec3 vP; void main(){ float h = clamp(vP.y, 0.0, 1.0); gl_FragColor = vec4(mix(horizon, top, pow(h, 0.55)), 1.0); }',
  }));
  const sky = new THREE.Mesh(track(new THREE.SphereGeometry(500, 24, 12)), skyMat);
  scene.add(sky);

  const sunDir = new THREE.Vector3(0.75, 0.42, -0.5).normalize();
  const sunMat = track(new THREE.MeshBasicMaterial({ color: PAL.sun[0].clone(), fog: false }));
  const sun = new THREE.Mesh(track(new THREE.SphereGeometry(14, 16, 12)), sunMat);
  sun.position.copy(sunDir).multiplyScalar(420);
  scene.add(sun);
  const haloMat = track(new THREE.MeshBasicMaterial({ color: PAL.sun[0].clone(), fog: false, transparent: true, opacity: 0.18, depthWrite: false }));
  const halo = new THREE.Mesh(track(new THREE.SphereGeometry(30, 16, 12)), haloMat);
  halo.position.copy(sun.position);
  scene.add(halo);

  /* ── luces ── */
  const hemi = new THREE.HemisphereLight(0xcfe6f2, 0x4c6b3a, 1.0);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xfff4e0, 1.7);
  dir.position.copy(sunDir).multiplyScalar(100);
  scene.add(dir);

  /* ── terreno ── */
  const SIZE = 240;
  const SEG = 130;
  const terrainGeo = track(new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG));
  terrainGeo.rotateX(-Math.PI / 2);
  const pos = terrainGeo.attributes.position;
  const vCount = pos.count;
  const vh = new Float32Array(vCount);
  const vd = new Float32Array(vCount);
  const vn = new Float32Array(vCount);
  const vr = new Float32Array(vCount);
  const vfield = new Uint8Array(vCount);
  for (let i = 0; i < vCount; i += 1) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = ground(x, z);
    pos.setY(i, h);
    vh[i] = h;
    vd[i] = Math.abs(x - riverX(z));
    vn[i] = fbm(x * 0.13 + 40, z * 0.13 + 40);
    vr[i] = Math.hypot(x, z);
    vfield[i] = inField(x, z) ? 1 : 0;
  }
  terrainGeo.computeVertexNormals();
  const colors = new Float32Array(vCount * 3);
  terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const terrainMat = track(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, metalness: 0 }));
  scene.add(new THREE.Mesh(terrainGeo, terrainMat));

  function paintTerrain(s, level) {
    for (let i = 0; i < vCount; i += 1) {
      const h = vh[i];
      const n = vn[i];
      let r; let g; let b;
      if (h < level + 0.04) {
        r = 0.22; g = 0.2; b = 0.15; // fondo sumergido
      } else if (h < WATER_FULL + 0.25 && vd[i] < 14) {
        // lecho expuesto: arena húmeda cerca del agua, barro agrietado pálido arriba
        const t = clamp((h - level) / 1.3);
        const crack = n > 0.52 && n < 0.56 ? 0.72 : 1;
        r = mix(0.5, 0.8, t) * crack; g = mix(0.43, 0.71, t) * crack; b = mix(0.3, 0.54, t) * crack;
      } else if (vfield[i]) {
        r = mix(0.36, 0.63, s) + n * 0.06; g = mix(0.27, 0.52, s) + n * 0.05; b = mix(0.17, 0.38, s);
      } else {
        const far = smooth(50, 80, vr[i]);
        const dryT = smooth(-0.14, 0.16, s * 1.22 - n - far * 0.12);
        const bareT = smooth(0.3, 0.62, s * 1.22 - n);
        const gr = mix(0.2 + n * 0.12, 0.13, far);
        const gg = mix(0.5 + n * 0.16, 0.36 + n * 0.1, far);
        const gb = mix(0.2, 0.2, far);
        r = mix(mix(gr, 0.74, dryT), 0.6, bareT);
        g = mix(mix(gg, 0.63, dryT), 0.46, bareT);
        b = mix(mix(gb, 0.36, dryT), 0.31, bareT);
        const shade = 0.86 + clamp(h / 40) * 0.3;
        r *= shade; g *= shade; b *= shade;
      }
      colors[i * 3] = r; colors[i * 3 + 1] = g; colors[i * 3 + 2] = b;
    }
    terrainGeo.attributes.color.needsUpdate = true;
  }

  /* ── agua ── */
  const waterMat = track(new THREE.MeshStandardMaterial({ color: PAL.water[0].clone(), transparent: true, opacity: 0.84, roughness: 0.38, metalness: 0.05 }));
  const waterGeo = track(new THREE.PlaneGeometry(SIZE, SIZE, 1, 1));
  waterGeo.rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(waterGeo, waterMat);
  scene.add(water);

  /* ── árboles ── */
  const TREE_N = 300;
  const trees = [];
  let guard = 0;
  while (trees.length < TREE_N && guard < 6000) {
    guard += 1;
    const a = rand() * Math.PI * 2;
    const rr = 9 + rand() ** 0.8 * 74;
    const x = Math.cos(a) * rr;
    const z = Math.sin(a) * rr;
    const d = Math.abs(x - riverX(z));
    if (d < 12.5 || inField(x, z) || (x > 3 && x < 14 && Math.abs(z) < 3)) continue;
    const y = ground(x, z);
    if (y > 30) continue;
    const scale = 0.8 + rand() * 1.1 + (rr > 45 ? 0.5 : 0);
    trees.push({
      x, y, z, scale, rot: rand() * 6.28,
      thr: 0.3 + rand() * 0.75 + (d < 22 ? 0.22 : 0), // los árboles de ribera resisten más
      green: new THREE.Color().setHSL(0.27 + rand() * 0.08, 0.5 + rand() * 0.2, 0.25 + rand() * 0.1),
    });
  }
  const trunkGeo = track(new THREE.CylinderGeometry(0.1, 0.18, 1.8, 5));
  trunkGeo.translate(0, 0.9, 0);
  const trunkMat = track(new THREE.MeshStandardMaterial({ color: 0x5a4030, flatShading: true, roughness: 1 }));
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, trees.length);
  const leafGeo = track(new THREE.IcosahedronGeometry(1, 0));
  const leafMat = track(new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.9 }));
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, trees.length);
  const dummy = new THREE.Object3D();
  const tmpColor = new THREE.Color();
  const OCHRE = C('#b8923a');
  const DEAD = C('#7b6a58');
  trees.forEach((t, i) => {
    dummy.position.set(t.x, t.y - 0.1, t.z);
    dummy.rotation.set(0, t.rot, 0);
    dummy.scale.setScalar(t.scale);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
  });
  scene.add(trunks, leaves);

  function updateTrees(s) {
    trees.forEach((t, i) => {
      const dry = smooth(t.thr - 0.14, t.thr + 0.1, s);
      const bare = smooth(0.7, 1, dry);
      const k = t.scale * (1 - 0.62 * bare);
      dummy.position.set(t.x, t.y + 1.5 * t.scale + 0.55 * k, t.z);
      dummy.rotation.set(0, t.rot, 0);
      dummy.scale.set(k * 1.05, k * (1.15 - 0.3 * bare), k * 1.05);
      dummy.updateMatrix();
      leaves.setMatrixAt(i, dummy.matrix);
      tmpColor.copy(t.green).lerp(OCHRE, smooth(0, 0.75, dry)).lerp(DEAD, bare);
      leaves.setColorAt(i, tmpColor);
    });
    leaves.instanceMatrix.needsUpdate = true;
    leaves.instanceColor.needsUpdate = true;
  }

  /* ── juncos de la orilla ── */
  const reeds = [];
  for (let i = 0; i < 420; i += 1) {
    const z = -55 + rand() * 110;
    const side = rand() > 0.5 ? 1 : -1;
    const x = riverX(z) + side * (7.2 + rand() * 4.2);
    reeds.push({ x, z, y: ground(x, z), h: 0.7 + rand() * 0.9, thr: 0.15 + rand() * 0.6, rot: rand() * 6.28 });
  }
  const reedGeo = track(new THREE.ConeGeometry(0.09, 1, 4));
  reedGeo.translate(0, 0.5, 0);
  const reedMat = track(new THREE.MeshStandardMaterial({ flatShading: true, roughness: 1 }));
  const reedMesh = new THREE.InstancedMesh(reedGeo, reedMat, reeds.length);
  scene.add(reedMesh);
  const REED_G = C('#4f9a3a');
  const REED_D = C('#c9b06a');
  function updateReeds(s) {
    reeds.forEach((r, i) => {
      const dry = smooth(r.thr - 0.1, r.thr + 0.15, s);
      dummy.position.set(r.x, r.y - 0.05, r.z);
      dummy.rotation.set(0.25 * dry, r.rot, 0.2 * dry);
      dummy.scale.set(1 + dry * 0.3, r.h * (1 - 0.55 * dry), 1 + dry * 0.3);
      dummy.updateMatrix();
      reedMesh.setMatrixAt(i, dummy.matrix);
      reedMesh.setColorAt(i, tmpColor.copy(REED_G).lerp(REED_D, dry));
    });
    reedMesh.instanceMatrix.needsUpdate = true;
    reedMesh.instanceColor.needsUpdate = true;
  }

  /* ── cultivo ── */
  const crops = [];
  for (let x = FIELD.x0 + 2; x < FIELD.x1 - 1; x += 1.7) {
    for (let z = FIELD.z0 + 1.5; z < FIELD.z1 - 1; z += 1.05) {
      crops.push({ x: x + (rand() - 0.5) * 0.15, z: z + (rand() - 0.5) * 0.2, y: ground(x, z), thr: 0.25 + rand() * 0.5, h: 0.85 + rand() * 0.35 });
    }
  }
  const cropGeo = track(new THREE.ConeGeometry(0.3, 1.25, 5));
  cropGeo.translate(0, 0.62, 0);
  const cropMat = track(new THREE.MeshStandardMaterial({ flatShading: true, roughness: 1 }));
  const cropMesh = new THREE.InstancedMesh(cropGeo, cropMat, crops.length);
  scene.add(cropMesh);
  const CROP = [C('#3f9e2e'), C('#cfb746'), C('#86683c')];
  function updateCrops(s) {
    crops.forEach((c, i) => {
      const dry = smooth(c.thr - 0.2, c.thr + 0.2, s);
      const dead = smooth(c.thr + 0.15, c.thr + 0.5, s);
      dummy.position.set(c.x, c.y, c.z);
      dummy.rotation.set(0, i, 0.5 * dead);
      dummy.scale.set(1 - 0.3 * dead, c.h * (1 - 0.35 * dry - 0.3 * dead), 1 - 0.3 * dead);
      dummy.updateMatrix();
      cropMesh.setMatrixAt(i, dummy.matrix);
      cropMesh.setColorAt(i, tmpColor.copy(CROP[0]).lerp(CROP[1], dry).lerp(CROP[2], dead));
    });
    cropMesh.instanceMatrix.needsUpdate = true;
    cropMesh.instanceColor.needsUpdate = true;
  }

  /* ── objetos con escala humana: muelle, regla del río, canoa, casa ── */
  const wood = track(new THREE.MeshStandardMaterial({ color: 0x8a6a48, flatShading: true, roughness: 1 }));
  const dockY = ground(4, 0) + 0.12;
  const dock = new THREE.Mesh(track(new THREE.BoxGeometry(9.5, 0.14, 1.6)), wood);
  dock.position.set(8.2, dockY, 0);
  scene.add(dock);
  [[5, 0.7], [8, 0.7], [11, 0.7], [12.6, 0.7], [5, -0.7], [8, -0.7], [11, -0.7], [12.6, -0.7]].forEach(([x, z]) => {
    const post = new THREE.Mesh(track(new THREE.BoxGeometry(0.16, 4.6, 0.16)), wood);
    post.position.set(x, dockY - 2.2, z);
    scene.add(post);
  });

  // Regla limnimétrica: franjas de 50 cm para leer el nivel del río
  const gaugeCanvas = document.createElement('canvas');
  gaugeCanvas.width = 16; gaugeCanvas.height = 256;
  const gctx = gaugeCanvas.getContext('2d');
  for (let i = 0; i < 8; i += 1) {
    gctx.fillStyle = i % 2 ? '#f4efe4' : '#d5392f';
    gctx.fillRect(0, i * 32, 16, 32);
  }
  const gaugeTex = track(new THREE.CanvasTexture(gaugeCanvas));
  gaugeTex.colorSpace = THREE.SRGBColorSpace;
  const gaugePos = new THREE.Vector3(riverX(3.2) - 4.6, -1.3, 3.2);
  const gauge = new THREE.Mesh(track(new THREE.BoxGeometry(0.3, 4, 0.3)), track(new THREE.MeshStandardMaterial({ map: gaugeTex, roughness: 0.8 })));
  gauge.position.copy(gaugePos);
  scene.add(gauge);

  const canoeGeo = track(new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2));
  const canoe = new THREE.Mesh(canoeGeo, track(new THREE.MeshStandardMaterial({ color: 0x9a4f2e, flatShading: true, roughness: 0.9, side: THREE.DoubleSide })));
  const canoeXZ = { x: riverX(-5) - 3.4, z: -5 };
  const canoeGround = ground(canoeXZ.x, canoeXZ.z);
  canoe.scale.set(2.4, 0.5, 0.62);
  canoe.rotation.y = 0.5;
  scene.add(canoe);

  const houseG = ground(-5, -15);
  const house = new THREE.Mesh(track(new THREE.BoxGeometry(4, 2.4, 3.2)), track(new THREE.MeshStandardMaterial({ color: 0xe9dfc8, flatShading: true, roughness: 1 })));
  house.position.set(-5, houseG + 1.2, -15);
  const roof = new THREE.Mesh(track(new THREE.ConeGeometry(3.4, 1.6, 4)), track(new THREE.MeshStandardMaterial({ color: 0xa5482f, flatShading: true, roughness: 1 })));
  roof.position.set(-5, houseG + 3.2, -15);
  roof.rotation.y = Math.PI / 4;
  scene.add(house, roof);

  /* ── nubes ── */
  const cloudMat = track(new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, transparent: true, opacity: 0.95, roughness: 1, fog: false }));
  const cloudGeo = track(new THREE.IcosahedronGeometry(1, 1));
  const clouds = [];
  for (let i = 0; i < 9; i += 1) {
    const g = new THREE.Group();
    const puffs = 3 + Math.floor(rand() * 3);
    for (let p = 0; p < puffs; p += 1) {
      const m = new THREE.Mesh(cloudGeo, cloudMat);
      m.position.set((p - puffs / 2) * 7 + rand() * 3, rand() * 2, rand() * 5);
      m.scale.set(7 + rand() * 5, 3 + rand() * 2, 5 + rand() * 3);
      g.add(m);
    }
    const a = rand() * Math.PI * 2;
    const rr = 110 + rand() * 90;
    g.position.set(Math.cos(a) * rr, 55 + rand() * 30, Math.sin(a) * rr);
    g.userData = { a, rr, speed: 0.004 + rand() * 0.006 };
    clouds.push(g);
    scene.add(g);
  }

  /* ── aves ── */
  const birdGeo = track(new THREE.BufferGeometry());
  birdGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    0, 0, -0.25, -0.9, 0.12, 0.25, 0, 0, 0.2,
    0, 0, -0.25, 0, 0, 0.2, 0.9, 0.12, 0.25,
  ]), 3));
  const birdMat = track(new THREE.MeshBasicMaterial({ color: 0x1d2228, side: THREE.DoubleSide }));
  const BIRD_N = 16;
  const birdMesh = new THREE.InstancedMesh(birdGeo, birdMat, BIRD_N);
  const birds = Array.from({ length: BIRD_N }, () => ({
    r: 14 + rand() * 30, h: 9 + rand() * 9, speed: (0.12 + rand() * 0.14) * (rand() > 0.5 ? 1 : -1), phase: rand() * 6.28, cx: 8 + rand() * 10, cz: (rand() - 0.5) * 30,
  }));
  scene.add(birdMesh);

  /* ── polvo en suspensión ── */
  const DUST_N = 500;
  const dustPos = new Float32Array(DUST_N * 3);
  for (let i = 0; i < DUST_N; i += 1) {
    dustPos[i * 3] = (rand() - 0.5) * 70;
    dustPos[i * 3 + 1] = 0.5 + rand() * 11;
    dustPos[i * 3 + 2] = (rand() - 0.5) * 70;
  }
  const dustGeo = track(new THREE.BufferGeometry());
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dustMat = track(new THREE.PointsMaterial({ color: 0xe8c998, size: 0.16, transparent: true, opacity: 0, depthWrite: false }));
  scene.add(new THREE.Points(dustGeo, dustMat));

  /* ───────── estado y aplicación del estrés ───────── */
  let target = 0;
  let current = -1;
  let level = WATER_FULL;

  function apply(s) {
    level = mix(WATER_FULL, WATER_LOW, smooth(0, 1, s) * 0.55 + s * 0.45);
    paintTerrain(s, level);
    updateTrees(s);
    updateReeds(s);
    updateCrops(s);
    skyMat.uniforms.top.value.copy(PAL.skyTop[0]).lerp(PAL.skyTop[1], s);
    skyMat.uniforms.horizon.value.copy(PAL.skyHorizon[0]).lerp(PAL.skyHorizon[1], s);
    scene.fog.color.copy(skyMat.uniforms.horizon.value);
    scene.fog.near = mix(60, 22, s);
    scene.fog.far = mix(270, 135, s);
    sunMat.color.copy(PAL.sun[0]).lerp(PAL.sun[1], s);
    haloMat.color.copy(sunMat.color);
    haloMat.opacity = mix(0.16, 0.42, s);
    halo.scale.setScalar(mix(1, 1.9, s));
    dir.color.copy(PAL.dirLight[0]).lerp(PAL.dirLight[1], s);
    dir.intensity = mix(1.7, 2.3, s);
    hemi.color.copy(skyMat.uniforms.horizon.value);
    hemi.groundColor.copy(PAL.hemiGround[0]).lerp(PAL.hemiGround[1], s);
    hemi.intensity = mix(1.0, 0.85, s);
    waterMat.color.copy(PAL.water[0]).lerp(PAL.water[1], s);
    waterMat.opacity = mix(0.84, 0.92, s);
    cloudMat.opacity = 0.95 * (1 - smooth(0.15, 0.95, s));
    dustMat.opacity = smooth(0.3, 1, s) * 0.75;
    birdMesh.count = Math.max(1, Math.round(BIRD_N * (1 - 0.9 * s)));
    renderer.toneMappingExposure = mix(1.0, 1.12, s);
    // la canoa flota hasta que el agua baja de su quilla; luego queda varada e inclinada
    const floatY = level + 0.12;
    const restY = canoeGround + 0.3;
    const grounded = smooth(0, 0.25, restY - floatY);
    canoe.position.set(canoeXZ.x, Math.max(floatY, restY), canoeXZ.z);
    canoe.rotation.z = 0.32 * grounded;
  }

  /* ───────── cámara: mirar alrededor ───────── */
  let yaw = -Math.PI / 2 + 0.35; // mirando hacia el río
  let pitch = -0.06;
  let vyaw = 0;
  let autoRotate = !reducedMotion;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  const onDown = (e) => {
    dragging = true; autoRotate = false;
    lastX = e.clientX; lastY = e.clientY;
    canvas.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    const k = 0.0042;
    yaw += dx * k;
    vyaw = dx * k;
    if (e.pointerType === 'mouse') pitch = clamp(pitch + dy * k, -0.55, 0.75);
  };
  const onUp = () => { dragging = false; };
  const onKey = (e) => {
    const step = { ArrowLeft: 0.12, ArrowRight: -0.12 }[e.key];
    if (step) { yaw += step; autoRotate = false; e.preventDefault(); }
    if (e.key === 'ArrowUp') { pitch = clamp(pitch + 0.08, -0.55, 0.75); e.preventDefault(); }
    if (e.key === 'ArrowDown') { pitch = clamp(pitch - 0.08, -0.55, 0.75); e.preventDefault(); }
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('keydown', onKey);

  /* ───────── puntos de interés proyectados a pantalla ───────── */
  const hotspots = [
    { id: 'rio', p: new THREE.Vector3(gaugePos.x, 0.9, gaugePos.z) },
    { id: 'cultivo', p: new THREE.Vector3(-17, 2.6, 2) },
    { id: 'ladera', p: new THREE.Vector3(-30, 20, -78) },
    { id: 'cielo', p: sunDir.clone().multiplyScalar(300).add(new THREE.Vector3(0, -40, 0)) },
  ];
  let hotspotEls = {};
  const proj = new THREE.Vector3();
  let width = 1;
  let height = 1;

  function placeHotspots() {
    hotspots.forEach((h) => {
      const el = hotspotEls[h.id];
      if (!el) return;
      proj.copy(h.p).project(camera);
      const visible = proj.z < 1 && Math.abs(proj.x) < 0.96 && Math.abs(proj.y) < 0.9;
      if (!visible) { el.style.visibility = 'hidden'; return; }
      el.style.visibility = 'visible';
      el.style.transform = `translate(${((proj.x + 1) / 2) * width}px, ${((1 - proj.y) / 2) * height}px)`;
    });
  }

  /* ───────── bucle ───────── */
  let raf = 0;
  let running = false;
  let last = 0;
  let time = 0;

  function frame(now) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    time += dt;

    if (current < 0) { current = target; apply(current); }
    else if (Math.abs(target - current) > 0.0008) {
      current += (target - current) * Math.min(1, dt * (reducedMotion ? 30 : 2.6));
      apply(current);
    }

    if (autoRotate) yaw -= dt * 0.045;
    if (!dragging) { yaw += vyaw; vyaw *= 0.9; }
    camera.rotation.set(pitch, yaw, 0);

    water.position.y = level + Math.sin(time * 0.9) * 0.025;
    if (current < 0.75) canoe.position.y += Math.sin(time * 1.3) * 0.0015;

    clouds.forEach((c) => {
      c.userData.a += c.userData.speed * dt;
      c.position.x = Math.cos(c.userData.a) * c.userData.rr;
      c.position.z = Math.sin(c.userData.a) * c.userData.rr;
    });
    for (let i = 0; i < birdMesh.count; i += 1) {
      const b = birds[i];
      const a = b.phase + time * b.speed;
      dummy.position.set(b.cx + Math.cos(a) * b.r, b.h + Math.sin(time * 0.7 + b.phase) * 1.2, b.cz + Math.sin(a) * b.r);
      dummy.rotation.set(0, -a + (b.speed > 0 ? 0 : Math.PI), Math.sin(time * 7 + b.phase) * 0.35);
      dummy.scale.setScalar(0.8);
      dummy.updateMatrix();
      birdMesh.setMatrixAt(i, dummy.matrix);
    }
    birdMesh.instanceMatrix.needsUpdate = true;

    if (dustMat.opacity > 0.01) {
      const arr = dustGeo.attributes.position.array;
      for (let i = 0; i < DUST_N; i += 1) {
        arr[i * 3] += dt * (0.6 + (i % 7) * 0.12);
        arr[i * 3 + 1] += Math.sin(time + i) * dt * 0.08;
        if (arr[i * 3] > 35) arr[i * 3] = -35;
      }
      dustGeo.attributes.position.needsUpdate = true;
    }

    renderer.render(scene, camera);
    placeHotspots();
  }

  return {
    setStress(s) { target = clamp(s); },
    setHotspotElements(map) { hotspotEls = map; },
    lookAt(id) {
      const h = hotspots.find((x) => x.id === id);
      if (!h) return;
      autoRotate = false;
      yaw = Math.atan2(-(h.p.x - camera.position.x), -(h.p.z - camera.position.z));
      pitch = clamp(Math.atan2(h.p.y - camera.position.y, Math.hypot(h.p.x, h.p.z)), -0.55, 0.75);
    },
    resize(w, h) {
      width = Math.max(1, w); height = Math.max(1, h);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.fov = width / height < 0.9 ? 82 : 68;
      camera.updateProjectionMatrix();
    },
    start() {
      if (running) return;
      running = true; last = performance.now();
      raf = requestAnimationFrame(frame);
    },
    stop() { running = false; cancelAnimationFrame(raf); },
    renderOnce() { if (current < 0) { current = target; apply(current); } camera.rotation.set(pitch, yaw, 0); renderer.render(scene, camera); placeHotspots(); },
    dispose() {
      running = false; cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('keydown', onKey);
      [trunks, leaves, reedMesh, cropMesh, birdMesh].forEach((m) => m.dispose());
      disposables.forEach((d) => d.dispose?.());
      renderer.dispose();
    },
  };
}
