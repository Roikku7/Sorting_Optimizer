// logic_rune.js
// Author : Roikku7 (lle)
// date : 03/12/2025
// -----------------------------
// Filtrage des runes
// -----------------------------
export function filterRunes(data, filters, showReapOnly) {
  return data.filter((r) => {
    if (filters.slot && r.slot !== Number(filters.slot)) return false;
    if (filters.set && r.set_name !== filters.set) return false;
    if (filters.extra && !filters.extra.split(",").map(Number).includes(r.extra)) return false;
    if (filters.miss && r.missPoints < Number(filters.miss)) return false;
    if (filters.mainstat && r.mainstat?.statName !== filters.mainstat) return false;
    if (showReapOnly && r.reap !== 1) return false;
    if (filters.substat) {
      const hasStat = r.breakdown.some(s => s.statName === filters.substat);
      if (!hasStat) return false;
    }
    if (filters.verdict && r.verdict !== filters.verdict) return false;
    return true;
  });
}

// -----------------------------
// Tri des runes
// -----------------------------
export function sortRunes(data, filters, sortKey) {
  let sorted = [...data];

  if (filters.substat) {
    sorted.sort((a, b) => {
      const statA = a.breakdown.find(s => s.statName === filters.substat);
      const statB = b.breakdown.find(s => s.statName === filters.substat);
      const valA = statA ? statA.current : 0;
      const valB = statB ? statB.current : 0;
      return filters.substatOrder === "desc" ? valB - valA : valA - valB;
    });
  } else {
    if (sortKey === "missPoints") {
      sorted.sort((a, b) => b.missPoints - a.missPoints);
    } else if (sortKey === "score") {
      sorted.sort((a, b) => b.score - a.score);
    }
  }

  return sorted;
}

// -----------------------------
// Classement du groupe d’une rune (mêmes runes de remplacement)
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