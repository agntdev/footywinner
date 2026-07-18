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

composer.callbackQuery("predict:start", async (ctx) => {
  await ctx.answerCallbackQuery();
  const storage = (ctx as unknown as Ctx).storage;
  const chatId = ctx.chat?.id ?? 0;
  const matches = await storage.getUpcomingMatches(chatId);

  if (matches.length === 0) {
    await ctx.editMessageText("No matches to predict yet — check back soon!", {
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

  await ctx.editMessageText(text, { reply_markup: inlineKeyboard(buttons) });
});

composer.command("predict", async (ctx) => {
  const storage = (ctx as unknown as Ctx).storage;
  const chatId = ctx.chat?.id ?? 0;
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
});

export default composer;
