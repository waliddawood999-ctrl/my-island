import { useState } from "react";
import { i } from "../../i18n";
import { saveSettings } from "../../useSettings";
import type { Settings } from "../../settings";
import { MAX_COUNTDOWNS, MAX_WORLD_CLOCKS, WORLD_CITIES, civilDate, sanitizeCountdowns, sanitizeWorldClocks, validDate, worldCityName } from "../../today";
import { Row, Select, Toggle } from "./fields";

/** عدّادات أحداث «اليوم»: اسم + تاريخ؛ تُخزَّن في kv ضمن الإعدادات (المفتاح countdowns) وتظهر أقرب اثنين. */
export function CountdownsEditor({ s }: { s: Partial<Settings> }) {
  const list = sanitizeCountdowns(s.countdowns);
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const canAdd = name.trim().length > 0 && validDate(date) && list.length < MAX_COUNTDOWNS;
  const add = () => {
    if (!canAdd) return;
    saveSettings({ countdowns: [...list, { id: `ev-${Date.now().toString(36)}`, name: name.trim().slice(0, 40), date }] });
    setName(""); setDate("");
  };
  return (
    <div className="flex flex-col gap-2">
      <Row label={i("عدّادات الأحداث", "Event countdowns")} hint={i("تُعرض أقرب حدثين في «اليوم» — مطفأ ⇒ لا حساب ولا عرض", "The nearest two show in Today — off ⇒ nothing computed or shown")}>
        <Toggle label={i("عدّادات الأحداث", "Event countdowns")} value={s.showCountdowns ?? true} onChange={(v) => saveSettings({ showCountdowns: v })} />
      </Row>
      <div className="flex items-center gap-2">
        <input
          aria-label={i("اسم الحدث", "Event name")} dir="auto" maxLength={40} value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()} placeholder={i("اسم الحدث", "Event name")}
          className="w-44 rounded-md border border-white/15 bg-[var(--app-field)] px-2 py-1 text-sm"
        />
        <input
          type="date" aria-label={i("تاريخ الحدث", "Event date")} dir="ltr" value={date} min={civilDate(Date.now())} onChange={(e) => setDate(e.target.value)}
          className="rounded-md border border-white/15 bg-[var(--app-field)] px-2 py-1 text-sm"
        />
        <button disabled={!canAdd} onClick={add} className="rounded-md bg-[#6f86ff] px-3 py-1 text-sm font-semibold text-white disabled:opacity-40">{i("إضافة", "Add")}</button>
      </div>
      {list.length > 0 && (
        <ul className="flex flex-col gap-1" data-testid="countdown-list">
          {list.map((c) => (
            <li key={c.id} className="flex items-center gap-3 rounded-md bg-white/5 px-3 py-1 text-sm">
              <span dir="auto" className="min-w-0 flex-1 truncate">{c.name}</span>
              <span dir="ltr" className="tabular-nums text-white/60">{c.date}</span>
              <button aria-label={`${i("حذف", "Delete")} ${c.name}`} onClick={() => saveSettings({ countdowns: list.filter((x) => x.id !== c.id) })} className="rounded-md bg-white/10 px-2 py-0.5 text-xs hover:bg-white/20">{i("حذف", "Delete")}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** ساعة عالمية مصغّرة: مدينة أو مدينتان من قائمة مضمّنة (توقيت IANA عبر Intl — بلا شبكة). */
export function WorldClockEditor({ s }: { s: Partial<Settings> }) {
  const sel = sanitizeWorldClocks(s.worldClocks);
  const lang = s.language === "en" ? "en" : "ar";
  const set = (slot: number, id: string) => {
    const next = [...sel];
    if (id === "") next.splice(slot, 1); else next[slot] = id;
    saveSettings({ worldClocks: sanitizeWorldClocks(next.filter(Boolean)) });
  };
  const opts = [{ value: "", label: "—" }, ...WORLD_CITIES.map((c) => ({ value: c.id, label: worldCityName(c.id, lang) }))];
  return (
    <>
      <Row label={i("ساعة عالمية مصغّرة", "Mini world clock")} hint={i("مدينة أو مدينتان في «اليوم» — مطفأ ⇒ لا حساب ولا عرض", "One or two cities in Today — off ⇒ nothing computed or shown")}>
        <Toggle label={i("ساعة عالمية مصغّرة", "Mini world clock")} value={s.showWorldClock ?? false} onChange={(v) => saveSettings({ showWorldClock: v })} />
      </Row>
      {(s.showWorldClock ?? false) && Array.from({ length: MAX_WORLD_CLOCKS }, (_, n) => (
        <Row key={n} label={i(`المدينة ${n + 1}`, `City ${n + 1}`)}>
          <Select label={i(`المدينة ${n + 1}`, `City ${n + 1}`)} value={sel[n] ?? ""} options={opts} onChange={(v) => set(n, v)} />
        </Row>
      ))}
    </>
  );
}
