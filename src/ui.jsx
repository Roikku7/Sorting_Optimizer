// ui.jsx
// Author : Roikku7 (lle)
// date : 03/12/2025
// -----------------------------
import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import { filterRunes, sortRunes, getGroupRanking } from "./logic_rune.jsx";
import "./style.css";

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

function RuneModal({ rune, data, onClose, icons }) {
  // Hooks toujours appelés avant l'early return (Rules of Hooks :
  // le nombre de hooks ne doit pas changer quand rune passe de null à objet)
  const [iconPath, setIconPath] = useState("");

  useEffect(() => {
    if (!rune) return;
    if (window.electronAPI?.getIconPath) {
      window.electronAPI.getIconPath(rune.set_name).then(setIconPath);
    } else {
      // fallback en dev : Vite sert /public/icone/
      setIconPath(`/icone/${rune.set_name}.png`);
    }
  }, [rune?.set_name]);

  if (!rune) return null;

  const ranking = getGroupRanking(rune, data);

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-content" onClick={(e)=>e.stopPropagation()}>
        <h2>Rune Slot {rune.slot} - {rune.set_name}</h2>
        <img src={icons[rune.set_name]} alt={rune.set_name} />

        <p><b>Main Stat:</b> {rune.mainstat?.statName} {rune.mainstat?.value}</p>
        <p><b>Niveau:</b> {rune.rune_lvl}</p>
        <p><b>Verdict:</b> <VerdictBadge rune={rune} /></p>
        {rune.wastePoints > 0 && (
          <p style={{color:"#b71c1c"}}>
            <b>{rune.wastePoints} points gaspillés</b> dans des substats inutiles pour ce set
          </p>
        )}
        <p><b>MissPoints:</b> {rune.missPoints} / {rune.threshold}</p>
        <p><b>Qualité:</b> {rune.extra}</p>
        {rune.isAncient === 1 && <p style={{color:"gold"}}>✨ Rune Antique</p>}
        {rune.innate && (
          <div style={{marginTop:"8px",padding:"6px",background:"#f5f5f5",borderRadius:"6px"}}>
            <p><b>Innate:</b> {rune.innate.statName} {rune.innate.value}</p>
          </div>
        )}
        {rune.reap === 1 && (
          <p style={{color:"orange",fontWeight:"bold"}}>Bon pour Reap</p>
        )}

        <div>
          {rune.breakdown.map((s,i)=>(
            <p key={i} style={s.relevance === "USELESS" ? { opacity: 0.55 } : {}}>
              <b>{s.statName}</b>: {s.current}
              {s.relevance === "USELESS" && <span style={{color:"#b71c1c"}}> (inutile sur ce set{s.waste > 0 ? `, ${s.waste} pts gaspillés` : ""})</span>}
              {s.relevance === "KEY" && <span style={{color:"#2e7d32"}}> ★</span>}
              {!s.isFlat && s.miss > 0 && <span style={{color:"red"}}> (miss {s.miss})</span>}
              {s.gemmed && <span style={{color:"blue",marginLeft:"6px"}}>💎</span>}
            </p>
          ))}
        </div>

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

        <button onClick={onClose} style={{marginTop:"12px",width:"100%"}}>Fermer</button>
      </div>
    </div>
  );
}
/////////////////////////////////////////

