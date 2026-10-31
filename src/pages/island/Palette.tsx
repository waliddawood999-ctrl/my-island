import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  AppWindow, Calculator, ArrowRightLeft, File as FileIcon, Folder, Globe, Search, Settings as SettingsIcon, Terminal,
} from "lucide-react";
import { i } from "../../i18n";
import type { Settings } from "../../settings";
import { calc } from "./palette/calc";
import { convert } from "./palette/convert";
import { initials, score } from "./palette/match";
import { searchUrlFor } from "./palette/web";

interface AppEntry { id: string; name: string; path: string }
interface FileHit { name: string; path: string; is_dir: boolean }
interface Recent { path: string; name: string; count: number; last: number }

type Kind = "calc" | "conv" | "app" | "file" | "folder" | "cmd" | "web" | "shell" | "settings";
interface Item {
  key: string;
  kind: Kind;
  title: string;
  sub?: string;
  /** مسار يُستخرج منه الأيقونة عبر palette_icon (تطبيقات/ملفات). */
  iconPath?: string;
  /** تنفيذ؛ mods = مفاتيح التعديل (Ctrl+Enter ⇒ إظهار في المجلد، Ctrl+Shift+Enter ⇒ كمسؤول). */
  run: (m: { ctrl: boolean; shift: boolean }) => void;
}

let appsCache: AppEntry[] | null = null;
const iconCache = new Map<string, string | null>();

/** أوامر ثابتة: الإعدادات والمسارات الخاصة (open_settings / open_path). */
const COMMANDS = () => [
  { id: "island", title: i("إعدادات الجزيرة", "Island settings"), kw: "settings preferences اعدادات إعدادات خيارات", settings: true as const },
  { id: "winset", title: i("إعدادات ويندوز", "Windows settings"), kw: "windows settings ms-settings", target: "ms-settings:" },
  { id: "dl", title: i("التنزيلات", "Downloads"), kw: "downloads تنزيلات تحميلات", target: "shell:Downloads" },
  { id: "docs", title: i("المستندات", "Documents"), kw: "documents docs مستندات ملفات", target: "shell:Personal" },
  { id: "desk", title: i("سطح المكتب", "Desktop"), kw: "desktop سطح المكتب", target: "shell:Desktop" },
  { id: "pics", title: i("الصور", "Pictures"), kw: "pictures photos صور", target: "shell:My Pictures" },
  { id: "pc", title: i("هذا الكمبيوتر", "This PC"), kw: "this pc computer كمبيوتر حاسوب", target: "shell:MyComputerFolder" },
  { id: "bin", title: i("سلة المحذوفات", "Recycle Bin"), kw: "recycle bin trash سلة محذوفات", target: "shell:RecycleBinFolder" },
  { id: "tm", title: i("مدير المهام", "Task Manager"), kw: "task manager taskmgr مدير المهام", target: "taskmgr.exe" },
];

function AppIcon({ path, kind }: { path?: string; kind: Kind }) {
  const [src, setSrc] = useState<string | null>(path ? iconCache.get(path) ?? null : null);
  useEffect(() => {
    if (!path) return;
    if (iconCache.has(path)) { setSrc(iconCache.get(path) ?? null); return; }
    let alive = true;
    invoke<string | null>("palette_icon", { path })
      .then((b) => {
        const v = b ? `data:image/png;base64,${b}` : null;
        iconCache.set(path, v);
        if (alive) setSrc(v);
      })
      .catch(() => { iconCache.set(path, null); });
    return () => { alive = false; };
  }, [path]);
  if (src) return <img src={src} alt="" width={28} height={28} className="h-7 w-7 shrink-0 object-contain" draggable={false} />;
  const C = { calc: Calculator, conv: ArrowRightLeft, app: AppWindow, file: FileIcon, folder: Folder, cmd: SettingsIcon, web: Globe, shell: Terminal, settings: SettingsIcon }[kind];
  return <C size={22} className="shrink-0 text-white/70" />;
}

const isAppPath = (p: string) => /\.(lnk|exe|url|appref-ms)$/i.test(p);

