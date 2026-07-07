import { describe, it, expect } from "vitest";
import mapping from "../mapping.js";

const TRACKED = [2, 4, 6, 8, 9, 10, 11, 12];

describe("mapping.runeScoring", () => {
  it("exposes ROLL_MAX for every tracked substat type", () => {
    for (const t of TRACKED) {
      expect(mapping.runeScoring.ROLL_MAX[t]).toBeGreaterThan(0);
    }
    expect(mapping.runeScoring.ROLL_MAX[8]).toBe(6);   // SPD
    expect(mapping.runeScoring.ROLL_MAX[10]).toBe(7);  // CDmg
    expect(mapping.runeScoring.ROLL_MAX[2]).toBe(8);   // HP%
  });

  it("marks RES useless on Rage but not on Will", () => {
    expect(mapping.runeScoring.SET_RELEVANCE[5][11]).toBe("USELESS");  // Rage/RES
    expect(mapping.runeScoring.SET_RELEVANCE[15]?.[11]).toBeUndefined(); // Will/RES => NEUTRAL implicite
  });

  it("marks ATK% useless on Guard", () => {
    expect(mapping.runeScoring.SET_RELEVANCE[2][4]).toBe("USELESS");
  });

  it("never marks SPD useless in any set", () => {
    for (const rel of Object.values(mapping.runeScoring.SET_RELEVANCE)) {
      expect(rel[8]).not.toBe("USELESS");
    }
  });

  it("has a keep count for the main sets and a fallback", () => {
    expect(mapping.runeScoring.KEEP_COUNT_DEFAULTS[13]).toBe(6); // Violent
    expect(mapping.runeScoring.KEEP_COUNT_DEFAULTS[5]).toBe(3);  // Rage
    expect(mapping.runeScoring.KEEP_COUNT_FALLBACK).toBe(3);
  });
});
