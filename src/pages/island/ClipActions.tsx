import { invoke } from "@tauri-apps/api/core";
import { motion } from "motion/react";
import { Copy, ExternalLink, Languages, MessageCircle } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { tap } from "../../motion";
import { i } from "../../i18n";
import { classifyClip } from "../../clipActions";

function Chip({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <motion.button
      {...tap}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="i-btn flex items-center gap-1 bg-white/10 px-2 py-0.5 text-[11px] text-white/80 hover:bg-white/20"
    >
      {icon}
      {label}
    </motion.button>
  );
}

/** إجراء سياقي واحد حسب نوع نص العنصر (رابط/جوال/لون/عملية/نص) — بلا تغيير في التخزين. */
export function ClipActions({ text, onDone }: { text: string | null; onDone: (msg: string) => void }) {
  const a = useMemo(() => classifyClip(text), [text]);
  if (!a) return null;
  const open = (url: string) => invoke("open_path", { path: url }).catch(() => onDone(i("تعذّر الفتح", "Could not open")));
  const copy = (v: string) =>
    invoke("clip_set_text", { text: v }).then(() => onDone(i("نُسخ", "Copied"))).catch(() => onDone(i("تعذّر النسخ", "Copy failed")));
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5">
      {a.kind === "url" && <Chip icon={<ExternalLink size={11} />} label={i("فتح", "Open")} onClick={() => open(a.url)} />}
      {a.kind === "phone" && <Chip icon={<MessageCircle size={11} />} label={i("مراسلة واتساب", "WhatsApp")} onClick={() => open(a.wa)} />}
      {a.kind === "hex" && <Chip icon={<Copy size={11} />} label={i("نسخ RGB", "Copy RGB")} onClick={() => copy(a.rgb)} />}
      {a.kind === "calc" && (
        <>
          <span dir="ltr" className="text-[12px] font-semibold tabular-nums text-[#8ea2ff]">= {a.result}</span>
          <Chip icon={<Copy size={11} />} label={i("نسخ النتيجة", "Copy result")} onClick={() => copy(a.result)} />
        </>
      )}
      {a.kind === "text" && <Chip icon={<Languages size={11} />} label={i("ترجمة", "Translate")} onClick={() => open(a.translate)} />}
    </div>
  );
}
