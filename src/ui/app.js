import qrcode from "./vendor/qrcode.mjs";

// UI nic nepočítá s penězi. Všechny částky jdou přes api (parseAmount, formatCzk,
// computeBill, toIban, spdPayload). Výjimka: přepínání vah a počítadla id, to jsou
// celá čísla vah a položek, ne peníze.

const BILL_KEY = "rozuctovani.bill";
const SETTINGS_KEY = "rozuctovani.settings";
const MAX_PEOPLE = 30;
const MAX_ITEMS = 100;
const SCREEN_ORDER = ["people", "items", "tip", "result"];
const SCREEN_LABELS = {
  people: "1 Kdo",
  items: "2 Co",
  tip: "3 Spropitné",
  result: "4 Platby",
};
const SCREEN_TITLES = {
  people: "Kdo je u stolu",
  items: "Co jste měli",
  tip: "Spropitné",
  result: "Kdo komu pošle",
};

const INPUT_ERROR = "Zadejte částku v korunách, třeba 59,50.";
const NO_ACCOUNT = "Pro QR platbu doplňte číslo účtu plátce.";

const CODE_MESSAGES = {
  NO_PEOPLE: "Přidejte aspoň jednoho člověka u stolu.",
  TOO_MANY_PEOPLE: "Nejvýš 30 lidí.",
  EMPTY_NAME: "Jméno je povinné.",
  NAME_TOO_LONG: "Jméno smí mít nejvýš 30 znaků.",
  DUPLICATE_NAME: "Jméno už u stolu je, přidejte třeba iniciálu.",
  PAYER_INVALID: "Vyberte plátce ze seznamu lidí.",
  NO_ITEMS: "Přidejte aspoň jednu položku.",
  TOO_MANY_ITEMS: "Nejvýš 100 položek.",
  INVALID_PRICE: "Cena položky musí být mezi 0,01 Kč a 99 999,99 Kč.",
  ITEM_NO_PEOPLE: "Některá položka nemá žádného člověka. Označte ji.",
  INVALID_WEIGHT: "Váha musí být celé číslo od 1 do 9.",
  UNKNOWN_PERSON: "Některá váha patří osobě, která u stolu není.",
  INVALID_DISCOUNT: INPUT_ERROR,
  DISCOUNT_TOO_HIGH: "Sleva musí být menší než součet položek.",
  INVALID_TIP: "Spropitné může být 5, 10 nebo 15 %.",
  TOTAL_BELOW_BASE: "Celkem nemůže být méně než účet bez spropitného.",
  TOTAL_ABOVE_DOUBLE: "Spropitné by bylo vyšší než celý účet.",
};

const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

function loadJson(storage, key, fallback) {
  try {
    const raw = storage.getItem(key);
    if (raw == null) return fallback;
    const value = JSON.parse(raw);
    return value && typeof value === "object" ? value : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(storage, key, value) {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // Úložiště nejde: appka funguje dál, jen si nic nepamatuje.
  }
}

function qrSvg(text) {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 4, alt: "QR platba" });
}

