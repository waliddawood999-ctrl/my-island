// فحص المحدّث (Playwright + جسر Tauri وهمي يحاكي tauri-plugin-updater): الفحص الصامت، النشاط الحي، التقدم، الفشل/إعادة المحاولة، وزر الإعدادات اليدوي. تشغيل:
//   npm run build && npx vite preview --port 4173 &   ثم:   NODE_PATH=$(npm root -g) node scripts/updater.regression.cjs
const { chromium } = require("playwright");
const { bridge } = require("./mockBridge.cjs");
const BASE = process.env.BASE || "http://localhost:4173";
let fails = 0;
const ok = (n, c, extra = "") => { if (!c) fails++; console.log(`${c ? "✓" : "✗"} ${n} ${c ? "" : extra}`); };

/** يلفّ invoke الجسر: mode = none | available | fail ؛ dl = ok | fail | failOnce ؛ delay = تأخير الفحص (ms). */
const updaterMock = (u) => `(() => {
  const u = ${JSON.stringify(u)};
  window.__upd = { checks: 0, installs: 0, restarts: 0 };
  const base = window.__TAURI_INTERNALS__.invoke.bind(window.__TAURI_INTERNALS__);
  window.__TAURI_INTERNALS__.invoke = (cmd, args) => {
    if (cmd === 'plugin:updater|check') {
      window.__upd.checks++;
      return new Promise((res, rej) => setTimeout(() => {
        if (u.mode === 'fail') return rej('network');
        if (u.mode === 'none') return res(null);
        res({ rid: 7, currentVersion: '1.0.1', version: '1.0.9', date: '2026-11-01', body: '', rawJson: {} });
      }, u.delay || 0));
    }
    if (cmd === 'plugin:updater|download_and_install') {
      window.__upd.installs++;
      const send = (index, message) => window['_' + args.onEvent.id]({ index, message });
      if (u.dl === 'fail' || (u.dl === 'failOnce' && window.__upd.installs === 1)) return Promise.reject('disk');
      return new Promise((res) => {
        send(0, { event: 'Started', data: { contentLength: 1000 } });
        send(1, { event: 'Progress', data: { chunkLength: 400 } });
        setTimeout(() => { send(2, { event: 'Progress', data: { chunkLength: 600 } }); send(3, { event: 'Finished' }); res(); }, u.hold || 0);
      });
    }
    if (cmd === 'plugin:updater|close' || cmd === 'plugin:resources|close') return Promise.resolve();
    if (cmd === 'plugin:process|restart') { window.__upd.restarts++; return Promise.resolve(); }
    return base(cmd, args);
  };
})();`;

const fresh = async (browser, page_, u, settings = {}) => {
  const ctx = await browser.newContext({ viewport: { width: 760, height: 360 } });
  const page = await ctx.newPage();
  await page.addInitScript(bridge({ settings: { language: "en", eyesEnabled: false, ...settings } }));
  await page.addInitScript(updaterMock(u));
  const errs = [];
  page.on("pageerror", (e) => errs.push((e.message || "").slice(0, 120)));
  await page.goto(`${BASE}/${page_}`);
  return { ctx, page, errs };
};
const upd = (page) => page.evaluate(() => window.__upd);
const open = async (page) => { await page.mouse.move(380, 10); await page.waitForTimeout(1500); };

