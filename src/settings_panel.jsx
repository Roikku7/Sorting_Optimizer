// settings_panel.jsx
// Panneau de réglages : matrice set × substat (KEY/NEUTRAL/USELESS),
// N runes à garder par set, seuil SPD global.
// Les valeurs affichées = défauts de mapping fusionnés avec les surcharges.
import React, { useState, useEffect } from "react";
import * as mappingNs from "../mapping.js";
const mapping = mappingNs.default || mappingNs;

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
    let next = LEVEL_CYCLE[effectiveLevel(settings, setId, type)];
    if (type === 8 && next === "USELESS") next = "KEY"; // SPD jamais inutile
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
