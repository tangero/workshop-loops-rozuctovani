/**
 * Invarianty I1–I11 ze spec-rev.md, kap. 2. Každý se ověřuje na stovkách
 * náhodných platných účtů (fast-check), ne na jednom příkladu.
 *
 * Kontrakt funkcí je v tests/contract.ts. Referenční výpočet podle vzorců
 * spec je v tests/helpers/oracle.ts.
 */
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { computeBill } from "../src/rozuctovani";
import type { Bill, ComputeResult } from "./contract";
import { arbBill, arbPermutation } from "./helpers/arbitraries";
import { expected, floorOf, isZero } from "./helpers/oracle";

const RUNS = { numRuns: 400 };

type Ok = Extract<ComputeResult, { ok: true }>;

function ok(bill: Bill): Ok {
  const r = computeBill(bill);
  if (!r.ok) throw new Error(`Platný účet byl odmítnut: ${JSON.stringify(r.errors)}`);
  return r;
}

function shareMap(r: Ok): Map<string, number> {
  return new Map(r.shares.map((s) => [s.personId, s.amount]));
}

describe("Výpočet odpovídá vzorcům spec (kap. 1.2–1.6)", () => {
  it("S₀, D, S, T a P odpovídají kap. 1.3–1.5", () => {
    fc.assert(
      fc.property(arbBill(), (bill) => {
        const r = ok(bill);
        const e = expected(bill);
        expect(r.subtotal).toBe(e.subtotal);
        expect(r.discount).toBe(bill.discount);
        expect(r.base).toBe(e.base);
        expect(r.tip).toBe(e.tip);
        expect(r.total).toBe(e.total);
      }),
      RUNS,
    );
  });

  it("podíly odpovídají metodě největšího zbytku s pořadím při shodě (kap. 1.6, R1, R2)", () => {
    fc.assert(
      fc.property(arbBill(), (bill) => {
        const r = ok(bill);
        const e = expected(bill);
        expect(r.shares.map((s) => s.personId)).toEqual(bill.people.map((p) => p.id));
        for (const s of r.shares) expect(s.amount).toBe(e.shares.get(s.personId));
      }),
      RUNS,
    );
  });

  it("všechny částky ve výsledku jsou celá čísla v haléřích (kap. 1.1)", () => {
    fc.assert(
      fc.property(arbBill(), (bill) => {
        const r = ok(bill);
        const nums = [r.subtotal, r.discount, r.base, r.tip, r.total, ...r.shares.map((s) => s.amount), ...r.transfers.map((t) => t.amount)];
        for (const n of nums) expect(Number.isSafeInteger(n)).toBe(true);
      }),
      RUNS,
    );
  });
});