(async () => {
  const browser = await chromium.launch();

  // 1) لا تحديث ⇒ فحص واحد صامت بعد الإقلاع بثوانٍ ولا يظهر أي شيء
  { const { ctx, page, errs } = await fresh(browser, "index.html", { mode: "none" });
    await page.waitForTimeout(3000);
    ok("auto check waits a few seconds (not at boot)", (await upd(page)).checks === 0);
    await page.waitForTimeout(6500);
    ok("exactly one silent check", (await upd(page)).checks === 1, JSON.stringify(await upd(page)));
    ok("no update capsule when nothing to install", (await page.locator('[data-testid="capsule-update"]').count()) === 0);
    await open(page);
    ok("no update card either", (await page.locator('[data-testid="activity-update"]').count()) === 0);
    ok("no page errors (none)", errs.length === 0, errs.join("|"));
    await ctx.close(); }

  // 2) فشل الفحص ⇒ لا شيء إطلاقًا
  { const { ctx, page, errs } = await fresh(browser, "index.html", { mode: "fail" });
    await page.waitForTimeout(9500);
    ok("failed check attempted once", (await upd(page)).checks === 1);
    ok("failed check shows nothing", (await page.locator('[data-testid="capsule-update"],[data-testid="activity-update"]').count()) === 0);
    ok("no page errors (fail)", errs.length === 0, errs.join("|"));
    await ctx.close(); }

  // 3) updateAutoCheck=false ⇒ لا فحص
  { const { ctx, page } = await fresh(browser, "index.html", { mode: "available" }, { updateAutoCheck: false });
    await page.waitForTimeout(9800);
    ok("autoCheck off ⇒ no check", (await upd(page)).checks === 0);
    await ctx.close(); }

  // 4) تحديث متاح ⇒ نشاط حي + تقدّم + تثبيت + إعادة تشغيل
  { const { ctx, page, errs } = await fresh(browser, "index.html", { mode: "available", dl: "ok", hold: 1200 });
    await page.waitForSelector('[data-testid="capsule-update"]', { timeout: 12000 });
    const cap = await page.locator('[data-testid="capsule-update"]').innerText();
    ok("capsule says new update + install button", /new update/i.test(cap) && /Install/.test(cap), cap);
    await page.screenshot({ path: process.env.SHOTS ? `${process.env.SHOTS}/update-capsule.png` : "/dev/null" }).catch(() => {});
    await open(page);
    ok("panel card shows version", /1\.0\.9/.test(await page.locator('[data-testid="activity-update"]').innerText()));
    await page.locator('[data-testid="update-install"]').click();
    await page.waitForTimeout(400);
    const lab = await page.locator('[data-testid="update-label"]').innerText();
    ok("progress percent inside the activity (40%)", /Downloading 40%/.test(lab), lab);
    ok("progress bar present", (await page.locator('[data-testid="update-progress"]').count()) === 1);
    await page.waitForTimeout(1500);
    ok("restart requested after install", (await upd(page)).restarts === 1, JSON.stringify(await upd(page)));
    ok("no page errors (install)", errs.length === 0, errs.join("|"));
    await ctx.close(); }

  // 5) فشل التنزيل ⇒ رسالة داخل النشاط + إعادة محاولة تنجح
  { const { ctx, page, errs } = await fresh(browser, "index.html", { mode: "available", dl: "failOnce" });
    await page.waitForSelector('[data-testid="capsule-update"]', { timeout: 12000 });
    await open(page);
    await page.locator('[data-testid="update-install"]').click();
    await page.waitForTimeout(600);
    ok("failure shown inside activity", /Update failed/.test(await page.locator('[data-testid="update-label"]').innerText()));
    ok("no restart on failure", (await upd(page)).restarts === 0);
    await page.locator('[data-testid="update-install"]').click();
    await page.waitForTimeout(800);
    ok("retry installs & restarts", (await upd(page)).restarts === 1 && (await upd(page)).installs === 2, JSON.stringify(await upd(page)));
    ok("no page errors (retry)", errs.length === 0, errs.join("|"));
    await ctx.close(); }

  // 6) الإعدادات: الزر اليدوي بحالاته
  for (const [mode, want] of [["none", /up to date/i], ["fail", /Couldn.t check/], ["available", /1\.0\.9/]]) {
    const { ctx, page, errs } = await fresh(browser, "settings.html", { mode, delay: 700 });
    const btn = page.locator('[data-testid="update-check"]');
    await btn.waitFor();
    ok(`[${mode}] button present, no status before click`, (await page.locator('[data-testid="update-status"]').count()) === 0);
    await btn.click();
    await page.waitForTimeout(200);
    ok(`[${mode}] shows Checking… while pending`, /Checking/.test(await page.locator('[data-testid="update-status"]').innerText()) && (await btn.isDisabled()));
    await page.waitForTimeout(1000);
    const t = await page.locator('[data-testid="update-status"]').innerText();
    ok(`[${mode}] final status`, want.test(t), t);
    ok(`[${mode}] no page errors`, errs.length === 0, errs.join("|"));
    if (mode === "none") await page.screenshot({ path: process.env.SHOTS ? `${process.env.SHOTS}/update-settings.png` : "/dev/null" }).catch(() => {});
    await ctx.close();
  }
  { const { ctx, page } = await fresh(browser, "settings.html", { mode: "none" });
    ok("auto-check toggle in General", (await page.getByRole("switch", { name: /Check for updates automatically/ }).count()) + (await page.getByLabel("Check for updates automatically").count()) > 0);
    await ctx.close(); }

  await browser.close();
  console.log(fails ? `FAILED ${fails}` : "ALL PASSED");
  process.exit(fails ? 1 : 0);
})();
