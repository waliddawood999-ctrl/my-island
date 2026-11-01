// مرآة TS لرموز src/tokens.css — الأرقام التي يحتاجها JS (حركة، أبعاد النوافذ). لا قيم مبعثرة في المكوّنات.
export const radii = { card: 16, control: 10, chip: 999, palette: 24, panel: 28 } as const;
export const spacing = [4, 8, 12, 16, 20, 24, 32] as const;
export const typeScale = { sizes: [12, 13, 14, 16, 20, 24], weights: { regular: 400, medium: 500, bold: 700 } } as const;
export const durations = { fast: 120, base: 200, slow: 320 } as const; // ms
export const easing = [0.2, 0.8, 0.2, 1] as const;
export const SPRING_STYLES = ["snappy", "smooth", "gentle"] as const;
export type SpringStyle = (typeof SPRING_STYLES)[number];
/** نوابض مسبقة: snappy 500/35 · smooth 300/30 · gentle 180/24. */
export const springPresets: Record<SpringStyle, { stiffness: number; damping: number }> = {
  snappy: { stiffness: 500, damping: 35 },
  smooth: { stiffness: 300, damping: 30 },
  gentle: { stiffness: 180, damping: 24 },
};
/** الحبة: الافتراضي + حدود الإعدادات (المصدر الوحيد). */
export const PILL = { w: 220, h: 34, minW: 160, maxW: 280, minH: 28, maxH: 44 } as const;
/** اللوحة: مقاس ثابت لكل عرض (لا قفزات بين التبويبات؛ المحتوى الأطول يمرّر داخليًا). */
export const PANEL = { w: 720, h: 320 } as const;
export const PANEL_PALETTE = { w: 640, h: 440 } as const;
export const elevation = [1, 2, 3] as const;
