// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { createApp } from "../../src/ui/app.js";
import { fakeApi, memoryStorage, mount, clickAction, type, click } from "./helpers.js";

const NO_ACCOUNT = "Pro QR platbu doplňte číslo účtu plátce.";

describe("účet a QR platba", () => {
  it("výsledek bez platného čísla účtu ukáže text a žádný QR", () => {
    const root = mount();
    const api = fakeApi({ toIban: () => null });
    createApp(root, api, memoryStorage());

    type(root, "newPerson", "Anna");
    clickAction(root, "add-person");
    type(root, "newPerson", "Bára");
    clickAction(root, "add-person");
    type(root, "account", "123456/0100");
    clickAction(root, "next");

    clickAction(root, "add-item");
    const itemId = root.querySelector('[data-field="price"]').dataset.id;
    type(root, "price", "100", { id: itemId });
    click(root, '[data-action="toggle-weight"]', "Bára");
    clickAction(root, "next");
    clickAction(root, "compute");

    expect(root.querySelectorAll(".transfer").length).toBe(1);
    expect(root.textContent).toContain(NO_ACCOUNT);
    expect(root.querySelector("svg")).toBeNull();
    expect(root.querySelector(".qr")).toBeNull();
  });
});
