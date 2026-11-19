import { EVENTS, CATEGORIES, REGIONS } from "./data/events.js";
import { PERIODS, applyFilters, fmtRange, fmtYear, windowFor, encodeState, decodeState, sliderToYear, yearToSlider, validateEvents } from "./lib/logic.js";
import { loadLand } from "./lib/geo.js";
import { createGlobe2D } from "./globe/globe2d.js";

const $ = s => document.querySelector(s);
const el = (tag, props = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props);
  for (const k of kids) n.append(k);
  return n;
};
const labels = { cats: CATEGORIES, regs: REGIONS };
const byId = Object.fromEntries(EVENTS.map(e => [e.id, e]));

const errs = validateEvents(EVENTS, CATEGORIES, REGIONS);
if (errs.length) console.warn("[ATLAS] problemas na base de dados:", errs);

// ---------- Estado ----------
const FAV_KEY = "atlas.favoritos.v1";
const loadFavs = () => { try { return new Set(JSON.parse(localStorage.getItem(FAV_KEY) || "[]")); } catch { return new Set(); } };
const saveFavs = () => { try { localStorage.setItem(FAV_KEY, JSON.stringify([...state.favs])); } catch { /* armazenamento indisponível */ } };
const state = { ...decodeState(location.hash), favs: loadFavs(), favOnly: false, year: null, playing: false, expanded: false };
let globe = null, landLoaded = false, landVisible = true, landPolys = null, playTimer = 0;

const visible = () => applyFilters(EVENTS, state, labels).filter(e => !state.favOnly || state.favs.has(e.id));

// ---------- Globo ----------
const gEl = $("#globe"), status = $("#globe-status");
let baseNote = "";
const setStatus = m => { status.textContent = (baseNote + (m ? " " + m : "")).trim(); };
const onSelect = id => select(id, { fly: true });
const onHover = id => { gEl.title = id ? byId[id].name : ""; };

async function initGlobe() {
  status.textContent = "Carregando globo…";
  const forced2d = new URLSearchParams(location.search).get("render") === "2d";
  try {
    if (forced2d) throw new Error("modo 2D solicitado");
    const { createGlobe3D } = await import("./globe/globe3d.js");
    globe = await Promise.race([createGlobe3D(gEl, { onSelect, onHover }), new Promise((_, rej) => setTimeout(() => rej(new Error("tempo esgotado ao carregar Three.js")), 12000))]);
  } catch (err) {
    console.info("[ATLAS] usando globo 2D de reserva:", err.message);
    gEl.replaceChildren();
    globe = createGlobe2D(gEl, { onSelect, onHover });
  }
  syncGlobe();
  baseNote = globe.kind === "3d" ? "" : "Modo simplificado (globo 2D).";
  setStatus("");
  try {
    landPolys = await loadLand();
    landLoaded = true; globe.setLand(landPolys);
  } catch (err) {
    baseNote += " Continentes indisponíveis: os dados Natural Earth não puderam ser carregados; mostrando só graticule e marcadores.";
    $("#l-land").disabled = true; $("#l-land").checked = false;
    setStatus("");
  }
  if (state.selected && byId[state.selected]) select(state.selected, { fly: true, silent: true });
}

function syncGlobe() {
  if (!globe) return;
  globe.setMarkers($("#l-markers").checked ? visible() : []);
  globe.setSelected(state.selected);
}

// ---------- Filtros / lista ----------
function chip(label, pressed, on) {
  const b = el("button", { className: "chip", type: "button", textContent: label });
  b.setAttribute("aria-pressed", String(pressed)); b.onclick = on; return b;
}
function toggle(arr, v) { return arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]; }

function renderFilters() {
  $("#f-cats").replaceChildren(...Object.entries(CATEGORIES).map(([k, l]) => chip(l, state.categories.includes(k), () => { state.categories = toggle(state.categories, k); refresh(); })));
  $("#f-regs").replaceChildren(...Object.entries(REGIONS).map(([k, l]) => chip(l, state.regions.includes(k), () => { state.regions = toggle(state.regions, k); refresh(); })));
}

function renderList() {
  const list = visible(), ul = $("#list");
  $("#count").textContent = `(${list.length}/${EVENTS.length})`;
  if (!list.length) { ul.replaceChildren(el("li", { className: "empty", textContent: "Nenhum acontecimento corresponde aos filtros atuais." })); return; }
  ul.replaceChildren(...list.map(e => {
    const b = el("button", { type: "button" }, el("span", { className: "t", textContent: (state.favs.has(e.id) ? "★ " : "") + e.name }), el("span", { className: "m", textContent: `${fmtRange(e)} · ${e.geo.label}` }));
    if (e.id === state.selected) b.setAttribute("aria-current", "true");
    b.onclick = () => { select(e.id, { fly: true }); $("#app").classList.remove("left-open"); };
    return el("li", {}, b);
  }));
}

