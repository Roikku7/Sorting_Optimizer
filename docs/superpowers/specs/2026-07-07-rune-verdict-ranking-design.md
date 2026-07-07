# Verdicts intelligents & classement comparatif des runes — Design

Date : 2026-07-07
Statut : validé par l'utilisateur (sections A/B/C approuvées)

## Problème

L'app note aujourd'hui chaque rune isolément (`missPoints` = qualité des rolls) mais par exemple :

1. Elle ignore la **pertinence des substats selon le set** (une Rage avec de gros
   rolls RES est gardée alors que la RES n'y sert à rien ; à l'inverse la RES est
   précieuse sur Will/Violent).
2. Elle ne répond pas à la vraie question au drop : **« ai-je déjà mieux ? »**.
   L'utilisateur doit vérifier à la main dans le modal, rune par rune.

Règle de jeu de l'utilisateur : **on ne juge une rune qu'à +12**. Les runes
en dessous doivent soit être vendues (rolls objectivement mauvais), soit être
montées à +12 avant tout verdict garder/vendre.

## Vue d'ensemble

Chaque rune reçoit un des **4 verdicts** (remplace le booléen `toJunk` comme
signal principal ; `toJunk` reste calculé en interne) :

| Verdict | Condition | Action joueur |
|---|---|---|
| `JUNK` | `upgrade_curr < 12` ET (missPoints + wastePoints > threshold) | Vendre sans monter |
| `A_MONTER` | `upgrade_curr < 12` ET passe le filtre qualité | Monter à +12 puis relancer l'analyse |
| `KEEP` | `upgrade_curr >= 12` ET rang ≤ N dans son groupe | Garder |
| `SELL` | `upgrade_curr >= 12` ET rang > N dans son groupe | Vendre : N runes font mieux |

Aucune projection à +12 pour les runes <+12 : c'est volontaire, ça force
le workflow « monter à +12 avant de juger ».

## 1. Table de pertinence par set (`SET_RELEVANCE`)

Dans `mapping.js` (source de vérité des données de jeu). Pour chaque set,
chaque substat trackée (HP% 2, ATK% 4, DEF% 6, SPD 8, CRate 9, CDmg 10,
RES 11, ACC 12) reçoit un niveau : `KEY`, `NEUTRAL`, `USELESS`.

Défauts (validés) :

| Sets | KEY | USELESS |
|---|---|---|
| Rage(5), Blade(4), Fatal(8), Fight(19) | ATK%, CRate, CDmg, SPD | RES |
| Guard(2), Determination(20), Shield(16), Endure(7) | DEF%, HP%, SPD | ATK% |
| Violent(13), Will(15), Swift(3), Nemesis(14), Revenge(17), Energy(1), Enhance(21), Immemorial(99), Intangible(25) | SPD | — |
| Despair(10) | SPD, ACC | — |
| Focus(6), Accuracy(22), Seal(24) | ACC, SPD | — |
| Vampire(11), Destroy(18), Tolerance(23) | SPD | — |

Règles transverses :
- SPD est KEY partout, jamais USELESS.
- Les substats flat (HP/ATK/DEF flat, types 1/3/5) restent hors scoring.
- Les niveaux sont mappés en interne vers des poids numériques
  (KEY = 1.25, NEUTRAL = 1.0, USELESS = 0) → porte ouverte à des poids
  fins par la suite sans changer l'architecture.
- La table est **surchargeable dans l'UI** (voir §6) ; les IDs ci-dessus
  sont ceux de `mapping.rune.sets` (source de vérité).

## 2. wastePoints (filtre qualité des runes <+12)

Dans `logic_analyze.js`, en plus de `missPoints` :

- Pour chaque substat `USELESS` pour le set de la rune :
  `waste = assignedProcs × procMax` (tout proc investi dans une stat inutile
  est compté comme entièrement gaspillé). La base sans proc ne pénalise pas.
- `wastePoints = Σ waste`.
- Verdict qualité : `JUNK` si `missPoints + wastePoints > threshold`
  (threshold existant : 8 + tolérance de set).
- **Pas de double pénalité** : pour une substat USELESS, le waste REMPLACE
  le miss — `missPoints` n'additionne que les miss des substats non-USELESS
  (un mauvais roll dans une stat inutile n'est pas pire qu'un bon roll ;
  le `miss` par substat reste calculé et affiché à titre informatif).
