# Verdicts intelligents & classement comparatif — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chaque rune reçoit un verdict automatique (JUNK / A_MONTER / KEEP / SELL) basé sur la pertinence de ses substats pour son set et sur un classement comparatif face aux runes du même groupe de remplacement.

**Architecture:** Les données de jeu (table de pertinence, rolls max, N par set) vont dans `mapping.js`. Toute la logique (wastePoints, score, classement, verdicts, exceptions) va dans `src/logic_analyze.js` (CommonJS pur, testable sans Electron). Les réglages utilisateur sont persistés par le process main dans `%APPDATA%/sorting_optimizer/settings.json` via 2 nouveaux IPC. L'UI (React) affiche badges, rang et panneau de réglages.

**Tech Stack:** Electron (main/preload/IPC), React 18 (renderer), Vite, vitest, CommonJS pour la logique.

**Spec:** `docs/superpowers/specs/2026-07-07-rune-verdict-ranking-design.md`

**Rappels projet importants:**
- `npm test` = vitest. Avant ce plan : 9 tests passent.
- En dev, `main.js` charge `src/logic_analyze.js` directement. Le packagé charge `src/la.obf.js`, régénéré par `npm run obfuscate` (inclus dans `npm run dist`). **Ne jamais éditer `la.obf.js` à la main.**
- Lancer l'app en dev : terminal 1 `npm run dev`, terminal 2 `npm start`. Fichier de test : `Roikku7-7294441.json` à la racine.
- IDs de stats : HP%=2, ATK%=4, DEF%=6, SPD=8, CRate=9, CDmg=10, RES=11, ACC=12 (voir `mapping.rune.effectTypes`).
- IDs de sets : voir `mapping.rune.sets` (Energy=1, Guard=2, Swift=3, Blade=4, Rage=5, Focus=6, Endure=7, Fatal=8, Despair=10, Vampire=11, Violent=13, Nemesis=14, Will=15, Shield=16, Revenge=17, Destroy=18, Fight=19, Determination=20, Enhance=21, Accuracy=22, Tolerance=23, Seal=24, Intangible=25, Immemorial=99).

---

### Task 1: Données de scoring dans `mapping.js`

