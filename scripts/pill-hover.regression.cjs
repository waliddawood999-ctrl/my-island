// Task 2, R.png. Build + vite preview on 4173, then NODE_PATH=... node this file.
const assert = require("node:assert/strict");
const { mkdirSync } = require("node:fs");
const { chromium } = require("playwright");
const { bridge } = require("./mockBridge.cjs");
const BASE = process.env.BASE || "http://127.0.0.1:4173";
const OUT = process.env.ARTIFACT_DIR || "/tmp/my-island-task2-shots";
mkdirSync(OUT, { recursive: true });
const MEDIA = { session: true, kind: "gsmtc", degraded: false, source: "YouTube", source_name: "YouTube", title: "سورة الكهف", artist: "مشاري راشد العفاسي", album: "", duration: 240, position: 60, playing: true, can_seek: true, can_prev: true, can_next: true };
const cover = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#124b3b"/></svg>').toString("base64")}`;
let n = 0;
const ok = (name, condition) => { assert.ok(condition, name); n++; console.log(`PASS ${name}`); };
async function main() {
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const fresh = async (pack, level, language = "ar", custom = {}, media = MEDIA) => {
    const context = await browser.newContext({ viewport: { width: 800, height: 500 } });
    const page = await context.newPage(), errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const settings = { language, settingsVersion: 4, themeMode: pack === "ivory" ? "light" : "dark", themePack: pack, themePackLight: pack, themePackDark: pack, themeMaterial: "solid", panelTabsStyle: "dock", eyesEnabled: false, hoverDelayMs: 0, motionLevel: level, updateAutoCheck: false, showToday: false, showWeather: false, showMeetings: false, showBattery: false, pillWidth: 280, pillHeight: 44, peekWidth: 460, peekHeight: 148, panelWidth: 560, panelHeight: 360, ...custom };
    await page.addInitScript(bridge({ settings, media, cover }));
    await page.goto(`${BASE}/index.html`);
    await page.getByTestId("capsule-media").waitFor();
    await page.waitForFunction((id) => document.documentElement.dataset.pack === id && window.__calls.some(([cmd]) => cmd === "report_island_rect"), pack);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(650);
    return { context, page, errors, settings };
  };
  const dims = (page) => page.locator('.island-body').evaluate((el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  const enter = async (page) => { const r = await dims(page); await page.mouse.move(r.x + r.w / 2, r.y + 2); await page.locator('[data-pill-hover="true"]').waitFor(); await page.waitForTimeout(800); };
  const leave = async (page) => {
    await page.mouse.move(0, 490);
    try { await page.waitForFunction(() => document.querySelector('.island-body')?.dataset.mode === "pill", undefined, { timeout: 5000 }); }
    catch (e) { console.error("leave state", await page.evaluate(() => ({ mode: document.querySelector('.island-body')?.dataset.mode, root: document.querySelector('#root').childElementCount, hovered: [...document.querySelectorAll(':hover')].map((el) => el.tagName + '.' + el.className).slice(-6) }))); throw e; }
    await page.waitForTimeout(800);
  };
  try {
    for (const pack of ["noir-gold", "ivory", "nebula-mesh"]) for (const level of (process.env.ONLY_LEVEL ? [process.env.ONLY_LEVEL] : ["full", "reduced", "off"])) {
      const { context, page, errors } = await fresh(pack, level);
      const rest = await dims(page);
      const thumb = await page.getByTestId("pill-rest-thumb").boundingBox();
      ok(`${pack}/${level}: rest preserves 280×44 and thumbnail 64×36`, Math.abs(rest.w - 280) < 1 && Math.abs(rest.h - 44) < 1 && thumb.width === 64 && thumb.height === 36);
      ok("rest has name/wave without controls or seek", await page.getByTestId("capsule-media").locator('[data-viz]').count() === 1 && await page.getByTestId("capsule-media").getByText(MEDIA.title, { exact: true }).isVisible() && await page.getByTestId("player-controls").filter({ visible: true }).count() === 0 && await page.getByTestId("seekbar").filter({ visible: true }).count() === 0);
      if (level === "full") await page.locator('.island-body').screenshot({ path: `${OUT}/${pack}-rest.png` });
      await enter(page);
      const hovered = await dims(page), player = page.locator('[data-pill-hover="true"]');
      ok("hover keeps the top edge and the user's peek size (460×188)", Math.abs(hovered.y - rest.y) < 1 && Math.abs(hovered.w - 460) < 1 && Math.abs(hovered.h - 188) < 1);
      ok("hover contains thumbnail, seek/times and controls, without tab chrome", await player.getByTestId("thumb").isVisible() && await player.getByTestId("seekbar").isVisible() && await player.getByTestId("times").isVisible() && await player.getByTestId("player-controls").isVisible() && await page.getByTestId("peek-tabs").count() === 0);
      ok("header, seek and controls do not overlap and stay inside", await player.evaluate((el) => { const a = el.querySelector('.pill-hover-header').getBoundingClientRect(), b = el.querySelector('[data-testid="seekbar"]').getBoundingClientRect(), c = el.querySelector('[data-testid="player-controls"]').getBoundingClientRect(), r = el.getBoundingClientRect(); return a.bottom <= b.top + 1 && b.bottom <= c.top + 1 && c.bottom <= r.bottom + 1; }));
      const slider = player.getByRole("slider"), box = await slider.boundingBox();
      const calls = () => page.evaluate(() => window.__calls.filter(([cmd]) => cmd === "media_seek").length);
      const before = await calls();
      await page.mouse.move(box.x + .2 * box.width, box.y + box.height / 2); await page.mouse.down();
      await page.mouse.move(box.x + .7 * box.width, box.y + box.height / 2, { steps: 5 });
      const targetText = await player.getByTestId("time-target").innerText();
      const preview = targetText.match(/(\d+):(\d+)/);
      ok(`drag previews time without seeking before release (${targetText})`, await calls() === before && preview && Math.abs(Number(preview[1]) * 60 + Number(preview[2]) - 168) <= 2);
      ok("target is inside the times row, not a floating bubble", await player.getByTestId("time-target").evaluate((el) => el.parentElement.dataset.testid === "times" && el.getBoundingClientRect().top >= el.parentElement.getBoundingClientRect().top));
      if (level === "full") await page.locator('.island-body').screenshot({ path: `${OUT}/${pack}-scrub.png` });
      await page.mouse.up();
      ok("release sends one seek and leaves hover open", await calls() === before + 1 && await page.evaluate(() => { const c = window.__calls.filter(([cmd]) => cmd === "media_seek").at(-1); return Math.abs(c[1].seconds - 168) < 2 && document.querySelector('.island-body').dataset.mode === "peek"; }));
      await player.getByRole("button", { name: "إيقاف مؤقت", exact: true }).click();
      await page.evaluate((m) => window.__emit("media:update", { ...m, playing: false }), MEDIA);
      await player.getByRole("button", { name: "تشغيل", exact: true }).waitFor();
      ok("pause keeps the hover player available for resume", await player.getByRole("button", { name: "تشغيل", exact: true }).isVisible());
      if (level === "full") await page.locator('.island-body').screenshot({ path: `${OUT}/${pack}-hover.png` });
      await leave(page);
      const returned = await dims(page);
      ok("leaving returns to the unchanged rest size, including paused media", Math.abs(returned.w - rest.w) < 1 && Math.abs(returned.h - rest.h) < 1 && await page.getByTestId("capsule-media").isVisible());
      ok("no settings writes or page errors", errors.length === 0 && await page.evaluate(() => !window.__calls.some(([cmd]) => cmd === "settings_set")));
      await context.close();
    }
    for (const [pillWidth, pillHeight, peekWidth, peekHeight] of [[160, 28, 240, 72], [220, 34, 460, 148], [280, 44, 560, 200]]) {
      const { context, page } = await fresh("ivory", "off", "en", { pillWidth, pillHeight, peekWidth, peekHeight });
      const r = await dims(page), t = await page.getByTestId("pill-rest-thumb").boundingBox();
      ok("custom rest size wins over thumbnail height", Math.abs(r.w - pillWidth) < 1 && Math.abs(r.h - pillHeight) < 1 && t.height <= pillHeight);
      await enter(page);
      ok("custom hover controls stay within their configured height", await page.locator('[data-pill-hover="true"]').evaluate((el) => el.querySelector('[data-testid="player-controls"]').getBoundingClientRect().bottom <= el.getBoundingClientRect().bottom + 1));
      await context.close();
    }
    const { context, page } = await fresh("noir-gold", "off", "en", {}, { ...MEDIA, can_seek: false });
    await enter(page);
    const slider = page.locator('[data-pill-hover="true"]').getByRole("slider");
    ok("unsupported seeking is disabled", await slider.getAttribute("aria-disabled") === "true");
    const disabledBox = await slider.boundingBox();
    await page.mouse.click(disabledBox.x + disabledBox.width / 2, disabledBox.y + disabledBox.height / 2);
    ok("unsupported seeking sends no command", await page.evaluate(() => !window.__calls.some(([cmd]) => cmd === "media_seek")));
    await context.close();
    console.log(`ALL PASSED (${n})`);
  } finally { await browser.close(); }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