// ---------- Linha do tempo ----------
function renderPeriods() {
  $("#periods").replaceChildren(...PERIODS.map(p => {
    const on = state.range && state.range[0] === p.from && state.range[1] === p.to;
    return chip(p.label, on, () => setPeriod(p));
  }));
}
function renderMarks() {
  $("#t-marks").replaceChildren(...visible().map(e => { const i = el("i"); i.style.left = (yearToSlider(e.start) / 10) + "%"; return i; }));
}
function renderTimeLabel() {
  const r = state.range;
  $("#t-year").textContent = r ? (state.year !== null ? fmtYear(state.year) : "Período") : "Todo o período";
  $("#t-all").hidden = !r;
  $("#t-win").textContent = r ? `${fmtYear(r[0])} → ${fmtYear(r[1])}` : `${fmtYear(-3000)} → ${fmtYear(2026)}`;
}
function setPeriod(p) {
  state.range = [p.from, p.to]; state.year = Math.round((p.from + p.to) / 2);
  $("#t-slider").value = yearToSlider(state.year);
  refresh();
  const first = visible()[0];
  if (first && globe && state.module === "explorar") globe.flyTo(first.geo.lat, first.geo.lon, 1.15);
  const n = visible().length;
  setStatus(`${p.label}: ${n} acontecimento(s) documentado(s) nesta base inicial.`);
}
$("#t-slider").addEventListener("input", e => {
  stopPlay(); state.year = sliderToYear(+e.target.value); state.range = windowFor(state.year); refresh();
});
$("#t-all").onclick = () => { stopPlay(); state.range = null; state.year = null; setStatus(""); refresh(); };
function stopPlay() { state.playing = false; clearInterval(playTimer); $("#t-play").textContent = "▶"; $("#t-play").setAttribute("aria-label", "Reproduzir sequência"); }
$("#t-play").onclick = () => {
  if (state.playing) return stopPlay();
  state.playing = true; $("#t-play").textContent = "⏸"; $("#t-play").setAttribute("aria-label", "Pausar sequência");
  let v = state.year === null || sliderToYear(+$("#t-slider").value) >= 2020 ? 0 : +$("#t-slider").value;
  playTimer = setInterval(() => {
    v += 4; if (v > 1000) return stopPlay();
    $("#t-slider").value = v; state.year = sliderToYear(v); state.range = windowFor(state.year); refresh();
  }, 140);
};

// ---------- Painel de detalhes ----------
function renderDetail() {
  const box = $("#right"), e = byId[state.selected];
  $("#app").classList.toggle("has-right", !!e);
  if (!e) { box.hidden = true; return; }
  box.hidden = false;
  const fav = state.favs.has(e.id);
  const close = el("button", { className: "icon-btn close", type: "button", textContent: "✕" }); close.setAttribute("aria-label", "Fechar painel"); close.onclick = () => select(null);
  const actions = el("div", { className: "actions" },
    btn("Explorar no globo", () => { setModule("explorar"); globe && globe.flyTo(e.geo.lat, e.geo.lon, 1.5); }, true),
    btn("Abrir na linha do tempo", () => { state.range = windowFor(e.start); state.year = e.start; $("#t-slider").value = yearToSlider(e.start); setModule("linha"); }),
    (() => { const b = btn(fav ? "★ Favorito" : "☆ Favoritar", () => { fav ? state.favs.delete(e.id) : state.favs.add(e.id); saveFavs(); refresh(); }); b.setAttribute("aria-pressed", String(fav)); return b; })(),
    btn("Copiar link", async () => { try { await navigator.clipboard.writeText(location.href); setStatus("Link copiado (contém apenas filtros e seleção)."); } catch { setStatus("Não foi possível copiar; copie o endereço do navegador."); } }));
  const more = el("div", { hidden: !state.expanded },
    el("h3", { textContent: "Contexto e antecedentes" }), el("p", { textContent: e.context }),
    el("h3", { textContent: "Consequências" }), el("p", { textContent: e.consequences }));
  const toggleMore = el("button", { className: "more", type: "button", textContent: state.expanded ? "Mostrar menos" : "Ler mais" });
  toggleMore.onclick = () => { state.expanded = !state.expanded; more.hidden = !state.expanded; toggleMore.textContent = state.expanded ? "Mostrar menos" : "Ler mais"; };
  const rel = (e.related || []).map(id => byId[id]).filter(Boolean);
  const relNode = rel.length ? el("div", {}, el("h3", { textContent: "Acontecimentos relacionados" }), el("div", { className: "rel" }, ...rel.map(r => chip(r.name, false, () => select(r.id, { fly: true })))),
    el("p", { className: "note", textContent: "Relações curadas manualmente nesta base; a explicação de cada vínculo e suas fontes ainda não está implementada." })) : el("span");
  box.replaceChildren(close,
    el("div", { className: "muted", style: "font-size:12.5px", textContent: CATEGORIES[e.category] }),
    el("h2", { textContent: e.name }),
    el("div", { className: "when", textContent: fmtRange(e) + (e.approx ? " (datas aproximadas)" : "") }),
    el("div", { className: "where", textContent: `${e.geo.label} · ${REGIONS[e.region]}` }),
    el("p", { textContent: e.summary }), toggleMore, more,
    el("div", { className: "callout", textContent: `Precisão: ${e.precisionNote} Localização: ${e.geo.precision}.` }),
    actions, relNode,
    el("h3", { textContent: "Fontes e referências" }),
    el("ol", { className: "refs" }, ...e.refs.map(r => el("li", {}, el("a", { href: r.url, target: "_blank", rel: "noopener noreferrer", textContent: r.title }), ` — ${r.author}. ${r.note || ""}`))),
    el("p", { className: "note", textContent: `Curadoria: ${e.review.status}. ${e.review.note}` }));
  box.scrollTop = 0;
}
function btn(text, on, primary) { const b = el("button", { className: "btn" + (primary ? " primary" : ""), type: "button", textContent: text }); b.onclick = on; return b; }

