import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { i } from "../../i18n";

function nowHHMM(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** الحبة: pill أسود ~200×32 بساعة حيّة HH:MM. تبلّغ الخلفية بحجمها (report_island_rect). */
export function Pill() {
  const [time, setTime] = useState(nowHHMM);
  const [hidden, setHidden] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setInterval(() => setTime(nowHHMM()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const un = listen<boolean>("island:hidden", (e) => setHidden(e.payload));
    return () => { un.then((f) => f()); };
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const report = () => {
      const r = el.getBoundingClientRect();
      invoke("report_island_rect", { width: r.width, height: r.height }).catch(() => {});
    };
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      aria-label={i("الساعة", "Clock")}
      className={`flex h-8 w-[200px] items-center justify-center rounded-full bg-black text-[13px] font-medium tabular-nums text-white transition-opacity duration-200 ${hidden ? "opacity-0" : "opacity-100"}`}
    >
      <span dir="ltr">{time}</span>
    </div>
  );
}
