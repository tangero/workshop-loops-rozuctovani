/**
 * Generátory náhodných platných účtů v mezích spec-rev.md, kap. 3.1 a 1.8.
 */
import fc from "fast-check";
import type { Bill, Item, Person, Tip } from "../contract";

export const MAX_PEOPLE = 30;
export const MAX_ITEMS = 100;
export const MAX_PRICE = 9_999_999; // 99 999,99 Kč

export type TipKind = Tip["mode"];

export interface BillOptions {
  maxPeople?: number;
  maxItems?: number;
  maxWeight?: number;
  /** Každá položka má právě jednoho člověka (pro I7). */
  singleOwner?: boolean;
  /** Generovat i nenulovou slevu. */
  withDiscount?: boolean;
  tipModes?: TipKind[];
  /** Přidat lidi, kteří nic neměli (pro I3). */
  idlePeople?: boolean;
}

export function people(n: number): Person[] {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `Osoba ${i + 1}` }));
}

// Mix malých a velkých cen: malé ceny dělají hodně shod zbytků,
// velké hlídají přetečení a přesnost.
const arbPrice = fc.oneof(
  fc.integer({ min: 1, max: 99 }),
  fc.integer({ min: 100, max: 100_000 }),
  fc.integer({ min: 1, max: MAX_PRICE }),
);

export function arbBill(opts: BillOptions = {}): fc.Arbitrary<Bill> {
  const {
    maxPeople = MAX_PEOPLE,
    maxItems = 40,
    maxWeight = 9,
    singleOwner = false,
    withDiscount = true,
    tipModes = ["none", "percent", "total"],
    idlePeople = false,
  } = opts;

  return fc
    .record({ active: fc.integer({ min: 1, max: maxPeople }), idle: fc.integer({ min: 0, max: idlePeople ? 3 : 0 }) })
    .chain(({ active, idle }) => {
      const total = Math.min(active + idle, MAX_PEOPLE);
      const all = people(total);
      const activeIds = all.slice(0, Math.min(active, total)).map((p) => p.id);

      const arbWeights: fc.Arbitrary<Record<string, number>> = singleOwner
        ? fc
            .record({ id: fc.constantFrom(...activeIds), w: fc.integer({ min: 1, max: maxWeight }) })
            .map(({ id, w }) => ({ [id]: w }))
        : fc
            .uniqueArray(fc.constantFrom(...activeIds), { minLength: 1, maxLength: activeIds.length })
            .chain((sel) =>
              fc
                .array(fc.integer({ min: 1, max: maxWeight }), { minLength: sel.length, maxLength: sel.length })
                .map((ws) => Object.fromEntries(sel.map((id, i) => [id, ws[i]]))),
            );

      const arbItems: fc.Arbitrary<Item[]> = fc
        .array(fc.record({ price: arbPrice, weights: arbWeights }), { minLength: 1, maxLength: maxItems })
        .map((items) => items.map((it, i) => ({ id: `i${i}`, ...it })));

      return fc
        .record({
          items: arbItems,
          payer: fc.nat({ max: total - 1 }),
          discountRaw: fc.oneof(fc.constant(0), fc.nat()),
          tipMode: fc.constantFrom(...tipModes),
          p: fc.constantFrom(5 as const, 10 as const, 15 as const),
          totalRaw: fc.oneof(fc.constant(0), fc.nat()),
          // Náhodné pořadí, aby idle lidé nebyli vždy na konci.
          order: fc.shuffledSubarray(all, { minLength: all.length, maxLength: all.length }),
        })
        .map(({ items, payer, discountRaw, tipMode, p, totalRaw, order }) => {
          const subtotal = items.reduce((s, i) => s + i.price, 0);
          const discount = withDiscount ? discountRaw % subtotal : 0; // 0 ≤ D < S₀
          const base = subtotal - discount;
          let tip: Tip;
          if (tipMode === "none") tip = { mode: "none" };
          else if (tipMode === "percent") tip = { mode: "percent", p };
          else tip = { mode: "total", total: base + (totalRaw % (base + 1)) }; // S ≤ C ≤ 2S
          return { people: order, payerId: all[payer].id, items, discount, tip } satisfies Bill;
        });
    });
}

/** Náhodná permutace pole. */
export function arbPermutation<T>(xs: T[]): fc.Arbitrary<T[]> {
  return fc.shuffledSubarray(xs, { minLength: xs.length, maxLength: xs.length });
}
