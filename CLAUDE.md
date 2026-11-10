# Rozúčtování účtu v restauraci

Statická webová appka pro český trh: rozdělí účet mezi lidi u stolu, jeden zaplatí kartou a ostatní mu pošlou podíl QR platbou.

## Pravidla

- Mluv a piš česky.
- Jediný zdroj pravdy je `spec.md`. Když se kód, testy a spec rozcházejí, platí spec.
- Kontrakt funkcí je v `tests/contract.ts`, implementace patří do `src/splitBill.js`.
- Testy (`tests/*.test.ts`) jsou napsané předem. **Neměň je.** Když podle tebe test odporuje specu, zapiš to do oddílu „Rozpory“ v briefu úkolu v `.tasks/`.
- `tests/helpers/oracle.ts` je nezávislý referenční výpočet. Autor implementace ho nečte.
- Částky jsou celá čísla v haléřích. Žádné `toFixed`, `parseFloat` ani `Math.round`.
- Každá částka, kterou ukazuješ člověku, má jednotku „Kč“.

## Smyčka

- Úkol je v `.tasks/<nazev>.md` a obsahuje stop condition a pojistku po 3 pokusech.
- Po každém kroku zapiš stav do `state/split.md`: co je hotové, co padá a jaký je další krok. Po přestávce nebo kompaktaci začni přečtením tohoto souboru.
- Hotovo je teprve tehdy, když prošla stop condition a agent `reviewer` vrátil `VERDICT: PASS`.

## Příkazy

- `npm ci`: instalace závislostí
- `npm test`: všechny testy (vitest a fast-check)
- `npx tsc --noEmit --strict --allowJs --checkJs false --target es2022 --module esnext --moduleResolution bundler --skipLibCheck tests/*.ts tests/helpers/*.ts`: typová kontrola