- Les substats gemmées gardent `miss = 0` mais une gemme posée dans une stat
  USELESS compte quand même en waste (1 proc équivalent) — cas rare.
- `brokenSet` ignore les substats gemmées (la valeur d'une gemme ne vient
  pas de procs).

## 3. Score de comparaison (runes ≥+12)

Score par rune, utilisé pour classer au sein d'un groupe :

```
score = Σ sur substats trackées ( (current / rollMax(type)) × poids(set, type) )
      + innate tracké : (value / rollMax) × poids × 0.5
```

- `rollMax(type)` = valeur max d'un proc (8 pour HP%/ATK%/DEF%/RES/ACC,
  6 pour SPD/CRate, 7 pour CDmg) → normalise : 21 SPD (3.5 rolls) pèse plus
  que 13% HP (1.6 roll).
- Poids : KEY 1.25, NEUTRAL 1.0, USELESS 0.
- Flats et innates flat : ignorés (≈0).
- Les valeurs ancient utilisent les mêmes rollMax de proc (les procs ancient
  sont identiques aux normaux, seule la base diffère — logique déjà en place).

## 4. Groupes et classement (hybride)

- Slots 2/4/6 : groupe = `set_id + slot + mainstat.type`.
- Slots 1/3/5 : groupe = `set_id + slot`.
- Seules les runes ≥+12 participent au classement.
- `rank` = position de la rune dans son groupe trié par score décroissant ;
  `groupSize` = nb de runes ≥+12 du groupe.
- `KEEP` si `rank ≤ N(set)`, sinon `SELL`.

N par défaut par set (réglable) :

| N | Sets |
|---|---|
| 6 | Violent, Will, Swift |
| 4 | Despair, Nemesis, Destroy, Shield, Seal |
| 3 | Rage, Blade, Fatal, Guard, Focus, Revenge, Fight, Determination, Accuracy |
| 2 | Energy, Endure, Enhance, Tolerance, Vampire, Intangible, Immemorial |

## 5. Exceptions (priorité sur tout le reste)

1. **SPD élevée** : substat SPD `current ≥ seuil` → jamais `JUNK` ni `SELL`
   (devient `A_MONTER` si <+12, `KEEP` sinon). Seuil global par défaut : 20.
   Surcharges possibles par slot et par set dans les réglages.