export function createApp(root, api, storage) {
  let counter = 0;
  const nextId = (prefix) => `${prefix}${Date.now().toString(36)}${counter++}`;

  const settings = {
    account: "",
    payerName: "",
    ...loadJson(storage, SETTINGS_KEY, {}),
  };

  function newBill() {
    const people = settings.payerName
      ? [{ id: nextId("p"), name: settings.payerName }]
      : [];
    return {
      account: settings.account || undefined,
      people,
      payerId: people.length ? people[0].id : "",
      items: [],
      discount: 0,
      tip: { mode: "none" },
    };
  }

  function normalizeBill(raw) {
    if (!raw || !Array.isArray(raw.people)) return null;
    return {
      account: typeof raw.account === "string" && raw.account ? raw.account : undefined,
      people: raw.people.filter((p) => p && typeof p.id === "string"),
      payerId: typeof raw.payerId === "string" ? raw.payerId : "",
      items: (Array.isArray(raw.items) ? raw.items : [])
        .filter((it) => it && typeof it.id === "string")
        .map((it) => ({
          id: it.id,
          name: typeof it.name === "string" && it.name ? it.name : undefined,
          price: typeof it.price === "number" ? it.price : null,
          weights: it.weights && typeof it.weights === "object" ? { ...it.weights } : {},
        })),
      discount: typeof raw.discount === "number" ? raw.discount : 0,
      tip: raw.tip && typeof raw.tip === "object" ? raw.tip : { mode: "none" },
    };
  }

  let bill = normalizeBill(loadJson(storage, BILL_KEY, null)) || newBill();
  let screen = "people";
  let drafts = {};
  let formError = "";
  let confirmReset = false;
  let lastPersonId = null;

  function persist() {
    saveJson(storage, BILL_KEY, bill);
    saveJson(storage, SETTINGS_KEY, settings);
  }

  function toBill() {
    return {
      account: bill.account,
      people: bill.people.map((p) => ({ id: p.id, name: p.name })),
      payerId: bill.payerId,
      items: bill.items.map((it) => ({
        id: it.id,
        name: it.name,
        price: it.price,
        weights: { ...it.weights },
      })),
      discount: bill.discount,
      tip: bill.tip,
    };
  }

  function computeResult() {
    return api.computeBill(toBill());
  }

  function inputErrors() {
    const errors = [];
    if (bill.items.some((it) => it.price === null)) errors.push(INPUT_ERROR);
    if (bill.discount === null) errors.push(INPUT_ERROR);
    if (bill.tip.mode === "total" && bill.tip.total == null) errors.push(INPUT_ERROR);
    return errors;
  }

  function resultMessages(result) {
    if (result.ok) return [];
    const skip = new Set();
    if (bill.items.some((it) => it.price === null)) skip.add("INVALID_PRICE");
    if (bill.discount === null) skip.add("INVALID_DISCOUNT");
    if (bill.tip.mode === "total" && bill.tip.total == null) {
      skip.add("TOTAL_BELOW_BASE");
      skip.add("TOTAL_ABOVE_DOUBLE");
    }
    const messages = [];
    for (const { code } of result.errors) {
      if (skip.has(code)) continue;
      const text = CODE_MESSAGES[code] || "Zkontrolujte zadání.";
      if (!messages.includes(text)) messages.push(text);
    }
    return messages;
  }

  const nameOf = (id) => {
    const person = bill.people.find((p) => p.id === id);
    return person ? person.name : "";
  };

  const amt = (h) => `<span class="amount" data-amount>${esc(api.formatCzk(h))}</span>`;
  const plain = (h) => api.formatCzk(h).replace(/\s*Kč$/, "");

  function screenPeople() {
    const atLimit = bill.people.length >= MAX_PEOPLE;
    const newPersonValue = drafts.newPerson || "";
    const accountValue =
      drafts.account !== undefined ? drafts.account : bill.account || "";
    return `
      <h1>${SCREEN_TITLES.people}</h1>
      <div class="row">
        <input type="text" data-field="newPerson" maxlength="30" placeholder="Jméno" value="${esc(newPersonValue)}">
        <button type="button" data-action="add-person" ${atLimit ? "disabled" : ""}>Přidat</button>
      </div>
      ${atLimit ? '<p class="hint">Nejvýš 30 lidí</p>' : ""}
      ${formError ? `<p class="error">${esc(formError)}</p>` : ""}
      <ul class="list">
        ${bill.people
          .map((p) => {
            const isPayer = p.id === bill.payerId;
            return `<li>
              <span class="name">${esc(p.name)}</span>
              <button type="button" data-action="payer" data-id="${esc(p.id)}" aria-pressed="${isPayer}" class="${isPayer ? "on" : ""}">${isPayer ? "Plátce" : "Dělat plátcem"}</button>
              <button type="button" data-action="remove-person" data-id="${esc(p.id)}">Odebrat</button>
            </li>`;
          })
          .join("")}
      </ul>
      <label class="field">Číslo účtu plátce
        <input type="text" data-field="account" inputmode="text" placeholder="např. 123456789/0100 nebo CZ…" value="${esc(accountValue)}">
      </label>
      <button type="button" class="danger" data-action="reset">${confirmReset ? "Opravdu smazat účet?" : "Nový účet"}</button>`;
  }

  function screenItems(result) {
    const atLimit = bill.items.length >= MAX_ITEMS;
    const discountValue =
      drafts.discount !== undefined
        ? drafts.discount
        : bill.discount == null || bill.discount === 0
          ? ""
          : plain(bill.discount);
    return `
      <h1>${SCREEN_TITLES.items}</h1>
      ${result.ok ? `<p class="sum">Součet položek: ${amt(result.subtotal)}</p>` : ""}
      <label class="field">Sleva na celý účet (Kč, nepovinné)
        <input type="text" data-field="discount" inputmode="decimal" value="${esc(discountValue)}">
      </label>
      ${result.ok && result.discount !== 0 ? `<p class="sum">Po slevě: ${amt(result.base)}</p>` : ""}
      <ul class="items">
        ${bill.items
          .map((it) => {
            const incomplete = Object.keys(it.weights).length === 0;
            const priceValue =
              drafts["price:" + it.id] !== undefined
                ? drafts["price:" + it.id]
                : it.price == null
                  ? ""
                  : plain(it.price);
            const heavy = bill.people.filter((p) => (it.weights[p.id] || 0) > 0);
            return `<li class="item ${incomplete ? "warn" : ""}">
              <input type="text" data-field="itemName" data-id="${esc(it.id)}" maxlength="40" placeholder="Název (nepovinné)" value="${esc(it.name || "")}">
              <input type="text" data-field="price" data-id="${esc(it.id)}" inputmode="decimal" placeholder="Cena v Kč" value="${esc(priceValue)}">
              <div class="chips">
                ${bill.people
                  .map((p) => {
                    const w = it.weights[p.id] || 0;
                    return `<button type="button" data-action="toggle-weight" data-id="${esc(it.id)}" data-person="${esc(p.id)}" class="${w ? "on" : ""}">${esc(p.name)}${w ? " · " + w : ""}</button>`;
                  })
                  .join("")}
              </div>
              <div class="row">
                <button type="button" data-action="all-weights" data-id="${esc(it.id)}">Všichni</button>
                <button type="button" class="danger" data-action="remove-item" data-id="${esc(it.id)}">Smazat položku</button>
              </div>
              ${
                heavy.length
                  ? `<details><summary>Váhy 4 až 9</summary>
                      ${heavy
                        .map(
                          (p) => `<label class="field">${esc(p.name)}
                            <select data-field="weight" data-id="${esc(it.id)}" data-person="${esc(p.id)}">
                              ${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
                                .map((n) => `<option value="${n}" ${n === it.weights[p.id] ? "selected" : ""}>${n}</option>`)
                                .join("")}
                            </select></label>`,
                        )
                        .join("")}
                    </details>`
                  : ""
              }
            </li>`;
          })
          .join("")}
      </ul>
      <button type="button" data-action="add-item" ${atLimit ? "disabled" : ""}>Přidat položku</button>
      ${atLimit ? '<p class="hint">Nejvýš 100 položek</p>' : ""}`;
  }

  function screenTip(result) {
    const modes = [
      ["none", "Bez"],
      ["5", "5 %"],
      ["10", "10 %"],
      ["15", "15 %"],
    ];
    const current = bill.tip.mode === "percent" ? String(bill.tip.p) : bill.tip.mode;
    let totalValue;
    if (bill.tip.mode === "total") {
      totalValue =
        drafts.total !== undefined
          ? drafts.total
          : bill.tip.total == null
            ? ""
            : plain(bill.tip.total);
    } else {
      totalValue = result.ok ? plain(result.total) : "";
    }
    return `
      <h1>${SCREEN_TITLES.tip}</h1>
      <div class="seg">
        ${modes
          .map(
            ([mode, label]) =>
              `<button type="button" data-action="tip-mode" data-mode="${mode}" aria-pressed="${current === mode}" class="${current === mode ? "on" : ""}">${label}</button>`,
          )
          .join("")}
      </div>
      <label class="field">Zaplatíme celkem (Kč)
        <input type="text" data-field="total" inputmode="decimal" value="${esc(totalValue)}">
      </label>
      ${result.ok ? `<p class="sum">Spropitné: ${amt(result.tip)}</p>` : ""}
      ${result.ok && result.warnings.includes("TIP_OVER_30") ? '<p class="warning">Spropitné je přes 30 %. Je to správně?</p>' : ""}`;
  }

  function screenResult(result) {
    if (!result.ok) {
      return `<h1>${SCREEN_TITLES.result}</h1>
        <p class="hint">Výsledek se ještě nedá ukázat. Opravte hlášky nahoře.</p>`;
    }
    const iban = bill.account ? api.toIban(bill.account) : null;
    const payerName = nameOf(bill.payerId);
    const transfers = result.transfers.length
      ? result.transfers
          .map((t) => {
            const qr = iban
              ? `<div class="qr">${qrSvg(api.spdPayload({ iban, amount: t.amount, date: new Date() }))}</div>`
              : `<p class="warning">${NO_ACCOUNT}</p>`;
            return `<article class="card transfer">
              <h3>${esc(nameOf(t.from))} → ${esc(nameOf(t.to))}</h3>
              ${amt(t.amount)}
              ${qr}
            </article>`;
          })
          .join("")
      : `<p class="card">Celý účet platí ${esc(payerName)}, nikdo nic neposílá.</p>`;
    return `
      <h1>${SCREEN_TITLES.result}</h1>
      <section class="card total">
        <p>Celkem k zaplacení</p>
        ${amt(result.total)}
        <p class="small">Závazná je celková částka.</p>
      </section>
      <h2>Podíly</h2>
      <ul class="list">
        ${result.shares
          .map((s) => {
            const who = esc(nameOf(s.personId)) + (s.personId === bill.payerId ? " (plátce)" : "");
            return `<li><span class="name">${who}</span>${s.amount > 0 ? amt(s.amount) : "<span>nic neplatí</span>"}</li>`;
          })
          .join("")}
      </ul>
      <h2>Kdo komu pošle</h2>
      ${transfers}`;
  }

  function nav(result, canCompute) {
    const index = SCREEN_ORDER.indexOf(screen);
    const back = index > 0 ? '<button type="button" data-action="prev">Zpět</button>' : "";
    let forward = "";
    if (screen === "people" || screen === "items") {
      forward = '<button type="button" data-action="next">Dál</button>';
    } else if (screen === "tip") {
      forward = `<button type="button" data-action="compute" ${canCompute ? "" : "disabled"}>Spočítat</button>`;
    }
    const steps = SCREEN_ORDER.map(
      (key) =>
        `<button type="button" data-action="go" data-screen="${key}" aria-current="${key === screen ? "step" : "false"}" class="${key === screen ? "on" : ""}">${SCREEN_LABELS[key]}</button>`,
    ).join("");
    return `<nav class="steps">${steps}</nav><div class="actions">${back}${forward}</div>`;
  }

  function fieldKey(el) {
    return [el.dataset.field, el.dataset.id || "", el.dataset.person || ""].join("|");
  }

  function captureFocus() {
    const active = root.ownerDocument.activeElement;
    if (!active || !active.dataset || !active.dataset.field || !root.contains(active)) return null;
    return { key: fieldKey(active), start: active.selectionStart, end: active.selectionEnd };
  }

  function restoreFocus(saved) {
    if (!saved) return;
    const el = [...root.querySelectorAll("[data-field]")].find((e) => fieldKey(e) === saved.key);
    if (!el) return;
    el.focus();
    try {
      if (saved.start != null) el.setSelectionRange(saved.start, saved.end);
    } catch {
      // Ne každý prvek výběr podporuje.
    }
  }

  function render() {
    persist();
    const saved = captureFocus();
    const result = computeResult();
    const inputs = inputErrors();
    const canCompute = result.ok && inputs.length === 0;
    const messages = [...inputs, ...resultMessages(result)];
    let body = "";
    if (screen === "people") body = screenPeople();
    else if (screen === "items") body = screenItems(result);
    else if (screen === "tip") body = screenTip(result);
    else body = screenResult(result);

    root.innerHTML = `<main class="app">
      ${body}
      ${messages.length ? `<div class="errors" role="alert"><ul>${messages.map((m) => `<li>${esc(m)}</li>`).join("")}</ul></div>` : ""}
      ${nav(result, canCompute)}
    </main>`;
    restoreFocus(saved);
  }

  function goTo(next) {
    screen = next;
    drafts = {};
    formError = "";
    confirmReset = false;
  }

  function handleAction(action, data) {
    if (action !== "reset") confirmReset = false;
    const index = SCREEN_ORDER.indexOf(screen);
    switch (action) {
      case "go":
        goTo(data.screen);
        break;
      case "next":
        goTo(SCREEN_ORDER[Math.min(index + 1, SCREEN_ORDER.length - 1)]);
        break;
      case "prev":
        goTo(SCREEN_ORDER[Math.max(index - 1, 0)]);
        break;
      case "add-person": {
        const name = (drafts.newPerson || "").trim();
        if (!name) {
          formError = "Jméno je povinné.";
          break;
        }
        if (name.length > 30) {
          formError = "Jméno smí mít nejvýš 30 znaků.";
          break;
        }
        const lower = name.toLowerCase();
        if (bill.people.some((p) => p.name.toLowerCase() === lower)) {
          formError = "Jméno už u stolu je, přidejte třeba iniciálu.";
          break;
        }
        if (bill.people.length >= MAX_PEOPLE) break;
        const id = nextId("p");
        bill.people.push({ id, name });
        if (!bill.payerId) bill.payerId = id;
        settings.payerName = bill.people[0].name;
        drafts.newPerson = "";
        formError = "";
        break;
      }
      case "remove-person": {
        bill.people = bill.people.filter((p) => p.id !== data.id);
        bill.items.forEach((it) => {
          delete it.weights[data.id];
        });
        if (bill.payerId === data.id) bill.payerId = bill.people.length ? bill.people[0].id : "";
        if (lastPersonId === data.id) lastPersonId = null;
        if (bill.people.length) settings.payerName = bill.people[0].name;
        break;
      }
      case "payer":
        bill.payerId = data.id;
        break;
      case "add-item": {
        if (bill.items.length >= MAX_ITEMS) break;
        const weights = {};
        const predefined =
          bill.items.length > 0 && lastPersonId && bill.people.some((p) => p.id === lastPersonId);
        if (predefined) weights[lastPersonId] = 1;
        bill.items.push({ id: nextId("i"), name: undefined, price: null, weights });
        break;
      }
      case "remove-item":
        bill.items = bill.items.filter((it) => it.id !== data.id);
        break;
      case "toggle-weight": {
        const item = bill.items.find((it) => it.id === data.id);
        if (!item) break;
        const current = item.weights[data.person] || 0;
        const next = current >= 3 ? 0 : current + 1;
        if (next === 0) {
          delete item.weights[data.person];
        } else {
          item.weights[data.person] = next;
          lastPersonId = data.person;
        }
        break;
      }
      case "all-weights": {
        const item = bill.items.find((it) => it.id === data.id);
        if (!item) break;
        bill.people.forEach((p) => {
          item.weights[p.id] = 1;
        });
        break;
      }
      case "tip-mode": {
        delete drafts.total;
        if (data.mode === "none") bill.tip = { mode: "none" };
        else bill.tip = { mode: "percent", p: Number(data.mode) };
        break;
      }
      case "compute": {
        const result = computeResult();
        if (result.ok && inputErrors().length === 0) goTo("result");
        break;
      }
      case "reset":
        if (!confirmReset) {
          confirmReset = true;
          break;
        }
        bill = newBill();
        lastPersonId = null;
        goTo("people");
        break;
      default:
        return false;
    }
    return true;
  }

  function handleField(field, value, data) {
    switch (field) {
      case "newPerson":
        drafts.newPerson = value;
        return false; // jen uložit koncept, bez překreslení kvůli fokusu
      case "itemName": {
        const item = bill.items.find((it) => it.id === data.id);
        if (item) item.name = value || undefined;
        break;
      }
      case "price": {
        const item = bill.items.find((it) => it.id === data.id);
        drafts["price:" + data.id] = value;
        if (item) item.price = api.parseAmount(value);
        break;
      }
      case "discount":
        drafts.discount = value;
        bill.discount = value.trim() === "" ? 0 : api.parseAmount(value);
        break;
      case "total":
        drafts.total = value;
        bill.tip = { mode: "total", total: api.parseAmount(value) };
        break;
      case "account": {
        drafts.account = value;
        const iban = api.toIban(value);
        bill.account = iban || undefined;
        if (iban) settings.account = iban;
        break;
      }
      case "weight": {
        const item = bill.items.find((it) => it.id === data.id);
        if (!item) return false;
        const w = Number(value);
        if (w === 0) delete item.weights[data.person];
        else item.weights[data.person] = w;
        break;
      }
      default:
        return false;
    }
    return true;
  }

  root.addEventListener("click", (event) => {
    const el = event.target && event.target.closest ? event.target.closest("[data-action]") : null;
    if (!el || el.disabled) return;
    if (handleAction(el.dataset.action, { ...el.dataset })) render();
  });

  root.addEventListener("input", (event) => {
    const el = event.target;
    if (!el || !el.dataset || !el.dataset.field) return;
    if (handleField(el.dataset.field, el.value, { ...el.dataset })) render();
    else persist();
  });

  root.addEventListener("change", (event) => {
    const el = event.target;
    if (!el || !el.dataset || el.dataset.field !== "weight") return;
    if (handleField("weight", el.value, { ...el.dataset })) render();
  });

  render();
}
