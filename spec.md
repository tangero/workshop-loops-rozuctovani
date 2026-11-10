# Spec: Rozúčtování účtu v restauraci

Webová appka pro český trh. Jeden člověk zaplatí účet kartou, appka spočítá, kolik mu má každý další poslat, a ukáže každému QR platbu. Běží na jednom telefonu, bez serveru a bez účtů.

Zdroj rozhodnutí: stránka Rozhodnutí o rozúčtování (https://claude.ai/artifact/Wxuk5wpYDsvGso32qfUQYA). Značka (R1) až (R10) odkazuje na rozhodnutí tam. Značka **[návrh]** označuje pravidlo, které doplnil Claude a uživatel ho zatím nepotvrdil. Návrhy z kol 1–3 uživatel potvrdil 2026-10-13.

Pořadí kapitol odpovídá tomu, jak pravděpodobně se budou měnit. Nahoře jsou výpočetní pravidla, rozsah a vše, co uživatel vidí, dole mechanika.

---

## 1. Výpočetní pravidla

### 1.1 Jednotky
Všechny částky jsou celá čísla v haléřích (1 Kč = 100 haléřů). Desetinná čísla (float) se pro peníze nepoužívají nikde, ani v mezivýpočtech.

### 1.2 Útrata osoby
Položka má cenu `c` a váhy `w_o` (celé číslo 1–9) pro lidi, kteří ji měli. Kdo položku neměl, váhu nemá. Útrata osoby je přesný zlomek:

    U_o = Σ přes položky, kde o má váhu ( c × w_o / Σ w položky )

Útrata se nezaokrouhluje. (R6)

### 1.3 Sleva na celý účet a základ spropitného
- Součet položek je `S₀ = Σ c` přes všechny položky, ceny jak jsou na účtence včetně DPH.
- Sleva na celý účet `D` je částka v haléřích, výchozí 0. Platí `0 ≤ D < S₀`. **[návrh]**
- Základ spropitného je částka po slevě `S = S₀ − D`, tedy to, co se skutečně platí (R3).
- Sleva se zadává jen v korunách. Procentní slevu si uživatel přepočítá sám, slevu na jednu položku zadá jako nižší cenu položky. **[návrh]**

### 1.4 Spropitné
Uživatel spropitné zadá jedním ze tří režimů (R4). Uloží se režim a zadaná hodnota, ne výsledná částka, takže se po změně položek spropitné přepočítá samo.

| Režim | Vstup | Spropitné `T` |
|---|---|---|
| Bez | – | `T = 0` |
| Procento | `p` ∈ {5, 10, 15} | `T = ⌊(S × p + 50) / 100⌋`, tj. na haléř, polovina nahoru |
| Celkem | `C` v haléřích | `T = C − S` |

- V režimu Celkem musí platit `S ≤ C ≤ 2 × S`.
  - Při `C < S` appka výsledek neukáže a hlásí: „Celkem nemůže být méně než účet bez spropitného (1 089,00 Kč).“ To platí i ve chvíli, kdy uživatel přidá nebo zdraží položku nebo sníží slevu až po zadání `C`.
  - Při `C > 2 × S` hlásí: „Spropitné by bylo vyšší než celý účet.“
- Je-li `10 × T > 3 × S` (spropitné přes 30 %), appka zobrazí upozornění „Spropitné je přes 30 %. Je to správně?“. Upozornění nic neblokuje.
- Výchozí režim je Bez.
- Přepínání režimů: ťuknutí na Bez / 5 / 10 / 15 % nastaví ten režim. Psaní do pole „Zaplatíme celkem“ nastaví režim Celkem. V režimech Bez a Procento pole „Zaplatíme celkem“ jen ukazuje `P` a v režimu Celkem není vybraná žádná procentní volba.

### 1.5 Podíl osoby
Celkem k zaplacení je `P = S + T = S₀ − D + T`. Přesný podíl osoby je zlomek:

    q_o = P × U_o / S₀

Sleva i spropitné se tím rozpouštějí podle útraty, přepínač neexistuje (R5). Kdo utratil víc, dostane i větší díl slevy. **[návrh]** Protože každá položka má cenu větší než 0 a `D < S₀`, je `S₀ > 0` i `S > 0` vždy, když se výpočet spouští (kap. 1.8).

### 1.6 Zaokrouhlení
Zaokrouhluje se jednou, až na konci, metodou největšího zbytku (R1):
1. Každému se `q_o` zaokrouhlí dolů na celý haléř: `f_o = ⌊q_o⌋`.
2. Spočítá se zbytek `r = P − Σ f_o`. Vždy platí `0 ≤ r < počet lidí`.
3. Lidé se seřadí podle desetinné části `q_o − f_o` sestupně, při shodě podle pořadí v seznamu lidí (R2). Prvních `r` lidí dostane +1 haléř.

Kdo má `U_o = 0`, má desetinnou část 0 a haléř nikdy nedostane. Součet kladných desetinných částí je `r`, takže kladnou desetinnou část má vždy víc než `r` lidí.

### 1.7 Převody
Každý kromě plátce, kdo má podíl větší než 0, pošle plátci svůj podíl. Plátce svůj podíl vidí jen pro informaci, sám sobě nic neposílá (R7).

### 1.8 Kdy se výpočet spouští
Výsledek se ukáže, jen když platí všechno z tohoto:
- u stolu je aspoň 1 člověk a jeden z nich je plátce,
- je zadaná aspoň 1 položka,
- každá položka má cenu větší než 0 Kč a aspoň jednoho člověka,
- sleva splňuje `0 ≤ D < S₀`, jinak hláška „Sleva musí být menší než součet položek (1 289,00 Kč).“ To platí i ve chvíli, kdy položka zmizí nebo zlevní až po zadání slevy,
- v režimu Celkem platí `S ≤ C ≤ 2 × S` (kap. 1.4).

Jinak tlačítko Spočítat není aktivní a appka u problému napíše, co je potřeba opravit.

---

## 2. Invarianty

Platí pro libovolný platný vstup podle kap. 1.8. Testují se property-based testy na náhodných vstupech (kap. 7).

Každý invariant je zapsaný dvakrát: česky pro lidi a formálně pro testy. Oba zápisy říkají totéž. Při změně se mění oba současně.

| # | Vždy musí platit, že… | Formálně |
|---|---|---|
| I1 | podíly všech lidí dají dohromady přesně celkovou částku k zaplacení, na haléř. | `Σ podíl_o = P` |
| I2 | se podíl každého člověka liší od jeho přesného, nezaokrouhleného podílu o méně než jeden haléř. | `⌊q_o⌋ ≤ podíl_o ≤ ⌊q_o⌋ + 1` pro každé `o` |
| I3 | nikdo nemá záporný podíl a kdo nic neměl, neplatí nic. | `podíl_o ≥ 0` a `U_o = 0 ⇒ podíl_o = 0` |
| I4 | spropitné není záporné ani vyšší než účet po slevě, takže celková částka je nejvýš dvojnásobek účtu po slevě. | `0 ≤ T ≤ S`, tedy `S ≤ P ≤ 2 × S` |
| I5 | stejné zadání dá vždy stejný výsledek a na pořadí položek nezáleží. | výsledek je funkce vstupu, invariantní vůči permutaci `items` |
| I6 | převody dají dohromady celkovou částku bez podílu plátce, nikdo neposílá peníze sám sobě a žádný převod není na 0,00 Kč. | `Σ převodů = P − podíl_plátce`, žádný převod `plátce → plátce`, každý převod `> 0` |
| I7 | když má každou položku jen jeden člověk a není sleva ani spropitné, platí každý přesně svou útratu bez zaokrouhlování. | každá položka má 1 osobu, `D = 0`, `T = 0` ⇒ `podíl_o = U_o` |
| I8 | přeházení pořadí lidí změní komukoli podíl nejvýš o jeden haléř. | pro permutaci `people`: `podíl'_o − podíl_o ∈ {−1, 0, 1}` |
| I9 | vynásobení všech vah u jedné položky stejným číslem výsledek nezmění, pokud váhy zůstanou v rozsahu 1–9. | `w_o → k × w_o` pro všechna `o` jedné položky, `k × w_o ≤ 9` ⇒ výsledek beze změny |
| I10 | sleva 0 Kč dá přesně stejný výsledek jako zadání bez slevy. | `D = 0` ⇒ výsledek shodný s výpočtem bez slevy |
| I11 | vyšší sleva při jinak stejném zadání nikomu nezvýší podíl o víc než jeden haléř. | `D' > D` ⇒ `podíl'_o ≤ podíl_o + 1` pro každé `o` |
---

## 3. Rozsah verze 1

### 3.1 Co verze 1 umí
- Jeden účet najednou, jeden plátce, 1–30 lidí, 1–100 položek.
- Jen CZK (R10) a jen české bankovní účty.
- Sdílení položky mezi libovolné lidi s násobky 1–9 (R6).
- Spropitné procentem nebo cílovou částkou (R4).
- Sleva na celý účet zadaná v korunách (kap. 1.3).

### 3.2 Co verze 1 vědomě neumí
| Co | Proč a jak to uživatel obejde |
|---|---|
| Sleva v procentech | Uživatel si ji přepočítá na koruny. |
| Sleva jen pro některé lidi | Sleva na celý účet se vždy rozpustí na celý stůl podle útraty. Slevu na jednu položku jde zadat nižší cenou položky. |
| Víc plátců | Mimo (R7). |
| Synchronizace mezi telefony, účty, server | Mimo (R8). |
| Cizí měny | Mimo (R10). |
| Zaokrouhlení pro hotovost | Appka počítá na haléř, hotově platící si zaokrouhlí sám (R9). |
| Focení účtenky (OCR) | Mimo. |
| Historie účtů | Pamatuje se jen rozpracovaný účet (kap. 5). |
| Zahraniční účty (IBAN mimo CZ) | Mimo. |
| Jiný jazyk než čeština | Rozhraní je jen česky. |
| Poslání výsledku zprávou nebo odkazem | Výsledek se předává jen ukázáním displeje a QR kódy. |
| Víc než 30 lidí nebo 100 položek | Tlačítko Přidat přestane být aktivní. |

---

## 4. Co uživatel vidí

### 4.1 Obrazovky
1. **Kdo je u stolu**: jména, označení plátce, číslo účtu plátce.
2. **Co jste měli**: položky s cenou a lidmi, průběžný součet. Pod součtem je nepovinné pole „Sleva na celý účet“ a po jejím zadání řádek „Po slevě: 1 089,00 Kč“.
3. **Spropitné**: volby Bez / 5 / 10 / 15 % a pole „Zaplatíme celkem“.
4. **Kdo komu pošle**: karta s částkou a QR platbou pro každého, kdo něco posílá, a podíl plátce.

Mezi obrazovkami jde kdykoli zpět. Každá změna výsledek přepočítá.

### 4.2 Lidé
- Jméno je povinné, ořezané o mezery, nejvýš 30 znaků.
- Dvě stejná jména (bez ohledu na velikost písmen) appka nepřijme: „Jméno už u stolu je, přidejte třeba iniciálu.“
- Nový účet předvyplní první osobu jménem ze `Settings.payerName` (pokud je uložené) a ta je plátce. Plátce jde přepnout na kohokoli ze seznamu, nikdo jiný plátcem být nemůže.
- Odebrání osoby smaže její váhy ze všech položek. Položka, které nezůstane nikdo, se zvýrazní jako neúplná. Odebrání plátce udělá plátcem první osobu v seznamu.

### 4.3 Položky
- Cena je povinná, název nepovinný (nejvýš 40 znaků).
- Ťuknutí na jméno u položky přepíná váhu 0 → 1 → 2 → 3 → 0. Váhy 4–9 se zadají v detailu položky.
- Nová položka má předvybraného člověka, kterého uživatel naposledy přidal k předchozí položce, s váhou 1. První položka účtu nemá předvybraného nikoho. Tlačítko „Všichni“ nastaví všem váhu 1.

### 4.4 Zadávání částek
Platí pro cenu položky, slevu i pro „Zaplatíme celkem“:
- Přijímá číslice, jeden desetinný oddělovač (čárka nebo tečka) a nejvýš 2 desetinná místa. Mezery se ignorují. „59“, „59,5“, „59,50“, „1 289“, „59,“ (= 59,00) i „,50“ (= 0,50) jsou platné.
- Neplatné je cokoli jiného: znaménko mínus, písmena, víc oddělovačů, víc než 2 desetinná místa, prázdné pole. Appka hlásí „Zadejte částku v korunách, třeba 59,50.“
- Cena položky musí být mezi 0,01 Kč a 99 999,99 Kč. Meze pro slevu jsou v kap. 1.3, pro „Zaplatíme celkem“ v kap. 1.4. Prázdné pole slevy znamená 0,00 Kč.

### 4.5 Formát částek
Každá částka se zobrazuje s měnou, vždy se 2 desetinnými místy: `1 289,00 Kč`. Oddělovač tisíců je nezlomitelná mezera, desetinný oddělovač čárka. Zlomky haléře se uživateli neukazují.

Zaokrouhlení jen pro zobrazení (nikdy nevstupuje do výpočtu):
- mezisoučty v rozpadu (kap. 4.6) na haléř, polovina nahoru,
- procento spropitného v režimu Celkem na 1 desetinné místo, polovina nahoru: `111,00 Kč · 8,6 %`.

### 4.6 Výsledek
- Karta pro každou osobu kromě plátce s podílem > 0: jméno, „→ plátce“, částka, QR platba. Ťuknutí ukáže rozpad: položky osoby, podíl na sdílených, díl slevy se znaménkem mínus (např. „−72,72 Kč“), spropitné.
- Mezisoučty v rozpadu jsou zaokrouhlené jen pro zobrazení a nemusí dát přesně podíl. Pod rozpadem stojí: „Závazná je celková částka.“
- Osoba s podílem 0 má řádek „nic neplatí“.
- Při 1 osobě nebo když všichni kromě plátce mají podíl 0: „Celý účet platí {jméno}, nikdo nic neposílá.“

### 4.7 Číslo účtu plátce
- Přijímá český formát `předčíslí-číslo/kód banky` i IBAN začínající `CZ`. Formát se ověří (kontrolní součet), český formát se převede na IBAN.
- Pole je předvyplněné posledním použitým účtem ze `Settings.account`. Když platí někdo jiný než obvykle, účet se přepíše a nový se uloží jako poslední použitý.
- Bez platného účtu se výsledek ukáže, ale místo QR kódu je text „Pro QR platbu doplňte číslo účtu plátce.“

### 4.8 QR platba
Formát SPD 1.0 (český standard QR Platba):

    SPD*1.0*ACC:{IBAN}*AM:{částka}*CC:CZK*MSG:{zpráva}

- `AM` je částka s tečkou a 2 desetinnými místy, bez mezer: `509.02`.
- `MSG` je `Utrata DD.MM.RRRR` bez diakritiky, aby ji zpracovala každá banka.

---

## 5. Datový model

    Bill {
      account:  string?                           // IBAN plátce tohoto účtu
      people:   [{ id, name }]                    // pořadí = tie-break (R2)
      payerId:  id                                // vždy id z people
      items:    [{ id, name?, price, weights }]   // price v haléřích > 0
                                                  // weights: { personId: 1–9 }
      discount: int                               // sleva v haléřích, 0 = bez slevy
      tip:      { mode: "none" }
              | { mode: "percent", p: 5 | 10 | 15 }
              | { mode: "total", total }          // haléře
    }
    Settings {
      account:   string                           // naposledy použitý IBAN
      payerName: string                           // jméno první osoby pro nový účet
    }

- Telefon drží jeden rozpracovaný `Bill` a jedno `Settings`. „Nový účet“ smaže `Bill`, `Settings` nechá.
- Výsledek (podíly, převody) se neukládá, vždy se počítá z `Bill`.

---

## 6. Hraniční případy

| Případ | Vstup | Očekávaný výsledek |
|---|---|---|
| 0 lidí | prázdný seznam | Nejde pokračovat z obrazovky 1, Spočítat není aktivní. |
| 1 člověk | Anna, položka 289,00 Kč, 10 % | `T = 28,90 Kč`, podíl 317,90 Kč, „Celý účet platí Anna, nikdo nic neposílá.“ |
| 100 / 3 | 1 položka 100,00 Kč, 3 lidé po váze 1, Bez | Přesně 33,333… Kč každému, dolů 3 × 33,33 = 99,99 Kč, `r = 1`, shodné zbytky → první v seznamu: **33,34 / 33,33 / 33,33 Kč**. |
| Záporný vstup | „-50“ | Neplatná částka, hláška z kap. 4.4. |
| Nulová cena | „0“ nebo „0,00“ | Neplatná, cena musí být aspoň 0,01 Kč. |
| Moc desetinných míst | „12,345“ | Neplatná částka. |
| Celkem méně než součet | součet 1 289,00 Kč, Celkem 1 200 Kč | Hláška z kap. 1.4, výsledek se neukáže. |
| Celkem rovno součtu | Celkem = `S` | `T = 0`, platné. |
| Položka bez lidí | po odebrání osoby | Položka zvýrazněná, Spočítat není aktivní. |
| Osoba bez útraty | Dana nic neměla | Podíl 0,00 Kč, žádný převod, „nic neplatí“. |
| Plátce bez útraty | Cyril platil, nic neměl | Ostatní mu pošlou celé `P`. |
| Násobky | víno 230,00 Kč, Anna 2×, Bára 1× | `U` = 153,33… Kč a 76,66… Kč, zaokrouhlí se až na konci. |
| Horní mez | 30 lidí, 100 položek po 99 999,99 Kč | Výpočet proběhne přesně (kap. 7). |
| Nad limit | 31. člověk, 101. položka | Tlačítko Přidat není aktivní, u něj text „Nejvýš 30 lidí“ / „Nejvýš 100 položek“. |
| Sleva | položky jako v návrhu (součet 1 289,00 Kč, víno Anna 2× a Bára 1×), sleva 200 Kč, spropitné 10 % | `S` = 1 089,00 Kč, `T` = 108,90 Kč, `P` = 1 197,90 Kč. Podíly **435,54 / 368,94 / 393,42 Kč**, zbytkový haléř dostane Cyril. |
| Sleva rovna součtu | součet 1 289,00 Kč, sleva 1 289 Kč | Hláška z kap. 1.8, výsledek se neukáže. |
| Záporná sleva | „-200“ | Neplatná částka, hláška z kap. 4.4. |
| Sleva a Celkem | součet 1 289,00 Kč, sleva 200 Kč, Celkem 1 100 Kč | Meze se počítají z částky po slevě: 1 089,00 Kč ≤ 1 100 Kč ≤ 2 178,00 Kč, `T` = 11,00 Kč. |
| Celkem nad dvojnásobek | součet 1 289,00 Kč, Celkem 3 000 Kč | Hláška z kap. 1.4, výsledek se neukáže. |
| Procento s půlkou haléře | součet 10,10 Kč, 5 % | Přesně 0,505 Kč, polovina nahoru → `T = 0,51 Kč`, `P = 10,61 Kč`. |

---

## 7. Mechanika

- Statická webová appka (HTML, CSS, JavaScript v ES modulech, typy přes JSDoc), bez backendu. Výpočetní logika je v `src/splitBill.js`, kontrakt v `tests/contract.ts`.
- Zlomky (`U_o`, `q_o`) se počítají přesně v `BigInt` jako čitatel a jmenovatel. Jmenovatel může být součin součtů vah, proto ne `number`.
- Uložení `Bill` a `Settings` v `localStorage`. Když úložiště nejde, appka funguje dál, jen si nic nepamatuje.
- Po prvním načtení funguje offline (service worker).
- Testy:
  - jednotkové testy všech řádků tabulky v kap. 6,
  - property-based testy invariantů I1–I11 na náhodných vstupech v mezích kap. 3.1,
  - test parseru částek a převodu čísla účtu na IBAN.
- Hosting: libovolný statický hosting.

---

## Revize

| Kolo | Co se změnilo | Proč |
|---|---|---|
| 1 | Přidány invarianty (kap. 2), hraniční případy (kap. 6), rozsah (kap. 3), pravidla vstupu (kap. 4.4), validace (kap. 1.8). Spropitné se ukládá jako režim a hodnota. | Verze 1 neprošla žádným bodem rubriky. |
| 2 | Horní mez Celkem změněna na `2 × S`. Doplněno přepínání režimů, zaokrouhlení pro zobrazení, vstup „,50“, limity a jazyk v rozsahu. | Pevná mez Celkem byla menší než možný součet položek. Několik pravidel uživatel vidí, ale nebyla popsaná. |
| 3 | Číslo účtu patří k účtu, `Settings` jen předvyplňuje. Upřesněn plátce a předvýběr u nové položky. I4 zpřísněn na `T ≤ S`. Podmínka v kap. 1.8 sjednocena s kap. 1.4. | Pamatovaný účet by tiše poslal peníze majiteli telefonu, i když platil někdo jiný. Kap. 1.8 a 1.4 si odporovaly v mezi pro Celkem. |
| 4 | Přidána sleva na celý účet v korunách (kap. 1.3), rozpouští se podle útraty a podíl se počítá z útraty před slevou. Nové invarianty I10 a I11, nové hraniční případy. U potvrzených pravidel odstraněna značka [návrh]. | Uživatel slevu požadoval a potvrdil návrhy z kol 1–3. |
| 5 | Invarianty v kap. 2 dostaly vedle formálního zápisu i český zápis. Obsah se nezměnil. | Uživatel invarianty schválil a chtěl je mít čitelné bez vzorců. |
| 6 | Kap. 7 sjednocena se zbytkem specu a s kontraktem: JavaScript místo TypeScriptu, invarianty I1–I11. Spec přejmenován na `spec.md`. | Kap. 7 zůstala po kole 4 pozadu a odporovala kontraktu i testům. |
