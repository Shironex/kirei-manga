/**
 * WCAG contrast for the design tokens. Reads tokens.css itself (no copied
 * formulas), resolves var(), calc() and clamp() for a given seed, converts the
 * resulting OKLCH colours to sRGB and composites translucent ones over their
 * backdrop, the way the webview paints them.
 */

export type Rgba = { r: number; g: number; b: number; a: number };

/** Custom properties declared in the first top-level `:root { }` block. */
export function parseRootTokens(css: string): Map<string, string> {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const start = clean.search(/(^|\n)\s*:root\s*\{/);
  if (start < 0) throw new Error('tokens: no :root block');
  const open = clean.indexOf('{', start);
  let depth = 0;
  let end = open;
  for (; end < clean.length; end++) {
    if (clean[end] === '{') depth++;
    else if (clean[end] === '}' && --depth === 0) break;
  }
  const tokens = new Map<string, string>();
  for (const decl of clean.slice(open + 1, end).split(';')) {
    const m = /^\s*(--[\w-]+)\s*:\s*([\s\S]+?)\s*$/.exec(decl);
    if (m?.[1] && m[2]) tokens.set(m[1], m[2]);
  }
  return tokens;
}

/** Replaces var(--name) recursively, with `overrides` winning over the tokens. */
export function resolveVars(
  value: string,
  tokens: Map<string, string>,
  overrides: Record<string, string> = {},
  depth = 0
): string {
  if (depth > 20) throw new Error(`tokens: var() cycle near ${value}`);
  return value.replace(/var\(\s*(--[\w-]+)\s*\)/g, (_, name: string) => {
    const raw = overrides[name] ?? tokens.get(name);
    if (raw === undefined) throw new Error(`tokens: ${name} is not defined`);
    return resolveVars(raw, tokens, overrides, depth + 1);
  });
}

type Tok = { kind: 'num'; v: number } | { kind: 'ident'; v: string } | { kind: 'op'; v: string };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const rest = src.slice(i);
    const ws = /^\s+/.exec(rest);
    const num = /^(\d*\.?\d+(?:e-?\d+)?)(%?)/i.exec(rest);
    const ident = /^[a-z][a-z-]*/i.exec(rest);
    if (ws) {
      i += ws[0].length;
    } else if (num) {
      out.push({ kind: 'num', v: Number(num[1]) / (num[2] ? 100 : 1) });
      i += num[0].length;
    } else if (ident) {
      out.push({ kind: 'ident', v: ident[0].toLowerCase() });
      i += ident[0].length;
    } else if ('()+*/,-'.includes(rest.charAt(0))) {
      out.push({ kind: 'op', v: rest.charAt(0) });
      i += 1;
    } else {
      throw new Error(`tokens: cannot read "${rest}"`);
    }
  }
  return out;
}

class Parser {
  private i = 0;
  constructor(private readonly toks: Tok[]) {}

  peek(): Tok | undefined {
    return this.toks[this.i];
  }
  next(): Tok {
    const t = this.toks[this.i++];
    if (!t) throw new Error('tokens: unexpected end of value');
    return t;
  }
  expect(op: string): void {
    const t = this.next();
    if (t.kind !== 'op' || t.v !== op) throw new Error(`tokens: expected "${op}"`);
  }
  isOp(op: string): boolean {
    const t = this.peek();
    return t?.kind === 'op' && t.v === op;
  }

