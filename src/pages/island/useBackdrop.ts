import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

/**
 * الزجاج الحقيقي على مستوى النافذة (backdrop.rs): يُطلب فقط حين تكون المادة زجاجية والحبة «مستقرة»
 * (انتهت حركة الحجم وأُعيد قياس النافذة) وغير باهتة (opacity=1، وإلا يبقى التمويه ظاهرًا بلا حبة).
 * الخلفية تُسقَط في الخلفية (Rust) عند أي تغيير حجم؛ هنا يُحدَّث `data-backdrop` على <html> فقط:
 *   none  ⇒ الزجاج داخل الصفحة (الاحتياط) · win11/win10 ⇒ التمويه من النظام وصبغة الصفحة تخفّ (island.css).
 * فشل الأمر/عدم الدعم ⇒ none بصمت. نداءات عند تغيّر المدخلات فقط (لا مؤقّتات ولا polling).
 */
export function useBackdrop(o: { glass: boolean; light: boolean; ready: boolean; radius: number }) {
  const want = o.glass && o.ready;
  useEffect(() => {
    let alive = true;
    const root = document.documentElement;
    if (!want) root.dataset.backdrop = "none"; // احتياط فوري أثناء الانتقال
    invoke<string>("island_backdrop", { glass: want, light: o.light, radius: o.radius })
      .then((m) => { if (alive) root.dataset.backdrop = want && (m === "win11" || m === "win10") ? m : "none"; })
      .catch(() => { if (alive) root.dataset.backdrop = "none"; });
    return () => { alive = false; };
  }, [want, o.light, o.radius]);
}
