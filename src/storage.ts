import type { StorageAdapter } from "grammy";
import { resolveSessionStorage } from "./toolkit/index.js";

// ─── Domain data types ───────────────────────────────────────────────────────

export interface League {
  id: string;
  name: string;
  country: string;
  tier: number;
  chat_id: number;
}

export interface Match {
  id: string;
  home_team: string;
  away_team: string;
  match_datetime: string; // ISO 8601
  competition_name: string;
  chat_id: number;
  league_id?: string;
}

export interface PredictionMarket {
  market: string;
  selection: string;
  confidence: number; // 0-100
}

export interface Prediction {
  user_id: number;
  match_id: string;
  outcome: "home" | "draw" | "away";
  timestamp: string; // ISO 8601
  chat_id: number;
  markets?: PredictionMarket[];
}

export interface Result {
  match_id: string;
  final_outcome: "home" | "draw" | "away";
  final_score: string;
  result_timestamp: string;
}

export interface LeaderboardEntry {
  user_id: number;
  points: number;
  correct_predictions: number;
  chat_id: number;
}

export interface UserRecord {
  telegram_id: number;
  display_name: string;
  handle?: string;
}

export interface AccuracyMetrics {
  chat_id: number;
  league_id?: string;
  total_predictions: number;
  correct_predictions: number;
  accuracy_pct: number;
  last_updated: string;
  market_accuracy: Record<string, { total: number; correct: number }>;
}

export interface AdminSettings {
  chat_id: number;
  tuning_enabled: boolean;
  target_accuracy_pct: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

// ─── Storage class ───────────────────────────────────────────────────────────

/**
 * Domain storage backed by the toolkit's persistent StorageAdapter.
 * In production (REDIS_URL set): Redis-backed.
 * In dev/tests: in-memory.
 *
 * Every collection uses explicit INDEX records — no keyspace scans.
 */
export class Storage {
  constructor(private readonly db: StorageAdapter<AnyRecord>) {}

  private async get<T>(key: string): Promise<T | undefined> {
    return (await this.db.read(key)) as T | undefined;
  }

  private async set(key: string, value: unknown): Promise<void> {
    await this.db.write(key, value as AnyRecord);
  }

  // ── Leagues ─────────────────────────────────────────────────────────────

  async addLeague(league: League): Promise<void> {
    await this.set(`league:${league.chat_id}:${league.id}`, league);
    const ids = await this.getLeagueIds(league.chat_id);
    if (!ids.includes(league.id)) {
      ids.push(league.id);
      await this.set(`league_ids:${league.chat_id}`, ids);
    }
  }

  async getLeague(chatId: number, leagueId: string): Promise<League | undefined> {
    return this.get<League>(`league:${chatId}:${leagueId}`);
  }

  async getLeagueIds(chatId: number): Promise<string[]> {
    return (await this.get<string[]>(`league_ids:${chatId}`)) ?? [];
  }

  async getAllLeagues(chatId: number): Promise<League[]> {
    const ids = await this.getLeagueIds(chatId);
    const leagues: League[] = [];
    for (const id of ids) {
      const l = await this.getLeague(chatId, id);
      if (l) leagues.push(l);
    }
    return leagues;
  }

  async getLeaguesByCountry(chatId: number, country: string): Promise<League[]> {
    const all = await this.getAllLeagues(chatId);
    return all.filter((l) => l.country.toLowerCase() === country.toLowerCase());
  }

  async getLeaguesByTier(chatId: number, tier: number): Promise<League[]> {
    const all = await this.getAllLeagues(chatId);
    return all.filter((l) => l.tier === tier);
  }

  async searchLeagues(chatId: number, query: string): Promise<League[]> {
    const all = await this.getAllLeagues(chatId);
    const q = query.toLowerCase();
    return all.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.country.toLowerCase().includes(q),
    );
  }

  async getCountries(chatId: number): Promise<string[]> {
    const all = await this.getAllLeagues(chatId);
    const countries = [...new Set(all.map((l) => l.country))];
    return countries.sort();
  }

  async getTiers(chatId: number): Promise<number[]> {
    const all = await this.getAllLeagues(chatId);
    const tiers = [...new Set(all.map((l) => l.tier))];
    return tiers.sort((a, b) => a - b);
  }

  // ── Matches ──────────────────────────────────────────────────────────────

