/** هل تحت المؤشر عنصر قابل للتمرير ما زال يستطيع التمرير في اتجاه العجلة؟ (لا نخطف العجلة من قائمة قابلة للتمرير.) */
export function scrollsFurther(target: EventTarget | null, deltaY: number, stopAt: Element | null): boolean {
  let el = target instanceof Element ? target : null;
  while (el && el !== stopAt) {
    const oy = getComputedStyle(el).overflowY;
    if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight + 1) {
      if (deltaY > 0 && el.scrollTop + el.clientHeight < el.scrollHeight - 1) return true;
      if (deltaY < 0 && el.scrollTop > 0) return true;
    }
    el = el.parentElement;
  }
  return false;
}
