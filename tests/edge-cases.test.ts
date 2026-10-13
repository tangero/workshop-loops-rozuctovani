/**
 * Hraniční případy computeBill. Požadované (N = 0, N = 1, 100/3, záporná
 * částka) a další, které by nám mohly dělat problémy. Očekávané hodnoty
 * jsou spočítané ručně ze vzorců spec-rev.md, ne z implementace.
 *
 * Kontrakt funkcí je v tests/contract.ts.
 */
import { describe, expect, it } from "vitest";
import { computeBill } from "../src/rozuctovani";
import type { Bill, ComputeResult, ErrorCode, Item, Person } from "./contract";
import { expected } from "./helpers/oracle";

type Ok = Extract<ComputeResult, { ok: true }>;

const A: Person = { id: "a", name: "Anna" };
const B: Person = { id: "b", name: "Bára" };
const C: Person = { id: "c", name: "Cyril" };
const D: Person = { id: "d", name: "Dana" };

function bill(over: Partial<Bill> = {}): Bill {
  return {
    people: [A, B, C],
    payerId: "c",
    items: [{ id: "i1", price: 10_000, weights: { a: 1, b: 1, c: 1 } }],
    discount: 0,
    tip: { mode: "none" },
    ...over,
  };
}

function item(id: string, price: number, weights: Record<string, number>): Item {
  return { id, price, weights };
}

function ok(b: Bill): Ok {
  const r = computeBill(b);
  if (!r.ok) throw new Error(`Platný účet byl odmítnut: ${JSON.stringify(r.errors)}`);
  return r;
}

function amounts(r: Ok): number[] {
  return r.shares.map((s) => s.amount);
}

function errorCodes(b: Bill): ErrorCode[] {
  const r = computeBill(b);
  expect(r.ok).toBe(false);
  return r.ok ? [] : r.errors.map((e) => e.code);
}

// Příklad ze stránky Návrh rozúčtování účtu: součet 1 289,00 Kč, víno Anna 2× a Bára 1×.
const NAVRH_ITEMS: Item[] = [
  item("svickova", 28_900, { a: 1 }),
  item("syr", 24_500, { b: 1 }),
  item("burger", 27_900, { c: 1 }),
  item("pivo", 11_800, { c: 1 }),
  item("kofola", 4_900, { b: 1 }),
  item("vino", 23_000, { a: 2, b: 1 }),
  item("hranolky", 7_900, { a: 1, b: 1, c: 1 }),
];

describe("Požadované hraniční případy", () => {
  it("N = 0: bez lidí se výsledek neukáže", () => {
    expect(errorCodes(bill({ people: [], payerId: "", items: [item("i1", 10_000, {})] }))).toContain("NO_PEOPLE");
  });

  it("N = 0 i bez položek: hlásí obě chyby najednou", () => {
    // KONTRAKT: computeBill vrací všechny chyby, ne jen první (kap. 1.8 „napíše, co je potřeba opravit“).
    const codes = errorCodes(bill({ people: [], payerId: "", items: [] }));
    expect(codes).toContain("NO_PEOPLE");
    expect(codes).toContain("NO_ITEMS");
  });

  it("N = 1: Anna, 289,00 Kč, 10 % → spropitné 28,90 Kč, podíl 317,90 Kč, žádný převod", () => {
    const r = ok(bill({ people: [A], payerId: "a", items: [item("i1", 28_900, { a: 1 })], tip: { mode: "percent", p: 10 } }));
    expect(r.tip).toBe(2_890);
    expect(r.total).toBe(31_790);
    expect(amounts(r)).toEqual([31_790]);
    expect(r.transfers).toEqual([]);
  });

  it("100/3: 100,00 Kč na tři → 33,34 / 33,33 / 33,33 Kč, haléř první v seznamu", () => {
    const r = ok(bill());
    expect(amounts(r)).toEqual([3_334, 3_333, 3_333]);
  });

  it("100/3: haléř dostane první v seznamu, ne plátce (R2)", () => {
    const r = ok(bill({ people: [C, A, B], payerId: "b" }));
    expect(r.shares).toEqual([
      { personId: "c", amount: 3_334 },
      { personId: "a", amount: 3_333 },
      { personId: "b", amount: 3_333 },
    ]);
  });

  it("100/3: převody jdou od Anny a Báry Cyrilovi", () => {
    const r = ok(bill());
    expect(r.transfers).toEqual([
      { from: "a", to: "c", amount: 3_334 },
      { from: "b", to: "c", amount: 3_333 },
    ]);
  });

  it("záporná cena položky je neplatná", () => {
    expect(errorCodes(bill({ items: [item("i1", -5_000, { a: 1 })] }))).toContain("INVALID_PRICE");
  });

  it("záporná sleva je neplatná", () => {
    expect(errorCodes(bill({ discount: -20_000 }))).toContain("INVALID_DISCOUNT");
  });

  it("záporná cílová částka je neplatná", () => {
    expect(errorCodes(bill({ tip: { mode: "total", total: -100 } }))).toContain("TOTAL_BELOW_BASE");
  });
});

