// src/logic_analyze.js
// Refactor de analyze_runes_final.js pour usage en module (CommonJS)

const fs = require("fs");
const path = require("path");
const mapping = require("../mapping.js");

// ------------------ BASE VALUES FOR ANCIENT RUNES ------------------
const ANCIENT_BASE_VALUES = {
  2: { baseMin: 6, baseMax: 10 },  // HP%
  4: { baseMin: 6, baseMax: 10 },  // ATK%
  6: { baseMin: 6, baseMax: 10 },  // DEF%
  11: { baseMin: 6, baseMax: 10 }, // RES%
  12: { baseMin: 6, baseMax: 10 }, // ACC%
  8: { baseMin: 5, baseMax: 7 },   // SPD
  9: { baseMin: 5, baseMax: 7 },   // Crit Rate
  10: { baseMin: 5, baseMax: 9 },  // Crit Damage
  1: { baseMin: 165, baseMax: 335 }, // HP flat
  3: { baseMin: 12, baseMax: 24 },   // ATK flat
  5: { baseMin: 12, baseMax: 24 }    // DEF flat
};

// ------------------ TRACKED SUBSTATS ------------------
const TRACKED_TYPES = [2, 4, 6, 8, 9, 10, 11, 12];

const SET_TOLERANCE = {
  13: 3, // Violent
  15: 2, // Will
  10: 2, // Despair
  18: 2, // Destroy
  14: 2  // Nemesis
};

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

function heroicExpectedMax(type, assigned, grade, isAncient) {
  const { baseMin, baseMax, procMin, procMax } =
    getBaseAndProcValues(type, grade, isAncient);
  const heroicProcs = Math.min(assigned, 3);
  return baseMax + heroicProcs * procMax;
}

function getBaseAndProcValues(type, grade, isAncient) {
  let baseMin, baseMax;

  // Base values (Ancient vs normal)
  if (isAncient && ANCIENT_BASE_VALUES[type]) {
    baseMin = ANCIENT_BASE_VALUES[type].baseMin;
    baseMax = ANCIENT_BASE_VALUES[type].baseMax;
  } else {
    const meta = mapping.rune?.substat?.[type] ?? null;
    if (meta?.min?.[grade] != null && meta?.max?.[grade] != null) {
      baseMin = meta.min[grade];
      baseMax = meta.max[grade];
    } else {
      // Fallbacks normal
      if (type === 12 || type === 11) { baseMin = 4; baseMax = 8; }    // ACC/RES
      else if (type === 8 || type === 9) { baseMin = 4; baseMax = 6; } // SPD/CRate
      else if (type === 10) { baseMin = 4; baseMax = 7; }              // CDMG
      else { baseMin = 5; baseMax = 8; }                               // HP%/ATK%/DEF%
    }
  }

  // Proc values (toujours normal)
  let procMin, procMax;
  if (type === 12 || type === 11) { procMin = 4; procMax = 8; }
  else if (type === 8 || type === 9) { procMin = 4; procMax = 6; }
  else if (type === 10) { procMin = 4; procMax = 7; }
  else { procMin = 5; procMax = 8; }

  return { baseMin, baseMax, procMin, procMax };
}

function detectProcsMethodA(type, currentValue, procTotal, grade, isAncient) {
  const { baseMin, baseMax, procMin, procMax } = getBaseAndProcValues(type, grade, isAncient);

  // 1) test direct 0..procTotal
  for (let n = 0; n <= procTotal; n++) {
    const minPossible = baseMin + n * procMin;
    const maxPossible = baseMax + n * procMax;
    if (currentValue >= minPossible && currentValue <= maxPossible) {
      return {
        assigned: n,
        baseMin, baseMax, procMin, procMax,
        minPossible, maxPossible,
        matched: true
      };
    }
  }

  // 2) fallback: n qui minimise la distance
  let bestN = 0;
  let bestDist = Infinity;
  for (let n = 0; n <= procTotal; n++) {
    const minPossible = baseMin + n * procMin;
    const maxPossible = baseMax + n * procMax;
    let dist = 0;
    if (currentValue < minPossible) dist = minPossible - currentValue;
    else if (currentValue > maxPossible) dist = currentValue - maxPossible;
    if (dist < bestDist) {
      bestDist = dist;
      bestN = n;
    }
  }

  return {
    assigned: bestN,
    baseMin, baseMax, procMin, procMax,
    minPossible: baseMin + bestN * procMin,
    maxPossible: baseMax + bestN * procMax,
    fallbackDistance: bestDist,
    matched: false
  };
}

function calculateMissPoints(currentValue, assigned, baseMin, baseMax, procMin, procMax) {
  if (assigned === 0) return 0;
  const maxExpected = baseMax + assigned * procMax;
  return Math.max(0, maxExpected - currentValue);
}

function collectAllRunes(data) {
  const list = [];
  if (data.runes) list.push(...data.runes);
  if (data.unit_list) {
    data.unit_list.forEach(u => { if (u.runes) list.push(...u.runes); });
  }
  if (data.storage_runes) list.push(...data.storage_runes);
  if (data.rune_list) list.push(...data.rune_list);
  return list;
}

