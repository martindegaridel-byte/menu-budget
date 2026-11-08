import { describe, expect, it } from "vitest";
import { deviceSettings, restoreDeviceSettings } from "./backup";

function memory(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return {
    get length() {
      return m.size;
    },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    m,
  };
}

describe("réglages de l'appareil dans la sauvegarde", () => {
  it("garde les clés mb:* sauf celles propres à l'appareil", () => {
    const s = memory({ "mb:prefs": "{}", "mb:appearance": '{"accent":"bleu"}', "mb:push-endpoint": "x", "mb:result": "{}", autre: "1" });
    expect(deviceSettings(s)).toEqual({ "mb:prefs": "{}", "mb:appearance": '{"accent":"bleu"}' });
  });

  it("restaure sans toucher aux clés étrangères", () => {
    const s = memory();
    expect(restoreDeviceSettings(s, { "mb:prefs": "{}", "mb:push-endpoint": "x", "evil": "1" })).toBe(1);
    expect([...s.m.keys()]).toEqual(["mb:prefs"]);
  });
});
