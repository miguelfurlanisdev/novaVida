// Decodificação mínima de TopoJSON (Polygon/MultiPolygon) e desenho de terra/graticule em Canvas 2D.
// Fonte de dados em produção: world-atlas "land-110m" (Natural Earth, domínio público) — ver README.

export const LAND_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json";

function decodeArcs(topo) {
  const { scale = [1, 1], translate = [0, 0] } = topo.transform || {};
  return topo.arcs.map(arc => {
    let x = 0, y = 0;
    return arc.map(([dx, dy]) => {
      if (topo.transform) { x += dx; y += dy; return [x * scale[0] + translate[0], y * scale[1] + translate[1]]; }
      return [dx, dy];
    });
  });
}

function ring(arcIdx, arcs) {
  const pts = [];
  for (const i of arcIdx) {
    const a = i >= 0 ? arcs[i] : arcs[~i].slice().reverse();
    for (let k = pts.length ? 1 : 0; k < a.length; k++) pts.push(a[k]);
  }
  return pts;
}

// Retorna lista de polígonos; cada polígono = lista de anéis [[lon,lat],...]
export function topoToPolygons(topo) {
  const arcs = decodeArcs(topo), polys = [];
  const visit = g => {
    if (g.type === "Polygon") polys.push(g.arcs.map(r => ring(r, arcs)));
    else if (g.type === "MultiPolygon") g.arcs.forEach(p => polys.push(p.map(r => ring(r, arcs))));
    else if (g.type === "GeometryCollection") g.geometries.forEach(visit);
  };
  Object.values(topo.objects).forEach(visit);
  return polys;
}

export async function loadLand(url = LAND_URL, timeoutMs = 10000) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return topoToPolygons(await res.json());
  } finally { clearTimeout(t); }
}

// Textura equirretangular (para Three.js): oceano escuro, terra mais clara, graticule discreto.
export function drawEquirect(canvas, polys) {
  const w = canvas.width, h = canvas.height, c = canvas.getContext("2d");
  const X = lon => ((lon + 180) / 360) * w, Y = lat => ((90 - lat) / 180) * h;
  c.fillStyle = "#0b1626"; c.fillRect(0, 0, w, h);
  c.strokeStyle = "rgba(105,183,255,0.10)"; c.lineWidth = 1;
  for (let lon = -180; lon <= 180; lon += 30) { c.beginPath(); c.moveTo(X(lon), 0); c.lineTo(X(lon), h); c.stroke(); }
  for (let lat = -60; lat <= 60; lat += 30) { c.beginPath(); c.moveTo(0, Y(lat)); c.lineTo(w, Y(lat)); c.stroke(); }
  if (!polys) return;
  c.fillStyle = "#24364f"; c.strokeStyle = "#4a6a8f"; c.lineWidth = 1.2;
  for (const p of polys) {
    c.beginPath();
    for (const r of p) {
      let prev = null;
      r.forEach(([lon, lat], i) => {
        // evita linhas atravessando o mapa no antimeridiano
        if (i === 0 || (prev && Math.abs(lon - prev) > 180)) c.moveTo(X(lon), Y(lat)); else c.lineTo(X(lon), Y(lat));
        prev = lon;
      });
    }
    c.fill("evenodd"); c.stroke();
  }
}

// ---- Projeção ortográfica (globo 2D de reserva) ----
// centro (lat0, lon0) em graus; retorna {x,y,visible} para raio R e origem (cx,cy).
export function ortho(lat, lon, lat0, lon0, R, cx, cy) {
  const p = Math.PI / 180, φ = lat * p, λ = (lon - lon0) * p, φ0 = lat0 * p;
  const cosc = Math.sin(φ0) * Math.sin(φ) + Math.cos(φ0) * Math.cos(φ) * Math.cos(λ);
  return {
    x: cx + R * Math.cos(φ) * Math.sin(λ),
    y: cy - R * (Math.cos(φ0) * Math.sin(φ) - Math.sin(φ0) * Math.cos(φ) * Math.cos(λ)),
    visible: cosc > 0,
  };
}

// Inversa: pixel → lat/lon (para clicar no globo 2D). Retorna null fora do disco.
export function orthoInverse(x, y, lat0, lon0, R, cx, cy) {
  const p = Math.PI / 180, dx = (x - cx) / R, dy = (cy - y) / R, rho = Math.hypot(dx, dy);
  if (rho > 1) return null;
  const c = Math.asin(rho), φ0 = lat0 * p;
  const lat = rho === 0 ? lat0 * p : Math.asin(Math.cos(c) * Math.sin(φ0) + (dy * Math.sin(c) * Math.cos(φ0)) / rho);
  const lon = lon0 * p + Math.atan2(dx * Math.sin(c), rho * Math.cos(φ0) * Math.cos(c) - dy * Math.sin(φ0) * Math.sin(c));
  return { lat: lat / p, lon: ((lon / p + 540) % 360) - 180 };
}