**Files:**
- Modify: `mapping.js` (ajouter une clé `runeScoring` au niveau racine de l'objet exporté, juste avant la méthode `isAncient(item)`)
- Test: `tests/mapping.test.js` (créer)

- [ ] **Step 1: Write the failing test**

Créer `tests/mapping.test.js` :

```js
import { describe, it, expect } from "vitest";
import mapping from "../mapping.js";

const TRACKED = [2, 4, 6, 8, 9, 10, 11, 12];

describe("mapping.runeScoring", () => {
  it("exposes ROLL_MAX for every tracked substat type", () => {
    for (const t of TRACKED) {
      expect(mapping.runeScoring.ROLL_MAX[t]).toBeGreaterThan(0);
    }
    expect(mapping.runeScoring.ROLL_MAX[8]).toBe(6);   // SPD
    expect(mapping.runeScoring.ROLL_MAX[10]).toBe(7);  // CDmg
    expect(mapping.runeScoring.ROLL_MAX[2]).toBe(8);   // HP%
  });

  it("marks RES useless on Rage but not on Will", () => {
    expect(mapping.runeScoring.SET_RELEVANCE[5][11]).toBe("USELESS");  // Rage/RES
    expect(mapping.runeScoring.SET_RELEVANCE[15]?.[11]).toBeUndefined(); // Will/RES => NEUTRAL implicite
  });

  it("marks ATK% useless on Guard", () => {
    expect(mapping.runeScoring.SET_RELEVANCE[2][4]).toBe("USELESS");
  });

  it("never marks SPD useless in any set", () => {
    for (const rel of Object.values(mapping.runeScoring.SET_RELEVANCE)) {
      expect(rel[8]).not.toBe("USELESS");
    }
  });

  it("has a keep count for the main sets and a fallback", () => {
    expect(mapping.runeScoring.KEEP_COUNT_DEFAULTS[13]).toBe(6); // Violent
    expect(mapping.runeScoring.KEEP_COUNT_DEFAULTS[5]).toBe(3);  // Rage
    expect(mapping.runeScoring.KEEP_COUNT_FALLBACK).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/mapping.test.js`
Expected: FAIL — `mapping.runeScoring` is undefined.

- [ ] **Step 3: Write minimal implementation**

Dans `mapping.js`, ajouter au niveau racine de l'objet `module.exports` (juste avant `isAncient(item)`) :

```js
  // ------------------ SCORING DATA (verdicts & ranking) ------------------
  // Niveaux de pertinence d'une substat pour un set.
  // Sparse : toute entrée absente = "NEUTRAL". SPD (8) est KEY partout
  // (imposé aussi dans logic_analyze). Surchargeable via les réglages UI.
  runeScoring: {
    // Valeur max d'un proc, pour normaliser les substats entre elles.
    ROLL_MAX: { 2: 8, 4: 8, 6: 8, 11: 8, 12: 8, 8: 6, 9: 6, 10: 7 },
    RELEVANCE_WEIGHTS: { KEY: 1.25, NEUTRAL: 1.0, USELESS: 0 },
    SPD_THRESHOLD_DEFAULT: 20,
    SET_RELEVANCE: {
      // Offensifs : ATK%/CRate/CDmg/SPD clés, RES inutile
      5:  { 4: "KEY", 9: "KEY", 10: "KEY", 8: "KEY", 11: "USELESS" }, // Rage
      4:  { 4: "KEY", 9: "KEY", 10: "KEY", 8: "KEY", 11: "USELESS" }, // Blade
      8:  { 4: "KEY", 9: "KEY", 10: "KEY", 8: "KEY", 11: "USELESS" }, // Fatal
      19: { 4: "KEY", 9: "KEY", 10: "KEY", 8: "KEY", 11: "USELESS" }, // Fight
      // Défensifs : DEF%/HP%/SPD clés, ATK% inutile
      2:  { 6: "KEY", 2: "KEY", 8: "KEY", 4: "USELESS" }, // Guard
      20: { 6: "KEY", 2: "KEY", 8: "KEY", 4: "USELESS" }, // Determination
      16: { 6: "KEY", 2: "KEY", 8: "KEY", 4: "USELESS" }, // Shield
      7:  { 6: "KEY", 2: "KEY", 8: "KEY", 4: "USELESS" }, // Endure
      // Universels : SPD clé, rien d'inutile
      13: { 8: "KEY" }, // Violent
      15: { 8: "KEY" }, // Will
      3:  { 8: "KEY" }, // Swift
      14: { 8: "KEY" }, // Nemesis
      17: { 8: "KEY" }, // Revenge
      1:  { 8: "KEY" }, // Energy
      21: { 8: "KEY" }, // Enhance
      99: { 8: "KEY" }, // Immemorial
      25: { 8: "KEY" }, // Intangible
      // Contrôle / débuff : ACC clé
      10: { 8: "KEY", 12: "KEY" }, // Despair
      6:  { 12: "KEY", 8: "KEY" }, // Focus
      22: { 12: "KEY", 8: "KEY" }, // Accuracy
      24: { 12: "KEY", 8: "KEY" }, // Seal
      // Polyvalents
      11: { 8: "KEY" }, // Vampire
      18: { 8: "KEY" }, // Destroy
      23: { 8: "KEY" }, // Tolerance
    },
    KEEP_COUNT_DEFAULTS: {
      13: 6, 15: 6, 3: 6,                                   // Violent, Will, Swift
      10: 4, 14: 4, 18: 4, 16: 4, 24: 4,                    // Despair, Nemesis, Destroy, Shield, Seal
      5: 3, 4: 3, 8: 3, 2: 3, 6: 3, 17: 3, 19: 3, 20: 3, 22: 3, // Rage..Accuracy
      1: 2, 7: 2, 21: 2, 23: 2, 11: 2, 25: 2, 99: 2,        // Energy..Immemorial
    },
    KEEP_COUNT_FALLBACK: 3,
  },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/mapping.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add mapping.js tests/mapping.test.js
git commit -m "feat: add runeScoring data (set relevance, roll max, keep counts) to mapping"
```

---

### Task 2: Corriger les IDs de sets buggés dans `logic_analyze.js`

Contexte : `SET_TOLERANCE` et les listes `REAP_*` utilisent des IDs qui ne correspondent pas à `mapping.rune.sets` (l'auteur croyait 5=Despair alors que 5=Rage, 14=Will alors que 14=Nemesis, etc.). La tolérance de junk s'applique donc aux mauvais sets.

**Files:**
- Modify: `src/logic_analyze.js:26-32` (SET_TOLERANCE) et `src/logic_analyze.js:240-241` (listes REAP)
- Test: `tests/logic_analyze.test.js` (ajouter un describe)

- [ ] **Step 1: Write the failing tests**

Ajouter à la fin de `tests/logic_analyze.test.js` :

```js
describe("set id fixes (SET_TOLERANCE / REAP aligned on mapping.rune.sets)", () => {
  it("Will (15) gets the +2 tolerance (threshold 10)", () => {
    const r = analyzeOne(makeRune({ set_id: 15 }));
    expect(r.threshold).toBe(10);
  });

  it("Rage (5) gets NO tolerance (threshold 8)", () => {
    const r = analyzeOne(makeRune({ set_id: 5 }));
    expect(r.threshold).toBe(8);
  });

  it("Despair (10) gets the +2 tolerance (threshold 10)", () => {
    const r = analyzeOne(makeRune({ set_id: 10 }));
    expect(r.threshold).toBe(10);
  });

  it("legendary Will slot 5 with CRate 5 innate is reap-eligible", () => {
    const r = analyzeOne(makeRune({ set_id: 15, slot_no: 5, extra: 5, prefix_eff: [9, 5] }));
    expect(r.reap).toBe(1);
  });

  it("legendary Seal (24) slot 2 with ACC 7 innate is reap-eligible", () => {
    const r = analyzeOne(makeRune({ set_id: 24, slot_no: 2, extra: 5, prefix_eff: [12, 7] }));
    expect(r.reap).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/logic_analyze.test.js`
Expected: FAIL — Will threshold vaut 8 (pas 10), Rage vaut 10 (pas 8), reap Will slot 5 vaut 0.

- [ ] **Step 3: Fix the IDs**

Dans `src/logic_analyze.js`, remplacer `SET_TOLERANCE` :

```js
const SET_TOLERANCE = {
  13: 3, // Violent
  15: 2, // Will
  10: 2, // Despair
  18: 2, // Destroy
  14: 2  // Nemesis
};
```

Et remplacer les deux listes REAP (dans `analyzeRune`) :

```js
  const REAP_SET_ALL_SLOTS = [13, 15, 14, 10, 3]; // Violent, Will, Nemesis, Despair, Swift
  const REAP_SET_SLOT246 = [13, 15, 10, 3, 18, 11, 5, 4, 24, 16]; // + Destroy, Vampire, Rage, Blade, Seal, Shield
```

- [ ] **Step 4: Run ALL tests to verify pass + no regression**

Run: `npx vitest run`
Expected: PASS (tous les tests, y compris les 9 pré-existants)

- [ ] **Step 5: Commit**

```bash
git add src/logic_analyze.js tests/logic_analyze.test.js
git commit -m "fix: align SET_TOLERANCE and REAP set ids with mapping.rune.sets"
```

---

### Task 3: Module de réglages `src/settings.js`

**Files:**
- Create: `src/settings.js` (CommonJS — il est requis par `main.js` ET par les tests)
- Test: `tests/settings.test.js` (créer)

- [ ] **Step 1: Write the failing tests**

Créer `tests/settings.test.js` :

```js
import { describe, it, expect } from "vitest";
import { getDefaultSettings, sanitizeSettings } from "../src/settings.js";

describe("getDefaultSettings", () => {
  it("returns empty overrides and the default SPD threshold", () => {
    const s = getDefaultSettings();
    expect(s.relevance).toEqual({});
    expect(s.keepCount).toEqual({});
    expect(s.spdThreshold).toEqual({ global: 20, bySet: {}, bySlot: {} });
  });
});

describe("sanitizeSettings", () => {
  it("returns defaults for garbage input", () => {
    expect(sanitizeSettings(null)).toEqual(getDefaultSettings());
    expect(sanitizeSettings("nope")).toEqual(getDefaultSettings());
    expect(sanitizeSettings(42)).toEqual(getDefaultSettings());
  });

  it("keeps valid relevance overrides and drops invalid levels", () => {
    const s = sanitizeSettings({
      relevance: { 5: { 12: "USELESS", 9: "BANANA" } },
    });
    expect(s.relevance[5][12]).toBe("USELESS");
    expect(s.relevance[5][9]).toBeUndefined();
  });

  it("refuses to mark SPD (type 8) as USELESS", () => {
    const s = sanitizeSettings({ relevance: { 5: { 8: "USELESS" } } });
    expect(s.relevance[5]?.[8]).toBeUndefined();
  });

  it("keeps positive integer keep counts, drops the rest", () => {
    const s = sanitizeSettings({ keepCount: { 13: 8, 5: -2, 4: "x" } });
    expect(s.keepCount).toEqual({ 13: 8 });
  });

  it("sanitizes spd thresholds (numbers only, keeps overrides)", () => {
    const s = sanitizeSettings({
      spdThreshold: { global: 22, bySet: { 5: 24, 4: "x" }, bySlot: { 2: 18 } },
    });
    expect(s.spdThreshold.global).toBe(22);
    expect(s.spdThreshold.bySet).toEqual({ 5: 24 });
    expect(s.spdThreshold.bySlot).toEqual({ 2: 18 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/settings.test.js`
Expected: FAIL — module `../src/settings.js` introuvable.

- [ ] **Step 3: Write the implementation**

Créer `src/settings.js` :

```js
// src/settings.js
// Réglages utilisateur (surcharges de la table de pertinence, N par set,
// seuils SPD). Persistés par main.js dans userData/settings.json.
// CommonJS pur : requis par main.js et par les tests.

const LEVELS = ["KEY", "NEUTRAL", "USELESS"];

function getDefaultSettings() {
  return {
    relevance: {},                                  // { set_id: { statType: level } }
    keepCount: {},                                  // { set_id: n }
    spdThreshold: { global: 20, bySet: {}, bySlot: {} },
  };
}

function toPositiveInt(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function sanitizeSettings(raw) {
  const out = getDefaultSettings();
  if (!raw || typeof raw !== "object") return out;

  if (raw.relevance && typeof raw.relevance === "object") {
    for (const [setId, subs] of Object.entries(raw.relevance)) {
      if (!subs || typeof subs !== "object") continue;
      for (const [type, level] of Object.entries(subs)) {
        if (!LEVELS.includes(level)) continue;
        if (Number(type) === 8 && level === "USELESS") continue; // SPD jamais inutile
        if (!out.relevance[setId]) out.relevance[setId] = {};
        out.relevance[setId][type] = level;
      }
    }
  }

  if (raw.keepCount && typeof raw.keepCount === "object") {
    for (const [setId, n] of Object.entries(raw.keepCount)) {
      const v = toPositiveInt(n);
      if (v !== null) out.keepCount[setId] = v;
    }
  }

  if (raw.spdThreshold && typeof raw.spdThreshold === "object") {
    const g = Number(raw.spdThreshold.global);
    if (Number.isFinite(g) && g > 0) out.spdThreshold.global = g;
    for (const key of ["bySet", "bySlot"]) {
      const src = raw.spdThreshold[key];
      if (!src || typeof src !== "object") continue;
      for (const [id, n] of Object.entries(src)) {
        const v = Number(n);
        if (Number.isFinite(v) && v > 0) out.spdThreshold[key][id] = v;
      }
    }
  }

  return out;
}

module.exports = { getDefaultSettings, sanitizeSettings };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/settings.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/settings.js tests/settings.test.js
git commit -m "feat: user settings module (relevance/keepCount/spdThreshold) with sanitization"
```

---

### Task 4: Pertinence, wastePoints et brokenSet dans `analyzeRune`

**Files:**
- Modify: `src/logic_analyze.js` (fonction `analyzeRune` + nouvelle fonction `getRelevance` + signatures `analyzeRunesFromFile`/`analyzeRunesFromData`)
- Test: `tests/scoring.test.js` (créer)

- [ ] **Step 1: Write the failing tests**

Créer `tests/scoring.test.js` :

```js
import { describe, it, expect } from "vitest";
import { analyzeRunesFromData } from "../src/logic_analyze.js";

function makeRune(overrides) {
  return {
    rune_id: 1,
    slot_no: 2,
    set_id: 5, // Rage
    class: 6,
    extra: 4,          // hero (pas légendaire → pas de chemin heroic)
    upgrade_curr: 12,
    pri_eff: [8, 40],
    prefix_eff: [0, 0],
    sec_eff: [],
    ...overrides,
  };
}

function analyzeOne(rune, settings) {
  return analyzeRunesFromData({ runes: [rune] }, settings)[0];
}

describe("wastePoints — procs in USELESS substats", () => {
  it("RES procs on Rage are fully wasted (assigned × procMax)", () => {
    // RES 24 sur hero : base 4–8, proc 4–8 → assigned 2 (fenêtre [12,24])
    // waste = 2 × 8 = 16
    const r = analyzeOne(makeRune({ sec_eff: [[11, 24, 0, 0]] }));
    expect(r.wastePoints).toBe(16);
    const res = r.breakdown.find(s => s.type === 11);
    expect(res.relevance).toBe("USELESS");
    expect(res.waste).toBe(16);
  });

  it("the same RES procs on Will are not wasted", () => {
    const r = analyzeOne(makeRune({ set_id: 15, sec_eff: [[11, 24, 0, 0]] }));
    expect(r.wastePoints).toBe(0);
    expect(r.breakdown.find(s => s.type === 11).relevance).toBe("NEUTRAL");
  });

  it("a USELESS base without procs costs nothing", () => {
    // RES 8 : dans la fenêtre base [4,8] → assigned 0 → waste 0
    const r = analyzeOne(makeRune({ sec_eff: [[11, 8, 0, 0]] }));
    expect(r.wastePoints).toBe(0);
  });

  it("a gem in a USELESS stat counts as 1 proc equivalent", () => {
    const r = analyzeOne(makeRune({ sec_eff: [[11, 8, 1, 0]] }));
    expect(r.wastePoints).toBe(8); // 1 × procMax(RES)=8
  });

  it("toJunk includes wastePoints (missPoints + waste > threshold)", () => {
    // RES 24 wasted (16) + rien d'autre : 16 > threshold 8 (Rage sans tolérance)
    const r = analyzeOne(makeRune({ sec_eff: [[11, 24, 0, 0]] }));
    expect(r.toJunk).toBe(true);
  });

  it("settings can override relevance (ACC useless on Rage)", () => {
    const settings = { relevance: { 5: { 12: "USELESS" } }, keepCount: {}, spdThreshold: { global: 20, bySet: {}, bySlot: {} } };
    // ACC 24 : assigned 2 → waste 16
    const r = analyzeOne(makeRune({ sec_eff: [[12, 24, 0, 0]] }), settings);
    expect(r.wastePoints).toBe(16);
  });
});

describe("brokenSet — quad roll detection", () => {
  it("flags a substat with 4+ assigned procs (legendary only: procTotal=4)", () => {
    // extra 5 (légendaire) → procTotal 4. RES 40 : base 4–8, proc 4–8
    // → assigned 4 (fenêtre [20,40]). Un hero (extra 4, procTotal 3)
    // ne peut jamais atteindre 4 procs dans ce modèle.
    const r = analyzeOne(makeRune({ extra: 5, sec_eff: [[11, 40, 0, 0]] }));
    expect(r.brokenSet).toBe(true);
  });

  it("does not flag 2 procs", () => {
    const r = analyzeOne(makeRune({ sec_eff: [[11, 24, 0, 0]] }));
    expect(r.brokenSet).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/scoring.test.js`
Expected: FAIL — `wastePoints`, `relevance`, `brokenSet` undefined.

- [ ] **Step 3: Implement**

Dans `src/logic_analyze.js` :

3a. Après la déclaration de `SET_TOLERANCE`, ajouter :

```js
const SCORING = mapping.runeScoring;

// Pertinence effective d'une substat pour un set : surcharge utilisateur,
// sinon défaut mapping, sinon NEUTRAL. SPD (8) est KEY par défaut partout.
function getRelevance(setId, type, settings) {
  const override = settings?.relevance?.[setId]?.[type];
  if (override === "KEY" || override === "NEUTRAL" || override === "USELESS") {
    return override;
  }
  const def = SCORING.SET_RELEVANCE[setId]?.[type];
  if (def) return def;
  if (type === 8) return "KEY";
  return "NEUTRAL";
}
```

3b. Changer la signature : `function analyzeRune(rune, settings)`.

3c. Dans la boucle des substats trackées de `analyzeRune`, calculer la pertinence et le waste. Le bloc gemme devient :

```js
    const relevance = getRelevance(rune.set_id, type, settings);

    // Gem → miss = 0, mais on expose toute la fenêtre attendue
    if (gemFlag === 1) {
      trackedSubs.push({
        type,
        statName: mapping.rune.effectTypes[type] || `Type${type}`,
        current: currentValue,
        assignedProcs: result.assigned,
        baseMin: result.baseMin,
        baseMax: result.baseMax,
        expectedMin: result.minPossible,
        expectedMax: result.maxPossible,
        miss: 0,
        relevance,
        // une gemme posée dans une stat inutile = 1 proc équivalent gaspillé
        waste: relevance === "USELESS" ? result.procMax : 0,
        gemmed: true
      });
      continue;
    }
```

Et le push non-gemmé (après le calcul de `miss`) devient :

```js
    trackedSubs.push({
      type,
      statName: mapping.rune.effectTypes[type] || `Type${type}`,
      current: currentValue,
      assignedProcs: result.assigned,
      baseMin: result.baseMin,
      baseMax: result.baseMax,
      expectedMin: result.minPossible,
      expectedMax: result.maxPossible,
      miss,
      relevance,
      waste: relevance === "USELESS" ? result.assigned * result.procMax : 0,
      gemmed: false
    });
```

3d. Après le calcul de `missPoints`, ajouter :

```js
  const wastePoints = trackedSubs.reduce((s, x) => s + (x.waste || 0), 0);
  const brokenSet = trackedSubs.some(x => x.assignedProcs >= 4);
```

3e. Dans l'objet retourné par `analyzeRune`, ajouter les champs et corriger `toJunk` :

```js
    missPoints,
    wastePoints,
    brokenSet,
    threshold,
    toJunk: missPoints + wastePoints > threshold,
```

3f. Propager `settings` dans les exports :

```js
function analyzeRunesFromFile(inputFile, settings) {
  const raw = fs.readFileSync(inputFile, "utf8");
  const data = JSON.parse(raw);
  const runes = collectAllRunes(data);
  return runes.map(r => analyzeRune(r, settings));
}

function analyzeRunesFromData(data, settings) {
  const runes = collectAllRunes(data);
  return runes.map(r => analyzeRune(r, settings));
}
```

- [ ] **Step 4: Run ALL tests**

Run: `npx vitest run`
Expected: PASS — les nouveaux + tous les anciens (les anciens tests utilisent SPD, qui est KEY sur Violent → waste 0, missPoints inchangés).

- [ ] **Step 5: Commit**

```bash
git add src/logic_analyze.js tests/scoring.test.js
git commit -m "feat: set-aware substat relevance, wastePoints and brokenSet detection"
```

---

### Task 5: Score de comparaison normalisé

**Files:**
- Modify: `src/logic_analyze.js` (nouvelle fonction `computeScore`, appel dans `analyzeRune`, export)
- Test: `tests/scoring.test.js` (ajouter un describe)

- [ ] **Step 1: Write the failing tests**

Ajouter à la fin de `tests/scoring.test.js` :

```js
describe("score — normalized, set-weighted", () => {
  it("normalizes across stats: 21 SPD outweighs 13 HP% (same NEUTRAL/KEY context)", () => {
    // Sur Will (15) : SPD est KEY (x1.25), HP% NEUTRAL (x1.0)
    const spdRune = analyzeOne(makeRune({ set_id: 15, sec_eff: [[8, 21, 0, 0]] }));
    const hpRune = analyzeOne(makeRune({ set_id: 15, sec_eff: [[2, 13, 0, 0]] }));
    // SPD: (21/6)*1.25 = 4.38 ; HP%: (13/8)*1.0 = 1.63
    expect(spdRune.score).toBeGreaterThan(hpRune.score);
    expect(spdRune.score).toBeCloseTo(4.38, 2);
    expect(hpRune.score).toBeCloseTo(1.63, 2);
  });

  it("USELESS stats contribute zero", () => {
    // RES 24 sur Rage → poids 0
    const r = analyzeOne(makeRune({ sec_eff: [[11, 24, 0, 0]] }));
    expect(r.score).toBe(0);
  });

  it("tracked innate counts at half weight", () => {
    // Innate CDmg 7 sur Rage (KEY x1.25) : (7/7)*1.25*0.5 = 0.63
    const r = analyzeOne(makeRune({ prefix_eff: [10, 7] }));
    expect(r.score).toBeCloseTo(0.63, 2);
  });

  it("flat substats and flat innates are ignored", () => {
    const r = analyzeOne(makeRune({ prefix_eff: [3, 20], sec_eff: [[1, 300, 0, 0]] }));
    expect(r.score).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/scoring.test.js`
Expected: FAIL — `score` undefined.

- [ ] **Step 3: Implement**

Dans `src/logic_analyze.js`, après `getRelevance` :

```js
// Score de comparaison d'une rune : substats normalisées par la valeur max
// d'un proc, pondérées par la pertinence du set. L'innate compte à 50 %.
function computeScore(trackedSubs, innate, setId, settings) {
  let score = 0;
  for (const s of trackedSubs) {
    const weight = SCORING.RELEVANCE_WEIGHTS[getRelevance(setId, s.type, settings)];
    score += (s.current / SCORING.ROLL_MAX[s.type]) * weight;
  }
  if (innate && SCORING.ROLL_MAX[innate.type]) {
    const weight = SCORING.RELEVANCE_WEIGHTS[getRelevance(setId, innate.type, settings)];
    score += (innate.value / SCORING.ROLL_MAX[innate.type]) * weight * 0.5;
  }
  return Math.round(score * 100) / 100;
}
```

Dans `analyzeRune`, après le calcul de `brokenSet` (l'objet `innate` est déjà construit plus bas — déplacer le bloc innate AVANT si besoin, puis) ajouter dans l'objet retourné :

```js
    score: computeScore(trackedSubs, innate, rune.set_id, settings),
```

Attention à l'ordre : le bloc qui construit `innate` (lignes ~223-237 actuelles) doit être exécuté avant l'appel à `computeScore`. Déplacer ce bloc juste après le calcul de `missPoints` si nécessaire.

Ajouter `computeScore` aux exports pour les tests :

```js
module.exports = { analyzeRunesFromFile, analyzeRunesFromData, computeScore };
```

- [ ] **Step 4: Run ALL tests**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/logic_analyze.js tests/scoring.test.js
git commit -m "feat: normalized set-weighted comparison score per rune"
```

---

### Task 6: Classement par groupe et verdicts avec exceptions

**Files:**
- Modify: `src/logic_analyze.js` (fonctions `rankRunes`, `groupKeyOf`, verdicts + exceptions ; appel dans `analyzeRunesFromFile`/`analyzeRunesFromData`)
- Test: `tests/ranking.test.js` (créer)

- [ ] **Step 1: Write the failing tests**

Créer `tests/ranking.test.js` :

```js
import { describe, it, expect } from "vitest";
import { analyzeRunesFromData } from "../src/logic_analyze.js";

let nextId = 1;
function makeRune(overrides) {
  return {
    rune_id: nextId++,
    slot_no: 2,
    set_id: 5, // Rage
    class: 6,
    extra: 4,
    upgrade_curr: 12,
    pri_eff: [8, 40],   // SPD main
    prefix_eff: [0, 0],
    sec_eff: [],
    ...overrides,
  };
}

// Une substat CDmg (KEY sur Rage) de valeur variable pour ordonner les scores.
function cdmg(value) {
  return [[10, value, 0, 0]];
}

function analyze(runes, settings) {
  return analyzeRunesFromData({ runes }, settings);
}

describe("hybrid grouping", () => {
  it("slot 2: same set+slot but different mainstat = different groups", () => {
    const out = analyze([
      makeRune({ pri_eff: [8, 40] }),
      makeRune({ pri_eff: [4, 63] }),
    ]);
    expect(out[0].groupKey).not.toBe(out[1].groupKey);
  });

  it("slot 3: mainstat ignored, same group", () => {
    const out = analyze([
      makeRune({ slot_no: 3, pri_eff: [5, 22] }),
      makeRune({ slot_no: 3, pri_eff: [5, 22] }),
    ]);
    expect(out[0].groupKey).toBe(out[1].groupKey);
  });
});

describe("ranking and verdicts", () => {
  it("ranks >=12 runes by score desc; keepCount(Rage)=3 splits KEEP/SELL", () => {
    const out = analyze([
      makeRune({ sec_eff: cdmg(28) }),
      makeRune({ sec_eff: cdmg(21) }),
      makeRune({ sec_eff: cdmg(14) }),
      makeRune({ sec_eff: cdmg(7) }),
    ]);
    const byRank = [...out].sort((a, b) => a.rank - b.rank);
    expect(byRank.map(r => r.verdict)).toEqual(["KEEP", "KEEP", "KEEP", "SELL"]);
    expect(byRank[0].groupSize).toBe(4);
  });

  it("keepCount override via settings changes the KEEP/SELL split", () => {
    const settings = { relevance: {}, keepCount: { 5: 1 }, spdThreshold: { global: 20, bySet: {}, bySlot: {} } };
    const out = analyze([
      makeRune({ sec_eff: cdmg(28) }),
      makeRune({ sec_eff: cdmg(7) }),
    ], settings);
    const byRank = [...out].sort((a, b) => a.rank - b.rank);
    expect(byRank.map(r => r.verdict)).toEqual(["KEEP", "SELL"]);
  });

  it("<+12 runes are A_MONTER (good) or JUNK (bad), never ranked", () => {
    const out = analyze([
      makeRune({ upgrade_curr: 6, sec_eff: cdmg(21) }),          // bons rolls → A_MONTER
      makeRune({ upgrade_curr: 6, sec_eff: [[11, 24, 0, 0]] }),  // RES wasted 16 > 8 → JUNK
    ]);
    expect(out[0].verdict).toBe("A_MONTER");
    expect(out[0].rank).toBeNull();
    expect(out[1].verdict).toBe("JUNK");
  });

  it("singleton group at +12 is KEEP with rank 1/1", () => {
    const out = analyze([makeRune({ sec_eff: cdmg(7) })]);
    expect(out[0].verdict).toBe("KEEP");
    expect(out[0].rank).toBe(1);
    expect(out[0].groupSize).toBe(1);
  });
});

describe("exceptions (objective state preserved)", () => {
  it("SPD >= 20 rescues a SELL into KEEP with protection SPD, rank intact", () => {
    // NB : SPD est KEY sur Rage, donc la rune SPD score haut ((21/6)*1.25=4.38).
    // Pour la faire finir 2e, la rune rivale doit scorer plus :
    // CDmg 28 → (28/7)*1.25 = 5.0 ; CRate 24 → (24/6)*1.25 = 5.0 → total 10.
    const settings = { relevance: {}, keepCount: { 5: 1 }, spdThreshold: { global: 20, bySet: {}, bySlot: {} } };
    const out = analyze([
      makeRune({ sec_eff: [[10, 28, 0, 0], [9, 24, 0, 0]] }), // score 10 → rank 1
      makeRune({ sec_eff: [[8, 21, 0, 0]] }),                 // score 4.38 → rank 2
    ], settings);
    const spdRune = out[1];
    expect(spdRune.rank).toBe(2);          // état objectif conservé
    expect(spdRune.verdict).toBe("KEEP");  // mais protégée (keepCount=1 → SELL sans exception)
    expect(spdRune.protection).toBe("SPD");
  });

  it("SPD threshold can be raised per set (bySet wins over global)", () => {
    const settings = {
      relevance: {}, keepCount: { 5: 1 },
      spdThreshold: { global: 20, bySet: { 5: 25 }, bySlot: {} },
    };
    const out = analyze([
      makeRune({ sec_eff: cdmg(28) }),
      makeRune({ sec_eff: [[8, 21, 0, 0]] }), // 21 < 25 → pas protégée
    ], settings);
    const weak = out.find(r => r.rank === 2);
    expect(weak.verdict).toBe("SELL");
    expect(weak.protection).toBeNull();
  });

  it("reap rescues a JUNK into A_MONTER (judge at +12)", () => {
    // Légendaire Rage slot 2, innate CRate 5, RES 24 gaspillée → JUNK sans reap
    const out = analyze([makeRune({
      upgrade_curr: 6, extra: 5, prefix_eff: [9, 5],
      sec_eff: [[11, 24, 0, 0]],
    })]);
    expect(out[0].reap).toBe(1);
    expect(out[0].verdict).toBe("A_MONTER");
    expect(out[0].protection).toBe("REAP");
  });

  it("quad roll (brokenSet) rescues JUNK and SELL", () => {
    // extra 5 obligatoire : seul un légendaire (procTotal 4) peut quad-roller.
    // RES 40 = 4 procs sur Rage : wastePoints 32 → JUNK sans exception
    const junk = analyze([makeRune({ extra: 5, upgrade_curr: 6, sec_eff: [[11, 40, 0, 0]] })])[0];
    expect(junk.brokenSet).toBe(true);
    expect(junk.verdict).toBe("A_MONTER");
    expect(junk.protection).toBe("BROKEN_SET");

    const settings = { relevance: {}, keepCount: { 5: 1 }, spdThreshold: { global: 20, bySet: {}, bySlot: {} } };
    const out = analyze([
      makeRune({ sec_eff: cdmg(28) }),
      makeRune({ extra: 5, sec_eff: [[11, 40, 0, 0]] }), // score 0 → rank 2 → SELL sans exception
    ], settings);
    const saved = out.find(r => r.brokenSet);
    expect(saved.verdict).toBe("KEEP");
    expect(saved.protection).toBe("BROKEN_SET");
    expect(saved.rank).toBe(2); // état objectif conservé
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/ranking.test.js`
Expected: FAIL — `groupKey`, `verdict`, `rank` undefined.

- [ ] **Step 3: Implement**

Dans `src/logic_analyze.js`, après `computeScore` :

```js
// ------------------ CLASSEMENT PAR GROUPE & VERDICTS ------------------
// Groupe de remplacement réel : slots 2/4/6 → set+slot+mainstat,
// slots 1/3/5 → set+slot.
function groupKeyOf(r) {
  return [2, 4, 6].includes(r.slot)
    ? `${r.set_id}|${r.slot}|${r.mainstat ? r.mainstat.type : "?"}`
    : `${r.set_id}|${r.slot}`;
}

function keepCountOf(setId, settings) {
  return settings?.keepCount?.[setId]
    ?? SCORING.KEEP_COUNT_DEFAULTS[setId]
    ?? SCORING.KEEP_COUNT_FALLBACK;
}

function spdThresholdOf(rune, settings) {
  const t = settings?.spdThreshold || {};
  return t.bySet?.[rune.set_id]
    ?? t.bySlot?.[rune.slot]
    ?? t.global
    ?? SCORING.SPD_THRESHOLD_DEFAULT;
}

// Mutations en place : ajoute groupKey, rank, groupSize, verdict, protection.
// Une exception protège la rune (verdict) mais ne masque jamais son état
// objectif (rank / score / wastePoints restent calculés tels quels).
function rankRunes(runes, settings) {
  const groups = new Map();
  for (const r of runes) {
    r.groupKey = groupKeyOf(r);
    if (!groups.has(r.groupKey)) groups.set(r.groupKey, []);
    if (r.rune_lvl >= 12) groups.get(r.groupKey).push(r);
  }

  for (const members of groups.values()) {
    members.sort((a, b) => b.score - a.score);
    members.forEach((r, i) => {
      r.rank = i + 1;
      r.groupSize = members.length;
    });
  }

  for (const r of runes) {
    if (r.rune_lvl < 12) {
      r.rank = null;
      r.groupSize = groups.get(r.groupKey).length;
      r.verdict = r.toJunk ? "JUNK" : "A_MONTER";
    } else {
      r.verdict = r.rank <= keepCountOf(r.set_id, settings) ? "KEEP" : "SELL";
    }

    // Exceptions — priorité : SPD > REAP > BROKEN_SET
    const spdSub = r.breakdown.find(s => s.type === 8);
    const spdValue = spdSub ? spdSub.current : 0;
    r.protection = null;
    if (spdValue >= spdThresholdOf(r, settings)) {
      r.protection = "SPD";
    } else if (r.reap === 1 && r.verdict === "JUNK") {
      r.protection = "REAP";
    } else if (r.brokenSet && (r.verdict === "JUNK" || r.verdict === "SELL")) {
      r.protection = "BROKEN_SET";
    }
    if (r.protection) {
      if (r.verdict === "JUNK") r.verdict = "A_MONTER";
      // REAP ne protège que du JUNK (la rune sera jugée à +12)
      if (r.verdict === "SELL" && r.protection !== "REAP") r.verdict = "KEEP";
    }
  }

  return runes;
}
```

Puis brancher le classement dans les deux points d'entrée :

```js
function analyzeRunesFromFile(inputFile, settings) {
  const raw = fs.readFileSync(inputFile, "utf8");
  const data = JSON.parse(raw);
  const runes = collectAllRunes(data);
  return rankRunes(runes.map(r => analyzeRune(r, settings)), settings);
}

function analyzeRunesFromData(data, settings) {
  const runes = collectAllRunes(data);
  return rankRunes(runes.map(r => analyzeRune(r, settings)), settings);
}

module.exports = { analyzeRunesFromFile, analyzeRunesFromData, computeScore, rankRunes };
```

- [ ] **Step 4: Run ALL tests**

Run: `npx vitest run`
Expected: PASS (anciens tests logic_analyze : ils lisent missPoints/threshold/procTotal/reap, tous toujours présents).

- [ ] **Step 5: Commit**

```bash
git add src/logic_analyze.js tests/ranking.test.js
git commit -m "feat: group ranking with 4 verdicts and SPD/REAP/BROKEN_SET protections"
```

---

### Task 7: IPC réglages dans main.js + preload + packaging

**Files:**
- Modify: `main.js` (chargement settings + 2 handlers IPC + passage à l'analyse)
- Modify: `preload.js` (exposer getSettings/saveSettings)
- Modify: `package.json` (ajouter `src/settings.js` à `build.files`)

Pas de test unitaire (code Electron main) — vérification manuelle en Task 10.

- [ ] **Step 1: main.js — charger/sauver les réglages**

Après la ligne `const { analyzeRunesFromFile } = require(logicPath);` ajouter :

```js
const { getDefaultSettings, sanitizeSettings } = require("./src/settings.js");

function settingsFile() {
  return path.join(app.getPath("userData"), "settings.json");
}

function loadSettings() {
  try {
    return sanitizeSettings(JSON.parse(fs.readFileSync(settingsFile(), "utf8")));
  } catch (err) {
    // fichier absent ou corrompu → défauts
    return getDefaultSettings();
  }
}
```

Ajouter les handlers IPC (à côté des existants) :

```js
// ---------------------------------------------------
// IPC — Réglages utilisateur
// ---------------------------------------------------
ipcMain.handle("get-settings", async () => loadSettings());

ipcMain.handle("save-settings", async (event, raw) => {
  const clean = sanitizeSettings(raw);
  fs.writeFileSync(settingsFile(), JSON.stringify(clean, null, 2));
  return clean;
});
```

Et dans le handler `run-analysis`, remplacer l'appel :

```js
    const results = analyzeRunesFromFile(inputFile, loadSettings());
```

- [ ] **Step 2: preload.js — exposer les 2 nouveaux appels**

```js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld("electronAPI", {
  selectJsonFile: () => ipcRenderer.invoke("select-json-file"),
  runAnalysis: (filePath) => ipcRenderer.invoke("run-analysis", filePath),
  getIconPath: (name) => ipcRenderer.invoke("get-icon-path", name),
  getSettings: () => ipcRenderer.invoke("get-settings"),
  saveSettings: (settings) => ipcRenderer.invoke("save-settings", settings)
});
```

- [ ] **Step 3: package.json — embarquer settings.js dans le build**

Dans `build.files`, ajouter `"src/settings.js"` :

```json
    "files": [
      "dist/**/*",
      "main.js",
      "preload.js",
      "package.json",
      "src/la.obf.js",
      "src/settings.js",
      "mapping.js"
    ],
```

- [ ] **Step 4: Run tests (non-regression) and commit**

Run: `npx vitest run` — Expected: PASS

```bash
git add main.js preload.js package.json
git commit -m "feat: settings persistence IPC (get-settings/save-settings), pass settings to analysis"
```

---

### Task 8: `logic_rune.jsx` — filtre verdict, tri par score, classement de groupe

**Files:**
- Modify: `src/logic_rune.jsx` (filtres + tri + remplacer `getRuneComparison` par `getGroupRanking`)
- Modify: `tests/logic_rune.test.js` (remplacer les tests de `getRuneComparison`)

- [ ] **Step 1: Write the failing tests**

Remplacer le contenu de `tests/logic_rune.test.js` par :

```js
import { describe, it, expect } from "vitest";
import { filterRunes, sortRunes, getGroupRanking } from "../src/logic_rune.jsx";

const noFilters = {
  slot: "", set: "", extra: "", miss: "",
  mainstat: "", substat: "", substatOrder: "desc",
  verdict: "",
};

function makeAnalyzed(overrides) {
  return {
    rune_id: 1,
    slot: 2,
    set_name: "Violent",
    extra: 5,
    missPoints: 0,
    reap: 0,
    rune_lvl: 12,
    score: 0,
    verdict: "KEEP",
    groupKey: "13|2|8",
    mainstat: { statName: "SPD", value: 40 },
    breakdown: [],
    ...overrides,
  };
}

describe("filterRunes — quality filter", () => {
  const data = [
    makeAnalyzed({ rune_id: 1, extra: 5 }),
    makeAnalyzed({ rune_id: 2, extra: 15 }),
    makeAnalyzed({ rune_id: 3, extra: 4 }),
  ];

  it('keeps both normal and ancient legends for extra "5,15"', () => {
    const out = filterRunes(data, { ...noFilters, extra: "5,15" }, false);
    expect(out.map(r => r.rune_id)).toEqual([1, 2]);
  });
});

describe("filterRunes — verdict filter", () => {
  const data = [
    makeAnalyzed({ rune_id: 1, verdict: "KEEP" }),
    makeAnalyzed({ rune_id: 2, verdict: "SELL" }),
    makeAnalyzed({ rune_id: 3, verdict: "JUNK" }),
  ];

  it("filters on verdict when set", () => {
    const out = filterRunes(data, { ...noFilters, verdict: "SELL" }, false);
    expect(out.map(r => r.rune_id)).toEqual([2]);
  });

  it("no verdict filter = everything passes", () => {
    expect(filterRunes(data, noFilters, false)).toHaveLength(3);
  });
});

describe("sortRunes — by score", () => {
  it("sorts descending by score", () => {
    const data = [
      makeAnalyzed({ rune_id: 1, score: 2 }),
      makeAnalyzed({ rune_id: 2, score: 5 }),
    ];
    const out = sortRunes(data, noFilters, "score");
    expect(out.map(r => r.rune_id)).toEqual([2, 1]);
  });
});

describe("crash guards", () => {
  it("filterRunes tolerates mainstat: null", () => {
    const data = [makeAnalyzed({ mainstat: null })];
    expect(() => filterRunes(data, { ...noFilters, mainstat: "SPD" }, false)).not.toThrow();
    expect(filterRunes(data, { ...noFilters, mainstat: "SPD" }, false)).toEqual([]);
  });
});

describe("getGroupRanking", () => {
  it("returns the >=12 members of the group sorted by score, plus pending count", () => {
    const a = makeAnalyzed({ rune_id: 1, score: 3 });
    const b = makeAnalyzed({ rune_id: 2, score: 7 });
    const pending = makeAnalyzed({ rune_id: 3, rune_lvl: 6, score: 1 });
    const other = makeAnalyzed({ rune_id: 4, groupKey: "5|2|4", score: 9 });
    const out = getGroupRanking(a, [a, b, pending, other]);
    expect(out.members.map(r => r.rune_id)).toEqual([2, 1]);
    expect(out.pendingCount).toBe(1);
  });

  it("returns null without a selected rune", () => {
    expect(getGroupRanking(null, [])).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/logic_rune.test.js`
Expected: FAIL — `getGroupRanking` n'existe pas, filtre verdict absent, tri score absent.

- [ ] **Step 3: Implement**

Dans `src/logic_rune.jsx` :

3a. Dans `filterRunes`, ajouter avant `return true;` :

```js
    if (filters.verdict && r.verdict !== filters.verdict) return false;
```

3b. Dans `sortRunes`, remplacer le bloc `else` :

```js
  } else {
    if (sortKey === "missPoints") {
      sorted.sort((a, b) => b.missPoints - a.missPoints);
    } else if (sortKey === "score") {
      sorted.sort((a, b) => b.score - a.score);
    }
  }
```

3c. Supprimer entièrement `getRuneComparison` et la remplacer par :

```js
// -----------------------------
// Classement du groupe d'une rune (mêmes runes de remplacement)
// -----------------------------
export function getGroupRanking(selectedRune, data) {
  if (!selectedRune) return null;

  const members = data
    .filter(r => r.groupKey === selectedRune.groupKey && r.rune_lvl >= 12)
    .sort((a, b) => b.score - a.score);

  const pendingCount = data.filter(
    r => r.groupKey === selectedRune.groupKey && r.rune_lvl < 12
  ).length;

  return { members, pendingCount };
}
```

- [ ] **Step 4: Run ALL tests**

Run: `npx vitest run`
Expected: PASS (l'ancien test de getRuneComparison a été remplacé au Step 1 ; `tests/smoke.test.js` n'importe que `filterRunes`, toujours exporté).

- [ ] **Step 5: Commit**

```bash
git add src/logic_rune.jsx tests/logic_rune.test.js
git commit -m "feat: verdict filter, score sort and group ranking helper in renderer logic"
```

---

### Task 9: UI — badges de verdict, rang, filtre, tri, modal de classement

**Files:**
- Modify: `src/ui.jsx`

Pas de test unitaire React dans ce projet — vérification manuelle en Task 10. Attention : `ui.jsx` importe `getRuneComparison` (supprimée en Task 8) — l'app dev est cassée entre Task 8 et la fin de cette task, c'est attendu.

- [ ] **Step 1: Badges et helpers**

En haut de `src/ui.jsx` (après les imports), remplacer l'import et ajouter les helpers :

```jsx
import { filterRunes, sortRunes, getGroupRanking } from "./logic_rune.jsx";

const VERDICT_STYLE = {
  JUNK:     { label: "JUNK",     background: "#e53935", color: "white" },
  A_MONTER: { label: "À MONTER", background: "#fbc02d", color: "black" },
  SELL:     { label: "SELL",     background: "#fb8c00", color: "white" },
  KEEP:     { label: "KEEP",     background: "#43a047", color: "white" },
};

const PROTECTION_LABEL = {
  SPD: "⚡ SPD",
  REAP: "REAP",
  BROKEN_SET: "BROKEN SET",
};

function VerdictBadge({ rune }) {
  const v = VERDICT_STYLE[rune.verdict];
  if (!v) return null;
  return (
    <span style={{ display: "inline-flex", gap: "4px", alignItems: "center" }}>
      <span style={{
        background: v.background, color: v.color, borderRadius: "4px",
        padding: "1px 6px", fontSize: "0.75rem", fontWeight: "bold",
      }}>
        {v.label}
      </span>
      {rune.protection && (
        <span style={{
          background: "#5e35b1", color: "white", borderRadius: "4px",
          padding: "1px 6px", fontSize: "0.7rem",
        }}>
          {PROTECTION_LABEL[rune.protection]}
        </span>
      )}
      {rune.rank != null && (
        <span style={{ fontSize: "0.75rem", color: "#555" }}>
          {rune.rank}/{rune.groupSize}
        </span>
      )}
    </span>
  );
}
```

- [ ] **Step 2: Carte de la grille**

Dans le `sorted.map((rune) => ...)`, sous la ligne MissPoints, ajouter le badge et le score :

```jsx
            <p><b>Main Stat:</b> {rune.mainstat?.statName} {rune.mainstat?.value}</p>
            <p>MissPoints: {rune.missPoints}{rune.wastePoints > 0 && <span style={{color:"#b71c1c"}}> (+{rune.wastePoints} gaspillés)</span>}</p>
            <p>Score: {rune.score} — <VerdictBadge rune={rune} /></p>
```

- [ ] **Step 3: Filtre verdict + tri par score**

3a. Ajouter `verdict: ""` à l'état initial `filters` du composant `RuneViewer`.

3b. Ajouter un select à la barre de filtres (après le select Qualité) :

```jsx
        <select value={filters.verdict} onChange={(e)=>setFilters({...filters,verdict:e.target.value})}>
          <option value="">Verdict</option>
          <option value="KEEP">KEEP</option>
          <option value="SELL">SELL</option>
          <option value="A_MONTER">À monter</option>
          <option value="JUNK">JUNK</option>
        </select>
```

3c. Ajouter le bouton de tri par score à côté du bouton MissPoints :

```jsx
        <button className="px-3 py-1 bg-blue-500 text-white rounded" onClick={() => setSortKey("score")}>
          Trier par Score
        </button>
```

3d. Corriger au passage les valeurs des options crit des filtres mainstat et substat (bug existant : `mapping.rune.effectTypes` produit `CRate`/`CDmg`, donc les options `"CRI Rate"`/`"CRI Dmg"` ne matchent jamais) :

```jsx
          <option value="CRate">Crit Rate</option>
          <option value="CDmg">Crit Damage</option>
```

(à faire dans les DEUX selects : mainstat et substat.)

- [ ] **Step 4: Modal — classement du groupe + détail du gaspillage**

Dans `RuneModal`, remplacer `const cmp = getRuneComparison(rune, data);` par :

```jsx
  const ranking = getGroupRanking(rune, data);
```

Ajouter le verdict sous le titre (après la ligne `<p><b>Niveau:</b> ...`) :

```jsx
        <p><b>Verdict:</b> <VerdictBadge rune={rune} /></p>
        {rune.wastePoints > 0 && (
          <p style={{color:"#b71c1c"}}>
            <b>{rune.wastePoints} points gaspillés</b> dans des substats inutiles pour ce set
          </p>
        )}
```

Dans la boucle `rune.breakdown.map(...)`, marquer les stats inutiles — remplacer le `<p key={i}>` existant par :

```jsx
            <p key={i} style={s.relevance === "USELESS" ? { opacity: 0.55 } : {}}>
              <b>{s.statName}</b>: {s.current}
              {s.relevance === "USELESS" && <span style={{color:"#b71c1c"}}> (inutile sur ce set{s.waste > 0 ? `, ${s.waste} pts gaspillés` : ""})</span>}
              {s.relevance === "KEY" && <span style={{color:"#2e7d32"}}> ★</span>}
              {!s.isFlat && s.miss > 0 && <span style={{color:"red"}}> (miss {s.miss})</span>}
              {s.gemmed && <span style={{color:"blue",marginLeft:"6px"}}>💎</span>}
            </p>
```

Remplacer tout le bloc `{cmp && (...)}` par le classement du groupe :

```jsx
        {ranking && (
          <div style={{marginTop:"12px",padding:"8px",background:"#eee",borderRadius:"8px"}}>
            <h3>Classement du groupe ({ranking.members.length} runes ≥ +12{ranking.pendingCount > 0 ? `, ${ranking.pendingCount} à monter` : ""})</h3>
            {ranking.members.length === 0 && <p>Aucune rune ≥ +12 dans ce groupe.</p>}
            {ranking.members.map((r, i) => (
              <p key={r.rune_id} style={{
                fontWeight: r.rune_id === rune.rune_id ? "bold" : "normal",
                background: r.rune_id === rune.rune_id ? "#fff59d" : "transparent",
                padding: "2px 4px", borderRadius: "4px",
              }}>
                #{i + 1} — score {r.score} — {r.verdict}
                {" "}({r.breakdown.filter(s => !s.isFlat).map(s => `${s.statName} ${s.current}`).join(", ") || "aucune substat"})
              </p>
            ))}
          </div>
        )}
```

- [ ] **Step 5: Run tests + commit**

Run: `npx vitest run` — Expected: PASS (l'UI n'est pas testée unitairement mais rien d'autre ne doit casser).

```bash
git add src/ui.jsx
git commit -m "feat: verdict badges, group rank, verdict filter, score sort and group ranking modal"
```

---

### Task 10: Panneau de réglages + relance de l'analyse

**Files:**
- Create: `src/settings_panel.jsx`
- Modify: `src/ui.jsx` (composant `App` : bouton Réglages + re-analyse après sauvegarde)

- [ ] **Step 1: Créer `src/settings_panel.jsx`**

```jsx
// settings_panel.jsx
// Panneau de réglages : matrice set × substat (KEY/NEUTRAL/USELESS),
// N runes à garder par set, seuil SPD global.
// Les valeurs affichées = défauts de mapping fusionnés avec les surcharges.
import React, { useState, useEffect } from "react";
import mapping from "../mapping.js";

const TRACKED = [2, 4, 6, 8, 9, 10, 11, 12];
const LEVEL_CYCLE = { KEY: "NEUTRAL", NEUTRAL: "USELESS", USELESS: "KEY" };
const LEVEL_STYLE = {
  KEY:     { background: "#43a047", color: "white" },
  NEUTRAL: { background: "#e0e0e0", color: "#333" },
  USELESS: { background: "#e53935", color: "white" },
};

const SCORING = mapping.runeScoring;
const SET_IDS = Object.keys(mapping.rune.sets).map(Number);

function defaultLevel(setId, type) {
  return SCORING.SET_RELEVANCE[setId]?.[type] || (type === 8 ? "KEY" : "NEUTRAL");
}

function effectiveLevel(settings, setId, type) {
  return settings.relevance?.[setId]?.[type] || defaultLevel(setId, type);
}

function defaultKeepCount(setId) {
  return SCORING.KEEP_COUNT_DEFAULTS[setId] ?? SCORING.KEEP_COUNT_FALLBACK;
}

export function SettingsPanel({ onClose, onSaved }) {
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    window.electronAPI.getSettings().then(setSettings);
  }, []);

  if (!settings) return null;

  function cycleLevel(setId, type) {
    const next = LEVEL_CYCLE[effectiveLevel(settings, setId, type)];
    if (type === 8 && next === "USELESS") return; // SPD jamais inutile
    const relevance = { ...settings.relevance, [setId]: { ...settings.relevance[setId] } };
    if (next === defaultLevel(setId, type)) {
      delete relevance[setId][type]; // retour au défaut → on retire la surcharge
      if (Object.keys(relevance[setId]).length === 0) delete relevance[setId];
    } else {
      relevance[setId][type] = next;
    }
    setSettings({ ...settings, relevance });
  }

  function setKeepCount(setId, value) {
    const keepCount = { ...settings.keepCount };
    const n = parseInt(value, 10);
    if (!Number.isInteger(n) || n <= 0 || n === defaultKeepCount(setId)) {
      delete keepCount[setId];
    } else {
      keepCount[setId] = n;
    }
    setSettings({ ...settings, keepCount });
  }

  async function save() {
    const clean = await window.electronAPI.saveSettings(settings);
    setSettings(clean);
    onSaved();
  }

  async function reset() {
    const clean = await window.electronAPI.saveSettings({});
    setSettings(clean);
    onSaved();
  }

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: "900px", maxHeight: "85vh", overflow: "auto" }}
           onClick={(e) => e.stopPropagation()}>
        <h2>Réglages</h2>

        <p>
          <b>Seuil SPD (protection) :</b>{" "}
          <input
            type="number"
            style={{ width: "70px" }}
            value={settings.spdThreshold.global}
            onChange={(e) => setSettings({
              ...settings,
              spdThreshold: { ...settings.spdThreshold, global: Number(e.target.value) || 20 },
            })}
          />
          {" "}(une rune avec autant de SPD en substat n'est jamais vendue)
        </p>

        <h3>Pertinence des substats par set (cliquer pour changer) et runes à garder (N)</h3>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", fontSize: "0.8rem" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "2px 6px" }}>Set</th>
                {TRACKED.map(t => (
                  <th key={t} style={{ padding: "2px 6px" }}>{mapping.rune.effectTypes[t]}</th>
                ))}
                <th style={{ padding: "2px 6px" }}>N</th>
              </tr>
            </thead>
            <tbody>
              {SET_IDS.map(setId => (
                <tr key={setId}>
                  <td style={{ padding: "2px 6px" }}><b>{mapping.rune.sets[setId]}</b></td>
                  {TRACKED.map(type => {
                    const level = effectiveLevel(settings, setId, type);
                    return (
                      <td key={type} style={{ padding: "2px" }}>
                        <button
                          style={{ ...LEVEL_STYLE[level], border: "none", borderRadius: "4px",
                                   padding: "2px 6px", cursor: "pointer", width: "100%" }}
                          onClick={() => cycleLevel(setId, type)}
                        >
                          {level === "KEY" ? "CLÉ" : level === "USELESS" ? "INUTILE" : "—"}
                        </button>
                      </td>
                    );
                  })}
                  <td style={{ padding: "2px" }}>
                    <input
                      type="number"
                      min="1"
                      style={{ width: "50px" }}
                      value={settings.keepCount[setId] ?? defaultKeepCount(setId)}
                      onChange={(e) => setKeepCount(setId, e.target.value)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
          <button onClick={save} style={{ flex: 1 }}>Enregistrer et relancer l'analyse</button>
          <button onClick={reset}>Réinitialiser aux défauts</button>
          <button onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Brancher dans `App` (src/ui.jsx)**

Ajouter l'import en haut :

```jsx
import { SettingsPanel } from "./settings_panel.jsx";
```

Remplacer le composant `App` :

```jsx
export function App() {
  const [file, setFile] = useState(null);
  const [runes, setRunes] = useState([]);
  const [showSettings, setShowSettings] = useState(false);

  async function selectFile() {
    const filePath = await window.electronAPI.selectJsonFile();
    if (!filePath) return;
    setFile(filePath);
    setRunes(await window.electronAPI.runAnalysis(filePath));
  }

  // Après sauvegarde des réglages : re-analyser le fichier courant
  async function onSettingsSaved() {
    if (file) setRunes(await window.electronAPI.runAnalysis(file));
  }

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        {runes.length > 0 && <p>{runes.length} runes analysées</p>}
      </div>
      <button className="px-4 py-2 bg-green-600 text-white rounded" onClick={selectFile}>
        Sélectionner un fichier JSON
      </button>
      <button className="px-4 py-2 bg-gray-600 text-white rounded" style={{marginLeft:"8px"}}
              onClick={() => setShowSettings(true)}>
        ⚙️ Réglages
      </button>
      {file && <p className="mt-2">Fichier sélectionné : {file}</p>}
      {runes.length > 0 && <RuneViewer data={runes} />}
      {showSettings && (
        <SettingsPanel onClose={() => setShowSettings(false)} onSaved={onSettingsSaved} />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Vérification manuelle complète (dev)**

Terminal 1 : `npm run dev` — Terminal 2 : `npm start`, puis charger `Roikku7-7294441.json` et vérifier :

1. Chaque carte affiche un badge verdict + score ; les runes ≥ +12 affichent « rang/groupe ».
2. Filtre « Verdict » = SELL → uniquement des runes ≥ +12 battues dans leur groupe.
3. Ouvrir une rune Rage avec RES : la RES est grisée « inutile sur ce set », wastePoints affichés.
4. Le modal montre le classement du groupe, la rune courante surlignée.
5. ⚙️ Réglages : passer RES de Rage en « — » (NEUTRAL), enregistrer → l'analyse se relance, les wastePoints de ces runes disparaissent.
6. Réinitialiser aux défauts → retour à l'état initial.
7. Une rune avec SPD ≥ 20 en substat affiche le badge violet « ⚡ SPD » et n'est ni SELL ni JUNK.

- [ ] **Step 4: Commit**

```bash
git add src/settings_panel.jsx src/ui.jsx
git commit -m "feat: settings panel (relevance matrix, keep counts, SPD threshold) with re-analysis"
```

---

### Task 11: Vérification finale et build

- [ ] **Step 1: Full test suite**

Run: `npx vitest run`
Expected: PASS — ~35+ tests (9 d'origine dont 3 réécrits en Task 8, plus les nouveaux).

- [ ] **Step 2: Build packagé**

Run: `npm run dist`
Expected: `release/Account Optimizer Setup 1.0.0.exe` généré sans erreur. Vérifier que `npm run obfuscate` a bien régénéré `src/la.obf.js` (le packagé charge la version obfusquée de la NOUVELLE logique — c'est le piège classique de ce projet).

- [ ] **Step 3: Smoke test du build**

Lancer `release/win-unpacked/Account Optimizer.exe`, charger le JSON de test, vérifier badges + réglages fonctionnels (les réglages sont dans `%APPDATA%/sorting_optimizer/settings.json`).

- [ ] **Step 4: Documentation + commit final**

Mettre à jour `HOW_IT_WORKS.txt` : ajouter sous « Key scoring ideas » :

```
  - wastePoints = procs investis dans des substats inutiles pour le set
    (table SET_RELEVANCE dans mapping.js, surchargeable via ⚙️ Réglages,
    persistée dans %APPDATA%/sorting_optimizer/settings.json)
  - score = substats normalisées (valeur / roll max) pondérées par la
    pertinence du set (CLÉ 1.25 / NEUTRE 1.0 / INUTILE 0)
  - verdicts : JUNK (<+12, mauvais rolls) / A_MONTER (<+12, prometteuse)
    / KEEP (>=+12, top N de son groupe set+slot[+mainstat]) / SELL
  - exceptions qui protègent une rune : SPD >= 20 (réglable), reap,
    quad roll (4 procs dans une même substat -> broken set)
```

```bash
git add HOW_IT_WORKS.txt
git commit -m "docs: describe verdicts, wastePoints, score and settings in HOW_IT_WORKS"
```

---

## Self-review effectué

- **Couverture spec** : §1 table → Task 1 ; §2 wastePoints → Task 4 ; §3 score → Task 5 ; §4 groupes/classement + §5 exceptions/transparence → Task 6 ; §6 réglages persistés → Tasks 3+7+10 ; §7 UI → Tasks 9+10 ; §8 corrections IDs → Task 2 ; §9 architecture respectée (données dans mapping, logique dans logic_analyze CommonJS, IPC dans main) ; §10 erreurs (settings corrompus → défauts Task 7, set inconnu → NEUTRAL/fallback 3 Tasks 1+4, groupe singleton → test Task 6) ; §11 tests répartis dans chaque task.
- **Types cohérents** : `verdict` ("JUNK"|"A_MONTER"|"KEEP"|"SELL"), `protection` ("SPD"|"REAP"|"BROKEN_SET"|null), `rank` (number|null), `groupKey` (string), champs breakdown `relevance`/`waste` — identiques entre Tasks 4/6/8/9.
- **Piège connu documenté** : l'app packagée charge `la.obf.js` — `npm run dist` (Task 11) régénère l'obfusqué ; en dev la logique fraîche est chargée directement.
