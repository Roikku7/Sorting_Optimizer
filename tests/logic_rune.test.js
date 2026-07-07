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

  it("tie-breaks equal scores by rune_id like rankRunes", () => {
    const a = makeAnalyzed({ rune_id: 7, score: 3 });
    const b = makeAnalyzed({ rune_id: 2, score: 3 });
    const out = getGroupRanking(a, [a, b]); // a inséré avant b exprès
    expect(out.members.map(r => r.rune_id)).toEqual([2, 7]);
  });
});