// ------------------ ANALYSE D’UNE RUNE ------------------
function analyzeRune(rune, settings) {
  const grade = rune.class;
  const isAncient = rune.extra >= 11 ? 1 : 0;
  const procTotal = Math.max(0, (rune.extra % 10) - 1); // extra 11–15 = ancient qualities

  let trackedSubs = [];
  let flatSubs = [];

  for (const sub of rune.sec_eff || []) {
    const [type, currentValue, gemFlag] = sub;

    // Flats / non-tracked
    if (!TRACKED_TYPES.includes(type)) {
      flatSubs.push({
        type,
        statName: mapping.rune.effectTypes[type] || `Type${type}`,
        current: currentValue,
        gemmed: gemFlag === 1 ? true : false,
        isFlat: true
      });
      continue;
    }

    // Tracked stats
    const result = detectProcsMethodA(type, currentValue, procTotal, grade, isAncient);
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
        gemmed: true,
        relevance,
        waste: relevance === "USELESS" ? result.procMax : 0
      });
      continue;
    }

    // Non-gem → miss via heroic pour légendaires, sinon calcul standard
    let miss;
    if (rune.extra === 5 || rune.extra === 15) {
      const heroicMax = heroicExpectedMax(type, result.assigned, grade, isAncient);
      miss = Math.max(0, heroicMax - currentValue);
    } else {
      miss = calculateMissPoints(
        currentValue,
        result.assigned,
        result.baseMin,
        result.baseMax,
        result.procMin,
        result.procMax
      );
    }

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
      gemmed: false,
      relevance,
      waste: relevance === "USELESS" ? result.assigned * result.procMax : 0
    });
  }

  const procAssignedDetected = trackedSubs.reduce((s, x) => s + x.assignedProcs, 0);
  const missPoints = trackedSubs.reduce(
    (s, x) => s + (x.relevance === "USELESS" ? 0 : x.miss), 0);
  const wastePoints = trackedSubs.reduce((s, x) => s + (x.waste || 0), 0);
  const brokenSet = trackedSubs.some(x => !x.gemmed && x.assignedProcs >= 4);

  const mainstat = rune.pri_eff
    ? {
        type: rune.pri_eff[0],
        statName: mapping.rune.effectTypes[rune.pri_eff[0]] || `Type${rune.pri_eff[0]}`,
        value: rune.pri_eff[1]
      }
    : null;

  const rune_lvl = rune.upgrade_curr ?? 0;

  // Seuils de junk
  let threshold = 8;
  if (SET_TOLERANCE[rune.set_id]) threshold += SET_TOLERANCE[rune.set_id];

  // Innate
  let innate = null;
  let innateType = 0;
  let innateValue = 0;
  if (Array.isArray(rune.prefix_eff)) {
    const [innType, innValue] = rune.prefix_eff;
    if (innType !== 0) {
      innate = {
        type: innType,
        statName: mapping.rune.effectTypes[innType] || `Type${innType}`,
        value: innValue
      };
      innateType = innType;
      innateValue = innValue;
    }
  }

  // Reap
  const REAP_SET_ALL_SLOTS = [13, 15, 14, 10, 3]; // Violent, Will, Nemesis, Despair, Swift
  const REAP_SET_SLOT246 = [13, 15, 10, 3, 18, 11, 5, 4, 24, 16]; // + Destroy, Vampire, Rage, Blade, Seal, Shield

  let isLegendary = (rune.extra === 5 || rune.extra === 15);
  let reap = 0;
  if (isLegendary) {
    let reapEligible = false;
    if (REAP_SET_ALL_SLOTS.includes(rune.set_id)) {
      reapEligible = true;
    } else if ([2, 4, 6].includes(rune.slot_no) && REAP_SET_SLOT246.includes(rune.set_id)) {
      reapEligible = true;
    }

    if (reapEligible) {
      if (innateType === 9 && innateValue >= 5) reap = 1;     // Crit Rate
      if (innateType === 10 && innateValue >= 6) reap = 1;    // Crit Damage
      if ([11, 12].includes(innateType) && innateValue >= 7) reap = 1; // RES/ACC
    }
  }

  return {
    rune_id: rune.rune_id,
    slot: rune.slot_no,
    set_id: rune.set_id,
    set_name: mapping.rune.sets[rune.set_id] || "Unknown",

    isAncient, // 0 ou 1

    mainstat,
    rune_lvl,
    innate,
    reap,
    extra: rune.extra,
    class: rune.class,
    procTotal,
    procAssignedDetected,
    missPoints,
    wastePoints,
    score: computeScore(trackedSubs, innate, rune.set_id, settings),
    brokenSet,
    threshold,
    toJunk: missPoints + wastePoints > threshold,
    breakdown: [...trackedSubs, ...flatSubs]
  };
}

// ------------------ EXPORTS ------------------
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

module.exports = { analyzeRunesFromFile, analyzeRunesFromData, computeScore };
