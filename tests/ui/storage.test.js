// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { createApp } from "../../src/ui/app.js";
import { fakeApi, mount, clickAction, type, click, heading, goTo } from "./helpers.js";

const brokenStorage = {
  getItem() {
    throw new Error("úložiště nedostupné");
  },
  setItem() {
    throw new Error("úložiště nedostupné");
  },
};

describe("úložiště", () => {
  it("storage, který vyhazuje chybu, appku neshodí", () => {
    const root = mount();
    expect(() => createApp(root, fakeApi(), brokenStorage)).not.toThrow();

    type(root, "newPerson", "Anna");
    clickAction(root, "add-person");
    goTo(root, "items");
    clickAction(root, "add-item");
    const itemId = root.querySelector('[data-field="price"]').dataset.id;
    type(root, "price", "50", { id: itemId });
    click(root, '[data-action="toggle-weight"]', "Anna");
    clickAction(root, "next");
    clickAction(root, "tip-mode", { mode: "none" });
    clickAction(root, "compute");

    expect(heading(root)).toBe("Kdo komu pošle");
    expect(root.textContent).toContain("Celý účet platí Anna, nikdo nic neposílá.");
  });
});
