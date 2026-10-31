import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

const PULSE_MS = 2000;
let frozen = false;

/** debug_freeze (وضع التطوير فقط): يوقف النبض ليُختبر المراقب في الخلفية. */
export function debugFreeze() {
  if (import.meta.env.DEV) frozen = true;
}

/** نبض الصفحة: يستدعي page_pong كل ثانيتين ما لم يُجمَّد. */
export function usePagePulse() {
  useEffect(() => {
    const send = () => { if (!frozen) invoke("page_pong").catch(() => {}); };
    send();
    const t = setInterval(send, PULSE_MS);
    return () => clearInterval(t);
  }, []);
}
