// لقطات P (متصفح بجسر وهمي — ليست نافذة ويندوز): إطلالة المشغّل (فيديو/صوت)، تبويبان داخل الإطلالة، واللوحة — عند 100% و150%. → docs/screenshots/peek-*.png
const { chromium } = require("playwright"); const { bridge } = require("./mockBridge.cjs");
const BASE = process.env.BASE || "http://localhost:4173"; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const M = { session: true, source: "chrome.exe", source_name: "Google Chrome", title: "Interstellar Main Theme — Hans Zimmer", artist: "Hans Zimmer", album: "", duration: 252, position: 61, playing: true, can_prev: true, can_next: true, can_seek: true, kind: "gsmtc", degraded: false };
const AUD = { ...M, source: "Spotify.exe", source_name: "Spotify", title: "Midnight City", artist: "M83", album: "Hurry Up, We're Dreaming" };
(async () => {
  const b = await chromium.launch();
  const art = async (w, h, a, c) => { const p = await b.newPage(); const u = await p.evaluate(([w, h, a, c]) => { const k = document.createElement("canvas"); k.width = w; k.height = h; const x = k.getContext("2d"); const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, a); g.addColorStop(1, c); x.fillStyle = g; x.fillRect(0, 0, w, h); x.fillStyle = "rgba(255,255,255,.85)"; x.beginPath(); x.arc(w * .5, h * .5, Math.min(w, h) * .22, 0, 7); x.fill(); return k.toDataURL("image/png"); }, [w, h, a, c]); await p.close(); return u; };
  const vid = await art(1280, 720, "#1d4ed8", "#9333ea"), sq = await art(640, 640, "#f97316", "#be123c");
  for (const dpr of [1, 1.5]) {
    const t = Math.round(dpr * 100);
    const run = async (name, media, cover, act) => {
      const ctx = await b.newContext({ viewport: { width: 800, height: 330 }, deviceScaleFactor: dpr }); const page = await ctx.newPage();
      await page.addInitScript(bridge({ settings: { language: "en", eyesEnabled: false, settingsVersion: 3, hoverDelayMs: 0, themeMode: "dark" }, media, extra: { media_now: { info: media, cover } } }));
      await page.goto(`${BASE}/index.html`); await sleep(900); await page.hover(".island-body"); await sleep(1100); if (act) await act(page);
      await page.screenshot({ path: `docs/screenshots/peek-${name}-${t}.png`, clip: { x: 150, y: 0, width: 500, height: 330 } }); await ctx.close();
    };
    await run("video", M, vid);
    await run("audio", AUD, sq);
    await run("tab-clipboard", AUD, sq, async (p) => { await p.click("[data-testid=peek-tabs] [role=tab][aria-label=Clipboard]"); await sleep(1100); });
    await run("tab-tools", AUD, sq, async (p) => { await p.click("[data-testid=peek-tabs] [role=tab][aria-label=Tools]"); await sleep(1100); });
    await run("seek-drag", M, vid, async (p) => { const r = await p.evaluate(() => { const e = document.querySelector("[data-testid=seekbar] .sk").getBoundingClientRect(); return { x: e.left, y: e.top + e.height / 2, w: e.width }; }); await p.mouse.move(r.x + r.w * .2, r.y); await p.mouse.down(); await p.mouse.move(r.x + r.w * .62, r.y, { steps: 5 }); await sleep(250); });
  }
  await b.close();
})();
