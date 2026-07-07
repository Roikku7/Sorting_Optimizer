import { describe, it, expect } from "vitest";
import { analyzeRunesFromData } from "../src/logic_analyze.js";

function makeRune(overrides) {
  return {
    rune_id: 1,
    slot_no: 2,
    set_id: 5, // Rage
    class: 6,
    extra: 4,          // hero (pas légendaire → pas de chemin heroic)
    upgrade_curr: 12,
    pri_eff: [8, 40],
    prefix_eff: [0, 0],
    sec_eff: [],
    ...overrides,
  };
}

function analyzeOne(rune, settings) {
  return analyzeRunesFromData({ runes: [rune] }, settings)[0];
}

describe("wastePoints — procs in USELESS substats", () => {
  it("RES procs on Rage are fully wasted (assigned × procMax)", () => {
    // RES 24 sur hero : base 4–8, proc 4–8 → assigned 2 (fenêtre [12,24])
    // waste = 2 × 8 = 16
    const r = analyzeOne(makeRune({ sec_eff: [[11, 24, 0, 0]] }));
    expect(r.wastePoints).toBe(16);
    const res = r.breakdown.find(s => s.type === 11);
    expect(res.relevance).toBe("USELESS");
    expect(res.waste).toBe(16);
  });

  it("the same RES procs on Will are not wasted", () => {
    const r = analyzeOne(makeRune({ set_id: 15, sec_eff: [[11, 24, 0, 0]] }));
    expect(r.wastePoints).toBe(0);
    expect(r.breakdown.find(s => s.type === 11).relevance).toBe("NEUTRAL");
  });

  it("a USELESS base without procs costs nothing", () => {
    // RES 8 : dans la fenêtre base [4,8] → assigned 0 → waste 0
    const r = analyzeOne(makeRune({ sec_eff: [[11, 8, 0, 0]] }));
    expect(r.wastePoints).toBe(0);
  });

  it("a gem in a USELESS stat counts as 1 proc equivalent", () => {
    const r = analyzeOne(makeRune({ sec_eff: [[11, 8, 1, 0]] }));
    expect(r.wastePoints).toBe(8); // 1 × procMax(RES)=8
  });

  it("toJunk includes wastePoints (missPoints + waste > threshold)", () => {
    // RES 24 wasted (16) + rien d'autre : 16 > threshold 8 (Rage sans tolérance)
    const r = analyzeOne(makeRune({ sec_eff: [[11, 24, 0, 0]] }));
    expect(r.toJunk).toBe(true);
  });

  it("settings can override relevance (ACC useless on Rage)", () => {
    const settings = { relevance: { 5: { 12: "USELESS" } }, keepCount: {}, spdThreshold: { global: 20, bySet: {}, bySlot: {} } };
    // ACC 24 : assigned 2 → waste 16
    const r = analyzeOne(makeRune({ sec_eff: [[12, 24, 0, 0]] }), settings);
    expect(r.wastePoints).toBe(16);
  });
});

describe("brokenSet — quad roll detection", () => {
  it("flags a substat with 4+ assigned procs (legendary only: procTotal=4)", () => {
    // extra 5 (légendaire) → procTotal 4. RES 40 : base 4–8, proc 4–8
    // → assigned 4 (fenêtre [20,40]). Un hero (extra 4, procTotal 3)
    // ne peut jamais atteindre 4 procs dans ce modèle.
    const r = analyzeOne(makeRune({ extra: 5, sec_eff: [[11, 40, 0, 0]] }));
    expect(r.brokenSet).toBe(true);
  });

  it("does not flag 2 procs", () => {
    const r = analyzeOne(makeRune({ sec_eff: [[11, 24, 0, 0]] }));
    expect(r.brokenSet).toBe(false);
  });
});
