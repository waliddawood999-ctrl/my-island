// حاسبة آمنة: محلّل نزولي تعاودي (بلا eval). العمليات: + - * / % ^ ! ( ) والدوال الأساسية.
import { fmtNum, normDigits } from "./norm";

type Tok = { t: "num"; v: number } | { t: "id"; v: string } | { t: "op"; v: string };

const FUNCS: Record<string, (...a: number[]) => number> = {
  sqrt: Math.sqrt, abs: Math.abs, sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan, ln: Math.log, log: Math.log10,
  log10: Math.log10, log2: Math.log2, exp: Math.exp, floor: Math.floor, ceil: Math.ceil,
  round: Math.round, pow: Math.pow, min: Math.min, max: Math.max,
};
const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E };

function tokenize(src: string): Tok[] | null {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === " ") { i++; continue; }
    if (/[0-9.]/.test(c)) {
      const m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(src.slice(i));
      if (!m) return null;
      out.push({ t: "num", v: parseFloat(m[0]) });
      i += m[0].length;
    } else if (/[a-zA-Z_π]/.test(c)) {
      const m = /^[a-zA-Z_π][a-zA-Z0-9_]*/.exec(src.slice(i))!;
      out.push({ t: "id", v: m[0] === "π" ? "pi" : m[0].toLowerCase() });
      i += m[0].length;
    } else if (src.startsWith("**", i)) {
      out.push({ t: "op", v: "^" }); i += 2;
    } else if ("+-*/%^()!,".includes(c)) {
      out.push({ t: "op", v: c }); i++;
    } else return null;
  }
  return out;
}

class Parser {
  p = 0;
  /** هل ظهر ما يجعل الإدخال «عملية» (لا رقمًا مجردًا)؟ */
  compound = false;
  constructor(private toks: Tok[]) {}
  private peek() { return this.toks[this.p]; }
  private isOp(v: string) { const t = this.peek(); return !!t && t.t === "op" && t.v === v; }
  private startsOperand() {
    const t = this.peek();
    return !!t && (t.t === "num" || t.t === "id" || (t.t === "op" && t.v === "("));
  }
  expr(): number {
    let v = this.term();
    while (this.isOp("+") || this.isOp("-")) {
      const op = (this.toks[this.p++] as { v: string }).v;
      const r = this.term();
      v = op === "+" ? v + r : v - r;
      this.compound = true;
    }
    return v;
  }
  private term(): number {
    let v = this.unary();
    for (;;) {
      if (this.isOp("*") || this.isOp("/")) {
        const op = (this.toks[this.p++] as { v: string }).v;
        const r = this.unary();
        v = op === "*" ? v * r : v / r;
        this.compound = true;
      } else if (this.isOp("%")) {
        // % بعده معامل ⇒ باقي القسمة، وإلا نسبة مئوية لاحقة (50% = 0.5)
        this.p++;
        this.compound = true;
        if (this.startsOperand()) v = v % this.unary();
        else v = v / 100;
      } else if (this.startsOperand() && this.peek().t !== "num") {
        v = v * this.power(); // ضرب ضمني: 2pi ، 2(3+4)
        this.compound = true;
      } else return v;
    }
  }
  private unary(): number {
    if (this.isOp("-")) { this.p++; return -this.unary(); }
    if (this.isOp("+")) { this.p++; return this.unary(); }
    return this.power();
  }
  private power(): number {
    let b = this.postfix();
    if (this.isOp("^")) {
      this.p++;
      this.compound = true;
      b = Math.pow(b, this.unary());
    }
    return b;
  }
  private postfix(): number {
    let v = this.primary();
    while (this.isOp("!")) {
      this.p++;
      this.compound = true;
      if (!Number.isInteger(v) || v < 0 || v > 170) throw new Error("fact");
      let f = 1; for (let k = 2; k <= v; k++) f *= k;
      v = f;
    }
    return v;
  }
  private primary(): number {
    const t = this.toks[this.p++];
    if (!t) throw new Error("eof");
    if (t.t === "num") return t.v;
    if (t.t === "id") {
      if (this.isOp("(")) {
        const fn = FUNCS[t.v];
        if (!fn) throw new Error("fn");
        this.p++;
        const args: number[] = [];
        if (!this.isOp(")")) {
          args.push(this.expr());
          while (this.isOp(",")) { this.p++; args.push(this.expr()); }
        }
        if (!this.isOp(")")) throw new Error("paren");
        this.p++;
        this.compound = true;
        return fn(...args);
      }
      if (t.v in CONSTS) return CONSTS[t.v];
      throw new Error("id");
    }
    if (t.v === "(") {
      const v = this.expr();
      if (!this.isOp(")")) throw new Error("paren");
      this.p++;
      return v;
    }
    throw new Error("tok");
  }
  done() { return this.p >= this.toks.length; }
}

export interface CalcResult { value: number; text: string; expr: string }

/** يقيّم تعبيرًا؛ null إن لم يكن تعبيرًا حسابيًا صالحًا أو كان رقمًا مجردًا (إلا مع force). */
export function calc(input: string, force = false): CalcResult | null {
  const expr = normDigits(input).trim().replace(/=+$/, "").trim();
  if (!expr || !/[0-9]|pi|π/i.test(expr)) return null;
  const toks = tokenize(expr);
  if (!toks || !toks.length) return null;
  try {
    const ps = new Parser(toks);
    const value = ps.expr();
    if (!ps.done() || !Number.isFinite(value)) return null;
    if (!ps.compound && !force) return null;
    return { value, text: fmtNum(value), expr };
  } catch {
    return null;
  }
}
