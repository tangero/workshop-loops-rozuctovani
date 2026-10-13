# Úkol: fix/splitbill

- **Větev:** `fix/splitbill`
- **Worktree:** `/Users/patrickzandl/GitHub/workshop-loops2-splitbill`
- **Model:** Haiku 5.5

## Kontext

Webová appka pro český trh rozdělí účet v restauraci mezi lidi u stolu. Jeden člověk zaplatí kartou a ostatní mu pošlou svůj podíl QR platbou. Appka je statická, bez serveru.

- Jediný zdroj pravdy je `spec-rev.md`. Pro tento úkol jsou důležité tyto kapitoly:
  - 1: výpočetní pravidla,
  - 2: invarianty,
  - 4.4: zadávání částek,
  - 4.5: formát částek,
  - 4.7: číslo účtu,
  - 4.8: QR platba,
  - 5: datový model,
  - 6: hraniční případy.
- Kontrakt funkcí, tedy názvy, vstupy, výstupy a chybové kódy, je v `tests/contract.ts`. Přečti ho celý.
- Testy jsou napsané předem v `tests/*.test.ts`. Implementace zatím neexistuje, proto teď všechny padají.
- Testy se spouštějí příkazem `npm test` (vitest a fast-check). Závislosti jsou nainstalované přes `npm ci`.
- Souběžně vzniká v jiné větvi webové rozhraní. To se tě netýká a jeho soubory neexistují.

## Cíl

1. Vytvořit `src/splitBill.js`: ES modul v čistém JavaScriptu bez závislostí. Typy dávej přes JSDoc s importem typů z `../tests/contract.ts`. Modul exportuje přesně tyto funkce z kontraktu:
   - `computeBill`,
   - `parseAmount`,
   - `formatCzk`,
   - `toIban`,
   - `spdPayload`.
2. Ve třech souborech `tests/edge-cases.test.ts`, `tests/input-output.test.ts` a `tests/invariants.test.ts` změnit **jen** řádek importu z `"../src/rozuctovani"` na `"../src/splitBill.js"`. Nic jiného v testech neměň.

Postupuj v těchto krocích. Po každém kroku spusť uvedené testy a pokračuj, až když projdou:

1. `parseAmount`, `formatCzk`, `toIban` a `spdPayload` podle kap. 4.4–4.8 → `npx vitest run tests/input-output.test.ts`.
2. Kontroly vstupu v `computeBill`, tedy všechny chybové kódy z kontraktu. Vrací se všechny chyby najednou, nikdy výjimka → chybové testy v `npx vitest run tests/edge-cases.test.ts`.
3. Výpočet podle kap. 1.2–1.6:
   - Útrata osoby `U_o` je přesný zlomek v `BigInt`.
   - `S₀` je součet cen, `S = S₀ − D`.
   - Spropitné podle kap. 1.4 ze `S`.
   - `P = S + T`.
   - `q_o = P × U_o / S₀`.
   - Každému `⌊q_o⌋`. Zbylé haléře se rozdají lidem s největší desetinnou částí, při shodě podle pořadí v `bill.people`.

   → `npx vitest run tests/edge-cases.test.ts` celý.
4. Převody (kap. 1.7) a upozornění `TIP_OVER_30` (kap. 1.4) → `npm test`.

### Pravidla

- Peníze jsou vždy celá čísla v haléřích. Nepoužívej desetinná čísla, `toFixed`, `parseFloat` ani `Math.round` na částkách.
- **Nečti `tests/helpers/oracle.ts`.** Je to nezávislý referenční výpočet, se kterým testy porovnávají tvůj kód. Když ho opíšeš, testy přestanou cokoli dokazovat. Algoritmus ber jen ze `spec-rev.md`.
- Neměň `spec-rev.md`, `package.json`, `package-lock.json`, `tests/contract.ts`, `tests/helpers/` ani testy (kromě importu).
- Nesahej na `src/ui/`, `index.html` ani na nic mimo tento worktree.
- Když podle tebe test odporuje specu, test neměň. Zapiš to do oddílu „Rozpory“ na konci tohoto souboru.
- Nepracuj na `main`. Nemerguj.

## Hotovo (stop condition, čte reviewer)

Úkol je hotový, jen když platí všechno:

1. `npm test` projde: **147 testů, 0 failed, 0 skipped**.
2. `npx tsc --noEmit --strict --allowJs --checkJs false --target es2022 --module esnext --moduleResolution bundler --skipLibCheck tests/*.ts tests/helpers/*.ts` nehlásí žádnou chybu.
3. `grep -nE "toFixed|parseFloat|Math\.round" src/splitBill.js` nic nenajde.
4. `git diff main --stat` ukazuje jen `src/splitBill.js`, `.tasks/fix-splitbill.md` a tři testové soubory. V testech se změnil jen řádek importu (ověř `git diff main -- tests`).
5. Větev je nahraná na `origin` a existuje **draft** PR `fix/splitbill` → `main`. Jeho popis obsahuje reálný souhrn výstupu `npm test`.

**Pojistka:** když po 3 pokusech nedokážeš projít jeden krok, skonči. Commitni, co máš, otevři draft PR a do popisu napiš, který krok to byl, které testy padají a s jakou chybou. Nic nemerguj.

## Rozpory

Z code review (vypořádání po kolech, viz komentář v PR #1). Tyto tři nálezy kontrakt ani spec neřeší, takže čekají na rozhodnutí:

1. **Duplicitní `id` osob.** `people` se dvěma osobami se stejným `id` projde validací. Útratu pak dostane jen poslední z nich a ve výsledku jsou dva záznamy se stejným `personId`. Oprava potřebuje nový chybový kód (např. `DUPLICATE_ID`) v `tests/contract.ts`.
2. **QR platba nad 9 999 999,99 Kč.** SPD 1.0 povoluje v poli `AM` nejvýš 10 znaků. Spec připouští převod až 19 999 998,00 Kč, ze kterého vznikne `AM:19999998.00` (11 znaků). `spdPayload` vrací vždy `string`. Je potřeba rozhodnout, co dělat s velkou částkou: vrátit `null`, vyhodit výjimku, nebo snížit limity ve specu.
3. **`formatCzk` s necelým číslem.** Pro vstup, který není celý haléř, vrátí nesmysl („1,.5 Kč“). Kontrakt neříká, co má funkce v takovém případě udělat. Návrh: vyhodit `RangeError`, protože jde o chybu programátora, ne uživatele.
