/**
 * KONTRAKT — odvozený ze spec.md, ne z kódu (kód zatím neexistuje).
 *
 * Implementace patří do `src/splitBill.js` (ES modul v čistém JavaScriptu,
 * typy přes JSDoc z tohoto souboru) a musí exportovat tyto funkce:
 *
 *   computeBill(bill: Bill): ComputeResult
 *     Bere celý rozpracovaný účet (spec kap. 5) a vrací buď výsledek
 *     (podíly a převody, kap. 1.2–1.7), nebo seznam chyb, proč se výsledek
 *     nesmí ukázat (kap. 1.8, 3.1, 4.2). Nikdy nevyhazuje výjimku kvůli
 *     neplatnému vstupu. Všechny částky jsou celá čísla v haléřích (kap. 1.1).
 *
 *   parseAmount(input: string): number | null
 *     Převede text z pole částky na haléře podle kap. 4.4. Vrací null pro
 *     neplatný zápis. Meze (např. cena aspoň 0,01 Kč) neřeší, ty kontroluje
 *     computeBill. "0" je tedy platný zápis = 0.
 *
 *   formatCzk(haler: number): string
 *     Zobrazí částku podle kap. 4.5: „1 289,00 Kč“, oddělovač tisíců je
 *     nezlomitelná mezera (U+00A0), záporná částka se znaménkem „−“ (U+2212).
 *
 *   toIban(input: string): string | null
 *     Převede český účet „předčíslí-číslo/kód banky“ nebo IBAN „CZ…“ na IBAN
 *     bez mezer (kap. 4.7). Vrací null, když neprojde kontrolní součet nebo
 *     nejde o český účet.
 *
 *   spdPayload(p: { iban: string; amount: number; date: Date }): string
 *     Text QR platby podle kap. 4.8.
 *
 * Kde spec něco výslovně neříká a test to přesto potřebuje, je to v testech
 * označené komentářem „KONTRAKT:“ — to jsou rozhodnutí k potvrzení.
 */

/** Celé číslo v haléřích. 1 Kč = 100. */
export type Haler = number;

export interface Person {
  id: string;
  name: string;
}

export interface Item {
  id: string;
  name?: string;
  /** Cena v haléřích, 1 až 9 999 999 (kap. 4.4). */
  price: Haler;
  /** Váhy 1–9 pro lidi, kteří položku měli. Kdo ji neměl, v mapě není. */
  weights: Record<string, number>;
}

export type Tip =
  | { mode: "none" }
  | { mode: "percent"; p: 5 | 10 | 15 }
  | { mode: "total"; total: Haler };

export interface Bill {
  account?: string;
  /** Pořadí rozhoduje o zbytkovém haléři při shodě (R2). */
  people: Person[];
  payerId: string;
  items: Item[];
  /** Sleva na celý účet v haléřích, 0 = bez slevy (kap. 1.3). */
  discount: Haler;
  tip: Tip;
}

export interface Share {
  personId: string;
  amount: Haler;
}

export interface Transfer {
  from: string;
  to: string;
  amount: Haler;
}

export type ErrorCode =
  | "NO_PEOPLE" // kap. 1.8
  | "TOO_MANY_PEOPLE" // kap. 3.1: víc než 30
  | "EMPTY_NAME" // kap. 4.2
  | "NAME_TOO_LONG" // kap. 4.2: víc než 30 znaků
  | "DUPLICATE_NAME" // kap. 4.2
  | "PAYER_INVALID" // kap. 4.2: plátce musí být ze seznamu
  | "NO_ITEMS" // kap. 1.8
  | "TOO_MANY_ITEMS" // kap. 3.1: víc než 100
  | "INVALID_PRICE" // kap. 4.4: mimo 1–9 999 999 haléřů nebo není celé číslo
  | "ITEM_NO_PEOPLE" // kap. 1.8
  | "INVALID_WEIGHT" // kap. 1.2: váha není celé číslo 1–9
  | "UNKNOWN_PERSON" // kap. 4.2: váha u osoby, která u stolu není
  | "INVALID_DISCOUNT" // kap. 1.3: záporná nebo neceločíselná
  | "DISCOUNT_TOO_HIGH" // kap. 1.8: D ≥ S₀
  | "INVALID_TIP" // kap. 1.4: procento mimo {5, 10, 15}
  | "TOTAL_BELOW_BASE" // kap. 1.4: C < S
  | "TOTAL_ABOVE_DOUBLE"; // kap. 1.4: C > 2 × S

export interface BillError {
  code: ErrorCode;
  itemId?: string;
  personId?: string;
}

/** Upozornění, která výsledek neblokují. */
export type Warning = "TIP_OVER_30"; // kap. 1.4: 10 × T > 3 × S

export type ComputeResult =
  | {
      ok: true;
      /** S₀, součet cen položek. */
      subtotal: Haler;
      /** D, sleva na celý účet. */
      discount: Haler;
      /** S = S₀ − D, základ spropitného. */
      base: Haler;
      /** T, spropitné. */
      tip: Haler;
      /** P = S + T, celkem k zaplacení. */
      total: Haler;
      /** Jeden záznam pro každou osobu, ve stejném pořadí jako bill.people. */
      shares: Share[];
      /** Převody od lidí s podílem > 0 kromě plátce, v pořadí bill.people. */
      transfers: Transfer[];
      warnings: Warning[];
    }
  | { ok: false; errors: BillError[] };
