import { describe, expect, it } from "vitest";
import { formatAccuracyReport, type BacktestReport } from "../src/predictions/accuracy.js";
import type { AccuracyMetrics } from "../src/storage.js";

describe("accuracy evaluation", () => {
  const baseMetrics: AccuracyMetrics = {
    chat_id: 1,
    total_predictions: 0,
    correct_predictions: 0,
    accuracy_pct: 0,
    last_updated: "2026-07-18T00:00:00Z",
    market_accuracy: {},
  };

  it("formatAccuracyReport shows empty state correctly", () => {
    const report: BacktestReport = {
      chat_id: 1,
      overall: { ...baseMetrics },
      per_league: [],
      tuning_active: false,
      target_accuracy: 95,
      target_met: false,
      reasons_below_target: ["Insufficient prediction history (need 10+)"],
    };
    const text = formatAccuracyReport(report);
    expect(text).toContain("Overall: 0/0 correct (0%)");
    expect(text).toContain("Target: 95%");
    expect(text).toContain("Target not yet met");
  });

  it("formatAccuracyReport shows per-league metrics", () => {
    const report: BacktestReport = {
      chat_id: 1,
      overall: { ...baseMetrics, total_predictions: 20, correct_predictions: 18, accuracy_pct: 90 },
      per_league: [
        { ...baseMetrics, league_id: "premier-league", total_predictions: 10, correct_predictions: 9, accuracy_pct: 90, market_accuracy: {} },
        { ...baseMetrics, league_id: "la-liga", total_predictions: 10, correct_predictions: 9, accuracy_pct: 90, market_accuracy: {} },
      ],
      tuning_active: false,
      target_accuracy: 95,
      target_met: false,
      reasons_below_target: [],
    };
    const text = formatAccuracyReport(report);
    expect(text).toContain("Per League:");
    expect(text).toContain("premier-league");
    expect(text).toContain("la-liga");
  });

  it("formatAccuracyReport shows per-market metrics", () => {
    const report: BacktestReport = {
      chat_id: 1,
      overall: {
        ...baseMetrics,
        total_predictions: 10,
        correct_predictions: 8,
        accuracy_pct: 80,
        market_accuracy: {
          "Match Result": { total: 10, correct: 8 },
          "BTTS": { total: 10, correct: 6 },
        },
      },
      per_league: [],
      tuning_active: false,
      target_accuracy: 95,
      target_met: false,
      reasons_below_target: [],
    };
    const text = formatAccuracyReport(report);
    expect(text).toContain("Per Market:");
    expect(text).toContain("Match Result: 8/10 (80%)");
  });

  it("formatAccuracyReport shows target met when accuracy is high enough", () => {
    const report: BacktestReport = {
      chat_id: 1,
      overall: {
        ...baseMetrics,
        total_predictions: 20,
        correct_predictions: 19,
        accuracy_pct: 95,
        market_accuracy: {},
      },
      per_league: [],
      tuning_active: false,
      target_accuracy: 95,
      target_met: true,
      reasons_below_target: [],
    };
    const text = formatAccuracyReport(report);
    expect(text).toContain("Target met!");
  });
});
