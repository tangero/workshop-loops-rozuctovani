# Úkol: feature/ui

- **Větev:** `feature/ui`
- **Worktree:** `/Users/patrickzandl/GitHub/workshop-loops2-ui`
- **Model:** Haiku 5.5

## Kontext

Webová appka pro český trh rozdělí účet v restauraci mezi lidi u stolu. Jeden člověk zaplatí kartou a ostatní mu pošlou svůj podíl QR platbou. Appka je statická, bez serveru a bez účtů, a běží na jednom telefonu.

- Jediný zdroj pravdy je `spec-rev.md`. Pro tento úkol jsou důležité tyto kapitoly:
  - 4.1: čtyři obrazovky,
  - 4.2–4.3: lidé a položky,
  - 4.5: každá částka musí mít „Kč“,
  - 4.6: výsledek,
  - 4.7: číslo účtu,
  - 4.8: QR platba,
  - 5: datový model, `Bill` a `Settings`.
- Kontrakt výpočetních funkcí je v `tests/contract.ts`: `computeBill`, `parseAmount`, `formatCzk`, `toIban`, `spdPayload`. Přečti ho celý.
- Výpočetní logika (`src/splitBill.js`) vzniká **souběžně v jiné větvi**. V této větvi neexistuje a nesmíš ji vytvářet ani napodobovat. UI ji jen volá.

## Cíl

1. `src/ui/app.js` exportuje `createApp(root, api, storage)`:
   - `root` je DOM element,
   - `api` je objekt s pěti funkcemi z kontraktu,
   - `storage` je objekt s `getItem` a `setItem`, jako `localStorage`.
2. `src/ui/main.js` připojí skutečnou logiku `import * as api from "../splitBill.js"` a zavolá `createApp(document.getElementById("app"), api, window.localStorage)`.
3. `index.html` v kořeni s `<div id="app">` a `<script type="module" src="src/ui/main.js">`, česky (`lang="cs"`), viewport pro telefon.
4. `src/ui/styles.css`: jednoduché, čitelné na telefonu.
5. Čtyři obrazovky podle kap. 4.1:
   - **Kdo je u stolu:** jména, plátce, číslo účtu.
   - **Co jste měli:** položky, ťuknutí na jméno přepíná váhu 0 → 1 → 2 → 3 → 0, tlačítko „Všichni“ a pole „Sleva na celý účet“.
   - **Spropitné:** Bez / 5 / 10 / 15 % a pole „Zaplatíme celkem“.
   - **Kdo komu pošle:** karty s částkou a QR.
6. Vstupy částek převádí `api.parseAmount`. Zobrazení každé částky dělá `api.formatCzk`. Výsledek a chyby počítá `api.computeBill`. UI samo nic nepočítá.
7. Když `computeBill` vrátí `ok: false`, tlačítko Spočítat je neaktivní a u problému je česká hláška.
8. QR kód z textu `api.spdPayload(...)` vykresli knihovnou `qrcode-generator` (licence MIT) vloženou jako soubor do `src/ui/vendor/`. Nepoužívej CDN, appka musí jít offline. Když `api.toIban` vrátí `null`, místo QR zobraz přesně: „Pro QR platbu doplňte číslo účtu plátce.“
9. `Bill` a `Settings` ukládej do `storage` jako JSON. Každé čtení i zápis obal do `try/catch`. Když storage vyhodí chybu, appka funguje dál.
10. Testy v `tests/ui/*.test.js` (vitest a `happy-dom`, přidej je do `devDependencies`). V testech předávej **falešné `api`**, ne skutečnou logiku. Testy musí pokrýt:
    - průchod všemi čtyřmi obrazovkami,
    - chybu z `api.computeBill` (neaktivní Spočítat a viditelná hláška),
    - každá zobrazená částka ve výsledku končí na „Kč“,
    - výsledek bez platného čísla účtu ukáže text z bodu 8 a žádný QR,
    - `storage`, jehož `getItem` a `setItem` vyhazují chybu, appku neshodí.

### Pravidla

- V `src/ui/` žádná aritmetika nad částkami (`+`, `-`, `*`, `/` nad penězi), žádné `toFixed` ani `parseFloat`. Všechno jde přes `api`.
- Nesahej na `src/splitBill.js`, `tests/*.test.ts`, `tests/helpers/`, `tests/contract.ts` ani `spec-rev.md`.
- Měnit smíš jen `index.html`, `src/ui/**`, `tests/ui/**`, `package.json`, `package-lock.json` a tento soubor.
- `npm test` v této větvi padá kvůli chybějícímu `src/splitBill.js`. To je v pořádku a neopravuj to. Spouštěj jen `npx vitest run tests/ui`.
- Nepracuj na `main`. Nemerguj.

## Hotovo (stop condition, čte reviewer)

Úkol je hotový, jen když platí všechno:

1. `npx vitest run tests/ui` projde: 0 failed, 0 skipped.
2. UI testy obsahují všech pět scénářů z bodu 10. Ke každému je v PR název testu.
3. `grep -rnE "toFixed|parseFloat|Math\.round" src/ui --include=*.js --exclude-dir=vendor` nic nenajde.
4. `git diff main --stat` ukazuje jen povolené soubory z oddílu Pravidla.
5. Větev je nahraná na `origin` a existuje **draft** PR `feature/ui` → `main`. Jeho popis obsahuje reálný výstup `npx vitest run tests/ui`.

**Pojistka:** když po 3 pokusech nedokážeš splnit jeden bod, skonči. Commitni, co máš, otevři draft PR a do popisu napiš, co chybí a proč. Nic nemerguj.

## Rozpory

(zatím žádné)
