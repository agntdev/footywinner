import { Composer } from "grammy";
import type { BotContext } from "../toolkit/index.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { type Ctx } from "../bot.js";

const composer = new Composer<BotContext>();

function formatDate(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${day} ${time}`;
}

// ── Predict flow: show leagues first ─────────────────────────────────────

composer.callbackQuery("predict:start", async (ctx) => {
  await ctx.answerCallbackQuery();
  const storage = (ctx as unknown as Ctx).storage;
  const chatId = ctx.chat?.id ?? 0;
  const leagues = await storage.getAllLeagues(chatId);

  if (leagues.length === 0) {
    const matches = await storage.getUpcomingMatches(chatId);
    if (matches.length === 0) {
      await ctx.editMessageText("No matches to predict yet — check back soon!", {
        reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
      });
      return;
    }
    // No leagues defined — show matches directly
    const lines = matches.map(
      (m, i) => `${i + 1}. ${m.home_team} vs ${m.away_team} — ${formatDate(m.match_datetime)}`,
    );
    const text = `🔮 Pick a match to predict:\n\n${lines.join("\n")}`;
    const buttons = matches.map((m) => [
      inlineButton(`${m.home_team} vs ${m.away_team}`, `predict:match:${m.id}`),
    ]);
    buttons.push([inlineButton("⬅️ Back to menu", "menu:main")]);
    await ctx.editMessageText(text, { reply_markup: inlineKeyboard(buttons) });
    return;
  }

  // Show leagues to pick from
  const lines = leagues.map(
    (l, i) => `${i + 1}. ${l.name} (${l.country})`,
  );
  const text = `🔮 Pick a league to see upcoming matches:\n\n${lines.join("\n")}`;
  const buttons = leagues.map((l) => [
    inlineButton(`${l.name}`, `predict:league:${l.id}`),
  ]);
  buttons.push([inlineButton("⬅️ Back to menu", "menu:main")]);
  await ctx.editMessageText(text, { reply_markup: inlineKeyboard(buttons) });
});

// ── Predict: league selected → show matches ──────────────────────────────

composer.callbackQuery(/^predict:league:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const leagueId = ctx.match![1];
  const storage = (ctx as unknown as Ctx).storage;
  const chatId = ctx.chat?.id ?? 0;
  const league = await storage.getLeague(chatId, leagueId);

  if (!league) {
    await ctx.editMessageText("Couldn't find that league.", {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
    });
    return;
  }

  const matches = await storage.getUpcomingMatchesByLeague(chatId, leagueId);

  if (matches.length === 0) {
    await ctx.editMessageText(`No upcoming matches in ${league.name} — check back soon!`, {
      reply_markup: inlineKeyboard([
        [inlineButton("⬅️ Pick another league", "predict:start")],
        [inlineButton("🏠 Menu", "menu:main")],
      ]),
    });
    return;
  }

  const lines = matches.map(
    (m, i) => `${i + 1}. ${m.home_team} vs ${m.away_team} — ${formatDate(m.match_datetime)}`,
  );
  const text = `🔮 ${league.name} — pick a match:\n\n${lines.join("\n")}`;
  const buttons = matches.map((m) => [
    inlineButton(`${m.home_team} vs ${m.away_team}`, `predict:match:${m.id}`),
  ]);
  buttons.push([inlineButton("⬅️ Leagues", "predict:start")]);
  buttons.push([inlineButton("🏠 Menu", "menu:main")]);
  await ctx.editMessageText(text, { reply_markup: inlineKeyboard(buttons) });
});

// ── /predict command (no args → show leagues or matches) ─────────────────

composer.command("predict", async (ctx) => {
  const storage = (ctx as unknown as Ctx).storage;
  const chatId = ctx.chat?.id ?? 0;
  const leagues = await storage.getAllLeagues(chatId);

  if (leagues.length === 0) {
    const matches = await storage.getUpcomingMatches(chatId);
    if (matches.length === 0) {
      await ctx.reply("No matches to predict yet — check back soon!", {
        reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
      });
      return;
    }
    const lines = matches.map(
      (m, i) => `${i + 1}. ${m.home_team} vs ${m.away_team} — ${formatDate(m.match_datetime)}`,
    );
    const text = `🔮 Pick a match to predict:\n\n${lines.join("\n")}`;
    const buttons = matches.map((m) => [
      inlineButton(`${m.home_team} vs ${m.away_team}`, `predict:match:${m.id}`),
    ]);
    buttons.push([inlineButton("⬅️ Back to menu", "menu:main")]);
    await ctx.reply(text, { reply_markup: inlineKeyboard(buttons) });
    return;
  }

  const lines = leagues.map(
    (l, i) => `${i + 1}. ${l.name} (${l.country})`,
  );
  const text = `🔮 Pick a league to see upcoming matches:\n\n${lines.join("\n")}`;
  const buttons = leagues.map((l) => [
    inlineButton(`${l.name}`, `predict:league:${l.id}`),
  ]);
  buttons.push([inlineButton("⬅️ Back to menu", "menu:main")]);
  await ctx.reply(text, { reply_markup: inlineKeyboard(buttons) });
});

export default composer;
