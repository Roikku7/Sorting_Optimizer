import { describe, it, expect } from "vitest";
import { analyzeRunesFromData } from "../src/logic_analyze.js";

function makeRune(overrides) {
  return {
    rune_id: 1,
    slot_no: 2,
    set_id: 13, // Violent
    class: 6,
    extra: 5,
    upgrade_curr: 12,
    pri_eff: [8, 40],   // SPD main
    prefix_eff: [0, 0],
    sec_eff: [],
    ...overrides,
  };
}

function analyzeOne(rune) {
  return analyzeRunesFromData({ runes: [rune] })[0];
}

describe("analyzeRune — legendary miss points", () => {
  it("normal legendary SPD uses the heroic cap (regression)", () => {
    // SPD 26, base 4–6, proc 4–6 → assigned 4 (window [20,30])
    // heroic max = 6 + 3*6 = 24 → miss = max(0, 24-26) = 0
    const r = analyzeOne(makeRune({ extra: 5, sec_eff: [[8, 26, 0, 0]] }));
    expect(r.missPoints).toBe(0);
  });

  it("ancient legendary SPD also uses the heroic cap with ancient bases", () => {
    // SPD 29, ancient base 5–7, proc 4–6 → assigned 4 (window [21,31])
    // heroic max = 7 + 3*6 = 25 → miss = max(0, 25-29) = 0
    // Bug: extra===15 falls to the standard path → miss = (7+4*6)-29 = 2
    const r = analyzeOne(makeRune({ extra: 15, sec_eff: [[8, 29, 0, 0]] }));
    expect(r.isAncient).toBe(1);
    expect(r.missPoints).toBe(0);
  });

  it("ancient runes get at most 4 procs (extra % 10), not extra - 1", () => {
    const r = analyzeOne(makeRune({ extra: 15, sec_eff: [] }));
    expect(r.procTotal).toBe(4); // bug: currently 14
  });
});

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
