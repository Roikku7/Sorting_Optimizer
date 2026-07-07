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

  it("equal scores are tie-broken deterministically by rune_id", () => {
    const a = makeRune({ sec_eff: cdmg(14) });
    const b = makeRune({ sec_eff: cdmg(14) });
    const out = analyze([b, a]); // ordre d'entrée inversé exprès
    const first = out.find(r => r.rank === 1);
    expect(first.rune_id).toBe(Math.min(a.rune_id, b.rune_id));
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

  it("a gemmed substat contributes to the score (a gem is a real stat)", () => {
    const gemmed = analyze([makeRune({ sec_eff: [[10, 14, 1, 0]] })])[0];
    const bare = analyze([makeRune({ sec_eff: [] })])[0];
    expect(gemmed.score).toBeGreaterThan(bare.score);
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

  it("a KEEP rune with high SPD gets protection null (protection only when it rescues)", () => {
    const out = analyze([makeRune({ sec_eff: [[8, 21, 0, 0]] })]);
    expect(out[0].verdict).toBe("KEEP");
    expect(out[0].protection).toBeNull();
  });

  it("spdThreshold bySlot applies when bySet is absent", () => {
    const settings = {
      relevance: {}, keepCount: { 5: 1 },
      spdThreshold: { global: 20, bySet: {}, bySlot: { 2: 25 } },
    };
    const out = analyze([
      makeRune({ sec_eff: [[10, 28, 0, 0], [9, 24, 0, 0]] }),
      makeRune({ sec_eff: [[8, 21, 0, 0]] }), // 21 < 25 (slot 2) → pas protégée
    ], settings);
    const weak = out.find(r => r.rank === 2);
    expect(weak.verdict).toBe("SELL");
    expect(weak.protection).toBeNull();
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
