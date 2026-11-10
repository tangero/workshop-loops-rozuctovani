# Rozúčtování účtu: vzorový projekt k workshopu o smyčkách

Vzorový repozitář k workshopu o práci s agenty v Claude Code: spec, testy napsané předem, nezávislý reviewer a úkol se stop condition.

## Co je kde

| Soubor | K čemu |
|---|---|
| `spec.md` | Specifikace, jediný zdroj pravdy. Vznikla v pěti kolech revize (tabulka na konci). |
| `tests/contract.ts` | Kontrakt funkcí: názvy, vstupy, výstupy a chybové kódy. |
| `tests/*.test.ts` | Testy napsané předem: hraniční případy, vstup a výstup, invarianty (property-based). |
| `tests/helpers/oracle.ts` | Nezávislý referenční výpočet. Autor implementace ho nečte. |
| `.claude/agents/reviewer.md` | Adversariální reviewer: testy spustí, čísla přepočítá a vrátí PASS, nebo REJECT. |
| `CLAUDE.md` | Pravidla projektu pro agenta. |
| `state/split.md` | Stav smyčky, který přežije přestávku. |

## Větve

- `main`: výchozí stav. Spec, testy a reviewer, žádná implementace. Testy záměrně padají na chybějícím `src/splitBill.js`.
- `fix/splitbill`: výpočetní logika (`src/splitBill.js`) postavená podle briefu `.tasks/fix-splitbill.md`. Implementaci napsal Haiku, vypořádání code review Opus. Prochází 147 testů.
- `feature/ui`: webové rozhraní postavené souběžně podle `.tasks/feature-ui.md`.

V obou briefech je oddíl „Rozpory“ s nálezy, které spec ani testy zatím neřeší. Jsou tam záměrně jako ukázka toho, co najde review.

## Spuštění

```sh
npm ci
npm test
```