function select(id, { fly = false, silent = false } = {}) {
  if (id !== state.selected) state.expanded = false;
  state.selected = id && byId[id] ? id : null;
  const e = byId[state.selected];
  if (e && fly && globe && state.module === "explorar") { globe.setAutoRotate(false); syncAutoBtn(); globe.flyTo(e.geo.lat, e.geo.lon, e.geo.precision === "regiao" ? 1.25 : 1.5); }
  if (!silent) refresh();
  else { renderDetail(); syncGlobe(); renderList(); }
}

// ---------- Módulos ----------
function setModule(m) {
  state.module = m;
  document.querySelectorAll(".nav button").forEach(b => b.classList.toggle("active", b.dataset.mod === m));
  const stageViews = { linha: $("#view-linha"), arquivo: $("#view-arquivo") };
  for (const [k, v] of Object.entries(stageViews)) v.hidden = k !== m;
  if (m === "linha") renderLinha(); if (m === "arquivo") renderArquivo();
  refresh();
}
function renderLinha() {
  const list = visible().slice().sort((a, b) => a.start - b.start);
  $("#view-linha").replaceChildren(
    el("h1", { textContent: "Linha do Tempo" }),
    el("p", { className: "lead", textContent: "Acontecimentos da base atual em ordem cronológica, respeitando busca, filtros e o período escolhido abaixo. Datas aproximadas são marcadas com “c.”." }),
    list.length ? el("ol", { className: "tl" }, ...list.map(e => {
      const b = el("button", { type: "button" }, el("div", { className: "y", textContent: fmtRange(e) + (e.approx ? " · aproximada" : "") }), el("div", { className: "n", textContent: e.name }), el("div", { className: "s", textContent: e.summary }));
      b.onclick = () => { setModule("explorar"); select(e.id, { fly: true }); };
      return el("li", {}, b);
    })) : el("p", { className: "lead", textContent: "Nenhum acontecimento neste recorte." }));
}
function renderArquivo() {
  const cards = EVENTS.slice().sort((a, b) => a.start - b.start).map(e => el("div", { className: "src-card" },
    el("h3", {}, e.name, el("span", { className: "badge warn", textContent: `curadoria: ${e.review.status}` }), el("span", { className: "badge", textContent: e.geo.precision })),
    el("div", { className: "muted", textContent: `${fmtRange(e)} · ${e.precisionNote}` }),
    el("ul", {}, ...e.refs.map(r => el("li", {}, el("a", { href: r.url, target: "_blank", rel: "noopener noreferrer", textContent: r.title }), ` — ${r.author}`)))));
  $("#view-arquivo").replaceChildren(
    el("h1", { textContent: "Arquivo" }),
    el("p", { className: "lead", textContent: "Todas as referências da base. Aviso: os textos são sínteses redigidas para esta demonstração e as URLs ainda não passaram por verificação editorial; o status de cada item indica isso." }),
    ...cards);
}

