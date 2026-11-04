// Task 1 only. Build + vite preview (4173), then NODE_PATH=... node this file.
// CHROMIUM_PATH selects an existing browser. Screenshots are test artifacts outside the checkout.
const assert = require("node:assert/strict");
const { mkdirSync } = require("node:fs");
const { chromium } = require("playwright");
const { bridge } = require("./mockBridge.cjs");
const BASE = process.env.BASE || "http://127.0.0.1:4173";
const OUT = process.env.ARTIFACT_DIR || "/tmp/my-island-task1-shots";
mkdirSync(OUT, { recursive: true });
let checks = 0;
const ok = (name, condition) => { assert.ok(condition, name); checks++; console.log(`PASS ${name}`); };
const mediaFor = (kind) => ({ session: true, kind: "gsmtc", degraded: false, source: kind === "audio" ? "Spotify.exe" : "YouTube", source_name: kind === "audio" ? "Spotify" : "YouTube", title: kind === "audio" ? "Blinding Lights" : "سورة الكهف", artist: kind === "audio" ? "The Weeknd" : "مشاري راشد العفاسي", album: "", duration: 2530, position: 760, playing: true, can_prev: true, can_next: true, can_seek: true });
async function main() {
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const open = async (pack, kind, language = "ar", size = [560, 360], extraSettings = {}) => {
    const context = await browser.newContext({ viewport: { width: 800, height: 500 } });
    const page = await context.newPage(), errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const now = Date.now();
    const settings = { language, settingsVersion: 4, panelTabsStyle: "dock", panelWidth: size[0], panelHeight: size[1], themeMode: pack === "ivory" ? "light" : "dark", themePack: pack, themePackLight: pack, themePackDark: pack, themeMaterial: "solid", eyesEnabled: false, hoverDelayMs: 0, motionLevel: "off", updateAutoCheck: false, showToday: true, showWeather: true, showBattery: true, showMeetings: true, ...extraSettings };
    const extra = {
      today_get: { city: { id: "riyadh", ar: "الرياض", en: "Riyadh" }, prayers: [{ id: "asr", at: now + 42 * 60000 }], next_day_at: now + 86400000 },
      weather_get: { enabled: true, offline: false, temp: 26, feels: 26, humidity: 30, wind: 5, code: 0, is_day: true, units: "c", city: language === "ar" ? "الرياض" : "Riyadh", fetched_at: now },
      clip_list: [{ kind: "text", text: "https://example.com/article" }],
      note_get: { html: "<p>خطة الأسبوع</p>", folder: "" },
      meetings_list: { items: [], error: null },
    };
    const cover = kind === "idle" ? null : `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${kind === "video" ? 320 : 180}" height="180"><defs><linearGradient id="g"><stop stop-color="${kind === "video" ? "#124b3b" : "#ff7a62"}"/><stop offset="1" stop-color="${kind === "video" ? "#08251d" : "#ac54dd"}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`).toString("base64")}`;
    await page.addInitScript(bridge({ settings, extra, cover, ...(kind !== "idle" ? { media: mediaFor(kind) } : {}), battery: { has_battery: true, percent: 80, ac: false, charging: false, remaining_min: 120, bt: [] } }));
    await page.goto(`${BASE}/index.html`);
    await page.locator('.island-body[data-mode="pill"]').waitFor();
    await page.waitForFunction((id) => document.documentElement.dataset.pack === id && window.__calls.some(([cmd]) => cmd === "report_island_rect"), pack);
    const pillBox = await page.locator('.island-body[data-mode="pill"]').boundingBox();
    await page.mouse.move(pillBox.x + pillBox.width / 2, pillBox.y + 2);
    await page.waitForTimeout(300);
    const peekBox = await page.locator('.island-body').boundingBox();
    await page.mouse.click(peekBox.x + peekBox.width / 2, peekBox.y + 2); // padding, never a peek control
    await page.locator('[data-testid="home-reference"]').waitFor();
    if (settings.showWeather) await page.getByTestId("tile-weather").waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(800); // capture settled motion/decoded covers, not entrance frames
    return { context, page, errors };
  };
  try {
    for (const pack of ["noir-gold", "ivory", "nebula-mesh"]) {
      for (const kind of ["idle", "video", "audio"]) {
        for (const language of ["ar", "en"]) {
          const { context, page, errors } = await open(pack, kind, language);
          const home = page.getByTestId("home-reference");
          ok("settled home has no inherited blur", await home.evaluate((el) => { for (let p = el; p; p = p.parentElement) { if (!/^none$|^blur\(0px\)$/.test(getComputedStyle(p).filter)) return false; } return true; }));
          const tiles = await home.locator('[data-testid^="tile-"]').evaluateAll((els) => els.map((el) => el.dataset.testid));
          ok(`${pack}/${kind}/${language}: correct ordered tiles ${JSON.stringify(tiles)}`, JSON.stringify(tiles) === JSON.stringify(kind === "idle" ? ["tile-prayer", "tile-weather"] : ["tile-prayer", "tile-weather", "tile-battery"]));
          ok("existing pack remains selected", await page.evaluate((id) => document.documentElement.dataset.pack === id, pack));
          if (kind === "idle") {
            ok("idle: clock, Your day and exactly two data-backed resume actions", await page.getByTestId("idle-clock").isVisible() && await home.getByText(language === "ar" ? "يومك" : "Your day", { exact: true }).isVisible() && await home.locator('button[data-testid^="idle-"]').count() === 2);
            const order = await home.evaluate((el) => { const a = el.querySelector('[data-testid="idle-clock"]').getBoundingClientRect(); const b = el.querySelector('[data-testid="home-tiles"]').getBoundingClientRect(); const c = el.querySelector('[data-testid="idle-note"]').getBoundingClientRect(); return a.bottom <= b.top + 1 && b.bottom <= c.top + 1; });
            ok("idle: header → tiles → resume, with no overlap", order);
            await page.getByTestId("idle-clip").click();
            await page.waitForFunction(() => document.querySelector('[data-testid="dock-clip"]')?.getAttribute("aria-selected") === "true");
            ok("resume clipboard opens its actual page", true);
            await page.getByTestId("dock-home").click();
            await page.getByTestId("home-reference").waitFor();
          } else {
            const dims = await home.locator('[data-testid="thumb"]').evaluate((el) => ({ w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height }));
            ok(`${kind}: correct thumbnail ratio`, Math.abs(dims.w / dims.h - (kind === "video" ? 16 / 9 : 1)) < .025);
            ok(`${kind}: wave only for audio`, await home.locator('[data-viz]').count() === (kind === "audio" ? 1 : 0));
            ok("source, times and three controls visible", await home.getByTestId("source-badge").isVisible() && await home.getByTestId("seekbar").isVisible() && await home.getByTestId("player-controls").locator("button").count() === 3);
            const slider = home.getByRole("slider");
            const box = await slider.boundingBox();
            await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
            ok("seek sends the requested time", await page.evaluate(() => window.__calls.some(([cmd, a]) => cmd === "media_seek" && Math.abs(a.seconds - 1265) < 20)));
            await home.getByRole("button", { name: language === "ar" ? "إيقاف مؤقت" : "Pause", exact: true }).click();
            ok("playback control invokes toggle", await page.evaluate(() => window.__calls.some(([cmd, a]) => cmd === "media_control" && a.action === "toggle")));
          }
          ok("no capture tool circles on home", await home.locator('[data-testid^="capture-"]').count() === 0);
          ok("content fits above the dock", await page.evaluate(() => { const home = document.querySelector('[data-testid="home-reference"]'); const dock = document.querySelector('[data-testid="page-dock"]').getBoundingClientRect(); return [...home.querySelectorAll('[data-testid="player-controls"], [data-testid="home-tiles"], [data-testid="idle-note"], [data-testid="idle-clip"]')].every((el) => el.getBoundingClientRect().bottom <= dock.top + 1); }));
          ok("no page errors", errors.length === 0);
          if (language === "ar") {
            await page.waitForTimeout(800);
            await page.locator('.island-body[data-mode="panel"]').screenshot({ path: `${OUT}/${pack}-${kind}.png` });
          }
          await context.close();
        }
      }
    }
    let small;
    for (const height of [260, 420]) {
      const { context, page } = await open("noir-gold", "audio", "en", [520, height]);
      const h = await page.getByTestId("home-reference").getByTestId("thumb").evaluate((el) => el.getBoundingClientRect().height);
      if (height === 260) small = h;
      else ok("thumbnail scales with the user's panel height", h > small + 40);
      await context.close();
    }
    const { context, page } = await open("ivory", "idle", "en", [560, 360], { moduleMedia: false, showToday: false, showWeather: false, showBattery: false });
    ok("idle remains available with media and optional tiles disabled", await page.getByTestId("idle-clock").isVisible() && await page.getByTestId("home-tiles").count() === 0);
    await context.close();
    console.log(`ALL PASSED (${checks})`);
  } finally { await browser.close(); }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
