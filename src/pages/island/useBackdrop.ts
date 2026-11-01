import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

/**
 * الزجاج الحقيقي (T04): أكريليك ويندوز الأصلي (backdrop.rs، SWCA) هو الآلية الوحيدة التي تمزج سطح المكتب خلف نافذة غير نشطة؛ كلا الأسلوبين
 * (frosted/clear) يطلبانه ويختلفان بألفا الصبغة فقط. يُطلب حين تكون المادة زجاجية ومسموحة والحبة «مستقرة» وظاهرة (opacity > 0 — ليس 0.99).
 * <html data-backdrop>: win10 = مطبَّق (جسم الصفحة شفاف) · pending = الزجاج مسموح لكن غير مطبَّق بعد (انتقال/انتظار ⇒ سطح شبه معتم يتلاشى بـ160ms)
 * · none = غير مدعوم/فشل/«تأثيرات الشفافية» مطفأة أو الزجاج غير مسموح (سطح شبه معتم). Rust يُسقط صبغة الأكريليك عند كل تغيّر شكل
 * (win::resize_to_island) فتعيد هذه الدالة الطلب بعد استقرار الحركة. نداءات عند تغيّر المدخلات فقط (لا مؤقّتات).
 * tint = glassTint (0–80)؛ تغيّره وحده أو الأسلوب ⇒ تحديث الصبغة فقط في Rust بلا مسح (لا وميض).
 */
export type BackdropStyle = "frosted" | "clear";
export function useBackdrop(o: { glass: boolean; light: boolean; ready: boolean; radius: number; tint: number; style: BackdropStyle }) {
  const applied = useRef(false); // هل طُلبت خلفية فعلًا؟ المصمتة لا تستدعي الأمر إلا لإزالة خلفية سابقة
  useEffect(() => {
    let alive = true;
    const root = document.documentElement;
    if (!o.glass) {
      root.dataset.backdrop = "none";
      if (applied.current) { applied.current = false; invoke("island_backdrop", { glass: false, light: o.light, radius: o.radius, tint: o.tint, style: o.style }).catch(() => {}); }
      return;
    }
    if (!o.ready) { root.dataset.backdrop = "pending"; return; }
    applied.current = true;
    if (root.dataset.backdrop !== "win10") root.dataset.backdrop = "pending"; // الطلب جارٍ: سطح شبه معتم (لا وميض)؛ تغيّر الصبغة وحدها لا يُسقط win10
    invoke<string>("island_backdrop", { glass: true, light: o.light, radius: o.radius, tint: o.tint, style: o.style })
      .then((m) => { if (alive) root.dataset.backdrop = m === "win10" ? "win10" : "none"; })
      .catch(() => { if (alive) root.dataset.backdrop = "none"; });
    return () => { alive = false; };
  }, [o.glass, o.ready, o.light, o.radius, o.tint, o.style]);
}
