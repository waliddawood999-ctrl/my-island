import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CalendarClock, RefreshCw, Video } from "lucide-react";
import { i } from "../../i18n";
import { PROVIDER_NAME, type Meeting, type MeetingsSnap } from "../../useMeetings";

const hhmm = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

function dayLabel(ms: number, now: number): string {
  const d = new Date(ms), n = new Date(now);
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(d) - start(n)) / 86_400_000);
  if (diff <= 0) return i("اليوم", "Today");
  if (diff === 1) return i("غدًا", "Tomorrow");
  return d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" });
}

/** رمز الخطأ من الخلفية ⇒ نص (الرمز لا يحمل الرابط أبدًا). */
function errorText(code: string): string {
  if (code === "network") return i("تعذّر الاتصال بالتقويم", "Couldn't reach the calendar");
  if (code === "format") return i("الرابط لا يعيد تقويم iCal", "The link is not an iCal calendar");
  if (code.startsWith("http:")) return i(`رفض الخادم الرابط (${code.slice(5)})`, `The server rejected the link (${code.slice(5)})`);
  return i("تعذّر قراءة التقويم", "Couldn't read the calendar");
}

function Row({ m, now }: { m: Meeting; now: number }) {
  const live = m.start <= now && m.end > now;
  return (
    <div className={`i-card flex items-center gap-3 px-3 py-2 ${live ? "ring-1 ring-emerald-400/60" : ""}`}>
      <div dir="ltr" className="min-w-[88px] shrink-0 whitespace-nowrap text-[13px] tabular-nums text-white/70">
        {hhmm(m.start)}{m.end > m.start ? `–${hhmm(m.end)}` : ""}
      </div>
      <div className="min-w-0 flex-1">
        <div dir="auto" className="truncate text-[14px] font-medium">{m.title || i("اجتماع بلا عنوان", "Untitled meeting")}</div>
        {m.location && !m.join && <div dir="auto" className="truncate text-[11px] text-white/40">{m.location}</div>}
      </div>
      {live && <span className="shrink-0 rounded-full bg-emerald-500/25 px-2 py-0.5 text-[11px] text-emerald-300">{i("الآن", "Now")}</span>}
      {m.join && (
        <button
          onClick={() => invoke("meetings_join", { url: m.join!.url }).catch(() => {})}
          aria-label={`${i("انضمام", "Join")} ${PROVIDER_NAME[m.join.provider]}`}
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-white px-3 py-1 text-[12px] font-semibold text-black hover:bg-white/90 active:bg-white/80"
        >
          <Video size={14} />{i("انضمام", "Join")}
          <span dir="ltr" className="font-normal text-black/50">{PROVIDER_NAME[m.join.provider]}</span>
        </button>
      )}
    </div>
  );
}

/** تبويب الاجتماعات القادمة (7 أيام) من رابط iCal المحفوظ؛ البيانات من الخلفية فقط. */
export function MeetingsTab({ snap, refresh, loading }: { snap: MeetingsSnap; refresh: () => Promise<void>; loading: boolean }) {
  // يُعاد الرسم كل نصف دقيقة وهذا التبويب ظاهر فقط (لإخفاء المنتهي وإظهار «الآن»).
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  const items = snap.items.filter((m) => (m.end > m.start ? m.end > now : m.start >= now - 60_000));
  const groups: { label: string; list: Meeting[] }[] = [];
  for (const m of items) {
    const label = dayLabel(m.start, now);
    const g = groups[groups.length - 1];
    if (g && g.label === label) g.list.push(m); else groups.push({ label, list: [m] });
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex shrink-0 items-center gap-2 text-[13px] text-white/60">
        <CalendarClock size={15} />
        <span>{i("الاجتماعات القادمة", "Upcoming meetings")}</span>
        {snap.error && snap.configured && <span dir="auto" className="truncate text-amber-300/90" role="alert">{errorText(snap.error)}</span>}
        <button
          onClick={() => { refresh(); }}
          disabled={loading || !snap.configured}
          aria-label={i("تحديث", "Refresh")}
          title={i("تحديث", "Refresh")}
          className="i-btn ms-auto p-1.5"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
        {!snap.configured ? (
          <div className="m-auto flex flex-col items-center gap-3 text-center text-[13px] text-white/50">
            <span dir="auto">{i("أضف رابط iCal الخاص بتقويمك من الإعدادات", "Add your calendar's private iCal link in Settings")}</span>
            <button onClick={() => invoke("open_settings").catch(() => {})} className="i-btn px-3 py-1.5 text-white">{i("فتح الإعدادات", "Open settings")}</button>
          </div>
        ) : items.length === 0 ? (
          <div className="m-auto text-[13px] text-white/40">
            {snap.fetched_at == null && !snap.error ? i("جارٍ الجلب…", "Loading…") : i("لا اجتماعات قادمة", "No upcoming meetings")}
          </div>
        ) : (
          groups.map((g) => (
            <div key={g.label} className="flex flex-col gap-1.5">
              <div dir="auto" className="px-1 pt-1 text-[12px] font-semibold text-white/50">{g.label}</div>
              {g.list.map((m) => <Row key={m.id} m={m} now={now} />)}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
