// 3D stadium scene. Loaded lazily (dynamic import) so the HTML app works without WebGL.
// Players are 2D textured cards (never 3D bodies). All data comes from the ranking rows passed in.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const CARD_W = 2.35, CARD_H = 2.94, RADIUS = 10.5, CARD_Y = 2.8;
const HOME = { pos: new THREE.Vector3(0, 4.9, 14.8), look: new THREE.Vector3(0, 2.6, -2) };

function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

function drawCard(canvas, row, img, selected, unitLabel) {
  const c = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
  const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#18295a'); g.addColorStop(1, '#0a1230');
  c.clearRect(0, 0, W, H); c.fillStyle = g; roundRect(c, 0, 0, W, H, 34); c.fill();
  c.lineWidth = selected ? 10 : 4; c.strokeStyle = selected ? '#ff4fa0' : '#3a5083'; roundRect(c, 3, 3, W - 6, H - 6, 32); c.stroke();
  const px = 24, py = 24, pw = W - 48, ph = Math.round(H * 0.56);
  c.save(); roundRect(c, px, py, pw, ph, 22); c.clip();
  if (img) {
    const s = Math.max(pw / img.width, ph / img.height), w = img.width * s, h = img.height * s;
    c.drawImage(img, px + (pw - w) / 2, py, w, h); // anchored to the top: faces stay in frame
  } else {
    const rg = c.createRadialGradient(W / 2, py + ph * 0.35, 10, W / 2, py + ph * 0.35, pw); rg.addColorStop(0, '#223a78'); rg.addColorStop(1, '#0a1230'); c.fillStyle = rg; c.fillRect(px, py, pw, ph);
    c.fillStyle = '#6a7fb2'; c.font = '800 150px Inter, Segoe UI, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(row.player.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase(), W / 2, py + ph / 2);
  }
  c.restore();
  c.fillStyle = 'rgba(7,13,31,.85)'; roundRect(c, px + 12, py + 12, 92, 52, 14); c.fill(); c.strokeStyle = '#d9b25f'; c.lineWidth = 3; c.stroke();
  c.fillStyle = '#d9b25f'; c.font = '800 34px Inter, Segoe UI, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('#' + row.rank, px + 58, py + 39);
  c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.fillStyle = '#f2f5ff';
  let size = 50; c.font = `700 ${size}px Inter, Segoe UI, sans-serif`; while (c.measureText(row.player).width > W - 48 && size > 24) { size -= 2; c.font = `700 ${size}px Inter, Segoe UI, sans-serif`; }
  c.fillText(row.player, 24, py + ph + 62);
  c.fillStyle = '#ff4fa0'; c.font = '800 58px Inter, Segoe UI, sans-serif'; c.fillText(row.rating.toFixed(1), 24, py + ph + 128);
  c.fillStyle = '#a9b8d6'; c.font = '500 25px Inter, Segoe UI, sans-serif'; c.fillText(unitLabel, 24, py + ph + 158);
  c.fillText(`${Math.round(row.pressure_events)} pressure events · ${Math.round(row.pressure_matches)} matches`, 24, py + ph + 194);
}

export function webglAvailable() {
  try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch { return false; }
}

