// Lógica pura (sem DOM): busca, filtros, formatação de datas, estado em URL. Testável em Node.

export const PERIODS = [
  { id: "antiguidade", label: "Antiguidade", from: -3000, to: 500 },
  { id: "medieval", label: "Idade Média", from: 500, to: 1450 },
  { id: "expansoes", label: "Expansões marítimas", from: 1450, to: 1700 },
  { id: "revolucoes", label: "Revoluções (séc. XVIII–XIX)", from: 1700, to: 1900 },
  { id: "ww1", label: "Primeira Guerra Mundial", from: 1914, to: 1918 },
  { id: "ww2", label: "Segunda Guerra Mundial", from: 1939, to: 1945 },
  { id: "fria", label: "Guerra Fria", from: 1947, to: 1991 },
  { id: "contemporaneo", label: "Mundo contemporâneo", from: 1991, to: 2026 },
];

export const TIME_MIN = -3000;
export const TIME_MAX = 2026;

export function norm(s) {
  return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function fmtYear(y, approx = false) {
  const base = y < 0 ? `${Math.abs(y)} a.C.` : `${y} d.C.`;
  return approx ? `c. ${base}` : base;
}

export function fmtRange(e) {
  if (e.start === e.end) return fmtYear(e.start, e.approx);
  return `${fmtYear(e.start, e.approx)} – ${fmtYear(e.end, e.approx)}`;
}

// Evento "ativo" em um intervalo [from,to] se seus períodos se sobrepõem.
export function overlaps(e, from, to) {
  return e.start <= to && e.end >= from;
}

export function matchesQuery(e, q, catLabels = {}, regLabels = {}) {
  const terms = norm(q).split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const hay = norm([e.name, e.summary, e.context, e.consequences, e.geo.label,
    catLabels[e.category], regLabels[e.region], ...e.refs.map(r => r.title)].join(" "));
  return terms.every(t => hay.includes(t));
}

// Pontuação simples para ordenar resultados: nome > local > resto.
export function score(e, q) {
  const n = norm(q);
  if (!n) return 0;
  let s = 0;
  if (norm(e.name).includes(n)) s += 10;
  if (norm(e.geo.label).includes(n)) s += 4;
  if (norm(e.summary).includes(n)) s += 2;
  return s;
}

export function applyFilters(events, f, labels = {}) {
  const { query = "", categories = [], regions = [], range = null } = f;
  return events
    .filter(e => (!categories.length || categories.includes(e.category))
      && (!regions.length || regions.includes(e.region))
      && (!range || overlaps(e, range[0], range[1]))
      && matchesQuery(e, query, labels.cats, labels.regs))
    .sort((a, b) => score(b, query) - score(a, query) || a.start - b.start);
}

// Janela de tempo em torno do marcador: largura adaptativa à escala (milênios → anos).
export function windowFor(year) {
  const span = year < 0 ? 300 : year < 1000 ? 150 : year < 1800 ? 60 : 25;
  return [year - span, year + span];
}

// Estado ↔ URL (hash). Sem dados pessoais: apenas filtros e seleção.
export function encodeState(s) {
  const p = new URLSearchParams();
  if (s.selected) p.set("e", s.selected);
  if (s.query) p.set("q", s.query);
  if (s.categories?.length) p.set("c", s.categories.join(","));
  if (s.regions?.length) p.set("r", s.regions.join(","));
  if (s.range) p.set("t", s.range.join(","));
  if (s.module && s.module !== "explorar") p.set("m", s.module);
  return p.toString();
}

export function decodeState(str) {
  const p = new URLSearchParams(String(str).replace(/^#/, ""));
  const num = v => (v !== null && v !== "" && Number.isFinite(+v) ? +v : null);
  const t = (p.get("t") || "").split(",").map(num);
  return {
    selected: p.get("e") || null,
    query: p.get("q") || "",
    categories: (p.get("c") || "").split(",").filter(Boolean),
    regions: (p.get("r") || "").split(",").filter(Boolean),
    range: t.length === 2 && t[0] !== null && t[1] !== null ? [Math.min(t[0], t[1]), Math.max(t[0], t[1])] : null,
    module: p.get("m") || "explorar",
  };
}

// Coordenadas → vetor 3D na esfera unitária (y para cima; lon 0 aponta para +z).
export function latLonToXYZ(lat, lon, r = 1) {
  const phi = (lat * Math.PI) / 180, lam = (lon * Math.PI) / 180;
  return [r * Math.cos(phi) * Math.sin(lam), r * Math.sin(phi), r * Math.cos(phi) * Math.cos(lam)];
}

// Validação de integridade da base (usada nos testes e no console em dev).
export function validateEvents(events, cats, regs) {
  const errs = [], ids = new Set(events.map(e => e.id));
  for (const e of events) {
    if (!e.id || !e.name) errs.push(`evento sem id/nome: ${e.id}`);
    if (!cats[e.category]) errs.push(`${e.id}: categoria inválida`);
    if (!regs[e.region]) errs.push(`${e.id}: região inválida`);
    if (!(e.start <= e.end)) errs.push(`${e.id}: período inválido`);
    if (Math.abs(e.geo.lat) > 90 || Math.abs(e.geo.lon) > 180) errs.push(`${e.id}: coordenada fora do intervalo`);
    if (!e.refs?.length) errs.push(`${e.id}: sem referências`);
    for (const r of e.refs || []) if (!/^https:\/\//.test(r.url)) errs.push(`${e.id}: URL inválida`);
    for (const rel of e.related || []) if (!ids.has(rel)) errs.push(`${e.id}: relação inexistente ${rel}`);
  }
  return errs;
}

// Escala temporal não linear (mais resolução nos séculos recentes). Slider 0..1000 ↔ ano.
const STOPS = [[0, -3000], [200, 0], [400, 1000], [600, 1500], [800, 1800], [1000, 2026]];
export function sliderToYear(v) {
  v = Math.max(0, Math.min(1000, v));
  for (let i = 1; i < STOPS.length; i++) if (v <= STOPS[i][0]) {
    const [v0, y0] = STOPS[i - 1], [v1, y1] = STOPS[i];
    return Math.round(y0 + ((v - v0) / (v1 - v0)) * (y1 - y0));
  }
  return 2026;
}
export function yearToSlider(y) {
  y = Math.max(-3000, Math.min(2026, y));
  for (let i = 1; i < STOPS.length; i++) if (y <= STOPS[i][1]) {
    const [v0, y0] = STOPS[i - 1], [v1, y1] = STOPS[i];
    return Math.round(v0 + ((y - y0) / (y1 - y0)) * (v1 - v0));
  }
  return 1000;
}
