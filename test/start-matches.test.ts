import { describe, it, expect, beforeEach } from "vitest";
import { buildBot } from "../src/bot.js";
import { runSpec, parseBotSpec } from "../src/toolkit/index.js";
import { _resetStorage, getStorage, type Storage } from "../src/storage.js";

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

describe("/start with today's matches", () => {
  let storage: Storage;
  const chatId = 1;

  beforeEach(async () => {
    _resetStorage();
    storage = getStorage();
  });

  function makeTime(hoursFromNow: number): string {
    const dt = new Date();
    dt.setHours(dt.getHours() + hoursFromNow, 0, 0, 0);
    return dt.toISOString();
  }

  it("/start shows today's matches grouped by league header", async () => {
    const t1 = makeTime(3);
    await storage.addLeague({ id: "l1", name: "Premier League", country: "England", tier: 1, chat_id: chatId });
    await storage.addMatch({
      id: "m1", home_team: "Arsenal", away_team: "Chelsea",
      match_datetime: t1, competition_name: "Premier League", chat_id: chatId, league_id: "l1",
    });

    const bot = await buildBot("test-token");
    const spec = parseBotSpec({
      name: "/start shows today's league header",
      steps: [{
        send: { text: "/start", chatId },
        expect: [{
          method: "sendMessage",
          payload: { text: `⚽ Premier League (England)\n  ${fmtTime(t1)} — Arsenal vs Chelsea` },
        }],
      }],
    });
    const result = await runSpec(bot, spec);
    expect(result.ok).toBe(true);
  });

  it("/start shows no matches today when schedule is empty", async () => {
    const bot = await buildBot("test-token");
    const spec = parseBotSpec({
      name: "/start shows no matches today",
      steps: [{
        send: { text: "/start", chatId },
        expect: [{ method: "sendMessage", payload: { text: "📅 No matches today!" } }],
      }],
    });
    const result = await runSpec(bot, spec);
    expect(result.ok).toBe(true);
  });

  it("/start in group chat shows today's matches", async () => {
    const groupId = -1001234567890;
    const t1 = makeTime(2);
    await storage.addLeague({ id: "l1", name: "Premier League", country: "England", tier: 1, chat_id: groupId });
    await storage.addMatch({
      id: "m1", home_team: "Liverpool", away_team: "Man City",
      match_datetime: t1, competition_name: "Premier League", chat_id: groupId, league_id: "l1",
    });

    const bot = await buildBot("test-token");
    const spec = parseBotSpec({
      name: "/start in group chat shows matches",
      steps: [{
        send: { text: "/start", chatId: groupId },
        expect: [{
          method: "sendMessage",
          payload: { text: `⚽ Premier League (England)\n  ${fmtTime(t1)} — Liverpool vs Man City` },
        }],
      }],
    });
    const result = await runSpec(bot, spec);
    expect(result.ok).toBe(true);
  });

  it("today:show callback returns today's matches", async () => {
    const t1 = makeTime(5);
    await storage.addLeague({ id: "l1", name: "La Liga", country: "Spain", tier: 1, chat_id: chatId });
    await storage.addMatch({
      id: "m1", home_team: "Barcelona", away_team: "Real Madrid",
      match_datetime: t1, competition_name: "La Liga", chat_id: chatId, league_id: "l1",
    });

    const bot = await buildBot("test-token");
    const spec = parseBotSpec({
      name: "today:show shows today's matches grouped by league",
      steps: [{
        send: { callback: "today:show", chatId },
        expect: [{
          method: "editMessageText",
          payload: { text: `⚽ La Liga (Spain)\n  ${fmtTime(t1)} — Barcelona vs Real Madrid` },
        }],
      }],
    });
    const result = await runSpec(bot, spec);
    expect(result.ok).toBe(true);
  });

  it("/start with multiple leagues sorts by earliest kickoff", async () => {
    const tA = makeTime(5);
    const tB = makeTime(1);
    await storage.addLeague({ id: "lA", name: "La Liga", country: "Spain", tier: 1, chat_id: chatId });
    await storage.addMatch({
      id: "mA", home_team: "Barcelona", away_team: "Real Madrid",
      match_datetime: tA, competition_name: "La Liga", chat_id: chatId, league_id: "lA",
    });
    await storage.addLeague({ id: "lB", name: "Bundesliga", country: "Germany", tier: 1, chat_id: chatId });
    await storage.addMatch({
      id: "mB", home_team: "Bayern", away_team: "Dortmund",
      match_datetime: tB, competition_name: "Bundesliga", chat_id: chatId, league_id: "lB",
    });

    const bot = await buildBot("test-token");
    const spec = parseBotSpec({
      name: "/start sorts leagues by earliest kickoff",
      steps: [{
        send: { text: "/start", chatId },
        expect: [{
          method: "sendMessage",
          payload: {
            text: `⚽ Bundesliga (Germany)\n  ${fmtTime(tB)} — Bayern vs Dortmund\n\n⚽ La Liga (Spain)\n  ${fmtTime(tA)} — Barcelona vs Real Madrid`,
          },
        }],
      }],
    });
    const result = await runSpec(bot, spec);
    expect(result.ok).toBe(true);
  });
});