  expr(): number {
    let v = this.term();
    while (this.isOp('+') || this.isOp('-')) {
      const op = (this.next() as { v: string }).v;
      const rhs = this.term();
      v = op === '+' ? v + rhs : v - rhs;
    }
    return v;
  }
  term(): number {
    let v = this.factor();
    while (this.isOp('*') || this.isOp('/')) {
      const op = (this.next() as { v: string }).v;
      const rhs = this.factor();
      v = op === '*' ? v * rhs : v / rhs;
    }
    return v;
  }
  factor(): number {
    const t = this.next();
    if (t.kind === 'num') return t.v;
    if (t.kind === 'op' && t.v === '-') return -this.factor();
    if (t.kind === 'op' && t.v === '(') {
      const v = this.expr();
      this.expect(')');
      return v;
    }
    if (t.kind === 'ident') return this.call(t.v);
    throw new Error(`tokens: unexpected "${t.v}"`);
  }
  call(name: string): number {
    this.expect('(');
    const args = [this.expr()];
    while (this.isOp(',')) {
      this.next();
      args.push(this.expr());
    }
    this.expect(')');
    const [first, second, third] = args as [number, number?, number?];
    switch (name) {
      case 'calc':
        return first;
      case 'clamp':
        if (second === undefined || third === undefined) throw new Error('tokens: clamp() needs 3');
        return Math.min(Math.max(second, first), third);
      case 'min':
        return Math.min(...args);
      case 'max':
        return Math.max(...args);
      default:
        throw new Error(`tokens: unsupported function ${name}()`);
    }
  }

  /** oklch(L C H [/ A]) with each part a number or a math function. */
  oklch(): [number, number, number, number] {
    const fn = this.next();
    if (fn.kind !== 'ident' || fn.v !== 'oklch') throw new Error('tokens: expected oklch()');
    this.expect('(');
    const parts: number[] = [];
    let alpha = 1;
    while (!this.isOp(')')) {
      if (this.isOp('/')) {
        this.next();
        alpha = this.factor();
        continue;
      }
      parts.push(this.factor());
    }
    this.expect(')');
    const [l, c, h] = parts;
    if (parts.length !== 3 || l === undefined || c === undefined || h === undefined) {
      throw new Error('tokens: oklch() needs three channels');
    }
    return [l, c, h, alpha];
  }
}

export function evalNumber(src: string): number {
  return new Parser(tokenize(src)).expr();
}

const toGamma = (x: number) => (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055);
const toLinear = (x: number) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** OKLCH to gamma-encoded sRGB, clipped to the gamut. */
export function oklchToRgba(l: number, c: number, hDeg: number, alpha = 1): Rgba {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const r = 4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_;
  const g = -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_;
  const bl = -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_;
  return {
    r: toGamma(clamp01(r)),
    g: toGamma(clamp01(g)),
    b: toGamma(clamp01(bl)),
    a: clamp01(alpha),
  };
}

export function parseColor(src: string): Rgba {
  const [l, c, h, a] = new Parser(tokenize(src)).oklch();
  return oklchToRgba(l, c, h, a);
}

/** Source-over in gamma space, which is what browsers do for plain colour layers. */
export function composite(top: Rgba, under: Rgba): Rgba {
  const a = top.a + under.a * (1 - top.a);
  if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
  const mix = (t: number, u: number) => (t * top.a + u * under.a * (1 - top.a)) / a;
  return { r: mix(top.r, under.r), g: mix(top.g, under.g), b: mix(top.b, under.b), a };
}

export function luminance({ r, g, b }: Rgba): number {
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

export function contrastRatio(fg: Rgba, bg: Rgba): number {
  const solidFg = fg.a < 1 ? composite(fg, bg) : fg;
  const a = luminance(solidFg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export interface ThemeInput {
  h: number;
  c: number;
  strength: number;
}

/** Resolves one token (or a stack of tokens composited bottom-up) for a seed. */
export function makeResolver(tokens: Map<string, string>, theme: ThemeInput) {
  const overrides = {
    '--seed-h': String(theme.h),
    '--seed-c': String(theme.c),
    '--strength': String(theme.strength),
  };
  const one = (name: string) => parseColor(resolveVars(`var(${name})`, tokens, overrides));
  return (base: string, ...layers: string[]): Rgba => {
    let out = one(base);
    for (const name of layers) out = composite(one(name), out);
    return out;
  };
}
