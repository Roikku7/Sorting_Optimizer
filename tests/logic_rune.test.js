import { describe, it, expect } from "vitest";
import { filterRunes, getRuneComparison } from "../src/logic_rune.jsx";

const noFilters = {
  slot: "", set: "", extra: "", miss: "",
  mainstat: "", substat: "", substatOrder: "desc",
};

function makeAnalyzed(overrides) {
  return {
    rune_id: 1,
    slot: 2,
    set_name: "Violent",
    extra: 5,
    missPoints: 0,
    reap: 0,
    mainstat: { statName: "SPD", value: 40 },
    breakdown: [],
    ...overrides,
  };
}

describe("filterRunes — quality filter", () => {
  const data = [
    makeAnalyzed({ rune_id: 1, extra: 5 }),   // normal legend
    makeAnalyzed({ rune_id: 2, extra: 15 }),  // ancient legend
    makeAnalyzed({ rune_id: 3, extra: 4 }),   // hero
  ];

  it('keeps both normal and ancient legends for extra "5,15"', () => {
    const out = filterRunes(data, { ...noFilters, extra: "5,15" }, false);
    expect(out.map(r => r.rune_id)).toEqual([1, 2]);
  });
});

describe("crash guards", () => {
  it("filterRunes tolerates mainstat: null", () => {
    const data = [makeAnalyzed({ mainstat: null })];
    expect(() => filterRunes(data, { ...noFilters, mainstat: "SPD" }, false)).not.toThrow();
    expect(filterRunes(data, { ...noFilters, mainstat: "SPD" }, false)).toEqual([]);
  });

  it("getRuneComparison tolerates a rune with a single non-flat substat", () => {
    const rune = makeAnalyzed({
      breakdown: [{ statName: "SPD", current: 20 }],
    });
    const cmp = getRuneComparison(rune, [rune]);
    expect(cmp.bestSub.statName).toBe("SPD");
    expect(cmp.secondBestSub).toBeNull();
  });

  it("getRuneComparison tolerates comparison pool runes with mainstat: null", () => {
    const rune = makeAnalyzed({
      breakdown: [
        { statName: "SPD", current: 20 },
        { statName: "CRI Dmg", current: 14 },
      ],
    });
    const pool = [rune, makeAnalyzed({ rune_id: 99, mainstat: null })];
    expect(() => getRuneComparison(rune, pool)).not.toThrow();
  });
});
