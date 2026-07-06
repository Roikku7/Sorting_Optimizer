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
    if (filters.mainstat && r.mainstat.statName !== filters.mainstat) return false;
    if (showReapOnly && r.reap !== 1) return false;
    if (filters.substat) {
      const hasStat = r.breakdown.some(s => s.statName === filters.substat);
      if (!hasStat) return false;
    }
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
    }
  }

  return sorted;
}

// -----------------------------
// Comparaison d’une rune
// -----------------------------
export function getRuneComparison(selectedRune, data) {
  if (!selectedRune) return null;

  const nonFlatSubs = selectedRune.breakdown.filter(s => !s.statName.includes("flat"));
  const sortedSubs = [...nonFlatSubs].sort((a,b)=> b.current - a.current);
  const bestSub = sortedSubs[0];
  const secondBestSub = sortedSubs[1];

  const sameSetSlotMain = data.filter(r =>
    r.set_name === selectedRune.set_name &&
    r.slot === selectedRune.slot &&
    r.mainstat.statName === selectedRune.mainstat.statName
  );

  const maxBest = Math.max(...sameSetSlotMain.map(r => {
    const stat = r.breakdown.find(s => s.statName === bestSub.statName);
    return stat ? stat.current : 0;
  }));

  const countBetterBest = sameSetSlotMain.filter(r => {
    if (r.rune_id === selectedRune.rune_id) return false;
    const stat1 = r.breakdown.find(s => s.statName === bestSub.statName);
    return stat1 && stat1.current >= bestSub.current;
  }).length;

  const maxSecond = Math.max(...sameSetSlotMain.map(r => {
    const stat = r.breakdown.find(s => s.statName === secondBestSub.statName);
    return stat ? stat.current : 0;
  }));

  const countBetterBoth = sameSetSlotMain.filter(r => {
    if (r.rune_id === selectedRune.rune_id) return false;
    const stat1 = r.breakdown.find(s => s.statName === bestSub.statName);
    const stat2 = r.breakdown.find(s => s.statName === secondBestSub.statName);
    return stat1 && stat2 && stat1.current >= bestSub.current && stat2.current >= secondBestSub.current;
  }).length;

  const messages = [];
  if (countBetterBest === 0) {
    messages.push(`C’est la meilleure rune sur sa substat principale (${bestSub.statName}) !`);
  }
  if (countBetterBoth === 0) {
    messages.push(`C’est la meilleure combinaison sur ${bestSub.statName} + ${secondBestSub.statName} !`);
  }

  return {
    bestSub,
    secondBestSub,
    maxBest,
    countBetterBest,
    maxSecond,
    countBetterBoth,
    messages: messages || []
  };
}