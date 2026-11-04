import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion } from "motion/react";
import { capturePreviewMs, spring } from "../../motion";
import { i } from "../../i18n";

export interface CaptureShot { path: string; width: number; height: number }

/** Stays inside the existing panel. Native file operations use the existing shelf contract. */
export function CapturePreview({ shot, onClose }: { shot: CaptureShot; onClose: () => void }) {
  const [image, setImage] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [held, setHeld] = useState(false);
  const [editing, setEditing] = useState(false);
  const [tool, setTool] = useState<"draw" | "crop">("draw");
  const [remaining, setRemaining] = useState(capturePreviewMs);
  const remainingRef = useRef(capturePreviewMs);
  const canvas = useRef<HTMLCanvasElement>(null);
  const history = useRef<string[]>([]);
  const start = useRef<{ x: number; y: number } | null>(null);
  const nativeDrag = useRef<{ x: number; y: number } | null>(null);
  const sequence = useRef(0);
  useEffect(() => {
    let alive = true;
    invoke<{ image: string }>("editor_image", { path: shot.path }).then(r => {
      if (!r?.image?.startsWith("data:image/")) throw new Error(i("لا صورة قابلة للعرض", "No displayable image"));
      if (alive) setImage(r.image);
    }).catch(e => alive && setError(String(e)));
    return () => { alive = false; };
  }, [shot.path]);
  useEffect(() => {
    if (held || editing) return;
    const began = performance.now(), available = remainingRef.current;
    const tick = window.setInterval(() => {
      const left = Math.max(0, available - (performance.now() - began));
      remainingRef.current = left; setRemaining(left);
      if (left === 0) onClose();
    }, 50);
    return () => window.clearInterval(tick);
  }, [held, editing, onClose]);
  useEffect(() => {
    if (!editing || !image) return;
    const img = new Image(); let alive = true;
    img.onload = () => {
      const c = canvas.current;
      if (!alive || !c) return;
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext("2d")?.drawImage(img, 0, 0);
    };
    img.src = image;
    return () => { alive = false; };
  }, [editing, image]);
  const run = async (action: () => Promise<unknown>, success: string) => {
    setError(""); setHeld(true);
    try { await action(); setMessage(success); }
    catch (e) { setError(String(e)); }
  };
  const shelfItem = async () => {
    const items = await invoke<{ id: number }[]>("shelf_add", { paths: [shot.path] });
    if (!items?.[0]?.id) throw new Error(i("تعذّر تجهيز الملف؛ افتح المجلد أو انسخ المسار", "Could not prepare file; open the folder or copy the path"));
    return items[0].id;
  };
  const drag = () => run(async () => invoke("shelf_drag", { ids: [await shelfItem()] }), i("بدأ السحب؛ إن لم تقبله الوجهة استخدم نسخ الملف", "Drag started; if the target refuses it, use Copy file"));
  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = e.currentTarget, r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * c.width / r.width, y: (e.clientY - r.top) * c.height / r.height };
  };
  const undo = () => {
    const previous = history.current.pop();
    if (previous) {
      const version = ++sequence.current, img = new Image();
      img.onload = () => { const c = canvas.current; if (version !== sequence.current || !c) return; c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext("2d")?.drawImage(img,0,0); };
      img.src = previous;
    }
  };
  return <motion.section data-testid="capture-preview" dir="rtl" className="capture-preview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={spring.content}
    onMouseEnter={() => setHeld(true)} onMouseLeave={() => { if (!error && !editing) setHeld(false); }} onClick={e => e.stopPropagation()} onContextMenu={e => e.stopPropagation()}>
    <header><strong>{i("آخر لقطة", "Latest capture")}</strong><span dir="ltr">{Math.ceil(remaining / 1000)}s</span><button className="i-btn" onClick={onClose}>{i("إغلاق", "Close")}</button></header>
    <div role="progressbar" aria-label={i("مدة المعاينة", "Preview time")} aria-valuemin={0} aria-valuemax={5} aria-valuenow={remaining / 1000} className="capture-countdown"><span style={{ transform: `scaleX(${remaining / capturePreviewMs})` }} /></div>
    {editing ? <canvas ref={canvas} data-testid="capture-canvas" className="capture-image" style={{ touchAction: "none" }}
      onPointerDown={e => { if (e.button !== 0) return; sequence.current++; history.current.push(e.currentTarget.toDataURL()); start.current = point(e); e.currentTarget.setPointerCapture(e.pointerId); const g = e.currentTarget.getContext("2d"); g?.beginPath(); g?.moveTo(start.current.x, start.current.y); }}
      onPointerMove={e => { if (!start.current || tool !== "draw") return; const p = point(e), g = e.currentTarget.getContext("2d"); if (g) { g.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "currentColor"; g.lineWidth = Math.max(2, e.currentTarget.width / 250); g.lineCap = "round"; g.lineTo(p.x, p.y); g.stroke(); } }}
      onPointerUp={e => { const a = start.current; start.current = null; if (!a) return; if (tool === "crop") { const b = point(e), c = e.currentTarget, g = c.getContext("2d"); const x = Math.max(0, Math.min(a.x,b.x)), y = Math.max(0,Math.min(a.y,b.y)), w = Math.min(c.width-x,Math.abs(a.x-b.x)), h = Math.min(c.height-y,Math.abs(a.y-b.y)); if (g && w >= 2 && h >= 2) { const pixels = g.getImageData(x,y,w,h); c.width = pixels.width; c.height = pixels.height; g.putImageData(pixels,0,0); } } }}
      onPointerCancel={() => { start.current = null; undo(); }} /> : image && <img className="capture-image" src={image} alt={i("اللقطة الجديدة؛ اسحبها إلى تطبيق أو مجلد", "New capture; drag to an app or folder")} draggable={false}
        onPointerDown={e => { if (e.button === 0) nativeDrag.current = { x:e.clientX,y:e.clientY }; }} onPointerMove={e => { const p = nativeDrag.current; if (p && e.buttons && Math.hypot(e.clientX-p.x,e.clientY-p.y)>6) { nativeDrag.current=null; void drag(); } }} onPointerUp={() => { nativeDrag.current=null; }} />}
    <div className="capture-actions">
      <button className="i-btn" onClick={() => run(async () => invoke("shelf_copy", { id: await shelfItem() }), i("نُسخ الملف", "File copied"))}>{i("نسخ الملف", "Copy file")}</button>
      <button className="i-btn" onClick={() => run(() => invoke("open_path", { path: shot.path }), i("فُتحت الصورة", "Image opened"))}>{i("فتح", "Open")}</button>
      <button className="i-btn" disabled={!image} onClick={() => { const a=document.createElement("a"); a.href=image; a.download=shot.path.split(/[\\/]/).pop() || "MyIsland.png"; a.click(); setMessage(i("طُلب التنزيل؛ إن لم يظهر افتح مجلد اللقطات", "Download requested; if absent, open the captures folder")); }}>{i("تنزيل", "Download")}</button>
      <button className="i-btn" disabled={!image} onClick={() => { if (editing && canvas.current) setImage(canvas.current.toDataURL()); setEditing(!editing); setHeld(true); }}>{editing ? i("إنهاء التحرير", "Done editing") : i("تحرير", "Edit")}</button>
      <button className="i-btn" onClick={() => run(async () => { await shelfItem(); }, i("أُضيفت إلى الرف", "Added to shelf"))}>{i("حفظ في الرف", "Save to shelf")}</button>
      <button className="i-btn" onClick={() => run(() => invoke("open_captures"), i("فُتح المجلد", "Folder opened"))}>{i("فتح المجلد", "Open folder")}</button>
      <button className="i-btn" onClick={() => run(() => invoke("clip_set_text", { text: shot.path }), i("نُسخ المسار؛ ألصقه في وجهة المشاركة", "Path copied; paste into the sharing target"))}>{i("نسخ المسار", "Copy path")}</button>
    </div>
    {editing && <div className="capture-actions"><button className="i-btn" aria-pressed={tool==="draw"} onClick={() => setTool("draw")}>{i("رسم", "Draw")}</button><button className="i-btn" aria-pressed={tool==="crop"} onClick={() => setTool("crop")}>{i("قص بالسحب", "Drag to crop")}</button><button className="i-btn" onClick={undo}>{i("تراجع", "Undo")}</button><button className="i-btn" onClick={() => run(async () => { const data=canvas.current?.toDataURL(); if (!data) throw new Error(i("لا صورة", "No image")); await invoke("editor_save",{data,mode:"new"}); },i("حُفظت نسخة ونُسخت الصورة", "Copy saved and image copied"))}>{i("حفظ نسخة", "Save copy")}</button></div>}
    {message && <p role="status">{message}</p>}{error && <p role="alert">{error} — {i("بديل: نسخ المسار أو فتح المجلد", "Alternative: copy path or open folder")}</p>}
  </motion.section>;
}
