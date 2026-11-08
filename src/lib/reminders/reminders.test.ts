import { describe, expect, it } from "vitest";
import { composeNotification, parisToday, scheduleFromPlanning } from ".";

const evenings = [
  { date: "2026-11-09", slot: 0, recipeId: "chili", name: "Chili sin carne" },
  { date: "2026-11-10", slot: 1, recipeId: "curry", name: "Curry de pois chiches" },
];

describe("rappels du soir", () => {
  it("prévoit « Ce soir » le jour du plat et la décongélation la veille", () => {
    const s = scheduleFromPlanning(evenings, { freezeSlots: [1], persons: 2 });
    expect(s).toContainEqual({ date: "2026-11-09", kind: "dinner", text: "Chili sin carne", url: "/recettes/chili?p=2" });
    expect(s).toContainEqual({ date: "2026-11-09", kind: "thaw", text: "Curry de pois chiches", url: "/recettes/curry?p=2" });
  });

  it("compose une seule notification avec tout ce qui concerne la journée", () => {
    const s = scheduleFromPlanning(evenings, { freezeSlots: [1], persons: 2 });
    const n = composeNotification(s, [{ name: "Courgette", days: 1 }, { name: "Crème liquide", days: 0 }, { name: "Riz", days: 30 }], "2026-11-09")!;
    expect(n.title).toBe("Ce soir : Chili sin carne");
    expect(n.body).toContain("Sortez « Curry de pois chiches » du congélateur pour demain.");
    expect(n.body).toContain("courgette et crème liquide (aujourd'hui)");
    expect(n.body).not.toContain("riz");
    expect(n.url).toBe("/recettes/chili?p=2");
  });

  it("n'envoie rien quand il n'y a rien à rappeler", () => {
    expect(composeNotification([], [{ name: "Riz", days: 20 }], "2026-11-09")).toBeNull();
    expect(composeNotification([], [{ name: "Lait", days: 1 }], "2026-11-09")!.url).toBe("/placard");
  });

  it("calcule la date du jour à Paris", () => {
    expect(parisToday(new Date("2026-11-09T23:30:00Z"))).toBe("2026-11-10");
    expect(parisToday(new Date("2026-07-01T21:59:00Z"))).toBe("2026-07-01");
  });
});