describe("Ceny a vstupy, které rozbijí naivní implementaci", () => {
  it.each([
    ["nula", 0],
    ["necelý haléř", 0.5],
    ["float z 0,1 + 0,2", 0.1 + 0.2],
    ["NaN", Number.NaN],
    ["nekonečno", Number.POSITIVE_INFINITY],
    ["nad 99 999,99 Kč", 10_000_000],
  ])("cena %s je neplatná", (_, price) => {
    expect(errorCodes(bill({ items: [item("i1", price, { a: 1 })] }))).toContain("INVALID_PRICE");
  });

  it("cena přesně 99 999,99 Kč je platná", () => {
    expect(ok(bill({ items: [item("i1", 9_999_999, { a: 1 })] })).subtotal).toBe(9_999_999);
  });

  it("chyba u ceny ukazuje, která položka to je", () => {
    const r = computeBill(bill({ items: [item("ok", 100, { a: 1 }), item("spatna", 0, { a: 1 })] }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toContainEqual(expect.objectContaining({ code: "INVALID_PRICE", itemId: "spatna" }));
  });

  it("10 haléřů + 20 haléřů je přesně 30 haléřů (žádný float)", () => {
    const r = ok(bill({ items: [item("i1", 10, { a: 1 }), item("i2", 20, { a: 1 })] }));
    expect(r.subtotal).toBe(30);
    expect(amounts(r)).toEqual([30, 0, 0]);
  });
});

describe("Lidé a plátce", () => {
  it("bez položek se výsledek neukáže", () => {
    expect(errorCodes(bill({ items: [] }))).toContain("NO_ITEMS");
  });

  it("30 lidí projde, 31 ne", () => {
    const people = Array.from({ length: 31 }, (_, i) => ({ id: `p${i}`, name: `Osoba ${i + 1}` }));
    const make = (n: number) => bill({ people: people.slice(0, n), payerId: "p0", items: [item("i1", 10_000, { p0: 1 })] });
    expect(computeBill(make(30)).ok).toBe(true);
    expect(errorCodes(make(31))).toContain("TOO_MANY_PEOPLE");
  });

  it("plátce, který není u stolu, je chyba", () => {
    expect(errorCodes(bill({ payerId: "x" }))).toContain("PAYER_INVALID");
  });

  it("stejná jména bez ohledu na velikost písmen a mezery jsou chyba", () => {
    expect(errorCodes(bill({ people: [A, { id: "b", name: " anna " }, C] }))).toContain("DUPLICATE_NAME");
  });

  it("stejná jména lišící se jen diakritikou nejsou duplicita", () => {
    // KONTRAKT: „Šárka“ a „Sarka“ jsou dvě různá jména, spec mluví jen o velikosti písmen.
    expect(computeBill(bill({ people: [{ id: "a", name: "Šárka" }, { id: "b", name: "Sarka" }, C] })).ok).toBe(true);
  });

  it("prázdné jméno (i jen z mezer) je chyba", () => {
    expect(errorCodes(bill({ people: [A, { id: "b", name: "   " }, C] }))).toContain("EMPTY_NAME");
  });

  it("jméno o 30 znacích projde, o 31 ne (i s diakritikou)", () => {
    // KONTRAKT: délka se počítá ve znacích po ořezání mezer, ne v bajtech.
    const name = (n: number) => "Ř".repeat(n);
    expect(computeBill(bill({ people: [A, { id: "b", name: name(30) }, C] })).ok).toBe(true);
    expect(errorCodes(bill({ people: [A, { id: "b", name: name(31) }, C] }))).toContain("NAME_TOO_LONG");
  });

  it("kdo nic neměl, platí 0 a nemá převod", () => {
    const r = ok(bill({ people: [A, B, C, D] }));
    expect(r.shares.find((s) => s.personId === "d")!.amount).toBe(0);
    expect(r.transfers.map((t) => t.from)).not.toContain("d");
  });

  it("plátce, který nic neměl, dostane od ostatních celou částku", () => {
    const r = ok(bill({ people: [A, B, C], payerId: "c", items: [item("i1", 10_000, { a: 1, b: 1 })] }));
    expect(r.transfers).toEqual([
      { from: "a", to: "c", amount: 5_000 },
      { from: "b", to: "c", amount: 5_000 },
    ]);
  });

  it("když měl všechno plátce, nikdo nic neposílá", () => {
    expect(ok(bill({ items: [item("i1", 10_000, { c: 1 })] })).transfers).toEqual([]);
  });

  it("1 haléř na tři: 0,01 / 0 / 0 Kč a převod jen od toho, kdo něco dluží", () => {
    const r = ok(bill({ payerId: "c", items: [item("i1", 1, { a: 1, b: 1, c: 1 })] }));
    expect(amounts(r)).toEqual([1, 0, 0]);
    expect(r.transfers).toEqual([{ from: "a", to: "c", amount: 1 }]);
  });

  it("1 haléř na tři, když první v seznamu je plátce: nikdo nic neposílá", () => {
    const r = ok(bill({ payerId: "a", items: [item("i1", 1, { a: 1, b: 1, c: 1 })] }));
    expect(amounts(r)).toEqual([1, 0, 0]);
    expect(r.transfers).toEqual([]);
  });

  it("2 haléře na tři: 0,01 / 0,01 / 0 Kč", () => {
    expect(amounts(ok(bill({ items: [item("i1", 2, { a: 1, b: 1, c: 1 })] })))).toEqual([1, 1, 0]);
  });
});

describe("Položky a váhy", () => {
  it("100 položek projde, 101 ne", () => {
    const items = (n: number) => Array.from({ length: n }, (_, i) => item(`i${i}`, 100, { a: 1 }));
    expect(computeBill(bill({ items: items(100) })).ok).toBe(true);
    expect(errorCodes(bill({ items: items(101) }))).toContain("TOO_MANY_ITEMS");
  });

  it("položka bez lidí je chyba s id položky", () => {
    const r = computeBill(bill({ items: [item("i1", 100, { a: 1 }), item("prazdna", 100, {})] }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toContainEqual(expect.objectContaining({ code: "ITEM_NO_PEOPLE", itemId: "prazdna" }));
  });

  it.each([0, 10, -1, 1.5, Number.NaN])("váha %s je neplatná", (w) => {
    expect(errorCodes(bill({ items: [item("i1", 100, { a: w })] }))).toContain("INVALID_WEIGHT");
  });

  it("váha u osoby, která už u stolu není, je chyba", () => {
    expect(errorCodes(bill({ items: [item("i1", 100, { a: 1, x: 1 })] }))).toContain("UNKNOWN_PERSON");
  });

  it("víno 230,00 Kč v poměru 2 : 1 se nezaokrouhluje mezi kroky", () => {
    // 153,333… + 76,666… = 230,00 Kč. Zaokrouhlení po položkách by dalo 153,33 + 76,67, jinak.
    const r = ok(bill({ people: [A, B], payerId: "a", items: [item("vino", 23_000, { a: 2, b: 1 })] }));
    expect(amounts(r)).toEqual([15_333, 7_667]);
  });

  it("zaokrouhluje se jednou na konci, ne po položkách", () => {
    // Tři položky po 1,00 Kč na tři lidi: po položkách by Anna dostala 3 haléře navíc (0,34 × 3 = 1,02 Kč).
    // Správně: každý přesně 1,00 Kč.
    const items = [item("i1", 100, { a: 1, b: 1, c: 1 }), item("i2", 100, { a: 1, b: 1, c: 1 }), item("i3", 100, { a: 1, b: 1, c: 1 })];
    expect(amounts(ok(bill({ items })))).toEqual([100, 100, 100]);
  });

  it("příklad ze stránky Návrh: Celkem 1 400 Kč → 509,02 / 431,19 / 459,79 Kč", () => {
    const r = ok(bill({ items: NAVRH_ITEMS, tip: { mode: "total", total: 140_000 } }));
    expect(r.subtotal).toBe(128_900);
    expect(r.tip).toBe(11_100);
    expect(amounts(r)).toEqual([50_902, 43_119, 45_979]);
  });
});

describe("Spropitné", () => {
  it("procento se zaokrouhluje na haléř, polovina nahoru: 5 % z 10,10 Kč = 0,51 Kč", () => {
    expect(ok(bill({ items: [item("i1", 1_010, { a: 1 })], tip: { mode: "percent", p: 5 } })).tip).toBe(51);
  });

  it("procento pod polovinou se zaokrouhluje dolů: 5 % z 10,09 Kč = 0,50 Kč", () => {
    expect(ok(bill({ items: [item("i1", 1_009, { a: 1 })], tip: { mode: "percent", p: 5 } })).tip).toBe(50);
  });

  it("procento z celého čísla vyjde přesně: 5 % z 1 001,00 Kč = 50,05 Kč", () => {
    expect(ok(bill({ items: [item("i1", 100_100, { a: 1 })], tip: { mode: "percent", p: 5 } })).tip).toBe(5_005);
  });

  it.each([0, 20, 7, -10])("procento %s je neplatné", (p) => {
    expect(errorCodes(bill({ tip: { mode: "percent", p: p as 5 } }))).toContain("INVALID_TIP");
  });

  it("Celkem rovno součtu: spropitné 0", () => {
    const r = ok(bill({ tip: { mode: "total", total: 10_000 } }));
    expect(r.tip).toBe(0);
    expect(r.total).toBe(10_000);
  });

  it("Celkem o haléř méně než součet je chyba", () => {
    expect(errorCodes(bill({ tip: { mode: "total", total: 9_999 } }))).toContain("TOTAL_BELOW_BASE");
  });

  it("Celkem přesně dvojnásobek projde, o haléř víc ne", () => {
    expect(ok(bill({ tip: { mode: "total", total: 20_000 } })).tip).toBe(10_000);
    expect(errorCodes(bill({ tip: { mode: "total", total: 20_001 } }))).toContain("TOTAL_ABOVE_DOUBLE");
  });

  it("upozornění nad 30 %: přesně 30 % ne, o haléř víc ano", () => {
    expect(ok(bill({ tip: { mode: "total", total: 13_000 } })).warnings).toEqual([]);
    expect(ok(bill({ tip: { mode: "total", total: 13_001 } })).warnings).toEqual(["TIP_OVER_30"]);
  });

  it("15 % nikdy neupozorňuje", () => {
    expect(ok(bill({ tip: { mode: "percent", p: 15 } })).warnings).toEqual([]);
  });

  it("upozornění výsledek neblokuje", () => {
    const r = computeBill(bill({ tip: { mode: "total", total: 20_000 } }));
    expect(r.ok).toBe(true);
  });

  it("spropitné se rozdělí podle útraty, ne na hlavu", () => {
    // Anna 300 Kč, Bára 100 Kč, 10 % = 40 Kč → Anna 330 Kč, Bára 110 Kč.
    const r = ok(bill({ people: [A, B], payerId: "a", items: [item("i1", 30_000, { a: 1 }), item("i2", 10_000, { b: 1 })], tip: { mode: "percent", p: 10 } }));
    expect(amounts(r)).toEqual([33_000, 11_000]);
  });
});

describe("Sleva na celý účet", () => {
  it("příklad ze specu: sleva 200 Kč, 10 % → 435,54 / 368,94 / 393,42 Kč", () => {
    const r = ok(bill({ items: NAVRH_ITEMS, discount: 20_000, tip: { mode: "percent", p: 10 } }));
    expect(r.base).toBe(108_900);
    expect(r.tip).toBe(10_890);
    expect(r.total).toBe(119_790);
    expect(amounts(r)).toEqual([43_554, 36_894, 39_342]);
  });

  it("spropitné se počítá z částky po slevě (R3)", () => {
    // Součet 100 Kč, sleva 20 Kč, 10 % → spropitné 8 Kč, ne 10 Kč.
    expect(ok(bill({ discount: 2_000, tip: { mode: "percent", p: 10 } })).tip).toBe(800);
  });

  it("sleva rovná součtu je chyba", () => {
    expect(errorCodes(bill({ discount: 10_000 }))).toContain("DISCOUNT_TOO_HIGH");
  });

  it("sleva o haléř menší než součet projde: zaplatí se 0,01 Kč", () => {
    const r = ok(bill({ discount: 9_999, tip: { mode: "percent", p: 10 } }));
    expect(r.base).toBe(1);
    expect(r.tip).toBe(0); // 10 % z 0,01 Kč = 0,001 Kč → 0
    expect(amounts(r)).toEqual([1, 0, 0]);
  });

  it("necelá sleva je chyba", () => {
    expect(errorCodes(bill({ discount: 0.5 }))).toContain("INVALID_DISCOUNT");
  });

  it("sleva a Celkem: meze se počítají z částky po slevě", () => {
    const b = { items: NAVRH_ITEMS, discount: 20_000 };
    expect(ok(bill({ ...b, tip: { mode: "total", total: 110_000 } })).tip).toBe(1_100);
    expect(errorCodes(bill({ ...b, tip: { mode: "total", total: 108_899 } }))).toContain("TOTAL_BELOW_BASE");
    expect(ok(bill({ ...b, tip: { mode: "total", total: 217_800 } })).tip).toBe(108_900);
    expect(errorCodes(bill({ ...b, tip: { mode: "total", total: 217_801 } }))).toContain("TOTAL_ABOVE_DOUBLE");
  });

  it("sleva se dělí podle útraty: kdo utratil víc, má větší díl slevy", () => {
    // Anna 300 Kč, Bára 100 Kč, sleva 40 Kč → Anna 270 Kč, Bára 90 Kč.
    const r = ok(bill({ people: [A, B], payerId: "a", items: [item("i1", 30_000, { a: 1 }), item("i2", 10_000, { b: 1 })], discount: 4_000 }));
    expect(amounts(r)).toEqual([27_000, 9_000]);
  });
});

describe("Horní meze a přesnost", () => {
  it("30 lidí, 100 položek po 99 999,99 Kč, různé váhy, 15 %: přesně a podle vzorců", () => {
    const people = Array.from({ length: 30 }, (_, i) => ({ id: `p${i}`, name: `Osoba ${i + 1}` }));
    // Různé součty vah dají obrovské společné jmenovatele; float by tu ztratil přesnost.
    const items = Array.from({ length: 100 }, (_, k) =>
      item(`i${k}`, 9_999_999, Object.fromEntries(people.map((p, i) => [p.id, ((i * (k + 1)) % 9) + 1]))),
    );
    const b = bill({ people, payerId: "p0", items, tip: { mode: "percent", p: 15 } });
    const r = ok(b);
    expect(r.subtotal).toBe(999_999_900);
    expect(r.tip).toBe(149_999_985);
    expect(r.total).toBe(1_149_999_885);
    expect(r.shares.reduce((s, x) => s + x.amount, 0)).toBe(r.total);
    const e = expected(b);
    for (const s of r.shares) expect(s.amount).toBe(e.shares.get(s.personId));
  });

  it("30 lidí se stejnou útratou a 29 zbylými haléři: dostane je prvních 29 v pořadí", () => {
    // 29 haléřů / 30 lidí → každý 0,9666…, dolů 0, zbytek 29 → všichni kromě posledního 1 haléř.
    const people = Array.from({ length: 30 }, (_, i) => ({ id: `p${i}`, name: `Osoba ${i + 1}` }));
    const r = ok(bill({ people, payerId: "p0", items: [item("i1", 29, Object.fromEntries(people.map((p) => [p.id, 1])))] }));
    expect(amounts(r)).toEqual([...Array(29).fill(1), 0]);
  });
});