describe("Invarianty (kap. 2)", () => {
  it("I1: podíly všech lidí dají dohromady přesně celkovou částku k zaplacení", () => {
    fc.assert(
      fc.property(arbBill(), (bill) => {
        const r = ok(bill);
        const sum = r.shares.reduce((s, x) => s + x.amount, 0);
        expect(sum).toBe(r.total);
        expect(r.total).toBe(r.subtotal - r.discount + r.tip);
      }),
      RUNS,
    );
  });

  it("I2: podíl se od přesného podílu liší o méně než jeden haléř", () => {
    fc.assert(
      fc.property(arbBill(), (bill) => {
        const r = ok(bill);
        const e = expected(bill);
        for (const s of r.shares) {
          const q = e.exact.get(s.personId)!;
          const f = floorOf(q);
          expect(s.amount).toBeGreaterThanOrEqual(f);
          expect(s.amount).toBeLessThanOrEqual(f + 1);
          // Když je přesný podíl celé číslo, nesmí dostat haléř navíc (kap. 1.6).
          if (q.num % q.den === 0n) expect(s.amount).toBe(f);
        }
      }),
      RUNS,
    );
  });

  it("I3: nikdo nemá záporný podíl a kdo nic neměl, neplatí nic", () => {
    fc.assert(
      fc.property(arbBill({ idlePeople: true }), (bill) => {
        const r = ok(bill);
        const e = expected(bill);
        for (const s of r.shares) {
          expect(s.amount).toBeGreaterThanOrEqual(0);
          if (isZero(e.spend.get(s.personId)!)) expect(s.amount).toBe(0);
        }
      }),
      RUNS,
    );
  });

  it("I4: 0 ≤ T ≤ S a S ≤ P ≤ 2 × S", () => {
    fc.assert(
      fc.property(arbBill(), (bill) => {
        const r = ok(bill);
        expect(r.tip).toBeGreaterThanOrEqual(0);
        expect(r.tip).toBeLessThanOrEqual(r.base);
        expect(r.total).toBeGreaterThanOrEqual(r.base);
        expect(r.total).toBeLessThanOrEqual(2 * r.base);
      }),
      RUNS,
    );
  });

  it("I5: stejné zadání dá vždy stejný výsledek", () => {
    fc.assert(
      fc.property(arbBill(), (bill) => {
        const copy = structuredClone(bill);
        expect(computeBill(copy)).toEqual(computeBill(bill));
      }),
      RUNS,
    );
  });

  it("I5: na pořadí položek nezáleží", () => {
    fc.assert(
      fc.property(
        arbBill().chain((bill) => arbPermutation(bill.items).map((items) => [bill, { ...bill, items }] as const)),
        ([bill, shuffled]) => {
          expect(ok(shuffled)).toEqual(ok(bill));
        },
      ),
      RUNS,
    );
  });

  it("I5: výpočet nemění vstupní objekt", () => {
    fc.assert(
      fc.property(arbBill(), (bill) => {
        const before = structuredClone(bill);
        computeBill(bill);
        expect(bill).toEqual(before);
      }),
      RUNS,
    );
  });

  it("I6: převody dají celkovou částku bez podílu plátce, nikdo neposílá sám sobě, žádný převod na 0", () => {
    fc.assert(
      fc.property(arbBill({ idlePeople: true }), (bill) => {
        const r = ok(bill);
        const shares = shareMap(r);
        const sum = r.transfers.reduce((s, t) => s + t.amount, 0);
        expect(sum).toBe(r.total - shares.get(bill.payerId)!);
        for (const t of r.transfers) {
          expect(t.to).toBe(bill.payerId);
          expect(t.from).not.toBe(bill.payerId);
          expect(t.amount).toBeGreaterThan(0);
          expect(t.amount).toBe(shares.get(t.from));
        }
        // Převod má právě každý, kdo není plátce a má podíl > 0 (kap. 1.7), v pořadí lidí.
        const expectedFrom = bill.people.map((p) => p.id).filter((id) => id !== bill.payerId && shares.get(id)! > 0);
        expect(r.transfers.map((t) => t.from)).toEqual(expectedFrom);
      }),
      RUNS,
    );
  });

  it("I7: jedna osoba na položku, bez slevy a spropitného → každý platí přesně svou útratu", () => {
    fc.assert(
      fc.property(arbBill({ singleOwner: true, withDiscount: false, tipModes: ["none"] }), (bill) => {
        const r = ok(bill);
        const own = new Map<string, number>();
        for (const item of bill.items) {
          const [id] = Object.keys(item.weights);
          own.set(id, (own.get(id) ?? 0) + item.price);
        }
        for (const s of r.shares) expect(s.amount).toBe(own.get(s.personId) ?? 0);
      }),
      RUNS,
    );
  });

  it("I8: přeházení pořadí lidí změní komukoli podíl nejvýš o jeden haléř", () => {
    fc.assert(
      fc.property(
        arbBill().chain((bill) => arbPermutation(bill.people).map((people) => [bill, { ...bill, people }] as const)),
        ([bill, shuffled]) => {
          const a = shareMap(ok(bill));
          const b = shareMap(ok(shuffled));
          for (const [id, amount] of a) expect(Math.abs(b.get(id)! - amount)).toBeLessThanOrEqual(1);
        },
      ),
      RUNS,
    );
  });

  it("I9: vynásobení všech vah jedné položky stejným číslem výsledek nezmění", () => {
    fc.assert(
      fc.property(
        arbBill({ maxWeight: 4 }).chain((bill) =>
          fc.nat({ max: bill.items.length - 1 }).chain((idx) => {
            const maxW = Math.max(...Object.values(bill.items[idx].weights));
            return fc.integer({ min: 1, max: Math.floor(9 / maxW) }).map((k) => [bill, idx, k] as const);
          }),
        ),
        ([bill, idx, k]) => {
          const scaled = structuredClone(bill);
          const item = scaled.items[idx];
          for (const id of Object.keys(item.weights)) item.weights[id] *= k;
          expect(ok(scaled)).toEqual(ok(bill));
        },
      ),
      RUNS,
    );
  });

  it("I10: sleva 0 Kč dá přesně stejný výsledek jako výpočet bez slevy", () => {
    fc.assert(
      fc.property(arbBill({ withDiscount: false }), (bill) => {
        const r = ok(bill);
        // Výpočet bez slevy podle kap. 1.5 ve znění před přidáním slevy: P = S₀ + T, q = P × U / S₀.
        const e = expected({ ...bill, discount: 0 });
        expect(r.discount).toBe(0);
        expect(r.base).toBe(r.subtotal);
        for (const s of r.shares) expect(s.amount).toBe(e.shares.get(s.personId));
      }),
      RUNS,
    );
  });

  it("I11: vyšší sleva nikomu nezvýší podíl o víc než jeden haléř", () => {
    fc.assert(
      fc.property(
        arbBill({ tipModes: ["none", "percent"] }).chain((bill) => {
          const subtotal = bill.items.reduce((s, i) => s + i.price, 0);
          return fc
            .integer({ min: bill.discount, max: subtotal - 1 })
            .map((higher) => [bill, { ...bill, discount: higher }] as const);
        }),
        ([bill, more]) => {
          const a = shareMap(ok(bill));
          const b = shareMap(ok(more));
          for (const [id, amount] of a) expect(b.get(id)!).toBeLessThanOrEqual(amount + 1);
        },
      ),
      RUNS,
    );
  });

  it("I11: v režimu Celkem sleva podíly nemění, pokud C zůstane v mezích", () => {
    fc.assert(
      fc.property(
        arbBill({ tipModes: ["total"] }).chain((bill) => {
          const subtotal = bill.items.reduce((s, i) => s + i.price, 0);
          return fc.integer({ min: bill.discount, max: subtotal - 1 }).map((higher) => [bill, { ...bill, discount: higher }] as const);
        }),
        ([bill, more]) => {
          const r2 = computeBill(more);
          fc.pre(r2.ok); // vyšší sleva může C posunout nad 2 × S, pak jde o jiný případ
          const a = shareMap(ok(bill));
          const b = shareMap(r2 as Ok);
          for (const [id, amount] of a) expect(b.get(id)).toBe(amount);
        },
      ),
      RUNS,
    );
  });
});
