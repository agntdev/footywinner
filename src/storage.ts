import type { StorageAdapter } from "grammy";
import { resolveSessionStorage } from "./toolkit/index.js";

// ─── Domain data types ───────────────────────────────────────────────────────

export interface Match {
  id: string;
  home_team: string;
  away_team: string;
  match_datetime: string; // ISO 8601
  competition_name: string;
  chat_id: number;
}

export interface Prediction {
  user_id: number;
  match_id: string;
  outcome: "home" | "draw" | "away";
  timestamp: string; // ISO 8601
  chat_id: number;
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

  // ── Matches ──────────────────────────────────────────────────────────────

  async addMatch(match: Match): Promise<void> {
    await this.set(`match:${match.chat_id}:${match.id}`, match);
    const ids = await this.getMatchIds(match.chat_id);
    if (!ids.includes(match.id)) {
      ids.push(match.id);
      await this.set(`match_ids:${match.chat_id}`, ids);
    }
  }

  async getMatch(chatId: number, matchId: string): Promise<Match | undefined> {
    return this.get<Match>(`match:${chatId}:${matchId}`);
  }

  async getMatchIds(chatId: number): Promise<string[]> {
    return (await this.get<string[]>(`match_ids:${chatId}`)) ?? [];
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

  async getAllMatches(chatId: number): Promise<Match[]> {
    const ids = await this.getMatchIds(chatId);
    const matches: Match[] = [];
    for (const id of ids) {
      const m = await this.getMatch(chatId, id);
      if (m) matches.push(m);
    }
    return matches;
  }

  // ── Predictions ──────────────────────────────────────────────────────────

  async setPrediction(pred: Prediction): Promise<void> {
    await this.set(`prediction:${pred.chat_id}:${pred.user_id}:${pred.match_id}`, pred);
    // user index
    const userIdx = await this.getUserPredictionIds(pred.chat_id, pred.user_id);
    if (!userIdx.includes(pred.match_id)) {
      userIdx.push(pred.match_id);
      await this.set(`user_preds:${pred.chat_id}:${pred.user_id}`, userIdx);
    }
    // match index
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
