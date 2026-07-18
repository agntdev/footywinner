import type { PredictionMarket } from "../storage.js";

/**
 * Deterministic prediction engine.
 * Uses a hash of team names + match datetime to generate consistent predictions
 * with confidence scores for five football markets. No randomness — same inputs
 * always produce the same outputs, enabling reproducible backtesting.
 */

function hashStr(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function seededRandom(seed: string): number {
  const h = hashStr(seed);
  return (h % 10000) / 10000;
}

function clampConfidence(v: number): number {
  return Math.max(25, Math.min(95, Math.round(v)));
}

export interface MatchPredictions {
  match_id: string;
  markets: PredictionMarket[];
}

/**
 * Generate five market predictions for a match.
 * Markets: Match Result, BTTS, Over/Under 2.5, Double Chance, BTTS & O2.5
 */
export function generatePredictions(
  matchId: string,
  homeTeam: string,
  awayTeam: string,
  competition: string,
  matchDatetime: string,
): PredictionMarket[] {
  const seed = `${homeTeam}:${awayTeam}:${competition}:${matchDatetime}`;
  const r1 = seededRandom(seed + ":result");
  const r2 = seededRandom(seed + ":btts");
  const r3 = seededRandom(seed + ":ou25");
  const r4 = seededRandom(seed + ":dc");
  const r5 = seededRandom(seed + ":bttsou");

  // Market 1: Match Result
  let matchResult: string;
  let matchResultConf: number;
  if (r1 < 0.45) {
    matchResult = "Home Win";
    matchResultConf = clampConfidence(50 + r1 * 50);
  } else if (r1 < 0.75) {
    matchResult = "Away Win";
    matchResultConf = clampConfidence(45 + (r1 - 0.45) * 50);
  } else {
    matchResult = "Draw";
    matchResultConf = clampConfidence(35 + (r1 - 0.75) * 40);
  }

  // Market 2: Both Teams to Score
  const btts = r2 > 0.4;
  const bttsConf = btts
    ? clampConfidence(50 + r2 * 45)
    : clampConfidence(45 + (1 - r2) * 40);

  // Market 3: Over/Under 2.5 Goals
  const over = r3 > 0.45;
  const ouConf = over
    ? clampConfidence(48 + r3 * 47)
    : clampConfidence(45 + (1 - r3) * 42);

  // Market 4: Double Chance
  let dc: string;
  let dcConf: number;
  if (r4 < 0.4) {
    dc = "Home or Draw";
    dcConf = clampConfidence(55 + r4 * 40);
  } else if (r4 < 0.7) {
    dc = "Draw or Away";
    dcConf = clampConfidence(50 + (r4 - 0.4) * 40);
  } else {
    dc = "Home or Away";
    dcConf = clampConfidence(55 + (r4 - 0.7) * 40);
  }

  // Market 5: BTTS & Over 2.5
  const bttsOu = btts && over;
  const bttsOuConf = bttsOu
    ? clampConfidence(40 + r5 * 40)
    : clampConfidence(42 + (1 - r5) * 38);

  return [
    { market: "Match Result", selection: matchResult, confidence: matchResultConf },
    { market: "Both Teams to Score", selection: btts ? "Yes" : "No", confidence: bttsConf },
    { market: "Over/Under 2.5", selection: over ? "Over" : "Under", confidence: ouConf },
    { market: "Double Chance", selection: dc, confidence: dcConf },
    { market: "BTTS & Over 2.5", selection: bttsOu ? "Yes" : "No", confidence: bttsOuConf },
  ];
}

/**
 * Map a user's outcome pick ("home"/"draw"/"away") to the Match Result market prediction.
 */
export function mapOutcomeToMarket(outcome: string): string {
  if (outcome === "home") return "Home Win";
  if (outcome === "away") return "Away Win";
  return "Draw";
}

/**
 * Compute overall accuracy percentage from stored metrics.
 */
export function computeAccuracy(total: number, correct: number): number {
  if (total === 0) return 0;
  return Math.round((correct / total) * 100);
}