export function Palette({ settings, onClose }: { settings: Partial<Settings>; onClose: (restore: boolean) => void }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [apps, setApps] = useState<AppEntry[]>(appsCache ?? []);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [files, setFiles] = useState<FileHit[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  // الفوكس: يؤخذ عند الفتح فقط (Pill يعيده بـ release_focus عند الإغلاق).
  useEffect(() => {
    invoke("take_focus").catch(() => {});
    const t = [30, 120, 300].map((ms) => window.setTimeout(() => input.current?.focus(), ms));
    input.current?.focus();
    if (!appsCache) {
      invoke<AppEntry[]>("palette_apps").then((a) => { appsCache = a; setApps(a); }).catch(() => {});
    }
    invoke<Recent[]>("palette_recent").then(setRecent).catch(() => {});
    invoke("files_warm").catch(() => {});
    return () => t.forEach((x) => window.clearTimeout(x));
  }, []);

  // فقدان الفوكس لتطبيق آخر (نقر خارجي): أغلق دون ردّ الفوكس. نتجاهل blur قبل أن يستقر الفوكس عندنا.
  useEffect(() => {
    let focused = document.hasFocus();
    const f = () => { focused = true; };
    const b = () => { if (focused) onClose(false); };
    window.addEventListener("focus", f);
    window.addEventListener("blur", b);
    return () => { window.removeEventListener("focus", f); window.removeEventListener("blur", b); };
  }, [onClose]);

  const launch = useCallback((target: string, mode: string, name?: string) => {
    invoke("run_shell", { target, mode, name }).catch(() => {});
    onClose(false);
  }, [onClose]);

  const copy = useCallback(async (text: string) => {
    try { await navigator.clipboard.writeText(text); } catch {
      const ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch { /* لا حافظة */ }
      ta.remove();
    }
    setNote(i("نُسخ", "Copied"));
    window.setTimeout(() => onClose(true), 350);
  }, [onClose]);

  const raw = q.trim();
  const mode: "shell" | "web" | "calc" | "normal" =
    raw.startsWith(">") ? "shell" : raw.startsWith("?") ? "web" : raw.startsWith("=") ? "calc" : "normal";
  const body = mode === "normal" ? raw : raw.slice(1).trim();

  // بحث الملفات (غير متزامن، بتأخير قصير)
  useEffect(() => {
    if (mode !== "normal" || body.length < 2) { setFiles([]); return; }
    let alive = true;
    const t = window.setTimeout(() => {
      invoke<FileHit[]>("files_search", { query: body, limit: 5 })
        .then((r) => { if (alive) setFiles(r); })
        .catch(() => { if (alive) setFiles([]); });
    }, 120);
    return () => { alive = false; window.clearTimeout(t); };
  }, [body, mode]);

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    const webItem = (text: string): Item | null => {
      const url = searchUrlFor(settings.searchEngine, settings.searchUrl, text);
      if (!url) return null;
      return {
        key: "web", kind: "web", title: i(`بحث في الويب عن «${text}»`, `Search the web for “${text}”`),
        sub: settings.searchEngine || "google", run: () => launch(url, "open"),
      };
    };
    if (!raw) {
      const byRecency = [...recent].sort((a, b) => b.last - a.last).slice(0, 7);
      return byRecency.map((r): Item => ({
        key: "r:" + r.path, kind: isAppPath(r.path) ? "app" : "file", title: r.name, sub: i("أخيرًا", "Recent"),
        iconPath: r.path, run: (m) => launch(r.path, m.shift ? "admin" : m.ctrl ? "folder" : "open", r.name),
      }));
    }
    if (mode === "shell") {
      if (!body) return [];
      return [{
        key: "shell", kind: "shell", title: i(`تشغيل: ${body}`, `Run: ${body}`),
        sub: i("Enter تنفيذ · Ctrl+Shift+Enter كمسؤول · ps … لـ PowerShell", "Enter run · Ctrl+Shift+Enter as admin · ps … for PowerShell"),
        run: (m) => launch(body, m.shift ? "admin-shell" : "shell"),
      }];
    }
    if (mode === "web") {
      const w = body ? webItem(body) : null;
      return w ? [w] : [];
    }
    // حاسبة
    const c = calc(body, mode === "calc");
    if (c) {
      out.push({
        key: "calc", kind: "calc", title: c.text, sub: i(`${c.expr} = · Enter لنسخ النتيجة`, `${c.expr} = · Enter to copy`),
        run: () => copy(c.text),
      });
    }
    if (mode === "normal") {
      const cv = convert(body);
      if (cv) {
        out.push({
          key: "conv", kind: "conv", title: cv.text, sub: `${cv.from} → ${cv.to} · ${i("Enter لنسخ النتيجة", "Enter to copy")}`,
          run: () => copy(cv.text),
        });
      }
      // تطبيقات (الأخيرة/الأكثر استخدامًا تتقدّم قليلًا)
      const boost = new Map(recent.map((r) => [r.path.toLowerCase(), Math.min(r.count, 10) * 8]));
      const appHits = apps
        .map((a) => {
          const s = score(a.name, body) ?? (initials(a.name, body) ? 300 : null);
          return s == null ? null : { a, s: s + (boost.get(a.path.toLowerCase()) ?? 0) };
        })
        .filter((x): x is { a: AppEntry; s: number } => !!x)
        .sort((x, y) => y.s - x.s)
        .slice(0, 6);
      for (const { a } of appHits) {
        out.push({
          key: "a:" + a.id, kind: "app", title: a.name, sub: i("تطبيق", "App"), iconPath: a.path,
          run: (m) => launch(a.path, m.shift ? "admin" : m.ctrl ? "folder" : "open", a.name),
        });
      }
      // أوامر ثابتة
      let cmdN = 0;
      for (const c2 of COMMANDS()) {
        if (cmdN >= 3) break;
        if ((score(c2.title + " " + c2.kw, body) ?? null) == null) continue;
        cmdN++;
        out.push({
          key: "c:" + c2.id, kind: "cmd", title: c2.title, sub: i("أمر", "Command"),
          run: () => {
            if ("settings" in c2) { invoke("open_settings").catch(() => {}); onClose(false); }
            else launch(c2.target, "open");
          },
        });
      }
      // ملفات ومجلدات
      const seen = new Set(out.map((o) => o.iconPath?.toLowerCase()));
      for (const f of files) {
        if (seen.has(f.path.toLowerCase())) continue;
        out.push({
          key: "f:" + f.path, kind: f.is_dir ? "folder" : "file", title: f.name, sub: f.path, iconPath: f.path,
          run: (m) => launch(f.path, m.ctrl ? "folder" : "open", f.name),
        });
      }
      if (!out.length) {
        const w = webItem(body);
        if (w) out.push(w);
      }
    }
    return out; // mode "=" : حاسبة فقط
  }, [raw, mode, body, apps, recent, files, settings.searchEngine, settings.searchUrl, launch, copy, onClose]);

  useEffect(() => { setSel(0); }, [q]);
  useEffect(() => {
    (list.current?.children[sel] as HTMLElement | undefined)?.scrollIntoView({ block: "nearest" });
  }, [sel, items.length]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); onClose(true); }
    else if (e.key === "ArrowDown" || (e.key === "Tab" && !e.shiftKey)) { e.preventDefault(); setSel((s) => (items.length ? (s + 1) % items.length : 0)); }
    else if (e.key === "ArrowUp" || (e.key === "Tab" && e.shiftKey)) { e.preventDefault(); setSel((s) => (items.length ? (s - 1 + items.length) % items.length : 0)); }
    else if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      items[sel]?.run({ ctrl: e.ctrlKey, shift: e.shiftKey });
    }
  };

  return (
    <div className="flex h-full w-full flex-col" onKeyDown={onKey}>
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-white/10 px-4">
        <Search size={18} className="shrink-0 text-white/60" />
        <input
          ref={input}
          dir="auto"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          spellCheck={false}
          autoComplete="off"
          placeholder={i("ابحث عن تطبيق أو ملف، أو احسب أو حوّل…", "Search apps and files, calculate or convert…")}
          aria-label={i("شريط الأوامر", "Command palette")}
          className="min-w-0 flex-1 bg-transparent text-[16px] text-white outline-none placeholder:text-white/40"
        />
        {note && <span className="shrink-0 rounded-full bg-white/15 px-2 py-0.5 text-[11px]">{note}</span>}
      </div>
      <div ref={list} role="listbox" className="min-h-0 flex-1 overflow-y-auto p-2">
        {items.map((it, n) => (
          <div
            key={it.key}
            role="option"
            aria-selected={n === sel}
            onMouseMove={() => sel !== n && setSel(n)}
            onClick={(e) => it.run({ ctrl: e.ctrlKey, shift: e.shiftKey })}
            className={`flex h-11 cursor-default items-center gap-3 rounded-xl px-3 ${n === sel ? "bg-white/15" : ""}`}
          >
            <AppIcon path={it.iconPath} kind={it.kind} />
            <div className="min-w-0 flex-1">
              <div dir="auto" className={`truncate ${it.kind === "calc" || it.kind === "conv" ? "text-[18px] font-semibold" : "text-[14px]"}`}>{it.title}</div>
              {it.sub && <div dir="auto" className="truncate text-[11px] text-white/50">{it.sub}</div>}
            </div>
          </div>
        ))}
        {!items.length && (
          <div className="px-3 py-6 text-center text-[13px] text-white/40">
            {raw ? i("لا نتائج", "No results") : i("اكتب للبحث…", "Type to search…")}
          </div>
        )}
      </div>
      <div className="flex h-8 shrink-0 items-center gap-4 border-t border-white/10 px-4 text-[11px] text-white/40">
        <span>{i("↑↓ تنقّل", "↑↓ navigate")}</span>
        <span>{i("↵ فتح", "↵ open")}</span>
        <span>{i("Esc إغلاق", "Esc close")}</span>
        <span className="ms-auto" dir="auto">{i("> أمر · ? ويب · = حاسبة", "> shell · ? web · = calc")}</span>
      </div>
    </div>
  );
}
