import { describe, expect, it } from "vitest";
import { buildSessionSteps, freesHands, ovenTemperatures } from "./batchSession";

const dishes = [
  { name: "Curry", prep: ["Émincer l'oignon."], steps: ["Faire revenir 5 min.", "Mijoter 25 min."], cookMinutes: 25, meals: 2 },
  { name: "Gratin", prep: ["Préchauffer le four à 200 °C.", "Trancher les pommes de terre."], steps: ["Enfourner 45 min à 200 °C.", "Laisser reposer."], cookMinutes: 45, meals: 1 },
];

describe("session de batch cooking", () => {
  it("lance d'abord la cuisson la plus longue, après une mise en place commune", () => {
    const steps = buildSessionSteps(dishes, [{ text: "Cuire 300 g de riz", dishNames: ["Curry"] }], "Une boîte par repas.");
    expect(steps[0]).toContain("Préchauffer le four à 200 °C");
    expect(steps[0]).toContain("Curry : Émincer l'oignon.");
    expect(steps[0]).not.toContain("Gratin : Préchauffer");
    expect(steps[1]).toContain("Cuire 300 g de riz");
    expect(steps[2]).toContain("Gratin");
    expect(steps[2]).toContain("Pendant ce temps : commencez « Curry »");
    expect(steps.at(-1)).toContain("Une boîte par repas.");
    expect(steps).toHaveLength(1 + 1 + 4 + 1);
  });

  it("repère les attentes et les températures de four", () => {
    expect(freesHands("Mijoter 25 min.")).toBe(true);
    expect(freesHands("Faire revenir 5 min.")).toBe(false);
    expect(ovenTemperatures(dishes)).toEqual([200]);
  });
});
