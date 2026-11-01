// جسر Tauri وهمي مشترك لاختبارات Playwright (مأخوذ من tabs.regression.cjs + أوامر النشاط الحي ووضع التبويب).
module.exports.bridge = (cfg) => `
(() => {
  const cfg = ${JSON.stringify(cfg)};
  const listeners = {}; let nid = 1;
  window.__calls = []; window.__timers = 0; window.__raf = 0;
  const st = window.setTimeout, si = window.setInterval, raf = window.requestAnimationFrame;
  window.__count = false;
  window.__stk = []; window.setTimeout = (...a) => { if (window.__count) { window.__timers++; window.__stk.push(a[1] + ' ' + new Error().stack.split('\\n').slice(2,4).join(' | ')); } return st(...a); };
  window.setInterval = (...a) => { if (window.__count) window.__timers++; return si(...a); };
  window.__stall = false; window.__held = [];
  window.requestAnimationFrame = (f) => { if (window.__count) window.__raf++; if (window.__stall) { window.__held.push(f); return 0; } return raf(f); };
  window.__unstall = () => { window.__stall = false; window.__held.splice(0).forEach((f) => raf(f)); };
  window.__emit = (event, payload) => (listeners[event] || []).forEach((id) => window['_' + id] && window['_' + id]({ event, id, payload }));
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main', windowLabel: 'main' } },
    transformCallback(cb) { const id = nid++; window['_' + id] = cb; return id; },
    unregisterCallback(id) { delete window['_' + id]; },
    convertFileSrc: (p) => p,
    invoke(cmd, args) {
      window.__calls.push([cmd, args]);
      if (cmd === 'plugin:event|listen') { (listeners[args.event] ||= []).push(args.handler); return Promise.resolve(args.handler); }
      if (cmd === 'plugin:event|unlisten') return Promise.resolve();
      if (cfg.extra && Object.prototype.hasOwnProperty.call(cfg.extra, cmd)) return Promise.resolve(JSON.parse(JSON.stringify(cfg.extra[cmd]))); // نسخة جديدة كل مرة كالاتصال الحقيقي
      if (cmd === 'settings_get') return Promise.resolve(cfg.settings);
      if (cmd === 'today_cities') return Promise.resolve([]);
      if (cmd === 'meetings_key_status') return Promise.resolve({ set: false });
      if (cmd === 'perf_status') return Promise.resolve({ eco: !!cfg.eco, reason: cfg.eco ? 'manual' : null, onBattery: null });
      if (cmd === 'media_now') return Promise.resolve({ info: cfg.media || { session: false, source: '', source_name: '', title: '', artist: '', album: '', duration: 0, position: 0, playing: false, can_prev: false, can_next: false, can_seek: false }, cover: null });
      if (cmd === 'record_status') return Promise.resolve(cfg.rec || { recording: false, startedAt: 0, format: 'mp4' });
      if (cmd === 'island_dock_get') return Promise.resolve(cfg.dock || { active: false, browser: '', strip: 0, inset: 0 });
      if (cmd === 'timer_get') return Promise.resolve(cfg.timer || null);
      if (cmd === 'battery_status') return Promise.resolve(cfg.battery || { has_battery: true, percent: 80, ac: false, charging: false, remaining_min: 120, bt: [] });
      if (cmd === 'downloads_list') return Promise.resolve(cfg.dl || { active: [], recent: [] });
      if (['reminders_get','shelf_list','launcher_list','launcher_groups_get'].includes(cmd)) return Promise.resolve([]);
      if (cmd === 'launcher_hotkeys_get') return Promise.resolve({});
      if (cmd === 'attention_today') return Promise.resolve({ total: 0, apps: [], enabled: true, day: '2026-11-01' });
      if (cmd === 'downloads_list') return Promise.resolve({ active: [], recent: [] });
      if (cmd === 'island_backdrop') return cfg.backdrop === 'reject' ? Promise.reject('unsupported') : Promise.resolve(cfg.backdrop || 'none');
      if (cmd === 'clip_list' || cmd === 'color_history') return Promise.resolve([]);
      if (cmd === 'note_get') return Promise.resolve({ html: '<p>hello note</p>', folder: '' });
      if (cmd === 'note_folders_get') return Promise.resolve([]);
      if (cmd === 'battery_status') return Promise.resolve({ has_battery: true, percent: 80, ac: false, charging: false, remaining_min: 120, bt: [] });
      if (cmd === 'media_sources') return Promise.resolve([]);
      if (cmd === 'lyrics_get') return Promise.resolve({ synced: false, instrumental: false, lines: [], plain: 'la la', offline: false, found: true });
      if (cmd === 'monitors_list') return Promise.resolve([{ index: 0, name: 'm', width: 1920, height: 1080, primary: true }]);
      if (cmd === 'perf_ram') return Promise.resolve(cfg.ram || { total: 1, main: 1, webview: 0, webviewCount: 0, cpu: 0, active: false, metric: 'private' });
      if (cmd === 'editor_image') return Promise.resolve({ image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8Dwn4GBgYGJAQoAHxgCAQqKtwwAAAAASUVORK5CYII=', path: 'C:/shots/a.png' });
      return Promise.resolve(null);
    },
  };
})();`;
