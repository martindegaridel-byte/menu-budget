import { describe, expect, it } from "vitest";
import { forSpeech, parseVoiceCommand } from "./voice";

describe("commandes vocales", () => {
  it.each([
    ["Suivant", "next"],
    ["c'est fait", "next"],
    ["étape précédente", "previous"],
    ["tu peux répéter ?", "repeat"],
    ["lance le minuteur", "timer"],
    ["Stop", "stop"],
    ["non, précédent… euh suivant", "next"],
  ])("« %s » → %s", (said, cmd) => {
    expect(parseVoiceCommand(said)).toBe(cmd);
  });

  it("ignore le reste de la conversation", () => {
    expect(parseVoiceCommand("on mange à quelle heure")).toBeNull();
    expect(parseVoiceCommand("")).toBeNull();
  });
});

describe("texte lu à voix haute", () => {
  it("écrit les unités en toutes lettres", () => {
    expect(forSpeech("Cuire 10 min à 180 °C avec 200 g de riz et 2 c. à s. d'huile")).toBe(
      "Cuire 10 minutes à 180 degrés avec 200 grammes de riz et 2 cuillère à soupe d'huile",
    );
    expect(forSpeech("Laisser mijoter 15-20 min")).toBe("Laisser mijoter 15 à 20 minutes");
    expect(forSpeech("Ajouter 1,5 c. à soupe d'huile")).toBe("Ajouter 1,5 cuillère à soupe d'huile");
  });
});
