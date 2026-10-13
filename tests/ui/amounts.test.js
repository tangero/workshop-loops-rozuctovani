// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { createApp } from "../../src/ui/app.js";
import { fakeApi, memoryStorage, mount, clickAction, type, click, IBAN } from "./helpers.js";

describe("formát částek", () => {
  it("každá částka ve výsledku končí na Kč", () => {
    const root = mount();
    createApp(root, fakeApi(), memoryStorage());

    type(root, "newPerson", "Anna");
    clickAction(root, "add-person");
    type(root, "newPerson", "Bára");
    clickAction(root, "add-person");
    type(root, "account", IBAN);
    clickAction(root, "next");

    clickAction(root, "add-item");
    const itemId = root.querySelector('[data-field="price"]').dataset.id;
    type(root, "price", "1 289,00", { id: itemId });
    click(root, '[data-action="toggle-weight"]', "Bára");
    clickAction(root, "next");
    clickAction(root, "prev");
    type(root, "discount", "200");
    clickAction(root, "next");
    clickAction(root, "compute");

    const amounts = [...root.querySelectorAll("[data-amount]")];
    expect(amounts.length).toBeGreaterThan(0);
    for (const el of amounts) {
      expect(el.textContent.trim().endsWith("Kč")).toBe(true);
    }
  });
});
