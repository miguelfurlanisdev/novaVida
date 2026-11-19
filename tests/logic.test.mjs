import test from "node:test";
import assert from "node:assert/strict";
import { EVENTS, CATEGORIES, REGIONS } from "../src/data/events.js";
import * as L from "../src/lib/logic.js";

const labels = { cats: CATEGORIES, regs: REGIONS };

test("base de dados é íntegra", () => {
  assert.deepEqual(L.validateEvents(EVENTS, CATEGORIES, REGIONS), []);
});
test("busca sem acento e por múltiplos termos", () => {
  const r = L.applyFilters(EVENTS, { query: "revolucao francesa" }, labels);
  assert.equal(r[0].id, "revolucao-francesa");
  assert.equal(L.applyFilters(EVENTS, { query: "zzzxyz" }, labels).length, 0);
});
test("busca varia com o termo (não é lista fixa)", () => {
  const a = L.applyFilters(EVENTS, { query: "roma" }, labels).map(e => e.id);
  const b = L.applyFilters(EVENTS, { query: "lua" }, labels).map(e => e.id);
  assert.notDeepEqual(a, b);
});
test("filtros de categoria, região e período", () => {
  assert.ok(L.applyFilters(EVENTS, { categories: ["conflito"] }, labels).every(e => e.category === "conflito"));
  assert.ok(L.applyFilters(EVENTS, { regions: ["americas"] }, labels).every(e => e.region === "americas"));
  const r = L.applyFilters(EVENTS, { range: [1914, 1918] }, labels).map(e => e.id);
  assert.ok(r.includes("primeira-guerra") && !r.includes("magna-carta"));
});
test("datas: a.C., aproximadas e intervalos", () => {
  assert.equal(L.fmtYear(-509, true), "c. 509 a.C.");
  assert.equal(L.fmtRange(EVENTS.find(e => e.id === "primeira-guerra")), "1914 d.C. – 1918 d.C.");
});
test("estado na URL: ida e volta e entrada inválida", () => {
  const s = { selected: "magna-carta", query: "carta", categories: ["politica"], regions: [], range: [1000, 1300], module: "conflitos" };
  assert.deepEqual(L.decodeState(L.encodeState(s)), { ...s });
  const bad = L.decodeState("#t=abc,def&e=");
  assert.equal(bad.range, null); assert.equal(bad.selected, null);
});
test("projeção lat/lon: polos e equador", () => {
  const [x, y, z] = L.latLonToXYZ(90, 0); assert.ok(Math.abs(y - 1) < 1e-9 && Math.abs(x) < 1e-9);
  const [x2, , z2] = L.latLonToXYZ(0, 90); assert.ok(Math.abs(x2 - 1) < 1e-9 && Math.abs(z2) < 1e-9);
});

import { topoToPolygons, ortho, orthoInverse } from "../src/lib/geo.js";
test("TopoJSON sintético: decodifica anel com arcos invertidos (dados só de teste)", () => {
  const topo = { type: "Topology", transform: { scale: [1, 1], translate: [0, 0] },
    arcs: [[[0, 0], [10, 0], [0, 10]], [[10, 10], [-10, 0], [0, -10]]],
    objects: { t: { type: "Polygon", arcs: [[0, 1]] } } };
  const [poly] = topoToPolygons(topo);
  assert.equal(poly[0].length, 5);
  assert.deepEqual(poly[0][0], [0, 0]); assert.deepEqual(poly[0][2], [10, 10]);
});
test("ortográfica: ida e volta e ocultação do hemisfério oposto", () => {
  const p = ortho(-23.5, -46.6, 10, -40, 100, 0, 0);
  assert.ok(p.visible);
  const inv = orthoInverse(p.x, p.y, 10, -40, 100, 0, 0);
  assert.ok(Math.abs(inv.lat + 23.5) < 1e-6 && Math.abs(inv.lon + 46.6) < 1e-6);
  assert.equal(ortho(0, 140, 0, -40, 100, 0, 0).visible, false);
  assert.equal(orthoInverse(500, 0, 0, 0, 100, 0, 0), null);
});

test("escala temporal não linear é monotônica e invertível", () => {
  let prev = -Infinity;
  for (let v = 0; v <= 1000; v += 25) { const y = L.sliderToYear(v); assert.ok(y >= prev); prev = y; }
  for (const y of [-2560, -27, 622, 1215, 1492, 1789, 1969]) assert.ok(Math.abs(L.sliderToYear(L.yearToSlider(y)) - y) <= 6, String(y));
});
