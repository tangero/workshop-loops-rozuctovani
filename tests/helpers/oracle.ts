/**
 * Referenční výpočet přímo podle vzorců ze spec.md, kap. 1.2–1.6.
 * Slouží jen testům jako nezávislé měřítko. Počítá v přesných zlomcích
 * (BigInt), aby nemohl selhat stejně jako implementace s floaty.
 */
import type { Bill, Haler } from "../contract";

export interface Frac {
  num: bigint;
  den: bigint;
}

function gcd(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b) [a, b] = [b, a % b];
  return a || 1n;
}

function add(x: Frac, y: Frac): Frac {
  const num = x.num * y.den + y.num * x.den;
  const den = x.den * y.den;
  const g = gcd(num, den);
  return { num: num / g, den: den / g };
}

/** Kap. 1.4: spropitné T podle režimu. Počítá se ze S = S₀ − D. */
export function expectedTip(bill: Bill, base: Haler): Haler {
  switch (bill.tip.mode) {
    case "none":
      return 0;
    case "percent":
      return Math.floor((base * bill.tip.p + 50) / 100);
    case "total":
      return bill.tip.total - base;
  }
}

export interface Expected {
  subtotal: Haler;
  base: Haler;
  tip: Haler;
  total: Haler;
  /** U_o, útrata osoby jako přesný zlomek (kap. 1.2). */
  spend: Map<string, Frac>;
  /** q_o, přesný podíl (kap. 1.5). */
  exact: Map<string, Frac>;
  /** Podíly po zaokrouhlení metodou největšího zbytku (kap. 1.6). */
  shares: Map<string, Haler>;
}

/** Předpokládá platný účet podle kap. 1.8. */
export function expected(bill: Bill): Expected {
  const subtotal = bill.items.reduce((s, i) => s + i.price, 0);
  const base = subtotal - bill.discount;
  const tip = expectedTip(bill, base);
  const total = base + tip;

  const spend = new Map<string, Frac>(bill.people.map((p) => [p.id, { num: 0n, den: 1n }]));
  for (const item of bill.items) {
    const wsum = Object.values(item.weights).reduce((s, w) => s + w, 0);
    for (const [id, w] of Object.entries(item.weights)) {
      spend.set(id, add(spend.get(id)!, { num: BigInt(item.price * w), den: BigInt(wsum) }));
    }
  }

  const exact = new Map<string, Frac>();
  for (const [id, u] of spend) {
    const num = u.num * BigInt(total);
    const den = u.den * BigInt(subtotal);
    const g = gcd(num, den);
    exact.set(id, { num: num / g, den: den / g });
  }

  const rows = bill.people.map((p, order) => {
    const q = exact.get(p.id)!;
    return { id: p.id, order, floor: q.num / q.den, rem: q.num % q.den, den: q.den };
  });
  let r = BigInt(total) - rows.reduce((s, x) => s + x.floor, 0n);
  const ranked = [...rows].sort((a, b) => {
    const cmp = b.rem * a.den - a.rem * b.den; // větší desetinná část dřív
    if (cmp !== 0n) return cmp > 0n ? 1 : -1;
    return a.order - b.order; // R2: při shodě pořadí v seznamu
  });
  const bonus = new Set<string>();
  for (const row of ranked) {
    if (r <= 0n) break;
    bonus.add(row.id);
    r -= 1n;
  }

  const shares = new Map<string, Haler>();
  for (const row of rows) shares.set(row.id, Number(row.floor) + (bonus.has(row.id) ? 1 : 0));
  return { subtotal, base, tip, total, spend, exact, shares };
}

export function floorOf(f: Frac): number {
  return Number(f.num / f.den);
}

export function isZero(f: Frac): boolean {
  return f.num === 0n;
}
