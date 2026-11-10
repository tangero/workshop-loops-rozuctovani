/**
 * Rozúčtování účtu v restauraci: výpočet, parser částek, formát, IBAN a QR platba.
 * Podle spec.md (kap. 1, 4.4–4.8). Kontrakt funkcí je v tests/contract.ts.
 *
 * Všechny peníze jsou celá čísla v haléřích. Podíly se počítají přesně v BigInt.
 */

/**
 * @typedef {import("../tests/contract.ts").Bill} Bill
 * @typedef {import("../tests/contract.ts").BillError} BillError
 * @typedef {import("../tests/contract.ts").ComputeResult} ComputeResult
 * @typedef {import("../tests/contract.ts").Haler} Haler
 * @typedef {import("../tests/contract.ts").Item} Item
 * @typedef {import("../tests/contract.ts").Person} Person
 * @typedef {import("../tests/contract.ts").Transfer} Transfer
 * @typedef {import("../tests/contract.ts").Share} Share
 * @typedef {import("../tests/contract.ts").Warning} Warning
 */

const MAX_PEOPLE = 30;
const MAX_ITEMS = 100;
const MAX_PRICE = 9_999_999; // kap. 4.4: 99 999,99 Kč
const MAX_NAME = 30; // kap. 4.2
const MAX_WEIGHT = 9; // kap. 1.2

/** Váhy pro kontrolní součet předčíslí a čísla účtu (mod 11), CZ standard. */
const PREFIX_WEIGHTS = [10, 5, 8, 4, 2, 1];
const ACCOUNT_WEIGHTS = [6, 3, 7, 9, 10, 5, 8, 4, 2, 1];

/**
 * Zjistí, jestli je hodnota celé číslo v bezpečném rozsahu a v mezích.
 * @param {unknown} v
 * @param {number} min
 * @param {number} max
 * @returns {boolean}
 */
function isIntInRange(v, min, max) {
  return typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max;
}

