/** حجم بايت ⇒ «1.4 MB» (1024). */
export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const u = ["KB", "MB", "GB", "TB"];
  let v = n / 1024, k = 0;
  while (v >= 1024 && k < u.length - 1) { v /= 1024; k++; }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${u[k]}`;
}
