// يرسم src/*.html إلى PNG بدقة 2x (Chromium بلا واجهة). تشغيل من جذر المستودع بعد npm ci:  NODE_PATH=$(npm root -g) node docs/design/T07/render.cjs
const { chromium } = require("playwright");
const path = require("path"), fs = require("fs");
(async () => {
  const dir = __dirname, src = path.join(dir, "src");
  const b = await chromium.launch(); const out = [];
  for (const f of fs.readdirSync(src).filter((x) => x.endsWith(".html")).sort()) {
    const page = await (await b.newContext({ deviceScaleFactor: 2, viewport: { width: 1000, height: 600 } })).newPage();
    await page.goto("file://" + path.join(src, f)); await page.waitForTimeout(500);
    const [w, h] = await page.evaluate(() => [document.body.offsetWidth, document.body.offsetHeight]);
    await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(200);
    const name = f.replace(".html", ".png"); await page.screenshot({ path: path.join(dir, name) }); out.push(name);
  }
  await b.close(); console.log(out.join("\n"));
})();
