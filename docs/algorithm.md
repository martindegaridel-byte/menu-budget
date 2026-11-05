# Moteur de menus sous budget — choix techniques

Code : `src/lib/engine/` (fonctions pures, sans I/O, testées dans `*.test.ts`).

## 1. Ce qu'on optimise

- **Contrainte dure** : coût **en caisse** ≤ budget. On achète des conditionnements
  entiers ; ce qui est au **placard** coûte 0 €.
- **Contraintes dures de filtrage** : régime, allergènes, aliments exclus, temps total,
  niveau, équipement, disponibilité en magasin.
- **Objectif** (à maximiser) : somme des scores de préférence − pénalités de variété
  − `1,5 × nb_repas × coût / budget` (à goût égal, on dépense moins).
  - score recette = 10 + 4 (cuisine aimée) + 3 par aliment favori (max 6)
    + 4 par produit du placard qui périme sous 5 jours − 3 (viande, si flexitarien)
    + bruit reproductible ∈ [0, 2[ dépendant de la graine (pour « Proposer autre chose »).
  - pénalités : −2 par cuisine ou protéine au-delà de 2 occurrences, −8 par doublon
    (doublons autorisés seulement s'il y a moins de recettes compatibles que de repas).

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
   score sous budget, 3 gloutons randomisés (graine).
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
