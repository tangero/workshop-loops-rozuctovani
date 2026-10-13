/**
 * Zadávání a zobrazení částek, číslo účtu a QR platba
 * (spec-rev.md, kap. 4.4, 4.5, 4.7, 4.8). Kontrakt je v tests/contract.ts.
 */
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { formatCzk, parseAmount, spdPayload, toIban } from "../src/splitBill.js";

const NBSP = " ";

describe("parseAmount (kap. 4.4)", () => {
  it.each([
    ["59", 5_900],
    ["59,5", 5_950],
    ["59,50", 5_950],
    ["59.50", 5_950],
    ["1 289", 128_900],
    [`1${NBSP}289,00`, 128_900],
    ["59,", 5_900],
    [",50", 50],
    ["0", 0],
    ["  59  ", 5_900],
    ["0,1", 10],
    ["0,10", 10],
    ["99 999,99", 9_999_999],
    ["007", 700], // KONTRAKT: úvodní nuly nevadí
  ])("„%s“ → %i haléřů", (input, expectedHaler) => {
    expect(parseAmount(input)).toBe(expectedHaler);
  });

  it.each([
    ["", "prázdné pole"],
    ["   ", "jen mezery"],
    ["-50", "mínus"],
    ["−50", "typografické mínus"],
    ["+50", "plus"],
    ["12,345", "tři desetinná místa"],
    ["1.289", "tečka jako oddělovač tisíců (zní jako 1 289 Kč, ale jsou to 3 desetinná místa)"],
    ["1,289", "čárka a tři místa"],
    ["1.289,00", "dva různé oddělovače"],
    ["1,2,3", "víc oddělovačů"],
    ["1,,5", "zdvojený oddělovač"],
    [",", "jen oddělovač"],
    ["59 Kč", "s měnou"],
    ["59Kč", "s měnou bez mezery"],
    ["abc", "písmena"],
    ["5e3", "vědecký zápis"],
    ["Infinity", "nekonečno"],
    ["NaN", "NaN"],
    ["0x10", "šestnáctkově"],
    ["99999999999999999999", "číslo mimo bezpečný rozsah"], // KONTRAKT: raději null než nepřesné číslo
  ])("„%s“ je neplatné (%s)", (input) => {
    expect(parseAmount(input)).toBeNull();
  });

  it("vrací vždy celé číslo, nikdy float", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 9_999_999 }), fc.boolean(), (h, dot) => {
        const kc = Math.floor(h / 100);
        const hal = String(h % 100).padStart(2, "0");
        const text = `${kc}${dot ? "." : ","}${hal}`;
        const r = parseAmount(text);
        expect(Number.isSafeInteger(r)).toBe(true);
        expect(r).toBe(h);
      }),
      { numRuns: 1000 },
    );
  });
});

describe("formatCzk (kap. 4.5)", () => {
  // KONTRAKT: mezi číslem a „Kč“ je také nezlomitelná mezera, aby se měna neodtrhla na nový řádek.
  it.each([
    [0, `0,00${NBSP}Kč`],
    [5, `0,05${NBSP}Kč`],
    [100, `1,00${NBSP}Kč`],
    [128_900, `1${NBSP}289,00${NBSP}Kč`],
    [9_999_999, `99${NBSP}999,99${NBSP}Kč`],
    [100_000_000, `1${NBSP}000${NBSP}000,00${NBSP}Kč`],
    [-7_272, `−72,72${NBSP}Kč`],
    [-5, `−0,05${NBSP}Kč`],
  ])("%i haléřů → „%s“", (h, text) => {
    expect(formatCzk(h)).toBe(text);
  });

  it("vždy obsahuje měnu a 2 desetinná místa", () => {
    fc.assert(
      fc.property(fc.integer({ min: -1_000_000_000, max: 1_000_000_000 }), (h) => {
        expect(formatCzk(h)).toMatch(/^−?\d{1,3}( \d{3})*,\d{2} Kč$/);
      }),
      { numRuns: 1000 },
    );
  });

  it("parseAmount přečte zpět, co formatCzk vypsal (bez měny)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1_000_000_000 }), (h) => {
        const text = formatCzk(h).replace(`${NBSP}Kč`, "");
        expect(parseAmount(text)).toBe(h);
      }),
      { numRuns: 1000 },
    );
  });
});

describe("toIban (kap. 4.7)", () => {
  it.each([
    ["19-2000145399/0800", "CZ6508000000192000145399"],
    ["2000145399/0800", "CZ7908000000002000145399"],
    ["CZ65 0800 0000 1920 0014 5399", "CZ6508000000192000145399"],
    ["CZ6508000000192000145399", "CZ6508000000192000145399"],
    [" 19-2000145399/0800 ", "CZ6508000000192000145399"],
    ["cz65 0800 0000 1920 0014 5399", "CZ6508000000192000145399"], // KONTRAKT: malá písmena se přijmou
  ])("„%s“ → %s", (input, iban) => {
    expect(toIban(input)).toBe(iban);
  });

  it.each([
    ["19-2000145398/0800", "číslo účtu neprojde kontrolou modulo 11"],
    ["18-2000145399/0800", "předčíslí neprojde kontrolou modulo 11"],
    ["CZ66 0800 0000 1920 0014 5399", "špatné kontrolní číslice IBAN"],
    ["SK31 1200 0000 1987 4263 7541", "platný slovenský IBAN, ale ne český"],
    ["2000145399", "chybí kód banky"],
    ["2000145399/08", "krátký kód banky"],
    ["12345678901/0800", "číslo účtu delší než 10 číslic"],
    ["", "prázdné"],
  ])("„%s“ → null (%s)", (input) => {
    expect(toIban(input)).toBeNull();
  });
});

describe("spdPayload (kap. 4.8)", () => {
  const iban = "CZ6508000000192000145399";

  it("příklad Anna → Cyril 509,02 Kč", () => {
    expect(spdPayload({ iban, amount: 50_902, date: new Date(2026, 9, 13) })).toBe(
      "SPD*1.0*ACC:CZ6508000000192000145399*AM:509.02*CC:CZK*MSG:Utrata 13.10.2026",
    );
  });

  it.each([
    [5, "0.05"],
    [100, "1.00"],
    [123_456_789, "1234567.89"],
  ])("částka %i haléřů → AM:%s (tečka, 2 místa, bez mezer)", (amount, am) => {
    expect(spdPayload({ iban, amount, date: new Date(2026, 9, 13) })).toContain(`*AM:${am}*`);
  });

  it("den a měsíc mají vždy dvě číslice", () => {
    expect(spdPayload({ iban, amount: 100, date: new Date(2026, 0, 3) })).toContain("MSG:Utrata 03.01.2026");
  });

  it("zpráva je bez diakritiky a bez hvězdičky", () => {
    fc.assert(
      fc.property(fc.date({ min: new Date(2000, 0, 1), max: new Date(2099, 11, 31), noInvalidDate: true }), fc.integer({ min: 1, max: 1_000_000_000 }), (date, amount) => {
        const msg = spdPayload({ iban, amount, date }).split("*MSG:")[1];
        expect(msg).toMatch(/^Utrata \d{2}\.\d{2}\.\d{4}$/);
      }),
      { numRuns: 300 },
    );
  });
});
