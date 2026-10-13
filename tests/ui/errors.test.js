// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { createApp } from "../../src/ui/app.js";
import { fakeApi, memoryStorage, mount, clickAction, type, heading, goTo } from "./helpers.js";

describe("chyby z výpočtu", () => {
  it("chyba computeBill: Spočítat je neaktivní a hláška je vidět", () => {
    const root = mount();
    const api = fakeApi({
      computeBill: () => ({ ok: false, errors: [{ code: "NO_ITEMS" }] }),
    });
    createApp(root, api, memoryStorage());

    type(root, "newPerson", "Anna");
    clickAction(root, "add-person");
    goTo(root, "tip");

    expect(heading(root)).toBe("Spropitné");
    const compute = root.querySelector('[data-action="compute"]');
    expect(compute.textContent.trim()).toBe("Spočítat");
    expect(compute.disabled).toBe(true);
    expect(root.querySelector(".errors").textContent).toContain("Přidejte aspoň jednu položku.");

    compute.click();
    expect(heading(root)).toBe("Spropitné");
  });
});
