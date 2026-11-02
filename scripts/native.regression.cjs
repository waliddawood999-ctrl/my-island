// Windows-only integration against the actual Tauri process/WebView2, not mockBridge.
// Debug binary uses the built frontend served at localhost:1420. No updater install or release publishing.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');
const { chromium } = require('playwright');

const out = path.resolve('test-results/native');
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'myisland-native-'));
fs.mkdirSync(out, { recursive: true });
const checks = [];
let child, browser, exited;
const check = (name, value) => { assert.ok(value, name); checks.push(name); console.log(`PASS ${name}`); };
const invoke = (page, cmd, args = {}) => page.evaluate(({ cmd, args }) => window.__TAURI_INTERNALS__.invoke(cmd, args), { cmd, args });
const hasExited = () => child && (child.exitCode !== null || child.signalCode !== null);

async function launch(round) {
  const stdout = fs.openSync(path.join(out, `stdout-${round}.log`), 'w');
  const stderr = fs.openSync(path.join(out, `stderr-${round}.log`), 'w');
  child = spawn(path.resolve('src-tauri/target/debug/my-island.exe'), [], {
    env: { ...process.env, ISLAND_DATA_DIR: data, WEBVIEW2_USER_DATA_FOLDER: path.join(data, 'webview2'), WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=9222' },
    stdio: ['ignore', stdout, stderr],
  });
  fs.closeSync(stdout); fs.closeSync(stderr);
  exited = new Promise((resolve, reject) => { child.once('exit', (code) => resolve(code)); child.once('error', reject); });
  for (let i = 0; i < 90; i++) {
    if (hasExited()) throw new Error(`native process exited before WebView2 was ready (${child.exitCode})`);
    try {
      const r = await fetch('http://127.0.0.1:9222/json/version', { signal: AbortSignal.timeout(1000) });
      if (r.ok) { browser = await chromium.connectOverCDP('http://127.0.0.1:9222'); break; }
    } catch {}
    await delay(1000);
  }
  assert.ok(browser, 'WebView2 remote debugging endpoint did not start');
  let main;
  for (let i = 0; i < 60; i++) {
    main = browser.contexts().flatMap((c) => c.pages()).find((p) => /localhost:1420\/?(?:index\.html)?$/.test(p.url()));
    if (main) break;
    await delay(500);
  }
  assert.ok(main, `main native WebView2 page not found; targets: ${browser.contexts().flatMap((c) => c.pages()).map((p) => p.url()).join(', ')}`);
  await main.waitForSelector('.island-body', { timeout: 30000 });
  await main.waitForFunction(() => !!window.__TAURI_INTERNALS__, null, { timeout: 10000 });
  return main;
}

async function quit(settings) {
  // Invocation may disconnect before its reply; process exit and exit code are the assertion.
  invoke(settings, 'app_quit').catch(() => {});
  const code = await Promise.race([exited, delay(15000).then(() => { throw new Error('app_quit did not terminate the native process'); })]);
  check('native app_quit exits with code 0', code === 0);
  await browser.close().catch(() => {}); browser = null;
  // Let WebView2 release its debugging port before the next launch.
  await delay(1500);
}

async function settingsPage(main) {
  await invoke(main, 'open_settings');
  for (let i = 0; i < 60; i++) {
    const p = browser.contexts().flatMap((c) => c.pages()).find((p) => p.url().includes('settings.html'));
    if (p) { await p.waitForSelector('[data-nav="appearance"]', { timeout: 30000 }); return p; }
    await delay(500);
  }
  throw new Error('native settings window did not open');
}

(async () => {
  assert.equal(process.platform, 'win32', 'this integration requires Windows');
  try {
    let main = await launch(1);
    for (const cmd of ['system_accent', 'wallpaper_color']) {
      const v = await invoke(main, cmd);
      check(`main ${cmd} allowed and returns a colour or null`, v === null || /^#[0-9a-f]{6}$/i.test(v));
    }
    await invoke(main, 'settings_set', { patch: { language: 'en', themePack: 'aurora', updateAutoCheck: false } });
    let settings = await settingsPage(main);
    for (const cmd of ['system_accent', 'wallpaper_color', 'system_transparency', 'media_now']) {
      const v = await invoke(settings, cmd);
      check(`settings ${cmd} allowed with a valid response`, cmd === 'media_now' ? !!v?.info : cmd === 'system_transparency' ? typeof v === 'boolean' : v === null || /^#[0-9a-f]{6}$/i.test(v));
    }
    check('settings window sees main settings changes', (await invoke(settings, 'settings_get')).themePack === 'aurora');
    await settings.locator('[data-nav="appearance"]').click();
    await settings.screenshot({ path: path.join(out, 'settings-webview2.png') });
    await main.screenshot({ path: path.join(out, 'island-webview2.png') });
    await delay(12000); // At least two watchdog silence windows, with actual page_pong IPC running.
    check('native WebView2 heartbeat stays healthy', !hasExited() && !fs.existsSync(path.join(data, 'crash-log.txt')));
    check('fresh SQLite database created', fs.readFileSync(path.join(data, 'island.db')).subarray(0, 16).toString() === 'SQLite format 3\0');
    await quit(settings);
    main = await launch(2);
    const persisted = await invoke(main, 'settings_get');
    check('settings persist across a native restart', persisted.themePack === 'aurora' && persisted.language === 'en' && persisted.updateAutoCheck === false);
    settings = await settingsPage(main);
    await quit(settings);
    fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ passed: true, checks }, null, 2));
  } catch (error) {
    fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ passed: false, checks, error: String(error.stack || error) }, null, 2));
    throw error;
  } finally {
    if (child && !hasExited()) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F']);
    if (browser) await browser.close().catch(() => {});
    const log = path.join(data, 'crash-log.txt');
    if (fs.existsSync(log)) fs.copyFileSync(log, path.join(out, 'crash-log.txt'));
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
