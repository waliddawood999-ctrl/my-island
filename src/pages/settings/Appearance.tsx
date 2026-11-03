import { deriveFor, ENV_DEFAULT, chosenPackId, type Env } from "../../appearance";
// قسم «المظهر» الشامل (docs/THEMES.md §التخصيص): معرض الحزم أولًا (معاينة حيّة للوحة الموسّعة + معاينة فاتح/داكن منقسمة + تعيين حزمة منفصل لكل وضع)،
// ثم وحدات منظّمة (أيقونة + ملخص سطر + معاينة مصغّرة + إعادة ضبط لكل وحدة). مستويات إفصاح (أساسي/متقدم/خبير)، رفّ «ثيماتي»، تصدير/استيراد، بحث (SearchCtx).
// كل المقابض ضمن نطاقات مصمَّمة (themeTune.ts / themePacks.USER_RANGES) والمحرك يفرض المقروئية — لا مقبض ينتج ثيمًا كاسرًا للقراءة.
import { useContext, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Accessibility, Brush, ChevronDown, Contrast, Download, Eye, Hand, Layers, MousePointer2, Palette, Percent, RotateCcw, Ruler, Save, Sparkles, SunMoon, Trash2, Type, Upload, Waves, Zap, Check, X, Square, SlidersHorizontal } from "lucide-react";
import { i } from "../../i18n";
import type { Settings } from "../../settings";
import { useDerivedTheme } from "../../useSettings";
import { GLASS_STYLE_VALUES, MAX_SHELF, STYLE_PRESETS, exportTheme, glassAlpha, newShelfId, parseThemeImport, resetPatch, sectionResetPatch, shelfEntry } from "../../appearance";
import { PACKS, SHAPES, WASH_DIRS, resolvePack, sanitizeUserTheme, packInput, USER_RANGES, type Pack, type PackFamily, type UserTheme } from "../../themePacks";
import { deriveTheme, describeAdjustment, hexToRgb, type RGB } from "../../themeEngine";
import { TOKEN_KEYS, TUNE_MODULE_FIELDS, TUNE_NUM, checkTokens, compactTune, normTune, resetTuneFields, type TokenKey } from "../../themeTune";
import type { ArtSwatches } from "../../artwork";
import { btnOutline, btnPrimary, ColorField, inputCls, Row, SearchCtx, Section, Segmented, Select, Slider, Toggle } from "./fields";

type Lvl = "basic" | "advanced" | "expert";
const RANK: Record<Lvl, number> = { basic: 0, advanced: 1, expert: 2 };
const ic = (C: typeof Palette) => <C size={16} />;
const pct = (v: number) => `${Math.round(v)}%`;
const x100 = (v: number) => `${Math.round(v * 100)}%`;

/** غلاف تجريبي لمعاينة الحزم المعتمدة على الوسائط (Living Artwork) وأكسنت ويندوز بلا جلسة حقيقية. */
const SAMPLE_ART: ArtSwatches = { vibrant: "#ff7a14", darkMuted: "#2a2438", muted: "#6a6480", avg: "#403850" };
const SAMPLE_WIN = "#0078d4";

const FAMILY_LABEL: Record<PackFamily, [string, string]> = {
  seed: ["مشتقة من بذور", "Seed-derived"], gradient: ["تدرّج قائد", "Gradient-led"], craft: ["حرفة وملمس", "Craft & texture"], editorial: ["ثنائية تحريرية", "Editorial duotone"],
  shape: ["الشكل قائد", "Shape-led"], time: ["واعية بالوقت", "Time-aware"], art: ["فن قائد", "Art-led"], custom: ["ثيماتي", "My themes"],
};

