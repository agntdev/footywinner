import { describe, expect, it } from "vitest";
import { generatePredictions, computeAccuracy } from "../src/predictions/model.js";

describe("prediction model", () => {
  it("generates exactly five markets for a match", () => {
    const markets = generatePredictions(
      "m1",
      "Arsenal",
      "Chelsea",
      "Premier League",
      "2026-08-15T15:00:00Z",
    );
    expect(markets).toHaveLength(5);
  });

  it("each market has a name, selection, and confidence", () => {
    const markets = generatePredictions(
      "m2",
      "Barcelona",
      "Real Madrid",
      "La Liga",
      "2026-09-01T20:00:00Z",
    );
    for (const m of markets) {
      expect(typeof m.market).toBe("string");
      expect(m.market.length).toBeGreaterThan(0);
      expect(typeof m.selection).toBe("string");
      expect(m.selection.length).toBeGreaterThan(0);
      expect(typeof m.confidence).toBe("number");
      expect(m.confidence).toBeGreaterThanOrEqual(25);
      expect(m.confidence).toBeLessThanOrEqual(95);
    }
  });

  it("market names are the expected five", () => {
    const markets = generatePredictions(
      "m3",
      "Liverpool",
      "Man City",
      "Premier League",
      "2026-10-01T12:00:00Z",
    );
    const names = markets.map((m) => m.market);
    expect(names).toEqual([
      "Match Result",
      "Both Teams to Score",
      "Over/Under 2.5",
      "Double Chance",
      "BTTS & Over 2.5",
    ]);
  });

  it("predictions are deterministic — same inputs produce same outputs", () => {
    const a = generatePredictions("m4", "Team A", "Team B", "Comp", "2026-01-01T00:00:00Z");
    const b = generatePredictions("m4", "Team A", "Team B", "Comp", "2026-01-01T00:00:00Z");
    expect(a).toEqual(b);
  });

  it("different matches produce different predictions", () => {
    const a = generatePredictions("m5", "Team A", "Team B", "Comp", "2026-01-01T00:00:00Z");
    const b = generatePredictions("m6", "Team C", "Team D", "Comp", "2026-02-01T00:00:00Z");
    // At least one market should differ
    const someDifferent = a.some((m, i) => m.selection !== b[i].selection);
    expect(someDifferent).toBe(true);
  });

  it("confidence is always between 25 and 95", () => {
    for (let i = 0; i < 20; i++) {
      const markets = generatePredictions(
        `test${i}`,
        `Home${i}`,
        `Away${i}`,
        "Comp",
        `2026-0${(i % 9) + 1}-01T00:00:00Z`,
      );
      for (const m of markets) {
        expect(m.confidence).toBeGreaterThanOrEqual(25);
        expect(m.confidence).toBeLessThanOrEqual(95);
      }
    }
  });
});

describe("computeAccuracy", () => {
  it("returns 0 when total is 0", () => {
    expect(computeAccuracy(0, 0)).toBe(0);
  });

  it("computes percentage correctly", () => {
    expect(computeAccuracy(10, 7)).toBe(70);
    expect(computeAccuracy(100, 95)).toBe(95);
    expect(computeAccuracy(3, 1)).toBe(33);
  });

  it("rounds to nearest integer", () => {
    expect(computeAccuracy(3, 2)).toBe(67);
    expect(computeAccuracy(3, 1)).toBe(33);
  });
});