/** Největší společný dělitel pro BigInt. @param {bigint} a @param {bigint} b @returns {bigint} */
function gcd(a, b) {
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

/**
 * Přičte zlomek n/d k zlomku f (oba BigInt, d > 0) a zkrátí výsledek.
 * @param {{ num: bigint, den: bigint }} f
 * @param {bigint} n
 * @param {bigint} d
 */
function addFraction(f, n, d) {
  const g = gcd(f.den, d);
  const lcm = (f.den / g) * d;
  let num = f.num * (lcm / f.den) + n * (lcm / d);
  let den = lcm;
  const h = gcd(num, den);
  if (h > 1n) {
    num /= h;
    den /= h;
  }
  f.num = num;
  f.den = den;
}

/** @param {unknown} v @returns {v is Record<string, any>} */
function isObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const graphemes = new Intl.Segmenter("cs", { granularity: "grapheme" });

/**
 * Délka jména ve znacích, jak je uživatel vidí (kap. 4.2): „é“ zapsané jako
 * e + kombinující čárka je jeden znak, emoji se ZWJ také.
 * @param {string} name
 * @returns {number}
 */
function nameLength(name) {
  let n = 0;
  for (const _ of graphemes.segment(name)) n++;
  return n;
}

/**
 * Kontroluje položky, lidi, plátce, slevu a spropitné (kap. 1.8, 3.1, 4.2).
 * Vrací seznam všech chyb najednou a S₀, pokud jde spočítat. Snese i
 * poškozený vstup (např. účet ze starší verze v localStorage) bez výjimky.
 * @param {Bill} bill
 * @returns {{ errors: BillError[], subtotal: number | null }}
 */
function validate(bill) {
  /** @type {BillError[]} */
  const errors = [];
  /** @type {Record<string, any>} */
  const b = isObject(bill) ? bill : {};
  // Ještě nezkontrolovaná data: typy Person a Item platí až po validaci.
  /** @type {Record<string, any>[]} */
  const people = Array.isArray(b.people) ? b.people.filter(isObject) : [];
  /** @type {Record<string, any>[]} */
  const items = Array.isArray(b.items) ? b.items.filter(isObject) : [];
  const ids = new Set(people.map((p) => p.id));

  if (people.length === 0) errors.push({ code: "NO_PEOPLE" });
  if (people.length > MAX_PEOPLE) errors.push({ code: "TOO_MANY_PEOPLE" });

  const seenNames = new Set();
  for (const p of people) {
    const name = typeof p.name === "string" ? p.name.normalize("NFC").trim() : "";
    if (name === "") {
      errors.push({ code: "EMPTY_NAME", personId: p.id });
      continue;
    }
    if (nameLength(name) > MAX_NAME) errors.push({ code: "NAME_TOO_LONG", personId: p.id });
    const key = name.toLowerCase();
    if (seenNames.has(key)) errors.push({ code: "DUPLICATE_NAME", personId: p.id });
    seenNames.add(key);
  }
  if (people.length > 0 && !ids.has(b.payerId)) errors.push({ code: "PAYER_INVALID" });

  if (items.length === 0) errors.push({ code: "NO_ITEMS" });
  if (items.length > MAX_ITEMS) errors.push({ code: "TOO_MANY_ITEMS" });

  let allPricesValid = true;
  for (const item of items) {
    if (!isIntInRange(item.price, 1, MAX_PRICE)) {
      allPricesValid = false;
      errors.push({ code: "INVALID_PRICE", itemId: item.id });
    }
    const entries = isObject(item.weights) ? Object.entries(item.weights) : [];
    if (entries.length === 0) errors.push({ code: "ITEM_NO_PEOPLE", itemId: item.id });
    for (const [personId, w] of entries) {
      if (!ids.has(personId)) {
        errors.push({ code: "UNKNOWN_PERSON", itemId: item.id, personId });
      } else if (!isIntInRange(w, 1, MAX_WEIGHT)) {
        errors.push({ code: "INVALID_WEIGHT", itemId: item.id, personId });
      }
    }
  }

  const discountValid = isIntInRange(b.discount, 0, Number.MAX_SAFE_INTEGER);
  const discount = /** @type {number} */ (b.discount);
  if (!discountValid) errors.push({ code: "INVALID_DISCOUNT" });

  // Základ S₀ a S lze spočítat, jen když jsou všechny ceny a sleva v pořádku.
  const baseKnown = allPricesValid && items.length > 0 && discountValid;
  const subtotal = baseKnown ? items.reduce((s, i) => s + i.price, 0) : null;
  if (subtotal !== null && discount >= subtotal) errors.push({ code: "DISCOUNT_TOO_HIGH" });

  /** @type {Record<string, any>} */
  const tip = isObject(b.tip) ? b.tip : {};
  if (tip.mode === "percent") {
    if (![5, 10, 15].includes(tip.p)) errors.push({ code: "INVALID_TIP" });
  } else if (tip.mode === "total") {
    if (!Number.isSafeInteger(tip.total)) {
      errors.push({ code: "INVALID_TIP" });
    } else if (subtotal !== null && discount < subtotal) {
      const base = subtotal - discount;
      if (tip.total < base) errors.push({ code: "TOTAL_BELOW_BASE" });
      else if (tip.total > 2 * base) errors.push({ code: "TOTAL_ABOVE_DOUBLE" });
    }
  } else if (tip.mode !== "none") {
    errors.push({ code: "INVALID_TIP" });
  }

  return { errors, subtotal };
}

/**
 * Spočítá podíly a převody z celého účtu (kap. 1.2–1.7, 1.8).
 * Nikdy nevyhodí výjimku kvůli neplatnému vstupu; chyby vrací v `errors`.
 * @param {Bill} bill
 * @returns {ComputeResult}
 */
export function computeBill(bill) {
  const { errors, subtotal } = validate(bill);
  if (errors.length > 0 || subtotal === null) return { ok: false, errors };

  const people = bill.people;
  const items = bill.items;

  // S₀ a S (kap. 1.3)
  const discount = bill.discount;
  const base = subtotal - discount;

  // Spropitné (kap. 1.4): procento na haléř, polovina nahoru
  let tip = 0;
  if (bill.tip.mode === "percent") {
    tip = Number((BigInt(base) * BigInt(bill.tip.p) + 50n) / 100n);
  } else if (bill.tip.mode === "total") {
    tip = bill.tip.total - base;
  }
  const total = base + tip; // P (kap. 1.5)
  /** @type {Warning[]} */
  const warnings = [];
  if (10 * tip > 3 * base) warnings.push("TIP_OVER_30");

  // Přesná útrata U_o jako zlomek v BigInt (kap. 1.2)
  /** @type {{ num: bigint, den: bigint }[]} */
  const spend = people.map(() => ({ num: 0n, den: 1n }));
  const index = new Map(people.map((p, i) => [p.id, i]));
  for (const item of items) {
    const entries = Object.entries(item.weights);
    const weightSum = BigInt(entries.reduce((s, [, w]) => s + w, 0));
    for (const [personId, w] of entries) {
      // validate() zaručuje, že každá osoba ve vahách je u stolu.
      const i = /** @type {number} */ (index.get(personId));
      addFraction(spend[i], BigInt(item.price) * BigInt(w), weightSum);
    }
  }

  // Podíl q_o = P × U_o / S₀ jako zlomek; f_o = ⌊q_o⌋, zbytek v čitateli (kap. 1.5, 1.6)
  const S0 = BigInt(subtotal);
  const PB = BigInt(total);
  /** @type {bigint[]} */
  const denoms = [];
  /** @type {bigint[]} */
  const remainders = [];
  /** @type {number[]} */
  const floors = [];
  for (const u of spend) {
    const den = u.den * S0;
    const num = PB * u.num;
    floors.push(Number(num / den));
    remainders.push(num % den);
    denoms.push(den);
  }

  // Metoda největšího zbytku (R1), při shodě pořadí v seznamu (R2)
  const r = total - floors.reduce((s, f) => s + f, 0);
  const order = people.map((_, i) => i);
  order.sort((a, b) => {
    const left = remainders[a] * denoms[b];
    const right = remainders[b] * denoms[a];
    if (left !== right) return left > right ? -1 : 1;
    return a - b;
  });
  const amounts = [...floors];
  for (let k = 0; k < r; k++) amounts[order[k]] += 1;

  /** @type {Share[]} */
  const shares = people.map((p, i) => ({ personId: p.id, amount: amounts[i] }));
  /** @type {Transfer[]} */
  const transfers = shares
    .filter((s) => s.personId !== bill.payerId && s.amount > 0)
    .map((s) => ({ from: s.personId, to: bill.payerId, amount: s.amount }));

  return {
    ok: true,
    subtotal,
    discount,
    base,
    tip,
    total,
    shares,
    transfers,
    warnings,
  };
}

/**
 * Převede text z pole částky na haléře (kap. 4.4). Vrací null pro neplatný zápis.
 * @param {string} input
 * @returns {Haler | null}
 */
export function parseAmount(input) {
  const s = input.replace(/\s/g, "");
  if (!/\d/.test(s)) return null;
  const m = /^(\d*)(?:[,.](\d{0,2}))?$/.exec(s);
  if (!m) return null;
  const kc = Number(m[1] || "0");
  if (!Number.isSafeInteger(kc)) return null;
  const hal = kc * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(hal) ? hal : null;
}

/**
 * Zobrazí částku jako „1 289,00 Kč“ (kap. 4.5).
 * @param {Haler} haler
 * @returns {string}
 */
export function formatCzk(haler) {
  const sign = haler < 0 ? "−" : "";
  const digits = String(Math.abs(haler)).padStart(3, "0");
  const kc = digits.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const hal = digits.slice(-2);
  return `${sign}${kc},${hal} Kč`;
}

/**
 * Součet modulo 11 pro český účet: součin číslic a vah, výsledek dělitelný 11.
 * @param {string} digits
 * @param {number[]} weights
 * @returns {boolean}
 */
function mod11Ok(digits, weights) {
  const sum = [...digits].reduce((s, d, i) => s + Number(d) * weights[i], 0);
  return sum % 11 === 0;
}

/**
 * Základní část čísla účtu musí mít aspoň dvě nenulové číslice (vyhláška ČNB
 * č. 169/2011 Sb.). Samé nuly projdou mod 11, ale účet neexistuje.
 * @param {string} account
 * @returns {boolean}
 */
function hasTwoNonZero(account) {
  return [...account].filter((d) => d !== "0").length >= 2;
}

/**
 * IBAN mod 97: písmena se převedou na čísla (A = 10, …), výsledek je číslo.
 * @param {string} s
 * @returns {number}
 */
function mod97(s) {
  const numeric = [...s].map((c) => (/[A-Z]/.test(c) ? String(c.charCodeAt(0) - 55) : c)).join("");
  return Number(BigInt(numeric) % 97n);
}

/**
 * Převede český účet „předčíslí-číslo/kód banky“ nebo IBAN „CZ…“ na IBAN (kap. 4.7).
 * Vrací null, když neprojde kontrolou nebo nejde o český účet.
 * @param {string} input
 * @returns {string | null}
 */
export function toIban(input) {
  const s = input.replace(/\s/g, "").toUpperCase();

  if (s.startsWith("CZ")) {
    if (!/^CZ\d{22}$/.test(s)) return null;
    if (!hasTwoNonZero(s.slice(-10))) return null;
    return mod97(s.slice(4) + s.slice(0, 4)) === 1 ? s : null;
  }

  const m = /^(?:(\d{1,6})-)?(\d{1,10})\/(\d{4})$/.exec(s);
  if (!m) return null;
  const prefix = (m[1] ?? "").padStart(6, "0");
  const account = m[2].padStart(10, "0");
  const bank = m[3];
  if (!hasTwoNonZero(account)) return null;
  if (!mod11Ok(prefix, PREFIX_WEIGHTS) || !mod11Ok(account, ACCOUNT_WEIGHTS)) return null;

  const bban = bank + prefix + account;
  const check = String(98 - mod97(bban + "1235" + "00")).padStart(2, "0");
  return `CZ${check}${bban}`;
}

/**
 * Text QR platby podle SPD 1.0 (kap. 4.8).
 * @param {{ iban: string, amount: Haler, date: Date }} p
 * @returns {string}
 */
export function spdPayload({ iban, amount, date }) {
  const digits = String(amount).padStart(3, "0");
  const am = `${digits.slice(0, -2)}.${digits.slice(-2)}`;
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = String(date.getFullYear()).padStart(4, "0");
  return `SPD*1.0*ACC:${iban}*AM:${am}*CC:CZK*MSG:Utrata ${dd}.${mm}.${yyyy}`;
}
