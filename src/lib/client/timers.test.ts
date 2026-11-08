import { describe, expect, it } from "vitest";
import { findTimers, formatClock } from "./timers";

describe("minuteurs des étapes", () => {
  it("repère les durées en minutes, heures et secondes", () => {
    expect(findTimers("Cuire les pâtes 12 min dans l'eau salée.")).toEqual([{ label: "12 min", seconds: 720 }]);
    expect(findTimers("Laisser mijoter 1 h à couvert.")).toEqual([{ label: "1 h", seconds: 3600 }]);
    expect(findTimers("Fouetter 30 secondes.")[0]!.seconds).toBe(30);
  });

  it("prend la borne haute d'une fourchette et ignore les températures et quantités", () => {
    expect(findTimers("Dorer 4 à 5 min par face, four à 180 °C, 200 g de riz.")).toEqual([{ label: "4 à 5 min", seconds: 300 }]);
    expect(findTimers("Ajouter 2 cs d'huile et 3 minutes plus tard le riz, puis 20 minutes.").map((t) => t.seconds)).toEqual([180, 1200]);
  });

  it("formate le temps restant", () => {
    expect(formatClock(725)).toBe("12:05");
    expect(formatClock(3750)).toBe("1:02:30");
    expect(formatClock(-3)).toBe("0:00");
  });
});
