import { Flame, Refrigerator, Snowflake, Users } from "lucide-react";
import type { Recipe } from "@/lib/domain/schemas";

/** Conservation d'un plat (« Pour 4 portions · Se garde 3 jours au frigo · Se congèle »). */
export function RecipeStorage({ recipe, className = "" }: { recipe: Pick<Recipe, "portions" | "fridgeDays" | "freezable" | "reheats">; className?: string }) {
  const items: { icon: typeof Users; text: string }[] = [];
  if (recipe.portions && recipe.portions > 1) items.push({ icon: Users, text: `Se prépare pour ${recipe.portions} portions` });
  if (recipe.fridgeDays !== undefined) {
    items.push({
      icon: Refrigerator,
      text: recipe.fridgeDays === 0 ? "À manger le jour même" : `Se garde ${recipe.fridgeDays} jour${recipe.fridgeDays > 1 ? "s" : ""} au frigo`,
    });
  }
  if (recipe.freezable !== undefined) items.push({ icon: Snowflake, text: recipe.freezable ? "Se congèle" : "Ne se congèle pas" });
  if (recipe.reheats !== undefined) items.push({ icon: Flame, text: recipe.reheats ? "Se réchauffe bien" : "Meilleur tout juste préparé" });
  if (items.length === 0) return null;
  return (
    <ul className={`flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted ${className}`} aria-label="Conservation">
      {items.map(({ icon: Icon, text }) => (
        <li key={text} className="inline-flex items-center gap-1.5">
          <Icon aria-hidden className="size-4" strokeWidth={1.75} />
          {text}
        </li>
      ))}
    </ul>
  );
}
