import { describe, it, expect } from "vitest";
import { deburr } from "../libs/webamp/js/deburr";

// аудит-51 02-P2-12: страховка локальной замены lodash.deburr в webamp (Character.tsx).
describe("deburr (локальная замена lodash, webamp)", () => {
  it("снимает диакритику", () => {
    expect(deburr("déjà vu")).toBe("deja vu");
  });

  it("лигатуры и спецбуквы — как lodash", () => {
    expect(deburr("Æther")).toBe("Aether");
    expect(deburr("Straße")).toBe("Strasse");
    expect(deburr("Łódź")).toBe("Lodz");
    expect(deburr("Ĳsselmeer Œuvre")).toBe("IJsselmeer Oeuvre");
  });

  it("убирает комбинирующие марки", () => {
    expect(deburr("e\u0301")).toBe("e");
  });

  it("не трогает ASCII и знаки", () => {
    expect(deburr("abc123 — ok")).toBe("abc123 — ok");
  });
});