2. **Reap** : `reap === 1` (légendaire + bon innate, flag existant) → jamais
   `JUNK` (la rune mérite d'être jugée à +12).
3. **Quad roll (broken set)** : une substat trackée avec
   `assignedProcs ≥ 4` (base + 4 rolls concentrés, ex: RES ~36-40%) →
   jamais `JUNK` ni `SELL`, même si la stat est USELESS pour le set. Ces
   runes valent par leurs stats brutes dans les builds « broken set » (on
   sacrifie l'effet de set pour de meilleures stats). Flag `brokenSet: true`
   sur la rune.

Transparence : une exception ne masque jamais l'état objectif de la rune.
Le verdict devient protecteur (`KEEP`/`A_MONTER`) mais l'UI affiche toujours
le rang réel dans le groupe, le score, les wastePoints et la raison de la
protection (badge « SPD », « REAP » ou « BROKEN SET »).

## 6. Réglages persistés

- Fichier `settings.json` dans `%APPDATA%/sorting_optimizer/` (mêmes IPC
  main-process que le reste ; le renderer n'accède jamais au disque).
- Contenu : surcharges de `SET_RELEVANCE`, N par set, seuil SPD global +
  surcharges par slot/set.
- Chargés au démarrage, fusionnés sur les défauts de `mapping.js`.
- UI : panneau « Réglages » avec la matrice set × substat (3 états cliquables),
  les N par set, le seuil SPD, et un bouton « Réinitialiser aux défauts ».
- L'analyse est relancée (ou re-scorée côté renderer) après un changement
  de réglage.

## 7. UI (src/ui.jsx, src/logic_rune.jsx)

- **Grille** : badge verdict coloré (JUNK rouge, A_MONTER jaune, SELL orange,
  KEEP vert) + « rang/groupe » (ex: 2/14) pour les runes ≥+12 ; badge
  d'exception (« SPD » / « REAP » / « BROKEN SET ») à côté du verdict quand
  une protection s'applique — le rang et le score objectifs restent
  affichés ; filtre par verdict ; tri par score.
- **Modal** : remplace `getRuneComparison` (top-1/top-2 substats) par le
  classement complet du groupe : liste triée par score, rune courante
  surlignée, et détail « procs gaspillés » par substat USELESS.
- Les filtres existants (slot/set/qualité/mainstat/substat) sont conservés.

## 8. Corrections de bugs incluses

Découverts pendant l'exploration — les IDs de sets codés dans
`logic_analyze.js` ne correspondent pas à `mapping.rune.sets` :

- `SET_TOLERANCE` : `{13:3, 14:2, 5:2, 15:2, 16:2}` commenté
  Violent/Will/Despair/Destroy/Nemesis, mais en réalité 14=Nemesis, 5=Rage,
  15=Will, 16=Shield. Correct : `{13:3 Violent, 15:2 Will, 10:2 Despair,
  18:2 Destroy, 14:2 Nemesis}`.
- `REAP_SET_ALL_SLOTS = [13,14,16,5,4]` (commenté Violent, Will, Nemesis,
  Despair, Swift) → correct : `[13, 15, 14, 10, 3]`.
- `REAP_SET_SLOT246 = [13,14,5,4,15,17,6,2,12,10]` contient un ID 12 qui
  n'est pas un set et des libellés décalés → à réaligner sur l'intention
  (Violent, Will, Despair, Swift + Destroy, Vampire, Rage, Blade, Seal,
  Shield) : `[13, 15, 10, 3, 18, 11, 5, 4, 24, 16]`.

## 9. Architecture / découpage

- `mapping.js` : + `SET_RELEVANCE` (défauts), + `KEEP_COUNT_DEFAULTS`,
  + `ROLL_MAX` par type. Données pures, zéro logique.
- `src/logic_analyze.js` : + wastePoints, + score, correction des IDs.
  Reste du pur CommonJS testable sans Electron. **Le classement par groupe
  se fait ici aussi** (fonction `rankRunes(analyzedRunes, settings)`) car il
  a besoin de tout le pool — l'analyse retourne des runes avec
  `verdict`, `score`, `rank`, `groupKey`, `groupSize`, `wastePoints`.
- `main.js` / `preload.js` : + IPC `get-settings` / `save-settings`.
- `src/logic_rune.jsx` : filtres verdict, tri par score, helper de
  classement de groupe pour le modal.
- `src/ui.jsx` : badges, panneau réglages, modal refondu.
- Rappel build : toute modif de `logic_analyze.js` nécessite
  `npm run obfuscate` avant un `npm run dist` (le dev charge le non-obfusqué).

## 10. Gestion d'erreurs

- Réglages corrompus/illisibles → retomber sur les défauts, log console main.
- Set inconnu (nouveau set du jeu) → NEUTRAL partout, N = 3, jamais de crash.
- Groupe vide ou singleton → rank 1/1, KEEP.
- Substat de type non tracké dans les réglages → ignorée en silence.

## 11. Tests (vitest)

- wastePoints : Rage + procs RES pénalisée ; Will + procs RES non pénalisée.
- Score : normalisation (21 SPD > 13 HP%), poids KEY/USELESS, innate.
- Groupement hybride : slot 2 séparé par mainstat, slot 3 non.
- Verdicts : les 4 cas + frontière rank = N.
- Exceptions : SPD 20 sauve une rune SELL ; reap sauve du JUNK ; seuil
  surchargé par set ; quad roll (4 procs dans une stat USELESS) sauve du
  JUNK/SELL avec flag brokenSet, et le rang objectif reste calculé.
- Corrections d'IDs : tolérance appliquée à Will (15) et plus à Rage (5).
- Fusion réglages : surcharge partielle + reset.
- Les 9 tests existants continuent de passer (le calcul missPoints
  n'est pas modifié, seulement enrichi).

## Hors périmètre (plus tard)

- Poids numériques fins par set (l'architecture les permet déjà).
- Watch du dossier d'export SWEX, export de liste de vente, virtualisation
  de la grille (voir REPORT.md).
