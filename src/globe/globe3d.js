// Globo 3D (Three.js, WebGL). Three.js é importado dinamicamente de CDN (MIT); se falhar, o app usa o globo 2D.
// Textura: canvas equirretangular gerado a partir de dados Natural Earth (domínio público), sem imagem estática.
import { latLonToXYZ } from "../lib/logic.js";
import { drawEquirect } from "../lib/geo.js";

export const THREE_URL = "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";

export function webglOk() {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; }
}

export async function createGlobe3D(container, { onSelect, onHover }) {
  if (!webglOk()) throw new Error("WebGL indisponível");
  const THREE = await import(/* @vite-ignore */ THREE_URL);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.domElement.className = "globe-canvas"; renderer.domElement.setAttribute("aria-hidden", "true");
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  const world = new THREE.Group(); scene.add(world);

  // Texturas
  const tcv = document.createElement("canvas"); tcv.width = 2048; tcv.height = 1024; drawEquirect(tcv, null);
  const tex = new THREE.CanvasTexture(tcv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0 }));
  sphere.rotation.y = -Math.PI / 2; // UV da esfera do three: lon 0 em +x; nosso latLonToXYZ usa lon 0 em +z
  world.add(sphere);
  // Atmosfera (fresnel simples)
  const atm = new THREE.Mesh(new THREE.SphereGeometry(1.045, 64, 48), new THREE.ShaderMaterial({
    transparent: true, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false,
    vertexShader: "varying vec3 n; void main(){ n = normalize(normalMatrix*normal); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }",
    fragmentShader: "varying vec3 n; void main(){ float i = pow(0.62 - dot(n, vec3(0.,0.,1.)), 2.4); gl_FragColor = vec4(0.41,0.72,1.0,1.0)*i*0.9; }",
  }));
  scene.add(atm);
  scene.add(new THREE.AmbientLight(0x6f88ad, 0.9));
  const sun = new THREE.DirectionalLight(0xffffff, 1.9); sun.position.set(-3, 2, 4); scene.add(sun);
  // Estrelas discretas
  const sp = new Float32Array(900 * 3);
  for (let i = 0; i < 900; i++) { const v = new THREE.Vector3().randomDirection().multiplyScalar(30 + Math.random() * 20); sp.set([v.x, v.y, v.z], i * 3); }
  const sg = new THREE.BufferGeometry(); sg.setAttribute("position", new THREE.BufferAttribute(sp, 3));
  scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xaab8cc, size: 0.06, transparent: true, opacity: 0.45, sizeAttenuation: true })));

  // Marcadores: poucos objetos (instâncias leves), agrupados em um grupo
  const mg = new THREE.Group(); world.add(mg);
  const geoDot = new THREE.SphereGeometry(0.016, 16, 12);
  const state = { markers: [], meshes: new Map(), selected: null, auto: true, lat: 20, lon: -30, zoom: 1, anim: null, drag: null, raf: 0, last: 0, hover: null };
  const HOME = { lat: 20, lon: -30, zoom: 1 };
  const dist = z => 3.2 / z;

  function setView() {
    const p = THREE.MathUtils.degToRad;
    // Leva (lat,lon) ao centro da tela (+z): guinada de -lon e depois inclinação de +lat.
    const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -p(state.lon));
    const qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), p(state.lat));
    world.quaternion.copy(qx.multiply(qy));
    camera.position.set(0, 0, dist(state.zoom)); camera.lookAt(0, 0, 0);
  }
  function resize() {
    const w = container.clientWidth, h = container.clientHeight; renderer.setSize(w, h, false);
    renderer.domElement.style.width = w + "px"; renderer.domElement.style.height = h + "px";
    camera.aspect = w / h; camera.fov = w / h < 0.8 ? 52 : 40; camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize); ro.observe(container); resize();

  function frame(t) {
    state.raf = requestAnimationFrame(frame);
    const dt = Math.min((t - state.last) / 1000 || 0, 0.05); state.last = t;
    if (state.anim) {
      const a = state.anim, k = Math.min((t - a.t0) / a.dur, 1), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      state.lat = a.lat0 + (a.lat1 - a.lat0) * e; state.lon = a.lon0 + a.dl * e; state.zoom = a.z0 + (a.z1 - a.z0) * e;
      if (k >= 1) state.anim = null;
    } else if (state.auto && !state.drag && !matchMedia("(prefers-reduced-motion: reduce)").matches) state.lon += dt * 4;
    state.lon = ((state.lon + 540) % 360) - 180;
    setView();
    const pulse = 1 + 0.18 * Math.sin(t / 380);
    for (const [id, m] of state.meshes) m.scale.setScalar(id === state.selected ? 1.7 * pulse : id === state.hover ? 1.4 : 1);
    renderer.render(scene, camera);
  }
  state.raf = requestAnimationFrame(frame);

  // Seleção por raio: testa marcadores visíveis (voltados para a câmera)
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function pick(clientX, clientY) {
    const b = renderer.domElement.getBoundingClientRect();
    ndc.set(((clientX - b.left) / b.width) * 2 - 1, -((clientY - b.top) / b.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    ray.params.Points = { threshold: 0.03 };
    const hits = ray.intersectObjects([...state.meshes.values()], false), sh = ray.intersectObject(sphere, false)[0];
    for (const h of hits) if (!sh || h.distance <= sh.distance + 0.02) return h.object.userData.id;
    return null;
  }
  const el = renderer.domElement; el.style.touchAction = "none"; el.style.cursor = "grab";
  el.addEventListener("pointerdown", e => { el.setPointerCapture(e.pointerId); state.drag = { x: e.clientX, y: e.clientY, lat: state.lat, lon: state.lon, moved: 0 }; state.anim = null; });
  el.addEventListener("pointermove", e => {
    if (state.drag) {
      const dx = e.clientX - state.drag.x, dy = e.clientY - state.drag.y; state.drag.moved = Math.max(state.drag.moved, Math.hypot(dx, dy));
      const k = 0.28 / state.zoom;
      state.lat = Math.max(-80, Math.min(80, state.drag.lat + dy * k)); state.lon = state.drag.lon - dx * k;
    } else { const id = pick(e.clientX, e.clientY); if (id !== state.hover) { state.hover = id; el.style.cursor = id ? "pointer" : "grab"; onHover && onHover(id); } }
  });
  el.addEventListener("pointerup", e => { const d = state.drag; state.drag = null; if (d && d.moved < 5) { const id = pick(e.clientX, e.clientY); if (id) onSelect(id); } });
  el.addEventListener("wheel", e => { e.preventDefault(); api.zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12); }, { passive: false });

  const api = {
    kind: "3d", get autoRotating() { return state.auto; },
    setMarkers(list) {
      for (const m of state.meshes.values()) { mg.remove(m); m.material.dispose(); }
      state.meshes.clear();
      for (const e of list) {
        const mat = new THREE.MeshBasicMaterial({ color: 0xe8b86d });
        const m = new THREE.Mesh(geoDot, mat), [x, y, z] = latLonToXYZ(e.geo.lat, e.geo.lon, 1.012);
        m.position.set(x, y, z); m.userData.id = e.id; mg.add(m); state.meshes.set(e.id, m);
      }
    },
    setSelected(id) { state.selected = id; },
    setLand(polys) { drawEquirect(tcv, polys); tex.needsUpdate = true; },
    setAutoRotate(b) { state.auto = b; },
    flyTo(lat, lon, zoom = 1.7, dur = 1200) {
      const dl = ((lon - state.lon + 540) % 360) - 180;
      state.anim = { t0: performance.now(), dur, lat0: state.lat, lat1: Math.max(-80, Math.min(80, lat)), lon0: state.lon, dl, z0: state.zoom, z1: zoom };
    },
    zoomBy(f) { state.zoom = Math.max(0.75, Math.min(5, state.zoom * f)); },
    rotateBy(dLon, dLat = 0) { state.lon += dLon; state.lat = Math.max(-80, Math.min(80, state.lat + dLat)); },
    recenter() { api.flyTo(HOME.lat, HOME.lon, HOME.zoom, 900); },
    destroy() { cancelAnimationFrame(state.raf); ro.disconnect(); renderer.dispose(); renderer.domElement.remove(); },
  };
  return api;
}