  async addMatch(match: Match): Promise<void> {
    await this.set(`match:${match.chat_id}:${match.id}`, match);
    const ids = await this.getMatchIds(match.chat_id);
    if (!ids.includes(match.id)) {
      ids.push(match.id);
      await this.set(`match_ids:${match.chat_id}`, ids);
    }
    if (match.league_id) {
      const lIds = await this.getLeagueMatchIds(match.chat_id, match.league_id);
      if (!lIds.includes(match.id)) {
        lIds.push(match.id);
        await this.set(`league_match_ids:${match.chat_id}:${match.league_id}`, lIds);
      }
    }
  }

  async getMatch(chatId: number, matchId: string): Promise<Match | undefined> {
    return this.get<Match>(`match:${chatId}:${matchId}`);
  }

  async getMatchIds(chatId: number): Promise<string[]> {
    return (await this.get<string[]>(`match_ids:${chatId}`)) ?? [];
  }

  async getLeagueMatchIds(chatId: number, leagueId: string): Promise<string[]> {
    return (await this.get<string[]>(`league_match_ids:${chatId}:${leagueId}`)) ?? [];
  }

  async getUpcomingMatches(chatId: number, now: () => Date = () => new Date()): Promise<Match[]> {
    const ids = await this.getMatchIds(chatId);
    const nowTs = now().getTime();
    const matches: Match[] = [];
    for (const id of ids) {
      const m = await this.getMatch(chatId, id);
      if (m && new Date(m.match_datetime).getTime() > nowTs) matches.push(m);
    }
    return matches.sort(
      (a, b) => new Date(a.match_datetime).getTime() - new Date(b.match_datetime).getTime(),
    );
  }

  async getUpcomingMatchesByLeague(
    chatId: number,
    leagueId: string,
    now: () => Date = () => new Date(),
  ): Promise<Match[]> {
    const ids = await this.getLeagueMatchIds(chatId, leagueId);
    const nowTs = now().getTime();
    const matches: Match[] = [];
    for (const id of ids) {
      const m = await this.getMatch(chatId, id);
      if (m && new Date(m.match_datetime).getTime() > nowTs) matches.push(m);
    }
    return matches.sort(
      (a, b) => new Date(a.match_datetime).getTime() - new Date(b.match_datetime).getTime(),
    );
  }

  async getAllMatches(chatId: number): Promise<Match[]> {
    const ids = await this.getMatchIds(chatId);
    const matches: Match[] = [];
    for (const id of ids) {
      const m = await this.getMatch(chatId, id);
      if (m) matches.push(m);
    }
    return matches;
  }

