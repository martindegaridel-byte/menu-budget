import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod/v4";
import { ALLERGENS, CUISINES, DIETS, EQUIPMENT, RECIPE_UNITS } from "@/lib/domain/schemas";
import type { RecipeGenerationRequest, RecipeGenerationResult, RecipeGenerator } from "./types";
import { validateGeneratedRecipes } from "./validate";

const MODEL = "claude-opus-5-5";

/** Schéma de sortie imposé au modèle (aucun prix : le moteur le calcule). */
const OutputSchema = z.object({
  recipes: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      cuisine: z.enum(Object.keys(CUISINES) as [string, ...string[]]),
      baseServings: z.number().int(),
      prepMinutes: z.number().int(),
      cookMinutes: z.number().int(),
      difficulty: z.number().int(),
      equipment: z.array(z.enum(Object.keys(EQUIPMENT) as [string, ...string[]])),
      ingredients: z.array(
        z.object({
          ingredientId: z.string(),
          quantity: z.number(),
          unit: z.enum(RECIPE_UNITS),
          optional: z.boolean(),
        }),
      ),
      steps: z.array(z.string()),
    }),
  ),
});

const SYSTEM = `Tu es un chef qui crée des recettes de plats familiaux, économiques et équilibrés, pour une application française de menus à petit budget.
Contraintes impératives :
- N'utilise QUE des ingrédients de la liste fournie, référencés par leur identifiant exact (ingredientId).
- Quantités réalistes pour le nombre de portions (baseServings), unités parmi g, kg, ml, cl, l, piece, cs (cuillère à soupe), cc (cuillère à café). Utilise "piece" uniquement pour les ingrédients marqués [pièce] ou ayant un poids par pièce.
- Ne donne jamais de prix : ils sont calculés ailleurs.
- difficulty : 1 (facile), 2 (moyen) ou 3 (difficile). Étapes courtes, en français, à l'impératif.
- Privilégie les ingrédients peu chers et réutilisables entre plusieurs recettes.`;

export class AnthropicRecipeGenerator implements RecipeGenerator {
  constructor(private readonly client = new Anthropic()) {}

  async generate(req: RecipeGenerationRequest): Promise<RecipeGenerationResult> {
    const p = req.preferences;
    const ingredientList = req.allowedIngredients
      .map((i) => `${i.id} — ${i.name}${i.unit === "piece" ? " [pièce]" : i.gramsPerPiece ? ` [~${i.gramsPerPiece} g/pièce]` : ` [${i.unit}]`}`)
      .join("\n");
    const prompt = [
      `Crée ${req.count} recette(s) de plat principal pour ${p.persons} personne(s).`,
      `Régime : ${DIETS[p.diet]}. Allergènes à éviter : ${p.allergens.map((a) => ALLERGENS[a]).join(", ") || "aucun"}.`,
      `Temps total maximum : ${p.maxTotalMinutes} min. Niveau maximum : ${p.maxDifficulty}. Équipement : ${p.equipment.join(", ")}.`,
      p.likedCuisines.length ? `Cuisines appréciées : ${p.likedCuisines.map((c) => CUISINES[c]).join(", ")}.` : "",
      `Budget indicatif : environ ${(p.budgetCents / Math.max(1, p.meals * p.persons) / 100).toFixed(2)} € par portion.`,
      `Recettes déjà connues (ne pas reproduire) : ${req.existingRecipeNames.join(" ; ")}.`,
      `\nIngrédients disponibles :\n${ingredientList}`,
    ]
      .filter(Boolean)
      .join("\n");

    const response = await this.client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      // Repli serveur automatique si le modèle décline la requête.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(OutputSchema) },
      system: SYSTEM,
      messages: [{ role: "user", content: prompt }],
    });

    if (response.stop_reason === "refusal") throw new Error("Le générateur a refusé la demande.");
    if (response.stop_reason === "max_tokens") throw new Error("Réponse du générateur tronquée.");
    const out = response.parsed_output;
    if (!out) throw new Error("Réponse du générateur illisible.");
    return validateGeneratedRecipes(out.recipes, req);
  }
}

export function isRecipeGeneratorEnabled(): boolean {
  return process.env.RECIPE_GENERATOR_ENABLED === "true";
}
