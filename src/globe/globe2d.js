// Globo 2D de reserva (Canvas, projeção ortográfica). Sem WebGL, sem dependências externas.
// Mesma interface do globo 3D. Terra só aparece se os dados de `land` tiverem sido carregados.
import { ortho, orthoInverse } from "../lib/geo.js";

export function createGlobe2D(container, { onSelect, onHover }) {
  const cv = document.createElement("canvas");
  cv.className = "globe-canvas"; cv.setAttribute("aria-hidden", "true");
  container.appendChild(cv);
  const ctx = cv.getContext("2d");
  const st = { lat: 20, lon: -30, zoom: 1, markers: [], selected: null, land: null, auto: true, w: 0, h: 0, dpr: 1, raf: 0, hover: null, anim: null, drag: null, last: 0 };
  const HOME = { lat: 20, lon: -30, zoom: 1 };

  const R = () => Math.min(st.w, st.h) * 0.42 * st.zoom;
  function resize() {
    st.dpr = Math.min(window.devicePixelRatio || 1, 2);
    st.w = container.clientWidth; st.h = container.clientHeight;
    cv.width = st.w * st.dpr; cv.height = st.h * st.dpr; cv.style.width = st.w + "px"; cv.style.height = st.h + "px";
  }
  const ro = new ResizeObserver(resize); ro.observe(container); resize();

  function drawPath(pts, close) {
    const r = R(), cx = st.w / 2, cy = st.h / 2; let pen = false;
    for (const [lon, lat] of pts) {
      const p = ortho(lat, lon, st.lat, st.lon, r, cx, cy);
      if (!p.visible) { pen = false; continue; }
      if (!pen) { ctx.moveTo(p.x, p.y); pen = true; } else ctx.lineTo(p.x, p.y);
    }
    if (close) ctx.closePath();
  }

  function draw(t) {
    st.raf = requestAnimationFrame(draw);
    const dt = Math.min((t - st.last) / 1000 || 0, 0.05); st.last = t;
    if (st.anim) {
      const a = st.anim, k = Math.min((t - a.t0) / a.dur, 1), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      st.lat = a.lat0 + (a.lat1 - a.lat0) * e; st.lon = a.lon0 + a.dl * e; st.zoom = a.z0 + (a.z1 - a.z0) * e;
      if (k >= 1) st.anim = null;
    } else if (st.auto && !st.drag && !matchMedia("(prefers-reduced-motion: reduce)").matches) st.lon += dt * 4;
    st.lon = ((st.lon + 540) % 360) - 180;

    const { w, h, dpr } = st, cx = w / 2, cy = h / 2, r = R();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    const halo = ctx.createRadialGradient(cx, cy, r * 0.98, cx, cy, r * 1.12);
    halo.addColorStop(0, "rgba(105,183,255,0.22)"); halo.addColorStop(1, "rgba(105,183,255,0)");
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(cx, cy, r * 1.12, 0, 7); ctx.fill();
    const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r);
    g.addColorStop(0, "#14243b"); g.addColorStop(1, "#0a1424");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill();

    ctx.strokeStyle = "rgba(105,183,255,0.12)"; ctx.lineWidth = 1;
    for (let lon = -180; lon < 180; lon += 30) { ctx.beginPath(); drawPath(Array.from({ length: 37 }, (_, i) => [lon, -90 + i * 5])); ctx.stroke(); }
    for (let lat = -60; lat <= 60; lat += 30) { ctx.beginPath(); drawPath(Array.from({ length: 73 }, (_, i) => [-180 + i * 5, lat])); ctx.stroke(); }

    if (st.land) {
      ctx.fillStyle = "#24364f"; ctx.strokeStyle = "#4a6a8f"; ctx.lineWidth = 1;
      for (const poly of st.land) { ctx.beginPath(); for (const ring of poly) drawPath(ring, true); ctx.fill("evenodd"); ctx.stroke(); }
    }
    ctx.strokeStyle = "rgba(152,166,184,0.25)"; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.stroke();

    for (const m of st.markers) {
      const p = ortho(m.geo.lat, m.geo.lon, st.lat, st.lon, r, cx, cy);
      m._p = p; if (!p.visible) continue;
      const sel = m.id === st.selected, hov = m.id === st.hover, rad = sel ? 7 : hov ? 6 : 4.5;
      ctx.fillStyle = sel ? "rgba(232,184,109,0.28)" : "rgba(232,184,109,0.14)";
      ctx.beginPath(); ctx.arc(p.x, p.y, rad + (sel ? 8 : 5), 0, 7); ctx.fill();
      ctx.fillStyle = "#E8B86D"; ctx.beginPath(); ctx.arc(p.x, p.y, rad, 0, 7); ctx.fill();
      if (m.geo.precision === "regiao") { ctx.strokeStyle = "#E8B86D"; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(p.x, p.y, rad + 6, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
      if (sel || hov) { ctx.font = "500 12px Inter, system-ui, sans-serif"; ctx.fillStyle = "#F2F5F9"; ctx.fillText(m.name, p.x + 12, p.y + 4); }
    }
  }
  st.raf = requestAnimationFrame(draw);

  const pick = (x, y) => {
    let best = null, bd = 18;
    for (const m of st.markers) { const p = m._p; if (!p || !p.visible) continue; const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = m; } }
    return best;
  };
  const rel = e => { const b = cv.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };

  cv.addEventListener("pointerdown", e => { cv.setPointerCapture(e.pointerId); st.drag = { x: e.clientX, y: e.clientY, lat: st.lat, lon: st.lon, moved: 0 }; st.anim = null; });
  cv.addEventListener("pointermove", e => {
    if (st.drag) {
      const dx = e.clientX - st.drag.x, dy = e.clientY - st.drag.y; st.drag.moved = Math.max(st.drag.moved, Math.hypot(dx, dy));
      const k = 90 / (R() * 0.5 + 40);
      st.lat = Math.max(-80, Math.min(80, st.drag.lat + dy * k)); st.lon = st.drag.lon - dx * k;
    } else { const [x, y] = rel(e); const m = pick(x, y); const id = m ? m.id : null; if (id !== st.hover) { st.hover = id; cv.style.cursor = id ? "pointer" : "grab"; onHover && onHover(id); } }
  });
  cv.addEventListener("pointerup", e => {
    const d = st.drag; st.drag = null;
    if (d && d.moved < 5) { const [x, y] = rel(e); const m = pick(x, y); if (m) onSelect(m.id); }
  });
  cv.addEventListener("wheel", e => { e.preventDefault(); api.zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12); }, { passive: false });
  cv.style.cursor = "grab"; cv.style.touchAction = "none";

  const api = {
    kind: "2d", get autoRotating() { return st.auto; },
    setMarkers(list) { st.markers = list.map(e => ({ ...e })); },
    setSelected(id) { st.selected = id; },
    setLand(polys) { st.land = polys; },
    setAutoRotate(b) { st.auto = b; },
    flyTo(lat, lon, zoom = 1.7, dur = 1100) {
      const dl = ((lon - st.lon + 540) % 360) - 180;
      st.anim = { t0: performance.now(), dur, lat0: st.lat, lat1: Math.max(-80, Math.min(80, lat)), lon0: st.lon, dl, z0: st.zoom, z1: zoom };
    },
    zoomBy(f) { st.zoom = Math.max(0.7, Math.min(4, st.zoom * f)); },
    rotateBy(dLon, dLat = 0) { st.lon += dLon; st.lat = Math.max(-80, Math.min(80, st.lat + dLat)); },
    recenter() { api.flyTo(HOME.lat, HOME.lon, HOME.zoom, 900); },
    pickAt: (x, y) => orthoInverse(x, y, st.lat, st.lon, R(), st.w / 2, st.h / 2),
    destroy() { cancelAnimationFrame(st.raf); ro.disconnect(); cv.remove(); },
  };
  return api;
}
