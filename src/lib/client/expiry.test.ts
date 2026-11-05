import { describe, expect, it } from "vitest";
import { expiryInfo } from "./expiry";

const today = "2026-11-05";

describe("expiryInfo (badge de péremption)", () => {
  it("rouge à 2 jours ou moins, y compris dépassé", () => {
    expect(expiryInfo("2026-11-07", today)).toMatchObject({ days: 2, tone: "danger", label: "Dans 2 j" });
    expect(expiryInfo("2026-11-05", today)).toMatchObject({ tone: "danger", label: "Aujourd'hui" });
    expect(expiryInfo("2026-11-06", today).label).toBe("Demain");
    expect(expiryInfo("2026-11-03", today)).toMatchObject({ tone: "danger", label: "Périmé depuis 2 j" });
  });
  it("ambre de 3 à 5 jours", () => {
    expect(expiryInfo("2026-11-08", today).tone).toBe("warn");
    expect(expiryInfo("2026-11-10", today).tone).toBe("warn");
  });
  it("neutre au-delà, avec la date", () => {
    expect(expiryInfo("2026-11-11", today)).toMatchObject({ tone: "neutral", label: "Dans 6 j" });
    expect(expiryInfo("2026-11-20", today)).toMatchObject({ tone: "neutral", label: "20 nov." });
  });
});