  async getTodayMatches(chatId: number, now: () => Date = () => new Date()): Promise<Match[]> {
    const today = now();
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);
    const startTs = startOfDay.getTime();
    const endTs = endOfDay.getTime();
    const ids = await this.getMatchIds(chatId);
    const matches: Match[] = [];
    for (const id of ids) {
      const m = await this.getMatch(chatId, id);
      if (m) {
        const mt = new Date(m.match_datetime).getTime();
        if (mt >= startTs && mt <= endTs) matches.push(m);
      }
    }
    return matches.sort(
      (a, b) => new Date(a.match_datetime).getTime() - new Date(b.match_datetime).getTime(),
    );
  }

  async getLeaguesWithTodayMatches(chatId: number, now: () => Date = () => new Date()): Promise<{ league: League; matchCount: number }[]> {
    const todayMatches = await this.getTodayMatches(chatId, now);
    const leagueMap = new Map<string, { league: League; matchCount: number }>();
    for (const m of todayMatches) {
      if (m.league_id) {
        const existing = leagueMap.get(m.league_id);
        if (existing) {
          existing.matchCount++;
        } else {
          const league = await this.getLeague(chatId, m.league_id);
          if (league) {
            leagueMap.set(m.league_id, { league, matchCount: 1 });
          }
        }
      }
    }
    return [...leagueMap.values()];
  }

  async getTodayMatchesByLeague(chatId: number, leagueId: string, now: () => Date = () => new Date()): Promise<Match[]> {
    const todayMatches = await this.getTodayMatches(chatId, now);
    return todayMatches.filter((m) => m.league_id === leagueId);
  }

  async getNextMatchDate(chatId: number, now: () => Date = () => new Date()): Promise<string | undefined> {
    const nowTs = now().getTime();
    const ids = await this.getMatchIds(chatId);
    let earliest: string | undefined;
    let earliestTs = Infinity;
    for (const id of ids) {
      const m = await this.getMatch(chatId, id);
      if (m) {
        const mt = new Date(m.match_datetime).getTime();
        if (mt > nowTs && mt < earliestTs) {
          earliestTs = mt;
          earliest = m.match_datetime;
        }
      }
    }
    return earliest;
  }

  // ── Predictions ──────────────────────────────────────────────────────────

  async setPrediction(pred: Prediction): Promise<void> {
    await this.set(`prediction:${pred.chat_id}:${pred.user_id}:${pred.match_id}`, pred);
    const userIdx = await this.getUserPredictionIds(pred.chat_id, pred.user_id);
    if (!userIdx.includes(pred.match_id)) {
      userIdx.push(pred.match_id);
      await this.set(`user_preds:${pred.chat_id}:${pred.user_id}`, userIdx);
    }
    const matchIdx = await this.getMatchPredictionIds(pred.chat_id, pred.match_id);
    if (!matchIdx.includes(pred.user_id)) {
      matchIdx.push(pred.user_id);
      await this.set(`match_preds:${pred.chat_id}:${pred.match_id}`, matchIdx);
    }
  }

  async getPrediction(chatId: number, userId: number, matchId: string): Promise<Prediction | undefined> {
    return this.get<Prediction>(`prediction:${chatId}:${userId}:${matchId}`);
  }

  async getUserPredictionIds(chatId: number, userId: number): Promise<string[]> {
    return (await this.get<string[]>(`user_preds:${chatId}:${userId}`)) ?? [];
  }

  async getUserPredictions(chatId: number, userId: number): Promise<Prediction[]> {
    const ids = await this.getUserPredictionIds(chatId, userId);
    const preds: Prediction[] = [];
    for (const id of ids) {
      const p = await this.getPrediction(chatId, userId, id);
      if (p) preds.push(p);
    }
    return preds;
  }

  async getMatchPredictionIds(chatId: number, matchId: string): Promise<number[]> {
    return (await this.get<number[]>(`match_preds:${chatId}:${matchId}`)) ?? [];
  }

  // ── Results ──────────────────────────────────────────────────────────────

  async setResult(result: Result): Promise<void> {
    await this.set(`result:${result.match_id}`, result);
  }

  async getResult(matchId: string): Promise<Result | undefined> {
    return this.get<Result>(`result:${matchId}`);
  }

  // ── Leaderboard ──────────────────────────────────────────────────────────

  async updateLeaderboard(
    chatId: number,
    userId: number,
    pointsDelta: number,
    correctDelta: number,
  ): Promise<void> {
    const existing = await this.getLeaderboardEntry(chatId, userId);
    const entry: LeaderboardEntry = {
      user_id: userId,
      points: (existing?.points ?? 0) + pointsDelta,
      correct_predictions: (existing?.correct_predictions ?? 0) + correctDelta,
      chat_id: chatId,
    };
    await this.set(`leaderboard:${chatId}:${userId}`, entry);
    const idx = await this.getLeaderboardUserIds(chatId);
    if (!idx.includes(userId)) {
      idx.push(userId);
      await this.set(`lb_users:${chatId}`, idx);
    }
  }

  async getLeaderboardEntry(chatId: number, userId: number): Promise<LeaderboardEntry | undefined> {
    return this.get<LeaderboardEntry>(`leaderboard:${chatId}:${userId}`);
  }

  async getLeaderboardUserIds(chatId: number): Promise<number[]> {
    return (await this.get<number[]>(`lb_users:${chatId}`)) ?? [];
  }

  async getLeaderboard(chatId: number, limit = 10): Promise<LeaderboardEntry[]> {
    const ids = await this.getLeaderboardUserIds(chatId);
    const entries: LeaderboardEntry[] = [];
    for (const id of ids) {
      const e = await this.getLeaderboardEntry(chatId, id);
      if (e) entries.push(e);
    }
    return entries
      .sort((a, b) => b.points - a.points || b.correct_predictions - a.correct_predictions)
      .slice(0, limit);
  }

  // ── Users ────────────────────────────────────────────────────────────────

  async setUser(user: UserRecord): Promise<void> {
    await this.set(`user:${user.telegram_id}`, user);
  }

  async getUser(telegramId: number): Promise<UserRecord | undefined> {
    return this.get<UserRecord>(`user:${telegramId}`);
  }

  // ── Admin config ─────────────────────────────────────────────────────────

  async setAdminIds(chatId: number, ids: number[]): Promise<void> {
    await this.set(`admins:${chatId}`, ids);
  }

  async getAdminIds(chatId: number): Promise<number[]> {
    return (await this.get<number[]>(`admins:${chatId}`)) ?? [];
  }

  // ── Admin settings (tuning) ──────────────────────────────────────────────

  async getAdminSettings(chatId: number): Promise<AdminSettings> {
    const s = await this.get<AdminSettings>(`admin_settings:${chatId}`);
    return s ?? { chat_id: chatId, tuning_enabled: false, target_accuracy_pct: 95 };
  }

  async setAdminSettings(settings: AdminSettings): Promise<void> {
    await this.set(`admin_settings:${settings.chat_id}`, settings);
  }

  // ── Accuracy metrics ─────────────────────────────────────────────────────

  async getAccuracyMetrics(chatId: number, leagueId?: string): Promise<AccuracyMetrics> {
    const key = leagueId
      ? `accuracy:${chatId}:${leagueId}`
      : `accuracy:${chatId}:overall`;
    const m = await this.get<AccuracyMetrics>(key);
    return m ?? {
      chat_id: chatId,
      league_id: leagueId,
      total_predictions: 0,
      correct_predictions: 0,
      accuracy_pct: 0,
      last_updated: new Date().toISOString(),
      market_accuracy: {},
    };
  }

  async setAccuracyMetrics(metrics: AccuracyMetrics): Promise<void> {
    const key = metrics.league_id
      ? `accuracy:${metrics.chat_id}:${metrics.league_id}`
      : `accuracy:${metrics.chat_id}:overall`;
    await this.set(key, metrics);
  }

  async getAccuracyMetricIds(chatId: number): Promise<string[]> {
    return (await this.get<string[]>(`accuracy_idx:${chatId}`)) ?? [];
  }

  async recordPredictionOutcome(
    chatId: number,
    userId: number,
    matchId: string,
    predicted: string,
    actual: string,
    marketKey?: string,
  ): Promise<void> {
    const isCorrect = predicted === actual;
    const points = isCorrect ? 3 : 0;
    const correctDelta = isCorrect ? 1 : 0;
    await this.updateLeaderboard(chatId, userId, points, correctDelta);

    // Update overall accuracy
    const overall = await this.getAccuracyMetrics(chatId);
    overall.total_predictions += 1;
    if (isCorrect) overall.correct_predictions += 1;
    overall.accuracy_pct = overall.total_predictions > 0
      ? Math.round((overall.correct_predictions / overall.total_predictions) * 100)
      : 0;
    overall.last_updated = new Date().toISOString();
    await this.setAccuracyMetrics(overall);

    // Update league-level accuracy if available
    const match = await this.getMatch(chatId, matchId);
    if (match?.league_id) {
      const leagueMetrics = await this.getAccuracyMetrics(chatId, match.league_id);
      leagueMetrics.total_predictions += 1;
      if (isCorrect) leagueMetrics.correct_predictions += 1;
      leagueMetrics.accuracy_pct = leagueMetrics.total_predictions > 0
        ? Math.round((leagueMetrics.correct_predictions / leagueMetrics.total_predictions) * 100)
        : 0;
      leagueMetrics.last_updated = new Date().toISOString();
      await this.setAccuracyMetrics(leagueMetrics);

      const idx = await this.getAccuracyMetricIds(chatId);
      if (!idx.includes(match.league_id)) {
        idx.push(match.league_id);
        await this.set(`accuracy_idx:${chatId}`, idx);
      }
    }

    // Update per-market accuracy
    if (marketKey) {
      const metrics = await this.getAccuracyMetrics(chatId);
      if (!metrics.market_accuracy[marketKey]) {
        metrics.market_accuracy[marketKey] = { total: 0, correct: 0 };
      }
      metrics.market_accuracy[marketKey].total += 1;
      if (isCorrect) metrics.market_accuracy[marketKey].correct += 1;
      await this.setAccuracyMetrics(metrics);
    }
  }
}

// ─── Singleton factory ───────────────────────────────────────────────────────

let _instance: Storage | null = null;

export function getStorage(): Storage {
  if (!_instance) {
    _instance = new Storage(resolveSessionStorage<AnyRecord>(undefined));
  }
  return _instance;
}

/** Reset the singleton (test-only). */
export function _resetStorage(): void {
  _instance = null;
}
