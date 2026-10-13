// Pomocné funkce pro UI testy. Logika výpočtu tu NENÍ: falešné api jen vrací
// předpřipravené výsledky, aby se testovalo jen UI.

export const IBAN = "CZ6508000000192000145399";

export function fakeApi(overrides = {}) {
  const api = {
    computeBill(bill) {
      if (bill.people.length === 0) return { ok: false, errors: [{ code: "NO_PEOPLE" }] };
      if (bill.items.length === 0) return { ok: false, errors: [{ code: "NO_ITEMS" }] };
      if (bill.items.some((it) => it.price === null)) {
        const it = bill.items.find((i) => i.price === null);
        return { ok: false, errors: [{ code: "INVALID_PRICE", itemId: it.id }] };
      }
      const subtotal = bill.items.reduce((sum, it) => sum + it.price, 0);
      const base = subtotal - bill.discount;
      const payer = bill.payerId;
      const shares = bill.people.map((p) => ({ personId: p.id, amount: p.id === payer ? 0 : 1000 }));
      const transfers = shares
        .filter((s) => s.amount > 0 && s.personId !== payer)
        .map((s) => ({ from: s.personId, to: payer, amount: s.amount }));
      return {
        ok: true,
        subtotal,
        discount: bill.discount,
        base,
        tip: 0,
        total: base,
        shares,
        transfers,
        warnings: [],
      };
    },
    parseAmount(input) {
      const t = String(input).replace(/\s/g, "").replace(",", ".");
      if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
      return Math.round(Number(t) * 100);
    },
    formatCzk(haler) {
      return `${(haler / 100).toFixed(2).replace(".", ",")} Kč`;
    },
    toIban(input) {
      return /^CZ\d{22}$/.test(input) ? input : null;
    },
    spdPayload({ iban, amount, date }) {
      return `SPD*1.0*ACC:${iban}*AM:${amount}*CC:CZK*MSG:Utrata ${date.getDate()}`;
    },
  };
  return { ...api, ...overrides };
}

export function memoryStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
  };
}

export function mount() {
  const root = document.createElement("div");
  document.body.appendChild(root);
  return root;
}

export function click(root, selector, text) {
  const el = [...root.querySelectorAll(selector)].find(
    (e) => text === undefined || e.textContent.trim() === text,
  );
  if (!el) throw new Error(`Nenalezen prvek ${selector} ${text ?? ""}`);
  el.click();
  return el;
}

export function clickAction(root, action, data = {}) {
  const selector = `[data-action="${action}"]` +
    Object.entries(data).map(([k, v]) => `[data-${k}="${v}"]`).join("");
  const el = root.querySelector(selector);
  if (!el) throw new Error(`Nenalezena akce ${selector}`);
  el.click();
  return el;
}

export function type(root, field, value, data = {}) {
  const selector = `[data-field="${field}"]` +
    Object.entries(data).map(([k, v]) => `[data-${k}="${v}"]`).join("");
  const el = root.querySelector(selector);
  if (!el) throw new Error(`Nenalezeno pole ${selector}`);
  el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  return el;
}

export function heading(root) {
  return root.querySelector("h1")?.textContent.trim();
}

export function goTo(root, screen) {
  clickAction(root, "go", { screen });
}
