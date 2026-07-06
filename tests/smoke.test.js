import { describe, it, expect } from "vitest";
import { analyzeRunesFromData } from "../src/logic_analyze.js";
import { filterRunes } from "../src/logic_rune.jsx";

describe("smoke", () => {
  it("imports the CJS analysis engine", () => {
    expect(typeof analyzeRunesFromData).toBe("function");
  });
  it("imports the ESM filter module", () => {
    expect(typeof filterRunes).toBe("function");
  });
});
