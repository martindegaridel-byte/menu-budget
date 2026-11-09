import { describe, expect, it } from "vitest";
import { addLeftoverSavings, EMPTY_LOG } from "./leftovers";

describe("compteur de restes finis", () => {
  it("additionne les économies, une seule fois par menu", () => {
    let log = addLeftoverSavings(EMPTY_LOG, "menu-a", 320);
    log = addLeftoverSavings(log, "menu-a", 320);
    log = addLeftoverSavings(log, "menu-b", 150);
    expect(log.totalCents).toBe(470);
    expect(addLeftoverSavings(log, "menu-c", 0)).toBe(log);
  });
});
