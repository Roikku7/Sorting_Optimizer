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

// Clés interdites sur tous les objets reconstruits (anti prototype-pollution)
function isDangerousKey(k) {
  return k === "__proto__" || k === "constructor" || k === "prototype";
}

function sanitizeSettings(raw) {
  const out = getDefaultSettings();
  if (!raw || typeof raw !== "object") return out;

  if (raw.relevance && typeof raw.relevance === "object") {
    for (const [setId, subs] of Object.entries(raw.relevance)) {
      if (isDangerousKey(setId)) continue;
      if (!subs || typeof subs !== "object") continue;
      for (const [type, level] of Object.entries(subs)) {
        if (isDangerousKey(type)) continue;
        if (!LEVELS.includes(level)) continue;
        if (Number(type) === 8 && level === "USELESS") continue; // SPD jamais inutile
        if (!out.relevance[setId]) out.relevance[setId] = {};
        out.relevance[setId][type] = level;
      }
    }
  }

  if (raw.keepCount && typeof raw.keepCount === "object") {
    for (const [setId, n] of Object.entries(raw.keepCount)) {
      if (isDangerousKey(setId)) continue;
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
        if (isDangerousKey(id)) continue;
        const v = Number(n);
        if (Number.isFinite(v) && v > 0) out.spdThreshold[key][id] = v;
      }
    }
  }

  return out;
}

module.exports = { getDefaultSettings, sanitizeSettings };