export function createStage(el, { onSelect, portraitUrl, reduced }) {
  if (!webglAvailable()) throw new Error('WebGL unavailable');
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x050a18);
  el.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-hidden', 'true');

  const scene = new THREE.Scene(); scene.fog = new THREE.FogExp2(0x050a18, 0.018);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 120); camera.position.copy(HOME.pos); camera.lookAt(HOME.look);
  const controls = new OrbitControls(camera, renderer.domElement);
  Object.assign(controls, { enableDamping: !reduced, dampingFactor: 0.08, enablePan: false, enableZoom: false, minPolarAngle: 0.7, maxPolarAngle: 1.45, minAzimuthAngle: -0.9, maxAzimuthAngle: 0.9, rotateSpeed: 0.5 });
  controls.target.copy(HOME.look); controls.update();

  // --- Ground, boundary, pitch markings ---
  const grass = new THREE.Mesh(new THREE.CircleGeometry(24, 96), new THREE.MeshStandardMaterial({ color: 0x0d2a2c, roughness: 1 }));
  grass.rotation.x = -Math.PI / 2; scene.add(grass);
  for (let i = 0; i < 12; i++) { // mowing stripes
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(4, 40), new THREE.MeshBasicMaterial({ color: i % 2 ? 0x103236 : 0x0b2527, transparent: true, opacity: 0.55 }));
    stripe.rotation.x = -Math.PI / 2; stripe.position.set(-22 + i * 4 + 2, 0.005, 0); stripe.scale.y = 1; scene.add(stripe);
  }
  const rope = new THREE.Mesh(new THREE.TorusGeometry(19.5, 0.07, 8, 128), new THREE.MeshBasicMaterial({ color: 0xff4fa0 })); rope.rotation.x = Math.PI / 2; rope.position.y = 0.05; scene.add(rope);
  const circle = new THREE.Mesh(new THREE.RingGeometry(9.7, 9.76, 96), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, side: THREE.DoubleSide })); circle.rotation.x = -Math.PI / 2; circle.position.y = 0.02; scene.add(circle);
  const pitch = new THREE.Mesh(new THREE.BoxGeometry(3.05, 0.03, 20.12 * 0.7), new THREE.MeshStandardMaterial({ color: 0x9c8660, roughness: 0.95 })); pitch.position.set(0, 0.02, 0); scene.add(pitch);
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  [-1, 1].forEach((s) => {
    const crease = new THREE.Mesh(new THREE.BoxGeometry(3.05, 0.01, 0.05), lineMat); crease.position.set(0, 0.045, s * 6.0); scene.add(crease);
    const pop = new THREE.Mesh(new THREE.BoxGeometry(3.05, 0.01, 0.05), lineMat); pop.position.set(0, 0.046, s * 4.6); scene.add(pop);
    for (let k = -1; k <= 1; k++) { const st = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.7, 8), new THREE.MeshStandardMaterial({ color: 0xf3e9c8 })); st.position.set(k * 0.11, 0.37, s * 7.0); scene.add(st); }
  });
  // Stand ring (dark, low) and floodlight towers
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(30, 22, 7, 96, 1, true), new THREE.MeshStandardMaterial({ color: 0x0a1330, side: THREE.BackSide, roughness: 1 })); stand.position.y = 3.2; scene.add(stand);
  const spots = [];
  [[-22, -8], [22, -8], [-24, 14], [24, 14]].forEach(([x, z]) => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 17, 8), new THREE.MeshStandardMaterial({ color: 0x1c2a52 })); pole.position.set(x, 8.5, z); scene.add(pole);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.8, 0.25), new THREE.MeshBasicMaterial({ color: 0xfff4d6 })); panel.position.set(x, 17.4, z); panel.lookAt(0, 3, 0); scene.add(panel);
    const sp = new THREE.SpotLight(0xfff1cf, 220, 70, 0.5, 0.7, 1.4); sp.position.set(x, 17.4, z); sp.target.position.set(0, 1.6, -2); scene.add(sp, sp.target); spots.push(sp);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(5.2, 18, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff1cf, transparent: true, opacity: 0.018, side: THREE.DoubleSide, depthWrite: false })); // restrained beam
    cone.position.copy(sp.position).lerp(new THREE.Vector3(0, 1.6, -2), 0.5); cone.lookAt(0, 1.6, -2); cone.rotateX(Math.PI / 2); scene.add(cone);
  });
  scene.add(new THREE.HemisphereLight(0x6f8fd6, 0x0a1020, 0.55));

  // --- Cards ---
  const cardGroup = new THREE.Group(); scene.add(cardGroup);
  let cards = [], hovered = null, selectedId = null, rows = [], unit = 'run-eq / 100 pressure events';
  const imgCache = new Map();
  const loadImg = (url) => new Promise((res) => { if (!url) return res(null); if (imgCache.has(url)) return res(imgCache.get(url)); const im = new Image(); im.onload = () => { imgCache.set(url, im); res(im); }; im.onerror = () => res(null); im.src = url; });
  let dirty = true;
  const disposeCards = () => { cards.forEach((c) => { c.tex.dispose(); c.mesh.material.dispose(); c.mesh.geometry.dispose(); c.base.geometry.dispose(); c.base.material.dispose(); }); cards = []; cardGroup.clear(); };

  async function setRows(newRows) {
    rows = newRows.slice(0, 10); disposeCards();
    const n = rows.length, span = Math.min(2.5, 0.25 * Math.max(n - 1, 0) + 0.25); // radians total across the arc
    for (let i = 0; i < n; i++) {
      const r = rows[i], a = n === 1 ? 0 : -span / 2 + (span * i) / (n - 1);
      const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 640;
      const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W, CARD_H), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }));
      const home = new THREE.Vector3(Math.sin(a) * RADIUS, CARD_Y, -Math.cos(a) * RADIUS + 1);
      mesh.position.copy(home); mesh.lookAt(0, CARD_Y, 6); mesh.userData.id = r.player_id;
      const base = new THREE.Mesh(new THREE.BoxGeometry(CARD_W * 0.9, 0.12, 0.7), new THREE.MeshStandardMaterial({ color: 0x14234c, emissive: 0x24122e, roughness: 0.6 })); base.position.set(home.x, 0.7, home.z); base.lookAt(0, 0.7, 6);
      cardGroup.add(mesh, base);
      const card = { id: r.player_id, mesh, base, tex, canvas, home, row: r, img: null, tilt: new THREE.Vector2(), tiltTarget: new THREE.Vector2(), lift: 0, liftTarget: 0 };
      cards.push(card); drawCard(canvas, r, null, false, unit); tex.needsUpdate = true;
      loadImg(portraitUrl(r.player_id)).then((im) => { if (im && cards.includes(card)) { card.img = im; redraw(card); } });
    }
    dirty = true;
  }
  const redraw = (c) => { drawCard(c.canvas, c.row, c.img, c.id === selectedId, unit); c.tex.needsUpdate = true; dirty = true; };

  // --- Camera tweening (instant when reduced motion) ---
  let camGoal = { pos: HOME.pos.clone(), look: HOME.look.clone() }, curLook = HOME.look.clone();
  function flyTo(pos, look) { camGoal = { pos: pos.clone(), look: look.clone() }; if (reduced) { camera.position.copy(pos); curLook.copy(look); controls.target.copy(look); camera.lookAt(look); } dirty = true; }
  function select(id) {
    selectedId = id; const c = cards.find((k) => k.id === id);
    cards.forEach((k) => { k.liftTarget = k.id === id ? 1 : 0; redraw(k); });
    if (c) flyTo(new THREE.Vector3(c.home.x * 0.3, 4.6, 12), new THREE.Vector3(c.home.x * 0.5, CARD_Y, c.home.z + 1)); else flyTo(HOME.pos, HOME.look);
    if (reduced) cards.forEach((k) => { k.lift = k.liftTarget; applyCard(k); });
  }
  const resetCamera = () => { selectedId = null; cards.forEach((k) => { k.liftTarget = 0; redraw(k); }); flyTo(HOME.pos, HOME.look); if (reduced) cards.forEach((k) => { k.lift = 0; applyCard(k); }); };
  function applyCard(k) {
    const dir = new THREE.Vector3(0, 0, 6).sub(k.home).setY(0).normalize();
    k.mesh.position.copy(k.home).addScaledVector(dir, 1.3 * k.lift); k.mesh.position.y = CARD_Y + 0.15 * k.lift;
    const s = 1 + 0.12 * k.lift; k.mesh.scale.set(s, s, 1);
    k.mesh.lookAt(0, CARD_Y, 6); k.mesh.rotateY(k.tilt.x * 0.18); k.mesh.rotateX(-k.tilt.y * 0.12);
  }

  // --- Pointer interaction ---
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2(); let down = null;
  const hit = (e) => { const r = renderer.domElement.getBoundingClientRect(); ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ptr, camera); const h = ray.intersectObjects(cards.map((c) => c.mesh), false)[0]; return h ? { card: cards.find((c) => c.mesh === h.object), uv: h.uv } : null; };
  renderer.domElement.addEventListener('pointermove', (e) => {
    const h = hit(e); const prev = hovered; hovered = h?.card || null;
    renderer.domElement.style.cursor = h ? 'pointer' : 'grab';
    if (!reduced) { cards.forEach((c) => c.tiltTarget.set(0, 0)); if (h) h.card.tiltTarget.set((h.uv.x - 0.5) * 2, (h.uv.y - 0.5) * 2); }
    if (prev !== hovered) dirty = true; dirty = true;
  });
  renderer.domElement.addEventListener('pointerleave', () => { hovered = null; cards.forEach((c) => c.tiltTarget.set(0, 0)); dirty = true; });
  renderer.domElement.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
  renderer.domElement.addEventListener('pointerup', (e) => { if (!down) return; const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6; down = null; if (moved) return; const h = hit(e); if (h) onSelect(h.card.id); });
  controls.addEventListener('change', () => { dirty = true; });

  // --- Sizing, visibility, loop ---
  const resize = () => { const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = w / h < 0.9 ? 62 : 42; camera.updateProjectionMatrix(); dirty = true; };
  const ro = new ResizeObserver(resize); ro.observe(el); resize();
  let visible = true, raf = 0, destroyed = false;
  const io = new IntersectionObserver((en) => { visible = en[0].isIntersecting; kick(); }); io.observe(el);
  const onVis = () => kick(); document.addEventListener('visibilitychange', onVis);
  const lerp = (a, b, t) => a + (b - a) * t;
  function frame() {
    raf = 0; if (destroyed || document.hidden || !visible) return; // paused in inactive tabs / off-screen
    let moving = false;
    if (!reduced) {
      if (camera.position.distanceTo(camGoal.pos) > 0.01 || curLook.distanceTo(camGoal.look) > 0.01) { camera.position.lerp(camGoal.pos, 0.09); curLook.lerp(camGoal.look, 0.09); controls.target.copy(curLook); moving = true; }
      for (const k of cards) {
        const t = k.tilt.distanceTo(k.tiltTarget) > 0.002, l = Math.abs(k.lift - k.liftTarget) > 0.002;
        if (t) k.tilt.lerp(k.tiltTarget, 0.15); if (l) k.lift = lerp(k.lift, k.liftTarget, 0.12);
        if (t || l) { moving = true; applyCard(k); }
      }
    } else for (const k of cards) { k.tilt.set(0, 0); }
    const orbiting = controls.update(); // true only while the user's orbit/damping is still changing the camera
    if (orbiting) dirty = true;
    if (dirty || moving) { renderer.render(scene, camera); dirty = moving || orbiting; }
    if (moving || orbiting) raf = requestAnimationFrame(frame); // otherwise the loop stops: zero idle CPU/GPU use
  }
  function kick() { if (!raf && !destroyed) raf = requestAnimationFrame(frame); }
  // Rendering is demand-driven: any state change sets `dirty` and calls kick().
  const origSet = setRows;
  const wake = () => { dirty = true; kick(); };
  ['pointermove', 'pointerup', 'wheel', 'touchmove'].forEach((ev) => renderer.domElement.addEventListener(ev, wake, { passive: true }));
  const api = {
    setRows: async (r) => { await origSet(r); wake(); },
    select: (id) => { select(id); wake(); },
    resetCamera: () => { resetCamera(); wake(); },
    redrawAll: () => { cards.forEach((c) => { const u = portraitUrl(c.id); loadImg(u).then((im) => { c.img = im; redraw(c); wake(); }); }); },
    kick: wake,
    destroy() { destroyed = true; cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); document.removeEventListener('visibilitychange', onVis); disposeCards(); scene.traverse((o) => { o.geometry?.dispose?.(); if (o.material) [].concat(o.material).forEach((m) => m.dispose()); }); controls.dispose(); renderer.dispose(); renderer.domElement.remove(); },
    get info() { return { cards: cards.length, pixelRatio: renderer.getPixelRatio() }; },
  };
  wake();
  return api;
}
