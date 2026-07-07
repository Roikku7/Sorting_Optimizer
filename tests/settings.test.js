import { describe, it, expect } from "vitest";
import { getDefaultSettings, sanitizeSettings } from "../src/settings.js";

describe("getDefaultSettings", () => {
  it("returns empty overrides and the default SPD threshold", () => {
    const s = getDefaultSettings();
    expect(s.relevance).toEqual({});
    expect(s.keepCount).toEqual({});
    expect(s.spdThreshold).toEqual({ global: 20, bySet: {}, bySlot: {} });
  });
});

describe("sanitizeSettings", () => {
  it("returns defaults for garbage input", () => {
    expect(sanitizeSettings(null)).toEqual(getDefaultSettings());
    expect(sanitizeSettings("nope")).toEqual(getDefaultSettings());
    expect(sanitizeSettings(42)).toEqual(getDefaultSettings());
  });

  it("keeps valid relevance overrides and drops invalid levels", () => {
    const s = sanitizeSettings({
      relevance: { 5: { 12: "USELESS", 9: "BANANA" } },
    });
    expect(s.relevance[5][12]).toBe("USELESS");
    expect(s.relevance[5][9]).toBeUndefined();
  });

  it("refuses to mark SPD (type 8) as USELESS", () => {
    const s = sanitizeSettings({ relevance: { 5: { 8: "USELESS" } } });
    expect(s.relevance[5]?.[8]).toBeUndefined();
  });

  it("keeps positive integer keep counts, drops the rest", () => {
    const s = sanitizeSettings({ keepCount: { 13: 8, 5: -2, 4: "x" } });
    expect(s.keepCount).toEqual({ 13: 8 });
  });

  it("sanitizes spd thresholds (numbers only, keeps overrides)", () => {
    const s = sanitizeSettings({
      spdThreshold: { global: 22, bySet: { 5: 24, 4: "x" }, bySlot: { 2: 18 } },
    });
    expect(s.spdThreshold.global).toBe(22);
    expect(s.spdThreshold.bySet).toEqual({ 5: 24 });
    expect(s.spdThreshold.bySlot).toEqual({ 2: 18 });
  });
});
