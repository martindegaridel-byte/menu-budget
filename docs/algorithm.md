# Moteur de menus sous budget — choix techniques

Code : `src/lib/engine/` (fonctions pures, sans I/O, testées dans `*.test.ts`).

## 1. Ce qu'on optimise

- **Contrainte dure** : coût **en caisse** ≤ budget. On achète des conditionnements
  entiers ; ce qui est au **placard** coûte 0 €.
- **Contraintes dures de filtrage** : régime, allergènes, aliments exclus, temps total,
  niveau, équipement, disponibilité en magasin.
- **Objectif** (à maximiser) : somme des scores de préférence − pénalités de variété
  − `0,5 × nb_repas × coût / budget`. Le poids du coût est volontairement faible : il
  départage, sans ramener toujours les mêmes plats bon marché (le budget reste strict).
  - score recette = 10 + 4 (cuisine aimée) + 3 par aliment favori (max 6)
    + 4 par produit du placard qui périme sous 5 jours − 3 (viande, si flexitarien)
    − historique (8 / 5 / 2 pour une recette du dernier / avant-dernier / 3e menu)
    + bruit reproductible ∈ [0, 5[ dépendant de la graine.
  - variété (base, protéine et cuisine **déduites des ingrédients**, voir `facts.ts`) :
    −1,5 par répétition ; au-delà d'environ un tiers du menu (`ceil(repas / 3)`, soit
    2 pour 5 repas) sur la même base ou la même protéine : −6 par plat en trop ;
    −8 par doublon (autorisé seulement s'il y a moins de recettes que de repas).

### Variété d'une génération à l'autre

- L'appli tire une **nouvelle graine** à chaque génération ; elle est renvoyée dans le
  résultat (`seed`) : mêmes réglages + même graine ⇒ même menu.
- L'appli transmet les recettes des 3 derniers menus (`recentRecipeIds`).
- Tirage final parmi les optimums locaux à moins de 3 % du meilleur (sauf
  réoptimisation d'un menu existant, qui garde le meilleur).
- « Régénérer ce plat » : tirage pondéré (par rang) parmi les 5 meilleures
  alternatives de `swapOptions` qui tiennent dans le budget et ne sont pas récentes.

## 2. Coût d'un panier : `buildShoppingList`

1. Agrégation des besoins de toutes les recettes (unité de base g / ml / pièce).
2. Déduction du placard **une seule fois** sur le besoin agrégé (pas de double comptage).
3. Pour le reste : `cheapestCover` choisit la combinaison de formats **la moins chère**
   qui couvre le besoin (énumération exacte bornée — 1 à 3 formats par produit —, avec
   repli heuristique au-delà de 20 000 combinaisons). À coût égal : moins de surplus.
4. Tout est en **centimes entiers** ; la part du total attribuée à chaque plat est
   répartie par la méthode du plus fort reste (la somme est exacte).

C'est ce coût de panier, **non additif**, qui rend la réutilisation d'ingrédients
rentable : deux recettes à la crème partagent la même brique.

## 3. Recherche : glouton + recherche locale

Le problème est un sac à dos quadratique (coût non additif à cause des paquets
partagés) — NP-difficile en général, mais petit (≤ 21 plats, ~170 recettes).

1. **Menu le moins cher** : glouton sur le coût marginal du panier, puis recherche
   locale (remplacement d'un plat tant que le coût baisse), limitée aux 70 recettes
   compatibles les moins chères (coût de la part utilisée, placard déduit) pour que
   le temps de calcul reste stable quand la base grandit.
   - S'il dépasse le budget → statut `over-budget`, on renvoie ce menu et on explique
     (« il manque X € pour N personnes et M repas ») + suggestions calculées par
     dichotomie (nombre de repas / de personnes qui tiennent dans le budget).
2. **Points de départ** : menu le moins cher, menu courant (`initial`), glouton par
   score sous budget, 5 gloutons randomisés (graine).
3. **Recherche locale par meilleure amélioration** sous contrainte coût ≤ budget
   (voisinage : remplacer un plat par une autre recette), jusqu'à l'optimum local
   ou au plafond de temps (1 s par défaut, vérifié à l'intérieur des boucles).
4. Les évaluations de panier sont **mémoïsées** (multiensemble de recettes) et les
   couvertures de conditionnement mises en cache.
5. **Ingrédients facultatifs** (herbes, fromage râpé…) : exclus de l'optimisation,
   puis ajoutés du moins cher au plus cher tant que le budget le permet.

**Garantie** : un menu `ok` respecte toujours le budget (vérifié sur 100 combinaisons
aléatoires en test). **Pas de garantie d'optimum global** pour l'objectif de goût ;
c'est un compromis assumé pour rester nettement sous 2 s.

Mesures (machine de dev, 172 recettes) : 5 repas ≈ 0,2 s ; 14 repas × 4 pers. ≈ 1 s
(plafond atteint) ; budget impossible 21 × 6 ≈ 1,2 s avec les suggestions.

## 4. Pistes d'amélioration

- Voisinage 2-échanges, recuit simulé si les menus semblent trop « locaux ».
- PLNE (programmation linéaire en nombres entiers) avec variables de paquets si l'on
  veut l'optimum prouvé (solveur côté serveur).
- Tenir compte de la valeur des restes (réutilisables la semaine suivante).
