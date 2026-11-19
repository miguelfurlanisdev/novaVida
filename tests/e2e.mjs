import { chromium } from "/opt/npm-tools/node_modules/playwright/index.mjs";
const url = "http://localhost:8765/index.html";
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const out = [];
const ok = (n, c, x = "") => { out.push(`${c ? "PASS" : "FAIL"} ${n} ${x}`); };
async function run(name, vp, fn) {
  const p = await (await b.newContext({ viewport: vp, hasTouch: vp.width < 700 })).newPage();
  const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.goto(url); await p.waitForFunction(() => window.__atlas && window.__atlas.globe, null, { timeout: 20000 });
  await p.waitForTimeout(1500);
  await fn(p); ok(name + ": sem erros JS", errs.length === 0, errs.join(" | "));
  await p.screenshot({ path: `/tmp/atlas-${name}.png` });
}
await run("desktop", { width: 1366, height: 800 }, async p => {
  ok("globo criado", await p.evaluate(() => !!window.__atlas.globe), await p.evaluate(() => window.__atlas.globe.kind));
  ok("lista inicial 14", (await p.locator("#list button").count()) === 14);
  await p.fill("#q", "revolucao"); ok("busca filtra (3 resultados; Independência cita a Revolução do Porto)", (await p.locator("#list button").count()) === 3);
  await p.fill("#q", "zzz"); ok("busca vazia mostra mensagem", (await p.locator("#list .empty").count()) === 1);
  await p.fill("#q", "");
  await p.click("#f-cats .chip:nth-child(1)"); const n1 = await p.locator("#list button").count(); ok("filtro categoria", n1 > 0 && n1 < 14, n1);
  await p.click("#btn-clear");
  await p.click("#periods .chip:has-text('Primeira Guerra')"); ok("período filtra", (await p.locator("#list button").count()) === 1);
  await p.click("#t-all");
  await p.locator("#list button", { hasText: "Magna Carta" }).click(); await p.waitForTimeout(1400);
  ok("painel abre", await p.locator("#right h2").innerText() === "Magna Carta");
  ok("hash tem seleção", (await p.evaluate(() => location.hash)).includes("e=magna-carta"));
  ok("globo recebeu seleção", await p.evaluate(() => window.__atlas.state.selected) === "magna-carta");
  ok("fontes com link", (await p.locator("#right .refs a").count()) >= 1);
  await p.click("#right .more"); ok("ler mais expande", await p.locator("#right h3", { hasText: "Consequências" }).isVisible());
  ok("seleção pausa a rotação", (await p.getAttribute("#c-auto", "aria-pressed")) === "false");
  await p.click("#c-auto"); ok("retoma rotação", (await p.getAttribute("#c-auto", "aria-pressed")) === "true");
  await p.click("#c-auto"); ok("pausa rotação", (await p.getAttribute("#c-auto", "aria-pressed")) === "false");
  await p.keyboard.press("Escape"); ok("Esc fecha painel", await p.locator("#right").isHidden());
  await p.fill("#t-slider", String(700)); ok("slider altera conteúdo", (await p.locator("#list button").count()) < 14, await p.innerText("#t-year"));
  await p.click("#t-all");
  await p.click(".nav button[data-mod=linha]"); ok("módulo linha", await p.locator("#view-linha .tl li").count() === 14);
  await p.click(".nav button[data-mod=arquivo]"); ok("módulo arquivo", await p.locator("#view-arquivo .src-card").count() === 14);
  ok("módulos futuros desabilitados", await p.locator(".nav button:disabled").count() === 3);
  await p.click(".nav button[data-mod=explorar]");
  // clique real em marcador (globo 2D): procura marcador visível via estado interno
  const hit = await p.evaluate(() => { const g = window.__atlas.globe; return g.kind; });
  if (hit === "2d") {
    await p.click("#btn-clear"); await p.evaluate(() => window.__atlas.globe.flyTo(48.8566, 2.3522, 2, 1)); await p.waitForTimeout(400);
    const box = await p.locator("#globe canvas").boundingBox();
    await p.mouse.click(box.x + box.width / 2, box.y + box.height / 2); await p.waitForTimeout(300);
    ok("clique em marcador seleciona", await p.evaluate(() => window.__atlas.state.selected) === "revolucao-francesa");
  }
});
await run("mobile", { width: 390, height: 780 }, async p => {
  ok("painel esquerdo oculto no mobile", !(await p.locator("#left").boundingBox().then(bb => bb && bb.x >= 0)));
  await p.tap("#btn-panel"); await p.waitForTimeout(400);
  ok("abre painel", (await p.locator("#left").boundingBox()).x >= 0);
  await p.locator("#list button", { hasText: "Independência do Brasil" }).tap(); await p.waitForTimeout(1500);
  ok("detalhe como bottom sheet", await p.locator("#right").isVisible());
  const sw = await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth); ok("sem rolagem horizontal", sw);
});
console.log(out.join("\n")); await b.close();
