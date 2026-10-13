// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { createApp } from "../../src/ui/app.js";
import { fakeApi, memoryStorage, mount, click, clickAction, type, heading, IBAN } from "./helpers.js";

describe("průchod obrazovkami", () => {
  it("prochází všemi čtyřmi obrazovkami a spočítá výsledek", () => {
    const root = mount();
    createApp(root, fakeApi(), memoryStorage());

    expect(heading(root)).toBe("Kdo je u stolu");
    type(root, "newPerson", "Anna");
    clickAction(root, "add-person");
    type(root, "newPerson", "Bára");
    clickAction(root, "add-person");
    type(root, "account", IBAN);
    clickAction(root, "next");

    expect(heading(root)).toBe("Co jste měli");
    clickAction(root, "add-item");
    const itemId = root.querySelector('[data-field="price"]').dataset.id;
    type(root, "price", "289,00", { id: itemId });
    click(root, '[data-action="toggle-weight"]', "Bára");
    clickAction(root, "next");

    expect(heading(root)).toBe("Spropitné");
    clickAction(root, "tip-mode", { mode: "10" });
    expect(root.querySelector('[data-mode="10"]').getAttribute("aria-pressed")).toBe("true");
    clickAction(root, "compute");

    expect(heading(root)).toBe("Kdo komu pošle");
    expect(root.querySelectorAll(".transfer").length).toBe(1);
    expect(root.querySelector(".transfer h3").textContent).toContain("Bára");
    expect(root.querySelector("svg")).not.toBeNull();
  });
});