// ---------- Ciclo de atualização ----------
let hashLock = false;
function refresh() {
  renderFilters(); renderList(); renderPeriods(); renderMarks(); renderTimeLabel(); renderDetail(); syncGlobe();
  if (state.module === "linha") renderLinha();
  $("#btn-fav-view").setAttribute("aria-pressed", String(state.favOnly));
  hashLock = true; history.replaceState(null, "", "#" + encodeState(state)); setTimeout(() => (hashLock = false));
}

// ---------- Eventos de UI ----------
$("#q").value = state.query;
$("#q").addEventListener("input", e => { state.query = e.target.value; refresh(); });
$("#btn-clear").onclick = () => { state.query = ""; state.categories = []; state.regions = []; state.range = null; state.year = null; state.favOnly = false; $("#q").value = ""; setStatus(""); refresh(); };
document.querySelectorAll(".nav button:not(:disabled)").forEach(b => b.onclick = () => setModule(b.dataset.mod));
$("#logo").onclick = ev => { ev.preventDefault(); setModule("explorar"); };
$("#btn-random").onclick = () => { const l = EVENTS; const e = l[Math.floor(Math.random() * l.length)]; setModule("explorar"); select(e.id, { fly: true }); };
$("#btn-fav-view").onclick = () => { state.favOnly = !state.favOnly; refresh(); if (state.favOnly && !state.favs.size) setStatus("Você ainda não tem favoritos. Abra um acontecimento e use “Favoritar”."); };
$("#btn-collapse").onclick = () => { const c = $("#app").classList.toggle("left-closed"); $("#btn-collapse").setAttribute("aria-expanded", String(!c)); $("#btn-collapse").textContent = c ? "›" : "‹"; setTimeout(() => window.dispatchEvent(new Event("resize")), 260); };
$("#btn-panel").onclick = () => { const o = $("#app").classList.toggle("left-open"); $("#btn-panel").setAttribute("aria-expanded", String(o)); };
$("#l-markers").onchange = syncGlobe;
$("#l-land").onchange = e => { landVisible = e.target.checked; if (globe && landLoaded) globe.setLand(landVisible ? landPolys : null); };

const hint = $("#hint"), offHint = () => hint.classList.add("off");
$("#globe").addEventListener("pointerdown", offHint, { once: true });
function syncAutoBtn() { const a = globe && globe.autoRotating; const b = $("#c-auto"); b.setAttribute("aria-pressed", String(!!a)); b.textContent = a ? "⏸" : "⏵"; b.setAttribute("aria-label", a ? "Pausar rotação automática" : "Retomar rotação automática"); }
$("#c-in").onclick = () => globe && globe.zoomBy(1.25);
$("#c-out").onclick = () => globe && globe.zoomBy(0.8);
$("#c-left").onclick = () => globe && globe.rotateBy(-15);
$("#c-right").onclick = () => globe && globe.rotateBy(15);
$("#c-home").onclick = () => globe && globe.recenter();
$("#c-auto").onclick = () => { if (!globe) return; globe.setAutoRotate(!globe.autoRotating); syncAutoBtn(); };
$("#stage").setAttribute("tabindex", "0");
$("#stage").addEventListener("keydown", ev => {
  if (!globe || ev.target !== $("#stage")) return;
  const k = { ArrowLeft: () => globe.rotateBy(-10), ArrowRight: () => globe.rotateBy(10), ArrowUp: () => globe.rotateBy(0, 8), ArrowDown: () => globe.rotateBy(0, -8), "+": () => globe.zoomBy(1.25), "=": () => globe.zoomBy(1.25), "-": () => globe.zoomBy(0.8), "0": () => globe.recenter() }[ev.key];
  if (k) { ev.preventDefault(); k(); }
});
document.addEventListener("keydown", ev => { if (ev.key === "Escape" && state.selected) select(null); });
window.addEventListener("hashchange", () => { if (hashLock) return; Object.assign(state, decodeState(location.hash)); $("#q").value = state.query; setModule(state.module); });

// ---------- Início ----------
setModule(state.module in { explorar: 1, linha: 1, arquivo: 1 } ? state.module : "explorar");
if (state.range) $("#t-slider").value = yearToSlider((state.range[0] + state.range[1]) / 2);
else $("#t-slider").value = 1000;
initGlobe().finally(() => setTimeout(() => $("#splash").classList.add("out"), 500));
setTimeout(() => $("#splash").classList.add("out"), 4000);
window.__atlas = { state, get globe() { return globe; }, visible, select };