/** معاينة مصغّرة حيّة للوحة الموسّعة بحزمة ووضع محدّدين (متغيرات الرصّة محصورة بعنصر المعاينة نفسه). */
function MiniIsland({ pack, dark, s, size = "md", label }: { pack: Pack; dark: boolean; s: Partial<Settings>; size?: "sm" | "md" | "lg"; label?: string }) {
  const style = s.glassStyle === "clear" ? "clear" : "crystal";
  const tune = normTune(s.themeTune);
  const accent = s.accentSource === "custom" && typeof s.accentColor === "string" ? s.accentColor : undefined;
  const d = useMemo(
    () => deriveTheme(packInput(pack, dark, { accent, live: { art: SAMPLE_ART, winAccent: SAMPLE_WIN, bloom: (typeof s.artBloom === "number" ? s.artBloom : 60) / 100 }, borderStrength: tune.highContrast ? 100 : s.borderStrength ?? 50, ink: tune.highContrast || undefined })),
    [pack, dark, accent, s.artBloom, s.borderStrength, tune.highContrast], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const glass = (s.themeMaterial ?? "glass") === "glass";
  const a = glass ? glassAlpha(style, !dark, typeof s.glassTint === "number" ? s.glassTint : 45, s.backgroundOpacity) : 1;
  const sh = SHAPES[pack.shape ?? "default"];
  const vars = { ...d.vars, "--pv-a": String(a), "--tp-r": `${Math.round((sh.panelR ?? 34) * (size === "lg" ? 0.5 : size === "md" ? 0.38 : 0.28))}px`, "--tp-c": String(sh.corner) } as CSSProperties;
  return (
    <div className="tp-mini" data-pack-preview={pack.id} data-size={size} data-theme={dark ? "dark" : "light"} style={vars} role="img" aria-label={label ?? i(`معاينة ${pack.ar}`, `${pack.en} preview`)}>
      <div className="tp-body">
        <div className="tp-tabs"><span data-on="1" /><span /><span /><span /></div>
        <div className="tp-cards">
          <div className="tp-card"><i /><b /><u /></div>
          <div className="tp-card"><i /><b /><u /></div>
        </div>
        <div className="tp-foot"><span className="tp-btn" /><span className="tp-chip" /><span className="tp-chip" /></div>
      </div>
    </div>
  );
}

/** معاينة مقسومة فاتح/داكن مثبّتة للحزمة المحدّدة (قطر عمودي: داكن يسارًا وفاتح يمينًا). */
function SplitPreview({ pack, s, previewing }: { pack: Pack; s: Partial<Settings>; previewing: boolean }) {
  return (
    <div className="tp-split" data-testid="split-preview" role="group" aria-label={i("معاينة فاتح/داكن", "Light/dark preview")}>
      <MiniIsland pack={previewing ? pack : resolvePack(chosenPackId(s,"dark"), s.themeCustom,s.myThemes)} dark s={s} size="md" label={i("داكن", "Dark")} />
      <div className="tp-split-light"><MiniIsland pack={previewing ? pack : resolvePack(chosenPackId(s,"light"), s.themeCustom,s.myThemes)} dark={false} s={s} size="md" label={i("فاتح", "Light")} /></div>
      <span className="tp-split-tag" data-side="d">{i("داكن", "Dark")}</span>
      <span className="tp-split-tag" data-side="l">{i("فاتح", "Light")}</span>
    </div>
  );
}

/** شريحة وحدة: أيقونة + عنوان + ملخص سطر + معاينة مصغّرة + إعادة ضبط؛ تُطوى وتُفتح (تُفرَض مفتوحة أثناء البحث). */
function Module(p: { id: string; icon: ReactNode; title: string; summary: string; preview: ReactNode; onReset: () => void; children: ReactNode; open: boolean; setOpen: (v: boolean) => void; searching: boolean }) {
  const shown = p.open || p.searching;
  return (
    <section className="tp-mod" data-mod={p.id} data-open={shown ? "true" : "false"} data-q={p.searching ? "1" : "0"}>
      <div className="tp-mod-head">
        <button className="tp-mod-toggle" aria-expanded={shown} aria-controls={`tpm-${p.id}`} onClick={() => p.setOpen(!p.open)}>
          <span aria-hidden className="st-row-tile">{p.icon}</span>
          <span className="tp-mod-text"><span dir="auto" className="tp-mod-title">{p.title}</span><span dir="auto" className="tp-mod-sum">{p.summary}</span></span>
          <span className="tp-mod-prev" aria-hidden>{p.preview}</span>
          <ChevronDown size={16} aria-hidden className="tp-mod-chev" />
        </button>
        <button className="st-btn tp-mod-reset" data-testid={`reset-mod-${p.id}`} aria-label={`${p.title} — ${i("إعادة ضبط الوحدة", "Reset module")}`} title={i("إعادة ضبط الوحدة", "Reset module")} onClick={p.onReset}><RotateCcw size={14} className="rtl:-scale-x-100" /></button>
      </div>
      {shown && <div id={`tpm-${p.id}`} className="st-card">{p.children}</div>}
    </section>
  );
}

export function AppearanceBody({ s, set, section = "appearance" }: { s: Partial<Settings> & { environment?: Env }; set: (p: Partial<Settings>) => Promise<boolean>; section?: "appearance" | "motion" }) {
  const q = useContext(SearchCtx);
  const searching = q.trim().length > 0;
  const level: Lvl = s.themeDisclosure === "advanced" || s.themeDisclosure === "expert" ? s.themeDisclosure : "basic";
  const at = (min: Lvl) => searching || RANK[level] >= RANK[min];
  const { derived, packId, pack, theme } = deriveFor(s, s.environment ?? ENV_DEFAULT);
  const tune = normTune(s.themeTune);
  const setTune = (patch: Record<string, unknown>) => set({ themeTune: compactTune(normTune({ ...compactTune(tune), ...patch })) });
  const mine = (Array.isArray(s.myThemes) ? s.myThemes : []).map(sanitizeUserTheme).filter((u): u is UserTheme => !!u && u.id.startsWith("u:"));
  const [hover, setHover] = useState<string | null>(null);
  const [openMods, setOpenMods] = useState<Record<string, boolean>>({});
  const isOpen = (id: string) => openMods[id] ?? (id === "packs" || (section === "motion" && id === "a11y"));
  const modProps = (id: string) => ({ id, open: isOpen(id), setOpen: (v: boolean) => setOpenMods((m) => ({ ...m, [id]: v })), searching });
  const [msg, setMsg] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [armed, setArmed] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const allPacks: { pack: Pack; id: string }[] = [...PACKS.map((p) => ({ pack: p, id: p.id })), { pack: resolvePack("custom",s.themeCustom,mine), id: "custom" }, ...mine.map((u) => ({ pack: resolvePack(u.id, null, mine), id: u.id }))];
  const selected = hover ? resolvePack(hover, s.themeCustom, mine) : resolvePack(chosenPackId(s,theme), s.themeCustom, mine);
  const dark = theme === "dark";
  const packLabel = (p: Pack) => i(p.ar, p.en);
  const applyPack = (id: string) => set({ themePack: id, themePackDark: "", themePackLight: "" });
  const resetKeys = (keys: (keyof Settings)[], tuneFields: string[] = []) => set({ ...resetPatch(keys), ...(tuneFields.length ? { themeTune: resetTuneFields(s.themeTune, tuneFields) } : {}) });

  // ── قراءة المقروئية الحيّة
  const m = (role: string) => derived.measures.find((x) => x.role === role);
  const allOk = derived.measures.every((x) => x.ok);

  // ── المخصّص
  const custom = (s.themeCustom ?? {}) as Partial<UserTheme>;
  const customBase = typeof custom.base === "string" ? custom.base : "obsidian";
  const cp = resolvePack("custom", s.themeCustom, mine);
  const setCustom = (patch: Partial<UserTheme>) => {
    const next = sanitizeUserTheme({ id: "custom", name: "Custom", ...custom, ...patch });
    if (!next) return;
    const { id: _id, name: _n, ...rest } = next;
    set({ themeCustom: rest, themePack: "custom", themePackDark: "", themePackLight: "" });
  };
  const saveToShelf = async () => {
    if (mine.length >= MAX_SHELF) { setMsg(i(`الحدّ الأقصى ${MAX_SHELF} ثيمًا`, `Limit is ${MAX_SHELF} themes`)); return; }
    const nm = name.trim() || `${packLabel(pack)} ${i("(نسخة)", "(copy)")}`;
    const id = newShelfId(s.myThemes);
    const e = shelfEntry(pack, id, nm);
    const saved = await set({ myThemes: [...mine, e] as unknown as Record<string, unknown>[], themePack: id, themePackDark: "", themePackLight: "" });
    if (saved) setName("");
    setMsg(saved ? i("حُفظت حزمة الألوان في «ثيماتي»", "Colour pack saved to My themes") : i("تعذّر الحفظ", "Save failed"));
  };
  const doExport = () => {
    const url = URL.createObjectURL(new Blob([exportTheme(s)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = "myisland-theme.json"; a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    setMsg(i("تم تصدير الثيم", "Theme exported"));
  };
  const doImport = async (f?: File) => {
    if (!f) return;
    try {
      const p = parseThemeImport(await f.text());
      if (!p) { setMsg(i("ملف ثيم غير صالح", "Invalid theme file")); return; }
      const saved = await set(p);
      setMsg(saved ? i(`استُورد ${Object.keys(p).length} إعدادًا`, `Imported ${Object.keys(p).length} settings`) : i("تعذّر الحفظ", "Save failed"));
    } catch { setMsg(i("تعذّرت قراءة الملف", "Could not read the file")); }
  };
  const rawOpen = at("expert");

  return (
    <div className="tp-root" data-level={level} data-testid="appearance-body">
      {section === "appearance" && <>
      {/* ───────── معرض الحزم (أول شاشة) ───────── */}
      <section className="tp-gallery" data-testid="theme-gallery" hidden={searching}>
        <div className="tp-gal-head">
          <div><h3 dir="auto" className="tp-gal-title">{i("معرض الحزم", "Pack gallery")}</h3><p dir="auto" className="tp-gal-sub">{i("معاينات نموذجية بأغلفة وألوان نظام تجريبية. انقر لتطبيق الحزمة على الوضعين.", "Sample previews use example artwork and system colours. Click to apply the pack to both modes.")}</p></div>
          <Segmented label={i("خيارات التخصيص", "Customisation options")} value={level} onChange={(v) => set({ themeDisclosure: v })}
            options={[{ value: "basic", label: i("أساسي", "Basic") }, { value: "advanced", label: i("متقدم", "Advanced") }, { value: "expert", label: i("خبير", "Expert") }]} />
        </div>
        <div className="tp-hero">
          <div className="tp-stage tp-stage-main" aria-live="polite">
            <MiniIsland pack={selected} dark={dark} s={s} size="lg" />
            <span className="tp-stage-name" dir="auto">{packLabel(selected)}</span>
          </div>
          <div className="tp-stage tp-stage-split"><SplitPreview pack={selected} s={s} previewing={!!hover} /></div>
        </div>
        {(["seed", "gradient", "craft", "editorial", "shape", "time", "art", "custom"] as PackFamily[]).map((fam) => {
          const items = allPacks.filter((x) => x.pack.family === fam && (fam !== "art" || x.pack.family === "art"));
          if (!items.length) return null;
          return (
            <div key={fam} className="tp-fam">
              <div className="tp-fam-title" dir="auto">{i(FAMILY_LABEL[fam][0], FAMILY_LABEL[fam][1])}</div>
              <div className="tp-grid" role="radiogroup" aria-label={i(FAMILY_LABEL[fam][0], FAMILY_LABEL[fam][1])}>
                {items.map(({ pack: pk, id }) => (
                  <button key={id} role="radio" aria-checked={packId === id || (s.themePack ?? "obsidian") === id} aria-label={packLabel(pk)} data-pack={id} className="tp-card-btn"
                    onMouseEnter={() => setHover(id)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(id)} onBlur={() => setHover(null)}
                    onClick={() => applyPack(id)}>
                    <MiniIsland pack={pk} dark={dark} s={s} size="sm" />
                    <span className="tp-card-name" dir="auto">{packLabel(pk)}</span>
                    <span className="tp-card-desc" dir="auto">{i(pk.dar, pk.den)}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </section>

      {at("advanced") && (
<Section title={i("تعيين الحزمة", "Pack assignment")}>

        <Row icon={ic(Layers)} label={i("حزمة الوضع الداكن", "Dark-mode pack")} hint={i("تُستعمل حين يكون الوضع داكنًا (فارغ = الحزمة العامة)", "Used when the mode is dark (empty = the general pack)")}>
          <Select label={i("حزمة الوضع الداكن", "Dark-mode pack")} value={s.themePackDark ?? ""} onChange={(v) => set({ themePackDark: v })} options={[{ value: "", label: i("— مثل العامة —", "— same as general —") }, ...allPacks.map((x) => ({ value: x.id, label: packLabel(x.pack) }))]} />
        </Row>
        <Row icon={ic(Layers)} label={i("حزمة الوضع الفاتح", "Light-mode pack")} hint={i("تُستعمل حين يكون الوضع فاتحًا (فارغ = الحزمة العامة)", "Used when the mode is light (empty = the general pack)")}>
          <Select label={i("حزمة الوضع الفاتح", "Light-mode pack")} value={s.themePackLight ?? ""} onChange={(v) => set({ themePackLight: v })} options={[{ value: "", label: i("— مثل العامة —", "— same as general —") }, ...allPacks.map((x) => ({ value: x.id, label: packLabel(x.pack) }))]} />
        </Row>
      </Section>
      )}

      {/* ───────── 1) الثيمات والحزم ───────── */}
      <Module {...modProps("packs")} icon={ic(Palette)} title={i("الثيمات والحزم", "Themes & packs")}
        summary={`${packLabel(pack)} · ${theme === "dark" ? i("داكن", "Dark") : i("فاتح", "Light")} · ${i("أكسنت", "accent")} ${derived.vars["--accent"]}`}
        preview={<span className="tp-dots"><i style={{ background: derived.vars["--accent"] }} /><i style={{ background: derived.vars["--t-wash-c"] }} /><i style={{ background: derived.vars["--t-base"] }} /></span>}
        onReset={() => resetKeys(["themeMode", "themePack", "themePackLight", "themePackDark", "accentSource", "accentColor", "accentMode", "artBloom", "themeAnim", "themeCustom"])}>
        <Row icon={ic(SunMoon)} label={i("النمط", "Theme")} hint={i("فاتح أو داكن، أو يتّبع النظام، أو يتبدّل تلقائيًا مع دورة الشمس (فاتح 6ص–6م)", "Light or dark, follow the system, or switch automatically with the sun (light 6am–6pm)")}>
          <Segmented label={i("النمط", "Theme")} value={s.themeMode ?? "system"} onChange={(v) => set({ themeMode: v })}
            options={[{ value: "system", label: i("النظام", "System") }, { value: "light", label: i("فاتح", "Light") }, { value: "dark", label: i("داكن", "Dark") }, { value: "sun", label: i("الشمس", "Sun") }]} />
        </Row>
        <Row icon={ic(Brush)} label={i("مصدر لون الأكسنت", "Accent colour source")} hint={i("اختياري ومحلي بالكامل: لا يُرفع شيء خارج جهازك", "Optional and fully local: nothing leaves your device")}>
          <Select label={i("مصدر لون الأكسنت", "Accent colour source")} value={s.accentSource ?? "pack"} onChange={(v) => set({ accentSource: v })}
            options={[{ value: "pack", label: i("من الحزمة", "From the pack") }, { value: "custom", label: i("لون مخصص", "Custom colour") }, { value: "windows", label: i("أكسنت ويندوز", "Windows accent") }, { value: "wallpaper", label: i("لون الخلفية الغالب", "Wallpaper's dominant colour") }]} />
        </Row>
        <Row icon={ic(Brush)} label={i("لون ثابت", "Fixed color")} hint={i("يُستعمل حين يكون المصدر «لون مخصص»؛ اختياره يفعّل ذلك تلقائيًا. المحرك يعدّل إضاءته إن لزم لتبقى القراءة مريحة", "Used when the source is “Custom colour”; picking one switches to it. The engine adjusts its lightness when needed so reading stays comfortable")}>
          <ColorField label={i("لون ثابت", "Fixed color")} value={s.accentColor ?? "#6d8dff"} onChange={(v) => set({ accentColor: v, accentSource: "custom" })} />
        </Row>
        {at("advanced") && (
          <Row icon={ic(Brush)} label={i("لون التمييز", "Accent source")} hint={i("لمشغّل الوسائط: تلقائي من غلاف الأغنية أو لون ثابت", "For the media player: automatic from the cover, or a fixed colour")}>
            <Segmented label={i("لون التمييز", "Accent source")} value={s.accentMode ?? "auto"} onChange={(v) => set({ accentMode: v })}
              options={[{ value: "auto", label: i("تلقائي", "Auto") }, { value: "fixed", label: i("ثابت", "Fixed") }]} />
          </Row>
        )}
        {at("advanced") && (
          <Row icon={ic(Waves)} label={i("غسلة متحرّكة", "Animated wash")} hint={i("حزم التدرّج فقط: حركة بطيئة جدًا (90ث) والجزيرة مفتوحة فقط — تنطفئ في وضع التوفير وعند تقليل الحركة", "Gradient packs only: a very slow drift (90s), only while the island is open — off in Eco mode and with reduced motion")}>
            <Toggle label={i("غسلة متحرّكة", "Animated wash")} value={s.themeAnim ?? true} onChange={(v) => set({ themeAnim: v })} />
          </Row>
        )}
        {at("advanced") && (
          <Row icon={ic(Sparkles)} label={i("إزهار الغلاف", "Artwork bloom")} hint={i("حزم الغلاف الحيّ: شدة الغسلة والتوهّج من الغلاف (100٪ = سقوف الرصّة، 200٪ = ضعفها مع حماية المقروئية)", "Living Artwork packs: strength of the wash and glow from the cover (100% = stack caps, 200% = double with readability protected)")}>
            <Slider label={i("إزهار الغلاف", "Artwork bloom")} value={typeof s.artBloom === "number" ? s.artBloom : 60} min={0} max={200} step={5} format={pct} onLive={(v) => set({ artBloom: v })} onCommit={(v) => set({ artBloom: v })} />
          </Row>
        )}
        {at("advanced") && (<>
          <Row icon={ic(Palette)} label={i("الحزمة المخصصة — الأساس", "Custom pack — base")} hint={i("نسخة من حزمة مصنع لا تعدّلها: تعديلاتك تُحفظ في خانة «المخصصة» فقط", "A copy of a factory pack, which is never modified: your edits live in the “Custom” slot only")}>
            <Select label={i("الحزمة المخصصة — الأساس", "Custom pack — base")} value={customBase} onChange={(v) => setCustom({ base: v })} options={PACKS.map((p) => ({ value: p.id, label: packLabel(p) }))} />
          </Row>
          <Row icon={ic(Brush)} label={i("المخصصة — لون الأكسنت", "Custom — accent")} hint={i("أي لون: يفرض المحرك التباين تلقائيًا", "Any colour — the engine enforces contrast automatically")}>
            <input type="color" aria-label={i("المخصصة — لون الأكسنت", "Custom — accent")} className="st-color" value={cp.seeds.accent} onChange={(e) => setCustom({ accent: e.target.value })} />
          </Row>
          <Row icon={ic(Percent)} label={i("المخصصة — شدة الصبغة", "Custom — tint strength")} hint={i("شدة الغسلة اللونية من سقف الرصّة", "Strength of the colour wash from the stack cap")}>
            <Slider label={i("المخصصة — شدة الصبغة", "Custom — tint strength")} value={cp.wash} min={USER_RANGES.wash[0]} max={USER_RANGES.wash[1]} step={0.05} format={x100} onCommit={(v) => setCustom({ wash: v })} />
          </Row>
          <Row icon={ic(Sparkles)} label={i("المخصصة — التوهّج", "Custom — glow")} hint={i("توهّج المرساة حول الجزيرة (سقف 20٪)", "Anchor glow around the island (cap 20%)")}>
            <Slider label={i("المخصصة — التوهّج", "Custom — glow")} value={cp.glow} min={USER_RANGES.glow[0]} max={USER_RANGES.glow[1]} step={0.05} format={x100} onCommit={(v) => setCustom({ glow: v })} />
          </Row>
          <Row icon={ic(Waves)} label={i("المخصصة — اتجاه الغسلة", "Custom — wash direction")} hint={i("من أي جهة تبدأ الغسلة وتتلاشى عند 60٪", "Which side the wash starts from; it fades out by 60%")}>
            <Select label={i("المخصصة — اتجاه الغسلة", "Custom — wash direction")} value={cp.washDir} onChange={(v) => setCustom({ washDir: v })}
              options={WASH_DIRS.map((d) => ({ value: d, label: ({ top: i("من الأعلى", "From top"), bottom: i("من الأسفل", "From bottom"), start: i("من البداية", "From start"), end: i("من النهاية", "From end"), radial: i("شعاعي", "Radial") } as Record<string, string>)[d] }))} />
          </Row>
          <Row icon={ic(Sparkles)} label={i("المخصصة — الحبيبات", "Custom — grain")} hint={i("حبيبات ثابتة حتى 8٪", "Static grain up to 8%")}>
            <Slider label={i("المخصصة — الحبيبات", "Custom — grain")} value={cp.grain} min={USER_RANGES.grain[0]} max={USER_RANGES.grain[1]} step={0.005} format={(v) => `${(v * 100).toFixed(1)}%`} onCommit={(v) => setCustom({ grain: v })} />
          </Row>
        </>)}
        <Row icon={ic(Save)} label={i("ثيماتي — حفظ الحالي", "My themes — save current")} hint={msg ?? i(`احفظ حزمة الألوان باسمك؛ الخط والمادة وبقية التخصيصات تُحفظ عبر التصدير (حتى ${MAX_SHELF})`, `Save this colour pack; export a theme to keep fonts, material and other tuning (up to ${MAX_SHELF})`)}>
          <input aria-label={i("اسم الثيم", "Theme name")} dir="auto" className={`${inputCls} w-40`} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder={i("اسم الثيم", "Theme name")} />
          <button className={btnPrimary} data-testid="shelf-save" onClick={saveToShelf}>{i("حفظ", "Save")}</button>
        </Row>
        {mine.map((u) => (
          <Row key={u.id} icon={ic(Palette)} label={u.name} hint={`${i("نسخة من", "Copy of")} ${packLabel(PACKS.find((p) => p.id === u.base) ?? PACKS[0])} · ${u.accent ?? ""}`}>
            <button className={btnOutline} data-shelf-apply={u.id} aria-label={`${u.name} — ${i("تطبيق", "Apply")}`} onClick={() => applyPack(u.id)}>{i("تطبيق", "Apply")}</button>
            <button className="st-btn" style={{ width: 36, paddingInline: 0 }} data-shelf-del={u.id} aria-label={`${u.name} — ${i("حذف", "Delete")}`} onClick={() => set({ myThemes: mine.filter((x) => x.id !== u.id) as unknown as Record<string, unknown>[], ...(s.themePack === u.id ? { themePack: "obsidian" } : {}), ...(s.themePackDark === u.id ? { themePackDark: "" } : {}), ...(s.themePackLight === u.id ? { themePackLight: "" } : {}) })}><Trash2 size={14} /></button>
          </Row>
        ))}
        {at("advanced") && (<>
          <Row icon={ic(Download)} label={i("تصدير الثيم", "Export theme")} hint={i("ملف JSON بكل مفاتيح المظهر وحزمك (بلا أسرار)", "A JSON file with every appearance key and your packs (no secrets)")}>
            <button className={btnOutline} data-testid="theme-export" onClick={doExport}>{i("تصدير", "Export")}</button>
          </Row>
          <Row icon={ic(Upload)} label={i("استيراد ثيم", "Import theme")} hint={i("يقبل المفاتيح المعروفة بنطاقاتها فقط؛ حزم المستخدم تُطهَّر", "Known keys within their ranges only; user packs are sanitised")}>
            <input ref={file} type="file" accept="application/json,.json" hidden data-testid="theme-import-file" onChange={(e) => { doImport(e.target.files?.[0]); e.target.value = ""; }} />
            <button className={btnOutline} data-testid="theme-import" onClick={() => file.current?.click()}>{i("استيراد", "Import")}</button>
          </Row>
        </>)}
      </Module>

      {/* ───────── 2) الأسطح والمادة ───────── */}
      <Module {...modProps("surfaces")} icon={ic(Layers)} title={i("الأسطح والمادة", "Surfaces & material")}
        summary={`${(s.themeMaterial ?? "glass") === "glass" ? (s.glassStyle === "clear" ? i("زجاج شفاف", "Clear glass") : i("زجاج مثلّج", "Frosted glass")) : i("مصمت", "Solid")} · ${i("الحجاب", "veil")} ${s.glassTint ?? 45}% · ${i("ظل", "shadow")} ${tune.en.elevation}`}
        preview={<span className="tp-mp tp-mp-surf"><i /><b /></span>}
        onReset={() => resetKeys(["themeMaterial", "glassStyle", "glassTint", "backgroundOpacity", "borderStrength", "shadowStrength"], TUNE_MODULE_FIELDS.surfaces)}>
        <Row icon={ic(Sparkles)} label={i("أنماط جاهزة", "Style presets")} hint={i("نقرة واحدة تطبّق مجموعة كاملة من القيم", "One click applies a full set of values")} col>
          <div className="st-chips" data-testid="presets">
            {STYLE_PRESETS.map((p) => <button key={p.id} className="st-chip" data-preset={p.id} onClick={() => set(p.values)}>{i(p.ar, p.en)}</button>)}
          </div>
        </Row>
        <Row icon={ic(Layers)} label={i("الخلفية", "Background")} hint={i("الزجاج سطح ملوّن شبه شفاف مرسوم في الجزيرة (ليس تمويهًا حقيقيًا لما خلفها)، ويصير معتمًا تلقائيًا في التوفير أو مع «تقليل الشفافية»", "Glass is a tinted translucent surface drawn in the island (not a real blur of what is behind it); it turns opaque automatically in Eco mode or with “reduce transparency”")} col>
          <div className="st-gstyles st-gstyles3" role="radiogroup" aria-label={i("الخلفية", "Background")}>
            {([
              { id: "solid", ar: "مصمت", en: "Solid", dar: "سطح معتم بلا شفافية", den: "An opaque surface, no see-through" },
              { id: "crystal", ar: "زجاج مُحاكى — مثلّج", en: "Simulated frosted glass", dar: "حجاب ملوّن كثيف بحدّ ولمعة وحبيبات — الموصى به", den: "A dense tinted veil with border, highlight and grain — recommended" },
              { id: "clear", ar: "زجاج مُحاكى — شفاف", en: "Simulated clear glass", dar: "حجاب أخفّ يُظهر ما خلفه أكثر (بلا تمويه)", den: "A lighter veil that shows more of what is behind (no blur)" },
            ] as const).map((g) => {
              const glassOn = (s.themeMaterial ?? "glass") === "glass";
              return (
                <button key={g.id} role="radio" aria-label={i(g.ar, g.en)} aria-checked={(!glassOn ? "solid" : (s.glassStyle ?? "crystal")) === g.id} data-bg={g.id} className="st-gstyle"
                  onClick={() => set(g.id === "solid" ? { themeMaterial: "solid" } : GLASS_STYLE_VALUES[g.id])}>
                  <span className={`st-gprev ${g.id}`} />
                  <span className="st-row-title">{i(g.ar, g.en)}</span>
                  <span className="st-row-hint">{i(g.dar, g.den)}</span>
                </button>
              );
            })}
          </div>
        </Row>
        {(s.themeMaterial ?? "glass") === "glass" && (
          <Row icon={ic(Contrast)} label={i("عتامة الخلفية الزجاجية", "Glass background opacity")} hint={i("لون الحجاب وعتامته فوق سطح المكتب — الأعلى أوضح للنص", "Colour and opacity of the veil over the desktop — higher is easier to read")}>
            <Slider label={i("عتامة الخلفية الزجاجية", "Glass background opacity")} value={s.glassTint ?? 45} min={0} max={80} step={1} format={pct} onLive={(v) => set({ glassTint: v })} onCommit={(v) => set({ glassTint: v })} />
          </Row>
        )}
        {at("expert") && (
          <Row icon={ic(Percent)} label={i("الكثافة", "Density of background")} hint={i("العتامة الكلية للحجاب — الأقل يُظهر ما خلف الجزيرة أكثر", "Overall opacity of the veil — lower shows more of what is behind the island")}>
            <Slider label={i("الكثافة", "Density of background")} value={s.backgroundOpacity ?? 1} min={0.3} max={1} step={0.05} format={x100} onLive={(v) => set({ backgroundOpacity: v })} onCommit={(v) => set({ backgroundOpacity: v })} />
          </Row>
        )}
        <Row icon={ic(Square)} label={i("قوة الحدود", "Border strength")} hint={i("الحدّ الرفيع 1px بنسبة 6–10٪ (0 = بلا حدّ)", "The 1px edge at 6–10% (0 = none)")}>
          <Slider label={i("قوة الحدود", "Border strength")} value={s.borderStrength ?? 50} min={0} max={100} step={5} format={pct} onLive={(v) => set({ borderStrength: v })} onCommit={(v) => set({ borderStrength: v })} />
        </Row>
        <Row icon={ic(Layers)} label={i("قوة الظلال", "Shadow strength")} hint={i("عمق الظل تحت العناصر", "How deep the shadows under things are")}>
          <Slider label={i("قوة الظلال", "Shadow strength")} value={s.shadowStrength ?? 50} min={0} max={100} step={5} format={pct} onLive={(v) => set({ shadowStrength: v })} onCommit={(v) => set({ shadowStrength: v })} />
        </Row>
        {at("expert") && (<>
          <Row icon={ic(Layers)} label={i("أسلوب الظل والارتفاع", "Shadow & elevation style")} hint={i("مسطّح بلا ظل · ناعم (الافتراضي) · مرفوع أعمق", "Flat with no shadow · soft (default) · lifted and deeper")}>
            <Segmented label={i("أسلوب الظل والارتفاع", "Shadow & elevation style")} value={tune.en.elevation as "soft"} onChange={(v) => setTune({ elevation: v })}
              options={[{ value: "flat", label: i("مسطّح", "Flat") }, { value: "soft", label: i("ناعم", "Soft") }, { value: "lifted", label: i("مرفوع", "Lifted") }]} />
          </Row>
          <Row icon={ic(SlidersHorizontal)} label={i("الفواصل", "Dividers")} hint={i("خطوط الفصل بين الصفوف: بلا · رفيعة · واضحة", "Lines between rows: none · hairline · strong")}>
            <Segmented label={i("الفواصل", "Dividers")} value={tune.en.dividers as "hairline"} onChange={(v) => setTune({ dividers: v })}
              options={[{ value: "none", label: i("بلا", "None") }, { value: "hairline", label: i("رفيعة", "Hairline") }, { value: "strong", label: i("واضحة", "Strong") }]} />
          </Row>
          {([
            { k: "Pill", ar: "الحبة", en: "Pill" }, { k: "Panel", ar: "اللوحة واللمحة", en: "Panel & peek" }, { k: "Cards", ar: "البطاقات", en: "Cards" }, { k: "Pop", ar: "المنبثقات", en: "Popovers" },
          ] as const).map((sf) => (
            <Row key={sf.k} icon={ic(Layers)} label={i(`سطح: ${sf.ar}`, `Surface: ${sf.en}`)} hint={i("تجاوز عتامة السطح وحدّه وحده، دون بقية الأسطح", "Override this surface's opacity and edge on its own")} col>
              <div className="tp-two">
                <label className="tp-two-item"><span>{i("العتامة", "Opacity")}</span>
                  <Slider label={i(`${sf.ar} — العتامة`, `${sf.en} opacity`)} value={tune.num[`veil${sf.k}` as keyof typeof tune.num]} min={TUNE_NUM[`veil${sf.k}` as keyof typeof TUNE_NUM][0]} max={TUNE_NUM[`veil${sf.k}` as keyof typeof TUNE_NUM][1]} step={0.05} format={x100} onLive={(v) => setTune({ [`veil${sf.k}`]: v })} onCommit={(v) => setTune({ [`veil${sf.k}`]: v })} /></label>
                <label className="tp-two-item"><span>{i("الحدّ", "Edge")}</span>
                  <Slider label={i(`${sf.ar} — الحدّ`, `${sf.en} edge`)} value={tune.num[`edge${sf.k}` as keyof typeof tune.num]} min={0} max={1} step={0.05} format={x100} onLive={(v) => setTune({ [`edge${sf.k}`]: v })} onCommit={(v) => setTune({ [`edge${sf.k}`]: v })} /></label>
              </div>
            </Row>
          ))}
        </>)}
      </Module>

      {/* ───────── 3) الشكل والهندسة ───────── */}
      <Module {...modProps("shape")} icon={ic(Ruler)} title={i("الشكل والهندسة", "Shape & geometry")}
        summary={`${s.cornerStyle === "extra" ? i("مستدير جدًا", "Extra rounded") : i("مستدير", "Rounded")} · ${i("كثافة", "density")} ${s.density === "compact" ? i("مدمجة", "compact") : i("مريحة", "comfortable")} · ${i("حبة", "pill")} ×${tune.num.pillScale}`}
        preview={<span className="tp-mp tp-mp-shape"><i /></span>}
        onReset={() => resetKeys(["cornerStyle", "density"], TUNE_MODULE_FIELDS.shape)}>
        <Row icon={ic(Square)} label={i("نمط الزوايا", "Corner style")} hint={i("استدارة زوايا البطاقات والأزرار", "How round the corners of cards and buttons are")}>
          <Segmented label={i("نمط الزوايا", "Corner style")} value={s.cornerStyle ?? "rounded"} onChange={(v) => set({ cornerStyle: v })}
            options={[{ value: "rounded", label: i("مستدير", "Rounded") }, { value: "extra", label: i("مستدير جدًا", "Extra rounded") }]} />
        </Row>
        <Row icon={ic(SlidersHorizontal)} label={i("الكثافة المكانية", "Density")} hint={i("المسافات داخل الصفوف: مريحة أو مدمجة", "Spacing inside rows: comfortable or compact")}>
          <Segmented label={i("الكثافة المكانية", "Density")} value={s.density ?? "comfortable"} onChange={(v) => set({ density: v })}
            options={[{ value: "comfortable", label: i("مريحة", "Comfortable") }, { value: "compact", label: i("مدمجة", "Compact") }]} />
        </Row>
        {at("expert") && (<>
          <Row icon={ic(Ruler)} label={i("نصف قطر البطاقات", "Card radius")} hint={i("يضرب استدارة البطاقات والأزرار والقوائم (0.4–2×)", "Multiplies the roundness of cards, buttons and menus (0.4–2×)")}>
            <Slider label={i("نصف قطر البطاقات", "Card radius")} value={tune.num.cornerK} min={TUNE_NUM.cornerK[0]} max={TUNE_NUM.cornerK[1]} step={0.1} format={(v) => `${v.toFixed(1)}×`} onLive={(v) => setTune({ cornerK: v })} onCommit={(v) => setTune({ cornerK: v })} />
          </Row>
          <Row icon={ic(Ruler)} label={i("مقياس الحبة", "Pill scale")} hint={i("يضرب مقاس الحبة المخزَّن (التفاصيل الدقيقة في قسم الجزيرة)", "Multiplies the stored size of the pill (fine sizes live in the Island section)")}>
            <Slider label={i("مقياس الحبة", "Pill scale")} value={tune.num.pillScale} min={TUNE_NUM.pillScale[0]} max={TUNE_NUM.pillScale[1]} step={0.05} format={x100} onCommit={(v) => setTune({ pillScale: v })} />
          </Row>
          <Row icon={ic(Ruler)} label={i("مقياس اللوحة", "Panel scale")} hint={i("يضرب مقاس اللوحة ضمن حدود النافذة", "Multiplies the panel size within the window limits")}>
            <Slider label={i("مقياس اللوحة", "Panel scale")} value={tune.num.panelScale} min={TUNE_NUM.panelScale[0]} max={TUNE_NUM.panelScale[1]} step={0.05} format={x100} onCommit={(v) => setTune({ panelScale: v })} />
          </Row>
        </>)}
      </Module>

      {/* ───────── 4) النصوص والأيقونات ───────── */}
      <Module {...modProps("text")} icon={ic(Type)} title={i("النصوص والأيقونات", "Text & icons")}
        summary={`${i("الخط", "Font")} ${s.fontScale ?? 100}% · ${tune.en.textWeight === "bold" ? i("عريض", "bold") : i("عادي", "regular")} · ${i("أيقونات", "icons")} ×${tune.num.iconScale}`}
        preview={<span className="tp-mp tp-mp-text" style={{ fontWeight: tune.en.textWeight === "bold" ? 700 : 400 }}>Aa</span>}
        onReset={() => resetKeys(["fontScale"], TUNE_MODULE_FIELDS.text)}>
        <Row icon={ic(Type)} label={i("حجم الخط", "Font size")} hint={i("حجم الخط في كل الواجهة", "Text size across the whole interface")}>
          <Slider label={i("حجم الخط", "Font size")} value={s.fontScale ?? 100} min={90} max={120} step={5} format={pct} onLive={(v) => set({ fontScale: v })} onCommit={(v) => set({ fontScale: v })} />
        </Row>
        {at("advanced") && (<>
          <Row icon={ic(Type)} label={i("وزن النص", "Text weight")} hint={i("وزن نص الجسم: عادي أو عريض (الخط المدمج 400/700/800)", "Body text weight: regular or bold (the bundled font ships 400/700/800)")}>
            <Segmented label={i("وزن النص", "Text weight")} value={tune.en.textWeight as "regular"} onChange={(v) => setTune({ textWeight: v })}
              options={[{ value: "regular", label: i("عادي", "Regular") }, { value: "bold", label: i("عريض", "Bold") }]} />
          </Row>
          <Row icon={ic(Sparkles)} label={i("حجم الأيقونات", "Icon size")} hint={i("مقياس الأيقونات (85–125٪)", "Icon scale (85–125%)")}>
            <Slider label={i("حجم الأيقونات", "Icon size")} value={tune.num.iconScale} min={TUNE_NUM.iconScale[0]} max={TUNE_NUM.iconScale[1]} step={0.05} format={x100} onLive={(v) => setTune({ iconScale: v })} onCommit={(v) => setTune({ iconScale: v })} />
          </Row>
          <Row icon={ic(Brush)} label={i("صبغة الأيقونات", "Icon tint")} hint={i("مزج لون الأكسنت في الأيقونات فقط — لا في نص الجسم", "Mixes the accent into icons only — never into body text")}>
            <Slider label={i("صبغة الأيقونات", "Icon tint")} value={tune.num.iconTint} min={0} max={100} step={5} format={pct} onLive={(v) => setTune({ iconTint: v })} onCommit={(v) => setTune({ iconTint: v })} />
          </Row>
        </>)}
      </Module>

      </>}
      {section === "motion" && <>
      {/* ───────── 5) الحركة والشعور ───────── */}
      <Module {...modProps("feel")} icon={ic(Zap)} title={i("الحركة والشعور", "Motion & feel")}
        summary={`${i("الضغط", "Press")}: ${({ none: i("بلا", "none"), normal: i("عادي", "normal"), strong: i("قوي", "strong") } as Record<string, string>)[tune.en.press]} · ${i("التلاشي بين الحزم", "pack crossfade")} ${Math.round(0.6 * 1000)}ms`}
        preview={<span className="tp-mp tp-mp-press" data-press={tune.en.press}><i /></span>}
        onReset={() => resetKeys([], TUNE_MODULE_FIELDS.feel)}>
        <Row icon={ic(Hand)} label={i("تغذية الضغط الراجعة", "Press feedback")} hint={i("مقدار انكماش الأزرار عند الضغط. السرعة والنوابض والارتداد في قسم «الحركة»", "How much buttons shrink when pressed. Speed, springs and bounce are in the Motion section")}>
          <Segmented label={i("تغذية الضغط الراجعة", "Press feedback")} value={tune.en.press as "normal"} onChange={(v) => setTune({ press: v })}
            options={[{ value: "none", label: i("بلا", "None") }, { value: "normal", label: i("عادي", "Normal") }, { value: "strong", label: i("قوي", "Strong") }]} />
        </Row>
      </Module>

      {/* ───────── 6) السلوك والتفاعل ───────── */}
      {(at("advanced")) && (
        <Module {...modProps("behavior")} icon={ic(MousePointer2)} title={i("السلوك والتفاعل", "Behavior & interaction")}
          summary={`${tune.en.scroll === "smooth" ? i("تمرير ناعم", "smooth scroll") : i("تمرير فوري", "instant scroll")} · ${i("تمرير الماوس", "hover")} ×${tune.num.hoverK} · ${tune.en.focusRing === "contrast" ? i("تركيز عالي التباين", "high-contrast focus") : i("تركيز بالأكسنت", "accent focus")}`}
          preview={<MousePointer2 size={16} />}
          onReset={() => resetKeys([], TUNE_MODULE_FIELDS.behavior)}>
          <Row icon={ic(Waves)} label={i("سلوك التمرير", "Scroll behavior")} hint={i("التمرير البرمجي داخل القوائم: فوري أو ناعم (عجلة الماوس لا تتأثر)", "Programmatic scrolling inside lists: instant or smooth (the mouse wheel is unaffected)")}>
            <Segmented label={i("سلوك التمرير", "Scroll behavior")} value={tune.en.scroll as "instant"} onChange={(v) => setTune({ scroll: v })}
              options={[{ value: "instant", label: i("فوري", "Instant") }, { value: "smooth", label: i("ناعم", "Smooth") }]} />
          </Row>
          <Row icon={ic(MousePointer2)} label={i("تأكيد التمرير فوق العناصر", "Hover emphasis")} hint={i("وضوح تمييز العنصر تحت المؤشر (0.4–1.6×)", "How visible the highlight under the pointer is (0.4–1.6×)")}>
            <Slider label={i("تأكيد التمرير فوق العناصر", "Hover emphasis")} value={tune.num.hoverK} min={TUNE_NUM.hoverK[0]} max={TUNE_NUM.hoverK[1]} step={0.1} format={(v) => `${v.toFixed(1)}×`} onLive={(v) => setTune({ hoverK: v })} onCommit={(v) => setTune({ hoverK: v })} />
          </Row>
          <Row icon={ic(Eye)} label={i("حلقة التركيز", "Focus ring")} hint={i("حلقة لوحة المفاتيح: بلون الأكسنت أو عالية التباين", "The keyboard focus ring: accent colour or high contrast")}>
            <Segmented label={i("حلقة التركيز", "Focus ring")} value={tune.en.focusRing as "accent"} onChange={(v) => setTune({ focusRing: v })}
              options={[{ value: "accent", label: i("الأكسنت", "Accent") }, { value: "contrast", label: i("عالية التباين", "High contrast") }]} />
          </Row>
        </Module>
      )}

      {/* ───────── 7) إمكانية الوصول ───────── */}
      <Module {...modProps("a11y")} icon={ic(Accessibility)} title={i("إمكانية الوصول", "Accessibility")}
        summary={`${allOk ? i("كل أدوار المقروئية ناجحة", "Every readability role passes") : i("تحقق من التباين", "Check the contrast")} · ${i("نص", "text")} ${m("text.secondary")?.ratio ?? "—"}:1 · ${derived.adjustments.length} ${i("تعديل آلي", "auto adjustments")}`}
        preview={<span className="tp-mp tp-mp-a11y" data-ok={allOk ? "1" : "0"}>{allOk ? <Check size={14} /> : <X size={14} />}</span>}
        onReset={() => resetKeys([], TUNE_MODULE_FIELDS.a11y)}>
        <Row icon={ic(Contrast)} label={i("تباين عالٍ", "High contrast")} hint={i("يرفع ألفا النص الثانوي والثالثي ويقوّي الحدود والفواصل — فوق فرض المقروئية الآلي", "Raises secondary and tertiary text, strengthens edges and dividers — on top of the automatic readability enforcement")}>
          <Toggle label={i("تباين عالٍ", "High contrast")} value={tune.highContrast} onChange={(v) => setTune({ highContrast: v })} />
        </Row>
        <Row icon={ic(Eye)} label={i("فحص المقروئية الحيّ", "Live readability check")} hint={i("حدود WCAG: نص 4.5:1 · كبير/أكسنت 3:1 — يُقاس على أسوأ سطح خلف النص", "WCAG limits: text 4.5:1 · large/accent 3:1 — measured on the worst surface behind the text")} col>
          <ul className="tp-measures" data-testid="measures">
            {derived.measures.map((x) => <li key={x.role} data-ok={x.ok ? "1" : "0"}><span dir="ltr">{x.role}</span><b dir="ltr">{x.ratio}:1</b><em aria-hidden>{x.ok ? "✓" : "✗"}</em></li>)}
          </ul>
        </Row>
        {at("advanced") && (
          <Row icon={ic(Sparkles)} label={i("التعديلات الآلية", "Automatic adjustments")} hint={i("كل ما غيّره المحرك لتجتاز الألوان حدود المقروئية — بشفافية", "Everything the engine changed so colours meet the readability limits — shown openly")} col>
            {derived.adjustments.length === 0
              ? <div className="st-note" style={{ padding: 0 }}>{i("لا تعديلات — كل الألوان اجتازت كما هي", "None — every colour passed as is")}</div>
              : <ul className="tp-adj" data-testid="adjustments">{derived.adjustments.map((a, n) => <li key={n} dir="ltr">{describeAdjustment(a, (s.language === "en" ? "en" : "ar"))}</li>)}</ul>}
          </Row>
        )}
        {rawOpen && <RawTokens derived={derived} tokens={tune.tokens} onChange={(t) => setTune({ tokens: t })} />}
      </Module>

      </>}
      {section === "appearance" && <Section title={i("إعادة ضبط شاملة", "Global reset")}>
        <Row icon={ic(RotateCcw)} label={i("إعادة ضبط كل إعدادات المظهر", "Reset all appearance settings")} hint={i("يعيد خيارات المظهر فقط للافتراضي؛ إعدادات الحركة ورفّ «ثيماتي» تبقى", "Restores appearance defaults; motion settings and your My themes shelf are kept")}>
          <button className={`st-btn ${armed ? "st-btn-danger" : ""}`} style={armed ? { width: "auto" } : undefined} data-armed={armed} data-testid="reset-theme-all"
            onClick={() => { if (armed) { set(sectionResetPatch("appearance", s)); setArmed(false); } else setArmed(true); }}
            onBlur={() => setArmed(false)}>{armed ? i("متأكد؟ إعادة ضبط", "Sure? Reset") : i("إعادة ضبط الكل", "Reset all")}</button>
        </Row>
      </Section>}
    </div>
  );
}

/** محرر الرموز الخام (الخبير): تجاوز رموز بعينها بـhex مع فحص تباين حيّ (تحذير لا منع). */
function RawTokens({ derived, tokens, onChange }: { derived: ReturnType<typeof useDerivedTheme>["derived"]; tokens: Partial<Record<TokenKey, string>>; onChange: (t: Partial<Record<TokenKey, string>>) => void }) {
  const fg: RGB = hexToRgb(derived.vars["--t-fg"]);
  const checks = checkTokens(tokens, derived.base, fg, derived.accent);
  const eff = (k: TokenKey): string => tokens[k] ?? ((): string => { const v = derived.vars[k]; if (/^#[0-9a-f]{6}$/i.test(v)) return v; const m2 = /rgb\((\d+) (\d+) (\d+)/.exec(v); return m2 ? `#${[m2[1], m2[2], m2[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("")}` : "#000000"; })();
  return (
    <>
      <div role="presentation" dir="auto" className="st-note" style={{ fontWeight: 700, paddingBlock: 8, borderTop: "1px solid var(--c-divider, var(--c-border))" }}>{i("الرموز الخام — تجاوز مباشر بعد الاشتقاق (تحذير التباين لا يمنع التطبيق)", "Raw tokens — a direct override after derivation (a contrast warning does not block applying it)")}</div>
      {TOKEN_KEYS.map((k) => {
        const c = checks.find((x) => x.token === k);
        return (
          <Row key={k} icon={ic(Brush)} label={k} hint={c ? `${c.ratio}:1 ${i("مقابل", "vs")} ${c.against} (${i("الحدّ", "min")} ${c.min}) ${c.ok ? "✓" : "✗ " + i("أدنى من حدّ المقروئية", "below the readability limit")}` : tokens[k] ? i("مُتجاوَز", "overridden") : i("مشتق من الحزمة", "derived from the pack")}>
            <input type="color" aria-label={k} className="st-color" value={eff(k)} onChange={(e) => onChange({ ...tokens, [k]: e.target.value })} />
            <input aria-label={`${k} hex`} dir="ltr" className={`${inputCls} w-28`} value={eff(k)} onChange={(e) => { if (/^#[0-9a-f]{6}$/i.test(e.target.value)) onChange({ ...tokens, [k]: e.target.value.toLowerCase() }); }} />
            {tokens[k] && <button className="st-btn" style={{ width: 36, paddingInline: 0 }} aria-label={`${k} — ${i("إعادة", "Reset")}`} onClick={() => { const n = { ...tokens }; delete n[k]; onChange(n); }}><RotateCcw size={14} /></button>}
          </Row>
        );
      })}
    </>
  );
}