export function RuneViewer({ data }) {
  const [filters, setFilters] = useState({
    slot: "",
    set: "",
    extra: "",
    miss: "",
    mainstat: "",
    substat: "",
    substatOrder: "desc",
    verdict: ""
  });
  const [sortKey, setSortKey] = useState("missPoints");
  const [selectedRune, setSelectedRune] = useState(null);
  const [showReapOnly, setShowReapOnly] = useState(false);
  const [icons, setIcons] = useState({});

  // 🎨 Couleurs par grade
  const gradeColors = {
    1: "bg-gray-300",
    2: "bg-green-300",
    3: "bg-sky-300",
    4: "bg-purple-300",
    5: "bg-amber-300",
    11: "bg-gray-300",
    12: "bg-green-300",
    13: "bg-sky-300",
    14: "bg-purple-300",
    15: "bg-amber-300",
  };

  
  const filtered = filterRunes(data, filters, showReapOnly);
  const sorted = sortRunes(filtered, filters, sortKey);

  const allSets = [...new Set(data.map((d) => d.set_name))];

  useEffect(() => {
    async function loadIcons() {
      const uniqueSets = [...new Set(data.map((r) => r.set_name))];
      const entries = await Promise.all(
        uniqueSets.map(async (setName) => {
          const src = window.electronAPI?.getIconPath
            ? await window.electronAPI.getIconPath(setName)
            : `/icone/${setName}.png`;
          return [setName, src];
        })
      );
      setIcons(Object.fromEntries(entries));
    }
    loadIcons();
  }, [data]);

  return (
    <div className="p-4">
      {/* Filtres */}
      <div className="flex flex-wrap gap-2 mb-4">
        <select value={filters.slot} onChange={(e)=>setFilters({...filters,slot:e.target.value})}>
          <option value="">Slot</option>
          {[1,2,3,4,5,6].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filters.set} onChange={(e)=>setFilters({...filters,set:e.target.value})}>
          <option value="">Set</option>
          {allSets.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filters.mainstat} onChange={(e)=>setFilters({...filters,mainstat:e.target.value})}>
          <option value="">Mainstat</option>
          <option value="HP%">HP%</option>
          <option value="ATK%">ATK%</option>
          <option value="DEF%">DEF%</option>
          <option value="SPD">Speed</option>
          <option value="CRate">Crit Rate</option>
          <option value="CDmg">Crit Damage</option>
          <option value="RES">Resistance</option>
          <option value="ACC">Accuracy</option>
        </select>
        <select value={filters.substat} onChange={(e)=>setFilters({...filters,substat:e.target.value})}>
          <option value="">Substat</option>
          <option value="SPD">Speed</option>
          <option value="RES">Resistance</option>
          <option value="ACC">Accuracy</option>
          <option value="CRate">Crit Rate</option>
          <option value="CDmg">Crit Damage</option>
          <option value="HP%">HP%</option>
          <option value="DEF%">DEF%</option>
          <option value="ATK%">ATK%</option>
        </select>
        <select value={filters.substatOrder} onChange={(e)=>setFilters({...filters,substatOrder:e.target.value})}>
          <option value="desc">Décroissant</option>
          <option value="asc">Croissant</option>
        </select>
        <select value={filters.extra} onChange={(e)=>setFilters({...filters,extra:e.target.value})}>
          <option value="">Qualité</option>
          <option value="1,11">Normal</option>
          <option value="2,12">Magic</option>
          <option value="3,13">Rare</option>
          <option value="4,14">Hero</option>
          <option value="5,15">Legend</option>
        </select>
        <select value={filters.verdict} onChange={(e)=>setFilters({...filters,verdict:e.target.value})}>
          <option value="">Verdict</option>
          <option value="KEEP">KEEP</option>
          <option value="SELL">SELL</option>
          <option value="A_MONTER">À monter</option>
          <option value="JUNK">JUNK</option>
        </select>
        <input
          type="number"
          placeholder="Min Miss"
          value={filters.miss}
          onChange={(e)=>setFilters({...filters,miss:e.target.value})}
        />
      </div>

      {/* Tri */}
      <div className="mb-2">
        <button className="px-3 py-1 bg-blue-500 text-white rounded" onClick={() => setSortKey("missPoints")}>
          Trier par MissPoints
        </button>
        <button className="px-3 py-1 bg-blue-500 text-white rounded" onClick={() => setSortKey("score")}>
          Trier par Score
        </button>
      </div>

      {/* Bouton Reap */}
      <button 
        onClick={() => setShowReapOnly(!showReapOnly)} 
        className={`px-3 py-1 rounded text-white ${showReapOnly ? "bg-orange-500" : "bg-blue-600"}`}
      >
        {showReapOnly ? "Voir toutes les runes" : "Voir Reap"}
      </button>

      {/* Liste des runes */}
      <div 
        className="rune-grid"
      >
        {sorted.map((rune) => (
          <div 
            key={rune.rune_id}
            className={`card ${gradeColors[rune.extra]}`}
            style={rune.isAncient === 1 ? {boxShadow:"0 0 10px 2px rgba(255,255,255,0.6)"} : {}}
            onClick={() => setSelectedRune(rune)}
          >
            <div className="card-header">
              <img src={icons[rune.set_name]} alt={rune.set_name} />
              <h2>Slot {rune.slot}</h2>
            </div>
            <p><b>Main Stat:</b> {rune.mainstat?.statName} {rune.mainstat?.value}</p>
            <p>MissPoints: {rune.missPoints}{rune.wastePoints > 0 && <span style={{color:"#b71c1c"}}> (+{rune.wastePoints} gaspillés)</span>}</p>
            <p>Score: {rune.score} — <VerdictBadge rune={rune} /></p>
            {rune.isAncient === 1 && <p className="antique">✨ Antique ✨</p>}
          </div>
        ))}
      </div>

      <RuneModal rune={selectedRune} data={data} icons={icons} onClose={() => setSelectedRune(null)} />
    </div>
  );
}



export function App() {
  const [file, setFile] = useState(null);
  const [runes, setRunes] = useState([]);

  async function selectFile() {
    
    const filePath = await window.electronAPI.selectJsonFile();
    if (!filePath) return; 
    setFile(filePath);

    const analyzedRunes = await window.electronAPI.runAnalysis(filePath);
    setRunes(analyzedRunes);
  }

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        {runes.length > 0 && <p>{runes.length} runes analysées</p>}
      </div>
      <button className="px-4 py-2 bg-green-600 text-white rounded" onClick={selectFile}>
        Sélectionner un fichier JSON
      </button>
      {file && <p className="mt-2">Fichier sélectionné : {file}</p>}
      {runes.length > 0 && <RuneViewer data={runes} />}
    </div>
  );
}

// Point d’entrée
document.addEventListener("DOMContentLoaded", () => {
  ReactDOM.createRoot(document.getElementById("root")).render(<App />);
});
